using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// M4 SITE MODE: the same player renders any Mars landing site from a package fetched at run time
    /// (frontend/public/mars-sites/&lt;site&gt;/, built by scripts/mars/build_site.py from USGS controlled HiRISE products).
    ///
    /// The host page sets window.__marsSite = '{"id":"viking-1","base":"/mars-sites/"}' BEFORE the player boots; an empty
    /// value keeps the Victoria scene exactly as before. One site per player instance: switching sites quits the player
    /// (React) and starts a new one, so a site's meshes and textures never outlive it and two sites never coexist.
    ///
    /// What the player draws and how honest each part is:
    /// - terrain: the controlled HiRISE DTM on an exact local ENU grid (MEASURED / DATA-DERIVED); a mid-range horizon from
    ///   the same DTM (decimated); ground shade from the HiRISE orthoimage with the ILLUSTRATIVE soil-colour ramp;
    /// - hardware: NASA 3D Resources meshes (Viking lander, Curiosity, InSight), NASA's articulated MER model (Spirit), or
    ///   DOCUMENTED RECONSTRUCTIONS built here from sourced dimensions where NASA publishes no model (Pathfinder lander,
    ///   Sojourner, Phoenix) — each labelled in site.json and in the host's HUD;
    /// - placement: the hardware sits at the site's sourced coordinate (site.json "origin"), never moved for a better view;
    /// - controls: rover missions drive the ILLUSTRATIVE expedition vehicle (as at Victoria); stationary landers are
    ///   explored on foot in first person. The historical vehicles themselves are never driven.
    /// </summary>
    public sealed partial class MarsPrototype
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern string MarsGetSite();
#else
        /// <summary>editor / test stand-in for window.__marsSite</summary>
        public static string EditorSite = "";
        static string MarsGetSite() => EditorSite;
#endif

        sealed class Hw
        {
            public string Id, Label, Model, Kind, Provenance, Note = "";
            public GameObject Go;
            public float Radius = 1.5f;
            public readonly List<Renderer> All = new List<Renderer>();
            public readonly Dictionary<string, List<Renderer>> Groups = new Dictionary<string, List<Renderer>>();
            public readonly Dictionary<Renderer, Color> Base = new Dictionary<Renderer, Color>();
            public Vector2 XZ => new Vector2(Go.transform.localPosition.x, Go.transform.localPosition.z);
        }

        bool _siteMode, _siteReady;
        string _siteId = "", _siteBase = "/mars-sites/", _siteKind = "lander", _siteError;
        Dictionary<string, object> _siteDef;
        MarsTerrain _horizon;
        Material _siteTerrainMat, _horizonMat;
        Texture2D _siteAlbedo;
        readonly List<Hw> _hw = new List<Hw>();
        readonly List<UnityEngine.Object> _siteOwned = new List<UnityEngine.Object>(); // runtime meshes / materials / textures to free
        string _insHw = "", _insComp = "";
        DateTime _siteLandingUtc, _siteSceneUtc; double _siteLandingLon; int _siteSolBase = 1;
        string _siteCheckJson;
        float _fov = 55f;
        readonly HashSet<string> _siteDiscovered = new HashSet<string>();
        Vector2 _siteStart; float _siteStartHeading;

        // ------------------------------------------------------------------ boot

        /// <summary>Called first in Start(): true when the host asked for a landing site (then Victoria is never built).</summary>
        bool TryStartSite()
        {
            string req = null;
            try { req = MarsGetSite(); } catch (Exception e) { Debug.LogWarning("[Mars] site request unreadable: " + e.Message); }
            if (string.IsNullOrEmpty(req)) return false;
            try
            {
                var o = MiniJson.O(MiniJson.Parse(req));
                _siteId = Str(o, "id"); if (o.ContainsKey("base")) _siteBase = Str(o, "base");
                if (!_siteBase.EndsWith("/")) _siteBase += "/";
            }
            catch (Exception e) { Debug.LogError("[Mars] bad site request " + req + ": " + e.Message); return false; }
            if (string.IsNullOrEmpty(_siteId)) return false;
            _siteMode = true;
            _world = new GameObject("World (floating origin)").transform;
            _profiles = MarsQualityProfile.LoadAll(profilesJson);
            StartCoroutine(SiteBoot());
            return true;
        }

        static string Str(Dictionary<string, object> o, string k, string def = "") => o != null && o.TryGetValue(k, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) : def;
        static float Num(Dictionary<string, object> o, string k, float def = 0) => o != null && o.TryGetValue(k, out var v) && v != null ? MiniJson.F(v) : def;

        IEnumerator Fetch(string url, Action<UnityWebRequest> ok)
        {
            using (var r = UnityWebRequest.Get(url))
            {
                yield return r.SendWebRequest();
                if (r.result != UnityWebRequest.Result.Success) { _siteError = $"{url}: {r.error}"; yield break; }
                ok(r);
            }
        }

        IEnumerator SiteBoot()
        {
            float t0 = Time.realtimeSinceStartup;
            string dir = _siteBase + _siteId + "/";
            string siteText = null, terrainMeta = null, horizonMeta = null; byte[] heights = null, horizonBytes = null, albedo = null;
            yield return Fetch(dir + "site.json", r => siteText = r.downloadHandler.text);
            if (siteText == null) { SiteFail(); yield break; }
            _siteDef = MiniJson.O(MiniJson.Parse(siteText));
            _siteKind = Str(_siteDef, "mode", "lander");
            yield return Fetch(dir + "terrain.json", r => terrainMeta = r.downloadHandler.text);
            yield return Fetch(dir + "height.bin", r => heights = r.downloadHandler.data);
            yield return Fetch(dir + "albedo.jpg", r => albedo = r.downloadHandler.data);
            yield return Fetch(dir + "terrain_check.json", r => _siteCheckJson = r.downloadHandler.text);
            if (terrainMeta == null || heights == null || albedo == null) { SiteFail(); yield break; }
            byte[] rocksBin = null, maskBin = null;
            yield return Fetch(dir + "rocks.bin", r => rocksBin = r.downloadHandler.data);
            yield return Fetch(dir + "ground_mask.bin", r => maskBin = r.downloadHandler.data);
            yield return Fetch(dir + "horizon.json", r => horizonMeta = r.downloadHandler.text);
            yield return Fetch(dir + "horizon.bin", r => horizonBytes = r.downloadHandler.data);
            _siteError = null; // the horizon is optional

            _terrain = MarsTerrain.Load(heights, terrainMeta);
            heights = null;
            if (horizonMeta != null && horizonBytes != null)
            {
                try { _horizon = MarsTerrain.Load(horizonBytes, horizonMeta); } catch (Exception e) { Debug.LogWarning("[Mars] horizon: " + e.Message); }
            }
            horizonBytes = null;
            // rocks: placement from HiRISE brightness + DTM slope (build_site.py), shapes ILLUSTRATIVE (MarsRocks)
            if (rocksBin != null && rocksBin.Length >= 24 && rockMaterial)
            {
                try { _rocks = new MarsRocks(_terrain, rocksBin, maskBin, rockMaterial); } catch (Exception e) { Debug.LogWarning("[Mars] rocks: " + e.Message); }
            }
            rocksBin = null; maskBin = null;
            var origin = MiniJson.O(_siteDef["origin"]);
            _siteLat = MiniJson.D(origin["latDeg"]); _siteLon = MiniJson.D(origin["lonEastDeg"]);
            if (_siteLon < 0) _siteLon += 360;

            // materials: the Victoria terrain material with this site's ground shade (normals come from the DTM mesh)
            _siteAlbedo = new Texture2D(2, 2, TextureFormat.RGB24, true) { name = _siteId + " albedo" };
            _siteAlbedo.LoadImage(albedo);
            albedo = null;
            _siteAlbedo.wrapMode = TextureWrapMode.Clamp; _siteAlbedo.anisoLevel = 8; _siteAlbedo.filterMode = FilterMode.Trilinear;
            _siteAlbedo.Apply(true, true); // mipmaps, then drop the CPU copy (WebGL heap)
            _siteOwned.Add(_siteAlbedo);
            _siteTerrainMat = new Material(terrainMaterial) { name = _siteId + " terrain" };
            _siteTerrainMat.SetTexture("_BaseMap", _siteAlbedo);
            _siteTerrainMat.SetTexture("_BumpMap", Texture2D.normalTexture);
            _siteOwned.Add(_siteTerrainMat);
            var tone = new Texture2D(4, 4, TextureFormat.RGB24, false) { name = "horizon tone" };
            var px = new Color32[16]; for (int k = 0; k < 16; k++) px[k] = new Color32(118, 82, 58, 255); // ILLUSTRATIVE regolith tone
            tone.SetPixels32(px); tone.Apply(false, true);
            _horizonMat = new Material(terrainMaterial) { name = _siteId + " horizon" };
            _horizonMat.SetTexture("_BaseMap", tone); _horizonMat.SetTexture("_BumpMap", Texture2D.normalTexture);
            _siteOwned.Add(tone); _siteOwned.Add(_horizonMat);

            // time: the scene's documented date at an ILLUSTRATIVE local time; the mission sol from the landing
            var scene = MiniJson.O(_siteDef["scene"]);
            var date = DateTime.Parse(Str(scene, "date"), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
            _siteSceneUtc = MarsTime.UtcForLtst(date.Date, _siteLon, Num(scene, "ltst", 14f));
            _utc = _siteSceneUtc;
            var landing = MiniJson.O(_siteDef["landing"]);
            _siteLandingUtc = DateTime.Parse(Str(landing, "utc"), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
            _siteLandingLon = _siteLon;
            _siteSolBase = (int)Num(landing, "landingSol", 1);
            _sol = SiteSol(_utc);
            _tau = Num(scene, "tau", 0.5f);
            _tauLabel = Str(scene, "tauLabel", $"tau {_tau:0.##} ASSUMED (no sourced value for this sol)");

            // hardware
            foreach (var h in MiniJson.A(_siteDef["hardware"]))
            {
                var d = MiniJson.O(h);
                yield return BuildHardware(d);
            }

            // the explorer: start point and vehicle
            var st = MiniJson.O(_siteDef["start"]);
            _siteStart = new Vector2(Num(st, "x"), Num(st, "z"));
            _siteStartHeading = Num(st, "headingDeg") * Mathf.Deg2Rad;
            _pos = _siteStart; _heading = _siteStartHeading; _camYaw = _heading; _camYawOffset = 0;
            _rover = _hw.Count > 0 ? _hw[0].Go : new GameObject("no hardware");
            if (_siteKind == "rover")
            {
                _player = BuildExpeditionRoverDetailed();
                Contact(_pos, _heading, out _bodyY, out _pitch, out _roll);
                _camPitch = 0.24f; _camDist = 7.5f;
            }
            else
            {
                _player = new GameObject("Explorer on foot (camera only)");
                _player.transform.SetParent(_world, false);
                _bodyY = SafeHeight(_pos.x, _pos.y);
                _camPitch = 0.05f; _camDist = 0;
            }
            _player.SetActive(false);
            cam.fieldOfView = _fov;

            ApplySun();
            ApplyProfile(DefaultProfileId());
            MakeDust();
            _siteReady = true;
            Debug.Log($"[Mars] site {_siteId} ready in {(Time.realtimeSinceStartup - t0):F1} s: terrain {_terrain.Width}x{_terrain.Height}, {_hw.Count} hardware");
            Report("ready", ReadyJson());
            if (_pendingEmbed != null) { var j = _pendingEmbed; _pendingEmbed = null; SiteEmbed(j); }
        }

        void SiteFail()
        {
            Debug.LogError("[Mars] site load failed: " + _siteError);
            Report("error", $"{{\"site\":{MiniJson.Q(_siteId)},\"message\":{MiniJson.Q(_siteError ?? "unknown")}}}");
        }

        int SiteSol(DateTime utc)
        {
            double Local(DateTime t) => new MarsTime(t).Msd + (_siteLandingLon > 180 ? _siteLandingLon - 360 : _siteLandingLon) / 360.0;
            return (int)(Math.Floor(Local(utc)) - Math.Floor(Local(_siteLandingUtc))) + _siteSolBase;
        }

        // ------------------------------------------------------------------ hardware

        IEnumerator BuildHardware(Dictionary<string, object> d)
        {
            var hw = new Hw
            {
                Id = Str(d, "id"), Label = Str(d, "label"), Model = Str(d, "model"), Kind = Str(d, "kind", "lander"),
                Provenance = Str(d, "provenance"), Radius = Num(d, "radius", 1.5f),
            };
            GameObject go = null;
            if (hw.Model.StartsWith("glb:"))
            {
                string name = hw.Model.Substring(4), json = null; byte[] bin = null;
                yield return Fetch(_siteBase + "models/" + name + ".json", r => json = r.downloadHandler.text);
                yield return Fetch(_siteBase + "models/" + name + ".bin", r => bin = r.downloadHandler.data);
                if (json == null || bin == null) { Debug.LogError("[Mars] model " + name + ": " + _siteError); _siteError = null; yield break; }
                go = BuildGlbModel(hw.Label, json, bin, out hw.Note);
            }
            else if (hw.Model == "mer")
            {
                go = merModel ? BuildMer(out hw.Note) : MarsRover.Build(roverJson, roverTemplate, out hw.Note);
                // Spirit is Opportunity's twin: the same NASA articulated MER model (its own named part groups)
                if (_merGroups != null) foreach (var g in _merGroups) hw.Groups["mer:" + g.Key] = g.Value;
            }
            else if (hw.Model == "proc:sojourner") go = BuildSojourner(out hw.Note);
            else if (hw.Model == "proc:pathfinder-lander") go = BuildPathfinderLander(out hw.Note);
            else if (hw.Model == "proc:phoenix") go = BuildPhoenix(out hw.Note);
            else if (hw.Model == "proc:mer-lander") go = BuildMerLander(out hw.Note);
            else { Debug.LogError("[Mars] unknown model " + hw.Model); yield break; }

            go.name = hw.Label;
            go.transform.SetParent(_world, false);
            float x = Num(d, "x"), z = Num(d, "z");
            // rest on the terrain: the lowest of the ground heights under the footprint (feet / wheels touch, never float)
            float g0 = SafeHeight(x, z);
            float r = Mathf.Max(0.3f, hw.Radius * 0.6f);
            foreach (var o in new[] { new Vector2(r, 0), new Vector2(-r, 0), new Vector2(0, r), new Vector2(0, -r) })
            {
                float gh = _terrain.Sample(x + o.x, z + o.y);
                if (!float.IsNaN(gh)) g0 = Mathf.Min(g0, gh);
            }
            go.transform.localPosition = new Vector3(x, g0 + Num(d, "lift"), z);
            go.transform.localRotation = Quaternion.Euler(0, Num(d, "yawDeg"), 0) * go.transform.localRotation;
            hw.Go = go;
            foreach (var rr in go.GetComponentsInChildren<Renderer>())
            {
                hw.All.Add(rr);
                rr.shadowCastingMode = ShadowCastingMode.On;
                var m = rr.sharedMaterial;
                hw.Base[rr] = m && m.HasProperty("_BaseColor") ? m.GetColor("_BaseColor") : Color.white;
            }
            // components: renderers whose object name starts with one of the listed part names ("mer:<group>" for MER)
            if (d.TryGetValue("components", out var comps) && comps != null)
                foreach (var c in MiniJson.A(comps))
                {
                    var co = MiniJson.O(c); string cid = Str(co, "id");
                    var list = new List<Renderer>();
                    foreach (var p in MiniJson.A(co["parts"]))
                    {
                        string pn = Convert.ToString(p, CultureInfo.InvariantCulture);
                        if (hw.Groups.TryGetValue(pn, out var mg)) { list.AddRange(mg); continue; }
                        list.AddRange(hw.All.Where(rr => rr.gameObject.name.StartsWith(pn, StringComparison.Ordinal) || (rr.transform.parent && rr.transform.parent.name.StartsWith(pn, StringComparison.Ordinal))));
                    }
                    hw.Groups[cid] = list.Distinct().ToList();
                }
            _hw.Add(hw);
        }

        /// <summary>
        /// A NASA 3D Resources model converted by scripts/mars/convert_glb.py: one mesh per named part, flat PBR colours from
        /// the model's own materials, metres, glTF axes (z mirrored here, with the triangle winding flipped to match).
        /// </summary>
        GameObject BuildGlbModel(string label, string json, byte[] bin, out string note)
        {
            var doc = MiniJson.O(MiniJson.Parse(json));
            var root = new GameObject(label);
            var mats = new Dictionary<string, Material>();
            int tris = 0;
            foreach (var po in MiniJson.A(doc["parts"]))
            {
                var p = MiniJson.O(po);
                int vc = MiniJson.I(p["vertexCount"]), ic = MiniJson.I(p["indexCount"]);
                int po0 = MiniJson.I(p["positionsOffset"]), no0 = MiniJson.I(p["normalsOffset"]), io0 = MiniJson.I(p["indicesOffset"]);
                var v = new Vector3[vc]; var n = new Vector3[vc]; var idx = new int[ic];
                for (int i = 0; i < vc; i++)
                {
                    int o = po0 + i * 12;
                    v[i] = new Vector3(BitConverter.ToSingle(bin, o), BitConverter.ToSingle(bin, o + 4), -BitConverter.ToSingle(bin, o + 8));
                    int q = no0 + i * 3;
                    n[i] = new Vector3((sbyte)bin[q] / 127f, (sbyte)bin[q + 1] / 127f, -(sbyte)bin[q + 2] / 127f);
                }
                for (int i = 0; i + 2 < ic; i += 3)
                {
                    idx[i] = (int)BitConverter.ToUInt32(bin, io0 + i * 4);
                    idx[i + 1] = (int)BitConverter.ToUInt32(bin, io0 + (i + 2) * 4); // mirrored z: swap to keep front faces outward
                    idx[i + 2] = (int)BitConverter.ToUInt32(bin, io0 + (i + 1) * 4);
                }
                var mesh = new Mesh { name = Str(p, "name"), indexFormat = vc > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.vertices = v; mesh.normals = n; mesh.triangles = idx; mesh.RecalculateBounds();
                mesh.UploadMeshData(true);
                _siteOwned.Add(mesh);
                tris += ic / 3;
                var col = MiniJson.A(p["color"]);
                string key = Str(p, "material") + "|" + string.Join(",", col.Select(c => Convert.ToString(c, CultureInfo.InvariantCulture)));
                if (!mats.TryGetValue(key, out var m))
                {
                    m = new Material(roverTemplate) { name = key };
                    var c = new Color(MiniJson.F(col[0]), MiniJson.F(col[1]), MiniJson.F(col[2]));
                    m.SetColor("_BaseColor", c.linear.maxColorComponent < 0.004f ? new Color(0.02f, 0.02f, 0.02f) : c);
                    m.SetFloat("_Metallic", Mathf.Clamp01(Num(p, "metalness")));
                    m.SetFloat("_Smoothness", Mathf.Clamp01(1f - Num(p, "roughness", 0.6f)) * 0.8f);
                    mats[key] = m; _siteOwned.Add(m);
                }
                var go = new GameObject(Str(p, "name"));
                go.transform.SetParent(root.transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                go.AddComponent<MeshRenderer>().sharedMaterial = m;
            }
            var cal = MiniJson.O(doc["calibration"]);
            note = $"{Str(doc, "source")}; {Str(cal, "method")}; {tris} triangles";
            return root;
        }

        // ------------------------------------------------------------------ documented reconstructions (no NASA model exists)

        Material SiteMat(string name, Color c, float metal, float smooth, Texture2D tex = null)
        {
            var m = new Material(roverTemplate) { name = name };
            m.SetColor("_BaseColor", c); m.SetFloat("_Metallic", metal); m.SetFloat("_Smoothness", smooth);
            if (tex) m.SetTexture("_BaseMap", tex);
            _siteOwned.Add(m);
            return m;
        }

        /// <summary>solar-cell texture: dark cells separated by bright interconnect lines (cell layout ILLUSTRATIVE)</summary>
        Texture2D CellTexture(int cellsU, int cellsV)
        {
            int s = 16, W = cellsU * s, H = cellsV * s;
            var t = new Texture2D(W, H, TextureFormat.RGB24, true) { name = "solar cells", wrapMode = TextureWrapMode.Clamp, anisoLevel = 4 };
            var px = new Color32[W * H];
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    bool gap = x % s == 0 || y % s == 0;
                    bool finger = (x % s) == s / 2;
                    px[y * W + x] = gap ? new Color32(150, 150, 155, 255) : finger ? new Color32(58, 64, 92, 255) : new Color32(28, 34, 66, 255);
                }
            t.SetPixels32(px); t.Apply(true, true);
            _siteOwned.Add(t);
            return t;
        }

        /// <summary>flat convex polygon plate (n sides, circumradius r, thickness t) in the local xz plane, uv over the bounds</summary>
        GameObject Plate(string name, Transform parent, int n, float r, float t, Vector3 pos, Vector3 euler, Material m, float rot0 = 0)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false); go.transform.localPosition = pos; go.transform.localRotation = Quaternion.Euler(euler);
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            for (int side = 0; side < 2; side++)
            {
                float y = side == 0 ? t / 2 : -t / 2; int c0 = v.Count;
                v.Add(new Vector3(0, y, 0)); uv.Add(new Vector2(0.5f, 0.5f));
                for (int i = 0; i < n; i++) { float a = rot0 + i * 2 * Mathf.PI / n; v.Add(new Vector3(Mathf.Cos(a) * r, y, Mathf.Sin(a) * r)); uv.Add(new Vector2(0.5f + Mathf.Cos(a) * 0.5f, 0.5f + Mathf.Sin(a) * 0.5f)); }
                for (int i = 0; i < n; i++) { int a = c0 + 1 + i, b = c0 + 1 + (i + 1) % n; if (side == 0) { tri.Add(c0); tri.Add(b); tri.Add(a); } else { tri.Add(c0); tri.Add(a); tri.Add(b); } }
            }
            for (int i = 0; i < n; i++)
            {
                int a = 1 + i, b = 1 + (i + 1) % n, a2 = n + 2 + i, b2 = n + 2 + (i + 1) % n;
                tri.Add(a); tri.Add(b); tri.Add(a2); tri.Add(b); tri.Add(b2); tri.Add(a2);
            }
            var mesh = new Mesh { name = name };
            mesh.SetVertices(v); mesh.SetUVs(0, uv); mesh.SetTriangles(tri, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            _siteOwned.Add(mesh);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        /// <summary>a strut between two local points</summary>
        void Strut(string name, Transform parent, Vector3 a, Vector3 b, float thick, Material m)
        {
            var mid = (a + b) / 2; var d = b - a;
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            go.transform.localPosition = mid;
            go.transform.localRotation = Quaternion.FromToRotation(Vector3.up, d.normalized);
            Part(PrimitiveType.Cylinder, go.transform, Vector3.zero, new Vector3(thick, d.magnitude / 2, thick), Vector3.zero, m);
            go.transform.GetChild(0).name = name;
        }

        void Named(Transform parent, string name, PrimitiveType t, Vector3 pos, Vector3 scale, Vector3 euler, Material m)
        {
            Part(t, parent, pos, scale, euler, m);
            parent.GetChild(parent.childCount - 1).name = name;
        }

        /// <summary>
        /// Sojourner (Mars Pathfinder rover). DOCUMENTED RECONSTRUCTION from the NASA Mars Pathfinder Landing Press Kit:
        /// 65 x 48 x 30 cm, six 13 cm aluminium wheels with cleats, rocker-bogie suspension, 0.2 m² solar array on top,
        /// alpha proton X-ray spectrometer (APXS) at the rear. Part shapes and exact placement: SIMPLIFIED.
        /// </summary>
        GameObject BuildSojourner(out string note)
        {
            var root = new GameObject("Sojourner");
            var body = new GameObject("body").transform; body.SetParent(root.transform, false);
            var white = SiteMat("soj white", new Color(0.78f, 0.77f, 0.73f), 0f, 0.3f);
            var gold = SiteMat("soj gold foil", new Color(0.78f, 0.6f, 0.25f), 0.8f, 0.55f);
            var metal = SiteMat("soj aluminium", new Color(0.62f, 0.63f, 0.65f), 0.85f, 0.45f);
            var dark = SiteMat("soj dark", new Color(0.08f, 0.08f, 0.09f), 0.1f, 0.3f);
            var cells = SiteMat("soj solar cells", Color.white, 0.3f, 0.65f, CellTexture(8, 6));
            const float L = 0.65f, W = 0.48f, H = 0.30f, wr = 0.065f; // press kit
            // warm electronics box (WEB) under the solar panel, gold-foil insulated
            Named(body, "web", PrimitiveType.Cube, new Vector3(0, 0.17f, 0), new Vector3(0.36f, 0.09f, 0.48f), Vector3.zero, gold);
            // solar array: 0.2 m² on top (0.48 x 0.42 m)
            var sp = Plate("solar", body, 4, 0.32f, 0.012f, new Vector3(0, H - 0.03f, -0.01f), new Vector3(0, 45, 0), cells);
            sp.transform.localScale = new Vector3(0.48f / 0.452f, 1, 0.42f / 0.452f);
            // front cameras (stereo pair) and the APXS deployment mechanism at the rear
            Named(body, "cameras", PrimitiveType.Cube, new Vector3(0, 0.2f, L / 2 - 0.05f), new Vector3(0.16f, 0.05f, 0.04f), Vector3.zero, dark);
            Named(body, "apxs", PrimitiveType.Cylinder, new Vector3(0, 0.16f, -L / 2 + 0.03f), new Vector3(0.06f, 0.05f, 0.06f), new Vector3(90, 0, 0), metal);
            // UHF antenna mast
            Named(body, "antenna", PrimitiveType.Cylinder, new Vector3(0.14f, H + 0.05f, -0.16f), new Vector3(0.008f, 0.09f, 0.008f), Vector3.zero, metal);
            // rocker-bogie and six wheels (x: sides at W/2; z: front, middle, rear)
            float[] zs = { 0.26f, 0.02f, -0.26f };
            foreach (float sx in new[] { -1f, 1f })
            {
                float x = sx * (W / 2 - 0.02f);
                foreach (float zz in zs)
                {
                    var wheel = new GameObject("wheel").transform; wheel.SetParent(root.transform, false); wheel.localPosition = new Vector3(x, wr, zz);
                    Named(wheel, "wheel", PrimitiveType.Cylinder, Vector3.zero, new Vector3(wr * 2, 0.04f, wr * 2), new Vector3(0, 0, 90), metal);
                    for (int c = 0; c < 6; c++) Named(wheel, "wheel cleat", PrimitiveType.Cube, Quaternion.Euler(c * 30, 0, 0) * new Vector3(0, 0, 0) , new Vector3(0.045f, 0.004f, wr * 2.05f), new Vector3(c * 30, 0, 0), dark);
                }
                Strut("rocker-bogie", body, new Vector3(x * 0.92f, 0.15f, 0.0f), new Vector3(x, wr + 0.02f, zs[0]), 0.012f, metal);
                Strut("rocker-bogie", body, new Vector3(x * 0.92f, 0.15f, 0.0f), new Vector3(x, 0.11f, -0.12f), 0.012f, metal);
                Strut("rocker-bogie", body, new Vector3(x, 0.11f, -0.12f), new Vector3(x, wr + 0.02f, zs[1]), 0.012f, metal);
                Strut("rocker-bogie", body, new Vector3(x, 0.11f, -0.12f), new Vector3(x, wr + 0.02f, zs[2]), 0.012f, metal);
            }
            note = "DOCUMENTED RECONSTRUCTION (no NASA 3D model exists): 65 x 48 x 30 cm, six 13 cm wheels, rocker-bogie, 0.2 m² solar array (Mars Pathfinder Landing Press Kit); part shapes SIMPLIFIED";
            return root;
        }

        /// <summary>
        /// Mars Pathfinder lander (Carl Sagan Memorial Station) after landing: a tetrahedral base ~0.9 m tall when closed,
        /// three triangular solar petals opened flat (2.8 m² of cells in total), the camera (IMP) on a pop-up mast ~1.5 m
        /// above the ground, a 1 m meteorology mast, two rover ramps, deflated airbags (NSSDCA; Landing Press Kit).
        /// Petal size from the cell area; ramp and airbag shapes ILLUSTRATIVE.
        /// </summary>
        GameObject BuildPathfinderLander(out string note)
        {
            var root = new GameObject("Pathfinder lander");
            var white = SiteMat("mpf white", new Color(0.82f, 0.81f, 0.77f), 0f, 0.3f);
            var cells = SiteMat("mpf cells", Color.white, 0.3f, 0.65f, CellTexture(10, 9));
            var metal = SiteMat("mpf metal", new Color(0.6f, 0.61f, 0.63f), 0.8f, 0.45f);
            var bag = SiteMat("mpf airbags", new Color(0.72f, 0.66f, 0.55f), 0f, 0.15f);
            var dark = SiteMat("mpf dark", new Color(0.07f, 0.07f, 0.08f), 0.1f, 0.3f);
            float side = 1.47f; // equilateral petal with ~0.93 m² of cells (2.8 m² / 3)
            float rIn = side / (2 * Mathf.Sqrt(3)); // inradius
            var basePlate = Plate("base petal", root.transform, 3, side / Mathf.Sqrt(3), 0.06f, new Vector3(0, 0.12f, 0), Vector3.zero, white, Mathf.PI / 2);
            for (int i = 0; i < 3; i++)
            {
                float a = i * 120f;
                var dir = Quaternion.Euler(0, a, 0) * Vector3.forward;
                // each petal hinges on one side of the base triangle and lies open on the ground
                var p = Plate("solar petal", root.transform, 3, side / Mathf.Sqrt(3), 0.04f, dir * (2 * rIn) + Vector3.up * 0.1f, new Vector3(0, a + 180, 0), cells, Mathf.PI / 2);
                Strut("petal hinge", root.transform, dir * rIn + Quaternion.Euler(0, 90, 0) * dir * (side / 2) + Vector3.up * 0.12f, dir * rIn - Quaternion.Euler(0, 90, 0) * dir * (side / 2) + Vector3.up * 0.12f, 0.03f, metal);
                // retracted airbags bunched under the petal edges (ILLUSTRATIVE)
                for (int k = 0; k < 3; k++) Named(root.transform, "airbags", PrimitiveType.Cube, dir * (3.2f * rIn) + Quaternion.Euler(0, 90, 0) * dir * ((k - 1) * 0.45f) + Vector3.up * 0.08f, new Vector3(0.42f, 0.16f, 0.3f), new Vector3(0, a + k * 20, 8), bag);
            }
            // instrument box on the base and the IMP camera mast (~1.5 m above the ground, press kit)
            Named(root.transform, "electronics", PrimitiveType.Cube, new Vector3(0, 0.3f, 0), new Vector3(0.5f, 0.3f, 0.45f), new Vector3(0, 30, 0), white);
            Named(root.transform, "imp mast", PrimitiveType.Cylinder, new Vector3(0, 0.95f, 0), new Vector3(0.04f, 0.5f, 0.04f), Vector3.zero, metal);
            Named(root.transform, "imp camera", PrimitiveType.Cube, new Vector3(0, 1.5f, 0), new Vector3(0.22f, 0.1f, 0.12f), Vector3.zero, dark);
            // meteorology mast: 1 m (press kit), on a petal
            var metPos = Quaternion.Euler(0, 240, 0) * Vector3.forward * (2.4f * rIn);
            Named(root.transform, "met mast", PrimitiveType.Cylinder, metPos + Vector3.up * 0.6f, new Vector3(0.025f, 0.5f, 0.025f), Vector3.zero, metal);
            // high-gain antenna (dish) on the base
            Named(root.transform, "hga", PrimitiveType.Cylinder, new Vector3(0.25f, 0.62f, -0.05f), new Vector3(0.3f, 0.02f, 0.3f), new Vector3(60, 0, 0), white);
            // two rover ramps from the petal where Sojourner was stowed (rear ramp used for egress on sol 2)
            var rp = Quaternion.Euler(0, 0, 0) * Vector3.forward;
            foreach (float o in new[] { -0.18f, 0.18f })
            {
                var a0 = rp * (3.0f * rIn) + Quaternion.Euler(0, 90, 0) * rp * o + Vector3.up * 0.12f;
                var a1 = rp * (3.0f * rIn + 1.0f) + Quaternion.Euler(0, 90, 0) * rp * o + Vector3.up * 0.01f;
                Strut("rover ramp", root.transform, a0, a1, 0.06f, metal);
            }
            note = "DOCUMENTED RECONSTRUCTION (no NASA 3D model exists): tetrahedral lander with three solar petals (2.8 m² of cells), IMP camera ~1.5 m above the ground, 1 m meteorology mast (NSSDCA; Mars Pathfinder Landing Press Kit). Petal size derived from the cell area; ramps and airbags ILLUSTRATIVE";
            return root;
        }

        /// <summary>
        /// Phoenix lander. DOCUMENTED RECONSTRUCTION from the NASA Phoenix press kit: deck diameter 1.5 m, deployed
        /// solar-array span 5.52 m, robotic arm 2.35 m, top of the meteorology mast 2.2 m above the ground; three legs, two
        /// many-sided solar wings (NSSDCA). Instrument positions on the deck (TEGA, MECA, SSI) SIMPLIFIED.
        /// </summary>
        GameObject BuildPhoenix(out string note)
        {
            var root = new GameObject("Phoenix lander");
            var white = SiteMat("phx white", new Color(0.83f, 0.82f, 0.79f), 0f, 0.3f);
            var gold = SiteMat("phx foil", new Color(0.8f, 0.62f, 0.28f), 0.85f, 0.55f);
            var metal = SiteMat("phx metal", new Color(0.6f, 0.61f, 0.63f), 0.85f, 0.45f);
            var dark = SiteMat("phx dark", new Color(0.07f, 0.07f, 0.08f), 0.1f, 0.3f);
            var cells = SiteMat("phx cells", Color.white, 0.3f, 0.65f, CellTexture(14, 14));
            const float deckY = 1.0f, deckR = 0.75f, span = 5.52f, armL = 2.35f;
            float wingR = (span - 2 * deckR) / 4 + 0.05f; // each wing's radius so the tips span 5.52 m
            Plate("deck", root.transform, 10, deckR, 0.18f, new Vector3(0, deckY, 0), Vector3.zero, gold);
            for (int i = 0; i < 3; i++)
            {
                var dir = Quaternion.Euler(0, 90 + i * 120, 0) * Vector3.forward;
                Strut("legs", root.transform, dir * 0.55f + Vector3.up * (deckY - 0.08f), dir * 1.05f + Vector3.up * 0.05f, 0.06f, metal);
                Named(root.transform, "legs footpad", PrimitiveType.Cylinder, dir * 1.05f + Vector3.up * 0.03f, new Vector3(0.28f, 0.03f, 0.28f), Vector3.zero, metal);
            }
            foreach (float sx in new[] { -1f, 1f })
                Plate("solar", root.transform, 10, wingR, 0.03f, new Vector3(sx * (deckR + wingR - 0.05f), deckY + 0.02f, 0), Vector3.zero, cells, Mathf.PI / 10);
            Named(root.transform, "tega", PrimitiveType.Cube, new Vector3(-0.25f, deckY + 0.2f, 0.25f), new Vector3(0.38f, 0.22f, 0.25f), Vector3.zero, white);
            Named(root.transform, "meca", PrimitiveType.Cube, new Vector3(0.25f, deckY + 0.18f, 0.28f), new Vector3(0.3f, 0.18f, 0.24f), Vector3.zero, white);
            Named(root.transform, "ssi mast", PrimitiveType.Cylinder, new Vector3(0.1f, deckY + 0.6f, -0.3f), new Vector3(0.04f, 0.55f, 0.04f), Vector3.zero, metal);
            Named(root.transform, "ssi camera", PrimitiveType.Cube, new Vector3(0.1f, deckY + 1.16f, -0.3f), new Vector3(0.2f, 0.1f, 0.12f), Vector3.zero, dark);
            Named(root.transform, "met mast", PrimitiveType.Cylinder, new Vector3(-0.35f, deckY + 0.6f, -0.2f), new Vector3(0.02f, 0.6f, 0.02f), Vector3.zero, metal);
            // robotic arm, 2.35 m (press kit), reaching down to the dig site in front of the lander (pose SIMPLIFIED)
            var shoulder = new Vector3(0, deckY + 0.12f, deckR * 0.9f);
            var elbow = shoulder + new Vector3(0, 0.55f, 1.0f);
            var scoop = new Vector3(0, 0.1f, deckR + 1.75f);
            Strut("arm", root.transform, shoulder, elbow, 0.07f, white);
            Strut("arm", root.transform, elbow, scoop, 0.06f, white);
            Named(root.transform, "arm scoop", PrimitiveType.Cube, scoop, new Vector3(0.12f, 0.08f, 0.16f), Vector3.zero, metal);
            note = "DOCUMENTED RECONSTRUCTION (no NASA 3D model exists): deck 1.5 m, solar-array span 5.52 m, robotic arm 2.35 m, meteorology mast top 2.2 m (NASA Phoenix press kit); instrument positions and arm pose SIMPLIFIED";
            return root;
        }

        /// <summary>
        /// MER lander platform left at a landing site (Spirit: Columbia Memorial Station). SIMPLIFIED MODEL: a central base
        /// with three opened petals carrying the deflated airbags, egress aids; dimensions ILLUSTRATIVE (none sourced here).
        /// </summary>
        GameObject BuildMerLander(out string note)
        {
            var root = new GameObject("MER lander");
            var white = SiteMat("merl white", new Color(0.8f, 0.79f, 0.75f), 0f, 0.3f);
            var bag = SiteMat("merl airbags", new Color(0.74f, 0.68f, 0.57f), 0f, 0.15f);
            var metal = SiteMat("merl metal", new Color(0.6f, 0.61f, 0.63f), 0.8f, 0.45f);
            Plate("base petal", root.transform, 3, 1.0f, 0.08f, new Vector3(0, 0.25f, 0), Vector3.zero, white, Mathf.PI / 2);
            for (int i = 0; i < 3; i++)
            {
                var dir = Quaternion.Euler(0, i * 120f, 0) * Vector3.forward;
                Plate("side petal", root.transform, 3, 1.0f, 0.06f, dir * 1.0f + Vector3.up * 0.2f, new Vector3(0, i * 120f + 180, 0), white, Mathf.PI / 2);
                for (int k = 0; k < 3; k++) Named(root.transform, "airbags", PrimitiveType.Cube, dir * 1.6f + Quaternion.Euler(0, 90, 0) * dir * ((k - 1) * 0.5f) + Vector3.up * 0.12f, new Vector3(0.5f, 0.25f, 0.35f), new Vector3(0, i * 120f + k * 25, 6), bag);
                Strut("egress aid", root.transform, dir * 1.3f + Vector3.up * 0.25f, dir * 2.2f + Vector3.up * 0.02f, 0.03f, metal);
            }
            note = "SIMPLIFIED MODEL: MER lander base, three opened petals, deflated airbags and egress aids; shapes and dimensions ILLUSTRATIVE (not sourced)";
            return root;
        }

        // ------------------------------------------------------------------ per frame

        void SiteUpdate(float dt)
        {
            MarsGetInput(_in, _in.Length);
            float mx = _in[0], my = _in[1];
            bool sprint = _in[4] > 0.5f;
            switch (_mode)
            {
                case ExplorerMode.Arrival:
                    _arrivalT += dt;
                    if (_arrivalT >= ArrivalDur && !_arrivalDone) FinishArrival();
                    break;
                case ExplorerMode.Explore:
                    if (_siteKind == "rover") { StepVehicle(dt, mx, my, sprint); LookExplore(dt); }
                    else StepWalker(dt, mx, my, sprint);
                    SiteDiscovery();
                    break;
                case ExplorerMode.Inspect:
                    _insYaw += _in[2] * 1.8f * dt + _in[5] * 0.006f;
                    _insPitch = Mathf.Clamp(_insPitch - (_in[3] * 1.2f) * dt - _in[6] * 0.005f, -0.1f, 1.35f);
                    _insDist = Mathf.Clamp(_insDist * (1 + _in[7] * 0.1f), 0.8f, 18f);
                    SiteHighlight(0.5f + 0.5f * Mathf.Sin(Time.time * 4f));
                    break;
            }
            if (_player && _player.activeSelf && _siteKind == "rover") PlacePlayer();
            _poseTimer += dt;
            if (_poseTimer >= 0.1f) { _poseTimer = 0; Report("pose", SitePoseJson()); }
        }

        const float WalkSpeed = 1.4f, RunSpeed = 2.6f, Eye = 1.7f, WalkerRadius = 0.4f;

        /// <summary>
        /// On foot (stationary-lander sites): W A S D move relative to where the camera looks; the arrow keys (and drag)
        /// only turn the view. Walking speeds are gameplay values, not astronaut data.
        /// </summary>
        void StepWalker(float dt, float mx, float my, bool sprint)
        {
            _camYaw = WrapPi(_camYaw + _in[2] * 1.8f * dt + _in[5] * 0.006f);
            _camPitch = Mathf.Clamp(_camPitch - _in[3] * 1.2f * dt - _in[6] * 0.005f, -1.2f, 1.3f);
            _fov = Mathf.Clamp(_fov * (1 + _in[7] * 0.06f), 30f, 70f);
            cam.fieldOfView = _fov;
            _heading = _camYaw;
            var fwd = new Vector2(Mathf.Sin(_camYaw), Mathf.Cos(_camYaw));
            var right = new Vector2(Mathf.Cos(_camYaw), -Mathf.Sin(_camYaw));
            var v = fwd * my + right * mx;
            if (v.sqrMagnitude > 1) v.Normalize();
            float speed = sprint ? RunSpeed : WalkSpeed;
            _speed = v.magnitude * speed;
            var np = _pos + v * speed * dt;
            _blocked = false;
            if (v.sqrMagnitude > 1e-4f)
            {
                if (float.IsNaN(_terrain.Sample(np.x, np.y)) || HitsHardware(np, WalkerRadius)) { _blocked = true; _speed = 0; }
                else _pos = np;
            }
            float g = SafeHeight(_pos.x, _pos.y);
            _bodyY = Mathf.Lerp(_bodyY, g, 1 - Mathf.Exp(-dt * 12f));
        }

        bool HitsHardware(Vector2 p, float r)
        {
            foreach (var h in _hw)
            {
                float d = (p - h.XZ).magnitude, d0 = (_pos - h.XZ).magnitude;
                if (d < h.Radius + r && d < d0) return true;
            }
            return false;
        }

        Hw Nearest(out float dist)
        {
            Hw best = null; dist = float.MaxValue;
            foreach (var h in _hw) { float d = (h.XZ - _pos).magnitude - h.Radius; if (d < dist) { dist = d; best = h; } }
            return best;
        }

        void SiteDiscovery()
        {
            foreach (var h in _hw)
            {
                if (_siteDiscovered.Contains(h.Id)) continue;
                if ((h.XZ - _pos).magnitude < NoticeM) { _siteDiscovered.Add(h.Id); Report("discovered", $"{{\"id\":{MiniJson.Q(h.Id)}}}"); }
            }
        }

        void SiteLateUpdate()
        {
            float dt = Mathf.Min(Time.deltaTime, 0.1f);
            bool rover = _siteKind == "rover";
            var pivot = rover ? new Vector3(_pos.x, _bodyY + 1.3f, _pos.y) : new Vector3(_pos.x, _bodyY + Eye, _pos.y);
            switch (_mode)
            {
                case ExplorerMode.Arrival:
                {
                    float u = Mathf.Clamp01(_arrivalT / ArrivalDur), e = 1 - Mathf.Pow(1 - u, 3);
                    float dist = Mathf.Exp(Mathf.Lerp(Mathf.Log(700f), Mathf.Log(rover ? _camDist : 6f), e));
                    float pitch = Mathf.Lerp(1.52f, rover ? _camPitch : 0.3f, Mathf.SmoothStep(0, 1, u));
                    float yaw = _heading + Mathf.Lerp(1.4f, 0f, e);
                    if (rover)
                    {
                        float drop = Mathf.SmoothStep(30f, 0f, Mathf.InverseLerp(0.45f, 0.82f, u)); // ILLUSTRATIVE touchdown
                        _player.transform.localPosition = new Vector3(_pos.x, _bodyY + drop, _pos.y);
                    }
                    SetCamera(Orbit(pivot, yaw, pitch, dist), pivot, 1f);
                    return;
                }
                case ExplorerMode.Inspect:
                {
                    var b = InspectBounds();
                    var c = b.center - _world.position;
                    float baseYaw = _insYawBase;
                    if (_insDistAuto) { _insDist = Mathf.Clamp(b.extents.magnitude * 2.6f, 1.0f, 16f); _insDistAuto = false; }
                    SetCamera(Orbit(c, baseYaw + _insYaw, _insPitch, _insDist), c, 1 - Mathf.Exp(-dt * 5f));
                    return;
                }
                default:
                {
                    if (rover)
                    {
                        float k = 1 - Mathf.Exp(-dt * 4f);
                        _camYaw = _camYaw + WrapPi(_heading + _camYawOffset - _camYaw) * k;
                        SetCamera(Orbit(pivot, _camYaw, _camPitch, _camDist), pivot, _mode == ExplorerMode.Paused ? 0 : 1 - Mathf.Exp(-dt * 12f));
                    }
                    else
                    {
                        // first person: eye 1.7 m above the measured ground
                        var dir = new Vector3(Mathf.Sin(_camYaw) * Mathf.Cos(_camPitch), -Mathf.Sin(_camPitch), Mathf.Cos(_camYaw) * Mathf.Cos(_camPitch));
                        SetCamera(pivot, pivot + dir * 10f, 1f);
                    }
                    return;
                }
            }
        }

        float _insYawBase; bool _insDistAuto;

        Bounds InspectBounds()
        {
            var h = _hw.FirstOrDefault(x => x.Id == _insHw) ?? _hw.FirstOrDefault();
            if (h == null) return new Bounds(Vector3.zero, Vector3.one);
            List<Renderer> rs = h.All;
            if (!string.IsNullOrEmpty(_insComp) && h.Groups.TryGetValue(_insComp, out var g) && g.Count > 0) rs = g;
            return RendererBounds(rs);
        }

        void SiteHighlight(float pulse)
        {
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            var hi = new Color(0.35f, 0.85f, 1f);
            foreach (var h in _hw)
            {
                List<Renderer> on = null;
                if (pulse >= 0 && h.Id == _insHw && !string.IsNullOrEmpty(_insComp)) h.Groups.TryGetValue(_insComp, out on);
                foreach (var r in h.All)
                {
                    if (on != null && on.Contains(r)) { _mpb.SetColor("_BaseColor", Color.Lerp(h.Base[r], hi, 0.25f + 0.45f * pulse)); r.SetPropertyBlock(_mpb); }
                    else r.SetPropertyBlock(null);
                }
            }
        }

        // ------------------------------------------------------------------ reports

        string SiteReadyJson()
        {
            var sb = new StringBuilder();
            sb.Append("\"siteId\":").Append(MiniJson.Q(_siteId)).Append(",\"siteKind\":").Append(MiniJson.Q(_siteKind));
            sb.Append(",\"objects\":[");
            for (int i = 0; i < _hw.Count; i++)
            {
                var h = _hw[i]; var p = h.Go.transform.localPosition;
                if (i > 0) sb.Append(',');
                sb.Append("{\"id\":").Append(MiniJson.Q(h.Id)).Append(",\"label\":").Append(MiniJson.Q(h.Label))
                  .Append(",\"x\":").Append(MiniJson.N(p.x)).Append(",\"z\":").Append(MiniJson.N(p.z)).Append(",\"y\":").Append(MiniJson.N(p.y))
                  .Append(",\"noticeM\":").Append(MiniJson.N(NoticeM)).Append(",\"interactM\":").Append(MiniJson.N(InteractM + h.Radius))
                  .Append(",\"model\":").Append(MiniJson.Q(h.Model)).Append(",\"note\":").Append(MiniJson.Q(h.Note))
                  .Append(",\"parts\":").Append(h.All.Count)
                  .Append(",\"components\":[").Append(string.Join(",", h.Groups.Where(g => !g.Key.StartsWith("mer:")).Select(g => $"{{\"id\":{MiniJson.Q(g.Key)},\"renderers\":{g.Value.Count}}}"))).Append("]}");
            }
            sb.Append("],\"start\":{\"x\":").Append(MiniJson.N(_siteStart.x)).Append(",\"z\":").Append(MiniJson.N(_siteStart.y)).Append(",\"heading\":").Append(MiniJson.N(_siteStartHeading)).Append('}');
            sb.Append(",\"route\":null");
            sb.Append(",\"site\":{\"latDeg\":").Append(MiniJson.N(_siteLat)).Append(",\"lonEastDeg\":").Append(MiniJson.N(_siteLon))
              .Append(",\"extentEastM\":[").Append(MiniJson.N(_terrain.East0)).Append(',').Append(MiniJson.N(_terrain.East0 + (_terrain.Width - 1) * _terrain.SpacingE))
              .Append("],\"extentNorthM\":[").Append(MiniJson.N(_terrain.North0 - (_terrain.Height - 1) * _terrain.SpacingN)).Append(',').Append(MiniJson.N(_terrain.North0)).Append("]}");
            sb.Append(",\"horizon\":").Append(_horizon != null ? $"{{\"triangles\":{_horizon.Triangles},\"chunks\":{_horizon.Chunks.Count}}}" : "null");
            sb.Append(",\"mode\":").Append(MiniJson.Q(_mode.ToString())).Append(",\"embedded\":").Append(_embedded ? "true" : "false");
            return sb.ToString();
        }

        string SiteHeightCheckJson()
        {
            if (string.IsNullOrEmpty(_siteCheckJson)) return "null";
            var c = MiniJson.O(MiniJson.Parse(_siteCheckJson));
            double max = 0; int n = 0;
            foreach (var o in MiniJson.A(c["samples"]))
            {
                var d = MiniJson.O(o);
                int col = MiniJson.I(d["col"]), row = MiniJson.I(d["row"]);
                if (!_terrain.Valid(col, row)) continue;
                max = Math.Max(max, Math.Abs(_terrain.Up(col, row) - MiniJson.D(d["upM"]))); n++;
            }
            return $"{{\"samples\":{n},\"maxAbsErrorM\":{MiniJson.N(max)},\"gateM\":0.05,\"pass\":{(n > 0 && max <= 0.05 ? "true" : "false")}}}";
        }

        string SitePoseJson()
        {
            var near = Nearest(out float nd);
            var np = near != null ? near.Go.transform.localPosition : Vector3.zero;
            var sb = new StringBuilder("{");
            sb.Append("\"mode\":").Append(MiniJson.Q(_mode.ToString()))
              .Append(",\"x\":").Append(MiniJson.N(_pos.x)).Append(",\"z\":").Append(MiniJson.N(_pos.y)).Append(",\"y\":").Append(MiniJson.N(_bodyY))
              .Append(",\"heading\":").Append(MiniJson.N(_heading)).Append(",\"speed\":").Append(MiniJson.N(_speed))
              .Append(",\"pitchDeg\":").Append(MiniJson.N(_pitch * Mathf.Rad2Deg)).Append(",\"rollDeg\":").Append(MiniJson.N(_roll * Mathf.Rad2Deg))
              .Append(",\"blocked\":").Append(_blocked ? "true" : "false")
              .Append(",\"camYaw\":").Append(MiniJson.N(_camYaw)).Append(",\"camYawOffset\":").Append(MiniJson.N(_camYawOffset))
              .Append(",\"camPitch\":").Append(MiniJson.N(_camPitch)).Append(",\"camDist\":").Append(MiniJson.N(_camDist)).Append(",\"fov\":").Append(MiniJson.N(_fov))
              .Append(",\"oppX\":").Append(MiniJson.N(np.x)).Append(",\"oppZ\":").Append(MiniJson.N(np.z)).Append(",\"oppDist\":").Append(MiniJson.N(Mathf.Max(0, nd)))
              .Append(",\"nearestId\":").Append(MiniJson.Q(near?.Id))
              .Append(",\"near\":").Append(_mode == ExplorerMode.Explore && near != null && nd < InteractM ? MiniJson.Q(near.Id) : "null")
              .Append(",\"arrivalT\":").Append(MiniJson.N(_mode == ExplorerMode.Arrival ? _arrivalT / ArrivalDur : 1))
              .Append(",\"sol\":").Append(_sol).Append(",\"replaySol\":0")
              .Append(",\"utc\":").Append(MiniJson.Q(_utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)))
              .Append(",\"sunElevation\":").Append(MiniJson.N(_sunEl)).Append(",\"sunAzimuth\":").Append(MiniJson.N(_sunAz))
              .Append(",\"camX\":").Append(MiniJson.N(_camPos.x)).Append(",\"camZ\":").Append(MiniJson.N(_camPos.z)).Append(",\"camY\":").Append(MiniJson.N(_camPos.y))
              .Append(",\"inspect\":").Append(_mode == ExplorerMode.Inspect ? $"{{\"hw\":{MiniJson.Q(_insHw)},\"component\":{MiniJson.Q(_insComp)}}}" : "null")
              .Append(",\"rebases\":").Append(_rebases).Append('}');
            return sb.ToString();
        }

        // ------------------------------------------------------------------ JS -> Unity (site mode variants)

        void SiteEmbed(string json)
        {
            _embedded = true;
            bool arrival = json != null && json.Contains("\"arrival\":true");
            _player.SetActive(_siteKind == "rover");
            _camInit = false; _arrivalT = 0; _arrivalDone = !arrival;
            SetMode(arrival ? ExplorerMode.Arrival : ExplorerMode.Explore);
            Report("ready", ReadyJson());
        }

        /// <summary>'hwId' (whole vehicle) or 'hwId/componentId' (the model's own part group, highlighted)</summary>
        void SiteInspect(string anchor)
        {
            var a = (anchor ?? "").Trim();
            int k = a.IndexOf('/');
            _insHw = k >= 0 ? a.Substring(0, k) : a;
            _insComp = k >= 0 ? a.Substring(k + 1) : "";
            var h = _hw.FirstOrDefault(x => x.Id == _insHw) ?? _hw.FirstOrDefault();
            if (h == null) return;
            _insHw = h.Id;
            var c = RendererBounds(h.All).center - _world.position;
            var toCam = new Vector3(_camPos.x - c.x, 0, _camPos.z - c.z);
            if (_mode != ExplorerMode.Inspect) { _insYawBase = toCam.sqrMagnitude > 0.01f ? Mathf.Atan2(-toCam.x, -toCam.z) : 0; _insYaw = 0.35f; _insPitch = 0.32f; }
            _insDistAuto = true;
            if (_mode != ExplorerMode.Inspect) SetMode(ExplorerMode.Inspect); else Report("pose", SitePoseJson());
        }

        void SiteRestore(string json)
        {
            try
            {
                var o = MiniJson.O(MiniJson.Parse(json));
                var p = new Vector2(MiniJson.F(o["x"]), MiniJson.F(o["z"]));
                if (float.IsNaN(_terrain.Sample(p.x, p.y))) return;
                _pos = p; _speed = 0;
                if (o.TryGetValue("heading", out var hd)) _heading = MiniJson.F(hd);
                if (o.TryGetValue("camYawOffset", out var cy)) _camYawOffset = MiniJson.F(cy);
                if (o.TryGetValue("camPitch", out var cp)) _camPitch = MiniJson.F(cp);
                if (o.TryGetValue("camDist", out var cd)) _camDist = MiniJson.F(cd);
                if (_siteKind == "rover") { if (Contact(_pos, _heading, out var by, out var bp, out var br)) { _bodyY = by; _pitch = bp; _roll = br; Settle(by, bp, br, 1f); } _camYaw = _heading + _camYawOffset; }
                else { _camYaw = _heading; _bodyY = SafeHeight(_pos.x, _pos.y); }
                _camInit = false;
                SetMode(ExplorerMode.Explore);
                Report("restored", SitePoseJson());
            }
            catch (Exception e) { Debug.LogWarning("[Mars] bad restore state: " + e.Message); }
        }

        /// <summary>Free everything this site created (the player is quit on leave; this also runs on destroy).</summary>
        void SiteUnload()
        {
            _terrain?.Destroy(); _horizon?.Destroy();
            foreach (var h in _hw) if (h.Go) Destroy(h.Go);
            _hw.Clear();
            foreach (var o in _siteOwned) if (o) Destroy(o);
            _siteOwned.Clear();
        }
    }
}
