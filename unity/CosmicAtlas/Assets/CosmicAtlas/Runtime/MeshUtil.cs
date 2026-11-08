using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering
{
    public struct Particle
    {
        public Vector3 position;
        public Color color;     // linear
        public float size;      // object units
        public float intensity;
        public Particle(Vector3 p, Color c, float s, float i) { position = p; color = c; size = s; intensity = i; }
    }

    public static class MeshUtil
    {
        /// <summary>UV sphere of radius 0.5 with normals, tangents and equirectangular UVs (u = longitude, v = latitude).</summary>
        public static Mesh UvSphere(int segments)
        {
            int lon = Mathf.Max(8, segments), lat = Mathf.Max(4, segments / 2);
            var v = new List<Vector3>(); var n = new List<Vector3>(); var uv = new List<Vector2>(); var t = new List<Vector4>(); var idx = new List<int>();
            for (int y = 0; y <= lat; y++)
            {
                float vy = (float)y / lat, phi = Mathf.PI * vy;
                for (int x = 0; x <= lon; x++)
                {
                    float ux = (float)x / lon, th = 2 * Mathf.PI * ux;
                    var p = new Vector3(-Mathf.Sin(phi) * Mathf.Cos(th), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(th));
                    v.Add(p * 0.5f); n.Add(p); uv.Add(new Vector2(ux, 1 - vy));
                    t.Add(new Vector4(Mathf.Sin(th), 0, Mathf.Cos(th), -1));
                }
            }
            for (int y = 0; y < lat; y++)
                for (int x = 0; x < lon; x++)
                {
                    // clockwise when seen from OUTSIDE (Unity's front-face convention); the first version had this
                    // reversed, which rendered every sphere inside-out (flat stars, back-lit planets, culled BH proxy)
                    int a = y * (lon + 1) + x, b = a + lon + 1;
                    idx.Add(a); idx.Add(b); idx.Add(a + 1);
                    idx.Add(b); idx.Add(b + 1); idx.Add(a + 1);
                }
            var m = new Mesh { name = "AtlasSphere", indexFormat = IndexFormat.UInt32 };
            m.SetVertices(v); m.SetNormals(n); m.SetUVs(0, uv); m.SetTangents(t); m.SetTriangles(idx, 0);
            m.RecalculateBounds();
            return m;
        }

        /// <summary>Billboard mesh for ParticleBillboard.shader (4 vertices per particle).</summary>
        public static Mesh Billboards(IReadOnlyList<Particle> ps, string name = "AtlasParticles")
        {
            int n = ps.Count;
            var pos = new Vector3[n * 4]; var corner = new Vector2[n * 4]; var si = new Vector2[n * 4]; var col = new Color[n * 4]; var idx = new int[n * 6];
            Vector2[] c = { new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1) };
            var bmin = Vector3.positiveInfinity; var bmax = Vector3.negativeInfinity;
            for (int i = 0; i < n; i++)
            {
                var p = ps[i];
                for (int k = 0; k < 4; k++)
                {
                    pos[i * 4 + k] = p.position; corner[i * 4 + k] = c[k];
                    si[i * 4 + k] = new Vector2(p.size, p.intensity); col[i * 4 + k] = p.color;
                }
                idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 1; idx[i * 6 + 2] = i * 4 + 2;
                idx[i * 6 + 3] = i * 4; idx[i * 6 + 4] = i * 4 + 2; idx[i * 6 + 5] = i * 4 + 3;
                bmin = Vector3.Min(bmin, p.position - Vector3.one * p.size); bmax = Vector3.Max(bmax, p.position + Vector3.one * p.size);
            }
            var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            m.vertices = pos; m.SetUVs(0, corner); m.SetUVs(1, si); m.colors = col; m.triangles = idx;
            m.bounds = n > 0 ? new Bounds((bmin + bmax) * 0.5f, bmax - bmin) : new Bounds(Vector3.zero, Vector3.one);
            return m;
        }

        /// <summary>Camera-facing quad (for StarGlow), unit size in object space.</summary>
        public static Mesh Quad()
        {
            var m = new Mesh { name = "AtlasQuad" };
            m.vertices = new[] { new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(1, 1, 0), new Vector3(-1, 1, 0) };
            m.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2 };
            m.bounds = new Bounds(Vector3.zero, Vector3.one * 2);
            return m;
        }

        /// <summary>Open cone along +Y (apex at origin) for pulsar beams. uv.y = distance along the beam (0..1).</summary>
        public static Mesh Cone(float length, float halfAngleDeg, int segments = 48)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var uv = new List<Vector2>(); var idx = new List<int>();
            float r = length * Mathf.Tan(halfAngleDeg * Mathf.Deg2Rad);
            for (int i = 0; i <= segments; i++)
            {
                float a = 2 * Mathf.PI * i / segments;
                var dir = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                v.Add(Vector3.zero); n.Add(dir); uv.Add(new Vector2((float)i / segments, 0));
                v.Add(dir * r + Vector3.up * length); n.Add(dir); uv.Add(new Vector2((float)i / segments, 1));
            }
            for (int i = 0; i < segments; i++) { int a = i * 2; idx.AddRange(new[] { a, a + 1, a + 3, a, a + 3, a + 2 }); }
            var m = new Mesh { name = "AtlasCone" };
            m.SetVertices(v); m.SetNormals(n); m.SetUVs(0, uv); m.SetTriangles(idx, 0); m.RecalculateBounds();
            return m;
        }
    }

    /// <summary>Deterministic gaussian / uniform sampling (System.Random based, seedable, no Unity global state).</summary>
    public sealed class Rng
    {
        readonly System.Random _r;
        public Rng(int seed) { _r = new System.Random(seed); }
        public float U() => (float)_r.NextDouble();
        public float Range(float a, float b) => a + (b - a) * U();
        public float Gauss(float sigma = 1f)
        {
            double u1 = 1.0 - _r.NextDouble(), u2 = _r.NextDouble();
            return (float)(System.Math.Sqrt(-2.0 * System.Math.Log(u1)) * System.Math.Cos(2 * System.Math.PI * u2)) * sigma;
        }
        public Vector3 OnSphere()
        {
            float z = Range(-1, 1), a = Range(0, 2 * Mathf.PI), s = Mathf.Sqrt(1 - z * z);
            return new Vector3(s * Mathf.Cos(a), z, s * Mathf.Sin(a));
        }
    }
}
