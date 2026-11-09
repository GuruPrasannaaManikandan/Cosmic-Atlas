using System.Collections.Generic;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    public enum GalaxyMorphology { Spiral, BarredSpiral, Elliptical, Irregular, Dwarf }

    /// <summary>
    /// Structural parameters, in kpc. Defaults are typical values for each class (illustrative, not a specific galaxy).
    /// </summary>
    [System.Serializable]
    public struct GalaxyParams
    {
        public GalaxyMorphology morphology;
        public float diskScaleLength;   // exponential disk scale length h_R
        public float diskScaleHeight;   // vertical scale height (thin disk)
        public float bulgeScale;        // Hernquist scale radius a
        public float bulgeFraction;     // fraction of stars in the bulge
        public int arms;
        public float pitchDeg;          // logarithmic-spiral pitch angle
        public float armFraction;       // fraction of disk stars concentrated in arms
        public float barLength;         // half-length of the bar (barred spirals)
        public float ellipticity;       // Hubble E-number / 10 for ellipticals (E3 -> 0.3)
        public float dustAmount;        // relative dust-lane strength

        public static GalaxyParams Typical(GalaxyMorphology m)
        {
            switch (m)
            {
                case GalaxyMorphology.Spiral: return new GalaxyParams { morphology = m, diskScaleLength = 3.0f, diskScaleHeight = 0.3f, bulgeScale = 0.6f, bulgeFraction = 0.15f, arms = 2, pitchDeg = 14, armFraction = 0.7f, dustAmount = 1 };
                case GalaxyMorphology.BarredSpiral: return new GalaxyParams { morphology = m, diskScaleLength = 3.2f, diskScaleHeight = 0.3f, bulgeScale = 0.5f, bulgeFraction = 0.12f, arms = 2, pitchDeg = 16, armFraction = 0.65f, barLength = 3.5f, dustAmount = 1 };
                case GalaxyMorphology.Elliptical: return new GalaxyParams { morphology = m, bulgeScale = 2.5f, bulgeFraction = 1f, ellipticity = 0.3f };
                case GalaxyMorphology.Irregular: return new GalaxyParams { morphology = m, diskScaleLength = 2.0f, diskScaleHeight = 0.6f, dustAmount = 0.4f };
                default: return new GalaxyParams { morphology = m, bulgeScale = 0.4f, bulgeFraction = 1f, ellipticity = 0.15f };
            }
        }
    }

    /// <summary>
    /// Star-particle models of galaxy morphologies from standard structural components:
    /// exponential disk (Σ ∝ e^(−R/h)), logarithmic spiral arms θ = ln(R/R0)/tan(pitch), Hernquist bulge / elliptical
    /// (ρ ∝ 1/(r (r+a)^3), sampled exactly by inverse CDF r = a√u/(1−√u)), stellar bar, clumpy irregulars.
    /// Stellar populations: young hot stars (blue) trace the arms, old cool stars (yellow-red) the bulge;
    /// H II regions (Hα pink) sit along the arms; dust lanes lie on the INNER (concave) edge of the arms, where
    /// density-wave shocks compress gas. Colours are blackbody chromaticities of representative temperatures.
    /// </summary>
    public static class GalaxyGenerator
    {
        public static void Generate(GalaxyParams g, int count, int seed, List<Particle> stars, List<Particle> dust)
        {
            var r = new Rng(seed);
            stars.Clear(); dust.Clear();
            switch (g.morphology)
            {
                case GalaxyMorphology.Spiral:
                case GalaxyMorphology.BarredSpiral: Disk(g, count, r, stars, dust); break;
                case GalaxyMorphology.Elliptical: Spheroid(g, count, r, stars, oldPopulation: true); break;
                case GalaxyMorphology.Irregular: Irregular(g, count, r, stars, dust); break;
                default: Dwarf(g, count, r, stars); break;
            }
        }

        static Color Pop(Rng r, float tMin, float tMax) => Blackbody.LinearColor(Mathf.Lerp(tMin, tMax, r.U()));

        /// <summary>Inverse-CDF sample of the Hernquist enclosed-mass profile M(&lt;r)/M = r²/(r+a)².</summary>
        public static float HernquistRadius(float a, float u)
        {
            u = Mathf.Clamp(u, 1e-6f, 0.995f);
            float s = Mathf.Sqrt(u);
            return a * s / (1 - s);
        }

        /// <summary>Radius from an exponential surface-density disk: R ~ Gamma(2, h) = −h ln(u1 u2).</summary>
        public static float ExponentialDiskRadius(float h, float u1, float u2) => -h * Mathf.Log(Mathf.Max(u1, 1e-6f) * Mathf.Max(u2, 1e-6f));

        public static float SpiralAngle(float radius, float r0, float pitchDeg) => Mathf.Log(Mathf.Max(radius, 1e-3f) / r0) / Mathf.Tan(pitchDeg * Mathf.Deg2Rad);

        static void Disk(GalaxyParams g, int count, Rng r, List<Particle> stars, List<Particle> dust)
        {
            int nBulge = Mathf.RoundToInt(count * g.bulgeFraction);
            int nBar = g.morphology == GalaxyMorphology.BarredSpiral ? Mathf.RoundToInt(count * 0.08f) : 0;
            int nDisk = count - nBulge - nBar;
            float r0 = g.morphology == GalaxyMorphology.BarredSpiral ? g.barLength : g.diskScaleLength * 0.35f;

            // bulge: old, cool, mildly flattened Hernquist spheroid
            for (int i = 0; i < nBulge; i++)
            {
                var d = r.OnSphere() * HernquistRadius(g.bulgeScale, r.U());
                d.y *= 0.7f;
                stars.Add(new Particle(d, Pop(r, 3800, 5200), 0.05f, r.Range(0.6f, 1.2f)));
            }
            // bar: elongated, old population
            for (int i = 0; i < nBar; i++)
            {
                var p = new Vector3(r.Range(-1, 1) * g.barLength, r.Gauss(0.15f), r.Gauss(0.35f));
                stars.Add(new Particle(p, Pop(r, 4000, 5600), 0.05f, r.Range(0.5f, 1.0f)));
            }
            // disk: exponential, arms traced by young stars
            for (int i = 0; i < nDisk; i++)
            {
                float R = ExponentialDiskRadius(g.diskScaleLength, r.U(), r.U());
                if (R < r0 * 0.6f && g.morphology == GalaxyMorphology.BarredSpiral) R = r0 * 0.6f + r.U() * r0 * 0.4f;
                bool inArm = r.U() < g.armFraction && R > r0 * 0.5f;
                float th;
                Color c; float size, inten, hz;
                if (inArm)
                {
                    int arm = (int)(r.U() * g.arms);
                    bool young = r.U() < 0.55f;
                    float spread = young ? 0.10f : 0.28f;
                    th = SpiralAngle(R, r0, g.pitchDeg) + 2 * Mathf.PI * arm / g.arms + r.Gauss(spread);
                    if (young && r.U() < 0.06f) { c = new Color(1.0f, 0.25f, 0.45f); size = 0.12f; inten = 1.6f; } // H II region (Hα + Hβ)
                    else if (young) { c = Pop(r, 9000, 25000); size = 0.06f; inten = r.Range(0.8f, 1.8f); }
                    else { c = Pop(r, 4500, 6500); size = 0.05f; inten = r.Range(0.5f, 1.0f); }
                    hz = young ? g.diskScaleHeight * 0.4f : g.diskScaleHeight;
                }
                else
                {
                    th = r.Range(0, 2 * Mathf.PI);
                    c = Pop(r, 4200, 6200); size = 0.05f; inten = r.Range(0.4f, 0.9f); hz = g.diskScaleHeight;
                }
                var p = new Vector3(R * Mathf.Cos(th), r.Gauss(hz), R * Mathf.Sin(th));
                stars.Add(new Particle(p, c, size, inten));
            }
            // dust lanes: inner (concave) edge of the arms, thin layer
            int nDust = Mathf.RoundToInt(count * 0.12f * g.dustAmount);
            for (int i = 0; i < nDust; i++)
            {
                float R = Mathf.Max(r0 * 0.7f, ExponentialDiskRadius(g.diskScaleLength * 1.1f, r.U(), r.U()));
                int arm = (int)(r.U() * g.arms);
                // R_arm(θ) = r0·e^(θ·tan p) grows with θ, so (R, θ_arm + δ) with δ > 0 lies INSIDE the arm (concave side)
                float th = SpiralAngle(R, r0, g.pitchDeg) + 2 * Mathf.PI * arm / g.arms + 0.18f + r.Gauss(0.06f);
                var p = new Vector3(R * Mathf.Cos(th), r.Gauss(g.diskScaleHeight * 0.25f), R * Mathf.Sin(th));
                // colour channel stores reddening (blue absorbed more), alpha = optical depth
                dust.Add(new Particle(p, new Color(0.35f, 0.2f, 0.05f, 0.55f), 0.35f, 1f));
            }
        }

        static void Spheroid(GalaxyParams g, int count, Rng r, List<Particle> stars, bool oldPopulation)
        {
            float q = 1f - Mathf.Clamp01(g.ellipticity);
            for (int i = 0; i < count; i++)
            {
                var d = r.OnSphere() * HernquistRadius(g.bulgeScale, r.U());
                d.y *= q; d.z *= Mathf.Lerp(q, 1f, 0.5f);
                var c = oldPopulation ? Pop(r, 3700, 5200) : Pop(r, 5000, 9000);
                stars.Add(new Particle(d, c, 0.05f, r.Range(0.5f, 1.1f)));
            }
        }

        static void Dwarf(GalaxyParams g, int count, Rng r, List<Particle> stars)
        {
            // dwarf spheroidal: diffuse Plummer sphere, old population, low surface brightness
            for (int i = 0; i < count; i++)
            {
                float u = Mathf.Clamp(r.U(), 1e-4f, 0.999f);
                float rad = g.bulgeScale / Mathf.Sqrt(Mathf.Pow(u, -2f / 3f) - 1f); // Plummer inverse CDF
                var d = r.OnSphere() * rad;
                d.y *= 1f - g.ellipticity;
                stars.Add(new Particle(d, Pop(r, 3800, 5600), 0.05f, r.Range(0.3f, 0.7f)));
            }
        }

        static void Irregular(GalaxyParams g, int count, Rng r, List<Particle> stars, List<Particle> dust)
        {
            // several star-forming clumps on a diffuse, thick, asymmetric body (Magellanic-type)
            int clumps = 6;
            var centres = new Vector3[clumps]; var sizes = new float[clumps];
            for (int k = 0; k < clumps; k++) { centres[k] = new Vector3(r.Gauss(1.5f), r.Gauss(0.4f), r.Gauss(1.0f)); sizes[k] = r.Range(0.3f, 0.9f); }
            for (int i = 0; i < count; i++)
            {
                if (r.U() < 0.55f)
                {
                    int k = (int)(r.U() * clumps);
                    var p = centres[k] + new Vector3(r.Gauss(sizes[k]), r.Gauss(sizes[k] * 0.5f), r.Gauss(sizes[k]));
                    bool hii = r.U() < 0.08f;
                    stars.Add(new Particle(p, hii ? new Color(1f, 0.25f, 0.45f) : Pop(r, 8000, 22000), hii ? 0.12f : 0.06f, r.Range(0.7f, 1.6f)));
                }
                else
                {
                    var p = new Vector3(r.Gauss(g.diskScaleLength * 0.8f), r.Gauss(g.diskScaleHeight), r.Gauss(g.diskScaleLength * 0.5f));
                    stars.Add(new Particle(p, Pop(r, 4500, 7000), 0.05f, r.Range(0.3f, 0.8f)));
                }
            }
            int nDust = Mathf.RoundToInt(count * 0.04f * g.dustAmount);
            for (int i = 0; i < nDust; i++)
            {
                var p = centres[(int)(r.U() * clumps)] + new Vector3(r.Gauss(0.6f), r.Gauss(0.2f), r.Gauss(0.6f));
                dust.Add(new Particle(p, new Color(0.35f, 0.2f, 0.05f, 0.6f), 0.3f, 1f));
            }
        }
    }
}
