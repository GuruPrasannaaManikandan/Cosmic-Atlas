using System.Collections.Generic;

namespace CosmicAtlas.Astro
{
    // POCOs mirroring catalog.v1.json (generated from frontend/src/data/catalog.ts and solarSystem.ts).
    // Property names match the JSON keys case-insensitively, so any JSON library can bind them
    // (System.Text.Json in the tests; Newtonsoft in Unity). No serializer dependency lives in this assembly.

    public sealed class CatalogFile
    {
        public int SchemaVersion { get; set; }
        public string ContentHash { get; set; }
        public CatalogConstants Constants { get; set; }
        public Dictionary<string, PlanetElementSet> PlanetElements { get; set; }
        public Dictionary<string, PolePoint> PlanetPoles { get; set; }
        public Dictionary<string, double> PlanetRadiusKm { get; set; }
        public List<RingBand> SaturnRings { get; set; }
        public List<CosmicObject> Objects { get; set; }
        public List<SolarBody> SolarBodies { get; set; }
    }

    public sealed class CatalogConstants
    {
        public double LY_PER_PC { get; set; }
        public double LY_PER_AU { get; set; }
        public double SUN_GC_LY { get; set; }
        public double[] SUN_POS { get; set; }
        public double C_KM_S { get; set; }
        public double[][] EQ_TO_GAL { get; set; }
        public double OBLIQUITY_J2000_DEG { get; set; }
        public double KM_PER_AU { get; set; }
        public double DAYS_PER_JULIAN_YEAR { get; set; }
        public double KM_TO_LY { get; set; }
        public double JD_UNIX_EPOCH { get; set; }
        public double JD_J2000 { get; set; }
        public double MS_PER_DAY { get; set; }
        public double J2000_MS { get; set; }
        public double EPHEMERIS_VALID_FROM_MS { get; set; }
        public double EPHEMERIS_VALID_TO_MS { get; set; }
        public double MOON_DISPLAY_AU { get; set; }
        public double CHARON_PLUTO_MASS_RATIO { get; set; }
        public double SATURN_EQ_RADIUS_KM { get; set; }
    }

    public sealed class PolePoint
    {
        public double RaDeg { get; set; }
        public double DecDeg { get; set; }
        public string Source { get; set; }
    }

    public sealed class RingBand
    {
        public string Name { get; set; }
        public double InnerKm { get; set; }
        public double OuterKm { get; set; }
        public double Opacity { get; set; }
        public string Color { get; set; }
    }

    /// <summary>catalog.ts PositionSpec (a tagged union flattened into optional fields; Kind selects which apply).</summary>
    public sealed class PositionSpec
    {
        /// <summary>origin | equatorial | galactic | sun | offset | planet | moon | solar-body</summary>
        public string Kind { get; set; }
        public double? RaDeg { get; set; }
        public double? DecDeg { get; set; }
        public double? DistanceLy { get; set; }
        public double? LDeg { get; set; }
        public double? BDeg { get; set; }
        public string From { get; set; }
        public double[] XyzLy { get; set; }
        public string Body { get; set; }
        public string Parent { get; set; }
        public string Id { get; set; }
    }

    public sealed class DistanceInfo
    {
        public double ValueLy { get; set; }
        public double? UncertaintyLy { get; set; }
        public string Basis { get; set; }
    }

    public sealed class SourceRef
    {
        public string Catalogue { get; set; }
        public string Identifier { get; set; }
        public string Note { get; set; }
    }

    public sealed class LinkRef
    {
        public string Label { get; set; }
        public string Url { get; set; }
    }

    /// <summary>catalog.ts CosmicObject.</summary>
    public sealed class CosmicObject
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public List<string> Aliases { get; set; }
        public string Category { get; set; }
        public string Visual { get; set; }
        public PositionSpec Position { get; set; }
        public List<string> Parents { get; set; }
        public List<string> MemberOf { get; set; }
        public List<string> Nearby { get; set; }
        public double? ExtentLy { get; set; }
        public double? DisplayRadiusAU { get; set; }
        public DistanceInfo Distance { get; set; }
        public string Color { get; set; }
        /// <summary>curated-approximate | illustrative | computed-model | live-catalogue | user-dataset</summary>
        public string Provenance { get; set; }
        public string Confidence { get; set; }
        public SourceRef Source { get; set; }
        public string Info { get; set; }
        public Dictionary<string, string> Props { get; set; }
        public bool? Schematic { get; set; }
        public double Importance { get; set; }
        public double ViewDistanceLy { get; set; }
        public List<LinkRef> Links { get; set; }
    }

    public sealed class PhysicalData
    {
        public double MeanRadiusKm { get; set; }
        public double? RadiusSigmaKm { get; set; }
        public double[] TriaxialKm { get; set; }
        public double? GmKm3s2 { get; set; }
        public double? GmSigma { get; set; }
        public double? DensityGcc { get; set; }
        public string Source { get; set; }
        public string ShapeSource { get; set; }
    }

    public sealed class PhaseFit
    {
        public double DM0Deg { get; set; }
        public double DMdotDegPerDay { get; set; }
        public string Window { get; set; }
        public int Samples { get; set; }
        public double RmsAlongDeg { get; set; }
        public double RmsOutOfPlaneDeg { get; set; }
    }

    public sealed class OrbitSpec
    {
        public KeplerElements Elements { get; set; }
        public KeplerElements RawElements { get; set; }
        public PhaseFit PhaseFit { get; set; }
        /// <summary>body whose position is the origin of the elements ('sun' for heliocentric)</summary>
        public string Primary { get; set; }
        /// <summary>primary | barycentre</summary>
        public string Centre { get; set; }
        public string Model { get; set; }
        public string Source { get; set; }
        public string FrameLabel { get; set; }
        public string Uncertainty { get; set; }
    }

    public sealed class RotationModel
    {
        /// <summary>synchronous | synchronous-binary | spin | chaotic | unknown</summary>
        public string Kind { get; set; }
        public string Note { get; set; }
        public string Companion { get; set; }
        public double? PeriodHours { get; set; }
        public PolePoint Pole { get; set; }
        public string Source { get; set; }
    }

    public sealed class Appearance
    {
        public string Color { get; set; }
        public string Texture { get; set; }
        public string Evidence { get; set; }
        public double? Relief { get; set; }
        public string Haze { get; set; }
    }

    /// <summary>solarSystem.ts SolarBody.</summary>
    public sealed class SolarBody
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public List<string> Aliases { get; set; }
        /// <summary>moon | dwarf-planet | asteroid</summary>
        public string Cls { get; set; }
        /// <summary>physical parent: a planet id, 'pluto' or 'sun'</summary>
        public string Parent { get; set; }
        public int? NaifId { get; set; }
        public PhysicalData Physical { get; set; }
        public OrbitSpec Orbit { get; set; }
        public RotationModel Rotation { get; set; }
        public Appearance Appearance { get; set; }
        public double Importance { get; set; }
        public string Confidence { get; set; }
        public string Info { get; set; }
        public List<string> Notes { get; set; }
    }
}
