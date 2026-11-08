// Volumetric emission/reflection nebula, ray-marched inside a unit cube (object space -0.5..0.5).
//
// What is physical and what is illustrative:
//   * emission scales with density^2 (emission measure ~ n_e^2), coloured by real line wavelengths:
//     H-alpha 656.3 nm (deep red) everywhere the gas is ionised, [O III] 500.7 nm (teal) only near the hottest stars
//     (higher ionisation); [S II] 671.6 nm adds to the red where ionisation is low
//   * ionisation falls off with distance from the embedded massive stars (_Stars); cavities are carved near them
//     (stellar winds/radiation pressure) and column-like structures are stretched along the direction to the
//     nearest star - the way pillars point at their ionising sources
//   * dust absorbs (extinction) and survives only where the radiation field is weak
//   * the 3-D density field itself is PROCEDURAL (no measured 3-D map exists); the exhibit is labelled illustrative
Shader "CosmicAtlas/Nebula"
{
    Properties
    {
        _Density ("Gas density scale", Float) = 4
        _DustDensity ("Dust extinction scale", Float) = 6
        _Emission ("Emission scale", Float) = 0.3
        _NoiseScale ("Structure scale", Float) = 3.2
        _Steps ("Ray-march steps", Float) = 48
        _Seed ("Seed", Float) = 1
        _StarCount ("Ionising stars", Float) = 3
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Forward"
            Tags { "LightMode" = "UniversalForward" }
            Blend One OneMinusSrcAlpha
            ZWrite Off
            Cull Front
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "AtlasCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float _Density; float _DustDensity; float _Emission; float _NoiseScale; float _Steps; float _Seed; float _StarCount;
            CBUFFER_END
            float4 _NebulaStars[8]; // xyz object space, w = relative ionising luminosity (set by NebulaVolume.cs)

            struct A { float4 pos : POSITION; };
            struct V { float4 pos : SV_POSITION; float3 pOS : TEXCOORD0; };
            V vert(A i) { V o; o.pos = TransformObjectToHClip(i.pos.xyz); o.pOS = i.pos.xyz; return o; }

            static const float3 H_ALPHA = float3(1.00, 0.08, 0.10); // 656 nm, linear sRGB (saturated red)
            static const float3 O_III   = float3(0.05, 0.85, 0.75); // 501 nm, teal-green
            static const float3 S_II    = float3(0.90, 0.02, 0.04); // 672 nm

            void Field(float3 p, out float gas, out float dust, out float ion, out float ionHi)
            {
                ion = 0; ionHi = 0;
                float wind = 0;
                float3 nearest = 0; float nd = 1e5;
                int n = (int)_StarCount;
                [loop] for (int s = 0; s < 8; s++)
                {
                    if (s >= n) break;
                    float3 d = p - _NebulaStars[s].xyz;
                    float r = length(d);
                    ion += _NebulaStars[s].w * exp(-r * 4.0);
                    ionHi += _NebulaStars[s].w * exp(-r * 7.0);
                    wind += _NebulaStars[s].w * exp(-r * 22.0); // the wind-blown bubble is much smaller than the ionised zone
                    if (r < nd) { nd = r; nearest = d / max(r, 1e-4); }
                }
                // stretch noise coordinates along the direction to the nearest ionising star -> columns pointing at it
                float3 q = p * _NoiseScale;
                float along = dot(q, nearest);
                q += nearest * along * -0.55;
                float3 w = float3(Fbm3(q + _Seed, 3), Fbm3(q + _Seed + 19.3, 3), Fbm3(q + _Seed + 7.7, 3));
                float f = Fbm3(q * 2.4 + w * 1.8 + _Seed * 3.1, 6);
                float shell = smoothstep(0.5, 0.25, length(p));            // soft outer boundary of the cloud
                float cavity = 1.0 - saturate(wind * 1.2);                  // stellar winds clear the immediate surroundings
                gas = saturate(f - 0.40) * 2.8 * shell * cavity * _Density;
                dust = saturate(Fbm3(q * 1.3 + 41.0 + _Seed, 5) - 0.42) * 4.0 * shell * saturate(1.0 - ion * 0.8) * _DustDensity;
            }

            float2 RayBox(float3 ro, float3 rd)
            {
                float3 inv = 1.0 / rd;
                float3 t0 = (-0.5 - ro) * inv, t1 = (0.5 - ro) * inv;
                float3 tmin = min(t0, t1), tmax = max(t0, t1);
                return float2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
            }

            half4 frag(V i) : SV_Target
            {
                float3 ro = TransformWorldToObject(GetCameraPositionWS());
                float3 rd = normalize(i.pOS - ro);
                float2 t = RayBox(ro, rd);
                t.x = max(t.x, 0);
                if (t.x >= t.y) return 0;
                int n = (int)_Steps;
                float ds = (t.y - t.x) / n;
                float jitter = Hash13(float3(i.pos.xy, _AtlasTime));
                float3 col = 0;
                float T = 1.0;
                [loop] for (int k = 0; k < 128; k++)
                {
                    if (k >= n || T < 0.01) break;
                    float3 p = ro + rd * (t.x + ds * (k + jitter));
                    float gas, dust, ion, ionHi;
                    Field(p, gas, dust, ion, ionHi);
                    float em = gas * gas; // emission measure ~ n^2
                    float3 e = em * (H_ALPHA * saturate(ion * 1.5) + O_III * saturate(ionHi * 2.0) * 0.8 + S_II * saturate(0.3 - ion) * 0.6);
                    col += T * e * _Emission * ds;
                    T *= exp(-(dust * 3.0 + gas * 0.6) * ds);
                }
                return half4(col * max(_AtlasExposure, 1e-3), 1.0 - T);
            }
            ENDHLSL
        }
    }
}
