using System;
using System.Collections.Generic;

namespace CosmicAtlas.Astro
{
    /// <summary>
    /// Indexed, loaded catalogue plus position resolution.
    ///
    /// Two position APIs exist on purpose:
    ///   * <see cref="PositionOfRootLy"/> / <see cref="SolarBodyRootPosLy"/> reproduce the TS app's single galactic-centre
    ///     frame (catalog.ts positionOf / solarBodyRootPos) with the same operation order, so parity can be checked.
    ///     They inherit the ~34 km quantisation near the Sun (blueprint finding D1) and must not drive rendering.
    ///   * <see cref="Frames"/> (<see cref="SolarSystemFrames"/>) is the hierarchical km model Unity will render from.
    /// </summary>
    public sealed class AstroCatalog
    {
        public CatalogFile Data { get; }
        public IReadOnlyDictionary<string, CosmicObject> ById => _byId;
        public IReadOnlyDictionary<string, SolarBody> SolarById => _solarById;
        public SolarSystemFrames Frames { get; }

        readonly Dictionary<string, CosmicObject> _byId = new Dictionary<string, CosmicObject>();
        readonly Dictionary<string, SolarBody> _solarById = new Dictionary<string, SolarBody>();

        public double CharonPlutoMassRatio { get; }

        public AstroCatalog(CatalogFile data)
        {
            Data = data ?? throw new ArgumentNullException(nameof(data));
            if (data.SchemaVersion != 1) throw new NotSupportedException("catalog schemaVersion " + data.SchemaVersion + " (expected 1)");
            foreach (var o in data.Objects)
            {
                if (_byId.ContainsKey(o.Id)) throw new InvalidOperationException("duplicate object id " + o.Id);
                _byId[o.Id] = o;
            }
            foreach (var b in data.SolarBodies) _solarById[b.Id] = b;
            if (!_solarById.ContainsKey("pluto") || !_solarById.ContainsKey("charon"))
                throw new InvalidOperationException("catalog must contain pluto and charon (barycentre model)");
            CharonPlutoMassRatio = data.Constants.CHARON_PLUTO_MASS_RATIO;
            Frames = new SolarSystemFrames(this);
        }

        public PlanetElementSet PlanetElements(string planetId)
        {
            if (!Data.PlanetElements.TryGetValue(planetId, out var s)) throw new KeyNotFoundException("No elements for " + planetId);
            return s;
        }

        public bool IsPlanet(string id) => Data.PlanetElements.ContainsKey(id);

        static Vec3d Add(Vec3d a, Vec3d b) => a + b;
        static Vec3d Scale(Vec3d a, double k) => a * k;

        /// <summary>catalog.ts solarBodyRootPos — legacy root-frame (galactic ly) position, same operation order.</summary>
        public Vec3d SolarBodyRootPosLy(SolarBody b, double ms)
        {
            const double KM_TO_LY = AstroConstants.KM_TO_LY;
            double q = CharonPlutoMassRatio;
            var sun = AstroConstants.SUN_POS;
            var pluto = _solarById["pluto"];
            var charon = _solarById["charon"];
            if (b.Parent == "sun")
            {
                if (b.Id == "pluto")
                {
                    var bary = Add(sun, Scale(Kepler.PositionAtMs(pluto.Orbit.Elements, ms), KM_TO_LY));
                    var charonRel = Kepler.PositionAtMs(charon.Orbit.Elements, ms);
                    var plutoOffset = Scale(charonRel, (-q / (1 + q)) * KM_TO_LY);
                    return Add(bary, plutoOffset);
                }
                return Add(sun, Scale(Kepler.PositionAtMs(b.Orbit.Elements, ms), KM_TO_LY));
            }
            if (b.Parent == "pluto")
            {
                var bary = Add(sun, Scale(Kepler.PositionAtMs(pluto.Orbit.Elements, ms), KM_TO_LY));
                if (b.Id == "charon")
                {
                    var charonRel = Kepler.PositionAtMs(b.Orbit.Elements, ms);
                    return Add(bary, Scale(charonRel, (1 / (1 + q)) * KM_TO_LY));
                }
                return Add(bary, Scale(Kepler.PositionAtMs(b.Orbit.Elements, ms), KM_TO_LY));
            }
            var planetPos = PlanetEphemeris.PlanetRootPos(PlanetElements(b.Parent), ms);
            return Add(planetPos, Scale(Kepler.PositionAtMs(b.Orbit.Elements, ms), KM_TO_LY));
        }

        /// <summary>catalog.ts positionOf — legacy root-frame (galactic ly) position. Time-dependent for dynamic bodies.</summary>
        public Vec3d PositionOfRootLy(CosmicObject o, double ms)
        {
            var p = o.Position;
            switch (p.Kind)
            {
                case "origin": return Vec3d.Zero;
                case "sun": return AstroConstants.SUN_POS;
                case "planet": return PlanetEphemeris.PlanetRootPos(PlanetElements(p.Body), ms);
                case "moon":
                    if (_solarById.TryGetValue("moon", out var moon)) return SolarBodyRootPosLy(moon, ms);
                    return PlanetEphemeris.PlanetRootPos(PlanetElements(p.Parent), ms)
                           + PlanetEphemeris.MoonOffsetLy(ms, Data.Constants.MOON_DISPLAY_AU);
                case "solar-body":
                    return _solarById.TryGetValue(p.Id, out var b) ? SolarBodyRootPosLy(b, ms) : AstroConstants.SUN_POS;
                case "offset":
                    if (o.Id == "local-group")
                    {
                        // schematic barycentre-ish (as in catalog.ts): 0.4 × M31's root position
                        var m31 = PositionOfRootLy(_byId["andromeda"], ms);
                        return new Vec3d(m31.X * 0.4, m31.Y * 0.4, m31.Z * 0.4);
                    }
                    return PositionOfRootLy(_byId[p.From], ms);
                case "equatorial":
                    return Coords.RaDecDistToRoot(p.RaDeg.Value, p.DecDeg.Value, p.DistanceLy.Value);
                case "galactic":
                    return Coords.SunRelativeToRoot(Coords.GalacticLBToUnit(p.LDeg.Value, p.BDeg.Value), p.DistanceLy.Value);
                default:
                    throw new NotSupportedException("position kind " + p.Kind);
            }
        }

        public static bool IsDynamic(CosmicObject o) =>
            o.Position.Kind == "planet" || o.Position.Kind == "moon" || o.Position.Kind == "solar-body";
    }
}
