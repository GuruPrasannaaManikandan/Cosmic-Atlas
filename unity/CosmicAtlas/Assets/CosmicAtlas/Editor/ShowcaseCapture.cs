using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Debug = UnityEngine.Debug;

namespace CosmicAtlas.Rendering.Editor
{
    /// <summary>
    /// Batch-mode verification for Milestone 2 (no Unity MCP required):
    ///   Unity.exe -batchmode -projectPath A:\CA\unity\CosmicAtlas -executeMethod CosmicAtlas.Rendering.Editor.ShowcaseCapture.Run
    ///             -outDir &lt;dir&gt; [-quality Medium] [-timing] -logFile &lt;log&gt;
    /// Renders every station viewpoint through URP (HDR, bloom, ACES tonemapping) to PNG, optionally times renders at
    /// every quality tier, writes capture_report.json, saves Assets/CosmicAtlas/Scenes/Showcase.unity, exits non-zero on error.
    /// </summary>
    public static class ShowcaseCapture
    {
        const int Width = 1600, Height = 900;

        [MenuItem("Cosmic Atlas/Capture Showcase (Medium)")]
        public static void MenuCapture() => Capture(Path.GetFullPath("Captures"), AtlasQualityLevel.Medium, false);

        public static void Run()
        {
            int code = 0;
            try
            {
                var args = Environment.GetCommandLineArgs();
                string Arg(string k, string def) { int i = Array.IndexOf(args, k); return i >= 0 && i + 1 < args.Length ? args[i + 1] : def; }
                var outDir = Arg("-outDir", Path.GetFullPath("Captures"));
                var q = (AtlasQualityLevel)Enum.Parse(typeof(AtlasQualityLevel), Arg("-quality", "Medium"));
                bool timing = args.Contains("-timing");
                code = Capture(outDir, q, timing) ? 0 : 1;
            }
            catch (Exception e) { Debug.LogException(e); code = 2; }
            EditorApplication.Exit(code);
        }

        static void SelectPcQuality()
        {
            var names = QualitySettings.names;
            int pc = Array.FindIndex(names, n => n.IndexOf("PC", StringComparison.OrdinalIgnoreCase) >= 0 || n.IndexOf("High", StringComparison.OrdinalIgnoreCase) >= 0);
            if (pc >= 0) QualitySettings.SetQualityLevel(pc, true);
        }

        static Camera MakeCamera()
        {
            var go = new GameObject("CaptureCamera");
            var cam = go.AddComponent<Camera>();
            cam.allowHDR = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;
            var data = go.AddComponent<UniversalAdditionalCameraData>();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            return cam;
        }

        static void MakeVolume()
        {
            var go = new GameObject("PostProcessing");
            var v = go.AddComponent<Volume>();
            v.isGlobal = true;
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.0f);      // only HDR-bright pixels bloom (selective)
            bloom.intensity.Override(0.35f);
            bloom.scatter.Override(0.6f);
            var tm = profile.Add<Tonemapping>(true);
            tm.mode.Override(TonemappingMode.ACES);
            v.sharedProfile = profile;
        }

        public static bool Capture(string outDir, AtlasQualityLevel quality, bool timing)
        {
            Directory.CreateDirectory(outDir);
            SelectPcQuality();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = MakeCamera();
            MakeVolume();
            AtlasView.Camera = cam;

            var report = new StringBuilder();
            report.Append("{\n \"device\": ").Append(Json(SystemInfo.graphicsDeviceName))
                  .Append(",\n \"graphicsApi\": ").Append(Json(SystemInfo.graphicsDeviceType.ToString()))
                  .Append(",\n \"graphicsMemoryMB\": ").Append(SystemInfo.graphicsMemorySize)
                  .Append(",\n \"autoSelectedQuality\": ").Append(Json(AtlasQuality.AutoSelectForThisDevice().ToString()))
                  .Append(",\n \"resolution\": [").Append(Width).Append(", ").Append(Height).Append("]")
                  .Append(",\n \"captureQuality\": ").Append(Json(quality.ToString()))
                  .Append(",\n \"shots\": [");

            var catalog = ShowcaseController.LoadCatalog();
            var date = new DateTime(2026, 11, 8, 0, 0, 0, DateTimeKind.Utc);
            AtlasQuality.Set(quality);
            var root = new GameObject("Showcase").transform;
            var stations = ShowcaseFactory.Build(root, AtlasQuality.Settings, ShowcaseController.LoadTexture, catalog, date);
            var rt = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB) { antiAliasing = 1 };
            cam.targetTexture = rt;
            bool first = true;
            int errors = 0;
            foreach (var st in stations)
                foreach (var shot in st.shots)
                {
                    Frame(cam, st, stations, shot);
                    var tex = new Texture2D(Width, Height, TextureFormat.RGB24, false, false);
                    RenderTexture.active = rt;
                    tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
                    tex.Apply();
                    RenderTexture.active = null;
                    var px = tex.GetPixels32();
                    double mean = px.Average(p => (p.r + p.g + p.b) / 3.0);
                    File.WriteAllBytes(Path.Combine(outDir, shot.name + ".png"), tex.EncodeToPNG());
                    UnityEngine.Object.DestroyImmediate(tex);
                    if (mean < 0.5) { errors++; Debug.LogError($"[Capture] {shot.name} rendered black (mean {mean:F2})"); }
                    report.Append(first ? "\n" : ",\n").Append("  {\"station\": ").Append(Json(st.name)).Append(", \"shot\": ").Append(Json(shot.name))
                          .Append(", \"file\": ").Append(Json(shot.name + ".png")).Append(", \"meanPixel\": ").Append(mean.ToString("F1", System.Globalization.CultureInfo.InvariantCulture))
                          .Append(", \"caption\": ").Append(Json(shot.caption)).Append("}");
                    first = false;
                    Debug.Log($"[Capture] {st.name}/{shot.name} mean={mean:F1}");
                }
            report.Append("\n ]");
            UnityEngine.Object.DestroyImmediate(root.gameObject);

            if (timing)
            {
                report.Append(",\n \"timingMsPerFrame\": {");
                bool firstQ = true;
                foreach (AtlasQualityLevel q in Enum.GetValues(typeof(AtlasQualityLevel)))
                {
                    AtlasQuality.Set(q);
                    var r2 = new GameObject("Showcase_" + q).transform;
                    var st2 = ShowcaseFactory.Build(r2, AtlasQuality.Settings, ShowcaseController.LoadTexture, catalog, date);
                    report.Append(firstQ ? "\n" : ",\n").Append("  ").Append(Json(q.ToString())).Append(": {");
                    bool firstS = true;
                    foreach (var st in st2)
                    {
                        var shot = st.shots[0];
                        Frame(cam, st, st2, shot); // warm-up (shader compile, uploads)
                        var ms = TimeRenders(cam, rt, 12);
                        report.Append(firstS ? "" : ", ").Append(Json(st.name)).Append(": ").Append(ms.ToString("F2", System.Globalization.CultureInfo.InvariantCulture));
                        firstS = false;
                        Debug.Log($"[Timing] {q} {st.name}: {ms:F2} ms/frame");
                    }
                    report.Append("}");
                    firstQ = false;
                    UnityEngine.Object.DestroyImmediate(r2.gameObject);
                }
                report.Append("\n },\n \"timingNote\": \"Editor batch mode, ")
                      .Append(Width).Append("x").Append(Height)
                      .Append(", mean of 12 camera.Render() calls synchronised by a 1-pixel GPU readback; includes CPU submission; not a player-build FPS measurement.\"");
            }
            report.Append("\n}\n");
            File.WriteAllText(Path.Combine(outDir, "capture_report.json"), report.ToString());
            cam.targetTexture = null;
            rt.Release();

            SaveInteractiveScene();
            Debug.Log($"[Capture] done: {outDir}, errors={errors}");
            return errors == 0;
        }

        static void Frame(Camera cam, Station st, List<Station> all, Shot shot)
        {
            st.Activate(all);
            var origin = st.root.transform.position;
            cam.transform.position = origin + shot.position;
            cam.transform.LookAt(origin + shot.target);
            cam.fieldOfView = shot.fov; cam.nearClipPlane = shot.near; cam.farClipPlane = shot.far;
            AtlasView.Camera = cam;
            shot.prepare?.Invoke();
            foreach (var s in st.root.GetComponentsInChildren<StarExhibit>(true)) s.UpdateLod(cam);
            foreach (var p in st.root.GetComponentsInChildren<PlanetBody>(true)) p.SendMessage("LateUpdate", SendMessageOptions.DontRequireReceiver);
            if (st.sun) st.sun.Publish();
            cam.Render();
        }

        static double TimeRenders(Camera cam, RenderTexture rt, int n)
        {
            var one = new Texture2D(1, 1, TextureFormat.RGB24, false);
            RenderTexture.active = rt; one.ReadPixels(new Rect(0, 0, 1, 1), 0, 0); RenderTexture.active = null; // drain
            var sw = Stopwatch.StartNew();
            for (int i = 0; i < n; i++) cam.Render();
            RenderTexture.active = rt; one.ReadPixels(new Rect(0, 0, 1, 1), 0, 0); one.Apply(); RenderTexture.active = null; // GPU sync
            sw.Stop();
            UnityEngine.Object.DestroyImmediate(one);
            return sw.Elapsed.TotalMilliseconds / n;
        }

        static void SaveInteractiveScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = MakeCamera();
            cam.gameObject.tag = "MainCamera";
            cam.targetTexture = null;
            MakeVolume();
            var ctl = new GameObject("ShowcaseController").AddComponent<ShowcaseController>();
            ctl.cam = cam;
            Directory.CreateDirectory("Assets/CosmicAtlas/Scenes");
            EditorSceneManager.SaveScene(scene, "Assets/CosmicAtlas/Scenes/Showcase.unity");
            var scenes = EditorBuildSettings.scenes.ToList();
            if (!scenes.Any(s => s.path == "Assets/CosmicAtlas/Scenes/Showcase.unity"))
            {
                scenes.Insert(0, new EditorBuildSettingsScene("Assets/CosmicAtlas/Scenes/Showcase.unity", true));
                EditorBuildSettings.scenes = scenes.ToArray();
            }
        }

        static string Json(string s) => "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
