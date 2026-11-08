// Single-scattering atmosphere (Rayleigh + Mie), ray-marched per pixel.
// Densities fall off exponentially with altitude (scale heights H_R, H_M); in-scattered sunlight along the view ray is
// attenuated by the optical depth toward the sun and toward the camera. Phase functions: Rayleigh 3/(16pi)(1+cos^2),
// Mie Cornette-Shanks with asymmetry g. Coefficients are passed per body in world units by AtmosphereShell.cs
// (Earth: standard sea-level values, beta_R = (5.8, 13.5, 33.1)e-6 /m, beta_M = 21e-6 /m, H_R = 8 km, H_M = 1.2 km).
// Multiple scattering is not modelled (the twilight sky is therefore too dark) - a documented approximation.
Shader "CosmicAtlas/Atmosphere"
{
    Properties
    {
        _PlanetRadius ("Planet radius (world)", Float) = 1
        _AtmoRadius ("Atmosphere top radius (world)", Float) = 1.0157
        _BetaR ("Rayleigh scattering per world unit", Vector) = (0, 0, 0, 0)
        _BetaM ("Mie scattering per world unit", Float) = 0
        _MieAbsorb ("Mie extinction / scattering ratio", Float) = 1.1
        _ScaleHeightR ("Rayleigh scale height (world)", Float) = 0.00126
        _ScaleHeightM ("Mie scale height (world)", Float) = 0.00019
        _MieG ("Mie asymmetry g", Range(0, 0.99)) = 0.76
        _HazeTint ("Absorption tint of aerosols (Titan)", Color) = (1, 1, 1, 1)
        _Steps ("View samples", Float) = 12
        _Intensity ("Intensity", Float) = 1
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
            Cull Back
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "AtlasCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float _PlanetRadius; float _AtmoRadius; float4 _BetaR; float _BetaM; float _MieAbsorb; float _ScaleHeightR; float _ScaleHeightM;
                float _MieG; float4 _HazeTint; float _Steps; float _Intensity;
            CBUFFER_END

            struct A { float4 pos : POSITION; };
            struct V { float4 pos : SV_POSITION; float3 pWS : TEXCOORD0; };

            V vert(A i) { V o; o.pWS = TransformObjectToWorld(i.pos.xyz); o.pos = TransformWorldToHClip(o.pWS); return o; }

            // ray-sphere (centre c, radius r): returns (tNear, tFar); tNear > tFar means miss
            float2 RaySphere(float3 ro, float3 rd, float3 c, float r)
            {
                float3 oc = ro - c;
                float b = dot(oc, rd);
                float h = b * b - (dot(oc, oc) - r * r);
                if (h < 0) return float2(1, -1);
                h = sqrt(h);
                return float2(-b - h, -b + h);
            }

            half4 frag(V i) : SV_Target
            {
                float3 c = TransformObjectToWorld(float3(0, 0, 0));
                float3 ro = GetCameraPositionWS();
                float3 rd = normalize(i.pWS - ro);
                float2 ta = RaySphere(ro, rd, c, _AtmoRadius);
                if (ta.x > ta.y) return 0;
                float t0 = max(ta.x, 0.0), t1 = ta.y;
                float2 tp = RaySphere(ro, rd, c, _PlanetRadius);
                if (tp.x <= tp.y && tp.x > 0) t1 = min(t1, tp.x);

                int n = (int)_Steps;
                float ds = (t1 - t0) / n;
                float3 betaR = _BetaR.xyz;
                float3 betaMext = _BetaM * _MieAbsorb / max(_HazeTint.rgb, 0.05);
                float odR = 0, odM = 0;
                float3 sumR = 0, sumM = 0;
                float3 sunPos = _AtlasSunPosRadius.xyz;
                [loop] for (int k = 0; k < 64; k++)
                {
                    if (k >= n) break;
                    float3 p = ro + rd * (t0 + ds * (k + 0.5));
                    float hgt = length(p - c) - _PlanetRadius;
                    float dR = exp(-hgt / _ScaleHeightR) * ds;
                    float dM = exp(-hgt / _ScaleHeightM) * ds;
                    odR += dR; odM += dM;

                    float3 ld = normalize(sunPos - p);
                    float2 lp = RaySphere(p, ld, c, _PlanetRadius);
                    if (lp.x <= lp.y && lp.x > 0) continue; // sample is in the planet's shadow
                    float2 la = RaySphere(p, ld, c, _AtmoRadius);
                    float lds = la.y / 4.0, lodR = 0, lodM = 0;
                    [unroll] for (int j = 0; j < 4; j++)
                    {
                        float lh = length(p + ld * lds * (j + 0.5) - c) - _PlanetRadius;
                        lodR += exp(-lh / _ScaleHeightR) * lds;
                        lodM += exp(-lh / _ScaleHeightM) * lds;
                    }
                    float3 tau = betaR * (odR + lodR) + betaMext * (odM + lodM);
                    float3 att = exp(-tau) * SunVisibility(p, -1);
                    sumR += dR * att;
                    sumM += dM * att;
                }
                float mu = dot(rd, normalize(sunPos - ro));
                float phR = 3.0 / (16.0 * ATLAS_PI) * (1.0 + mu * mu);
                float g = _MieG, g2 = g * g;
                float phM = 3.0 / (8.0 * ATLAS_PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(abs(1.0 + g2 - 2.0 * g * mu), 1.5));
                float3 scat = _AtlasSunColor.rgb * _Intensity * (sumR * betaR * phR + sumM * _BetaM * phM * _HazeTint.rgb) * 4.0 * ATLAS_PI;
                float3 viewT = exp(-(betaR * odR + betaMext * odM));
                float alpha = 1.0 - dot(viewT, float3(0.3333, 0.3333, 0.3334));
                return half4(scat * max(_AtlasExposure, 1e-3), saturate(alpha));
            }
            ENDHLSL
        }
    }
}
