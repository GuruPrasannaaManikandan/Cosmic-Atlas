using System;
using System.IO;
using System.Linq;
using CosmicAtlas.Rendering.Mars;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CosmicAtlas.Rendering.Editor
{
    /// <summary>
    /// Stage 2 Mars prototype: creates Assets/CosmicAtlas/Scenes/MarsPrototype.unity from the data in
    /// Assets/CosmicAtlas/Mars/Data and builds it for WebGL 2 (uncompressed for local testing; Brotli size is measured
    /// separately).
    ///   Unity.exe -batchmode -quit -projectPath A:\CA\unity\CosmicAtlas -executeMethod CosmicAtlas.Rendering.Editor.MarsPrototypeBuild.Build -outDir &lt;dir&gt; -logFile &lt;log&gt;
    /// </summary>
    public static class MarsPrototypeBuild
    {
        const string Data = "Assets/CosmicAtlas/Mars/Data/";
        const string Gen = "Assets/CosmicAtlas/Mars/Generated/";
        const string ScenePath = "Assets/CosmicAtlas/Scenes/MarsPrototype.unity";

        public static void Build()
        {
            int code;
            try
            {
                var args = Environment.GetCommandLineArgs();
                int i = Array.IndexOf(args, "-outDir");
                string outDir = i >= 0 && i + 1 < args.Length ? args[i + 1] : Path.GetFullPath("Builds/MarsExplorer");
                CreateScene();
                code = BuildPlayer(outDir) ? 0 : 1;
            }
            catch (Exception e) { Debug.LogException(e); code = 2; }
            EditorApplication.Exit(code);
        }

        /// <summary>batch entry that only (re)creates the scene</summary>
        public static void CreateSceneBatch()
        {
            int code = 0;
            try { CreateScene(); } catch (Exception e) { Debug.LogException(e); code = 2; }
            EditorApplication.Exit(code);
        }

        static T Load<T>(string p) where T : UnityEngine.Object
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(p);
            if (!a) throw new FileNotFoundException("missing asset " + p);
            return a;
        }

        static Material Mat(string name, string shader, Action<Material> init)
        {
            var path = Gen + name + ".mat";
            var sh = Shader.Find(shader);
            if (!sh) throw new InvalidOperationException("shader not found: " + shader);
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!m) { m = new Material(sh); AssetDatabase.CreateAsset(m, path); }
            m.shader = sh;
            init(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        public static void CreateScene()
        {
            Directory.CreateDirectory(Gen);
            AssetDatabase.Refresh();

            // albedo import: single-channel HiRISE RED, 4096 max, mipmaps, compressed
            var ti = (TextureImporter)AssetImporter.GetAtPath(Data + "victoria_albedo.png");
            ti.textureType = TextureImporterType.Default;
            ti.sRGBTexture = true;
            ti.mipmapEnabled = true;
            ti.maxTextureSize = 4096;
            ti.textureCompression = TextureImporterCompression.Compressed;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.anisoLevel = 4;
            ti.SaveAndReimport();
            var albedo = Load<Texture2D>(Data + "victoria_albedo.png");

            // Stage 3 surface (scripts/mars/victoria_surface.py): 0.5 m ground shade from the 25 cm orthoimage and the 1 m
            // DTM normal map; neither is reduced by a profile's texture cap (ignoreMipmapLimit), they ARE the terrain detail
            var hr = (TextureImporter)AssetImporter.GetAtPath(Data + "victoria_albedo_hr.jpg");
            hr.textureType = TextureImporterType.Default; hr.sRGBTexture = true; hr.mipmapEnabled = true; hr.maxTextureSize = 4096;
            hr.textureCompression = TextureImporterCompression.CompressedHQ; hr.wrapMode = TextureWrapMode.Clamp; hr.anisoLevel = 8; hr.ignoreMipmapLimit = true;
            hr.SaveAndReimport();
            var nrmI = (TextureImporter)AssetImporter.GetAtPath(Data + "victoria_normal.png");
            nrmI.textureType = TextureImporterType.NormalMap; nrmI.mipmapEnabled = true; nrmI.maxTextureSize = 2048;
            nrmI.textureCompression = TextureImporterCompression.CompressedHQ; nrmI.wrapMode = TextureWrapMode.Clamp; nrmI.anisoLevel = 8; nrmI.ignoreMipmapLimit = true;
            nrmI.SaveAndReimport();
            var albedoHr = Load<Texture2D>(Data + "victoria_albedo_hr.jpg");
            var terrainNormal = Load<Texture2D>(Data + "victoria_normal.png");

            // neutral detail map (linear 0.5 x 2 = 1): keeps URP Lit's _DETAIL_MULX2 variant in the build; at runtime the
            // explorer replaces it with the traverse overlay painted on the terrain (replaces the floating route line)
            var neutralPath = Gen + "DetailNeutral.asset";
            var neutral = AssetDatabase.LoadAssetAtPath<Texture2D>(neutralPath);
            if (!neutral)
            {
                neutral = new Texture2D(4, 4, TextureFormat.RGB24, false, true) { name = "DetailNeutral" };
                var px = new Color32[16]; for (int k = 0; k < 16; k++) px[k] = new Color32(128, 128, 128, 255);
                neutral.SetPixels32(px); neutral.Apply();
                AssetDatabase.CreateAsset(neutral, neutralPath);
            }
            var terrainMat = Mat("MarsTerrain", "Universal Render Pipeline/Lit", m =>
            {
                m.SetTexture("_BaseMap", albedoHr);
                m.SetTexture("_BumpMap", terrainNormal);
                m.SetFloat("_BumpScale", 1f);
                m.EnableKeyword("_NORMALMAP");
                m.SetTexture("_DetailAlbedoMap", neutral);
                // URP Lit "scaled" detail: albedo x (2 d s - s + 1); s = 3 lets the traverse overlay reach ~x2.4 on dark ground
                m.SetFloat("_DetailAlbedoMapScale", 3f);
                m.DisableKeyword("_DETAIL_MULX2");
                m.EnableKeyword("_DETAIL_SCALED");
                // ILLUSTRATIVE tint: the HiRISE RED band is grayscale; calibrated colour is a Stage 3 source item
                m.SetColor("_BaseColor", Color.white); // colour is in the albedo texture (ILLUSTRATIVE ramp over the HiRISE RED band)
                m.SetFloat("_Smoothness", 0.08f);
                m.SetFloat("_Metallic", 0f);
            });
            var roverMat = Mat("MarsRoverTemplate", "Universal Render Pipeline/Lit", m => { });
            var skyMat = Mat("MarsSky", "CosmicAtlas/MarsSky", m => { });
            var lineMat = Mat("MarsRouteLine", "Universal Render Pipeline/Unlit", m => m.SetColor("_BaseColor", new Color(0.2f, 0.85f, 1f, 1)));
            // soft round dust mote (not a square): radial alpha falloff
            var softPath = Gen + "DustSoft.asset";
            var soft = AssetDatabase.LoadAssetAtPath<Texture2D>(softPath);
            if (!soft)
            {
                soft = new Texture2D(64, 64, TextureFormat.RGBA32, true) { name = "DustSoft", wrapMode = TextureWrapMode.Clamp };
                var px = new Color32[64 * 64];
                for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++)
                {
                    float d = Mathf.Sqrt((x - 31.5f) * (x - 31.5f) + (y - 31.5f) * (y - 31.5f)) / 31.5f;
                    px[y * 64 + x] = new Color32(255, 255, 255, (byte)(255 * Mathf.Clamp01(1 - d) * Mathf.Clamp01(1 - d)));
                }
                soft.SetPixels32(px); soft.Apply(true);
                AssetDatabase.CreateAsset(soft, softPath);
            }
            var dustMat = Mat("MarsDust", "Universal Render Pipeline/Particles/Unlit", m =>
            {
                m.SetFloat("_Surface", 1); // transparent
                m.SetTexture("_BaseMap", soft);
                m.SetColor("_BaseColor", new Color(0.86f, 0.7f, 0.55f, 0.18f));
            });
            var rockMat = Mat("MarsRock", "Universal Render Pipeline/Lit", m =>
            {
                m.SetColor("_BaseColor", new Color(0.45f, 0.34f, 0.25f, 1));
                m.SetFloat("_Smoothness", 0.15f); m.SetFloat("_Metallic", 0f);
                m.enableInstancing = true; // GPU instancing variant kept in the build
            });
            var merPrefab = ImportMer();

            // volume profile asset: bloom + ACES + fixed exposure
            var profPath = Gen + "MarsVolume.asset";
            var prof = AssetDatabase.LoadAssetAtPath<VolumeProfile>(profPath);
            if (!prof)
            {
                prof = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(prof, profPath);
                var bloom = prof.Add<Bloom>(true); bloom.threshold.Override(1.1f); bloom.intensity.Override(0.25f);
                var tm = prof.Add<Tonemapping>(true); tm.mode.Override(TonemappingMode.ACES);
                var ca = prof.Add<ColorAdjustments>(true); ca.postExposure.Override(0.3f);
                foreach (var c in prof.components) AssetDatabase.AddObjectToAsset(c, prof);
            }
            AssetDatabase.SaveAssets();

            // the PC pipeline asset and its SSAO feature
            var pipeline = Load<UniversalRenderPipelineAsset>("Assets/Settings/PC_RPAsset.asset");
            var ssao = AssetDatabase.LoadAllAssetsAtPath("Assets/Settings/PC_Renderer.asset").OfType<ScriptableRendererFeature>()
                .FirstOrDefault(f => f.name.Contains("AmbientOcclusion"));

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.05f; cam.farClipPlane = 60000f; cam.fieldOfView = 55; cam.allowHDR = true;
            cam.clearFlags = CameraClearFlags.Skybox;
            var cd = camGo.AddComponent<UniversalAdditionalCameraData>();
            cd.renderPostProcessing = true;
            cd.renderShadows = true;

            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional; sun.shadows = LightShadows.Soft; sun.shadowStrength = 0.92f;

            var volGo = new GameObject("PostProcessing");
            var vol = volGo.AddComponent<Volume>(); vol.isGlobal = true; vol.sharedProfile = prof;

            var go = new GameObject("MarsPrototype");
            var mp = go.AddComponent<MarsPrototype>();
            mp.heights = Load<TextAsset>(Data + "victoria_height.bytes");
            mp.heightMeta = Load<TextAsset>(Data + "victoria_height.json");
            mp.heightCheck = Load<TextAsset>(Data + "victoria_height_check.json");
            mp.roverJson = Load<TextAsset>(Data + "mer_b_mesh.json");
            mp.routeJson = Load<TextAsset>(Data + "victoria_route.json");
            mp.profilesJson = Load<TextAsset>(Data + "quality-profiles.json");
            mp.terrainMaterial = terrainMat; mp.roverTemplate = roverMat; mp.skyMaterial = skyMat; mp.lineMaterial = lineMat; mp.dustMaterial = dustMat;
            mp.rockMaterial = rockMat;
            mp.rocksBytes = Load<TextAsset>(Data + "victoria_rocks.bytes");
            mp.groundMask = Load<TextAsset>(Data + "victoria_ground_mask.bytes");
            mp.merModel = merPrefab;
            mp.sun = sun; mp.cam = cam; mp.volume = vol; mp.pipeline = pipeline; mp.ssao = ssao;
            RenderSettings.skybox = skyMat;
            RenderSettings.sun = sun;
            // fog on in the saved scene so URP keeps the fog shader variants (values are set at run time from the look)
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 400; RenderSettings.fogEndDistance = 5000; RenderSettings.fogColor = new Color(0.62f, 0.48f, 0.37f);

            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.SaveAssets();
            Debug.Log($"[MarsPrototypeBuild] scene saved; ssao feature {(ssao ? ssao.name : "NOT FOUND")}");
        }

        const string MerDir = "Assets/CosmicAtlas/Mars/Models/MER/";

        /// <summary>
        /// NASA's articulated MER model (FBX from scripts/mars/blender_export_mer.py). Materials are created here as URP Lit
        /// with the model's own textures (base colour + the packed tangent-space normal maps) and remapped onto the FBX, so
        /// the result does not depend on importer heuristics.
        /// </summary>
        static GameObject ImportMer()
        {
            var fbx = MerDir + "MER_Opportunity.fbx";
            if (!File.Exists(fbx)) { Debug.LogWarning("[MarsPrototypeBuild] no MER FBX; the low-poly model is used"); return null; }
            foreach (var path in Directory.GetFiles(MerDir + "Textures", "*.png"))
            {
                var ti = (TextureImporter)AssetImporter.GetAtPath(path.Replace(Path.DirectorySeparatorChar, '/'));
                bool n = path.EndsWith("_n.png");
                ti.textureType = n ? TextureImporterType.NormalMap : TextureImporterType.Default;
                ti.sRGBTexture = !n; ti.mipmapEnabled = true; ti.maxTextureSize = 1024; ti.anisoLevel = 4;
                ti.textureCompression = TextureImporterCompression.CompressedHQ;
                ti.SaveAndReimport();
            }
            Texture2D T(string name) => AssetDatabase.LoadAssetAtPath<Texture2D>(MerDir + "Textures/" + name + ".png");
            var mi = (ModelImporter)AssetImporter.GetAtPath(fbx);
            mi.globalScale = 1; mi.useFileScale = true; mi.importAnimation = false; mi.importCameras = false; mi.importLights = false;
            mi.importNormals = ModelImporterNormals.Import; mi.importTangents = ModelImporterTangents.CalculateMikk;
            mi.meshCompression = ModelImporterMeshCompression.Off; mi.isReadable = false;
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            mi.SaveAndReimport();
            foreach (var src in AssetDatabase.LoadAllAssetsAtPath(fbx).OfType<Material>().Select(m => m.name).Distinct().ToList())
            {
                string stem = src.EndsWith("_n") ? src.Substring(0, src.Length - 2) : src; // tex_body_n -> tex_body
                var mat = Mat("MER_" + src, "Universal Render Pipeline/Lit", m =>
                {
                    var b = T(stem); var nm = T(stem + "_n");
                    if (b) m.SetTexture("_BaseMap", b);
                    if (nm) { m.SetTexture("_BumpMap", nm); m.EnableKeyword("_NORMALMAP"); m.SetFloat("_BumpScale", 1f); }
                    bool foil = src.Contains("foil") || src.Contains("Silver");
                    m.SetColor("_BaseColor", foil ? new Color(0.8f, 0.8f, 0.82f) : Color.white);
                    m.SetFloat("_Metallic", foil ? 0.85f : src.Contains("panels") ? 0.25f : 0.1f);
                    m.SetFloat("_Smoothness", foil ? 0.6f : src.Contains("panels") ? 0.55f : 0.3f);
                });
                mi.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), src), mat);
            }
            mi.SaveAndReimport();
            return Load<GameObject>(fbx);
        }

        static bool BuildPlayer(string outDir)
        {
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.WebGL.template = "PROJECT:AtlasMinimal";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.memorySize = 512;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL, ManagedStrippingLevel.Minimal);
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath }, locationPathName = outDir, target = BuildTarget.WebGL, options = BuildOptions.None,
            });
            var s = report.summary;
            Debug.Log($"[MarsPrototypeBuild] result={s.result} size={s.totalSize} bytes time={s.totalTime} errors={s.totalErrors} warnings={s.totalWarnings} out={outDir}");
            foreach (var step in report.steps)
                foreach (var m in step.messages.Where(m => m.type == LogType.Error || m.type == LogType.Exception))
                    Debug.LogError("[MarsPrototypeBuild] " + m.content);
            return s.result == BuildResult.Succeeded;
        }
    }
}
