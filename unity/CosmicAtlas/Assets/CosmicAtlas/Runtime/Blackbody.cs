using System;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    /// <summary>
    /// Colour of a blackbody of temperature T as seen by a standard observer.
    /// Planck's law B(λ,T) is integrated over 380–780 nm against the CIE 1931 2° colour-matching functions
    /// (multi-lobe Gaussian fit of Wyman, Sloan &amp; Shirley 2013, JCGT 2(2)), converted XYZ → linear sRGB (D65)
    /// and normalised so the largest channel is 1 (chromaticity only; brightness is handled separately).
    /// </summary>
    public static class Blackbody
    {
        const double H = 6.62607015e-34, C = 2.99792458e8, K = 1.380649e-23;

        static double G(double x, double mu, double s1, double s2)
        {
            double s = x < mu ? s1 : s2;
            double t = (x - mu) / s;
            return Math.Exp(-0.5 * t * t);
        }

        /// <summary>CIE 1931 colour-matching functions (Wyman et al. 2013 multi-lobe fit), λ in nm.</summary>
        public static void Cmf(double nm, out double x, out double y, out double z)
        {
            x = 1.056 * G(nm, 599.8, 37.9, 31.0) + 0.362 * G(nm, 442.0, 16.0, 26.7) - 0.065 * G(nm, 501.1, 20.4, 26.2);
            y = 0.821 * G(nm, 568.8, 46.9, 40.5) + 0.286 * G(nm, 530.9, 16.3, 31.1);
            z = 1.217 * G(nm, 437.0, 11.8, 36.0) + 0.681 * G(nm, 459.0, 26.0, 13.8);
        }

        /// <summary>Spectral radiance (arbitrary consistent units) at wavelength λ (nm) and temperature T (K).</summary>
        public static double Planck(double nm, double tK)
        {
            double l = nm * 1e-9;
            return (2 * H * C * C) / (Math.Pow(l, 5) * (Math.Exp(H * C / (l * K * tK)) - 1));
        }

        /// <summary>Linear-sRGB chromaticity of a blackbody (max channel = 1, no negative channels).</summary>
        public static Color LinearColor(double tK)
        {
            tK = Math.Max(500, Math.Min(100000, tK));
            double X = 0, Y = 0, Z = 0;
            for (double nm = 380; nm <= 780; nm += 5)
            {
                Cmf(nm, out double x, out double y, out double z);
                double b = Planck(nm, tK);
                X += b * x; Y += b * y; Z += b * z;
            }
            double r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
            double g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
            double bl = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
            r = Math.Max(0, r); g = Math.Max(0, g); bl = Math.Max(0, bl);
            double m = Math.Max(r, Math.Max(g, bl));
            if (m <= 0) return Color.black;
            return new Color((float)(r / m), (float)(g / m), (float)(bl / m), 1f);
        }
    }
}
