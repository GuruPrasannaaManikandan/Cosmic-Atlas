using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// HiRISE DTM terrain built as chunked meshes in the site ENU frame (x = east, y = up, z = north, metres).
    /// Heights come from scripts/mars/prepare_victoria_prototype.py: uint16 quantised (step ≈ 1.2 mm), curvature about
    /// the origin already applied. No-data cells (DTM borders) are left as holes — never filled with invented relief.
    /// Each chunk has a LODGroup (base stride, ×2, ×4) and skirts to hide cracks between LODs.
    /// </summary>
    public sealed class MarsTerrain
    {
        public int Width, Height;
        public float SpacingE, SpacingN, East0, North0, UpMin, Step;
        ushort[] _q;
        const ushort NoData = 65535;
        public readonly List<GameObject> Chunks = new List<GameObject>();
        public int Triangles;

        public static MarsTerrain Load(TextAsset heights, TextAsset meta)
        {
            var m = MiniJson.O(MiniJson.Parse(meta.text));
            var t = new MarsTerrain
            {
                Width = MiniJson.I(m["width"]), Height = MiniJson.I(m["height"]),
                SpacingE = MiniJson.F(MiniJson.A(m["spacingM"])[0]), SpacingN = MiniJson.F(MiniJson.A(m["spacingM"])[1]),
                East0 = MiniJson.F(m["gridEastOfOriginM"]), North0 = MiniJson.F(m["gridNorthOfOriginM"]),
                UpMin = MiniJson.F(m["upMinM"]), Step = MiniJson.F(m["quantStepM"]),
            };
            var b = heights.bytes;
            t._q = new ushort[t.Width * t.Height];
            System.Buffer.BlockCopy(b, 0, t._q, 0, t._q.Length * 2);
            return t;
        }

        public bool Valid(int c, int r) => c >= 0 && r >= 0 && c < Width && r < Height && _q[r * Width + c] != NoData;
        public float Up(int c, int r) => UpMin + _q[r * Width + c] * Step;
        public Vector3 Pos(int c, int r) => new Vector3(East0 + c * SpacingE, Up(c, r), North0 - r * SpacingN);

        /// <summary>Bilinear height at (east, north); NaN outside data.</summary>
        public float Sample(float east, float north)
        {
            float fc = (east - East0) / SpacingE, fr = (North0 - north) / SpacingN;
            int c = Mathf.FloorToInt(fc), r = Mathf.FloorToInt(fr);
            if (!Valid(c, r) || !Valid(c + 1, r) || !Valid(c, r + 1) || !Valid(c + 1, r + 1)) return float.NaN;
            float tc = fc - c, tr = fr - r;
            return Mathf.Lerp(Mathf.Lerp(Up(c, r), Up(c + 1, r), tc), Mathf.Lerp(Up(c, r + 1), Up(c + 1, r + 1), tc), tr);
        }

        Vector3 Normal(int c, int r)
        {
            int c0 = Valid(c - 1, r) ? c - 1 : c, c1 = Valid(c + 1, r) ? c + 1 : c;
            int r0 = Valid(c, r - 1) ? r - 1 : r, r1 = Valid(c, r + 1) ? r + 1 : r;
            float dx = (Up(c1, r) - Up(c0, r)) / Mathf.Max(1, c1 - c0) / SpacingE;
            float dz = (Up(c, r0) - Up(c, r1)) / Mathf.Max(1, r1 - r0) / SpacingN; // north is -row
            return new Vector3(-dx, 1, -dz).normalized;
        }

        public void Build(Transform parent, Material mat, int baseStride, bool castShadows, int chunkCells = 128)
        {
            foreach (var g in Chunks) Object.Destroy(g);
            Chunks.Clear();
            Triangles = 0;
            for (int r0 = 0; r0 < Height - 1; r0 += chunkCells)
                for (int c0 = 0; c0 < Width - 1; c0 += chunkCells)
                {
                    var lods = new List<LOD>();
                    var go = new GameObject($"chunk_{c0}_{r0}");
                    go.transform.SetParent(parent, false);
                    float[] screen = { 0.25f, 0.08f, 0.01f };
                    for (int l = 0; l < 3; l++)
                    {
                        int s = baseStride << l;
                        var mesh = BuildChunk(c0, r0, chunkCells, s);
                        if (mesh == null) continue;
                        var lg = new GameObject("lod" + l);
                        lg.transform.SetParent(go.transform, false);
                        lg.AddComponent<MeshFilter>().sharedMesh = mesh;
                        var mr = lg.AddComponent<MeshRenderer>();
                        mr.sharedMaterial = mat;
                        mr.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                        mr.receiveShadows = true;
                        lods.Add(new LOD(screen[l], new Renderer[] { mr }));
                        if (l == 0) Triangles += mesh.triangles.Length / 3;
                        mesh.UploadMeshData(true); // free the CPU copy (WebGL heap)
                    }
                    if (lods.Count == 0) { Object.Destroy(go); continue; }
                    var group = go.AddComponent<LODGroup>();
                    group.SetLODs(lods.ToArray());
                    group.RecalculateBounds();
                    Chunks.Add(go);
                }
        }

        Mesh BuildChunk(int c0, int r0, int cells, int s)
        {
            int c1 = Mathf.Min(c0 + cells, Width - 1), r1 = Mathf.Min(r0 + cells, Height - 1);
            int nc = (c1 - c0) / s + 1, nr = (r1 - r0) / s + 1;
            if (nc < 2 || nr < 2) return null;
            var verts = new List<Vector3>(nc * nr + 4 * (nc + nr));
            var norms = new List<Vector3>(verts.Capacity);
            var uvs = new List<Vector2>(verts.Capacity);
            var idx = new int[nc * nr];
            for (int j = 0; j < nr; j++)
                for (int i = 0; i < nc; i++)
                {
                    int c = c0 + i * s, r = r0 + j * s;
                    if (!Valid(c, r)) { idx[j * nc + i] = -1; continue; }
                    idx[j * nc + i] = verts.Count;
                    verts.Add(Pos(c, r));
                    norms.Add(Normal(c, r));
                    uvs.Add(new Vector2(c / (float)(Width - 1), 1f - r / (float)(Height - 1)));
                }
            var tris = new List<int>(nc * nr * 6);
            for (int j = 0; j < nr - 1; j++)
                for (int i = 0; i < nc - 1; i++)
                {
                    int a = idx[j * nc + i], b = idx[j * nc + i + 1], c = idx[(j + 1) * nc + i], d = idx[(j + 1) * nc + i + 1];
                    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
                    // rows run south: (a b / c d) with clockwise winding seen from above (Unity: clockwise = front)
                    tris.Add(a); tris.Add(b); tris.Add(c);
                    tris.Add(b); tris.Add(d); tris.Add(c);
                }
            if (tris.Count == 0) return null;
            // skirts: drop each border vertex 2 m (× stride) so LOD seams never show sky
            float drop = 2f * s;
            void Skirt(int ia, int ib)
            {
                if (ia < 0 || ib < 0) return;
                int na = verts.Count; verts.Add(verts[ia] + Vector3.down * drop); norms.Add(norms[ia]); uvs.Add(uvs[ia]);
                int nb = verts.Count; verts.Add(verts[ib] + Vector3.down * drop); norms.Add(norms[ib]); uvs.Add(uvs[ib]);
                tris.Add(ia); tris.Add(na); tris.Add(ib); tris.Add(ib); tris.Add(na); tris.Add(nb);
                tris.Add(ia); tris.Add(ib); tris.Add(na); tris.Add(ib); tris.Add(nb); tris.Add(na);
            }
            for (int i = 0; i < nc - 1; i++) { Skirt(idx[i], idx[i + 1]); Skirt(idx[(nr - 1) * nc + i], idx[(nr - 1) * nc + i + 1]); }
            for (int j = 0; j < nr - 1; j++) { Skirt(idx[j * nc], idx[(j + 1) * nc]); Skirt(idx[j * nc + nc - 1], idx[(j + 1) * nc + nc - 1]); }
            var m = new Mesh { indexFormat = verts.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            m.SetVertices(verts); m.SetNormals(norms); m.SetUVs(0, uvs); m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
