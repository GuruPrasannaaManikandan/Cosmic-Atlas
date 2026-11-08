using System;

namespace CosmicAtlas.Astro
{
    /// <summary>One row of JPL "Approximate Positions of the Planets" Table 1. JSON keys: a, e, I, L, w, node.</summary>
    public sealed class PlanetElements
    {
        public double A { get; set; }
        public double E { get; set; }
        public double I { get; set; }
        public double L { get; set; }
        public double W { get; set; }
        public double Node { get; set; }
    }

    public sealed class PlanetElementSet
    {
        public PlanetElements El { get; set; }
        public PlanetElements Rate { get; set; }
    }

    /// <summary>
    /// Port of frontend/src/astro/ephemeris.ts (approximate Keplerian planets, valid 1800–2050; arcminute-level accuracy).
    /// Element values are not hard-coded here: they come from catalog.v1.json (planetElements), exported from the TS source.
    /// </summary>
    public static class PlanetEphemeris
    {
        const double D2R = AstroConstants.D2R;

        public static readonly double J2000_MS = AstroTime.UtcMs(2000, 0, 1, 12, 0, 0);
        public static readonly double VALID_FROM = AstroTime.UtcMs(1800, 0, 1);
        public static readonly double VALID_TO = AstroTime.UtcMs(2050, 11, 31);
        public const double MS_PER_DAY = 86400000;

        public static double CenturiesSinceJ2000(double ms) => (ms - J2000_MS) / (MS_PER_DAY * 36525);

        /// <summary>The ephemeris module's own Kepler solver (distinct from <see cref="Kepler.SolveKeplerStable"/>; kept for parity).</summary>
        public static double SolveKepler(double M, double e)
        {
            double Ea = e < 0.8 ? M : Math.PI;
            for (int i = 0; i < 30; i++)
            {
                double d = (Ea - e * Math.Sin(Ea) - M) / (1 - e * Math.Cos(Ea));
                Ea -= d;
                if (Math.Abs(d) < 1e-12) break;
            }
            return Ea;
        }

        /// <summary>Heliocentric ecliptic J2000 position in AU.</summary>
        public static Vec3d PlanetEclipticAU(PlanetElementSet s, double ms)
        {
            if (s == null) throw new ArgumentNullException(nameof(s));
            double T = CenturiesSinceJ2000(ms);
            double a = s.El.A + s.Rate.A * T;
            double e = s.El.E + s.Rate.E * T;
            double I = (s.El.I + s.Rate.I * T) * D2R;
            double L = s.El.L + s.Rate.L * T;
            double w = s.El.W + s.Rate.W * T; // longitude of perihelion
            double node = (s.El.Node + s.Rate.Node * T) * D2R;
            double M = ((((L - w) % 360) + 540) % 360 - 180) * D2R;
            double Ea = SolveKepler(M, e);
            double xp = a * (Math.Cos(Ea) - e);
            double yp = a * Math.Sqrt(1 - e * e) * Math.Sin(Ea);
            double om = w * D2R - node; // argument of perihelion
            return Kepler.PlaneToFrame(xp, yp, om, node, I);
        }

        /// <summary>Heliocentric position (galactic axes, ly) relative to the Sun.</summary>
        public static Vec3d PlanetOffsetLy(PlanetElementSet s, double ms)
        {
            var p = Coords.EclipticToGalactic(PlanetEclipticAU(s, ms));
            return new Vec3d(p.X * AstroConstants.LY_PER_AU, p.Y * AstroConstants.LY_PER_AU, p.Z * AstroConstants.LY_PER_AU);
        }

        /// <summary>Root-frame position (ly). Legacy single-frame semantics, kept for parity with the TS app.</summary>
        public static Vec3d PlanetRootPos(PlanetElementSet s, double ms)
        {
            var o = PlanetOffsetLy(s, ms);
            var sun = AstroConstants.SUN_POS;
            return new Vec3d(sun.X + o.X, sun.Y + o.Y, sun.Z + o.Z);
        }

        /// <summary>Heliocentric position (galactic axes, km). New in the port: no light-year round trip.</summary>
        public static Vec3d PlanetHeliocentricKm(PlanetElementSet s, double ms) =>
            Coords.EclipticToGalactic(PlanetEclipticAU(s, ms)) * AstroConstants.KM_PER_AU;

        /// <summary>Simplified Moon (circular, 27.3217 d, 5.145° inclination). Only a fallback in the TS app.</summary>
        public static Vec3d MoonOffsetLy(double ms, double displayAU)
        {
            double ph = 2 * Math.PI * ((((ms - J2000_MS) / MS_PER_DAY) / 27.321661) % 1);
            double inc = 5.145 * D2R;
            var ecl = new Vec3d(Math.Cos(ph) * displayAU, Math.Sin(ph) * Math.Cos(inc) * displayAU, Math.Sin(ph) * Math.Sin(inc) * displayAU);
            var g = Coords.EclipticToGalactic(ecl);
            return new Vec3d(g.X * AstroConstants.LY_PER_AU, g.Y * AstroConstants.LY_PER_AU, g.Z * AstroConstants.LY_PER_AU);
        }

        public static bool IsModelRange(double ms) => ms >= VALID_FROM && ms <= VALID_TO;
    }
}
