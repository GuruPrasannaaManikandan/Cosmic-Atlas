using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// The NASA 3D Resources MER-B model, rebuilt from mer_b_mesh.json (decoded from the Draco GLB with the web app's own
    /// three.js loader, calibrated by footprint to the PDS instrument-host dimensions). glTF is right-handed: z is
    /// mirrored and the winding reversed for Unity. Material colours/metalness/roughness are the model's own factors.
    /// </summary>
    public static class MarsRover
    {
        public static GameObject Build(TextAsset json, Material template, out string calibrationNote)
        {
            var root = MiniJson.O(MiniJson.Parse(json.text));
            var go = new GameObject("Opportunity (NASA MER-B model)");
            var cal = MiniJson.O(root["calibration"]);
            var dev = MiniJson.O(root["deviation"]);
            calibrationNote = $"footprint scale {MiniJson.D(cal["scaleFromModelUnits"]):F4}; height deviation {MiniJson.D(dev["height"]) * 100:F0}% vs PDS 1.54 m";
            foreach (var o in MiniJson.A(root["meshes"]))
            {
                var m = MiniJson.O(o);
                var p = MiniJson.Floats(m["positions"]);
                var n = MiniJson.Floats(m["normals"]);
                var verts = new Vector3[p.Length / 3];
                var norms = new Vector3[verts.Length];
                for (int i = 0; i < verts.Length; i++)
                {
                    verts[i] = new Vector3(p[3 * i], p[3 * i + 1], -p[3 * i + 2]);
                    norms[i] = new Vector3(n[3 * i], n[3 * i + 1], -n[3 * i + 2]);
                }
                int[] tri;
                if (m["indices"] != null) tri = MiniJson.Ints(m["indices"]);
                else { tri = new int[verts.Length]; for (int i = 0; i < tri.Length; i++) tri[i] = i; }
                for (int i = 0; i < tri.Length; i += 3) { int t = tri[i + 1]; tri[i + 1] = tri[i + 2]; tri[i + 2] = t; }
                var mesh = new Mesh { name = (string)m["material"], indexFormat = verts.Length > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.vertices = verts; mesh.normals = norms; mesh.triangles = tri;
                mesh.RecalculateBounds();
                var part = new GameObject((string)m["material"]);
                part.transform.SetParent(go.transform, false);
                part.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = part.AddComponent<MeshRenderer>();
                var mat = new Material(template) { name = (string)m["material"] };
                var c = MiniJson.Floats(m["color"]);
                mat.SetColor("_BaseColor", new Color(c[0], c[1], c[2], 1));
                mat.SetFloat("_Metallic", MiniJson.F(m["metalness"]));
                mat.SetFloat("_Smoothness", 1f - MiniJson.F(m["roughness"]));
                mr.sharedMaterial = mat;
                mr.shadowCastingMode = ShadowCastingMode.On;
            }
            return go;
        }
    }

    /// <summary>One quality profile from mission-data/quality-profiles.json.</summary>
    public sealed class MarsQualityProfile
    {
        public string Id, Label, AntiAliasing;
        public float RenderScale, ShadowDistance, DustFraction;
        public int Cascades, ShadowMap, MaxTexture, SkyTransmittance, SkyScattering;
        public bool Ssao, DetailNormals, Bloom, AutoExposure;
        /// <summary>terrain base stride in DTM cells (native = 1)</summary>
        public int TerrainStride;
        public float Lod1Distance; // ≤0 = always full
        public float GateFpsP50;

        public static List<MarsQualityProfile> LoadAll(TextAsset json)
        {
            var list = new List<MarsQualityProfile>();
            foreach (var o in MiniJson.A(MiniJson.Parse(json.text)))
            {
                var p = MiniJson.O(o);
                var sh = MiniJson.O(p["shadows"]);
                var sky = MiniJson.O(p["skyLut"]);
                object ts = p["terrainSpacingM"];
                list.Add(new MarsQualityProfile
                {
                    Id = (string)p["id"], Label = (string)p["label"], AntiAliasing = (string)p["antiAliasing"],
                    RenderScale = MiniJson.F(p["renderScale"]), ShadowDistance = MiniJson.F(sh["distanceM"]),
                    Cascades = MiniJson.I(sh["cascades"]), ShadowMap = MiniJson.I(sh["mapSize"]),
                    Ssao = (bool)p["ssao"], DetailNormals = (bool)p["detailNormals"], MaxTexture = MiniJson.I(p["maxTextureSize"]),
                    SkyTransmittance = MiniJson.I(sky["transmittance"]), SkyScattering = MiniJson.I(sky["scattering"]),
                    DustFraction = MiniJson.F(p["dustFraction"]), Bloom = (bool)p["bloom"], AutoExposure = (bool)p["autoExposure"],
                    TerrainStride = ts is string ? 1 : Mathf.Max(1, Mathf.RoundToInt(MiniJson.F(ts))),
                    Lod1Distance = p["lod1DistanceM"] == null ? -1 : MiniJson.F(p["lod1DistanceM"]),
                    GateFpsP50 = p["gate"] == null ? 0 : MiniJson.F(MiniJson.O(p["gate"])["fpsP50"]),
                });
            }
            return list;
        }
    }
}
