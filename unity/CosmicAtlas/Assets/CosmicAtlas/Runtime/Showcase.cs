using System;
using System.Collections.Generic;
using CosmicAtlas.Astro;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    /// <summary>A camera viewpoint inside a station (station-local coordinates).</summary>
    public class Shot
    {
        public string name, caption;
        public Vector3 position, target;
        public float fov = 40f, near = 0.05f, far = 200000f;
        public Action prepare; // e.g. toggle jets, set pulsar phase
    }

    public class Station
    {
        public string name;
        public GameObject root;
        public AtlasSunSource sun;   // null for self-luminous exhibits
        public readonly List<Shot> shots = new List<Shot>();
        public readonly List<Material> stepMaterials = new List<Material>(); // ray-marched materials that follow quality
        public void Activate(IEnumerable<Station> all)
        {
            foreach (var s in all) s.root.SetActive(s == this);
            if (sun) sun.Publish(); else AtlasLighting.SetOccluders(new List<Vector4>());
        }
    }

    /// <summary>
    /// Builds the Milestone-2 showcase: one station per object category, each with the scientific model described in
    /// docs/unity-m2 (report). Every station's provenance (measured data vs. model vs. illustration) is in its caption.
    /// </summary>
    public static class ShowcaseFactory
    {
        public const float StationSpacing = 60000f;

        public static List<Station> Build(Transform root, AtlasQualitySettings q, Func<string, Texture2D> tex, CatalogFile catalog, DateTime utc)
        {
            var list = new List<Station>();
            list.Add(Stars(root, list.Count, q));
            list.Add(JupiterSystem(root, list.Count, q, tex, catalog, utc));
            list.Add(MoonGallery(root, list.Count, q, tex));
            list.Add(Earth(root, list.Count, q, tex));
            list.Add(BlackHole(root, list.Count, q));
            list.Add(Nebula(root, list.Count, q));
            list.Add(Galaxies(root, list.Count, q));
            list.Add(Pulsar(root, list.Count, q));
            list.Add(SmallBodies(root, list.Count, q, catalog));
            list.Add(Comet(root, list.Count, q));
            return list;
        }

        static Station NewStation(Transform root, int index, string name)
        {
            var go = new GameObject("Station_" + name);
            go.transform.SetParent(root, false);
            go.transform.localPosition = new Vector3(index * StationSpacing, 0, 0);
            return new Station { name = name, root = go };
        }

        static AtlasSunSource AddSun(Station st, Vector3 localPos, float radius, float intensity = 1f, float temperatureK = 5772f)
        {
            var go = new GameObject("Sun");
            go.transform.SetParent(st.root.transform, false);
            go.transform.localPosition = localPos;
            var s = go.AddComponent<AtlasSunSource>();
            s.radius = radius; s.intensity = intensity; s.temperatureK = temperatureK;
            st.sun = s;
            return s;
        }

        // ---------------------------------------------------------------------------------------------------- stars
        /// <summary>Displayed radius compression R^0.35 (R in solar radii) so a white dwarf and a supergiant fit one view.</summary>
        public static float DisplayRadius(double rSolar) => (float)Math.Pow(rSolar, 0.35);

        static Station Stars(Transform root, int idx, AtlasQualitySettings q)
        {
            var st = NewStation(root, idx, "Stars");
            // (label, spectral type, radius R☉, Teff K or 0 = from class). Radii: class-typical (approx.) except the
            // Sun (1 R☉ by definition) and the catalogue stars Aldebaran (~44 R☉) and Betelgeuse (~764 R☉) from catalog.v1.json.
            var lineup = new (string label, string type, double rSolar, double teff)[]
            {
                ("White dwarf (DA, class-typical)", "DA2", 0.012, 25000),
                ("M5 V red dwarf (class-typical)", "M5V", 0.2, 0),
                ("K5 V (class-typical)", "K5V", 0.7, 0),
                ("Sun, G2 V", "G2V", 1.0, StellarModel.SolarTeffK),
                ("F5 V (class-typical)", "F5V", 1.4, 0),
                ("A5 V (class-typical)", "A5V", 1.7, 0),
                ("B5 V (class-typical)", "B5V", 3.9, 0),
                ("O5 V (class-typical)", "O5V", 12, 0),
                ("Blue giant, B III (class-typical)", "B2III", 8, 0),
                ("Aldebaran, K5+ III (catalogue)", "K5+ III", 44, 0),
                ("Betelgeuse, M1-M2 Ia-ab (catalogue)", "M1-M2 Ia-ab", 764, 0),
            };
            float x = 0;
            foreach (var s in lineup)
            {
                StellarModel.TryParse(s.type, out var cls, out var sub, out _);
                double teff = s.teff > 0 ? s.teff : StellarModel.ApproxTeff(cls, sub);
                float r = DisplayRadius(s.rSolar);
                if (x > 0) x += r + 1.2f;
                var e = new GameObject(s.label).AddComponent<StarExhibit>();
                e.transform.SetParent(st.root.transform, false);
                e.transform.localPosition = new Vector3(x, 0, 0);
                e.label = s.label;
                e.temperatureK = (float)teff; e.radius = r;
                // glow ∝ compressed luminosity at equal distance (L = R² (T/T☉)⁴): apparent = intrinsic only because all stand side by side
                double L = StellarModel.LuminositySolar(s.rSolar, teff);
                e.glowIntensity = (float)(0.25 + 0.18 * Math.Log10(Math.Max(L, 1e-4) * 1e4));
                e.granuleScale = s.rSolar > 100 ? 5 : s.rSolar > 20 ? 9 : 45;   // giants: few huge convective cells
                e.surfaceIntensity = 1.4f;
                e.Build(q.sphereSegments);
                x += r;
            }
            float mid = x * 0.5f;
            st.shots.Add(new Shot { name = "stars_lineup", caption = "MK classes and luminosity classes at equal distance; colour = blackbody chromaticity of Teff; radius compressed as R^0.35", position = new Vector3(mid, 4, -x * 0.95f), target = new Vector3(mid, 0, 0), fov = 45 });
            st.shots.Add(new Shot { name = "star_sun_closeup", caption = "Resolved G2 V photosphere: limb darkening u≈0.6, illustrative granulation", position = new Vector3(LineupX(lineup, 3) , 0.4f, -3.2f), target = new Vector3(LineupX(lineup, 3), 0, 0), fov = 35 });
            st.shots.Add(new Shot { name = "star_betelgeuse_closeup", caption = "Red supergiant: cool (≈3500 K class-typical), strongly limb-darkened, few giant convection cells (illustrative)", position = new Vector3(LineupX(lineup, 10), 3, -26f), target = new Vector3(LineupX(lineup, 10), 0, 0), fov = 40 });
            return st;
        }

        static float LineupX((string, string, double rSolar, double)[] lineup, int index)
        {
            float x = 0;
            for (int i = 0; i <= index; i++)
            {
                float r = DisplayRadius(lineup[i].rSolar);
                if (i > 0) x += r + 1.2f;
                if (i == index) return x;
                x += r;
            }
            return x;
        }

        // ---------------------------------------------------------------------------------------------------- Jupiter
        public struct JupiterGeometry { public long ms; public Vector3 sunDir; public Vector3 pole; public Dictionary<string, Vector3> moonsKm; public string transitMoon; public double shadowOffsetKm; }

        /// <summary>
        /// Galilean-moon positions (km, Unity axes, Jupiter-centred) from the shared Kepler engine, and the first time
        /// within 3 days of <paramref name="start"/> at which a moon's shadow falls closest to the centre of Jupiter's disk.
        /// </summary>
        public static JupiterGeometry FindShadowTransit(AstroCatalog cat, DateTime start)
        {
            double ms0 = (start - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            const double rJ = 69911;
            var best = new JupiterGeometry { shadowOffsetKm = double.MaxValue };
            var jup = cat.PlanetElements("jupiter");
            for (double ms = ms0; ms < ms0 + 3 * 86400000.0; ms += 5 * 60000.0)
            {
                var sunG = -PlanetEphemeris.PlanetHeliocentricKm(jup, ms);
                var sunU = ToUnity(sunG).normalized;
                foreach (var id in new[] { "io", "europa", "ganymede" })
                {
                    var rel = ToUnity(Kepler.PositionAtMs(cat.SolarById[id].Orbit.Elements, ms));
                    float along = Vector3.Dot(rel, sunU);
                    if (along <= 0) continue;
                    double perp = (rel - along * sunU).magnitude;
                    if (perp < best.shadowOffsetKm && perp < rJ * 0.7)
                    {
                        best.shadowOffsetKm = perp; best.ms = (long)ms; best.transitMoon = id; best.sunDir = sunU;
                    }
                }
            }
            if (best.transitMoon == null) best.ms = (long)ms0;
            var moons = new Dictionary<string, Vector3>();
            foreach (var id in new[] { "io", "europa", "ganymede", "callisto" })
                moons[id] = ToUnity(Kepler.PositionAtMs(cat.SolarById[id].Orbit.Elements, best.ms));
            best.moonsKm = moons;
            best.sunDir = ToUnity(-PlanetEphemeris.PlanetHeliocentricKm(jup, best.ms)).normalized;
            var pole = cat.Data.PlanetPoles["jupiter"];
            best.pole = ToUnity(Coords.EquatorialToGalactic(Coords.RaDecToUnit(pole.RaDeg, pole.DecDeg))).normalized;
            return best;
        }

        public static Vector3 ToUnity(Vec3d galactic) { var u = AxisMapping.GalacticToUnity(galactic); return new Vector3((float)u.X, (float)u.Y, (float)u.Z); }

        static Station JupiterSystem(Transform root, int idx, AtlasQualitySettings q, Func<string, Texture2D> tex, CatalogFile catalog, DateTime utc)
        {
            var st = NewStation(root, idx, "JupiterSystem");
            const float kmPerUnit = 1000f;
            var cat = new AstroCatalog(catalog);
            var geo = FindShadowTransit(cat, utc);
            // Sun placed far along its true direction with a radius giving the true angular size seen from Jupiter
            double distKm = PlanetEphemeris.PlanetHeliocentricKm(cat.PlanetElements("jupiter"), geo.ms).Length;
            float sunDist = 100000f;
            float sunRadius = (float)(695700.0 / distKm) * sunDist;
            AddSun(st, geo.sunDir * sunDist, sunRadius, 1.6f);

            var jupiter = PlanetBody.Create(st.root.transform, "Jupiter", 69911f / kmPerUnit, tex("jupiter_color_2k"), Color.white, 0f, q.sphereSegments);
            jupiter.SetPole(geo.pole);
            jupiter.Material.SetFloat("_BumpStrength", 0.2f);
            var radii = new Dictionary<string, (float km, string texId)> { { "io", (1821.6f, "io_2k") }, { "europa", (1560.8f, "europa_2k") }, { "ganymede", (2631.2f, "ganymede_2k") }, { "callisto", (2410.3f, "callisto_2k") } };
            foreach (var kv in geo.moonsKm)
            {
                var m = PlanetBody.Create(st.root.transform, kv.Key, radii[kv.Key].km / kmPerUnit, tex(radii[kv.Key].texId), Color.white, 1f, q.sphereSegments);
                m.transform.localPosition = kv.Value / kmPerUnit;
                var toPlanet = (-kv.Value).normalized;
                var t = Vector3.ProjectOnPlane(toPlanet, geo.pole).normalized;
                m.transform.rotation = Quaternion.LookRotation(Vector3.Cross(t, geo.pole), geo.pole); // synchronous: 0° longitude faces Jupiter
            }
            var when = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(geo.ms);
            string transit = geo.transitMoon != null ? $"{char.ToUpper(geo.transitMoon[0]) + geo.transitMoon.Substring(1)} shadow transit, {when:yyyy-MM-dd HH:mm} UTC" : "no shadow transit found in window";
            var moonPos = geo.transitMoon != null ? geo.moonsKm[geo.transitMoon] / kmPerUnit : Vector3.zero;
            var side = Vector3.Cross(geo.sunDir, geo.pole).normalized;
            st.shots.Add(new Shot { name = "jupiter_shadow_transit", caption = transit + " — positions from the shared Kepler engine; penumbra from the Sun's true angular size; Jupiter map: Solar System Scope (CC BY 4.0)", position = geo.sunDir * 300f + side * 90f + geo.pole * 40f, target = Vector3.zero, fov = 42, near = 1f, far = 300000f });
            st.shots.Add(new Shot { name = "jupiter_system_wide", caption = "Galilean moons at their computed positions for the same instant (true sizes and distances, 1 unit = 1000 km)", position = geo.sunDir * 1200f + side * 900f + geo.pole * 500f, target = moonPos * 0.3f, fov = 45, near = 1f, far = 300000f });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- moons
        static Station MoonGallery(Transform root, int idx, AtlasQualitySettings q, Func<string, Texture2D> tex)
        {
            var st = NewStation(root, idx, "Moons");
            const float kmPerUnit = 100f;
            AddSun(st, new Vector3(-60000, 15000, -40000), 600f, 1.4f);
            // (name, mean radius km [JPL SSD], texture, Lommel–Seeliger weight, caption)
            var moons = new (string name, float rKm, string tex, float ls)[]
            {
                ("Moon", 1737.4f, "moon_albedo_2k", 1f), ("Io", 1821.6f, "io_2k", 1f), ("Europa", 1560.8f, "europa_2k", 0.85f),
                ("Ganymede", 2631.2f, "ganymede_2k", 1f), ("Callisto", 2410.3f, "callisto_2k", 1f), ("Enceladus", 252.1f, "enceladus_2k", 0.8f),
                ("Triton", 1352.6f, "triton_2k", 0.9f), ("Titan", 2574.7f, null, 0f),
            };
            float x = 0;
            var centres = new List<Vector3>();
            foreach (var m in moons)
            {
                float r = m.rKm / kmPerUnit;
                if (x > 0) x += r + 6f;
                var body = PlanetBody.Create(st.root.transform, m.name, r, m.tex != null ? tex(m.tex) : null, m.tex != null ? Color.white : new Color(0.55f, 0.42f, 0.25f), m.ls, q.sphereSegments);
                body.transform.localPosition = new Vector3(x, 0, 0);
                if (m.name == "Titan") AtmosphereShell.Attach(body, m.rKm, AtmosphereShell.Params.TitanHaze, q.atmosphereSteps, q.sphereSegments);
                centres.Add(body.transform.localPosition);
                x += r;
            }
            float mid = x * 0.5f;
            st.shots.Add(new Shot { name = "moons_gallery", caption = "True relative sizes (JPL mean radii); USGS/NASA mosaics (Moon: Solar System Scope CC BY 4.0); Lommel–Seeliger regolith; Titan = haze model, no surface map", position = new Vector3(mid, 18, -150), target = new Vector3(mid, 0, 0), fov = 40, near = 0.5f });
            st.shots.Add(new Shot { name = "moon_closeup", caption = "The Moon: maria and highlands from the albedo map; regolith photometry (Lommel–Seeliger) gives the flat-looking disk and sharp terminator", position = centres[0] + new Vector3(-10, 6, -38), target = centres[0], fov = 35, near = 0.5f });
            st.shots.Add(new Shot { name = "europa_closeup", caption = "Europa: Galileo/Voyager mosaic (USGS) — lineae and chaos terrain", position = centres[2] + new Vector3(-12, 6, -34), target = centres[2], fov = 35, near = 0.5f });
            st.shots.Add(new Shot { name = "titan_haze", caption = "Titan: forward-scattering orange photochemical haze (single-scattering model, illustrative coefficients) hides the surface", position = centres[7] + new Vector3(-30, 8, -60), target = centres[7], fov = 35, near = 0.5f });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- Earth
        static Station Earth(Transform root, int idx, AtlasQualitySettings q, Func<string, Texture2D> tex)
        {
            var st = NewStation(root, idx, "Earth");
            const float kmPerUnit = 100f;
            AddSun(st, new Vector3(-80000, 10000, -20000), 750f, 1.6f);
            var earth = PlanetBody.Create(st.root.transform, "Earth", 6371f / kmPerUnit, tex("earth_day_2k"), Color.white, 0f, q.sphereSegments);
            earth.SetPole(Quaternion.Euler(0, 0, 23.44f) * Vector3.up);
            earth.Material.SetTexture("_NightMap", tex("earth_night_2k"));
            earth.Material.SetFloat("_NightStrength", 0.8f);
            earth.Material.SetFloat("_BumpStrength", 0.4f);
            AtmosphereShell.Attach(earth, 6371f, AtmosphereShell.Params.Earth, q.atmosphereSteps, q.sphereSegments);
            st.shots.Add(new Shot { name = "earth_terminator", caption = "Earth: Rayleigh+Mie single scattering (blue limb, reddened terminator), night lights only on the dark side; maps: Solar System Scope (CC BY 4.0)", position = new Vector3(60, 25, -170), target = Vector3.zero, fov = 35, near = 0.5f });
            st.shots.Add(new Shot { name = "earth_limb", caption = "Atmospheric limb at the terminator", position = new Vector3(-30, 12, -92), target = new Vector3(-20, 8, 0), fov = 30, near = 0.2f });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- black hole
        static Station BlackHole(Transform root, int idx, AtlasQualitySettings q)
        {
            var st = NewStation(root, idx, "BlackHole");
            var bh = BlackHoleExhibit.Create(st.root.transform, 1f, q.blackHoleSteps, 9000f, false);
            var mat = bh.GetComponent<MeshRenderer>().sharedMaterial;
            st.stepMaterials.Add(mat);
            bh.transform.localRotation = Quaternion.Euler(0, 0, 0);
            st.shots.Add(new Shot { name = "blackhole_edge_on", caption = "Schwarzschild ray tracing: shadow, photon ring and the lensed far side of the disk arching over and under the hole; approaching side brighter and bluer (Doppler beaming)", position = new Vector3(0, 3.2f, -36), target = Vector3.zero, fov = 40, near = 0.05f, prepare = () => mat.SetFloat("_Jets", 0) });
            st.shots.Add(new Shot { name = "blackhole_inclined", caption = "Same model at 50° inclination", position = Quaternion.Euler(50, 0, 0) * new Vector3(0, 0, -34), target = Vector3.zero, fov = 40, near = 0.05f, prepare = () => mat.SetFloat("_Jets", 0) });
            st.shots.Add(new Shot { name = "blackhole_jets_educational", caption = "EDUCATIONAL: relativistic jets as a Doppler-boosted emission cone (not a jet-physics model)", position = new Vector3(0, 9, -48), target = new Vector3(0, 2, 0), fov = 45, near = 0.05f, prepare = () => mat.SetFloat("_Jets", 1) });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- nebula
        static Station Nebula(Transform root, int idx, AtlasQualitySettings q)
        {
            var st = NewStation(root, idx, "Nebula");
            var stars = new[] { new Vector4(0.05f, 0.02f, 0.0f, 1.0f), new Vector4(-0.08f, 0.06f, 0.05f, 0.8f), new Vector4(0.12f, -0.05f, -0.06f, 0.6f), new Vector4(-0.15f, -0.1f, 0.1f, 0.5f) };
            var neb = NebulaExhibit.Create(st.root.transform, 200f, q.nebulaSteps, stars, 3.7f, 16);
            st.stepMaterials.Add(neb.GetComponent<MeshRenderer>().sharedMaterial);
            st.shots.Add(new Shot { name = "nebula_wide", caption = "Volumetric H II region (ILLUSTRATIVE density field): Hα 656 nm red, [O III] 501 nm teal near the hottest stars, dust lanes in extinction, cavity carved around the cluster", position = new Vector3(40, 30, -260), target = Vector3.zero, fov = 45, near = 1f });
            st.shots.Add(new Shot { name = "nebula_inside", caption = "Inside the volume: parallax and depth between dust columns that point toward the ionising stars", position = new Vector3(-35, -8, -55), target = new Vector3(5, 0, 0), fov = 60, near = 0.5f });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- galaxies
        static Station Galaxies(Transform root, int idx, AtlasQualitySettings q)
        {
            var st = NewStation(root, idx, "Galaxies");
            var stars = new List<Particle>(); var dust = new List<Particle>();
            var placements = new (GalaxyMorphology m, Vector3 pos, Vector3 rot, string shot, string caption)[]
            {
                (GalaxyMorphology.Spiral, new Vector3(0, 0, 0), new Vector3(-58, 0, 20), "galaxy_spiral", "Grand-design spiral (Sb-like, illustrative parameters): exponential disk, log-spiral arms (pitch 14°), Hernquist bulge, blue arms / yellow bulge, Hα knots, dust on the inner arm edges"),
                (GalaxyMorphology.BarredSpiral, new Vector3(80, 0, 0), new Vector3(-25, 0, 0), "galaxy_barred", "Barred spiral (SBb-like): arms start at the bar ends"),
                (GalaxyMorphology.Elliptical, new Vector3(160, 0, 0), new Vector3(-20, 30, 0), "galaxy_elliptical", "Elliptical E3: Hernquist (de Vaucouleurs-like) profile, smooth old red population, no dust lanes"),
                (GalaxyMorphology.Irregular, new Vector3(0, 0, 80), new Vector3(-30, 0, 0), "galaxy_irregular", "Irregular (Magellanic-type): clumpy star formation, no global symmetry"),
                (GalaxyMorphology.Dwarf, new Vector3(80, 0, 80), new Vector3(0, 0, 0), "galaxy_dwarf", "Dwarf spheroidal: diffuse Plummer sphere, low surface brightness"),
            };
            int seed = 11;
            foreach (var p in placements)
            {
                var g = GalaxyParams.Typical(p.m);
                int count = p.m == GalaxyMorphology.Dwarf ? q.galaxyParticles / 6 : q.galaxyParticles;
                GalaxyGenerator.Generate(g, count, seed++, stars, dust);
                var go = GalaxyExhibit.Create(st.root.transform, p.m.ToString(), new List<Particle>(stars), new List<Particle>(dust), 1f, p.m == GalaxyMorphology.Dwarf ? 0.35f : 0.5f);
                go.transform.localPosition = p.pos;
                go.transform.localRotation = Quaternion.Euler(p.rot);
                float dist = p.m == GalaxyMorphology.Dwarf ? 12f : p.m == GalaxyMorphology.Irregular ? 16f : 32f;
                st.shots.Add(new Shot { name = p.shot, caption = p.caption, position = p.pos + new Vector3(0, 2, -dist), target = p.pos, fov = 45, near = 0.05f });
            }
            var inter = InteractingGalaxies.Simulate(q.galaxyParticles / 8, InteractingGalaxies.DefaultSteps, 99, 0.8f, 3.5f, 60f);
            var ig = GalaxyExhibit.Create(st.root.transform, "Interacting", inter.stars, null, 1f, 0.9f);
            ig.transform.localPosition = new Vector3(160, 0, 80);
            ig.transform.localRotation = Quaternion.Euler(-60, 10, 0);
            st.shots.Add(new Shot { name = "galaxy_interacting", caption = "Interacting pair from a restricted three-body simulation (Toomre & Toomre 1972): tidal tails and bridge form from gravity alone", position = new Vector3(160, 3, 80 - 30), target = new Vector3(160, 0, 80), fov = 50, near = 0.05f });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- pulsar
        static Station Pulsar(Transform root, int idx, AtlasQualitySettings q)
        {
            var st = NewStation(root, idx, "Pulsar");
            var p = new GameObject("CrabLikePulsar").AddComponent<PulsarExhibit>();
            p.transform.SetParent(st.root.transform, false);
            p.Build(q.sphereSegments);
            // observer placed 50° from the spin axis (= the magnetic inclination), i.e. ON the cone swept by the beams;
            // an observer outside |ζ − α| ≲ beam width would never see pulses (EditMode/PlayMode tests check this)
            var onCone = new Vector3(0, 42f * Mathf.Cos(50f * Mathf.Deg2Rad), -42f * Mathf.Sin(50f * Mathf.Deg2Rad));
            st.shots.Add(new Shot { name = "pulsar_offpulse", caption = "Lighthouse model: neutron star, inclined magnetic dipole (field lines r = L sin²θ), beams along the magnetic axis — EDUCATIONAL depiction; rotation slowed ×300 (Crab P ≈ 33.7 ms); observer 50° from the spin axis", position = onCone, target = Vector3.zero, fov = 45, near = 0.05f, prepare = () => { p.PhaseDeg = 90; p.Apply(AtlasView.Camera); } });
            st.shots.Add(new Shot { name = "pulsar_onpulse", caption = "Same pulsar at the rotation phase where a beam sweeps across the observer: the pulse", position = onCone, target = Vector3.zero, fov = 45, near = 0.05f, prepare = () => { p.PhaseDeg = BestPulsePhase(p); p.Apply(AtlasView.Camera); } });
            return st;
        }

        static float BestPulsePhase(PulsarExhibit p)
        {
            float best = 0, bestPulse = -1;
            for (int d = 0; d < 360; d += 2) { p.PhaseDeg = d; p.Apply(AtlasView.Camera); if (p.Pulse > bestPulse) { bestPulse = p.Pulse; best = d; } }
            return best;
        }

        // ---------------------------------------------------------------------------------------------------- small bodies
        static Station SmallBodies(Transform root, int idx, AtlasQualitySettings q, CatalogFile catalog)
        {
            var st = NewStation(root, idx, "SmallBodies");
            AddSun(st, new Vector3(-50000, 20000, -30000), 300f, 1.5f);
            var phobos = catalog.SolarBodies.Find(b => b.Id == "phobos");
            var ax = phobos?.Physical?.TriaxialKm ?? new[] { 13.0, 11.4, 9.1 };
            var phobosMesh = SmallBodyMesh.Build(new Vector3((float)ax[0], (float)ax[2], (float)ax[1]), 5, 220, 7, new Color(0.11f, 0.10f, 0.09f));
            var pb = PlanetBody.Create(st.root.transform, "Phobos", 1f, null, Color.white, 1f, 32, phobosMesh);
            var ast = PlanetBody.Create(st.root.transform, "Asteroid", 1f, null, Color.white, 1f, 32, SmallBodyMesh.Build(new Vector3(9, 6, 5), 5, 160, 21, new Color(0.22f, 0.21f, 0.2f), 0.18f));
            ast.transform.localPosition = new Vector3(45, 0, 0);
            st.shots.Add(new Shot { name = "phobos", caption = "Phobos: triaxial shape from the catalogue (Thomas et al., scaled to the JPL mean radius); craters and grooves PROCEDURAL (not mapped); albedo ≈ 0.07", position = new Vector3(-8, 10, -34), target = Vector3.zero, fov = 40, near = 0.05f });
            st.shots.Add(new Shot { name = "asteroid", caption = "Generic S-type-like asteroid: irregular procedural shape, crater size distribution N(>D) ∝ D⁻²", position = new Vector3(45 - 6, 8, -26), target = new Vector3(45, 0, 0), fov = 40, near = 0.05f });
            return st;
        }

        // ---------------------------------------------------------------------------------------------------- comet
        static Station Comet(Transform root, int idx, AtlasQualitySettings q)
        {
            var st = NewStation(root, idx, "Comet");
            const float worldPerAu = 1000f;
            AddSun(st, Vector3.zero, 0.00465f * worldPerAu, 1.4f);
            var c = CometExhibit.Create(st.root.transform, 1.0f, worldPerAu, q.cometParticles, 5, 0.25f);
            var cp = c.transform.localPosition;
            st.shots.Add(new Shot { name = "comet_tails", caption = "Comet at 1 AU: curved dust tail (grains under gravity reduced by radiation pressure, 1−β) and straight blue ion tail (solar wind) — both simulated; nucleus enlarged for visibility", position = cp + new Vector3(20, 25, -95), target = cp + new Vector3(30, 0, 5), fov = 50, near = 0.05f });
            st.shots.Add(new Shot { name = "comet_nucleus", caption = "Dark bilobed nucleus (albedo ≈ 0.04, illustrative shape) inside its coma", position = cp + new Vector3(-0.8f, 0.4f, -1.6f), target = cp, fov = 40, near = 0.01f });
            return st;
        }
    }
}
