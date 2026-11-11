using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Unity.Profiling;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// Stage 2 renderer prototype: Victoria crater (HiRISE DTM, 1.01 m) with the NASA MER-B model, the Sun from Mars24,
    /// a tau-driven sky, the four quality profiles from mission-data, a floating origin, and frame instrumentation
    /// reported over the bridge (window.__mars). Purpose: measure the FINAL_VISUAL_REALISM_SPEC §2.1 gates on the
    /// reference integrated GPU. Everything not sourced is labelled on screen.
    /// </summary>
    public sealed partial class MarsPrototype : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void MarsReport(string kind, string json);
#else
        static void MarsReport(string kind, string json) { LastReports[kind] = json; }
#endif
        public static readonly Dictionary<string, string> LastReports = new Dictionary<string, string>();

        [Header("Data (Assets/CosmicAtlas/Mars/Data)")]
        public TextAsset heights, heightMeta, heightCheck, roverJson, routeJson, profilesJson;
        [Header("Scene")]
        public Material terrainMaterial, roverTemplate, skyMaterial, lineMaterial, dustMaterial;
        [Header("Stage 3 visual reconstruction")]
        public GameObject merModel;               // NASA articulated MER model (FBX); null = the low-poly MER-B mesh
        public TextAsset rocksBytes, groundMask;   // scripts/mars/victoria_surface.py
        public Material rockMaterial;
        public Light sun;
        public Camera cam;
        public Volume volume;
        public UniversalRenderPipelineAsset pipeline;
        public ScriptableRendererFeature ssao;

        // ---- sourced constants ----
        const double LandingLat = -1.9483, LandingLon = 354.47417;          // nasa-opportunity
        static readonly DateTime Landing = new DateTime(2004, 1, 25, 4, 54, 0, DateTimeKind.Utc); // nasa-opportunity (basis unspecified)
        const double Ra = 3396.19, Rb = 3376.20;                           // km, NAIF pck00011 BODY499_RADII
        static readonly DateTime SceneDate = new DateTime(2007, 9, 11);    // event merb-victoria-entry (date-only)
        const double SceneLtst = 14.0;                                     // ILLUSTRATIVE time of day (not sourced)

        MarsTerrain _terrain;
        List<MarsQualityProfile> _profiles;
        MarsQualityProfile _profile;
        Transform _world;
        GameObject _rover;
        ParticleSystem _dust;
        Vector3 _roverPos, _origin;
        int _rebases, _sol;
        double _siteLat, _siteLon, _sunEl, _sunAz, _tau = 0.9;
        string _tauLabel = "tau 0.9 ASSUMED (no sourced value for this sol)";
        string _roverNote = "", _calNote = "";
        DateTime _utc;
        float _pathT;
        float _rimR = 409f;

        // instrumentation
        readonly float[] _ring = new float[120];
        int _ringN;
        float _reportTimer;
        List<float> _bench;
        float _benchLeft, _warmLeft;
        ProfilerRecorder _draw, _tris, _setpass, _gcUsed, _gcReserved, _totalUsed;

        // originals, restored on destroy (runtime edits of the pipeline asset must not leak into the editor)
        float _oScale, _oShadowDist; int _oMsaa, _oCascades, _oShadowRes; RenderPipelineAsset _oPipeline;

        void Awake()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            // the host app's input manager owns the keyboard (see MarsBridge.jslib): never swallow page key events
            WebGLInput.captureAllKeyboardInput = false;
#endif
            _oPipeline = QualitySettings.renderPipeline;
            if (pipeline)
            {
                QualitySettings.renderPipeline = pipeline;
                _oScale = pipeline.renderScale; _oShadowDist = pipeline.shadowDistance; _oMsaa = pipeline.msaaSampleCount;
                _oCascades = pipeline.shadowCascadeCount; _oShadowRes = pipeline.mainLightShadowmapResolution;
            }
            _draw = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            _tris = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
            _setpass = ProfilerRecorder.StartNew(ProfilerCategory.Render, "SetPass Calls Count");
            _gcUsed = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Used Memory");
            _gcReserved = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Reserved Memory");
            _totalUsed = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "Total Used Memory");
        }

        void OnDestroy()
        {
            if (_siteMode) SiteUnload();
            _draw.Dispose(); _tris.Dispose(); _setpass.Dispose(); _gcUsed.Dispose(); _gcReserved.Dispose(); _totalUsed.Dispose();
            if (pipeline)
            {
                pipeline.renderScale = _oScale; pipeline.shadowDistance = _oShadowDist; pipeline.msaaSampleCount = _oMsaa;
                pipeline.shadowCascadeCount = _oCascades; pipeline.mainLightShadowmapResolution = _oShadowRes;
            }
            if (ssao) ssao.SetActive(true);
            QualitySettings.renderPipeline = _oPipeline;
        }

        void Start()
        {
            if (TryStartSite()) return; // M4: a landing site package instead of Victoria (MarsPrototype.Sites.cs)
            _world = new GameObject("World (floating origin)").transform;
            _terrain = MarsTerrain.Load(heights, heightMeta);
            var meta = MiniJson.O(MiniJson.Parse(heightMeta.text));
            var o = MiniJson.A(meta["originLatLon"]);
            _siteLat = MiniJson.D(o[0]); _siteLon = MiniJson.D(o[1]);
            _profiles = MarsQualityProfile.LoadAll(profilesJson);

            // time: the Victoria-entry date (sourced, date only) at an illustrative local afternoon
            _utc = MarsTime.UtcForLtst(SceneDate, _siteLon, SceneLtst);
            _sol = MissionSol(_utc);

            // rover at the first drive record at or after that sol (traverse, locally registered)
            var route = MiniJson.O(MiniJson.Parse(routeJson.text));
            var s0 = MiniJson.Ints(route["startSol"]); var e = MiniJson.Floats(route["eastM"]); var n = MiniJson.Floats(route["northM"]);
            _routeSol = s0; _routeE = e; _routeN = n;
            int k = Array.FindIndex(s0, s => s >= _sol); if (k < 0) k = s0.Length - 1;
            int k2 = Mathf.Min(k + 1, s0.Length - 1);
            _roverPos = new Vector3(e[k], 0, n[k]);
            _roverPos.y = SafeHeight(_roverPos.x, _roverPos.z);
            _roverNote = $"rover: drive record starting sol {s0[k]} (traverse, locally registered)";
            _rover = merModel ? BuildMer(out _calNote) : MarsRover.Build(roverJson, roverTemplate, out _calNote);
            if (rocksBytes && rockMaterial) _rocks = new MarsRocks(_terrain, rocksBytes, groundMask, rockMaterial);
            _rover.transform.SetParent(_world, false);
            _rover.transform.localPosition = _roverPos;
            var fwd = new Vector3(e[k2] - e[k], 0, n[k2] - n[k]);
            if (fwd.sqrMagnitude > 1e-4f) _rover.transform.localRotation = Quaternion.LookRotation(Vector3.Cross(fwd.normalized, Vector3.up)); // model X is its long axis
            _sceneRoverPos = _roverPos; _sceneRoverRot = _rover.transform.localRotation; _sceneRouteIndex = k;

            // Traverse: painted into a terrain detail map (replaces the floating 0.6 m cyan LineRenderer: defects V1 and V3)
            InitExplorer();

            ApplySun();
            ApplyProfile(DefaultProfileId());
            MakeDust();
            Report("ready", ReadyJson());
        }

        static string DefaultProfileId() => "balanced"; // integrated GPU / web start (spec §4 auto-select)

        float SafeHeight(float east, float north) { float h = _terrain.Sample(east, north); return float.IsNaN(h) ? 0 : h; }

        int MissionSol(DateTime utc)
        {
            double Local(DateTime t) => new MarsTime(t).Msd + (LandingLon > 180 ? LandingLon - 360 : LandingLon) / 360.0;
            return (int)(Math.Floor(Local(utc)) - Math.Floor(Local(Landing))) + 1; // MER: landing sol = Sol 1 (giss-mars24-notes)
        }

        void ApplySun()
        {
            var t = new MarsTime(_utc);
            // Mars24 wants planetographic latitude: tan(phi_g) = (a/b)^2 tan(phi_c) (radii: NAIF pck00011)
            double latG = Math.Atan(Math.Pow(Ra / Rb, 2) * Math.Tan(_siteLat * Math.PI / 180)) * 180 / Math.PI;
            t.Sun(latG, _siteLon, out var z, out var az, out var se, out var sn, out var su);
            _sunEl = 90 - z; _sunAz = az;
            var dir = new Vector3((float)se, (float)su, (float)sn).normalized;
            sun.transform.rotation = Quaternion.LookRotation(-dir);
            float irr = (float)Math.Pow(1.52367934 / t.HelioDistAU, 2); // relative to Mars' mean distance (D-2)
            double m = su > 0.02 ? 1 / su : 50;
            float tr(float k) => (float)Math.Exp(-_tau * m * k);
            // Direct beam: Beer-Lambert extinction exp(-tau m) with an ILLUSTRATIVE spectral tilt (dust removes blue first).
            var beam = new Color(tr(1.0f), tr(1.08f), tr(1.25f));
            float beamLum = beam.r * 0.3f + beam.g * 0.59f + beam.b * 0.11f;
            float up = Mathf.Clamp01((float)su * 8f);
            sun.color = new Color(beam.r / beam.maxColorComponent, beam.g / beam.maxColorComponent, beam.b / beam.maxColorComponent);
            sun.intensity = _look.Sun * irr * up * Mathf.Max(beamLum, 0.02f) / 0.34f; // normalised so tau 0.9 at noon ~ look.Sun
            Shader.SetGlobalVector("_MarsSunDir", dir);
            skyMaterial.SetFloat("_Tau", (float)_tau);
            skyMaterial.SetFloat("_SunIrr", irr);
            RenderSettings.skybox = skyMaterial;
            // Diffuse sky: the light scattered out of the beam mostly reaches the ground on Mars (forward-scattering dust),
            // so a dusty sky is a strong, warm fill. Fraction 0.75 and the colours are ILLUSTRATIVE (no sourced radiance).
            float diffuse = irr * Mathf.Clamp01((float)su * 1.2f + 0.08f) * (1 - Mathf.Exp(-(float)(_tau * m))) * 0.75f / 0.66f;
            float k = _look.Ambient * Mathf.Max(diffuse, 0.04f);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.78f, 0.6f, 0.46f) * k;
            RenderSettings.ambientEquatorColor = new Color(0.66f, 0.49f, 0.36f) * k;
            RenderSettings.ambientGroundColor = new Color(0.38f, 0.26f, 0.18f) * k; // light bounced off ~0.2-albedo regolith
            // distance haze (aerial perspective) in the sky's horizon colour: ILLUSTRATIVE extent
            RenderSettings.fog = _look.FogEnd > 0;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = _look.FogStart; RenderSettings.fogEndDistance = _look.FogEnd;
            RenderSettings.fogColor = new Color(0.74f, 0.58f, 0.45f) * Mathf.Clamp(k * 1.1f, 0.25f, 1.2f);
            if (volume && volume.profile && volume.profile.TryGet<ColorAdjustments>(out var ca)) { ca.postExposure.Override(_look.Exposure); ca.saturation.Override(_look.Saturation); }
            if (volume && volume.profile && volume.profile.TryGet<Bloom>(out var bl)) bl.threshold.Override(_look.Bloom);
        }

        public void ApplyProfile(string id)
        {
            var p = _profiles.FirstOrDefault(x => x.Id == id);
            if (p == null) { Debug.LogWarning("[Mars] unknown profile " + id); return; }
            _profile = p;
            if (pipeline)
            {
                pipeline.renderScale = p.RenderScale;
                pipeline.msaaSampleCount = p.AntiAliasing == "msaa4+smaa" ? 4 : p.AntiAliasing == "msaa2" ? 2 : 1;
                pipeline.shadowDistance = p.ShadowDistance;
                pipeline.shadowCascadeCount = Mathf.Clamp(p.Cascades, 1, 4);
                pipeline.mainLightShadowmapResolution = p.ShadowMap;
            }
            var cd = cam.GetComponent<UniversalAdditionalCameraData>();
            cd.antialiasing = p.AntiAliasing == "msaa4+smaa" ? AntialiasingMode.SubpixelMorphologicalAntiAliasing
                : p.AntiAliasing == "fxaa" ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.None;
            if (ssao) ssao.SetActive(p.Ssao);
            if (volume && volume.sharedProfile && volume.sharedProfile.TryGet<Bloom>(out var bloom)) bloom.active = p.Bloom;
            QualitySettings.globalTextureMipmapLimit = Mathf.Max(0, Mathf.RoundToInt(Mathf.Log(4096f / p.MaxTexture, 2)));
            skyMaterial.SetFloat("_Steps", Mathf.Clamp(p.SkyTransmittance / 8, 8, 32));
            _terrain.Build(_world, _siteMode ? _siteTerrainMat : terrainMaterial, p.TerrainStride, p.Cascades > 0);
            _horizon?.Build(_world, _horizonMat, 1, false); // site mode: mid-range horizon from the same DTM, no shadows
            if (_dust) { var main = _dust.main; main.maxParticles = Mathf.RoundToInt(3000 * p.DustFraction); }
            Report("profile", $"{{\"id\":{MiniJson.Q(p.Id)},\"terrainTriangles\":{_terrain.Triangles},\"chunks\":{_terrain.Chunks.Count}}}");
        }

        void MakeDust()
        {
            var go = new GameObject("Airborne dust (illustrative)");
            go.transform.SetParent(cam.transform, false);
            _dust = go.AddComponent<ParticleSystem>();
            var main = _dust.main;
            main.loop = true; main.startLifetime = 8; main.startSpeed = 0.25f; main.startSize = new ParticleSystem.MinMaxCurve(0.02f, 0.06f); // soft motes, ILLUSTRATIVE
            main.maxParticles = Mathf.RoundToInt(3000 * _profile.DustFraction);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startColor = new Color(0.86f, 0.7f, 0.55f, 0.18f);
            var em = _dust.emission; em.rateOverTime = main.maxParticles / 8f;
            var sh = _dust.shape; sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = 12;
            go.GetComponent<ParticleSystemRenderer>().sharedMaterial = dustMaterial;
        }

        // ---------------- camera path (60 s loop) and floating origin ----------------
        Vector3 PathPosition(float t, out Vector3 look)
        {
            t = Mathf.Repeat(t, 60f);
            Vector3 centre = Vector3.zero;
            float baseH = SafeHeight(_rimR, 0);
            if (t < 20f)
            {
                float a = Mathf.Lerp(-30f, 90f, t / 20f) * Mathf.Deg2Rad;
                look = new Vector3(0, SafeHeight(0, 0), 0);
                return centre + new Vector3(Mathf.Cos(a) * 650f, baseH + 120f, Mathf.Sin(a) * 650f);
            }
            var roverEye = _roverPos + new Vector3(0, 1.2f, 0);
            if (t < 35f)
            {
                float u = Mathf.SmoothStep(0, 1, (t - 20f) / 15f);
                var a = new Vector3(0, baseH + 120f, 650f);
                var b = _roverPos + new Vector3(25f, 8f, 25f);
                var p = Vector3.Lerp(a, b, u);
                p.y = Mathf.Max(p.y, SafeHeight(p.x, p.z) + 2f);
                look = Vector3.Lerp(new Vector3(0, SafeHeight(0, 0), 0), roverEye, u);
                return p;
            }
            float ang = (t - 35f) / 25f * Mathf.PI * 2f;
            var q = _roverPos + new Vector3(Mathf.Cos(ang) * 6f, 0, Mathf.Sin(ang) * 6f);
            q.y = SafeHeight(q.x, q.z) + 1.8f;
            look = roverEye;
            return q;
        }

        void LateUpdate()
        {
            if (_siteMode) { if (_siteReady) SiteLateUpdate(); return; }
            if (_mode != ExplorerMode.Flythrough && _bench == null) { ExplorerLateUpdate(); return; }
            _pathT += Time.deltaTime;
            var p = PathPosition(_pathT, out var look);
            // floating origin (spec §3): rebase when the camera is > 1 km from the current origin
            var flat = new Vector3(p.x - _origin.x, 0, p.z - _origin.z);
            if (flat.magnitude > 1000f) { _origin = new Vector3(p.x, 0, p.z); _rebases++; }
            _world.position = -_origin;
            cam.transform.position = p - _origin;
            cam.transform.rotation = Quaternion.LookRotation((look - p).normalized);
            _rocks?.Draw(p, _origin, _profile == null || _profile.ShadowDistance > 0);
        }

        // ---------------- instrumentation ----------------
        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (_siteMode) { if (_siteReady) SiteUpdate(Mathf.Min(Time.deltaTime, 0.1f)); }
            else if (_mode != ExplorerMode.Flythrough && _bench == null) ExplorerUpdate(Mathf.Min(Time.deltaTime, 0.1f));
            _ring[_ringN++ % _ring.Length] = dt;
            if (_bench != null)
            {
                if (_warmLeft > 0) _warmLeft -= dt;
                else { _bench.Add(dt); _benchLeft -= dt; if (_benchLeft <= 0) FinishBenchmark(); }
            }
            _reportTimer += dt;
            if (_reportTimer >= 1f) { _reportTimer = 0; Report("stats", StatsJson()); }
        }

        static float Pct(List<float> sorted, float q) => sorted.Count == 0 ? float.NaN : sorted[Mathf.Clamp((int)(q * (sorted.Count - 1)), 0, sorted.Count - 1)];

        string StatsJson()
        {
            var l = _ring.Take(Mathf.Min(_ringN, _ring.Length)).OrderBy(x => x).ToList();
            var sb = new StringBuilder("{");
            sb.Append("\"profile\":").Append(MiniJson.Q(_profile?.Id))
              .Append(",\"msP50\":").Append(MiniJson.N(Pct(l, 0.5f) * 1000)).Append(",\"msP95\":").Append(MiniJson.N(Pct(l, 0.95f) * 1000))
              .Append(",\"msP99\":").Append(MiniJson.N(Pct(l, 0.99f) * 1000))
              .Append(",\"width\":").Append(Screen.width).Append(",\"height\":").Append(Screen.height)
              .Append(",\"drawCalls\":").Append(_draw.Valid ? _draw.LastValue.ToString() : "null")
              .Append(",\"triangles\":").Append(_tris.Valid ? _tris.LastValue.ToString() : "null")
              .Append(",\"setPass\":").Append(_setpass.Valid ? _setpass.LastValue.ToString() : "null")
              .Append(",\"rebases\":").Append(_rebases).Append(",\"pathT\":").Append(MiniJson.N(_pathT))
              .Append(",\"msMax\":").Append(MiniJson.N(l.Count > 0 ? l[l.Count - 1] * 1000 : 0))
              .Append(",\"gcUsedMB\":").Append(_gcUsed.Valid ? MiniJson.N(_gcUsed.LastValue / 1048576.0) : "null")
              .Append(",\"gcReservedMB\":").Append(_gcReserved.Valid ? MiniJson.N(_gcReserved.LastValue / 1048576.0) : "null")
              .Append(",\"totalUsedMB\":").Append(_totalUsed.Valid ? MiniJson.N(_totalUsed.LastValue / 1048576.0) : "null")
              .Append(",\"rockInstances\":").Append(_rocks?.Instances ?? 0).Append(",\"rockDrawCalls\":").Append(_rocks?.DrawCalls ?? 0)
              .Append(",\"rockTrianglesM\":").Append(MiniJson.N((_rocks?.Triangles ?? 0) / 1e6)).Append(",\"rockRebuildMaxMs\":").Append(MiniJson.N(_rocks?.MaxRebuildMs ?? 0)).Append('}');
            return sb.ToString();
        }

        string ReadyJson()
        {
            var inv = CultureInfo.InvariantCulture;
            return "{" +
                   $"\"device\":{MiniJson.Q(SystemInfo.graphicsDeviceName)},\"api\":{MiniJson.Q(SystemInfo.graphicsDeviceType.ToString())}," +
                   $"\"profiles\":[{string.Join(",", _profiles.Select(x => MiniJson.Q(x.Id)))}],\"profile\":{MiniJson.Q(_profile.Id)}," +
                   $"\"utc\":{MiniJson.Q(_utc.ToString("yyyy-MM-ddTHH:mm:ssZ", inv))},\"sol\":{_sol},\"ltst\":{MiniJson.N(new MarsTime(_utc).LtstHours(_siteLon))}," +
                   $"\"sunElevation\":{MiniJson.N(_sunEl)},\"sunAzimuth\":{MiniJson.N(_sunAz)},\"tau\":{MiniJson.N(_tau)},\"tauLabel\":{MiniJson.Q(_tauLabel)}," +
                   $"\"terrainTriangles\":{_terrain.Triangles},\"chunks\":{_terrain.Chunks.Count},\"rover\":{MiniJson.Q(_roverNote)},\"roverCalibration\":{MiniJson.Q(_calNote)},\"loadMs\":{MiniJson.N(Time.realtimeSinceStartup * 1000)}," +
                   (_siteMode ? SiteReadyJson() : ExplorerReadyJson()) +
                   ",\"heightCheck\":" + (_siteMode ? SiteHeightCheckJson() : HeightCheckJson()) + "}";
        }

        /// <summary>
        /// Terrain gate (spec §2.1): the player's terrain heights at 100 random DTM nodes vs the exact ENU heights the
        /// asset script computed from the HiRISE DTM (victoria_height_check.json).
        /// </summary>
        string HeightCheckJson()
        {
            if (!heightCheck) return "null";
            var c = MiniJson.O(MiniJson.Parse(heightCheck.text));
            double max = 0; int n = 0;
            foreach (var o in MiniJson.A(c["samples"]))
            {
                var d = MiniJson.O(o);
                int col = MiniJson.I(d["col"]), row = MiniJson.I(d["row"]);
                float player = _terrain.Valid(col, row) ? _terrain.Up(col, row) : float.NaN;
                if (float.IsNaN(player)) continue;
                max = Math.Max(max, Math.Abs(player - MiniJson.D(d["upM"]))); n++;
            }
            return $"{{\"samples\":{n},\"maxAbsErrorM\":{MiniJson.N(max)},\"gateM\":0.05,\"pass\":{(max <= 0.05 ? "true" : "false")}}}";
        }

        void Report(string kind, string json) => MarsReport(kind, json);

        // ---------------- JS -> Unity ----------------
        public void SetProfile(string id) => ApplyProfile((id ?? "").Trim().ToLowerInvariant());

        public void SetTau(string v)
        {
            if (!double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var t) || t < 0 || t > 20) { Debug.LogWarning("[Mars] bad tau " + v); return; }
            _tau = t; _tauLabel = $"tau {t:0.##} SET BY USER (value from a source only if the UI says so)";
            ApplySun();
        }

        public void SetUtc(string iso)
        {
            if (_siteMode && !_siteReady) return;
            if (!DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var t)) { Debug.LogWarning("[Mars] bad utc " + iso); return; }
            _utc = t; _sol = _siteMode ? SiteSol(t) : MissionSol(t); ApplySun();
            Report("ready", ReadyJson());
        }

        public void RunBenchmark(string seconds)
        {
            float s = float.TryParse(seconds, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 60f;
            _pathT = 0; _warmLeft = 3f; _benchLeft = s; _bench = new List<float>(8192);
            Report("benchmark", "{\"running\":true}");
        }

        void FinishBenchmark()
        {
            var l = _bench.OrderBy(x => x).ToList();
            float total = _bench.Sum();
            string json = "{" +
                $"\"running\":false,\"profile\":{MiniJson.Q(_profile.Id)},\"frames\":{l.Count},\"seconds\":{MiniJson.N(total)}," +
                $"\"fpsMean\":{MiniJson.N(l.Count / total)},\"fpsP50\":{MiniJson.N(1 / Pct(l, 0.5f))},\"fpsP5\":{MiniJson.N(1 / Pct(l, 0.95f))}," +
                $"\"msP50\":{MiniJson.N(Pct(l, 0.5f) * 1000)},\"msP95\":{MiniJson.N(Pct(l, 0.95f) * 1000)},\"msP99\":{MiniJson.N(Pct(l, 0.99f) * 1000)}," +
                $"\"msMax\":{MiniJson.N(l[l.Count - 1] * 1000)},\"width\":{Screen.width},\"height\":{Screen.height},\"renderScale\":{MiniJson.N(_profile.RenderScale)}," +
                $"\"terrainTriangles\":{_terrain.Triangles},\"drawCalls\":{(_draw.Valid ? _draw.LastValue.ToString() : "null")}," +
                $"\"device\":{MiniJson.Q(SystemInfo.graphicsDeviceName)}}}";
            _bench = null;
            Report("benchmark", json);
        }

        // ---------------- on-screen labels (honesty first) ----------------
        void OnGUI()
        {
            if (_profile == null || _embedded) return; // embedded: the host app shows these labels in its own HUD
            var inv = CultureInfo.InvariantCulture;
            string txt =
                "PROTOTYPE (Stage 2) - Victoria crater, Meridiani Planum\n" +
                "Terrain: HiRISE DTM DTEEC_001414_1780_001612_1780 (1.01 m)  |  Albedo: HiRISE RED band, GRAYSCALE (not colour)\n" +
                $"Time: {SceneDate:yyyy-MM-dd} (Victoria entry, NASA) at {SceneLtst:0}:00 local true solar time (ILLUSTRATIVE)  |  computed sol {_sol}\n" +
                $"Sun (Mars24): elevation {_sunEl.ToString("0.0", inv)} deg, azimuth {_sunAz.ToString("0.0", inv)} deg  |  {_tauLabel}\n" +
                "Sky / dust optical properties: ILLUSTRATIVE (not yet sourced)  |  " + _roverNote + "\n" +
                "Rover: NASA 3D Resources MER-B, " + _calNote + "\n" +
                $"Profile: {_profile.Label}  |  floating-origin rebases: {_rebases}";
            var st = new GUIStyle(GUI.skin.label) { fontSize = 12, wordWrap = true };
            st.normal.textColor = new Color(1, 1, 1, 0.92f);
            GUI.color = new Color(0, 0, 0, 0.55f);
            GUI.DrawTexture(new Rect(8, 8, 760, 112), Texture2D.whiteTexture);
            GUI.color = Color.white;
            GUI.Label(new Rect(14, 10, 750, 110), txt, st);
        }
    }
}
