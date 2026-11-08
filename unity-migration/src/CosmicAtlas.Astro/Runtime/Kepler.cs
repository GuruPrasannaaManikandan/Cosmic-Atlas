using System;
using System.Collections.Generic;

namespace CosmicAtlas.Astro
{
    /// <summary>
    /// Element reference frame. JSON shape (catalog.v1.json): { "kind": "ecliptic" } or
    /// { "kind": "pole", "raDeg": …, "decDeg": …, "label": "Laplace plane" | "planet equator" }.
    /// </summary>
    public sealed class RefFrame
    {
        public string Kind { get; set; }
        public double? RaDeg { get; set; }
        public double? DecDeg { get; set; }
        public string Label { get; set; }

        // Cache of frameToGalactic (kepler.ts caches by object identity; so does this). Not serialised.
        internal Mat3d? CachedToGalactic;

        public bool IsEcliptic => Kind == "ecliptic";
        public bool IsPole => Kind == "pole";
    }

    /// <summary>Port of the KeplerElements interface in kepler.ts (property names match the JSON keys).</summary>
    public sealed class KeplerElements
    {
        /// <summary>semi-major axis, km</summary>
        public double AKm { get; set; }
        public double E { get; set; }
        public double IDeg { get; set; }
        /// <summary>longitude of ascending node Ω at epoch</summary>
        public double NodeDeg { get; set; }
        /// <summary>argument of periapsis ω at epoch</summary>
        public double ArgPeriDeg { get; set; }
        /// <summary>mean anomaly at epoch</summary>
        public double MeanAnomalyDeg { get; set; }
        /// <summary>epoch, Julian Date TDB</summary>
        public double EpochJd { get; set; }
        /// <summary>rate of the mean anomaly, deg/day</summary>
        public double MeanMotionDegPerDay { get; set; }
        /// <summary>secular rate of ω, deg/day (absent = 0)</summary>
        public double? ArgPeriRateDegPerDay { get; set; }
        /// <summary>secular rate of Ω, deg/day (absent = 0)</summary>
        public double? NodeRateDegPerDay { get; set; }
        public RefFrame Frame { get; set; }
    }

    public sealed class OrbitElementsException : Exception
    {
        public OrbitElementsException(string message) : base(message) { }
    }

    public struct OrbitAngles
    {
        public double Node, ArgP, M, I;
    }

    /// <summary>
    /// Shared two-body (Keplerian) engine. Port of frontend/src/astro/kepler.ts with the same iteration limits,
    /// tolerances and floating-point operation order (verified by parity fixtures, see CosmicAtlas.Astro.Tests).
    /// </summary>
    public static class Kepler
    {
        const double D2R = AstroConstants.D2R;
        const double TAU = AstroConstants.TAU;

        /// <summary>Returns a list of problems (empty when usable). Never guesses missing values.</summary>
        public static List<string> ValidateElements(KeplerElements el)
        {
            var errs = new List<string>();
            if (el == null) { errs.Add("elements missing"); return errs; }
            void Finite(string name, double v) { if (double.IsNaN(v) || double.IsInfinity(v)) errs.Add(name + " missing or not finite"); }
            Finite("aKm", el.AKm); Finite("e", el.E); Finite("iDeg", el.IDeg); Finite("nodeDeg", el.NodeDeg);
            Finite("argPeriDeg", el.ArgPeriDeg); Finite("meanAnomalyDeg", el.MeanAnomalyDeg); Finite("epochJd", el.EpochJd);
            Finite("meanMotionDegPerDay", el.MeanMotionDegPerDay);
            if (!(el.AKm > 0)) errs.Add("aKm must be > 0");
            if (!(el.E >= 0 && el.E < 1)) errs.Add("e must be in [0, 1) (closed orbits only)");
            if (!(el.IDeg >= 0 && el.IDeg <= 180)) errs.Add("iDeg must be in [0, 180]");
            if (!(el.MeanMotionDegPerDay > 0)) errs.Add("mean motion must be > 0");
            if (el.ArgPeriRateDegPerDay.HasValue && !IsFinite(el.ArgPeriRateDegPerDay.Value)) errs.Add("argPeriRateDegPerDay not finite");
            if (el.NodeRateDegPerDay.HasValue && !IsFinite(el.NodeRateDegPerDay.Value)) errs.Add("nodeRateDegPerDay not finite");
            if (el.Frame == null || (!el.Frame.IsEcliptic && !el.Frame.IsPole)) errs.Add("frame missing");
            else if (el.Frame.IsPole && !(el.Frame.RaDeg.HasValue && el.Frame.DecDeg.HasValue && IsFinite(el.Frame.RaDeg.Value) && IsFinite(el.Frame.DecDeg.Value)))
                errs.Add("frame pole not finite");
            return errs;
        }

        public static void AssertValidElements(KeplerElements el, string who = "body")
        {
            var errs = ValidateElements(el);
            if (errs.Count > 0) throw new OrbitElementsException(who + ": invalid orbital elements: " + string.Join("; ", errs));
        }

        static bool IsFinite(double v) => !double.IsNaN(v) && !double.IsInfinity(v);

        /// <summary>Wrap to (−π, π].</summary>
        static double WrapPi(double x)
        {
            double y = ((x + Math.PI) % TAU + TAU) % TAU - Math.PI;
            return y == -Math.PI ? Math.PI : y;
        }

        /// <summary>Kepler's equation M = E − e sin E for 0 ≤ e &lt; 1: Newton–Raphson, bisection fallback.</summary>
        public static double SolveKeplerStable(double mRad, double e)
        {
            if (!(e >= 0 && e < 1)) throw new OrbitElementsException("eccentricity " + e + " outside [0,1)");
            double M = WrapPi(mRad);
            if (e == 0) return M;
            double E = e < 0.8 ? M + e * Math.Sin(M) : M >= 0 ? Math.PI : -Math.PI;
            for (int k = 0; k < 50; k++)
            {
                double f = E - e * Math.Sin(E) - M;
                double d = f / (1 - e * Math.Cos(E));
                E -= d;
                if (Math.Abs(d) < 1e-14) return E;
            }
            double lo = -Math.PI, hi = Math.PI;
            for (int k = 0; k < 200; k++)
            {
                double mid = 0.5 * (lo + hi);
                if (mid - e * Math.Sin(mid) - M > 0) hi = mid;
                else lo = mid;
            }
            return 0.5 * (lo + hi);
        }

        /// <summary>3×3 matrix taking a vector in the element reference frame to galactic (root-frame) axes.</summary>
        public static Mat3d FrameToGalactic(RefFrame frame)
        {
            if (frame.CachedToGalactic.HasValue) return frame.CachedToGalactic.Value;
            double t00, t01, t02, t10, t11, t12, t20, t21, t22;
            if (frame.IsEcliptic)
            {
                double ep = AstroConstants.OBLIQUITY_J2000_DEG * D2R, c = Math.Cos(ep), s = Math.Sin(ep);
                t00 = 1; t01 = 0; t02 = 0;
                t10 = 0; t11 = c; t12 = -s;
                t20 = 0; t21 = s; t22 = c;
            }
            else if (frame.IsPole)
            {
                double a = frame.RaDeg.Value * D2R, d = frame.DecDeg.Value * D2R;
                double p0 = Math.Cos(d) * Math.Cos(a), p1 = Math.Cos(d) * Math.Sin(a), p2 = Math.Sin(d);
                double n0 = -Math.Sin(a), n1 = Math.Cos(a), n2 = 0; // ascending node of the plane on the ICRF equator
                double y0 = p1 * n2 - p2 * n1, y1 = p2 * n0 - p0 * n2, y2 = p0 * n1 - p1 * n0;
                t00 = n0; t01 = y0; t02 = p0;
                t10 = n1; t11 = y1; t12 = p1;
                t20 = n2; t21 = y2; t22 = p2;
            }
            else throw new OrbitElementsException("unknown frame kind " + frame.Kind);

            var G = AstroConstants.EQ_TO_GAL;
            double Cell(int r, double c0, double c1, double c2) => G[r, 0] * c0 + G[r, 1] * c1 + G[r, 2] * c2;
            var m = new Mat3d(
                Cell(0, t00, t10, t20), Cell(0, t01, t11, t21), Cell(0, t02, t12, t22),
                Cell(1, t00, t10, t20), Cell(1, t01, t11, t21), Cell(1, t02, t12, t22),
                Cell(2, t00, t10, t20), Cell(2, t01, t11, t21), Cell(2, t02, t12, t22));
            frame.CachedToGalactic = m;
            return m;
        }

        /// <summary>Angles (radians) at a given JD, including secular precession.</summary>
        public static OrbitAngles AnglesAt(KeplerElements el, double jd)
        {
            double dd = jd - el.EpochJd;
            return new OrbitAngles
            {
                Node = (el.NodeDeg + (el.NodeRateDegPerDay ?? 0) * dd) * D2R,
                ArgP = (el.ArgPeriDeg + (el.ArgPeriRateDegPerDay ?? 0) * dd) * D2R,
                M = (el.MeanAnomalyDeg + el.MeanMotionDegPerDay * dd) * D2R,
                I = el.IDeg * D2R,
            };
        }

        static (double x, double y) PlaneFromE(double aKm, double e, double E) =>
            (aKm * (Math.Cos(E) - e), aKm * Math.Sqrt(1 - e * e) * Math.Sin(E));

        /// <summary>Orbital plane → element reference frame (Rz(Ω)·Rx(i)·Rz(ω)) → galactic axes.</summary>
        internal static Vec3d PlaneToFrame(double x, double y, double argp, double node, double i)
        {
            double cw = Math.Cos(argp), sw = Math.Sin(argp), cn = Math.Cos(node), sn = Math.Sin(node), ci = Math.Cos(i), si = Math.Sin(i);
            return new Vec3d(
                (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y,
                (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y,
                sw * si * x + cw * si * y);
        }

        /// <summary>Position relative to the primary (km, galactic axes) at Julian Date jd (TDB).</summary>
        public static Vec3d PositionAtJd(KeplerElements el, double jd)
        {
            var ang = AnglesAt(el, jd);
            double E = SolveKeplerStable(ang.M, el.E);
            var (x, y) = PlaneFromE(el.AKm, el.E, E);
            return FrameToGalactic(el.Frame).Mul(PlaneToFrame(x, y, ang.ArgP, ang.Node, ang.I));
        }

        /// <summary>Position relative to the primary (km, galactic axes) at a UTC millisecond timestamp. Deterministic.</summary>
        public static Vec3d PositionAtMs(KeplerElements el, double ms) => PositionAtJd(el, AstroTime.JdTdbFromUtcMs(ms));

        /// <summary>Unit orbit normal (angular-momentum direction) in galactic axes at the given time.</summary>
        public static Vec3d OrbitNormalAtMs(KeplerElements el, double ms)
        {
            var ang = AnglesAt(el, AstroTime.JdTdbFromUtcMs(ms));
            double ci = Math.Cos(ang.I), si = Math.Sin(ang.I), cn = Math.Cos(ang.Node), sn = Math.Sin(ang.Node);
            return FrameToGalactic(el.Frame).Mul(new Vec3d(si * sn, -si * cn, ci));
        }

        /// <summary>Closed orbit polyline (km, galactic axes, relative to the primary), uniform in eccentric anomaly.</summary>
        public static Vec3d[] OrbitPathKm(KeplerElements el, double ms, int n = 256)
        {
            var ang = AnglesAt(el, AstroTime.JdTdbFromUtcMs(ms));
            var F = FrameToGalactic(el.Frame);
            var output = new Vec3d[n + 1];
            for (int k = 0; k <= n; k++)
            {
                var (x, y) = PlaneFromE(el.AKm, el.E, ((double)k / n) * TAU);
                output[k] = F.Mul(PlaneToFrame(x, y, ang.ArgP, ang.Node, ang.I));
            }
            return output;
        }

        public static double PeriodDays(KeplerElements el) => 360 / el.MeanMotionDegPerDay;
        public static double PeriapsisKm(KeplerElements el) => el.AKm * (1 - el.E);
        public static double ApoapsisKm(KeplerElements el) => el.AKm * (1 + el.E);

        /// <summary>JPL SSD satellite-table row → engine rates (see kepler.ts jplSatelliteRates for the sign convention).</summary>
        public static (double meanMotionDegPerDay, double argPeriRateDegPerDay, double nodeRateDegPerDay) JplSatelliteRates(
            double iDeg, double periodDays, double? apsisPeriodYr, double? nodePeriodYr)
        {
            // JS truthiness: null, undefined and 0 all mean "not modelled".
            double argRate = apsisPeriodYr.HasValue && apsisPeriodYr.Value != 0 ? 360 / (apsisPeriodYr.Value * AstroConstants.DAYS_PER_JULIAN_YEAR) : 0;
            double nodeMag = nodePeriodYr.HasValue && nodePeriodYr.Value != 0 ? 360 / (nodePeriodYr.Value * AstroConstants.DAYS_PER_JULIAN_YEAR) : 0;
            bool retro = iDeg > 90;
            return (360 / periodDays - argRate + nodeMag, argRate, retro ? nodeMag : -nodeMag);
        }
    }
}
