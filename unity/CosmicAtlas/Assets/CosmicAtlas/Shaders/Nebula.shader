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
            // Baked tileable fbm (NoiseVolume.cs): R 6-octave structure, G/B 3-octave warp, A 5-octave dust.
            // One texture period = 8 noise cells, so sampling at x/8 matches the former procedural Fbm3(x).
            TEXTURE3D(_NoiseVol); SAMPLER(sampler_NoiseVol);
            static const float INV_CELLS = 1.0 / 8.0;
            float4 Vol(float3 x) { return SAMPLE_TEXTURE3D_LOD(_NoiseVol, sampler_NoiseVol, x * INV_CELLS, 0); }

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
                float3 pull = 0; float pullW = 0;
                int n = (int)_StarCount;
                [loop] for (int s = 0; s < 8; s++)
                {
                    if (s >= n) break;
                    float3 d = p - _NebulaStars[s].xyz;
                    float r = length(d);
                    ion += _NebulaStars[s].w * exp(-r * 4.0);
                    ionHi += _NebulaStars[s].w * exp(-r * 7.0);
                    wind += _NebulaStars[s].w * exp(-r * 22.0); // the wind-blown bubble is much smaller than the ionised zone
                    float wS = _NebulaStars[s].w * exp(-r * 6.0);   // smooth weight: no hard nearest-star switch
                    pull += wS * d / max(r, 1e-4); pullW += wS;
                }
                // stretch noise coordinates along the (luminosity-weighted) direction to the ionising stars -> columns
                // pointing at them. A hard nearest-star choice made the stretch jump on the planes midway between
                // stars (visible straight creases); the weighted direction is continuous, and its coherence
                // |sum w d| / sum w fades the stretch where stars pull in opposing directions.
                float pullLen = length(pull);
                float3 dirS = pull / max(pullLen, 1e-6);
                float coherence = saturate(pullLen / max(pullW, 1e-6));
                float3 q = p * _NoiseScale;
                float along = dot(q, dirS);
                q += dirS * along * (-0.55 * coherence);
                // 3 texture fetches replace ~20 octaves of procedural noise per step
                float4 wv = Vol(q + _Seed);
                float3 w = float3(wv.g, wv.b, Vol(q + _Seed + 7.7).g);
                // base structure + two zero-mean detail fetches. The 64^3 volume resolves only ~3 octaves per period;
                // the detail fetches at ~4x and ~16x frequency restore the high octaves of the former 6-octave
                // procedural fbm with comparable amplitude (fbm octave amplitudes 1/8..1/32), at 2 extra texture reads.
                float f = Vol(q * 2.4 + w * 1.8 + _Seed * 3.1).r
                        + (Vol(q * 9.7 + w * 3.0 + 13.0).r - 0.5) * 0.40
                        + (Vol(q * 37.0 + w * 5.0 + 29.0).r - 0.5) * 0.22;
                float shell = smoothstep(0.5, 0.25, length(p));            // soft outer boundary of the cloud
                float cavity = 1.0 - saturate(wind * 1.2);                  // stellar winds clear the immediate surroundings
                gas = saturate(f - 0.40) * 2.8 * shell * cavity * _Density;
                dust = saturate(wv.a - 0.42) * 4.0 * shell * saturate(1.0 - ion * 0.8) * _DustDensity;
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
