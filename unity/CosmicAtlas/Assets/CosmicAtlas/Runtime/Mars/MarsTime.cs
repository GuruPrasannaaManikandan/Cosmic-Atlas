using System;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// Mars solar time and Sun position — C# port of frontend/src/realism/marsTime.ts, which follows the NASA GISS Mars24
    /// algorithm (https://www.giss.nasa.gov/tools/mars24/help/algorithm.html; Allison &amp; McEwen 2000, Allison 1997).
    /// Steps A-1 … D-6 as on that page; verified against both worked examples (MarsTimeTests, and marsTime.test.ts).
    /// Longitudes in the public API are EAST-positive; latitudes planetographic (as Mars24).
    /// </summary>
    public readonly struct MarsTime
    {
        const double Deg = Math.PI / 180.0;

        // TAI − UTC from IERS Bulletin C, as in NAIF naif0012.tls (no leap seconds after 2017-01-01).
        static readonly (DateTime from, double s)[] Leap =
        {
            (new DateTime(1972, 1, 1), 10), (new DateTime(1972, 7, 1), 11), (new DateTime(1973, 1, 1), 12), (new DateTime(1974, 1, 1), 13),
            (new DateTime(1975, 1, 1), 14), (new DateTime(1976, 1, 1), 15), (new DateTime(1977, 1, 1), 16), (new DateTime(1978, 1, 1), 17),
            (new DateTime(1979, 1, 1), 18), (new DateTime(1980, 1, 1), 19), (new DateTime(1981, 7, 1), 20), (new DateTime(1982, 7, 1), 21),
            (new DateTime(1983, 7, 1), 22), (new DateTime(1985, 7, 1), 23), (new DateTime(1988, 1, 1), 24), (new DateTime(1990, 1, 1), 25),
            (new DateTime(1991, 1, 1), 26), (new DateTime(1992, 7, 1), 27), (new DateTime(1993, 7, 1), 28), (new DateTime(1994, 7, 1), 29),
            (new DateTime(1996, 1, 1), 30), (new DateTime(1997, 7, 1), 31), (new DateTime(1999, 1, 1), 32), (new DateTime(2006, 1, 1), 33),
            (new DateTime(2009, 1, 1), 34), (new DateTime(2012, 7, 1), 35), (new DateTime(2015, 7, 1), 36), (new DateTime(2017, 1, 1), 37),
        };

        public readonly double JdUT, JdTT, DtJ2000, M, AlphaFMS, PBS, NuMinusM, Ls, EotDeg, Msd, MstH, SubsolarLonWest, Declination, HelioDistAU;

        static double Mod(double x, double m) => ((x % m) + m) % m;

        public static double TtMinusUtc(DateTime utc)
        {
            if (utc < Leap[0].from)
            {
                double T = (2440587.5 + (utc - new DateTime(1970, 1, 1)).TotalDays - 2451545.0) / 36525.0;
                return 64.184 + 59 * T - 51.2 * T * T - 67.1 * T * T * T - 16.4 * T * T * T * T;
            }
            double tai = Leap[0].s;
            foreach (var l in Leap) if (utc >= l.from) tai = l.s;
            return tai + 32.184;
        }

        public MarsTime(DateTime utc)
        {
            utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
            JdUT = 2440587.5 + (utc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds / 8.64e7; // A-2
            JdTT = JdUT + TtMinusUtc(utc) / 86400.0; // A-5
            DtJ2000 = JdTT - 2451545.0; // A-6
            double m = 19.3871 + 0.52402073 * DtJ2000; // B-1
            double a = 270.3871 + 0.524038496 * DtJ2000; // B-2
            double[,] P = { { 0.0071, 2.2353, 49.409 }, { 0.0057, 2.7543, 168.173 }, { 0.0039, 1.1177, 191.837 }, { 0.0037, 15.7866, 21.736 },
                            { 0.0021, 2.1354, 15.704 }, { 0.0020, 2.4694, 95.528 }, { 0.0018, 32.8493, 49.095 } };
            double pbs = 0;
            for (int i = 0; i < 7; i++) pbs += P[i, 0] * Math.Cos((0.985626 * DtJ2000 / P[i, 1] + P[i, 2]) * Deg); // B-3
            double mr = m * Deg;
            double nu = (10.691 + 3.0e-7 * DtJ2000) * Math.Sin(mr) + 0.623 * Math.Sin(2 * mr) + 0.05 * Math.Sin(3 * mr)
                        + 0.005 * Math.Sin(4 * mr) + 0.0005 * Math.Sin(5 * mr) + pbs; // B-4
            double ls = Mod(a + nu, 360); // B-5
            double l = ls * Deg;
            double eot = 2.861 * Math.Sin(2 * l) - 0.071 * Math.Sin(4 * l) + 0.002 * Math.Sin(6 * l) - nu; // C-1
            double msd = (JdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626; // C-2
            M = Mod(m, 360); AlphaFMS = Mod(a, 360); PBS = pbs; NuMinusM = nu; Ls = ls; EotDeg = eot; Msd = msd;
            MstH = Mod(24 * msd, 24);
            SubsolarLonWest = Mod(MstH * 15 + eot + 180, 360); // C-5
            Declination = Math.Asin(0.42565 * Math.Sin(l)) / Deg + 0.25 * Math.Sin(l); // D-1
            HelioDistAU = 1.52367934 * (1.00436 - 0.09309 * Math.Cos(mr) - 0.004336 * Math.Cos(2 * mr) - 0.00031 * Math.Cos(3 * mr) - 0.00003 * Math.Cos(4 * mr)); // D-2
        }

        /// <summary>C-3 Local Mean Solar Time (hours) at an east longitude.</summary>
        public double LmstHours(double lonEastDeg) => Mod(MstH - Mod(-lonEastDeg, 360) / 15.0, 24);

        /// <summary>C-4 Local True Solar Time (hours).</summary>
        public double LtstHours(double lonEastDeg) => Mod(LmstHours(lonEastDeg) + EotDeg / 15.0, 24);

        /// <summary>D-5 / D-6: solar zenith, azimuth (clockwise from north) and the ENU unit vector to the Sun.</summary>
        public void Sun(double latDeg, double lonEastDeg, out double zenith, out double azimuth, out double e, out double n, out double u)
        {
            double H = (Mod(-lonEastDeg, 360) - SubsolarLonWest) * Deg;
            double phi = latDeg * Deg, d = Declination * Deg;
            zenith = Math.Acos(Math.Sin(d) * Math.Sin(phi) + Math.Cos(d) * Math.Cos(phi) * Math.Cos(H)) / Deg;
            azimuth = Mod(Math.Atan2(Math.Sin(H), Math.Cos(phi) * Math.Tan(d) - Math.Sin(phi) * Math.Cos(H)) / Deg, 360);
            double el = (90 - zenith) * Deg, az = azimuth * Deg;
            e = Math.Cos(el) * Math.Sin(az); n = Math.Cos(el) * Math.Cos(az); u = Math.Sin(el);
        }

        /// <summary>
        /// UTC at which the Local True Solar Time at a site reaches <paramref name="ltstH"/> on the Earth date given
        /// (searched within that UTC day; Mars sols are 24 h 39 m, so at most one or two crossings exist).
        /// </summary>
        public static DateTime UtcForLtst(DateTime utcDate, double lonEastDeg, double ltstH)
        {
            var t0 = new DateTime(utcDate.Year, utcDate.Month, utcDate.Day, 0, 0, 0, DateTimeKind.Utc);
            DateTime best = t0; double bestErr = double.MaxValue;
            for (int k = 0; k <= 24 * 60; k += 2)
            {
                var t = t0.AddMinutes(k);
                double d = Math.Abs(Mod(new MarsTime(t).LtstHours(lonEastDeg) - ltstH + 12, 24) - 12);
                if (d < bestErr) { bestErr = d; best = t; }
            }
            return best;
        }
    }
}
