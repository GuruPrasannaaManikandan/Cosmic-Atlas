using System;
using System.Text.RegularExpressions;

namespace CosmicAtlas.Rendering
{
    public enum SpectralClass { O, B, A, F, G, K, M, WhiteDwarf, NeutronStar }
    public enum LuminosityClass { Supergiant, BrightGiant, Giant, Subgiant, MainSequence, Degenerate }

    /// <summary>
    /// Stellar appearance model. Every number here is either a physical law or an explicitly approximate,
    /// class-typical value (marked "approx."), never presented as a measurement of a particular star.
    /// </summary>
    public static class StellarModel
    {
        public const double SolarTeffK = 5772;           // IAU 2015 Resolution B3 nominal solar effective temperature
        public const double SolarMbol = 4.74;            // IAU 2015 Resolution B2 nominal solar absolute bolometric magnitude
        public const double LyPerParsec = 3.2615637771674337;

        /// <summary>Approx. effective-temperature ranges of the MK classes (main sequence), K.</summary>
        public static (double min, double max) TeffRange(SpectralClass c)
        {
            switch (c)
            {
                case SpectralClass.O: return (30000, 50000);
                case SpectralClass.B: return (10000, 30000);
                case SpectralClass.A: return (7500, 10000);
                case SpectralClass.F: return (6000, 7500);
                case SpectralClass.G: return (5200, 6000);
                case SpectralClass.K: return (3700, 5200);
                case SpectralClass.M: return (2400, 3700);
                case SpectralClass.WhiteDwarf: return (4000, 100000);
                default: return (1e5, 1e7); // neutron-star surface, not a photosphere in the usual sense
            }
        }

        /// <summary>
        /// Approx. temperature for a spectral class and subclass digit 0–9 (linear across the class range; 0 = hottest).
        /// Illustrative interpolation, not a calibration.
        /// </summary>
        public static double ApproxTeff(SpectralClass c, double subclass)
        {
            var (lo, hi) = TeffRange(c);
            double f = Math.Max(0, Math.Min(9.5, subclass)) / 10.0;
            return hi - (hi - lo) * f;
        }

        /// <summary>
        /// Approx. band-averaged visible linear limb-darkening coefficient u for I(μ) = 1 − u(1 − μ).
        /// Cooler photospheres darken more strongly toward the limb (e.g. the Sun ≈ 0.6 in the visible).
        /// </summary>
        public static double LimbDarkeningU(double teffK)
        {
            if (teffK >= 30000) return 0.30;
            if (teffK >= 10000) return 0.40;
            if (teffK >= 7500) return 0.50;
            if (teffK >= 6000) return 0.56;
            if (teffK >= 5200) return 0.60;
            if (teffK >= 3700) return 0.68;
            return 0.75;
        }

        public static double LimbIntensity(double mu, double u) => 1.0 - u * (1.0 - Math.Max(0, Math.Min(1, mu)));

        /// <summary>Stefan–Boltzmann: R/R☉ = sqrt(L/L☉) · (T☉/T)².</summary>
        public static double RadiusSolar(double luminositySolar, double teffK) => Math.Sqrt(luminositySolar) * Math.Pow(SolarTeffK / teffK, 2);

        /// <summary>L/L☉ = (R/R☉)² (T/T☉)⁴.</summary>
        public static double LuminositySolar(double radiusSolar, double teffK) => radiusSolar * radiusSolar * Math.Pow(teffK / SolarTeffK, 4);

        /// <summary>Absolute bolometric magnitude from luminosity (IAU 2015 B2 zero point).</summary>
        public static double AbsoluteBolometric(double luminositySolar) => SolarMbol - 2.5 * Math.Log10(luminositySolar);

        /// <summary>Apparent magnitude from absolute magnitude and distance (no extinction): m = M + 5 log10(d / 10 pc).</summary>
        public static double ApparentMagnitude(double absoluteMag, double distanceLy) => absoluteMag + 5 * (Math.Log10(distanceLy / LyPerParsec) - 1);

        /// <summary>Flux relative to a magnitude-0 source: 10^(−0.4 m). Apparent brightness, distinct from luminosity.</summary>
        public static double RelativeFlux(double apparentMag) => Math.Pow(10, -0.4 * apparentMag);

        static readonly Regex TypeRx = new Regex(@"^\s*(?<cls>[OBAFGKM])\s*(?<sub>\d+(\.\d+)?)?(?<rest>.*)$", RegexOptions.IgnoreCase);

        /// <summary>Parses MK types such as "G2V", "K5+ III", "M1-M2 Ia-ab", "B8 Ia", "DA2" (white dwarf).</summary>
        public static bool TryParse(string spectralType, out SpectralClass cls, out double subclass, out LuminosityClass lum)
        {
            cls = SpectralClass.G; subclass = 5; lum = LuminosityClass.MainSequence;
            if (string.IsNullOrWhiteSpace(spectralType)) return false;
            string s = spectralType.Trim();
            if (s.StartsWith("D", StringComparison.Ordinal) && s.Length > 1 && "ABOQZCX".IndexOf(char.ToUpperInvariant(s[1])) >= 0)
            {
                cls = SpectralClass.WhiteDwarf; lum = LuminosityClass.Degenerate;
                var digits = Regex.Match(s, @"\d+(\.\d+)?");
                subclass = digits.Success ? double.Parse(digits.Value, System.Globalization.CultureInfo.InvariantCulture) : 5;
                return true;
            }
            var m = TypeRx.Match(s);
            if (!m.Success) return false;
            cls = (SpectralClass)Enum.Parse(typeof(SpectralClass), m.Groups["cls"].Value.ToUpperInvariant());
            if (m.Groups["sub"].Success) subclass = double.Parse(m.Groups["sub"].Value, System.Globalization.CultureInfo.InvariantCulture);
            string rest = m.Groups["rest"].Value.ToUpperInvariant();
            if (rest.Contains("IA") || rest.Contains("IB") || Regex.IsMatch(rest, @"(^|[^IV])I($|[^IV])")) lum = LuminosityClass.Supergiant;
            else if (rest.Contains("III")) lum = LuminosityClass.Giant;
            else if (rest.Contains("II")) lum = LuminosityClass.BrightGiant;
            else if (rest.Contains("IV")) lum = LuminosityClass.Subgiant;
            else lum = LuminosityClass.MainSequence;
            return true;
        }

        /// <summary>Whether a star should show resolved surface detail (granulation) — only when it covers enough pixels.</summary>
        public static bool IsResolved(double angularRadiusRad, double pixelsPerRadian) => angularRadiusRad * pixelsPerRadian >= 3.0;
    }
}
