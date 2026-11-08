using System.Collections.Generic;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    /// <summary>
    /// Publishes the single-sun lighting model to every Cosmic Atlas shader (see Shaders/AtlasCommon.hlsl):
    /// sun position/radius/colour and up to 8 spherical occluders used for analytic eclipses and shadow transits.
    /// </summary>
    public static class AtlasLighting
    {
        public const int MaxOccluders = 8;
        static readonly int SunPosRadius = Shader.PropertyToID("_AtlasSunPosRadius");
        static readonly int SunColor = Shader.PropertyToID("_AtlasSunColor");
        static readonly int Occluders = Shader.PropertyToID("_AtlasOccluders");
        static readonly int OccluderCount = Shader.PropertyToID("_AtlasOccluderCount");
        static readonly int Exposure = Shader.PropertyToID("_AtlasExposure");
        static readonly int TimeId = Shader.PropertyToID("_AtlasTime");
        static readonly Vector4[] Buffer = new Vector4[MaxOccluders];

        public static void SetSun(Vector3 position, float radius, Color linearColor, float intensity)
        {
            Shader.SetGlobalVector(SunPosRadius, new Vector4(position.x, position.y, position.z, radius));
            Shader.SetGlobalVector(SunColor, (Vector4)(linearColor * intensity));
        }

        /// <summary>Spheres that can cast shadows/eclipses on other bodies, in world space (centre, radius).</summary>
        public static int SetOccluders(IReadOnlyList<Vector4> spheres)
        {
            int n = Mathf.Min(spheres.Count, MaxOccluders);
            for (int i = 0; i < MaxOccluders; i++) Buffer[i] = i < n ? spheres[i] : Vector4.zero;
            Shader.SetGlobalVectorArray(Occluders, Buffer);
            Shader.SetGlobalFloat(OccluderCount, n);
            return n;
        }

        public static void SetExposure(float exposure) => Shader.SetGlobalFloat(Exposure, exposure);
        public static void SetTime(float seconds) => Shader.SetGlobalFloat(TimeId, seconds);
    }

    /// <summary>
    /// Scene component: the star that lights an exhibit. Collects every <see cref="ShadowOccluder"/> in the scene each frame.
    /// </summary>
    [ExecuteAlways]
    public class AtlasSunSource : MonoBehaviour
    {
        [Tooltip("Physical radius in world units (sets the size of the penumbra)")] public float radius = 1f;
        [Tooltip("Photosphere temperature, K (IAU nominal solar value 5772 K)")] public float temperatureK = 5772f;
        public float intensity = 1f;
        public float exposure = 1f;

        readonly List<Vector4> _occ = new List<Vector4>();

        public void Publish()
        {
            AtlasLighting.SetSun(transform.position, radius, Blackbody.LinearColor(temperatureK), intensity);
            _occ.Clear();
            foreach (var o in ShadowOccluder.All)
                if (o && o.isActiveAndEnabled) _occ.Add(new Vector4(o.transform.position.x, o.transform.position.y, o.transform.position.z, o.Radius));
            AtlasLighting.SetOccluders(_occ);
            AtlasLighting.SetExposure(exposure);
            AtlasLighting.SetTime(Application.isPlaying ? Time.time : (float)(System.DateTime.UtcNow.TimeOfDay.TotalSeconds % 3600));
        }

        void LateUpdate() => Publish();
        void OnEnable() => Publish();
    }

    /// <summary>A sphere that casts analytic shadows/eclipses (planets, moons).</summary>
    [ExecuteAlways]
    public class ShadowOccluder : MonoBehaviour
    {
        public static readonly List<ShadowOccluder> All = new List<ShadowOccluder>();
        [Tooltip("Radius in world units; 0 = use the transform's uniform scale / 2 (unit sphere mesh)")] public float radius;
        public float Radius => radius > 0 ? radius : transform.lossyScale.x * 0.5f;
        void OnEnable() { if (!All.Contains(this)) All.Add(this); }
        void OnDisable() => All.Remove(this);
    }
}
