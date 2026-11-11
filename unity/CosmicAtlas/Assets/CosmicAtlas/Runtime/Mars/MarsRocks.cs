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
    /// exposed rim, boulders sit on steep walls, and the plains carry only small clasts. WHAT each rock looks like is
    /// ILLUSTRATIVE (below the DTM's 1 m resolution): procedural shapes with controlled variation.
    ///
    /// Performance design (the first version froze for seconds while driving): every instance list is pre-sized from the
    /// real counts so nothing grows (no garbage, so no WebGL stop-the-world collections); matrices are shifted for the
    /// floating origin only when the visible set is rebuilt (camera moved > 6 m, or the origin moved), never per frame;
    /// lists go to the GPU directly (no per-frame copies); a near band draws the detailed mesh with shadows, the far band
    /// a coarse mesh of the same shape without shadows.
    /// </summary>
    public sealed class MarsRocks
    {
        const float Cell = 64f;
        // per category: 1 cobble, 2 outcrop slab, 3 boulder — total range and the detailed / shadowed near band (m)
        static readonly float[] Range = { 0f, 110f, 450f, 450f };
        static readonly float[] Near = { 0f, 35f, 90f, 90f };
        const float PebbleRange = 30f, PebbleStep = 0.85f;
        const int Variants = 6;
        /// <summary>
        /// every instanced draw is exactly this many instances. Unity's WebGL backend bakes the batch size into the shader
        /// (unity_Builtins0Array[N]) and links a new GL program for every new size bucket; Chrome on Windows links it
        /// synchronously (1-1.3 s each), so a changing number of visible rocks froze the page while driving. One fixed
        /// size = one program per pass, compiled once in the warm-up; short batches are padded with zero-scale instances.
        /// </summary>
        public const int Batch = 64;

        readonly MarsTerrain _t;
        readonly Material[] _mat = new Material[4];
        readonly Mesh[][] _lod0 = new Mesh[4][], _lod1 = new Mesh[4][];
        // cell key -> per category -> per variant -> instance matrices (site frame)
        readonly Dictionary<long, Matrix4x4[][][]> _cells = new Dictionary<long, Matrix4x4[][][]>();
        readonly byte[] _mask; readonly int _mw, _mh;
        readonly List<Matrix4x4>[][] _near = new List<Matrix4x4>[4][], _far = new List<Matrix4x4>[4][];
        readonly List<Matrix4x4>[] _pebbles = new List<Matrix4x4>[Variants];
        Vector3 _lastPebbleCam = new Vector3(1e9f, 0, 0), _lastCam = new Vector3(1e9f, 0, 0), _lastOrigin;
        public int Instances, DrawCalls, Triangles;
        public float LastRebuildMs, MaxRebuildMs;
        public bool Visible = true;
        /// <summary>
        /// frames left to pre-warm: on Chrome/Windows (ANGLE on Direct3D 11) the first draw of a new program / vertex
        /// layout compiles synchronously and froze the page for 1-3 s while driving; drawing every rock pipeline once
        /// (near / far mesh, with and without shadows) during the arrival pays that cost before the user has control
        /// </summary>
        public int WarmFrames = 8;
        readonly List<Matrix4x4> _warm = new List<Matrix4x4>(Batch);
        readonly System.Diagnostics.Stopwatch _sw = new System.Diagnostics.Stopwatch();

        public MarsRocks(MarsTerrain terrain, TextAsset placements, TextAsset groundMask, Material rockTemplate)
            : this(terrain, placements.bytes, groundMask ? groundMask.bytes : null, rockTemplate) { }

        /// <summary>same data as raw bytes (M4 site mode fetches each site's rocks.bin / ground_mask.bin at run time)</summary>
        public MarsRocks(MarsTerrain terrain, byte[] placementBytes, byte[] groundMaskBytes, Material rockTemplate)
        {
            _t = terrain;
            Color[] cols =
            {
                new Color(0.24f, 0.19f, 0.16f), // dark spherules / basaltic clasts on the sand
                new Color(0.42f, 0.31f, 0.22f), // cobbles
                new Color(0.66f, 0.52f, 0.38f), // light, layered sulfate-rich sandstone (Burns formation)
                new Color(0.30f, 0.23f, 0.18f), // boulders
            };
            for (int c = 0; c < 4; c++)
            {
                var m = new Material(rockTemplate) { name = "Rock " + c, enableInstancing = true };
                m.SetColor("_BaseColor", cols[c]);
                m.SetFloat("_Smoothness", c == 2 ? 0.12f : 0.18f);
                _mat[c] = m;
            }
            // detailed (near) and coarse (far) versions of the same seeded shapes
            (int sub0, int sub1, float round, float rough, float strata, int seed)[] spec =
            {
                (2, 2, 0.75f, 0.12f, 0.0f, 11), (3, 1, 0.70f, 0.22f, 0.0f, 23), (3, 1, 0.32f, 0.16f, 0.6f, 37), (3, 1, 0.85f, 0.30f, 0.15f, 51),
            };
            for (int c = 0; c < 4; c++)
            {
                _lod0[c] = BuildVariants(Variants, c, spec[c].sub0, spec[c].round, spec[c].rough, spec[c].strata, spec[c].seed);
                _lod1[c] = spec[c].sub1 == spec[c].sub0 ? _lod0[c] : BuildVariants(Variants, c, spec[c].sub1, spec[c].round, spec[c].rough, spec[c].strata, spec[c].seed);
            }

            if (groundMaskBytes != null) { _mask = groundMaskBytes; _mw = (_t.Width + 1) / 2; _mh = (_t.Height + 1) / 2; }

            // bucket the data-driven rocks per 64 m cell, category and variant
            var b = placementBytes;
            int n = b.Length / 24;
            var f = new float[n * 6];
            System.Buffer.BlockCopy(b, 0, f, 0, n * 24);
            var tmp = new Dictionary<long, List<Matrix4x4>[][]>();
            var totals = new int[4, Variants];
            for (int i = 0; i < n; i++)
            {
                float e = f[i * 6], no = f[i * 6 + 1], u = f[i * 6 + 2], s = f[i * 6 + 3], yaw = f[i * 6 + 4];
                int cat = (int)f[i * 6 + 5];
                if (cat < 1 || cat > 3) continue;
                int variant = (int)(Hash(i * 7919 + cat) * Variants) % Variants;
                float tilt = (Hash(i * 31 + 5) - 0.5f) * (cat == 2 ? 14f : 30f);
                var rot = Quaternion.Euler(tilt, yaw, (Hash(i * 17 + 3) - 0.5f) * 20f);
                float bury = cat == 2 ? 0.45f : 0.3f; // partly buried: rocks sit in the regolith, not on it
                var scale = new Vector3(s * (0.8f + 0.5f * Hash(i * 13)), s * (cat == 2 ? 0.55f : 0.8f + 0.3f * Hash(i * 19)), s * (0.8f + 0.5f * Hash(i * 23)));
                long key = Key(e, no);
                if (!tmp.TryGetValue(key, out var lists)) { lists = new List<Matrix4x4>[4][]; tmp[key] = lists; }
                if (lists[cat] == null) { lists[cat] = new List<Matrix4x4>[Variants]; for (int v = 0; v < Variants; v++) lists[cat][v] = new List<Matrix4x4>(); }
                lists[cat][variant].Add(Matrix4x4.TRS(new Vector3(e, u - bury * scale.y, no), rot, scale));
                totals[cat, variant]++;
            }
            foreach (var kv in tmp)
            {
                var arr = new Matrix4x4[4][][];
                for (int c = 1; c < 4; c++)
                {
                    if (kv.Value[c] == null) continue;
                    arr[c] = new Matrix4x4[Variants][];
                    for (int v = 0; v < Variants; v++) arr[c][v] = kv.Value[c][v].ToArray();
                }
                _cells[kv.Key] = arr;
            }
            // pre-sized draw lists: they can hold every instance, so they never reallocate while driving
            for (int c = 1; c < 4; c++)
            {
                _near[c] = new List<Matrix4x4>[Variants]; _far[c] = new List<Matrix4x4>[Variants];
                for (int v = 0; v < Variants; v++) { _near[c][v] = new List<Matrix4x4>(totals[c, v] + Batch); _far[c][v] = new List<Matrix4x4>(totals[c, v] + Batch); }
            }
            int pebbleCap = (int)(Mathf.PI * PebbleRange * PebbleRange / (PebbleStep * PebbleStep) / Variants * 1.6f) + Batch;
            for (int v = 0; v < Variants; v++) _pebbles[v] = new List<Matrix4x4>(pebbleCap);
        }

        static long Key(float e, float n) => ((long)Mathf.FloorToInt(e / Cell) << 32) ^ (uint)Mathf.FloorToInt(n / Cell);
        static float Hash(int x)
        {
            uint h = (uint)x * 0x9E3779B1u; h ^= h >> 15; h *= 0x85EBCA77u; h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
            return (h & 0xFFFFFF) / 16777216f;
        }

        /// <summary>
        /// Rock meshes: a subdivided octahedron displaced by seeded multi-octave noise (rough / angular), optionally squashed
        /// into a slab with horizontal strata ridges (outcrop). The same seed at a lower subdivision gives the far LOD.
        /// </summary>
        static Mesh[] BuildVariants(int count, int category, int subdiv, float roundness, float roughness, float strata, int seed)
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
                    float noise = 0, amp = 1, freq = 1.6f;
                    for (int o = 0; o < 4; o++) { noise += amp * (Noise3(p * freq + new Vector3(sd, sd * 0.37f, sd * 0.71f)) - 0.5f); amp *= 0.5f; freq *= 2.1f; }
                    float facet = 0;
                    for (int k = 0; k < 6; k++)
                    {
                        var nrm = new Vector3(Hash(sd + 10 + k) - 0.5f, Hash(sd + 20 + k) - 0.5f, Hash(sd + 30 + k) - 0.5f).normalized;
                        facet = Mathf.Max(facet, Vector3.Dot(p, nrm));
                    }
                    float r = Mathf.Lerp(facet * 1.15f, 1f, roundness) + roughness * noise;
                    var q = Vector3.Scale(p * r, axis);
                    if (strata > 0) q.y += strata * 0.04f * Mathf.Sin(q.y * 38f + sd) * (1 - Mathf.Abs(p.y));
                    verts[i] = q * 0.5f;
                }
                for (int i = 0; i < verts.Count; i++) if (verts[i].y < -0.25f) verts[i] = new Vector3(verts[i].x, Mathf.Lerp(verts[i].y, -0.25f, 0.6f), verts[i].z);
                var m = new Mesh { name = $"rock{category}_{v}_s{subdiv}" };
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
            t.AddRange(new[] { 2, 4, 0, 2, 0, 5, 2, 5, 1, 2, 1, 4, 3, 0, 4, 3, 5, 0, 3, 1, 5, 3, 4, 1 });
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
        void RebuildPebbles(Vector3 cam, Vector3 origin)
        {
            for (int v = 0; v < Variants; v++) _pebbles[v].Clear();
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
                    if (Hash(id + 2) > 0.28f + 0.5f * bright) continue;
                    float h = _t.Sample(e, n); if (float.IsNaN(h)) continue;
                    float s = 0.035f + 0.11f * Hash(id + 3) * Hash(id + 4) + 0.08f * bright * Hash(id + 5);
                    var list = _pebbles[(int)(Hash(id + 8) * Variants) % Variants];
                    if (list.Count >= list.Capacity - Batch) continue; // never grow (no garbage); room left for padding
                    list.Add(Matrix4x4.TRS(new Vector3(e - origin.x, h - 0.3f * s - origin.y, n - origin.z), Quaternion.Euler(Hash(id + 6) * 40, Hash(id + 7) * 360, 0), new Vector3(s, s * 0.75f, s * 1.1f)));
                }
        }

        void RebuildVisible(Vector3 cam, Vector3 origin)
        {
            for (int c = 1; c < 4; c++) for (int v = 0; v < Variants; v++) { _near[c][v].Clear(); _far[c][v].Clear(); }
            int reach = Mathf.CeilToInt(Range[2] / Cell) + 1;
            int cx = Mathf.FloorToInt(cam.x / Cell), cz = Mathf.FloorToInt(cam.z / Cell);
            for (int i = -reach; i <= reach; i++)
                for (int j = -reach; j <= reach; j++)
                {
                    if (!_cells.TryGetValue(((long)(cx + i) << 32) ^ (uint)(cz + j), out var cell)) continue;
                    float d = new Vector2((cx + i + 0.5f) * Cell - cam.x, (cz + j + 0.5f) * Cell - cam.z).magnitude;
                    for (int c = 1; c < 4; c++)
                    {
                        if (cell[c] == null || d > Range[c] + Cell * 0.71f) continue;
                        bool near = d < Near[c] + Cell * 0.71f;
                        for (int v = 0; v < Variants; v++)
                        {
                            var src = cell[c][v]; var dst = near ? _near[c][v] : _far[c][v];
                            for (int k = 0; k < src.Length; k++)
                            {
                                var m = src[k];
                                m.m03 -= origin.x; m.m13 -= origin.y; m.m23 -= origin.z; // floating origin, applied once per rebuild
                                dst.Add(m);
                            }
                        }
                    }
                }
        }

        /// <summary>draw everything in range of the camera (site-frame camera position; origin = floating-origin offset)</summary>
        public void Draw(Vector3 cam, Vector3 origin, bool shadows, Vector3 forward = default)
        {
            Instances = DrawCalls = Triangles = 0;
            if (WarmFrames > 0)
            {
                WarmFrames--;
                // one tiny instance a few metres in front of the camera: in view and inside the shadow cascades
                // a real multi-instance batch (a single instance can be drawn without the instancing variant, which is
                // why a one-instance warm-up did not prevent the freezes): 48 tiny instances in front of the camera
                var at = cam + (forward.sqrMagnitude > 0 ? forward.normalized : Vector3.forward) * 3f - origin;
                _warm.Clear();
                for (int k = 0; k < Batch; k++) _warm.Add(Matrix4x4.TRS(at + new Vector3((k % 8) * 0.01f, 0, (k / 8) * 0.01f), Quaternion.identity, Vector3.one * 0.002f));
                for (int c = 0; c < 4; c++)
                    for (int l = 0; l < 2; l++)
                    {
                        var mesh = (l == 0 ? _lod0[c] : _lod1[c])[0];
                        Submit(mesh, _mat[c], _warm, true);
                        Submit(mesh, _mat[c], _warm, false);
                    }
            }
            if (!Visible) return;
            bool originMoved = origin != _lastOrigin;
            if (originMoved || (cam - _lastPebbleCam).sqrMagnitude > 9f) { RebuildPebbles(cam, origin); _lastPebbleCam = cam; }
            if (originMoved || (cam - _lastCam).sqrMagnitude > 36f)
            {
                _sw.Restart();
                RebuildVisible(cam, origin);
                _lastCam = cam; _lastOrigin = origin;
                LastRebuildMs = (float)_sw.Elapsed.TotalMilliseconds; if (LastRebuildMs > MaxRebuildMs) MaxRebuildMs = LastRebuildMs;
            }
            for (int c = 1; c < 4; c++)
                for (int v = 0; v < Variants; v++)
                {
                    Submit(_lod0[c][v], _mat[c], _near[c][v], shadows && c >= 2);
                    Submit(_lod1[c][v], _mat[c], _far[c][v], false);
                }
            for (int v = 0; v < Variants; v++) Submit(_lod0[0][v], _mat[0], _pebbles[v], false);
        }

        void Submit(Mesh mesh, Material mat, List<Matrix4x4> list, bool shadows)
        {
            if (list.Count == 0) return;
            var rp = new RenderParams(mat) { shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true };
            int tri = (int)(mesh.GetIndexCount(0) / 3);
            int real = list.Count;
            // pad to a whole number of batches with zero-scale copies of the last instance (degenerate: draws nothing)
            int pad = (Batch - real % Batch) % Batch;
            if (pad > 0)
            {
                var z = list[real - 1]; z.m00 = z.m01 = z.m02 = z.m10 = z.m11 = z.m12 = z.m20 = z.m21 = z.m22 = 0f;
                for (int k = 0; k < pad; k++) list.Add(z);
            }
            for (int i = 0; i < list.Count; i += Batch)
            {
                Graphics.RenderMeshInstanced(rp, mesh, 0, list, Batch, i); // no copy: the list goes to the GPU as is
                DrawCalls++;
            }
            if (pad > 0) list.RemoveRange(real, pad);
            Instances += real; Triangles += real * tri;
        }
    }
}
