using System.Collections.Generic;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    /// <summary>The camera the exhibits adapt to (LOD, pulsar pulse phase). Set by the controller / capture tool.</summary>
    public static class AtlasView
    {
        static Camera _cam;
        public static Camera Camera { get => _cam ? _cam : Camera.main; set => _cam = value; }
        public static float PixelsPerRadian(Camera c) => c.pixelHeight / (c.fieldOfView * Mathf.Deg2Rad);
    }

    static class Mat
    {
        public static Material Make(string shader)
        {
            var s = Shader.Find(shader);
            if (!s) throw new System.InvalidOperationException("Shader not found: " + shader);
            return new Material(s) { name = shader.Replace("CosmicAtlas/", "") };
        }
    }

    // ------------------------------------------------------------------------------------------------- stars
    /// <summary>
    /// A star: resolved photosphere (limb darkening + granulation) when its disk covers ≥ 3 px, otherwise only a
    /// point-spread glow. Glow brightness follows APPARENT flux (set by the exhibit from distance), so a luminous
    /// distant star and a faint nearby one can look alike — intrinsic luminosity is a separate quantity.
    /// </summary>
    [ExecuteAlways]
    public class StarExhibit : MonoBehaviour
    {
        public float temperatureK = 5772;
        public float radius = 1;              // world units (displayed radius)
        public float surfaceIntensity = 1.4f; // HDR; kept near 1 so limb darkening and granulation survive ACES tonemapping
        public float glowIntensity = 1;       // from apparent flux
        public float glowSize = 6;            // multiple of the radius
        public float granuleScale = 40;
        public string label;

        Renderer _surface, _glow;
        Material _surfMat, _glowMat;

        public void Build(int segments)
        {
            var color = Blackbody.LinearColor(temperatureK);
            var u = (float)StellarModel.LimbDarkeningU(temperatureK);
            var s = new GameObject("Photosphere");
            s.transform.SetParent(transform, false);
            s.transform.localScale = Vector3.one * radius * 2;
            s.AddComponent<MeshFilter>().sharedMesh = MeshUtil.UvSphere(segments);
            _surfMat = Mat.Make("CosmicAtlas/StarSurface");
            _surfMat.SetColor("_StarColor", color);
            _surfMat.SetFloat("_Intensity", surfaceIntensity);
            _surfMat.SetFloat("_LimbU", u);
            _surfMat.SetFloat("_GranuleScale", granuleScale);
            _surface = s.AddComponent<MeshRenderer>();
            _surface.sharedMaterial = _surfMat;

            var g = new GameObject("Glow");
            g.transform.SetParent(transform, false);
            g.transform.localScale = Vector3.one * radius * glowSize;
            g.AddComponent<MeshFilter>().sharedMesh = MeshUtil.Quad();
            _glowMat = Mat.Make("CosmicAtlas/StarGlow");
            _glowMat.SetColor("_StarColor", color);
            _glowMat.SetFloat("_Intensity", glowIntensity);
            _glow = g.AddComponent<MeshRenderer>();
            _glow.sharedMaterial = _glowMat;
        }

        public void UpdateLod(Camera cam)
        {
            if (!cam || !_surface) return;
            float d = Vector3.Distance(cam.transform.position, transform.position);
            float ang = Mathf.Asin(Mathf.Clamp01(radius / Mathf.Max(d, 1e-4f)));
            bool resolved = StellarModel.IsResolved(ang, AtlasView.PixelsPerRadian(cam));
            _surface.enabled = ang * AtlasView.PixelsPerRadian(cam) >= 1.0f;
            _surfMat.SetFloat("_Resolved", resolved ? 1 : 0);
        }

        void LateUpdate() => UpdateLod(AtlasView.Camera);
    }

    // ------------------------------------------------------------------------------------------------- planets & moons
    [ExecuteAlways]
    public class PlanetBody : MonoBehaviour
    {
        public float radius = 1;
        public float rotationPeriodHours;     // 0 = no spin
        public Vector3 poleUnity = Vector3.up;
        Material _mat;
        ShadowOccluder _occ;

        public static PlanetBody Create(Transform parent, string name, float radius, Texture2D albedo, Color tint, float lommelSeeliger, int segments, Mesh customMesh = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var pb = go.AddComponent<PlanetBody>();
            pb.radius = radius;
            var vis = new GameObject("Surface");
            vis.transform.SetParent(go.transform, false);
            vis.transform.localScale = customMesh ? Vector3.one * radius : Vector3.one * radius * 2;
            vis.AddComponent<MeshFilter>().sharedMesh = customMesh ? customMesh : MeshUtil.UvSphere(segments);
            pb._mat = Mat.Make("CosmicAtlas/PlanetSurface");
            if (albedo) pb._mat.SetTexture("_MainTex", albedo);
            pb._mat.SetColor("_BaseColor", tint);
            pb._mat.SetFloat("_LommelSeeliger", lommelSeeliger);
            pb._mat.SetFloat("_UseVertexColor", customMesh ? 1 : 0);
            vis.AddComponent<MeshRenderer>().sharedMaterial = pb._mat;
            pb._occ = go.AddComponent<ShadowOccluder>();
            pb._occ.radius = radius;
            return pb;
        }

        public Material Material => _mat;

        public void SetPole(Vector3 poleDirUnity)
        {
            poleUnity = poleDirUnity.normalized;
            transform.rotation = Quaternion.FromToRotation(Vector3.up, poleUnity);
        }

        public void SetSpinAngle(float degrees)
        {
            var surf = transform.Find("Surface");
            if (surf) surf.localRotation = Quaternion.Euler(0, -degrees, 0);
        }

        void LateUpdate()
        {
            if (_mat && _occ) _mat.SetFloat("_SelfIndex", ShadowOccluder.All.IndexOf(_occ));
            if (Application.isPlaying && rotationPeriodHours > 0)
            {
                var surf = transform.Find("Surface");
                if (surf) surf.Rotate(Vector3.up, -360f * Time.deltaTime * ShowcaseClock.HoursPerSecond / rotationPeriodHours, Space.Self);
            }
        }
    }

    /// <summary>Single-scattering atmosphere shell around a <see cref="PlanetBody"/> (parameters in km, converted to world units).</summary>
    public static class AtmosphereShell
    {
        public struct Params
        {
            public float topKm, scaleHeightRKm, scaleHeightMKm, mieG, intensity, mieAbsorb;
            public Vector3 betaRPerKm; public float betaMPerKm; public Color hazeTint;

            /// <summary>Earth: standard sea-level scattering coefficients (β_R = (5.8, 13.5, 33.1)×10⁻⁶ m⁻¹, β_M = 21×10⁻⁶ m⁻¹).</summary>
            public static Params Earth => new Params { topKm = 100, scaleHeightRKm = 8, scaleHeightMKm = 1.2f, mieG = 0.76f, intensity = 1, mieAbsorb = 1.1f,
                betaRPerKm = new Vector3(5.8e-3f, 13.5e-3f, 33.1e-3f), betaMPerKm = 21e-3f, hazeTint = Color.white };

            /// <summary>Titan: thick photochemical haze — modelled as strongly absorbing, forward-scattering aerosols (illustrative coefficients).</summary>
            public static Params TitanHaze => new Params { topKm = 600, scaleHeightRKm = 40, scaleHeightMKm = 60, mieG = 0.6f, intensity = 1, mieAbsorb = 2.5f,
                betaRPerKm = new Vector3(2e-5f, 5e-5f, 1.2e-4f), betaMPerKm = 6e-3f, hazeTint = new Color(1.0f, 0.62f, 0.25f) };
        }

        public static void Attach(PlanetBody body, float radiusKm, Params p, int steps, int segments)
        {
            float worldPerKm = body.radius / radiusKm;
            var go = new GameObject("Atmosphere");
            go.transform.SetParent(body.transform, false);
            float top = body.radius + p.topKm * worldPerKm;
            go.transform.localScale = Vector3.one * top * 2;
            go.AddComponent<MeshFilter>().sharedMesh = MeshUtil.UvSphere(segments);
            var m = Mat.Make("CosmicAtlas/Atmosphere");
            m.SetFloat("_PlanetRadius", body.radius);
            m.SetFloat("_AtmoRadius", top);
            m.SetVector("_BetaR", p.betaRPerKm / worldPerKm);
            m.SetFloat("_BetaM", p.betaMPerKm / worldPerKm);
            m.SetFloat("_MieAbsorb", p.mieAbsorb);
            m.SetFloat("_ScaleHeightR", p.scaleHeightRKm * worldPerKm);
            m.SetFloat("_ScaleHeightM", p.scaleHeightMKm * worldPerKm);
            m.SetFloat("_MieG", p.mieG);
            m.SetColor("_HazeTint", p.hazeTint);
            m.SetFloat("_Steps", steps);
            m.SetFloat("_Intensity", p.intensity);
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
        }
    }

    // ------------------------------------------------------------------------------------------------- black hole
    public static class BlackHoleExhibit
    {
        /// <summary>Proxy sphere of radius farRadius (in r_s); the transform scale = world units per Schwarzschild radius.</summary>
        public static GameObject Create(Transform parent, float rsWorld, int steps, float diskTempK, bool jets, float farRadius = 60f)
        {
            var go = new GameObject("BlackHole");
            go.transform.SetParent(parent, false);
            go.transform.localScale = Vector3.one * rsWorld;
            var mesh = MeshUtil.UvSphere(32);
            var v = mesh.vertices;
            for (int i = 0; i < v.Length; i++) v[i] *= 2f * farRadius;
            mesh.vertices = v; mesh.RecalculateBounds();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var m = Mat.Make("CosmicAtlas/BlackHole");
            m.SetFloat("_Steps", steps);
            m.SetFloat("_DiskTempK", diskTempK);
            m.SetFloat("_FarRadius", farRadius * 0.98f);
            m.SetFloat("_Jets", jets ? 1 : 0);
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }
    }

    // ------------------------------------------------------------------------------------------------- nebula
    public static class NebulaExhibit
    {
        public static GameObject Create(Transform parent, float size, int steps, Vector4[] stars, float seed, int glowSegments)
        {
            var go = new GameObject("Nebula");
            go.transform.SetParent(parent, false);
            go.transform.localScale = Vector3.one * size;
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var mesh = cube.GetComponent<MeshFilter>().sharedMesh;
            Object.DestroyImmediate(cube);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var m = Mat.Make("CosmicAtlas/Nebula");
            m.SetTexture("_NoiseVol", NoiseVolume.Get(64));
            m.SetFloat("_Steps", steps);
            m.SetFloat("_Seed", seed);
            m.SetFloat("_StarCount", stars.Length);
            var arr = new Vector4[8];
            for (int i = 0; i < Mathf.Min(8, stars.Length); i++) arr[i] = stars[i];
            m.SetVectorArray("_NebulaStars", arr);
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            // the ionising stars themselves (hot O/B stars: blue-white)
            foreach (var s in stars)
            {
                var st = new GameObject("IonisingStar").AddComponent<StarExhibit>();
                st.transform.SetParent(go.transform, false);
                st.transform.localPosition = (Vector3)s;
                st.temperatureK = 38000; st.radius = 0.004f; st.glowIntensity = 4f * s.w; st.glowSize = 14;
                st.Build(glowSegments);
            }
            return go;
        }
    }

    // ------------------------------------------------------------------------------------------------- galaxies
    public static class GalaxyExhibit
    {
        public static GameObject Create(Transform parent, string name, List<Particle> stars, List<Particle> dust, float worldPerKpc, float intensity = 0.6f)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localScale = Vector3.one * worldPerKpc;
            var s = new GameObject("Stars");
            s.transform.SetParent(go.transform, false);
            s.AddComponent<MeshFilter>().sharedMesh = MeshUtil.Billboards(stars, name + "Stars");
            var sm = Mat.Make("CosmicAtlas/ParticleBillboard");
            sm.SetFloat("_Intensity", intensity);
            sm.SetFloat("_Mode", 0); sm.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.One); sm.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.One);
            s.AddComponent<MeshRenderer>().sharedMaterial = sm;
            if (dust != null && dust.Count > 0)
            {
                var d = new GameObject("Dust");
                d.transform.SetParent(go.transform, false);
                d.AddComponent<MeshFilter>().sharedMesh = MeshUtil.Billboards(dust, name + "Dust");
                var dm = Mat.Make("CosmicAtlas/ParticleBillboard");
                dm.SetFloat("_Intensity", 1.0f);
                dm.SetFloat("_Mode", 1); dm.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.DstColor); dm.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.Zero);
                dm.renderQueue = 3100; // after the stars
                d.AddComponent<MeshRenderer>().sharedMaterial = dm;
            }
            return go;
        }
    }

    // ------------------------------------------------------------------------------------------------- pulsar
    /// <summary>
    /// Rotating neutron star with an inclined magnetic dipole ("lighthouse" model). Field lines follow the dipole
    /// equation r = L sin²θ in the magnetic frame, closed inside the light cylinder R_LC = cP/2π. Rotation is slowed
    /// by <see cref="slowdown"/> so it can be seen; the pulse brightens when a beam sweeps across the camera.
    /// </summary>
    [ExecuteAlways]
    public class PulsarExhibit : MonoBehaviour
    {
        public float periodSeconds = 0.0337f;    // Crab pulsar ≈ 33.7 ms
        public float slowdown = 300f;            // displayed rotation is this many times slower than real
        public float magneticInclinationDeg = 50f;
        public float beamHalfAngleDeg = 10f;
        public float starRadius = 1f;            // displayed (exaggerated relative to the field-line extent)
        Transform _magnetic;
        readonly List<Material> _beamMats = new List<Material>();
        StarExhibit _star;
        public float Pulse { get; private set; }
        public float PhaseDeg { get; set; }

        public void Build(int segments)
        {
            _star = new GameObject("NeutronStar").AddComponent<StarExhibit>();
            _star.transform.SetParent(transform, false);
            _star.temperatureK = 1.0e6f;   // X-ray-hot surface: blackbody chromaticity saturates to blue-white
            _star.radius = starRadius; _star.surfaceIntensity = 2.5f; _star.glowIntensity = 1.5f; _star.glowSize = 5; _star.granuleScale = 0;
            _star.Build(segments);

            _magnetic = new GameObject("MagneticFrame").transform;
            _magnetic.SetParent(transform, false);
            _magnetic.localRotation = Quaternion.Euler(0, 0, magneticInclinationDeg);
            var cone = MeshUtil.Cone(starRadius * 40, beamHalfAngleDeg);
            foreach (var dir in new[] { 0f, 180f })
            {
                var b = new GameObject("Beam");
                b.transform.SetParent(_magnetic, false);
                b.transform.localRotation = Quaternion.Euler(dir, 0, 0);
                b.AddComponent<MeshFilter>().sharedMesh = cone;
                var m = Mat.Make("CosmicAtlas/PulsarBeam");
                _beamMats.Add(m);
                b.AddComponent<MeshRenderer>().sharedMaterial = m;
            }
            // dipole field lines r = L sin^2(theta), in planes around the magnetic axis
            var lineMat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.35f, 0.6f, 1f, 1f) };
            foreach (float L in new[] { 3f, 6f, 11f, 18f })
                for (int k = 0; k < 6; k++)
                {
                    var lr = new GameObject("FieldLine").AddComponent<LineRenderer>();
                    lr.transform.SetParent(_magnetic, false);
                    lr.useWorldSpace = false; lr.widthMultiplier = starRadius * 0.05f; lr.sharedMaterial = lineMat;
                    var pts = new List<Vector3>();
                    float phi = k * Mathf.PI / 3f;
                    for (int i = 0; i <= 64; i++)
                    {
                        float th = Mathf.Lerp(0.02f, Mathf.PI - 0.02f, i / 64f);
                        float r = L * starRadius * Mathf.Sin(th) * Mathf.Sin(th);
                        if (r < starRadius) continue;
                        pts.Add(new Vector3(r * Mathf.Sin(th) * Mathf.Cos(phi), r * Mathf.Cos(th), r * Mathf.Sin(th) * Mathf.Sin(phi)));
                    }
                    lr.positionCount = pts.Count; lr.SetPositions(pts.ToArray());
                }
        }

        /// <summary>Pulse = how close a beam axis points at the camera (Gaussian in angle, beam half-width).</summary>
        public static float PulseFor(Vector3 beamAxis, Vector3 toCamera, float halfAngleDeg)
        {
            float ang = Vector3.Angle(beamAxis, toCamera);
            float a2 = Mathf.Min(ang, 180f - ang); // either pole
            return Mathf.Exp(-(a2 * a2) / (2f * halfAngleDeg * halfAngleDeg));
        }

        public void Apply(Camera cam)
        {
            transform.localRotation = Quaternion.Euler(0, PhaseDeg, 0);
            if (!cam || !_magnetic) return;
            Pulse = PulseFor(_magnetic.up, (cam.transform.position - transform.position).normalized, beamHalfAngleDeg);
            foreach (var m in _beamMats) m.SetFloat("_Pulse", Pulse);
        }

        void LateUpdate()
        {
            if (Application.isPlaying) PhaseDeg = (PhaseDeg + 360f * Time.deltaTime / (periodSeconds * slowdown)) % 360f;
            Apply(AtlasView.Camera);
        }
    }

    // ------------------------------------------------------------------------------------------------- comet
    public static class CometExhibit
    {
        /// <summary>Comet at heliocentric distance rAu; tails simulated by <see cref="CometSimulator"/>; world units per AU.</summary>
        public static GameObject Create(Transform parent, float rAu, float worldPerAu, int particles, int seed, float nucleusWorldRadius)
        {
            var go = new GameObject("Comet");
            go.transform.SetParent(parent, false);
            var s = CometSimulator.OnOrbit(rAu);
            go.transform.localPosition = s.nucleus * worldPerAu;
            var dust = new List<Particle>(); var ions = new List<Particle>();
            CometSimulator.Simulate(s, particles * 2, particles * 2, 20f, seed, dust, ions);
            var tails = new GameObject("Tails");
            tails.transform.SetParent(go.transform, false);
            tails.transform.localScale = Vector3.one * worldPerAu;
            GalaxyExhibit.Create(tails.transform, "DustTail", dust, null, 1f, 0.35f);
            GalaxyExhibit.Create(tails.transform, "IonTail", ions, null, 1f, 0.6f);
            var nucleus = PlanetBody.Create(go.transform, "Nucleus", nucleusWorldRadius, null, Color.white, 1f, 32, SmallBodyMesh.BilobedNucleus(4, seed));
            nucleus.Material.SetFloat("_Albedo", 1f);
            var coma = new GameObject("Coma").AddComponent<StarExhibit>();
            coma.transform.SetParent(go.transform, false);
            coma.temperatureK = 5772; coma.radius = nucleusWorldRadius; coma.glowIntensity = 1.2f; coma.glowSize = 60; coma.surfaceIntensity = 0;
            coma.Build(16);
            coma.transform.Find("Photosphere").gameObject.SetActive(false); // the coma is diffuse gas/dust, not a disk
            return go;
        }
    }

    /// <summary>Simulation clock for spinning bodies (hours of simulated time per real second).</summary>
    public static class ShowcaseClock { public static float HoursPerSecond = 0.5f; }
}
