using System;
using System.Linq;
using NUnit.Framework;

namespace CosmicAtlas.Astro.Tests
{
    /// <summary>
    /// C# engine vs. TypeScript engine (fixtures exported from frontend/src by export-astro-data.ts).
    ///
    /// Tolerances (blueprint §13: ≤ 1e-6 km or 1e-12 relative):
    ///   * time, constants, rates           : bit-exact
    ///   * unit vectors / matrices          : 1e-15 absolute (allows a 1-ULP difference in libm trig)
    ///   * km positions                     : |Δ| ≤ max(1e-6 km, 1e-12·|v|)
    ///   * legacy root-frame ly positions   : ≤ 4 ULP of the coordinate magnitude (the TS root frame itself is quantised
    ///                                        at 1 ULP ≈ 34 km near the Sun — blueprint finding D1)
    /// Each test prints its maximum observed deviation so regressions in headroom are visible.
    /// </summary>
    [TestFixture]
    public class ParityTests
    {
        static FixtureFile Fx => TestData.Fixtures;
        static AstroCatalog Cat => TestData.Astro;

        static double KmTol(Vec3d v) => Math.Max(1e-6, 1e-12 * v.Length);

        [Test]
        public void Fixtures_match_the_catalogue_they_were_generated_with()
        {
            Assert.That(Fx.SchemaVersion, Is.EqualTo(1));
            Assert.That(TestData.Catalog.SchemaVersion, Is.EqualTo(1));
            Assert.That(Fx.CatalogContentHash, Is.EqualTo(TestData.Catalog.ContentHash));
            Assert.That(Fx.Epochs.Length, Is.GreaterThanOrEqualTo(50), "blueprint requires ≥ 50 epochs");
            Assert.That(Fx.Epochs.Min(), Is.LessThanOrEqualTo(PlanetEphemeris.VALID_FROM + 1));
            Assert.That(Fx.Epochs.Max(), Is.GreaterThanOrEqualTo(PlanetEphemeris.VALID_TO - 1));
        }

        [Test]
        public void Constants_in_the_catalogue_equal_the_compiled_constants()
        {
            var c = TestData.Catalog.Constants;
            Assert.Multiple(() =>
            {
                Assert.That(c.LY_PER_PC, Is.EqualTo(AstroConstants.LY_PER_PC));
                Assert.That(c.LY_PER_AU, Is.EqualTo(AstroConstants.LY_PER_AU));
                Assert.That(c.SUN_GC_LY, Is.EqualTo(AstroConstants.SUN_GC_LY));
                Assert.That(Tol.V(c.SUN_POS), Is.EqualTo(AstroConstants.SUN_POS));
                Assert.That(c.C_KM_S, Is.EqualTo(AstroConstants.C_KM_S));
                Assert.That(c.OBLIQUITY_J2000_DEG, Is.EqualTo(AstroConstants.OBLIQUITY_J2000_DEG));
                Assert.That(c.KM_PER_AU, Is.EqualTo(AstroConstants.KM_PER_AU));
                Assert.That(c.DAYS_PER_JULIAN_YEAR, Is.EqualTo(AstroConstants.DAYS_PER_JULIAN_YEAR));
                Assert.That(c.KM_TO_LY, Is.EqualTo(AstroConstants.KM_TO_LY));
                Assert.That(c.JD_UNIX_EPOCH, Is.EqualTo(AstroTime.JD_UNIX_EPOCH));
                Assert.That(c.JD_J2000, Is.EqualTo(AstroTime.JD_J2000));
                Assert.That(c.MS_PER_DAY, Is.EqualTo(AstroTime.MS_PER_DAY));
                Assert.That(c.J2000_MS, Is.EqualTo(PlanetEphemeris.J2000_MS));
                Assert.That(c.EPHEMERIS_VALID_FROM_MS, Is.EqualTo(PlanetEphemeris.VALID_FROM));
                Assert.That(c.EPHEMERIS_VALID_TO_MS, Is.EqualTo(PlanetEphemeris.VALID_TO));
                for (int r = 0; r < 3; r++)
                    for (int k = 0; k < 3; k++)
                        Assert.That(c.EQ_TO_GAL[r][k], Is.EqualTo(AstroConstants.EQ_TO_GAL[r, k]), $"EQ_TO_GAL[{r}][{k}]");
            });
        }

        [Test]
        public void Time_conversions_are_bit_exact()
        {
            Assert.Multiple(() =>
            {
                foreach (var t in Fx.Time.Cases)
                {
                    Assert.That(AstroTime.TtMinusUtc(t.Ms), Is.EqualTo(t.TtMinusUtc), $"ttMinusUtc({t.Ms})");
                    Assert.That(AstroTime.JdTdbFromUtcMs(t.Ms), Is.EqualTo(t.JdTdb), $"jdTdb({t.Ms})");
                    Assert.That(PlanetEphemeris.CenturiesSinceJ2000(t.Ms), Is.EqualTo(t.CenturiesSinceJ2000), $"T({t.Ms})");
                    Assert.That(PlanetEphemeris.IsModelRange(t.Ms), Is.EqualTo(t.IsModelRange), $"isModelRange({t.Ms})");
                }
                foreach (var c in Fx.Time.CalendarEpochs)
                    Assert.That(AstroTime.JdFromCalendarEpoch(c.S), Is.EqualTo(c.Jd), c.S);
            });
            TestContext.Out.WriteLine($"{Fx.Time.Cases.Count} time cases + {Fx.Time.CalendarEpochs.Count} calendar epochs: bit-exact");
        }

        [Test]
        public void Coordinate_transforms_match()
        {
            var unitErr = new Tol.Max(); var rootUlp = new Tol.Max();
            foreach (var c in Fx.Coords.RaDec)
            {
                var u = Coords.RaDecToUnit(c.RaDeg, c.DecDeg);
                unitErr.Add((u - Tol.V(c.Unit)).Length, $"raDec unit {c.RaDeg},{c.DecDeg}");
                unitErr.Add((Coords.EquatorialToGalactic(u) - Tol.V(c.GalacticUnit)).Length, $"gal unit {c.RaDeg},{c.DecDeg}");
                rootUlp.Add(Tol.UlpDistance(Coords.RaDecDistToRoot(c.RaDeg, c.DecDeg, c.DistanceLy), Tol.V(c.RootLy)), $"raDec root {c.RaDeg},{c.DecDeg}");
            }
            foreach (var c in Fx.Coords.GalacticLB)
            {
                var u = Coords.GalacticLBToUnit(c.LDeg, c.BDeg);
                unitErr.Add((u - Tol.V(c.Unit)).Length, $"lb unit {c.LDeg},{c.BDeg}");
                rootUlp.Add(Tol.UlpDistance(Coords.SunRelativeToRoot(u, c.DistanceLy), Tol.V(c.RootLy)), $"lb root {c.LDeg},{c.BDeg}");
                var (l, b) = Coords.UnitToGalacticLB(u);
                unitErr.Add(Math.Abs(l - c.BackToLB.L) / 360 + Math.Abs(b - c.BackToLB.B) / 180, $"back to lb {c.LDeg},{c.BDeg}");
            }
            foreach (var c in Fx.Coords.Ecliptic)
                unitErr.Add((Coords.EclipticToGalactic(Tol.V(c.V)) - Tol.V(c.Galactic)).Length / Math.Max(1, Tol.V(c.V).Length), "ecliptic");

            TestContext.Out.WriteLine($"unit-vector max |Δ| = {unitErr}; root-frame max ULP distance = {rootUlp}");
            Assert.That(unitErr.Value, Is.LessThanOrEqualTo(1e-15), unitErr.ToString());
            Assert.That(rootUlp.Value, Is.LessThanOrEqualTo(4), rootUlp.ToString());
        }

        [Test]
        public void Kepler_solvers_and_rates_match()
        {
            var err = new Tol.Max();
            foreach (var s in Fx.Kepler.Stable) err.Add(Math.Abs(Kepler.SolveKeplerStable(s.M, s.Ecc) - s.EAnomaly), $"stable M={s.M} e={s.Ecc}");
            foreach (var s in Fx.Kepler.Legacy) err.Add(Math.Abs(PlanetEphemeris.SolveKepler(s.M, s.Ecc) - s.EAnomaly), $"legacy M={s.M} e={s.Ecc}");
            TestContext.Out.WriteLine($"eccentric anomaly max |Δ| = {err} rad");
            Assert.That(err.Value, Is.LessThanOrEqualTo(1e-13), err.ToString());

            Assert.Multiple(() =>
            {
                foreach (var r in Fx.Kepler.JplRates)
                {
                    var got = Kepler.JplSatelliteRates(r.Row.IDeg, r.Row.PeriodDays, r.Row.ApsisPeriodYr, r.Row.NodePeriodYr);
                    Assert.That(got.meanMotionDegPerDay, Is.EqualTo(r.Rates.MeanMotionDegPerDay));
                    Assert.That(got.argPeriRateDegPerDay, Is.EqualTo(r.Rates.ArgPeriRateDegPerDay));
                    Assert.That(got.nodeRateDegPerDay, Is.EqualTo(r.Rates.NodeRateDegPerDay));
                }
            });
        }

        [Test]
        public void Reference_frame_matrices_match()
        {
            var err = new Tol.Max();
            foreach (var f in Fx.Frames)
            {
                var m = Kepler.FrameToGalactic(Cat.SolarById[f.Id].Orbit.Elements.Frame);
                for (int r = 0; r < 3; r++)
                    for (int c = 0; c < 3; c++)
                        err.Add(Math.Abs(m[r, c] - f.ToGalactic[r][c]), $"{f.Id}[{r},{c}]");
            }
            TestContext.Out.WriteLine($"{Fx.Frames.Count} frame matrices, max |Δ| = {err}");
            Assert.That(err.Value, Is.LessThanOrEqualTo(1e-15), err.ToString());
        }

        [Test]
        public void Planet_positions_match()
        {
            var auRel = new Tol.Max(); var kmErr = new Tol.Max(); var rootUlp = new Tol.Max(); int n = 0;
            foreach (var p in Fx.Planets)
            {
                var set = Cat.PlanetElements(p.Id);
                foreach (var s in p.Samples)
                {
                    var au = PlanetEphemeris.PlanetEclipticAU(set, s.Ms);
                    auRel.Add((au - Tol.V(s.EclipticAu)).Length / Tol.V(s.EclipticAu).Length, $"{p.Id}@{s.Ms}");
                    var km = Cat.Frames.HeliocentricKm(p.Id, s.Ms);
                    var refKm = Tol.V(s.HeliocentricKm);
                    kmErr.Add((km - refKm).Length / KmTol(refKm), $"{p.Id}@{s.Ms}");
                    rootUlp.Add(Tol.UlpDistance(PlanetEphemeris.PlanetRootPos(set, s.Ms), Tol.V(s.RootLy)), $"{p.Id}@{s.Ms}");
                    rootUlp.Add(Tol.UlpDistance(PlanetEphemeris.PlanetOffsetLy(set, s.Ms), Tol.V(s.OffsetLy)) / 4, $"{p.Id} offset@{s.Ms}");
                    n++;
                }
            }
            TestContext.Out.WriteLine($"{n} planet samples. ecliptic AU max rel Δ = {auRel}; heliocentric km Δ/tol = {kmErr}; root ly ULP = {rootUlp}");
            Assert.That(auRel.Value, Is.LessThanOrEqualTo(1e-12), auRel.ToString());
            Assert.That(kmErr.Value, Is.LessThanOrEqualTo(1), kmErr.ToString());
            Assert.That(rootUlp.Value, Is.LessThanOrEqualTo(4), rootUlp.ToString());
        }

        [Test]
        public void Solar_body_positions_match()
        {
            var relErr = new Tol.Max(); var helioErr = new Tol.Max(); var normErr = new Tol.Max(); var rootUlp = new Tol.Max();
            int n = 0;
            foreach (var b in Fx.Bodies)
            {
                var body = Cat.SolarById[b.Id];
                Assert.That(body.Parent, Is.EqualTo(b.Parent), b.Id);
                foreach (var s in b.Samples)
                {
                    var rel = Kepler.PositionAtMs(body.Orbit.Elements, s.Ms);
                    var refRel = Tol.V(s.RelativeToPrimaryKm);
                    relErr.Add((rel - refRel).Length / KmTol(refRel), $"{b.Id}@{s.Ms}");

                    var helio = Cat.Frames.HeliocentricKm(b.Id, s.Ms);
                    var refHelio = Tol.V(s.HeliocentricKm);
                    helioErr.Add((helio - refHelio).Length / KmTol(refHelio), $"{b.Id}@{s.Ms}");

                    normErr.Add((Kepler.OrbitNormalAtMs(body.Orbit.Elements, s.Ms) - Tol.V(s.OrbitNormal)).Length, $"{b.Id}@{s.Ms}");
                    rootUlp.Add(Tol.UlpDistance(Cat.SolarBodyRootPosLy(body, s.Ms), Tol.V(s.RootLy)), $"{b.Id}@{s.Ms}");
                    n++;
                }
            }
            TestContext.Out.WriteLine($"{Fx.Bodies.Count} bodies × {Fx.Epochs.Length} epochs = {n} samples");
            TestContext.Out.WriteLine($"  relative-to-primary km Δ/tol = {relErr}");
            TestContext.Out.WriteLine($"  heliocentric km (hierarchical frames) Δ/tol = {helioErr}");
            TestContext.Out.WriteLine($"  orbit normal max |Δ| = {normErr}");
            TestContext.Out.WriteLine($"  legacy root ly max ULP distance = {rootUlp}");
            Assert.That(relErr.Value, Is.LessThanOrEqualTo(1), relErr.ToString());
            Assert.That(helioErr.Value, Is.LessThanOrEqualTo(1), helioErr.ToString());
            Assert.That(normErr.Value, Is.LessThanOrEqualTo(1e-14), normErr.ToString());
            Assert.That(rootUlp.Value, Is.LessThanOrEqualTo(4), rootUlp.ToString());
        }

        [Test]
        public void Orbit_polylines_match()
        {
            var err = new Tol.Max();
            foreach (var o in Fx.OrbitPaths)
            {
                var pts = Kepler.OrbitPathKm(Cat.SolarById[o.Id].Orbit.Elements, o.Ms, o.N);
                Assert.That(pts.Length, Is.EqualTo(o.PointsKm.Length), o.Id);
                for (int i = 0; i < pts.Length; i++)
                {
                    var r = Tol.V(o.PointsKm[i]);
                    err.Add((pts[i] - r).Length / KmTol(r), $"{o.Id}[{i}]");
                }
            }
            TestContext.Out.WriteLine($"orbit polyline Δ/tol = {err}");
            Assert.That(err.Value, Is.LessThanOrEqualTo(1), err.ToString());
        }

        [Test]
        public void Every_catalogue_object_resolves_to_the_same_root_position()
        {
            var staticUlp = new Tol.Max(); var dynamicUlp = new Tol.Max(); int n = 0;
            foreach (var o in Fx.Objects)
            {
                var obj = Cat.ById[o.Id];
                Assert.That(obj.Position.Kind, Is.EqualTo(o.Kind), o.Id);
                foreach (var s in o.Samples)
                {
                    double d = Tol.UlpDistance(Cat.PositionOfRootLy(obj, s.Ms), Tol.V(s.RootLy));
                    (AstroCatalog.IsDynamic(obj) ? dynamicUlp : staticUlp).Add(d, $"{o.Id}@{s.Ms}");
                    n++;
                }
            }
            TestContext.Out.WriteLine($"{Fx.Objects.Count} objects, {n} samples. static ULP = {staticUlp}; dynamic ULP = {dynamicUlp}");
            Assert.That(staticUlp.Value, Is.LessThanOrEqualTo(4), staticUlp.ToString());
            Assert.That(dynamicUlp.Value, Is.LessThanOrEqualTo(4), dynamicUlp.ToString());
        }
    }
}
