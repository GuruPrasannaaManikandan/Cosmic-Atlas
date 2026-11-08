using System;

namespace CosmicAtlas.Astro
{
    /// <summary>
    /// Constants and frame transforms. Port of frontend/src/astro/coords.ts (+ KM_PER_AU from kepler.ts, KM_TO_LY from catalog.ts).
    /// ROOT FRAME: galactic Cartesian, light-years, origin = Galactic Centre, +X toward l=0,b=0, +Y toward l=90°, +Z toward the NGP.
    /// </summary>
    public static class AstroConstants
    {
        public const double LY_PER_PC = 3.2615637771674337;
        public const double LY_PER_AU = 1.5812507409819728e-5;
        public const double SUN_GC_LY = 26673;
        public static readonly Vec3d SUN_POS = new Vec3d(-SUN_GC_LY, 0, 0);
        public const double C_KM_S = 299792.458;
        public const double OBLIQUITY_J2000_DEG = 23.4392911;
        public const double KM_PER_AU = 149597870.7;
        public const double DAYS_PER_JULIAN_YEAR = 365.25;

        /// <summary>catalog.ts: KM_TO_LY = LY_PER_AU / KM_PER_AU. The single km→ly constant of the port (see blueprint D6).</summary>
        public const double KM_TO_LY = LY_PER_AU / KM_PER_AU;

        /// <summary>J2000 equatorial (ICRS) → galactic rotation (Hipparcos documentation, ESA 1997).</summary>
        public static readonly Mat3d EQ_TO_GAL = new Mat3d(
            -0.0548755604, -0.8734370902, -0.4838350155,
            0.4941094279, -0.44482963, 0.7469822445,
            -0.867666149, -0.1980763734, 0.4559837762);

        public const double D2R = Math.PI / 180;
        public const double TAU = Math.PI * 2;
    }

    public static class Coords
    {
        const double D2R = AstroConstants.D2R;

        /// <summary>Unit vector (equatorial J2000) for RA/Dec in degrees.</summary>
        public static Vec3d RaDecToUnit(double raDeg, double decDeg)
        {
            double a = raDeg * D2R;
            double d = decDeg * D2R;
            return new Vec3d(Math.Cos(d) * Math.Cos(a), Math.Cos(d) * Math.Sin(a), Math.Sin(d));
        }

        public static Vec3d EquatorialToGalactic(Vec3d v) => AstroConstants.EQ_TO_GAL.Mul(v);

        public static Vec3d GalacticLBToUnit(double lDeg, double bDeg)
        {
            double l = lDeg * D2R;
            double b = bDeg * D2R;
            return new Vec3d(Math.Cos(b) * Math.Cos(l), Math.Cos(b) * Math.Sin(l), Math.Sin(b));
        }

        public static (double l, double b) UnitToGalacticLB(Vec3d v)
        {
            double l = ((Math.Atan2(v.Y, v.X) / D2R) + 360) % 360;
            double b = Math.Asin(Math.Max(-1, Math.Min(1, v.Z))) / D2R;
            return (l, b);
        }

        /// <summary>Heliocentric direction + distance → root-frame position (ly).</summary>
        public static Vec3d SunRelativeToRoot(Vec3d unitGal, double distanceLy)
        {
            var s = AstroConstants.SUN_POS;
            return new Vec3d(s.X + unitGal.X * distanceLy, s.Y + unitGal.Y * distanceLy, s.Z + unitGal.Z * distanceLy);
        }

        public static Vec3d RaDecDistToRoot(double raDeg, double decDeg, double distanceLy) =>
            SunRelativeToRoot(EquatorialToGalactic(RaDecToUnit(raDeg, decDeg)), distanceLy);

        /// <summary>Ecliptic J2000 vector → galactic vector (same origin).</summary>
        public static Vec3d EclipticToGalactic(Vec3d v)
        {
            double e = AstroConstants.OBLIQUITY_J2000_DEG * D2R;
            var eq = new Vec3d(v.X, v.Y * Math.Cos(e) - v.Z * Math.Sin(e), v.Y * Math.Sin(e) + v.Z * Math.Cos(e));
            return EquatorialToGalactic(eq);
        }
    }

    /// <summary>
    /// Axis conventions (blueprint §6.4). Galactic and Three.js render frames are right-handed; Unity is left-handed, Y-up.
    ///   Three.js render = (X, Z, −Y)_gal          (coords.ts toThree)
    ///   Unity           = (X, Z,  Y)_gal          (one axis swap flips handedness)
    ///   Unity           = Three.js with Z negated (mirror), so rotations map as q' = (−qx, −qy, qz, qw)
    /// </summary>
    public static class AxisMapping
    {
        public static Vec3d GalacticToUnity(Vec3d g) => new Vec3d(g.X, g.Z, g.Y);
        public static Vec3d UnityToGalactic(Vec3d u) => new Vec3d(u.X, u.Z, u.Y);
        public static Vec3d GalacticToThree(Vec3d g) => new Vec3d(g.X, g.Z, -g.Y);
        public static Vec3d ThreeToGalactic(Vec3d t) => new Vec3d(t.X, -t.Z, t.Y);
        public static Vec3d ThreeToUnity(Vec3d t) => new Vec3d(t.X, t.Y, -t.Z);
        public static QuaternionD ThreeToUnity(QuaternionD q) => new QuaternionD(-q.X, -q.Y, q.Z, q.W);
    }
}
