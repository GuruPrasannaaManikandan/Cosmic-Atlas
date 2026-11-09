using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CosmicAtlas.Astro;
using NUnit.Framework;
using UnityEngine;

namespace CosmicAtlas.Rendering.Tests
{
    public class BlackbodyAndStarTests
    {
        [Test]
        public void Hotter_blackbodies_are_bluer()
        {
            float prev = -1;
            foreach (var t in new[] { 2000, 3000, 4500, 5772, 7500, 10000, 20000, 40000 })
            {
                var c = Blackbody.LinearColor(t);
                float bOverR = c.b / Mathf.Max(c.r, 1e-4f);
                Assert.Greater(bOverR, prev, $"B/R must increase with temperature (T = {t} K)");
                prev = bOverR;
            }
        }

        [Test]
        public void Near_6500K_is_close_to_white_and_extremes_have_the_right_hue()
        {
            var w = Blackbody.LinearColor(6500);
            Assert.Greater(Mathf.Min(w.r, Mathf.Min(w.g, w.b)), 0.8f, w.ToString());
            Assert.Greater(Blackbody.LinearColor(3000).r, Blackbody.LinearColor(3000).b);
            Assert.Greater(Blackbody.LinearColor(30000).b, Blackbody.LinearColor(30000).r);
        }

        [Test]
        public void Gpu_blackbody_fit_agrees_with_the_cie_integration_in_hue_order()
        {
            foreach (var t in new[] { 3000f, 6000f, 15000f })
            {
                var cpu = Blackbody.LinearColor(t);
                var gpu = HellandFit(t);
                Assert.AreEqual(cpu.r > cpu.b, gpu.r > gpu.b, $"red/blue ordering at {t} K");
            }
        }

        // C# copy of BlackbodyColorApprox in AtlasCommon.hlsl
        static Color HellandFit(float tK)
        {
            float t = Mathf.Clamp(tK, 1000, 40000) / 100f;
            float r = t <= 66 ? 1 : Mathf.Clamp01(1.29293618606f * Mathf.Pow(t - 60, -0.1332047592f));
            float g = t <= 66 ? Mathf.Clamp01(0.39008157876f * Mathf.Log(t) - 0.63184144378f) : Mathf.Clamp01(1.12989086089f * Mathf.Pow(t - 60, -0.0755148492f));
            float b = t >= 66 ? 1 : (t <= 19 ? 0 : Mathf.Clamp01(0.54320678911f * Mathf.Log(t - 10) - 1.19625408914f));
            return new Color(Mathf.Pow(r, 2.2f), Mathf.Pow(g, 2.2f), Mathf.Pow(b, 2.2f));
        }

        [TestCase("G2V", SpectralClass.G, 2, LuminosityClass.MainSequence)]
        [TestCase("K5+ III", SpectralClass.K, 5, LuminosityClass.Giant)]
        [TestCase("M1-M2 Ia-ab", SpectralClass.M, 1, LuminosityClass.Supergiant)]
        [TestCase("B8 Ia", SpectralClass.B, 8, LuminosityClass.Supergiant)]
        [TestCase("DA2", SpectralClass.WhiteDwarf, 2, LuminosityClass.Degenerate)]
        public void Parses_MK_spectral_types(string type, SpectralClass cls, double sub, LuminosityClass lum)
        {
            Assert.IsTrue(StellarModel.TryParse(type, out var c, out var s, out var l));
            Assert.AreEqual(cls, c); Assert.AreEqual(sub, s, 1e-9); Assert.AreEqual(lum, l);
        }

        [Test]
        public void Stellar_laws_are_consistent()
        {
            Assert.AreEqual(1.0, StellarModel.LuminositySolar(1, StellarModel.SolarTeffK), 1e-12);
            Assert.AreEqual(4.74, StellarModel.AbsoluteBolometric(1), 1e-12);                       // IAU 2015 B2
            Assert.AreEqual(2.0, StellarModel.RadiusSolar(StellarModel.LuminositySolar(2, 4000), 4000), 1e-9);
            double tenPcLy = 10 * StellarModel.LyPerParsec;
            Assert.AreEqual(3.0, StellarModel.ApparentMagnitude(3.0, tenPcLy), 1e-9);              // m = M at 10 pc
            Assert.AreEqual(100.0, StellarModel.RelativeFlux(0) / StellarModel.RelativeFlux(5), 1e-9); // 5 mag = ×100
            Assert.AreEqual(1.0, StellarModel.LimbIntensity(1, 0.6), 1e-12);
            Assert.AreEqual(0.4, StellarModel.LimbIntensity(0, 0.6), 1e-12);
            Assert.Greater(StellarModel.LimbDarkeningU(3500), StellarModel.LimbDarkeningU(30000));
            Assert.Greater(StellarModel.ApproxTeff(SpectralClass.O, 5), StellarModel.ApproxTeff(SpectralClass.M, 5));
        }

        [Test]
        public void Brightness_is_apparent_not_intrinsic()
        {
            // a supergiant far away can be fainter than a dwarf nearby
            double betelgeuseLike = StellarModel.ApparentMagnitude(StellarModel.AbsoluteBolometric(1e5), 550);
            double sunAt10ly = StellarModel.ApparentMagnitude(StellarModel.AbsoluteBolometric(1), 10);
            double sunAt1000ly = StellarModel.ApparentMagnitude(StellarModel.AbsoluteBolometric(1), 1000);
            Assert.Less(betelgeuseLike, sunAt10ly);
            Assert.Greater(sunAt1000ly, sunAt10ly + 9.9);
        }
    }

    public class EclipseGeometryTests
    {
        // C# copy of CircleOverlapArea in AtlasCommon.hlsl
        static double Overlap(double a, double b, double c)
        {
            if (c >= a + b) return 0;
            double rmin = Math.Min(a, b);
            if (c <= Math.Abs(a - b)) return Math.PI * rmin * rmin;
            double a2 = a * a, b2 = b * b, c2 = c * c;
            double al = Math.Acos(Math.Max(-1, Math.Min(1, (c2 + a2 - b2) / (2 * c * a))));
            double be = Math.Acos(Math.Max(-1, Math.Min(1, (c2 + b2 - a2) / (2 * c * b))));
            return a2 * (al - 0.5 * Math.Sin(2 * al)) + b2 * (be - 0.5 * Math.Sin(2 * be));
        }

        [Test]
        public void Overlap_limits_and_monotonic_penumbra()
        {
            Assert.AreEqual(0, Overlap(1, 1, 2.1), 1e-12);
            Assert.AreEqual(Math.PI, Overlap(1, 2, 0.5), 1e-12);         // total eclipse: occluder covers the sun
            Assert.AreEqual(Math.PI * 0.25, Overlap(1, 0.5, 0.2), 1e-12); // transit: small disk fully inside
            double prev = 0;
            for (int i = 40; i >= 0; i--)
            {
                double o = Overlap(1, 1, i * 0.05); // integer loop: c reaches exactly 0
                Assert.GreaterOrEqual(o, prev - 1e-12);
                prev = o;
            }
            Assert.AreEqual(Math.PI, prev, 1e-9, "concentric equal disks: total overlap");
        }
    }

    // Black-hole ray tracing is validated in BlackHoleValidationTests.cs (replica of the shader integrator vs the
    // exact Schwarzschild deflection integral, shadow edge, photon rings, disk redshift).

    public class GalaxyAndSmallBodyTests
    {
        [Test]
        public void Hernquist_sampling_has_the_analytic_median()
        {
            var r = new Rng(1);
            var radii = Enumerable.Range(0, 20000).Select(_ => GalaxyGenerator.HernquistRadius(1f, r.U())).OrderBy(x => x).ToList();
            float median = radii[radii.Count / 2];
            Assert.AreEqual(1 + Math.Sqrt(2), median, 0.08); // M(<r)=1/2 at r = a(1+√2)
        }

        [Test]
        public void Exponential_disk_mean_radius_is_two_scale_lengths()
        {
            var r = new Rng(2);
            double mean = Enumerable.Range(0, 20000).Average(_ => GalaxyGenerator.ExponentialDiskRadius(3f, r.U(), r.U()));
            Assert.AreEqual(6.0, mean, 0.15);
        }

        [Test]
        public void Dust_lies_on_the_concave_side_of_the_arms()
        {
            var g = GalaxyParams.Typical(GalaxyMorphology.Spiral);
            var stars = new List<Particle>(); var dust = new List<Particle>();
            GalaxyGenerator.Generate(g, 20000, 3, stars, dust);
            Assert.Greater(dust.Count, 100);
            float r0 = g.diskScaleLength * 0.35f, tanP = Mathf.Tan(g.pitchDeg * Mathf.Deg2Rad);
            int inside = 0;
            foreach (var d in dust)
            {
                float R = new Vector2(d.position.x, d.position.z).magnitude;
                float th = Mathf.Atan2(d.position.z, d.position.x);
                // nearest arm radius at this angle (any winding / arm)
                float best = float.MaxValue, armR = 0;
                for (int arm = 0; arm < g.arms; arm++)
                    for (int wind = -3; wind <= 6; wind++)
                    {
                        float a = th - 2 * Mathf.PI * arm / g.arms + 2 * Mathf.PI * wind;
                        float ra = r0 * Mathf.Exp(a * tanP);
                        if (Mathf.Abs(ra - R) < best) { best = Mathf.Abs(ra - R); armR = ra; }
                    }
                if (armR > R) inside++;
            }
            Assert.Greater(inside / (float)dust.Count, 0.7f, "most dust should sit inside (concave side of) its arm");
        }

        [Test]
        public void Elliptical_has_no_dust_and_is_old()
        {
            var stars = new List<Particle>(); var dust = new List<Particle>();
            GalaxyGenerator.Generate(GalaxyParams.Typical(GalaxyMorphology.Elliptical), 5000, 4, stars, dust);
            Assert.AreEqual(0, dust.Count);
            Assert.Greater(stars.Average(s => s.color.r), stars.Average(s => s.color.b));
        }

        [Test]
        public void Toomre_encounter_raises_tidal_tails()
        {
            var res = InteractingGalaxies.Simulate(1500, InteractingGalaxies.DefaultSteps, 99, 0.8f, 3.5f, 60f);
            Assert.IsTrue(res.stars.All(s => !float.IsNaN(s.position.x) && !float.IsInfinity(s.position.x)));
            int far = res.stars.Count(s => Mathf.Min((s.position - res.centre1).magnitude, (s.position - res.centre2).magnitude) > 6.4f);
            Assert.Greater(far / (float)res.stars.Count, 0.03f, "some disk material must be pulled beyond twice the initial disk radius");
        }

        [Test]
        public void Cratered_mesh_is_a_valid_closed_surface_with_the_requested_shape()
        {
            var m = SmallBodyMesh.Build(new Vector3(13f, 9.1f, 11.4f), 4, 100, 7, Color.gray);
            var v = m.vertices; var t = m.triangles;
            Assert.IsTrue(v.All(p => !float.IsNaN(p.x) && !float.IsNaN(p.y) && !float.IsNaN(p.z)));
            var edges = new HashSet<long>();
            for (int i = 0; i < t.Length; i += 3)
                for (int k = 0; k < 3; k++) { int a = t[i + k], b = t[i + (k + 1) % 3]; edges.Add(a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a); }
            Assert.AreEqual(2, v.Length - edges.Count + t.Length / 3, "Euler characteristic of a closed sphere-like mesh");
            var size = m.bounds.size;
            Assert.Greater(size.x, size.z); Assert.Greater(size.z, size.y);
        }
    }

    public class MeshTests
    {
        [Test]
        public void Sphere_triangles_face_outward()
        {
            // regression: an inverted winding rendered every sphere inside-out (flat stars, back-lit planets)
            var m = MeshUtil.UvSphere(32);
            var v = m.vertices; var t = m.triangles;
            int outward = 0, counted = 0;
            for (int i = 0; i < t.Length; i += 3)
            {
                var a = v[t[i]]; var b = v[t[i + 1]]; var c = v[t[i + 2]];
                var n = Vector3.Cross(b - a, c - a);
                if (n.sqrMagnitude < 1e-12f) continue; // degenerate pole triangles
                counted++;
                // Unity front faces are clockwise as seen by the viewer => cross(b-a, c-a) points TOWARD the viewer
                if (Vector3.Dot(n, (a + b + c) / 3f) > 0) outward++;
            }
            Assert.AreEqual(counted, outward, "every non-degenerate triangle must face away from the centre");
        }
    }

    public class CometAndPulsarTests
    {
        [Test]
        public void Ion_tail_points_away_from_the_sun_and_dust_tail_lags_the_orbit()
        {
            var s = CometSimulator.OnOrbit(1f);
            var dust = new List<Particle>(); var ions = new List<Particle>();
            CometSimulator.Simulate(s, 2000, 1000, 20f, 5, dust, ions);
            var radial = s.nucleus.normalized; var along = s.velocity.normalized;
            var ionMean = ions.Aggregate(Vector3.zero, (acc, p) => acc + p.position).normalized;
            var dustMean = dust.Aggregate(Vector3.zero, (acc, p) => acc + p.position).normalized;
            Assert.Greater(Vector3.Dot(ionMean, radial), 0.95f, "ion tail ~ anti-sunward");
            Assert.Greater(Vector3.Dot(dustMean, radial), 0.2f, "dust tail anti-sunward on average");
            Assert.Less(Vector3.Dot(dustMean, along), 0f, "dust tail curves behind the orbital motion");
            Assert.Greater(Vector3.Dot(ionMean, radial), Vector3.Dot(dustMean, radial), "ion tail straighter than dust tail");
        }

        [Test]
        public void Propagation_keeps_a_circular_orbit_circular()
        {
            var s = CometSimulator.OnOrbit(1f);
            CometSimulator.Propagate(s.nucleus, s.velocity, 365.25f, 1.0, out var p, out _);
            Assert.AreEqual(1.0, p.magnitude, 2e-3);
            Assert.AreEqual(0, Vector3.Distance(p, s.nucleus), 0.03f, "one sidereal year returns close to the start");
        }

        [Test]
        public void Pulse_peaks_when_a_beam_points_at_the_observer()
        {
            Assert.AreEqual(1f, PulsarExhibit.PulseFor(Vector3.up, Vector3.up, 10), 1e-6);
            Assert.AreEqual(1f, PulsarExhibit.PulseFor(Vector3.up, Vector3.down, 10), 1e-6); // the other pole
            Assert.Less(PulsarExhibit.PulseFor(Vector3.up, Vector3.right, 10), 1e-3f);
        }
    }

    public class QualityAndDataTests
    {
        [Test]
        public void Auto_quality_is_conservative_on_integrated_gpus_and_the_web()
        {
            Assert.AreEqual(AtlasQualityLevel.Medium, AtlasQuality.AutoSelect("Intel(R) Arc(TM) Graphics", 2048, false, 50));
            Assert.AreEqual(AtlasQualityLevel.Low, AtlasQuality.AutoSelect("Intel(R) UHD Graphics", 1024, false, 50));
            Assert.AreEqual(AtlasQualityLevel.Low, AtlasQuality.AutoSelect("NVIDIA GeForce RTX 4070", 12000, true, 50));
            Assert.AreEqual(AtlasQualityLevel.Ultra, AtlasQuality.AutoSelect("NVIDIA GeForce RTX 4070", 12000, false, 50));
            var lo = AtlasQualitySettings.For(AtlasQualityLevel.Low); var hi = AtlasQualitySettings.For(AtlasQualityLevel.Ultra);
            Assert.Less(lo.blackHoleSteps, hi.blackHoleSteps); Assert.Less(lo.galaxyParticles, hi.galaxyParticles);
        }

        [Test]
        public void Resources_catalogue_is_the_parity_tested_artefact()
        {
            var unityCopy = Resources.Load<TextAsset>("catalog.v1").text;
            var canonical = File.ReadAllText(Path.GetFullPath(Path.Combine(Application.dataPath, "../../../unity-migration/data/catalog.v1.json")));
            Assert.AreEqual(canonical.Replace("\r\n", "\n"), unityCopy.Replace("\r\n", "\n"), "Assets/CosmicAtlas/Resources/catalog.v1.json must be an exact copy");
        }

        [Test]
        public void Finds_a_real_galilean_shadow_transit_with_the_shared_kepler_engine()
        {
            var cat = new AstroCatalog(ShowcaseController.LoadCatalog());
            var g = ShowcaseFactory.FindShadowTransit(cat, new DateTime(2026, 11, 8, 0, 0, 0, DateTimeKind.Utc));
            Assert.IsNotNull(g.transitMoon, "Io's 1.77-day orbit guarantees a shadow transit within 3 days");
            Assert.Less(g.shadowOffsetKm, 69911 * 0.7);
            Assert.AreEqual(4, g.moonsKm.Count);
            Assert.AreEqual(421700, g.moonsKm["io"].magnitude, 3000, "Io's orbital radius (km)");
            Assert.Greater(Vector3.Dot(g.pole, Vector3.up), -1.01f);
        }
    }
}
