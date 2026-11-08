using System;
using System.Linq;
using NUnit.Framework;

namespace CosmicAtlas.Astro.Tests
{
    [TestFixture]
    public class CatalogTests
    {
        [Test]
        public void Catalogue_loads_with_the_inspected_counts()
        {
            var cat = TestData.Astro;
            Assert.Multiple(() =>
            {
                Assert.That(cat.Data.Objects.Count, Is.EqualTo(79), "objects (17 curated + 8 planets + 54 solar bodies)");
                Assert.That(cat.Data.SolarBodies.Count, Is.EqualTo(54));
                Assert.That(cat.Data.PlanetElements.Count, Is.EqualTo(8));
                Assert.That(cat.Data.Objects.Count(o => o.Category == "planet"), Is.EqualTo(8));
                Assert.That(cat.Data.Objects.Select(o => o.Id).Distinct().Count(), Is.EqualTo(79), "ids unique");
                Assert.That(cat.Data.SaturnRings.Select(r => r.Name), Does.Contain("Cassini Division"));
            });
        }

        /// <summary>
        /// Upstream data defects reproduced faithfully by the port (the TS engine reports the same validation errors).
        /// D9 — Tethys: JPL apsidal period 0.005 yr ⇒ ω̇ ≈ 197°/day exceeds the orbital rate, so the derived mean motion is
        /// negative (−6.23°/day). Positions stay correct (only Ω+ω+M matters at e = 0.001; Horizons phase-fit RMS 0.23°),
        /// but periodDays() = −57.8 d is shown in the app's Inspector and drives Tethys' synchronous spin.
        /// When the app data is fixed, this entry must be removed (the test fails if the defect disappears or changes).
        /// </summary>
        static readonly System.Collections.Generic.Dictionary<string, string> KnownUpstreamDefects = new()
        {
            ["tethys"] = "mean motion must be > 0",
        };

        [Test]
        public void Every_solar_body_has_valid_elements_and_a_frame_parent()
        {
            var cat = TestData.Astro;
            Assert.Multiple(() =>
            {
                foreach (var b in cat.Data.SolarBodies)
                {
                    var errs = Kepler.ValidateElements(b.Orbit.Elements);
                    if (KnownUpstreamDefects.TryGetValue(b.Id, out var expected))
                        Assert.That(errs, Is.EqualTo(new[] { expected }), b.Id + " (known upstream defect changed — update KnownUpstreamDefects)");
                    else
                        Assert.That(errs, Is.Empty, b.Id);
                    Assert.That(cat.Frames.Contains(b.Id), Is.True, b.Id);
                    Assert.That(cat.Frames.Ancestry(b.Id).Last(), Is.EqualTo(SolarSystemFrames.Sun), b.Id);
                }
            });
        }

        [Test]
        public void Provenance_and_schematic_flags_survive_the_export()
        {
            var cat = TestData.Astro;
            Assert.That(cat.ById["laniakea"].Schematic, Is.True);
            Assert.That(cat.ById["laniakea"].Provenance, Is.EqualTo("illustrative"));
            Assert.That(cat.ById["andromeda"].Distance.UncertaintyLy, Is.GreaterThan(0));
            Assert.That(cat.SolarById["moon"].Orbit.PhaseFit, Is.Not.Null, "Horizons phase fit is carried in the artefact");
        }

        [Test]
        public void Invalid_elements_are_rejected_without_guessing()
        {
            var good = TestData.Astro.SolarById["moon"].Orbit.Elements;
            var bad = new KeplerElements
            {
                AKm = -1, E = 1.2, IDeg = 200, NodeDeg = double.NaN, ArgPeriDeg = 0, MeanAnomalyDeg = 0,
                EpochJd = good.EpochJd, MeanMotionDegPerDay = 0, Frame = null,
            };
            var errs = Kepler.ValidateElements(bad);
            Assert.That(errs, Has.Some.Contains("aKm must be > 0"));
            Assert.That(errs, Has.Some.Contains("e must be in [0, 1)"));
            Assert.That(errs, Has.Some.Contains("iDeg"));
            Assert.That(errs, Has.Some.Contains("nodeDeg"));
            Assert.That(errs, Has.Some.Contains("frame missing"));
            Assert.Throws<OrbitElementsException>(() => Kepler.AssertValidElements(bad));
            Assert.Throws<OrbitElementsException>(() => Kepler.SolveKeplerStable(0.1, 1.0));
        }
    }

    /// <summary>Blueprint §6.4: galactic (RH) ↔ Three.js (RH, Y-up) ↔ Unity (LH, Y-up).</summary>
    [TestFixture]
    public class AxisMappingTests
    {
        static readonly Vec3d GcDir = new Vec3d(1, 0, 0);   // l = 0, b = 0
        static readonly Vec3d L90 = new Vec3d(0, 1, 0);     // l = 90°
        static readonly Vec3d Ngp = new Vec3d(0, 0, 1);     // North Galactic Pole

        [Test]
        public void Galactic_axes_land_on_the_documented_unity_axes()
        {
            Assert.That(AxisMapping.GalacticToUnity(GcDir), Is.EqualTo(new Vec3d(1, 0, 0)), "GC → Unity +X (right)");
            Assert.That(AxisMapping.GalacticToUnity(Ngp), Is.EqualTo(new Vec3d(0, 1, 0)), "NGP → Unity +Y (up)");
            Assert.That(AxisMapping.GalacticToUnity(L90), Is.EqualTo(new Vec3d(0, 0, 1)), "l=90° → Unity +Z (forward)");
        }

        [Test]
        public void Round_trips_are_exact()
        {
            var v = new Vec3d(-26673.123456789, 0.000123, 17.5);
            Assert.That(AxisMapping.UnityToGalactic(AxisMapping.GalacticToUnity(v)), Is.EqualTo(v));
            Assert.That(AxisMapping.ThreeToGalactic(AxisMapping.GalacticToThree(v)), Is.EqualTo(v));
            Assert.That(AxisMapping.ThreeToUnity(AxisMapping.GalacticToThree(v)), Is.EqualTo(AxisMapping.GalacticToUnity(v)),
                "Unity = Three.js with Z negated");
        }

        [Test]
        public void Mapping_flips_handedness_exactly_once()
        {
            // For a reflection M (det −1): M(a × b) = −(Ma × Mb). Galactic RH triples become LH triples in Unity space,
            // which is what Unity's left-handed cross-product convention expects.
            var a = new Vec3d(0.3, -1.2, 2.0); var b = new Vec3d(-0.7, 0.4, 1.1);
            var lhs = AxisMapping.GalacticToUnity(Vec3d.Cross(a, b));
            var rhs = -Vec3d.Cross(AxisMapping.GalacticToUnity(a), AxisMapping.GalacticToUnity(b));
            Assert.That((lhs - rhs).Length, Is.LessThan(1e-15));
            // Three.js mapping is a proper rotation (det +1): no sign change.
            var t = AxisMapping.GalacticToThree(Vec3d.Cross(a, b));
            var t2 = Vec3d.Cross(AxisMapping.GalacticToThree(a), AxisMapping.GalacticToThree(b));
            Assert.That((t - t2).Length, Is.LessThan(1e-15));
        }

        [Test]
        public void Three_quaternions_convert_to_unity_by_mirroring()
        {
            var rng = new Random(42);
            for (int i = 0; i < 100; i++)
            {
                var axis = new Vec3d(rng.NextDouble() - 0.5, rng.NextDouble() - 0.5, rng.NextDouble() - 0.5);
                var q = QuaternionD.FromAxisAngle(axis, (rng.NextDouble() - 0.5) * 6);
                var v = new Vec3d(rng.NextDouble() - 0.5, rng.NextDouble() - 0.5, rng.NextDouble() - 0.5);
                var expected = AxisMapping.ThreeToUnity(q.Rotate(v));
                var actual = AxisMapping.ThreeToUnity(q).Rotate(AxisMapping.ThreeToUnity(v));
                Assert.That((expected - actual).Length, Is.LessThan(1e-14), $"case {i}");
            }
        }
    }

    /// <summary>
    /// Blueprint §6.2/§6.3 and finding D1: the single galactic-centre frame quantises Solar-System positions at ~34 km;
    /// the hierarchical frames do not.
    /// </summary>
    [TestFixture]
    public class PrecisionTests
    {
        [Test]
        public void Root_frame_spacing_near_the_sun_is_about_34_km()
        {
            double ulpKm = Tol.Ulp(AstroConstants.SUN_GC_LY) / AstroConstants.KM_TO_LY;
            TestContext.Out.WriteLine($"1 ULP at |x| = {AstroConstants.SUN_GC_LY} ly = {ulpKm:F2} km");
            Assert.That(ulpKm, Is.InRange(34.0, 35.0));
        }

        [Test]
        public void Camera_near_Deimos_is_exact_in_hierarchical_frames_but_not_in_the_root_frame()
        {
            var cat = TestData.Astro;
            var deimos = cat.SolarById["deimos"];
            double viewKm = deimos.Physical.MeanRadiusKm * 3.5;           // the app's arrival distance (≈ 21.7 km)
            var worst = new Tol.Max(); var legacyWorst = new Tol.Max();

            foreach (double ms in TestData.Fixtures.Epochs)
            {
                // Camera placed viewKm from Deimos, expressed in Mars' frame (as an anchored camera would be).
                var deimosInMars = Kepler.PositionAtMs(deimos.Orbit.Elements, ms);
                var offset = new Vec3d(0.6, 0.0, 0.8) * viewKm;
                var camera = new FramePos("mars", deimosInMars + offset);

                // Hierarchical: LCA is Mars, so this is a subtraction of two ~2e4 km numbers.
                var rel = cat.Frames.RelativeKm(FramePos.At("deimos"), camera, ms);
                worst.Add((rel - (-offset)).Length, $"@{ms}");

                // Legacy: both positions rounded into galactic-centre light-years first, then subtracted.
                var deimosRoot = cat.SolarBodyRootPosLy(deimos, ms);
                var camRoot = PlanetEphemeris.PlanetRootPos(cat.PlanetElements("mars"), ms) + (deimosInMars + offset) * AstroConstants.KM_TO_LY;
                var legacyRelKm = (deimosRoot - camRoot) * (1 / AstroConstants.KM_TO_LY);
                legacyWorst.Add((legacyRelKm - (-offset)).Length, $"@{ms}");
            }

            TestContext.Out.WriteLine($"Deimos view distance {viewKm:F1} km.");
            TestContext.Out.WriteLine($"  hierarchical frames: max camera-relative error = {worst.Value:E2} km");
            TestContext.Out.WriteLine($"  legacy root frame:   max camera-relative error = {legacyWorst.Value:F2} km ({legacyWorst.Where})");
            Assert.That(worst.Value, Is.LessThan(1e-9), "hierarchical frames must be sub-micrometre here");
            Assert.That(legacyWorst.Value, Is.GreaterThan(1.0), "documents finding D1; if this ever fails the legacy model changed");
        }

        [Test]
        public void Lowest_common_ancestor_is_chosen_correctly()
        {
            var f = TestData.Astro.Frames;
            Assert.That(f.LowestCommonAncestor("phobos", "deimos"), Is.EqualTo("mars"));
            Assert.That(f.LowestCommonAncestor("phobos", "io"), Is.EqualTo("sun"));
            Assert.That(f.LowestCommonAncestor("nix", "charon"), Is.EqualTo(SolarSystemFrames.PlutoBarycentre));
            Assert.That(f.LowestCommonAncestor("pluto", "pluto"), Is.EqualTo("pluto"));
            Assert.That(f.LowestCommonAncestor("moon", "earth"), Is.EqualTo("earth"));
        }

        [Test]
        public void Relative_positions_are_antisymmetric_and_consistent_with_heliocentric()
        {
            var f = TestData.Astro.Frames;
            double ms = TestData.Fixtures.Epochs[10];
            var a = FramePos.At("titan"); var b = FramePos.At("enceladus");
            var ab = f.RelativeKm(a, b, ms); var ba = f.RelativeKm(b, a, ms);
            Assert.That((ab + ba).Length, Is.EqualTo(0));
            var viaSun = f.HeliocentricKm("titan", ms) - f.HeliocentricKm("enceladus", ms);
            Assert.That((ab - viaSun).Length, Is.LessThan(1e-3), "same vector; heliocentric route only loses ~µm–mm");
        }
    }
}
