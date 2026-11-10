using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// Rocks and clasts of the Victoria scene, GPU-instanced around the camera.
    ///
    /// WHERE rocks are is data-driven (scripts/mars/victoria_surface.py): the 25 cm HiRISE orthoimage separates bright
    /// Burns-formation outcrop from dark basaltic sand, and the DTM gives slope; so outcrop slabs line the capes and the
    /// exposed rim, boulders sit on steep walls, and the plains carry only small clasts (Meridiani is famously rock-poor,
    /// with hematite spherules on the sand). WHAT each rock looks like is ILLUSTRATIVE: individual rocks are below the
    /// DTM's 1 m resolution, so their shapes are procedural (seeded noise on a subdivided sphere / layered slab), with
    /// controlled variation so no two neighbours repeat.
    /// </summary>
    public sealed class MarsRocks
    {
        const float Cell = 32f;
        static readonly float[] Range = { 0f, 140f, 450f, 450f }; // per category (1 cobble, 2 slab, 3 boulder)
        const float PebbleRange = 34f, PebbleStep = 0.85f;

        readonly MarsTerrain _t;
        readonly Material[] _mat = new Material[4];
        readonly Mesh[][] _mesh = new Mesh[4][];
        readonly Dictionary<long, List<Matrix4x4>[][]> _cells = new Dictionary<long, List<Matrix4x4>[][]>();
        readonly byte[] _mask; readonly int _mw, _mh;
        readonly List<Matrix4x4>[][] _draw;
        readonly List<Matrix4x4>[] _pebbles;
        Vector3 _lastPebbleCam = new Vector3(1e9f, 0, 0), _lastCam = new Vector3(1e9f, 0, 0), _lastOrigin;
        public int Instances, DrawCalls;
        public bool Visible = true;

        public MarsRocks(MarsTerrain terrain, TextAsset placements, TextAsset groundMask, Material rockTemplate)
        {
            _t = terrain;
            var outcrop = new Color(0.66f, 0.52f, 0.38f); // light, layered sulfate-rich sandstone (Burns formation)
            var basalt = new Color(0.30f, 0.23f, 0.18f);
            var cobble = new Color(0.42f, 0.31f, 0.22f);
            var clast = new Color(0.24f, 0.19f, 0.16f);   // dark spherules / basaltic clasts on the sand
            Color[] cols = { clast, cobble, outcrop, basalt };
            for (int c = 0; c < 4; c++)
            {
                var m = new Material(rockTemplate) { name = "Rock " + c, enableInstancing = true };
                m.SetColor("_BaseColor", cols[c]);
                m.SetFloat("_Smoothness", c == 2 ? 0.12f : 0.18f);
                _mat[c] = m;
            }
            _mesh[0] = Variants(6, 0, 3, 0.75f, 0.12f, 0.0f, 11);
            _mesh[1] = Variants(8, 1, 3, 0.70f, 0.22f, 0.0f, 23);
            _mesh[2] = Variants(8, 2, 3, 0.32f, 0.16f, 0.6f, 37);
            _mesh[3] = Variants(8, 3, 3, 0.85f, 0.30f, 0.15f, 51);

            _draw = new List<Matrix4x4>[4][];
            for (int c = 0; c < 4; c++) { _draw[c] = new List<Matrix4x4>[_mesh[c].Length]; for (int v = 0; v < _mesh[c].Length; v++) _draw[c][v] = new List<Matrix4x4>(1024); }
            _pebbles = new List<Matrix4x4>[_mesh[0].Length];
            for (int v = 0; v < _pebbles.Length; v++) _pebbles[v] = new List<Matrix4x4>(2048);

            if (groundMask) { _mask = groundMask.bytes; _mw = (_t.Width + 1) / 2; _mh = (_t.Height + 1) / 2; }

            // bucket the data-driven rocks into 32 m cells (matrices in the site frame; the origin offset is applied per draw)
            var b = placements.bytes;
            int n = b.Length / 24;
            var f = new float[n * 6];
            System.Buffer.BlockCopy(b, 0, f, 0, n * 24);
            for (int i = 0; i < n; i++)
            {
                float e = f[i * 6], no = f[i * 6 + 1], u = f[i * 6 + 2], s = f[i * 6 + 3], yaw = f[i * 6 + 4];
                int cat = (int)f[i * 6 + 5];
                if (cat < 1 || cat > 3) continue;
                int variant = (int)(Hash(i * 7919 + cat) * _mesh[cat].Length) % _mesh[cat].Length;
                float tilt = (Hash(i * 31 + 5) - 0.5f) * (cat == 2 ? 14f : 30f);
                var rot = Quaternion.Euler(tilt, yaw, (Hash(i * 17 + 3) - 0.5f) * 20f);
                float bury = cat == 2 ? 0.45f : 0.3f; // partly buried: rocks sit in the regolith, not on it
                var scale = new Vector3(s * (0.8f + 0.5f * Hash(i * 13)), s * (cat == 2 ? 0.55f : 0.8f + 0.3f * Hash(i * 19)), s * (0.8f + 0.5f * Hash(i * 23)));
                var m = Matrix4x4.TRS(new Vector3(e, u - bury * scale.y, no), rot, scale);
                long key = Key(e, no);
                if (!_cells.TryGetValue(key, out var lists))
                {
                    lists = new List<Matrix4x4>[4][];
                    _cells[key] = lists;
                }
                if (lists[cat] == null) { lists[cat] = new List<Matrix4x4>[_mesh[cat].Length]; for (int v = 0; v < lists[cat].Length; v++) lists[cat][v] = new List<Matrix4x4>(); }
                lists[cat][variant].Add(m);
            }
        }

        static long Key(float e, float n) => ((long)Mathf.FloorToInt(e / Cell) << 32) ^ (uint)Mathf.FloorToInt(n / Cell);
        static float Hash(int x)
        {
            uint h = (uint)x * 0x9E3779B1u; h ^= h >> 15; h *= 0x85EBCA77u; h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
            return (h & 0xFFFFFF) / 16777216f;
        }

        /// <summary>
        /// Rock meshes: a subdivided octahedron displaced by seeded multi-octave noise (rough / angular), optionally squashed
        /// into a slab with horizontal strata ridges (outcrop). Normals recomputed; small meshes (≤ 2k triangles).
        /// </summary>
        static Mesh[] Variants(int count, int category, int subdiv, float roundness, float roughness, float strata, int seed)
        {
            var list = new Mesh[count];
            for (int v = 0; v < count; v++)
            {
                var verts = new List<Vector3>(); var tris = new List<int>();
                Octahedron(verts, tris);
                for (int s = 0; s < subdiv; s++) Subdivide(verts, tris);
                int sd = seed * 1000 + v * 97;
                var axis = new Vector3(0.75f + 0.5f * Hash(sd + 1), 0.6f + 0.6f * Hash(sd + 2), 0.75f + 0.5f * Hash(sd + 3));
                for (int i = 0; i < verts.Count; i++)
                {
                    var p = verts[i].normalized;
                    float noise = 0;
                    float amp = 1, freq = 1.6f;
                    for (int o = 0; o < 4; o++) { noise += amp * (Noise3(p * freq + new Vector3(sd, sd * 0.37f, sd * 0.71f)) - 0.5f); amp *= 0.5f; freq *= 2.1f; }
                    // angularity: pull toward a few random planes (fractured faces), less for rounded clasts
                    float facet = 0;
                    for (int k = 0; k < 6; k++)
                    {
                        var nrm = new Vector3(Hash(sd + 10 + k) - 0.5f, Hash(sd + 20 + k) - 0.5f, Hash(sd + 30 + k) - 0.5f).normalized;
                        facet = Mathf.Max(facet, Vector3.Dot(p, nrm));
                    }
                    float r = Mathf.Lerp(facet * 1.15f, 1f, roundness) + roughness * noise;
                    var q = Vector3.Scale(p * r, axis);
                    if (strata > 0) q.y += strata * 0.04f * Mathf.Sin(q.y * 38f + sd) * (1 - Mathf.Abs(p.y)); // bedding ridges on the flanks
                    verts[i] = q * 0.5f;
                }
                // flatten the underside a little so rocks sit (and bury) naturally
                for (int i = 0; i < verts.Count; i++) if (verts[i].y < -0.25f) verts[i] = new Vector3(verts[i].x, Mathf.Lerp(verts[i].y, -0.25f, 0.6f), verts[i].z);
                var m = new Mesh { name = $"rock{category}_{v}" };
                m.SetVertices(verts); m.SetTriangles(tris, 0);
                m.RecalculateNormals(); m.RecalculateBounds();
                m.UploadMeshData(true);
                list[v] = m;
            }
            return list;
        }

        static void Octahedron(List<Vector3> v, List<int> t)
        {
            v.AddRange(new[] { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back });
            int[] f = { 2, 4, 0, 2, 0, 5, 2, 5, 1, 2, 1, 4, 3, 0, 4, 3, 5, 0, 3, 1, 5, 3, 4, 1 };
            t.AddRange(f);
        }

        static void Subdivide(List<Vector3> v, List<int> t)
        {
            var mid = new Dictionary<long, int>();
            int M(int a, int b)
            {
                long k = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
                if (mid.TryGetValue(k, out var i)) return i;
                v.Add(((v[a] + v[b]) * 0.5f).normalized); mid[k] = v.Count - 1; return v.Count - 1;
            }
            var nt = new List<int>(t.Count * 4);
            for (int i = 0; i < t.Count; i += 3)
            {
                int a = t[i], b = t[i + 1], c = t[i + 2], ab = M(a, b), bc = M(b, c), ca = M(c, a);
                nt.AddRange(new[] { a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca });
            }
            t.Clear(); t.AddRange(nt);
        }

        static float Noise3(Vector3 p)
        {
            Vector3 i = new Vector3(Mathf.Floor(p.x), Mathf.Floor(p.y), Mathf.Floor(p.z)), f = p - i;
            f = new Vector3(f.x * f.x * (3 - 2 * f.x), f.y * f.y * (3 - 2 * f.y), f.z * f.z * (3 - 2 * f.z));
            float H(int x, int y, int z) => Hash(x * 73856093 ^ y * 19349663 ^ z * 83492791);
            int X = (int)i.x, Y = (int)i.y, Z = (int)i.z;
            float x00 = Mathf.Lerp(H(X, Y, Z), H(X + 1, Y, Z), f.x), x10 = Mathf.Lerp(H(X, Y + 1, Z), H(X + 1, Y + 1, Z), f.x);
            float x01 = Mathf.Lerp(H(X, Y, Z + 1), H(X + 1, Y, Z + 1), f.x), x11 = Mathf.Lerp(H(X, Y + 1, Z + 1), H(X + 1, Y + 1, Z + 1), f.x);
            return Mathf.Lerp(Mathf.Lerp(x00, x10, f.y), Mathf.Lerp(x01, x11, f.y), f.z);
        }

        float MaskAt(float e, float n)
        {
            if (_mask == null) return 0.4f;
            int c = Mathf.FloorToInt((e - _t.East0) / _t.SpacingE / 2), r = Mathf.FloorToInt((_t.North0 - n) / _t.SpacingN / 2);
            if (c < 0 || r < 0 || c >= _mw || r >= _mh) return -1;
            byte b = _mask[r * _mw + c];
            return b == 0 ? -1 : (b - 1) / 254f;
        }

        /// <summary>small clasts in a disc around the camera, deterministic per 0.85 m cell (no popping while driving)</summary>
        void RebuildPebbles(Vector3 cam)
        {
            foreach (var l in _pebbles) l.Clear();
            int c0 = Mathf.FloorToInt((cam.x - PebbleRange) / PebbleStep), c1 = Mathf.FloorToInt((cam.x + PebbleRange) / PebbleStep);
            int r0 = Mathf.FloorToInt((cam.z - PebbleRange) / PebbleStep), r1 = Mathf.FloorToInt((cam.z + PebbleRange) / PebbleStep);
            for (int r = r0; r <= r1; r++)
                for (int c = c0; c <= c1; c++)
                {
                    int id = c * 92821 ^ r * 68917;
                    float e = (c + Hash(id)) * PebbleStep, n = (r + Hash(id + 1)) * PebbleStep;
                    float dx = e - cam.x, dz = n - cam.z;
                    if (dx * dx + dz * dz > PebbleRange * PebbleRange) continue;
                    float bright = MaskAt(e, n);
                    if (bright < 0) continue;
                    // sand (dark) carries scattered spherules / clasts; bright outcrop pavement carries more angular fragments
                    if (Hash(id + 2) > 0.28f + 0.5f * bright) continue;
                    float h = _t.Sample(e, n); if (float.IsNaN(h)) continue;
                    float s = 0.035f + 0.11f * Hash(id + 3) * Hash(id + 4) + 0.08f * bright * Hash(id + 5);
                    var m = Matrix4x4.TRS(new Vector3(e, h - 0.3f * s, n), Quaternion.Euler(Hash(id + 6) * 40, Hash(id + 7) * 360, 0), new Vector3(s, s * 0.75f, s * 1.1f));
                    _pebbles[(int)(Hash(id + 8) * _pebbles.Length) % _pebbles.Length].Add(m);
                }
        }

        static readonly Matrix4x4[] Batch = new Matrix4x4[1023];

        /// <summary>draw everything in range of the camera (site-frame camera position; origin = floating-origin offset)</summary>
        public void Draw(Vector3 cam, Vector3 origin, bool shadows)
        {
            Instances = DrawCalls = 0;
            if (!Visible) return;
            if ((cam - _lastPebbleCam).sqrMagnitude > 9f) { RebuildPebbles(cam); _lastPebbleCam = cam; }
            if ((cam - _lastCam).sqrMagnitude > 64f || origin != _lastOrigin)
            {
                _lastCam = cam; _lastOrigin = origin;
                for (int c = 1; c < 4; c++) foreach (var l in _draw[c]) l.Clear();
                int reach = Mathf.CeilToInt(Range[2] / Cell);
                int cx = Mathf.FloorToInt(cam.x / Cell), cz = Mathf.FloorToInt(cam.z / Cell);
                for (int i = -reach; i <= reach; i++)
                    for (int j = -reach; j <= reach; j++)
                    {
                        if (!_cells.TryGetValue(((long)(cx + i) << 32) ^ (uint)(cz + j), out var lists)) continue;
                        float d = new Vector2((cx + i + 0.5f) * Cell - cam.x, (cz + j + 0.5f) * Cell - cam.z).magnitude;
                        for (int c = 1; c < 4; c++)
                        {
                            if (lists[c] == null || d > Range[c] + Cell) continue;
                            for (int v = 0; v < lists[c].Length; v++) _draw[c][v].AddRange(lists[c][v]);
                        }
                    }
            }
            var shift = Matrix4x4.Translate(-origin);
            for (int c = 1; c < 4; c++)
                for (int v = 0; v < _draw[c].Length; v++) Submit(_mesh[c][v], _mat[c], _draw[c][v], shift, shadows && c >= 2);
            for (int v = 0; v < _pebbles.Length; v++) Submit(_mesh[0][v], _mat[0], _pebbles[v], shift, false);
        }

        void Submit(Mesh mesh, Material mat, List<Matrix4x4> list, Matrix4x4 shift, bool shadows)
        {
            var rp = new RenderParams(mat) { shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true };
            for (int i = 0; i < list.Count; i += 1023)
            {
                int n = Mathf.Min(1023, list.Count - i);
                for (int k = 0; k < n; k++) Batch[k] = shift * list[i + k];
                Graphics.RenderMeshInstanced(rp, mesh, 0, Batch, n);
                Instances += n; DrawCalls++;
            }
        }
    }
}
