using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// Stage 3 visual reconstruction: Opportunity from NASA's articulated MER model, the expedition rover's geometry,
    /// rock rendering and a run-time adjustable "look" (sun / sky fill / exposure / haze), so presentation can be tuned
    /// from the host app without rebuilding the player. Values that are not sourced are ILLUSTRATIVE and labelled so.
    /// </summary>
    public sealed partial class MarsPrototype
    {
        /// <summary>presentation parameters (ILLUSTRATIVE): sun = direct light scale, ambient = sky-fill scale, exposure in EV</summary>
        public struct Look { public float Sun, Ambient, Exposure, Saturation, FogStart, FogEnd, Bloom; }
        Look _look = new Look { Sun = 3.2f, Ambient = 1.25f, Exposure = 0.1f, Saturation = 0f, FogStart = 350f, FogEnd = 6000f, Bloom = 1.8f };
        MarsRocks _rocks;

        // NASA MER model parts, grouped by the model's own object names
        Dictionary<string, List<Renderer>> _merGroups;
        readonly Dictionary<Renderer, Color> _merBase = new Dictionary<Renderer, Color>();
        List<Renderer> _merWheels;
        MaterialPropertyBlock _mpb;
        const float MerWheelRadius = 0.13f; // PDS: wheel diameter 0.26 m

        /// <summary>'{"sun":3,"ambient":1.2,"exposure":0.1,"saturation":0,"fogStart":350,"fogEnd":6000,"rocks":1}'</summary>
        public void SetLook(string json)
        {
            try
            {
                var o = MiniJson.O(MiniJson.Parse(json));
                float F(string k, float d) => o.TryGetValue(k, out var v) && v != null ? MiniJson.F(v) : d;
                _look.Sun = F("sun", _look.Sun); _look.Ambient = F("ambient", _look.Ambient); _look.Exposure = F("exposure", _look.Exposure);
                _look.Saturation = F("saturation", _look.Saturation); _look.FogStart = F("fogStart", _look.FogStart); _look.FogEnd = F("fogEnd", _look.FogEnd);
                _look.Bloom = F("bloom", _look.Bloom);
                if (_rocks != null && o.ContainsKey("rocks")) _rocks.Visible = F("rocks", 1) > 0.5f;
                if (_dust && o.ContainsKey("dust")) _dust.gameObject.SetActive(F("dust", 1) > 0.5f);
                ApplySun();
                Report("look", LookJson());
            }
            catch (Exception e) { Debug.LogWarning("[Mars] bad look: " + e.Message); }
        }

        string LookJson() => "{" + string.Join(",", new[] { ("sun", _look.Sun), ("ambient", _look.Ambient), ("exposure", _look.Exposure), ("saturation", _look.Saturation), ("fogStart", _look.FogStart), ("fogEnd", _look.FogEnd), ("bloom", _look.Bloom) }
            .Select(p => $"\"{p.Item1}\":{MiniJson.N(p.Item2)}")) + $",\"rockInstances\":{_rocks?.Instances ?? 0},\"rockDrawCalls\":{_rocks?.DrawCalls ?? 0}}}";

        // ------------------------------------------------------------------ Opportunity: NASA articulated MER model

        static Bounds RendererBounds(IEnumerable<Renderer> rs)
        {
            bool first = true; var b = new Bounds();
            foreach (var r in rs) { if (first) { b = r.bounds; first = false; } else b.Encapsulate(r.bounds); }
            return b;
        }

        GameObject BuildMer(out string note)
        {
            var root = new GameObject("Opportunity (NASA articulated MER model)");
            root.transform.SetParent(_world, false);
            var inst = Instantiate(merModel, root.transform, false);
            inst.name = "MER";
            var rs = inst.GetComponentsInChildren<Renderer>();
            Renderer Part(string n) => rs.FirstOrDefault(r => r.name == n);
            // orient: the instrument arm is stowed at the FRONT under the deck; the placement code expects model +X forward
            var body = Part("body"); var turret = Part("arm_turret");
            if (body && turret)
            {
                var fwd = turret.bounds.center - body.bounds.center; fwd.y = 0;
                // the turret sits off the centre line: snap to the model's principal axis (the rover is built square)
                fwd = Mathf.Abs(fwd.x) > Mathf.Abs(fwd.z) ? new Vector3(Mathf.Sign(fwd.x), 0, 0) : new Vector3(0, 0, Mathf.Sign(fwd.z));
                if (fwd.sqrMagnitude > 1e-6f) inst.transform.localRotation = Quaternion.FromToRotation(fwd.normalized, Vector3.right) * inst.transform.localRotation;
            }
            // scale: the PDS width at the solar panels (2.25 m) is the extent across the rover (now z)
            var all = RendererBounds(rs);
            float s = 2.25f / Mathf.Max(all.size.z, 1e-3f);
            inst.transform.localScale *= s;
            all = RendererBounds(rs);
            inst.transform.localPosition -= root.transform.InverseTransformVector(new Vector3(all.center.x, all.min.y, all.center.z) - root.transform.position);
            all = RendererBounds(rs);
            // dust coating: Opportunity was dusty after years on Mars; the amount here is ILLUSTRATIVE
            var dust = new Color(0.86f, 0.72f, 0.58f);
            foreach (var r in rs)
            {
                var mats = r.materials;
                foreach (var m in mats) if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", m.GetColor("_BaseColor") * Color.Lerp(Color.white, dust, 0.2f));
                r.materials = mats;
                r.shadowCastingMode = ShadowCastingMode.On;
                _merBase[r] = mats.Length > 0 && mats[0].HasProperty("_BaseColor") ? mats[0].GetColor("_BaseColor") : Color.white;
            }
            // component groups = the model's own named parts (no invented hotspots)
            _merGroups = new Dictionary<string, List<Renderer>>
            {
                ["solar"] = rs.Where(r => r.name.StartsWith("panels_")).ToList(),
                ["mobility"] = rs.Where(r => r.name.StartsWith("suspension_")).ToList(),
                ["mast"] = rs.Where(r => r.name.StartsWith("mast")).ToList(),
                ["arm"] = rs.Where(r => r.name.StartsWith("arm_")).ToList(),
                ["hga"] = rs.Where(r => r.name.StartsWith("HGAA")).ToList(),
                ["body"] = rs.Where(r => r.name == "body").ToList(),
            };
            _merWheels = rs.Where(r => r.name.EndsWith("_wheel")).ToList();
            _mpb = new MaterialPropertyBlock();
            note = $"NASA 3D Resources articulated MER model ({rs.Length} parts: 6 wheels, rocker-bogie, 5 solar panel sections, 5-joint arm with instrument turret, Pancam mast, high-gain antenna); " +
                   $"scale {s:F3} so the solar-panel span = 2.25 m (PDS); measured height {all.size.y:F2} m vs PDS 1.54 m, length {all.size.x:F2} m vs PDS 1.51 m";
            return root;
        }

        /// <summary>component anchors in rover-local space, from the named part groups</summary>
        void MerAnchors()
        {
            Vector3 C(string g) => _merGroups[g].Count > 0 ? _rover.transform.InverseTransformPoint(RendererBounds(_merGroups[g]).center) : Vector3.up * 0.8f;
            _anchorSolar = C("solar"); _anchorMobility = C("mobility"); _anchorBody = C("body");
            var mast = _merGroups["mast"]; _anchorMast = mast.Count > 0 ? _rover.transform.InverseTransformPoint(RendererBounds(mast.Where(r => r.name == "mast_top" || r.name == "mast_cam")).center) : _anchorBody;
            _anchorArm = C("arm"); _anchorHga = C("hga");
        }
        Vector3 _anchorArm, _anchorHga;

        void MerHighlight(string anchor, float pulse)
        {
            if (_merGroups == null) return;
            var hi = new Color(0.35f, 0.85f, 1f);
            foreach (var g in _merGroups)
                foreach (var r in g.Value)
                {
                    if (g.Key == anchor && pulse >= 0) { _mpb.SetColor("_BaseColor", Color.Lerp(_merBase[r], hi, 0.25f + 0.45f * pulse)); r.SetPropertyBlock(_mpb); }
                    else r.SetPropertyBlock(null);
                }
        }

        Vector3 _lastReplayPos; bool _hasReplayPos;
        void SpinMerWheels(Vector3 newPos)
        {
            if (_merWheels == null) return;
            if (!_hasReplayPos) { _lastReplayPos = newPos; _hasReplayPos = true; return; }
            var d = newPos - _lastReplayPos; d.y = 0; _lastReplayPos = newPos;
            float dist = d.magnitude; if (dist < 1e-4f || dist > 5f) return; // a jump (event seek) is not driving
            float sign = Vector3.Dot(d, _rover.transform.right) >= 0 ? 1 : -1;
            var axis = _rover.transform.forward; // lateral axis (model +X is forward)
            foreach (var w in _merWheels) w.transform.RotateAround(w.bounds.center, axis, -sign * dist / MerWheelRadius * Mathf.Rad2Deg);
        }

        // ------------------------------------------------------------------ expedition rover (ILLUSTRATIVE vehicle)

        static Mesh WheelMesh(float r, float w, int cleats, int seg = 48)
        {
            // tyre with grousers (cleats) on the tread and recessed side walls; axis along local X
            var v = new List<Vector3>(); var t = new List<int>();
            float R(int i) { float a = (float)i / seg * cleats; float f = a - Mathf.Floor(a); return r + (f < 0.28f ? 0.028f : 0f); }
            for (int i = 0; i <= seg; i++)
            {
                float a = i * Mathf.PI * 2 / seg, rr = R(i);
                v.Add(new Vector3(-w / 2, Mathf.Cos(a) * rr, Mathf.Sin(a) * rr));
                v.Add(new Vector3(w / 2, Mathf.Cos(a) * rr, Mathf.Sin(a) * rr));
            }
            for (int i = 0; i < seg; i++) { int a = i * 2; t.AddRange(new[] { a, a + 2, a + 1, a + 1, a + 2, a + 3 }); }
            foreach (float side in new[] { -1f, 1f })
            {
                int c = v.Count; v.Add(new Vector3(side * w * 0.32f, 0, 0)); // recessed hub face
                int b0 = v.Count;
                for (int i = 0; i <= seg; i++) { float a = i * Mathf.PI * 2 / seg; v.Add(new Vector3(side * w / 2, Mathf.Cos(a) * r * 0.97f, Mathf.Sin(a) * r * 0.97f)); }
                for (int i = 0; i < seg; i++) { if (side > 0) t.AddRange(new[] { c, b0 + i, b0 + i + 1 }); else t.AddRange(new[] { c, b0 + i + 1, b0 + i }); }
            }
            var m = new Mesh { name = "wheel" }; m.SetVertices(v); m.SetTriangles(t, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }

        static Mesh DishMesh(float r, float depth, int seg = 32, int rings = 6)
        {
            // single-sided paraboloid with a real centre vertex (no degenerate or back-to-back triangles: those gave
            // zero-length normals, i.e. NaN lighting that the bloom pass spread into a white blob); the material is double-sided
            var v = new List<Vector3> { Vector3.zero }; var t = new List<int>();
            for (int j = 1; j <= rings; j++)
                for (int i = 0; i < seg; i++)
                {
                    float rr = r * j / rings, a = i * Mathf.PI * 2 / seg;
                    v.Add(new Vector3(Mathf.Cos(a) * rr, depth * (rr / r) * (rr / r), Mathf.Sin(a) * rr));
                }
            int Ix(int j, int i) => 1 + (j - 1) * seg + (i % seg);
            for (int i = 0; i < seg; i++) t.AddRange(new[] { 0, Ix(1, i + 1), Ix(1, i) });
            for (int j = 1; j < rings; j++)
                for (int i = 0; i < seg; i++)
                {
                    int a = Ix(j, i), b = Ix(j, i + 1), c = Ix(j + 1, i), d = Ix(j + 1, i + 1);
                    t.AddRange(new[] { a, b, c, b, d, c });
                }
            var m = new Mesh { name = "dish" }; m.SetVertices(v); m.SetTriangles(t, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }

        static Texture2D SolarCellTexture()
        {
            // ILLUSTRATIVE cell grid (dark cells, silver interconnect gaps); not a measured cell layout
            const int S = 256, cells = 8;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, true) { name = "solar cells (illustrative)", wrapMode = TextureWrapMode.Repeat, anisoLevel = 4 };
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    int cx = x % (S / cells), cy = y % (S / cells);
                    bool gap = cx < 2 || cy < 2;
                    bool finger = !gap && (cy % 8 == 4);
                    px[y * S + x] = gap ? new Color32(168, 172, 180, 255) : finger ? new Color32(70, 78, 104, 255) : new Color32(22, 28, 52, 255);
                }
            tex.SetPixels32(px); tex.Apply(true);
            return tex;
        }

        static GameObject MeshPart(Mesh mesh, Transform parent, Vector3 pos, Vector3 euler, Vector3 scale, Material m)
        {
            var go = new GameObject(mesh.name);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = m; r.shadowCastingMode = ShadowCastingMode.On;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localRotation = Quaternion.Euler(euler); go.transform.localScale = scale;
            return go;
        }

        /// <summary>a structural bar between two points (local to parent)</summary>
        static void Bar(Transform parent, Vector3 a, Vector3 b, float thick, Material m)
        {
            var mid = (a + b) / 2; var d = b - a;
            Part(PrimitiveType.Cube, parent, mid, new Vector3(thick, thick, d.magnitude), Vector3.zero, m);
            parent.GetChild(parent.childCount - 1).localRotation = Quaternion.LookRotation(d.normalized, Vector3.up);
        }

        GameObject BuildExpeditionRoverDetailed()
        {
            var root = new GameObject("Expedition rover (ILLUSTRATIVE vehicle, not a NASA design)");
            root.transform.SetParent(_world, false);
            _body = new GameObject("body").transform; _body.SetParent(root.transform, false);
            Material M(Color c, float metal, float smooth, Texture tex = null, Vector2? tiling = null)
            {
                var m = new Material(roverTemplate); m.SetColor("_BaseColor", c); m.SetFloat("_Metallic", metal); m.SetFloat("_Smoothness", smooth);
                if (tex) { m.SetTexture("_BaseMap", tex); m.SetTextureScale("_BaseMap", tiling ?? Vector2.one); }
                return m;
            }
            var white = M(new Color(0.78f, 0.77f, 0.74f), 0f, 0.28f);
            var foil = M(new Color(0.78f, 0.6f, 0.26f), 0.7f, 0.38f);           // gold MLI blanket look
            var dark = M(new Color(0.5f, 0.5f, 0.52f), 0.7f, 0.32f);            // brushed aluminium wheels (rover wheels are machined aluminium)
            var metal = M(new Color(0.6f, 0.61f, 0.64f), 0.75f, 0.38f);
            var glass = M(new Color(0.02f, 0.03f, 0.05f), 0.4f, 0.75f);
            var cells = M(Color.white, 0.15f, 0.42f, SolarCellTexture(), new Vector2(3, 4));
            var accent = M(new Color(0.85f, 0.4f, 0.1f), 0f, 0.4f);
            // chassis: white box with gold-foil side blankets and a top equipment deck
            Part(PrimitiveType.Cube, _body, new Vector3(0, 0.84f, 0), new Vector3(1.45f, 0.4f, 2.35f), Vector3.zero, white);
            Part(PrimitiveType.Cube, _body, new Vector3(-0.735f, 0.84f, 0), new Vector3(0.02f, 0.32f, 2.2f), Vector3.zero, foil);
            Part(PrimitiveType.Cube, _body, new Vector3(0.735f, 0.84f, 0), new Vector3(0.02f, 0.32f, 2.2f), Vector3.zero, foil);
            Part(PrimitiveType.Cube, _body, new Vector3(0, 0.84f, -1.18f), new Vector3(1.3f, 0.3f, 0.02f), Vector3.zero, foil);
            Part(PrimitiveType.Cube, _body, new Vector3(0, 0.79f, 1.19f), new Vector3(1.35f, 0.12f, 0.03f), Vector3.zero, accent);
            // solar deck with cell grid on a metal frame
            Part(PrimitiveType.Cube, _body, new Vector3(0, 1.065f, -0.12f), new Vector3(1.95f, 0.035f, 2.05f), Vector3.zero, metal);
            Part(PrimitiveType.Cube, _body, new Vector3(0, 1.087f, -0.12f), new Vector3(1.88f, 0.01f, 1.98f), Vector3.zero, cells);
            // camera mast: tube, pan-tilt head, stereo lenses
            Part(PrimitiveType.Cylinder, _body, new Vector3(0.5f, 1.45f, 0.95f), new Vector3(0.07f, 0.36f, 0.07f), Vector3.zero, metal);
            Part(PrimitiveType.Cube, _body, new Vector3(0.5f, 1.86f, 0.95f), new Vector3(0.44f, 0.14f, 0.17f), Vector3.zero, white);
            Part(PrimitiveType.Cylinder, _body, new Vector3(0.36f, 1.86f, 1.04f), new Vector3(0.07f, 0.02f, 0.07f), new Vector3(90, 0, 0), glass);
            Part(PrimitiveType.Cylinder, _body, new Vector3(0.64f, 1.86f, 1.04f), new Vector3(0.07f, 0.02f, 0.07f), new Vector3(90, 0, 0), glass);
            // high-gain dish on a gimbal
            Part(PrimitiveType.Cylinder, _body, new Vector3(-0.45f, 1.16f, 0.65f), new Vector3(0.05f, 0.08f, 0.05f), Vector3.zero, metal);
            var dishMat = new Material(white); dishMat.SetFloat("_Cull", 0f); // double-sided
            MeshPart(DishMesh(0.3f, 0.09f), _body, new Vector3(-0.45f, 1.25f, 0.65f), new Vector3(-25, 0, 0), Vector3.one, dishMat);
            // six cleated wheels with hubs and spokes; rocker-bogie links between body pivot, bogie pivot and wheel hubs
            var wheelMesh = WheelMesh(WheelR - 0.028f, 0.26f, 18);
            _wheels = new Transform[6]; _wheelSpin = new Transform[6];
            for (int i = 0; i < 6; i++)
            {
                var w = new GameObject("wheel" + i).transform; w.SetParent(root.transform, false);
                w.localPosition = new Vector3(WheelXZ[i].x, WheelR, WheelXZ[i].y);
                var spin = new GameObject("spin").transform; spin.SetParent(w, false);
                MeshPart(wheelMesh, spin, Vector3.zero, Vector3.zero, Vector3.one, dark);
                float side = Mathf.Sign(WheelXZ[i].x);
                Part(PrimitiveType.Cylinder, spin, new Vector3(side * 0.1f, 0, 0), new Vector3(0.16f, 0.03f, 0.16f), new Vector3(0, 0, 90), metal);
                for (int k = 0; k < 6; k++)
                {
                    float a = k * 60f;
                    Part(PrimitiveType.Cube, spin, new Vector3(side * 0.095f, Mathf.Cos(a * Mathf.Deg2Rad) * 0.17f, Mathf.Sin(a * Mathf.Deg2Rad) * 0.17f), new Vector3(0.025f, 0.03f, 0.2f), new Vector3(-a, 0, 0), metal);
                }
                _wheels[i] = w; _wheelSpin[i] = spin;
            }
            foreach (float sx in new[] { -1f, 1f })
            {
                var pivot = new Vector3(sx * 0.83f, 0.68f, 0.05f);          // rocker pivot on the body side
                var bogie = new Vector3(sx * 0.93f, 0.52f, -0.5f);          // bogie pivot
                var front = new Vector3(sx * 0.98f, WheelR + 0.05f, 1.0f);
                var mid = new Vector3(sx * 0.98f, WheelR + 0.05f, 0f);
                var rear = new Vector3(sx * 0.98f, WheelR + 0.05f, -1.0f);
                Bar(_body, pivot, front + new Vector3(0, 0.1f, 0), 0.06f, metal);
                Bar(_body, pivot, bogie, 0.06f, metal);
                Bar(_body, bogie, mid + new Vector3(0, 0.1f, 0), 0.05f, metal);
                Bar(_body, bogie, rear + new Vector3(0, 0.1f, 0), 0.05f, metal);
                Part(PrimitiveType.Cylinder, _body, pivot, new Vector3(0.11f, 0.05f, 0.11f), new Vector3(0, 0, 90), dark);
                Part(PrimitiveType.Cylinder, _body, bogie, new Vector3(0.09f, 0.05f, 0.09f), new Vector3(0, 0, 90), dark);
            }
            Bar(_body, new Vector3(-0.83f, 0.68f, 0.05f), new Vector3(0.83f, 0.68f, 0.05f), 0.04f, metal); // differential bar
            return root;
        }
    }
}
