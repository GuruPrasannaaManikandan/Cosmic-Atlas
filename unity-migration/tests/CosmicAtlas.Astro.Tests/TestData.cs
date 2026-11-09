using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using NUnit.Framework;

namespace CosmicAtlas.Astro.Tests
{
    // ------------------------------------------------------------------ fixture schema (parity_fixtures.v1.json)
    public sealed class FixtureFile
    {
        public int SchemaVersion { get; set; }
        public string CatalogContentHash { get; set; }
        public double[] Epochs { get; set; }
        public TimeSection Time { get; set; }
        public CoordsSection Coords { get; set; }
        public KeplerSection Kepler { get; set; }
        public List<FrameFx> Frames { get; set; }
        public List<PlanetFx> Planets { get; set; }
        public List<BodyFx> Bodies { get; set; }
        public List<OrbitPathFx> OrbitPaths { get; set; }
        public List<ObjectFx> Objects { get; set; }
    }

    public sealed class TimeSection { public List<TimeCase> Cases { get; set; } public List<CalendarCase> CalendarEpochs { get; set; } }
    public sealed class TimeCase { public double Ms { get; set; } public double TtMinusUtc { get; set; } public double JdTdb { get; set; } public double CenturiesSinceJ2000 { get; set; } public bool IsModelRange { get; set; } }
    public sealed class CalendarCase { public string S { get; set; } public double Jd { get; set; } }

    public sealed class CoordsSection { public List<RaDecFx> RaDec { get; set; } public List<LBFx> GalacticLB { get; set; } public List<EclFx> Ecliptic { get; set; } }
    public sealed class RaDecFx { public double RaDeg { get; set; } public double DecDeg { get; set; } public double DistanceLy { get; set; } public double[] Unit { get; set; } public double[] GalacticUnit { get; set; } public double[] RootLy { get; set; } }
    public sealed class LBFx { public double LDeg { get; set; } public double BDeg { get; set; } public double DistanceLy { get; set; } public double[] Unit { get; set; } public double[] RootLy { get; set; } public LB BackToLB { get; set; } }
    public sealed class LB { public double L { get; set; } public double B { get; set; } }
    public sealed class EclFx { public double[] V { get; set; } public double[] Galactic { get; set; } }

    public sealed class KeplerSection { public List<SolveFx> Stable { get; set; } public List<SolveFx> Legacy { get; set; } public List<RatesFx> JplRates { get; set; } }
    public sealed class SolveFx
    {
        [System.Text.Json.Serialization.JsonPropertyName("M")] public double M { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("e")] public double Ecc { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("E")] public double EAnomaly { get; set; }
    }
    public sealed class RatesFx { public RatesRow Row { get; set; } public Rates Rates { get; set; } }
    public sealed class RatesRow { public double IDeg { get; set; } public double PeriodDays { get; set; } public double? ApsisPeriodYr { get; set; } public double? NodePeriodYr { get; set; } }
    public sealed class Rates { public double MeanMotionDegPerDay { get; set; } public double ArgPeriRateDegPerDay { get; set; } public double NodeRateDegPerDay { get; set; } }

    public sealed class FrameFx { public string Id { get; set; } public RefFrame Frame { get; set; } public double[][] ToGalactic { get; set; } }
    public sealed class PlanetFx { public string Id { get; set; } public List<PlanetSample> Samples { get; set; } }
    public sealed class PlanetSample { public double Ms { get; set; } public double[] EclipticAu { get; set; } public double[] OffsetLy { get; set; } public double[] RootLy { get; set; } public double[] HeliocentricKm { get; set; } }
    public sealed class BodyFx { public string Id { get; set; } public string Parent { get; set; } public List<BodySample> Samples { get; set; } }
    public sealed class BodySample { public double Ms { get; set; } public double[] RelativeToPrimaryKm { get; set; } public double[] OrbitNormal { get; set; } public double[] RootLy { get; set; } public double[] HeliocentricKm { get; set; } }
    public sealed class OrbitPathFx { public string Id { get; set; } public double Ms { get; set; } public int N { get; set; } public double[][] PointsKm { get; set; } }
    public sealed class ObjectFx { public string Id { get; set; } public string Kind { get; set; } public List<ObjectSample> Samples { get; set; } }
    public sealed class ObjectSample { public double Ms { get; set; } public double[] RootLy { get; set; } }

    // ------------------------------------------------------------------ loading
    public static class TestData
    {
        static readonly JsonSerializerOptions Options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        static CatalogFile _catalog;
        static FixtureFile _fixtures;
        static AstroCatalog _astro;

        static string DataPath(string file) => Path.Combine(TestContext.CurrentContext.TestDirectory, "data", file);

        public static CatalogFile Catalog => _catalog ??= JsonSerializer.Deserialize<CatalogFile>(File.ReadAllText(DataPath("catalog.v1.json")), Options);
        public static FixtureFile Fixtures => _fixtures ??= LoadFixtures();
        public static AstroCatalog Astro => _astro ??= new AstroCatalog(Catalog);

        static FixtureFile LoadFixtures()
        {
            // "e" (eccentricity) and "E" (eccentric anomaly) differ only by case in the Kepler solve fixtures, so this
            // file is read case-SENSITIVELY with explicit camelCase naming.
            var opts = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = false };
            return JsonSerializer.Deserialize<FixtureFile>(File.ReadAllText(DataPath("parity_fixtures.v1.json")), opts);
        }
    }

    // ------------------------------------------------------------------ tolerance helpers
    public static class Tol
    {
        public static Vec3d V(double[] a) => Vec3d.FromArray(a);

        /// <summary>Spacing of doubles at |x| (one ULP).</summary>
        public static double Ulp(double x)
        {
            double a = Math.Abs(x);
            return Math.BitIncrement(a) - a;
        }

        /// <summary>
        /// Largest component difference expressed in ULPs of the vector's coordinate magnitude (max |component| of a or b).
        /// A per-component ULP would be meaningless for components that are near zero only because of the vector's
        /// direction; the precision of a root-frame position is set by its largest coordinate (e.g. |x| ≈ 26,673 ly).
        /// </summary>
        public static double UlpDistance(Vec3d a, Vec3d b)
        {
            double mag = Math.Max(Math.Max(Math.Abs(a.X), Math.Abs(a.Y)), Math.Max(Math.Abs(a.Z),
                         Math.Max(Math.Max(Math.Abs(b.X), Math.Abs(b.Y)), Math.Abs(b.Z))));
            double diff = Math.Max(Math.Abs(a.X - b.X), Math.Max(Math.Abs(a.Y - b.Y), Math.Abs(a.Z - b.Z)));
            return diff == 0 ? 0 : diff / Ulp(mag);
        }

        /// <summary>Running maximum of an error measure, reported once per test.</summary>
        public sealed class Max
        {
            public double Value; public string Where = "-";
            public void Add(double v, string where) { if (v > Value) { Value = v; Where = where; } }
            public override string ToString() => $"{Value:G4} at {Where}";
        }
    }
}
