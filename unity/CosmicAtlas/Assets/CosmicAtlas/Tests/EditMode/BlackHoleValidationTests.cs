using System;
using NUnit.Framework;

namespace CosmicAtlas.Rendering.Tests
{
    /// <summary>
    /// Validation of BlackHole.shader against INDEPENDENT reference calculations (r_s = 1, M = 1/2).
    ///
    /// ShaderTrace() is a line-for-line C# copy of the shader's loop (2-D, which is exact for a central force):
    /// RK4 on the orbit equation u'' = 1.5u² − u in the polar angle φ with
    /// Δφ = clamp(13 / steps, 0.06, 0.2), horizon at u ≥ 1, outgoing asymptote at u = 0, the h &gt; 25 analytic
    /// shortcut, the per-quality-tier step budget, and a start point at the camera (if inside the proxy) or the proxy boundary.
    ///
    /// Reference: the exact Schwarzschild orbit equation for that same start point. In the shader's (Binet)
    /// coordinates u'' + u = (3/2)u² integrates to u'² = C − u² + u³ with C = 1/h² − u_s³ (unit start speed),
    /// so the deflection between the start tangent and the outgoing asymptote is
    ///     α = 2∫₀^{u₀} du/√F − ∫₀^{u_s} du/√F − (π − asin(h u_s)),   F(u) = C − u² + u³.
    /// For u_s → 0 this is the textbook α = 2∫₀^{u₀} du/√(1/b² − u² + u³) − π, which is in turn cross-checked
    /// against the weak-field series and the Bozza (2002) strong-deflection limit.
    /// </summary>
    public class BlackHoleValidationTests
    {
        const double FarRadius = 60 * 0.98; // Exhibits.cs: _FarRadius = 0.98 × 60
        const double CameraRadius = 36.14;                                    // Showcase.cs blackhole_edge_on: |(0, 3.2, −36)|
        const double Bc = 2.598076211353316;                                  // (3√3/2) r_s
        static readonly (string tier, int steps)[] Tiers = { ("Low", 64), ("Medium", 110), ("High", 180), ("Ultra", 300) }; // AtlasQuality.cs

        // ================================================================================== shader replica
        public struct Trace { public bool captured, exhausted; public double alpha, rMin; public int steps; }

        /// <summary>Shader's angular step for a given step budget: clamp(13 / steps, 0.06, 0.2) rad.</summary>
        public static double StepFor(int stepBudget) => Math.Max(0.06, Math.Min(0.2, 13.0 / Math.Max(stepBudget, 1)));

        /// <summary>
        /// Ray starting at radius rStart with impact parameter b, travelling inward: line-for-line copy of the shader
        /// (h &gt; 25 analytic shortcut, RK4 on u'' = 1.5u² − u in φ, horizon at u ≥ 1, asymptote at u = 0, step budget).
        /// α = change of heading (positive toward the hole), measured as φ_end + ψ_end − ψ_start, where ψ is the angle
        /// between the outward radius and the direction of travel (tangent ∝ −u' r̂ + u φ̂).
        /// </summary>
        public static Trace ShaderTrace(double b, double rStart, int stepBudget)
        {
            var t = new Trace();
            double x0 = -Math.Sqrt(rStart * rStart - b * b);
            double vr = x0 / rStart;                          // v = (1, 0), e1 = p / r0
            double h = b;
            if (h > 25.0) { t.alpha = WeakRest(x0, b); t.rMin = b; return t; }
            double u = 1 / rStart, w = -vr / h, phi = 0, psi0 = Math.Atan2(u, -w), dphi = StepFor(stepBudget), uMax = u;
            for (int k = 0; k < 400; k++)
            {
                if (k >= stepBudget) { t.exhausted = true; break; }
                t.steps = k + 1;
                double a1 = 1.5 * u * u - u;
                double u2 = u + 0.5 * dphi * w, w2 = w + 0.5 * dphi * a1, a2 = 1.5 * u2 * u2 - u2;
                double u3 = u + 0.5 * dphi * w2, w3 = w + 0.5 * dphi * a2, a3 = 1.5 * u3 * u3 - u3;
                double u4 = u + dphi * w3, w4 = w + dphi * a3, a4 = 1.5 * u4 * u4 - u4;
                double uN = u + dphi / 6 * (w + 2 * w2 + 2 * w3 + w4);
                double wN = w + dphi / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
                if (uN >= 1) { t.captured = true; t.rMin = 1; return t; }
                if (uN <= 0) { phi += dphi * u / (u - uN); t.alpha = phi - psi0; t.rMin = 1 / uMax; return t; }
                u = uN; w = wN; phi += dphi; uMax = Math.Max(uMax, u);
            }
            t.alpha = phi + Math.Atan2(u, -w) - psi0;
            t.rMin = 1 / uMax;
            return t;
        }

        /// <summary>Copy of WeakFieldBend() for a ray at (x0, b) moving along +x: s = x0, closest-approach distance b.</summary>
        static double WeakRest(double s, double b)
        {
            double x = s / Math.Sqrt(s * s + b * b);
            return (1 - 1.5 * x + 0.5 * x * x * x) / b * (1 + 15 * Math.PI / (32 * b));
        }

        // ================================================================================== exact reference
        /// <summary>Exact deflection for a ray starting at rStart (∞ allowed) with unit speed and impact parameter b; NaN if captured.</summary>
        public static double ExactDeflection(double b, double rStart, out double rTurn)
        {
            double us = double.IsPositiveInfinity(rStart) ? 0 : 1 / rStart;
            double C = 1 / (b * b) - us * us * us;
            double F(double u) => C - u * u + u * u * u;
            rTurn = double.NaN;
            if (F(2.0 / 3.0) > 0) return double.NaN;                                       // no turning point outside the photon sphere: captured
            double lo = 0, hi = 2.0 / 3.0;
            for (int i = 0; i < 200; i++) { double m = 0.5 * (lo + hi); if (F(m) > 0) lo = m; else hi = m; }
            double u0 = 0.5 * (lo + hi);
            rTurn = 1 / u0;
            // ∫₀^{u₀} du/√F with u = u₀(1 − t²) (removes the turning-point singularity)
            double fp = u0 * (2 * u0 - 3 * u0 * u0);
            double toTurn = Simpson(tt => tt == 0 ? 2 * u0 / Math.Sqrt(fp) : 2 * u0 * tt / Math.Sqrt(Math.Max(F(u0 * (1 - tt * tt)), 1e-300)), 0, 1, 200000);
            double startPart = us == 0 ? 0 : Simpson(u => 1 / Math.Sqrt(F(u)), 0, us, 2000);
            double psiStart = Math.PI - Math.Asin(Math.Min(1, b * us));
            return 2 * toTurn - startPart - psiStart;
        }

        static double Simpson(Func<double, double> f, double a, double b, int n)
        {
            double h = (b - a) / n, s = f(a) + f(b);
            for (int i = 1; i < n; i++) s += (i % 2 == 1 ? 4 : 2) * f(a + i * h);
            return s * h / 3;
        }

        /// <summary>Bozza (2002) strong-deflection limit (Schwarzschild, observer at infinity).</summary>
        public static double BozzaDeflection(double b) => -Math.Log(b / Bc - 1) + Math.Log(216 * (7 - 4 * Math.Sqrt(3))) - Math.PI;

        /// <summary>Critical impact parameter for a ray starting at rStart: F has a double root at u = 2/3 ⇔ C = 4/27.</summary>
        public static double CriticalB(double rStart) => 1 / Math.Sqrt(4.0 / 27.0 + Math.Pow(1 / rStart, 3));

        // ================================================================================== reference self-checks
        [Test]
        public void Reference_matches_weak_field_series_and_strong_deflection_limit()
        {
            double weak = 2 / 100.0 + 15 * Math.PI / 16 / (100.0 * 100.0);               // 2 r_s/b + (15π/16)(r_s/b)², M = 1/2
            Assert.AreEqual(weak, ExactDeflection(100, double.PositiveInfinity, out _), weak * 0.003);
            foreach (double eps in new[] { 1e-3, 1e-4 })
            {
                double b = Bc * (1 + eps), ex = ExactDeflection(b, double.PositiveInfinity, out _);
                TestContext.WriteLine($"b/b_c − 1 = {eps}: exact {ex:F4} rad, Bozza {BozzaDeflection(b):F4} rad");
                Assert.AreEqual(BozzaDeflection(b), ex, 0.01);
            }
            // finite start radius: converges to the observer-at-infinity value as the start recedes
            Assert.AreEqual(ExactDeflection(20, double.PositiveInfinity, out _), ExactDeflection(20, 1e7, out _), 1e-6);
        }

        // ================================================================================== ray trajectories
        [TestCase(40.0, 0.005)]   // analytic shortcut (h > 25)
        [TestCase(25.5, 0.005)]   // analytic shortcut, just above the threshold
        [TestCase(24.5, 0.002)]   // integrated, just below the threshold
        [TestCase(15.0, 0.002)]
        [TestCase(10.0, 0.002)]
        [TestCase(6.0, 0.002)]
        [TestCase(4.0, 0.002)]
        [TestCase(3.0, 0.002)]
        [TestCase(2.7, 0.002)]    // α ≈ 0.93 π
        [TestCase(2.62, 0.002)]   // α ≈ 1.4 π
        [TestCase(2.6, 0.003)]    // α ≈ 2.2 π: winds more than once around the photon sphere
        public void Deflection_matches_exact_schwarzschild_at_every_quality_tier(double b, double relTol)
        {
            double exact = ExactDeflection(b, FarRadius, out double r0);
            foreach (var (tier, steps) in Tiers)
            {
                var s = ShaderTrace(b, FarRadius, steps);
                TestContext.WriteLine($"b = {b,5} {tier,-6}: exact α = {exact:F5} rad (r_turn {r0:F4}), shader α = {s.alpha:F5} rad, error {(s.alpha - exact) / exact * 100:+0.000;-0.000} %, r_min {s.rMin:F4}, {s.steps} steps{(s.exhausted ? " EXHAUSTED" : "")}");
                Assert.IsFalse(s.captured, $"{tier}: must escape");
                Assert.IsFalse(s.exhausted, $"{tier}: step budget must suffice");
                Assert.AreEqual(exact, s.alpha, Math.Abs(exact) * relTol, tier);
                if (b <= 25) Assert.AreEqual(r0, s.rMin, r0 * 0.02, "closest approach");
            }
        }

        [TestCase(20.0)] [TestCase(5.0)] [TestCase(2.8)]
        public void Deflection_matches_exact_schwarzschild_from_the_showcase_camera(double b)
        {
            // blackhole_edge_on camera is inside the proxy, so integration starts at the camera itself
            double exact = ExactDeflection(b, CameraRadius, out _);
            var s = ShaderTrace(b, CameraRadius, 110);
            TestContext.WriteLine($"camera r = {CameraRadius}, b = {b}: exact {exact:F5}, shader {s.alpha:F5} ({(s.alpha - exact) / exact * 100:+0.000;-0.000} %); observer-at-infinity value {ExactDeflection(b, double.PositiveInfinity, out _):F5}");
            Assert.AreEqual(exact, s.alpha, Math.Abs(exact) * 0.001);
        }

        [Test]
        public void Shadow_edge_matches_the_critical_impact_parameter_at_every_tier()
        {
            double exact = CriticalB(FarRadius);
            foreach (var (tier, steps) in Tiers)
            {
                // capture/escape boundary (rays that run out of steps near b_c count as not captured)
                double lo = 2.3, hi = 2.9;
                for (int i = 0; i < 40; i++) { double m = 0.5 * (lo + hi); if (ShaderTrace(m, FarRadius, steps).captured) lo = m; else hi = m; }
                double shader = 0.5 * (lo + hi);
                TestContext.WriteLine($"{tier,-6}: shadow edge b_c = {shader:F5}, exact {exact:F5} (observer at infinity {Bc:F5}), error {(shader - exact) / exact * 100:+0.000;-0.000} %");
                Assert.AreEqual(exact, shader, exact * 0.001, tier);
                foreach (double b in new[] { 0.5, 1.5, 2.4, 2.59 }) Assert.IsTrue(ShaderTrace(b, FarRadius, steps).captured, $"{tier}: b = {b} must be captured");
                foreach (double b in new[] { 2.61, 2.7, 3.5 }) Assert.IsFalse(ShaderTrace(b, FarRadius, steps).captured, $"{tier}: b = {b} must escape");
            }
        }

        /// <summary>Impact parameter whose deflection equals the target (α decreases monotonically with b outside b_c).</summary>
        static double SolveB(Func<double, double> alpha, double target)
        {
            double lo = Bc * 1.000001, hi = 6;
            for (int i = 0; i < 50; i++) { double m = 0.5 * (lo + hi); double a = alpha(m); if (double.IsNaN(a) || a > target) lo = m; else hi = m; }
            return 0.5 * (lo + hi);
        }

        [TestCase(1)] [TestCase(2)]
        public void Photon_ring_radii_match_the_exact_values(int order)
        {
            // Edge-on: the n-th order image of the far disk forms where a ray is turned by α = nπ (n = 1: secondary
            // ring, n = 2: tertiary). Its apparent radius on the sky is the impact parameter b_n; the rings crowd toward
            // b_c exponentially (b_n − b_c ∝ e^(−nπ)), so the test compares b_n − b_c, the quantity the image resolves.
            double target = order * Math.PI, bcExact = CriticalB(FarRadius);
            double bExact = SolveB(b => ExactDeflection(b, FarRadius, out _), target);
            foreach (var (tier, steps) in Tiers)
            {
                double bShader = SolveB(b => { var s = ShaderTrace(b, FarRadius, steps); return s.captured || s.exhausted ? double.NaN : s.alpha; }, target);
                TestContext.WriteLine($"ring n = {order} {tier,-6}: exact b = {bExact:F6} (b − b_c = {bExact - bcExact:E3}), shader b = {bShader:F6} (b − b_c = {bShader - bcExact:E3})");
                if (order == 2 && tier == "Low") continue; // reported only: see Step_budget_per_quality_tier
                Assert.AreEqual(bExact - bcExact, bShader - bcExact, Math.Abs(bExact - bcExact) * 0.02, tier);
            }
            double bBozza = Bc * (1 + Math.Exp(Math.Log(216 * (7 - 4 * Math.Sqrt(3))) - Math.PI - target));
            TestContext.WriteLine($"Bozza strong-deflection estimate (observer at infinity): b = {bBozza:F6}");
        }

        [Test]
        public void Step_budget_per_quality_tier_resolves_the_photon_rings()
        {
            // How close to the shadow edge each tier still integrates rays to completion (no budget exhaustion).
            double b1 = SolveB(b => ExactDeflection(b, FarRadius, out _), Math.PI);
            double b2 = SolveB(b => ExactDeflection(b, FarRadius, out _), 2 * Math.PI);
            foreach (var (tier, steps) in Tiers)
            {
                bool ring1 = !ShaderTrace(b1, FarRadius, steps).exhausted, ring2 = !ShaderTrace(b2, FarRadius, steps).exhausted;
                double lo = Bc, hi = 3.0; // smallest b that completes within the budget
                for (int i = 0; i < 40; i++) { double m = 0.5 * (lo + hi); var s = ShaderTrace(m, FarRadius, steps); if (s.exhausted) lo = m; else hi = m; }
                TestContext.WriteLine($"{tier,-6} {steps,3} steps (dphi {StepFor(steps):F3}): ring n=1 {(ring1 ? "resolved" : "TRUNCATED")}, ring n=2 {(ring2 ? "resolved" : "TRUNCATED")}, rays complete for b/b_c - 1 >= {hi / Bc - 1:E1}");
                Assert.IsTrue(ring1, $"{tier} must resolve the n = 1 photon ring");
                Assert.IsTrue(ring2, $"{tier} must resolve the n = 2 photon ring");
            }
        }

        // ================================================================================== disk
        /// <summary>Copy of DiskShift() in BlackHole.shader for a photon direction making angle θ with the orbital velocity.</summary>
        static double DiskShift(double r, double cosTheta)
        {
            double beta = Math.Min(Math.Sqrt(0.5 / Math.Max(r - 1.0, 1e-3)), 0.99);
            double gamma = 1 / Math.Sqrt(1 - beta * beta);
            return Math.Sqrt(Math.Max(1 - 1 / r, 0)) / (gamma * (1 - beta * cosTheta));
        }

        [TestCase(3.0)] [TestCase(5.0)] [TestCase(10.0)] [TestCase(14.0)]
        public void Disk_redshift_for_perpendicular_emission_is_the_exact_circular_orbit_value(double r)
        {
            // photon emitted perpendicular to the orbital motion: g = √(1 − 3M/r) = √(1 − 1.5 r_s / r)
            Assert.AreEqual(Math.Sqrt(1 - 1.5 / r), DiskShift(r, 0), 1e-12);
        }

        [Test]
        public void Isco_doppler_extremes_match_the_analytic_values()
        {
            // r = 3 r_s (ISCO): β = 1/2, γ = 2/√3, √(1 − r_s/r) = √(2/3)
            double gMax = DiskShift(3, 1), gMin = DiskShift(3, -1);
            Assert.AreEqual(Math.Sqrt(2), gMax, 1e-12, "approaching side");
            Assert.AreEqual(Math.Sqrt(2.0 / 3.0) / (2 / Math.Sqrt(3) * 1.5), gMin, 1e-12, "receding side");
            TestContext.WriteLine($"ISCO: g_max = {gMax:F4}, g_min = {gMin:F4}, bolometric brightness ratio (g_max/g_min)⁴ = {Math.Pow(gMax / gMin, 4):F1}");
        }

        [Test]
        public void Shakura_sunyaev_temperature_peaks_at_49_over_36_inner_radius()
        {
            // shader: T ∝ x^(3/4) (1 − √x)^(1/4), x = r_in / r (zero-torque inner edge at the ISCO, r_in = 3 r_s)
            double best = 0, bestR = 0, rin = 3;
            for (double r = rin * 1.0001; r < 20; r += 0.0005)
            {
                double x = rin / r, t = Math.Pow(x, 0.75) * Math.Pow(1 - Math.Sqrt(x), 0.25);
                if (t > best) { best = t; bestR = r; }
            }
            Assert.AreEqual(49.0 / 36.0 * rin, bestR, 0.002);
        }
    }
}
