using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace CosmicAtlas.Astro
{
    /// <summary>
    /// Port of frontend/src/astro/time.ts. Simulation time is UTC milliseconds since the Unix epoch held in a double,
    /// exactly as the JS app holds it (integers are exact up to 2^53 ms ≈ 285,000 years). TDB ≈ TT (&lt; 2 ms difference).
    /// </summary>
    public static class AstroTime
    {
        public const double MS_PER_DAY = 86400000;
        public const double JD_UNIX_EPOCH = 2440587.5;
        public const double JD_J2000 = 2451545.0;

        static readonly DateTime UnixEpoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        /// <summary>Equivalent of JS Date.UTC(year, monthIndex0, day, h, m, s, ms) for in-range calendar values.</summary>
        public static double UtcMs(int year, int monthIndex0, int day, int hour = 0, int minute = 0, int second = 0, int ms = 0)
        {
            var dt = new DateTime(year, monthIndex0 + 1, 1, 0, 0, 0, DateTimeKind.Utc)
                .AddDays(day - 1).AddHours(hour).AddMinutes(minute).AddSeconds(second).AddMilliseconds(ms);
            return (dt - UnixEpoch).Ticks / (double)TimeSpan.TicksPerMillisecond;
        }

        // IERS leap seconds: [UTC ms when it takes effect, TAI − UTC in seconds]. No leap second scheduled after 2017.
        static readonly (double t, double v)[] Leap =
        {
            (UtcMs(1972, 0, 1), 10), (UtcMs(1972, 6, 1), 11), (UtcMs(1973, 0, 1), 12), (UtcMs(1974, 0, 1), 13),
            (UtcMs(1975, 0, 1), 14), (UtcMs(1976, 0, 1), 15), (UtcMs(1977, 0, 1), 16), (UtcMs(1978, 0, 1), 17),
            (UtcMs(1979, 0, 1), 18), (UtcMs(1980, 0, 1), 19), (UtcMs(1981, 6, 1), 20), (UtcMs(1982, 6, 1), 21),
            (UtcMs(1983, 6, 1), 22), (UtcMs(1985, 6, 1), 23), (UtcMs(1988, 0, 1), 24), (UtcMs(1990, 0, 1), 25),
            (UtcMs(1991, 0, 1), 26), (UtcMs(1992, 6, 1), 27), (UtcMs(1993, 6, 1), 28), (UtcMs(1994, 6, 1), 29),
            (UtcMs(1996, 0, 1), 30), (UtcMs(1997, 6, 1), 31), (UtcMs(1999, 0, 1), 32), (UtcMs(2006, 0, 1), 33),
            (UtcMs(2009, 0, 1), 34), (UtcMs(2012, 6, 1), 35), (UtcMs(2015, 6, 1), 36), (UtcMs(2017, 0, 1), 37),
        };

        /// <summary>TT − UTC in seconds. Before 1972 a constant 42.184 s (documented simplification in time.ts).</summary>
        public static double TtMinusUtc(double ms)
        {
            double tai = 10;
            foreach (var (t, v) in Leap)
            {
                if (ms >= t) tai = v;
                else break;
            }
            return 32.184 + tai;
        }

        /// <summary>Julian Date (TDB ≈ TT) for a UTC millisecond timestamp.</summary>
        public static double JdTdbFromUtcMs(double ms) => JD_UNIX_EPOCH + (ms / 1000 + TtMinusUtc(ms)) / 86400;

        static readonly Regex CalendarEpoch = new Regex(@"^(\d{4})-(\d{2})-(\d{2}(?:\.\d+)?)$", RegexOptions.CultureInvariant);

        /// <summary>Calendar epoch such as "2000-01-01.5" (TDB) → JD.</summary>
        public static double JdFromCalendarEpoch(string s)
        {
            var m = CalendarEpoch.Match(s.Trim());
            if (!m.Success) throw new FormatException("Bad epoch: " + s);
            double day = double.Parse(m.Groups[3].Value, NumberStyles.Float, CultureInfo.InvariantCulture);
            double whole = Math.Floor(day);
            double baseMs = UtcMs(int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture),
                                  int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) - 1, (int)whole);
            return JD_UNIX_EPOCH + baseMs / MS_PER_DAY + (day - whole);
        }
    }
}
