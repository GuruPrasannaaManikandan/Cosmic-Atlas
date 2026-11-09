using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Editor
{
    /// <summary>
    /// Batch-mode WebGL build of the Milestone-2 showcase:
    ///   Unity.exe -batchmode -quit -projectPath A:\CA\unity\CosmicAtlas -executeMethod CosmicAtlas.Rendering.Editor.WebGLBuild.Build -outDir &lt;dir&gt; -logFile &lt;log&gt;
    /// Uncompressed output (served by scripts/e2e/serve_unity_webgl.py with correct MIME types) so no server-side
    /// Content-Encoding configuration is needed for local testing.
    /// </summary>
    public static class WebGLBuild
    {
        // Shaders reached only via Shader.Find() at runtime must be force-included, or the player strips them.
        static string[] RuntimeShaders => ShowcaseController.RuntimeShaders;

        public static void Build()
        {
            int code = 0;
            try
            {
                var args = Environment.GetCommandLineArgs();
                int i = Array.IndexOf(args, "-outDir");
                string outDir = i >= 0 && i + 1 < args.Length ? args[i + 1] : Path.GetFullPath("Builds/WebGL");
                code = Run(outDir) ? 0 : 1;
            }
            catch (Exception e) { Debug.LogException(e); code = 2; }
            EditorApplication.Exit(code);
        }

        public static bool Run(string outDir)
        {
            IncludeShaders();
            if (!File.Exists("Assets/CosmicAtlas/Scenes/Showcase.unity")) throw new InvalidOperationException("Run ShowcaseCapture once to create Scenes/Showcase.unity");

            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 }); // WebGL 2
            PlayerSettings.WebGL.template = "PROJECT:AtlasMinimal"; // exposes window.unityInstance; WebGL-unavailable message
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.memorySize = 512;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL, ManagedStrippingLevel.Minimal);

            var options = new BuildPlayerOptions
            {
                scenes = new[] { "Assets/CosmicAtlas/Scenes/Showcase.unity" },
                locationPathName = outDir,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            var s = report.summary;
            Debug.Log($"[WebGLBuild] result={s.result} size={s.totalSize / (1024 * 1024)} MB time={s.totalTime} errors={s.totalErrors} warnings={s.totalWarnings} out={outDir}");
            foreach (var step in report.steps)
                foreach (var m in step.messages.Where(m => m.type == LogType.Error || m.type == LogType.Exception))
                    Debug.LogError("[WebGLBuild] " + m.content);
            return s.result == BuildResult.Succeeded;
        }

        static void IncludeShaders()
        {
            var gs = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>("ProjectSettings/GraphicsSettings.asset");
            var so = new SerializedObject(gs);
            var arr = so.FindProperty("m_AlwaysIncludedShaders");
            foreach (var name in RuntimeShaders)
            {
                var sh = Shader.Find(name);
                if (!sh) { Debug.LogError("[WebGLBuild] shader not found: " + name); continue; }
                bool present = false;
                for (int k = 0; k < arr.arraySize; k++) if (arr.GetArrayElementAtIndex(k).objectReferenceValue == sh) present = true;
                if (present) continue;
                arr.InsertArrayElementAtIndex(arr.arraySize);
                arr.GetArrayElementAtIndex(arr.arraySize - 1).objectReferenceValue = sh;
            }
            so.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
        }
    }
}
