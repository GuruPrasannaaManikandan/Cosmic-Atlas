using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering
{
    /// <summary>
    /// Irregular small bodies. The overall shape uses MEASURED triaxial semi-axes when available (catalogue
    /// physical.triaxialKm, e.g. Phobos); craters and fine relief are PROCEDURAL (positions are not mapped craters):
    /// cumulative size distribution N(&gt;D) ∝ D^-2, simple-crater profile (parabolic bowl, depth/diameter ≈ 0.2,
    /// raised rim, ejecta brightening for fresh craters).
    /// </summary>
    public static class SmallBodyMesh
    {
        struct Crater { public Vector3 dir; public float radius; public float depth; public float fresh; }

        public static Mesh Build(Vector3 semiAxes, int subdivisions, int craterCount, int seed, Color baseAlbedo, float lumpiness = 0.08f)
        {
            var r = new Rng(seed);
            Icosphere(subdivisions, out var verts, out var tris);
            var craters = new List<Crater>();
            for (int i = 0; i < craterCount; i++)
            {
                // N(>R) ∝ R^-2 → R = Rmin · u^(-1/2), truncated
                float rad = Mathf.Min(0.35f, 0.02f * Mathf.Pow(Mathf.Max(r.U(), 1e-3f), -0.5f));
                craters.Add(new Crater { dir = r.OnSphere(), radius = rad, depth = 0.2f * 2 * rad, fresh = r.U() < 0.15f ? 1f : 0f });
            }
            var colors = new Color[verts.Length];
            float lumpSeed = r.Range(0, 100);
            for (int i = 0; i < verts.Length; i++)
            {
                var d = verts[i].normalized;
                float h = 0f, bright = 0f;
                foreach (var c in craters)
                {
                    float ang = Mathf.Acos(Mathf.Clamp(Vector3.Dot(d, c.dir), -1f, 1f));
                    float x = ang / c.radius;
                    if (x < 1f) h += c.depth * (x * x - 1f);                              // bowl
                    else if (x < 1.6f) h += c.depth * 0.25f * Mathf.Pow(1f - (x - 1f) / 0.6f, 2f); // rim
                    if (c.fresh > 0 && x < 2.5f) bright += 0.25f * (1f - x / 2.5f);          // ejecta blanket
                }
                h += lumpiness * (Mathf.PerlinNoise(d.x * 2.1f + lumpSeed, d.y * 2.1f + d.z) - 0.5f);
                var p = Vector3.Scale(d, semiAxes) * (1f + h);
                verts[i] = p;
                float shade = 1f + bright + 0.08f * (Mathf.PerlinNoise(d.x * 9 + lumpSeed, d.z * 9) - 0.5f);
                colors[i] = baseAlbedo * shade;
            }
            var m = new Mesh { name = "AtlasSmallBody", indexFormat = IndexFormat.UInt32 };
            m.vertices = verts; m.triangles = tris; m.colors = colors;
            var uv = new Vector2[verts.Length];
            for (int i = 0; i < verts.Length; i++) { var d = verts[i].normalized; uv[i] = new Vector2(0.5f + Mathf.Atan2(d.z, d.x) / (2 * Mathf.PI), 0.5f + Mathf.Asin(d.y) / Mathf.PI); }
            m.uv = uv;
            m.RecalculateNormals(); m.RecalculateTangents(); m.RecalculateBounds();
            return m;
        }

        /// <summary>Bilobed cometary nucleus (smooth union of two ellipsoids) — an illustrative shape, not a specific comet.</summary>
        public static Mesh BilobedNucleus(int subdivisions, int seed)
        {
            var mesh = Build(new Vector3(1f, 0.8f, 0.75f), subdivisions, 40, seed, new Color(0.05f, 0.05f, 0.05f), 0.12f);
            var v = mesh.vertices;
            for (int i = 0; i < v.Length; i++)
            {
                // pinch the waist to create two lobes
                float x = v[i].x;
                float waist = 1f - 0.35f * Mathf.Exp(-x * x * 8f);
                v[i] = new Vector3(x * 1.3f, v[i].y * waist, v[i].z * waist);
            }
            mesh.vertices = v; mesh.RecalculateNormals(); mesh.RecalculateTangents(); mesh.RecalculateBounds();
            return mesh;
        }

        static void Icosphere(int sub, out Vector3[] verts, out int[] tris)
        {
            float t = (1f + Mathf.Sqrt(5f)) / 2f;
            var v = new List<Vector3> {
                new Vector3(-1, t, 0), new Vector3(1, t, 0), new Vector3(-1, -t, 0), new Vector3(1, -t, 0),
                new Vector3(0, -1, t), new Vector3(0, 1, t), new Vector3(0, -1, -t), new Vector3(0, 1, -t),
                new Vector3(t, 0, -1), new Vector3(t, 0, 1), new Vector3(-t, 0, -1), new Vector3(-t, 0, 1) };
            for (int i = 0; i < v.Count; i++) v[i] = v[i].normalized;
            var f = new List<int> { 0,11,5, 0,5,1, 0,1,7, 0,7,10, 0,10,11, 1,5,9, 5,11,4, 11,10,2, 10,7,6, 7,1,8,
                3,9,4, 3,4,2, 3,2,6, 3,6,8, 3,8,9, 4,9,5, 2,4,11, 6,2,10, 8,6,7, 9,8,1 };
            for (int s = 0; s < sub; s++)
            {
                var cache = new Dictionary<long, int>();
                var nf = new List<int>(f.Count * 4);
                int Mid(int a, int b)
                {
                    long key = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
                    if (cache.TryGetValue(key, out int m)) return m;
                    v.Add(((v[a] + v[b]) * 0.5f).normalized);
                    cache[key] = v.Count - 1;
                    return v.Count - 1;
                }
                for (int i = 0; i < f.Count; i += 3)
                {
                    int a = f[i], b = f[i + 1], c = f[i + 2];
                    int ab = Mid(a, b), bc = Mid(b, c), ca = Mid(c, a);
                    nf.AddRange(new[] { a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca });
                }
                f = nf;
            }
            verts = v.ToArray(); tris = f.ToArray();
        }
    }

    /// <summary>
    /// Comet tails from first principles, integrated in the heliocentric frame:
    ///  * dust: grains leave the nucleus with its orbital velocity plus a small sunward-hemisphere ejection, then feel
    ///    gravity reduced by radiation pressure, a = −GM(1−β)/r² r̂ (β = radiation/gravity ratio, larger for smaller
    ///    grains). Because they keep the nucleus's orbital motion, the dust tail CURVES behind the orbit (syndynes).
    ///  * ions: picked up by the solar wind (~400 km/s), they stream almost radially away from the Sun → straight,
    ///    narrow, blue (CO⁺ emission colour) ion tail.
    /// Units: AU and days; GM☉ = k² with the Gaussian gravitational constant k = 0.01720209895 AU^(3/2)/day.
    /// </summary>
    public static class CometSimulator
    {
        public const double GaussK = 0.01720209895;
        public const double GM = GaussK * GaussK;          // AU^3 / day^2
        public const double SolarWindAuPerDay = 400.0 * 86400.0 / 149597870.7; // 400 km/s

        public struct State { public Vector3 nucleus; public Vector3 velocity; }

        /// <summary>Circular-speed state at heliocentric distance r (AU) moving in the +Z direction (scene XZ plane = ecliptic).</summary>
        public static State OnOrbit(float rAu)
        {
            float v = (float)System.Math.Sqrt(GM / rAu);
            return new State { nucleus = new Vector3(rAu, 0, 0), velocity = new Vector3(0, 0, v) };
        }

        public static void Simulate(State s, int dustCount, int ionCount, float spanDays, int seed, List<Particle> dust, List<Particle> ions)
        {
            var r = new Rng(seed);
            dust.Clear(); ions.Clear();
            for (int i = 0; i < dustCount; i++)
            {
                float age = spanDays * r.U();
                float beta = Mathf.Lerp(0.05f, 1.2f, Mathf.Pow(r.U(), 2f)); // most grains large (small β), few small
                // nucleus position at emission time: integrate the nucleus BACK by `age` days (Kepler, two-body)
                Propagate(s.nucleus, s.velocity, -age, 1.0, out var p0, out var v0);
                var sunward = -p0.normalized;
                var eject = (sunward + r.OnSphere() * 0.7f).normalized * 0.0004f; // ~0.7 km/s
                Propagate(p0, v0 + eject, age, 1.0 - beta, out var p1, out _);
                float bright = Mathf.Exp(-age / (spanDays * 0.6f)) * (0.4f + 0.6f * beta);
                dust.Add(new Particle(p1 - s.nucleus, Blackbody.LinearColor(5772) * new Color(1f, 0.92f, 0.8f), 0.0004f + 0.0008f * r.U(), bright));
            }
            for (int i = 0; i < ionCount; i++)
            {
                float age = spanDays * 0.08f * r.U();
                var radial = s.nucleus.normalized;
                // aberration: ions flow radially at the solar-wind speed in the Sun frame; in the comet frame the tail
                // tilts slightly opposite the orbital velocity
                var rel = (radial * (float)SolarWindAuPerDay - s.velocity).normalized;
                var p = rel * (float)SolarWindAuPerDay * age + r.OnSphere() * 0.0004f * (1 + age);
                float bright = Mathf.Exp(-age / (spanDays * 0.04f));
                ions.Add(new Particle(p, new Color(0.25f, 0.55f, 1.0f), 0.0003f + 0.0005f * r.U(), bright));
            }
        }

        /// <summary>Two-body propagation with reduced effective gravity GM·k by fixed-step velocity Verlet (stable over weeks).</summary>
        public static void Propagate(Vector3 p, Vector3 v, float days, double gmFactor, out Vector3 pOut, out Vector3 vOut)
        {
            int steps = Mathf.Max(4, Mathf.CeilToInt(Mathf.Abs(days) / 0.5f));
            float dt = days / steps;
            double gm = GM * gmFactor;
            Vector3 a = Acc(p, gm);
            for (int i = 0; i < steps; i++)
            {
                p += v * dt + 0.5f * a * dt * dt;
                var a2 = Acc(p, gm);
                v += 0.5f * (a + a2) * dt;
                a = a2;
            }
            pOut = p; vOut = v;
        }

        static Vector3 Acc(Vector3 p, double gm)
        {
            double r = p.magnitude;
            return (float)(-gm / (r * r * r)) * p;
        }
    }
}
