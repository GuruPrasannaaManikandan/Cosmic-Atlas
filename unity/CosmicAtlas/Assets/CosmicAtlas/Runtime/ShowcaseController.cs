using System;
using System.Collections.Generic;
using CosmicAtlas.Astro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace CosmicAtlas.Rendering
{
    /// <summary>
    /// Interactive Milestone-2 prototype. Builds every station at start (quality auto-selected for this device),
    /// then: 1–9/0 station · Space/N next viewpoint · right-drag orbit · wheel zoom · Q quality tier · H help panel.
    /// The caption of each viewpoint states what is measured data, what is a physical model and what is illustrative.
    /// </summary>
    public class ShowcaseController : MonoBehaviour
    {
        public Camera cam;
        public List<Station> Stations { get; private set; }
        int _station, _shot;
        Vector3 _target;
        float _yaw, _pitch, _dist;
        bool _help = true;
        float _smoothedDt = 1f / 60f;

        public static Texture2D LoadTexture(string id) => Resources.Load<Texture2D>("AtlasTextures/" + id);

        public static CatalogFile LoadCatalog()
        {
            var ta = Resources.Load<TextAsset>("catalog.v1");
            if (!ta) throw new InvalidOperationException("Resources/catalog.v1.json missing (copy of unity-migration/data/catalog.v1.json)");
            return Newtonsoft.Json.JsonConvert.DeserializeObject<CatalogFile>(ta.text);
        }

        void Start()
        {
            if (!cam) cam = Camera.main;
            AtlasView.Camera = cam;
            AtlasQuality.Set(AtlasQuality.AutoSelectForThisDevice());
            var root = new GameObject("Showcase").transform;
            Stations = ShowcaseFactory.Build(root, AtlasQuality.Settings, LoadTexture, LoadCatalog(), new DateTime(2026, 11, 8, 0, 0, 0, DateTimeKind.Utc));
            Select(0, 0);
        }

        public void Select(int station, int shot)
        {
            _station = Mathf.Clamp(station, 0, Stations.Count - 1);
            var st = Stations[_station];
            _shot = ((shot % st.shots.Count) + st.shots.Count) % st.shots.Count;
            st.Activate(Stations);
            var s = st.shots[_shot];
            var origin = st.root.transform.position;
            _target = origin + s.target;
            var offset = origin + s.position - _target;
            _dist = offset.magnitude;
            _yaw = Mathf.Atan2(offset.x, -offset.z) * Mathf.Rad2Deg;
            _pitch = Mathf.Asin(offset.y / Mathf.Max(_dist, 1e-4f)) * Mathf.Rad2Deg;
            cam.fieldOfView = s.fov; cam.nearClipPlane = s.near; cam.farClipPlane = s.far;
            ApplyCamera();
            s.prepare?.Invoke();
        }

        void ApplyCamera()
        {
            var rot = Quaternion.Euler(_pitch, -_yaw, 0);
            cam.transform.position = _target + rot * new Vector3(0, 0, -_dist);
            cam.transform.LookAt(_target);
        }

        void Update()
        {
            _smoothedDt = Mathf.Lerp(_smoothedDt, Time.unscaledDeltaTime, 0.05f);
            var kb = Keyboard.current; var mouse = Mouse.current;
            if (kb != null)
            {
                for (int i = 0; i < 10; i++)
                {
                    var key = i == 9 ? kb.digit0Key : kb[(Key)((int)Key.Digit1 + i)];
                    if (key.wasPressedThisFrame && i < Stations.Count) Select(i, 0);
                }
                if (kb.spaceKey.wasPressedThisFrame || kb.nKey.wasPressedThisFrame) Select(_station, _shot + 1);
                if (kb.hKey.wasPressedThisFrame) _help = !_help;
                if (kb.qKey.wasPressedThisFrame) CycleQuality();
            }
            if (mouse != null)
            {
                if (mouse.rightButton.isPressed)
                {
                    var d = mouse.delta.ReadValue();
                    _yaw += d.x * 0.2f; _pitch = Mathf.Clamp(_pitch - d.y * 0.2f, -85, 85);
                }
                float wheel = mouse.scroll.ReadValue().y;
                if (Mathf.Abs(wheel) > 0.01f) _dist *= wheel > 0 ? 0.9f : 1.1f;
            }
            ApplyCamera();
        }

        void CycleQuality()
        {
            AtlasQuality.Set((AtlasQualityLevel)(((int)AtlasQuality.Level + 1) % 4));
            ApplyQuality(Stations, AtlasQuality.Settings);
        }

        /// <summary>Applies the per-pixel cost settings of a tier to already-built ray-marched materials (no rebuild).</summary>
        public static void ApplyQuality(List<Station> stations, AtlasQualitySettings q)
        {
            foreach (var st in stations)
                foreach (var m in st.stepMaterials)
                {
                    if (m.shader.name == "CosmicAtlas/BlackHole") m.SetFloat("_Steps", q.blackHoleSteps);
                    if (m.shader.name == "CosmicAtlas/Nebula") m.SetFloat("_Steps", q.nebulaSteps);
                }
        }

        void OnGUI()
        {
            if (Stations == null) return;
            var st = Stations[_station]; var s = st.shots[_shot];
            var style = new GUIStyle(GUI.skin.box) { alignment = TextAnchor.UpperLeft, wordWrap = true, fontSize = 13 };
            string text = $"{_station + 1}. {st.name} — {s.name}\n{s.caption}\n\nQuality: {AtlasQuality.Level}   frame {(_smoothedDt * 1000f):F1} ms";
            if (_help) text += "\n\n1–9/0 station · Space next view · right-drag orbit · wheel zoom · Q quality · H hide";
            GUI.Box(new Rect(12, 12, Mathf.Min(620, Screen.width - 24), _help ? 150 : 110), text, style);
        }
    }
}
