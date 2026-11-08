using System;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    public enum AtlasQualityLevel { Low = 0, Medium = 1, High = 2, Ultra = 3 }

    /// <summary>
    /// Quality tiers for the expensive per-pixel and per-particle systems. Each exhibit reads the active tier;
    /// navigation/camera code never depends on it (visual cost must not affect responsiveness).
    /// </summary>
    [Serializable]
    public struct AtlasQualitySettings
    {
        public int blackHoleSteps;      // geodesic integration steps per pixel
        public int nebulaSteps;         // volume ray-march steps per pixel
        public int atmosphereSteps;     // in-scattering samples along the view ray
        public int galaxyParticles;     // stars per galaxy
        public int cometParticles;      // particles per tail
        public float renderScale;       // URP render scale
        public int sphereSegments;      // mesh tessellation of spheres

        public static AtlasQualitySettings For(AtlasQualityLevel q)
        {
            switch (q)
            {
                case AtlasQualityLevel.Low: return new AtlasQualitySettings { blackHoleSteps = 64, nebulaSteps = 24, atmosphereSteps = 8, galaxyParticles = 12000, cometParticles = 600, renderScale = 0.75f, sphereSegments = 48 };
                case AtlasQualityLevel.Medium: return new AtlasQualitySettings { blackHoleSteps = 110, nebulaSteps = 40, atmosphereSteps = 12, galaxyParticles = 30000, cometParticles = 1500, renderScale = 0.9f, sphereSegments = 72 };
                case AtlasQualityLevel.High: return new AtlasQualitySettings { blackHoleSteps = 180, nebulaSteps = 64, atmosphereSteps = 16, galaxyParticles = 60000, cometParticles = 3000, renderScale = 1f, sphereSegments = 96 };
                default: return new AtlasQualitySettings { blackHoleSteps = 300, nebulaSteps = 96, atmosphereSteps = 24, galaxyParticles = 120000, cometParticles = 6000, renderScale = 1f, sphereSegments = 128 };
            }
        }
    }

    public static class AtlasQuality
    {
        public static AtlasQualityLevel Level { get; private set; } = AtlasQualityLevel.Medium;
        public static AtlasQualitySettings Settings => AtlasQualitySettings.For(Level);
        public static event Action<AtlasQualityLevel> Changed;

        public static void Set(AtlasQualityLevel level)
        {
            Level = level;
            Changed?.Invoke(level);
        }

        /// <summary>
        /// Conservative starting tier from the detected device. Integrated GPUs (shared memory) and the web start at
        /// Medium/Low; the user can always override. The rule is deliberately simple and documented, not a benchmark.
        /// </summary>
        public static AtlasQualityLevel AutoSelect(string deviceName, int graphicsMemoryMB, bool isMobileOrWeb, int shaderLevel)
        {
            if (isMobileOrWeb || shaderLevel < 45) return AtlasQualityLevel.Low;
            string n = (deviceName ?? string.Empty).ToLowerInvariant();
            bool integrated = n.Contains("intel") || n.Contains("uhd") || n.Contains("iris") || (n.Contains("radeon") && n.Contains("graphics") && !n.Contains("rx"));
            if (integrated) return graphicsMemoryMB >= 2048 ? AtlasQualityLevel.Medium : AtlasQualityLevel.Low;
            if (graphicsMemoryMB >= 8000) return AtlasQualityLevel.Ultra;
            if (graphicsMemoryMB >= 4000) return AtlasQualityLevel.High;
            return AtlasQualityLevel.Medium;
        }

        public static AtlasQualityLevel AutoSelectForThisDevice() =>
            AutoSelect(SystemInfo.graphicsDeviceName, SystemInfo.graphicsMemorySize,
                Application.isMobilePlatform || Application.platform == RuntimePlatform.WebGLPlayer, SystemInfo.graphicsShaderLevel);
    }
}
