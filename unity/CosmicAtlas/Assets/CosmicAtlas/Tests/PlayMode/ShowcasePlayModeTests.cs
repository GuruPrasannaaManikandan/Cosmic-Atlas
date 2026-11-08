using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CosmicAtlas.Rendering.Tests
{
    public class ShowcasePlayModeTests
    {
        [UnityTest]
        public IEnumerator Every_station_and_viewpoint_runs_at_every_quality_without_errors()
        {
            var camGo = new GameObject("TestCamera");
            var cam = camGo.AddComponent<Camera>();
            camGo.tag = "MainCamera";
            var ctl = new GameObject("Controller").AddComponent<ShowcaseController>();
            ctl.cam = cam;
            yield return null; // Start() builds all stations
            Assert.IsNotNull(ctl.Stations);
            Assert.AreEqual(10, ctl.Stations.Count);
            for (int s = 0; s < ctl.Stations.Count; s++)
                for (int k = 0; k < ctl.Stations[s].shots.Count; k++)
                {
                    ctl.Select(s, k);
                    yield return null;
                    yield return null;
                    Assert.IsTrue(ctl.Stations[s].root.activeSelf, $"station {s} active");
                    for (int o = 0; o < ctl.Stations.Count; o++)
                        if (o != s) Assert.IsFalse(ctl.Stations[o].root.activeSelf, "only one station visible at a time");
                }
            foreach (AtlasQualityLevel q in System.Enum.GetValues(typeof(AtlasQualityLevel)))
            {
                AtlasQuality.Set(q);
                ShowcaseController.ApplyQuality(ctl.Stations, AtlasQuality.Settings);
                ctl.Select(4, 0); // black hole: the most expensive per-pixel exhibit
                yield return null;
            }
            LogAssert.NoUnexpectedReceived();
            Object.Destroy(ctl.gameObject);
            Object.Destroy(camGo);
            foreach (var go in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None)) if (go && go.name == "Showcase") Object.Destroy(go.gameObject);
        }

        [UnityTest]
        public IEnumerator Pulsar_rotates_and_pulses_in_play_mode()
        {
            var camGo = new GameObject("Cam"); var cam = camGo.AddComponent<Camera>();
            AtlasView.Camera = cam;
            var p = new GameObject("Pulsar").AddComponent<PulsarExhibit>();
            p.Build(32);
            // observer on the beam cone: 50° from the spin axis, equal to the magnetic inclination
            cam.transform.position = new Vector3(0, 42f * Mathf.Cos(50f * Mathf.Deg2Rad), -42f * Mathf.Sin(50f * Mathf.Deg2Rad)); cam.transform.LookAt(Vector3.zero);
            float maxPulse = 0, minPulse = 1;
            for (int i = 0; i < 120; i++)
            {
                p.PhaseDeg = i * 3f;
                p.Apply(cam);
                maxPulse = Mathf.Max(maxPulse, p.Pulse); minPulse = Mathf.Min(minPulse, p.Pulse);
                if (i % 30 == 0) yield return null;
            }
            Assert.Greater(maxPulse, 0.5f, "a beam must sweep across this observer");
            Assert.Less(minPulse, 0.1f, "and away from it");

            // geometric selection effect: an observer near the spin equator (85° from the axis, far outside α ± beam
            // width for α = 50°) never sees a pulse from this pulsar
            cam.transform.position = new Vector3(0, 4, -42); cam.transform.LookAt(Vector3.zero);
            float eqMax = 0;
            for (int i = 0; i < 120; i++) { p.PhaseDeg = i * 3f; p.Apply(cam); eqMax = Mathf.Max(eqMax, p.Pulse); }
            Assert.Less(eqMax, 0.05f, "observer outside the beam cone sees no pulses");
            Object.Destroy(p.gameObject); Object.Destroy(camGo);
        }
    }
}
