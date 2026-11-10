// Mars sky — STAGE 2 PROTOTYPE. Structure: dust single scattering ray-marched per pixel along the view ray through a
// spherical, exponentially stratified atmosphere, sunlight attenuated by the slant optical depth (Kasten–Young air
// mass), Henyey–Greenstein phase, plus an approximate multiple-scattering term. Driven by the vertical optical depth
// tau (sourced per sol where a record exists — e.g. PIA22930 tau ≈ 10.8 on sol 5111 — otherwise labelled "assumed").
// ILLUSTRATIVE, NOT YET SOURCED: dust single-scattering albedo per channel, asymmetry g, scale height, the
// multiple-scattering factor and the sun-disc size. They are material properties so Stage 3 can replace them with
// cited values without code changes. The target design (FINAL_VISUAL_REALISM_SPEC §4) precomputes LUTs; this prototype
// marches per pixel so its cost is an upper bound for the measurement.
Shader "CosmicAtlas/MarsSky"
{
    Properties
    {
        _Tau ("Vertical optical depth (tau)", Float) = 0.9
        _SSA ("Dust single-scattering albedo RGB (illustrative)", Vector) = (0.97, 0.90, 0.75, 0)
        _G ("HG asymmetry g (illustrative)", Float) = 0.65
        _ScaleH ("Dust scale height m (illustrative)", Float) = 11000
        _MultiScatter ("Multiple-scattering factor (illustrative)", Float) = 0.35
        _SunIrr ("Sun irradiance (relative, 1/R^2 applied by script)", Float) = 1
        _SunAngRad ("Sun disc angular radius rad (illustrative)", Float) = 0.0034
        _Steps ("View samples", Float) = 16
        _Exposure ("Exposure", Float) = 1
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float _Tau; float4 _SSA; float _G; float _ScaleH; float _MultiScatter; float _SunIrr; float _SunAngRad; float _Steps; float _Exposure;
            CBUFFER_END
            float3 _MarsSunDir;   // world-space unit vector toward the Sun (set by MarsPrototype from Mars24)

            static const float Rp = 3396190.0;      // m, HiRISE DTM label radius
            static const float Ratm = 3396190.0 + 80000.0;

            struct A { float4 positionOS : POSITION; };
            struct V { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; };

            V vert(A a) { V o; o.positionCS = TransformObjectToHClip(a.positionOS.xyz); o.dir = a.positionOS.xyz; return o; }

            float AirMass(float mu)
            {
                float z = degrees(acos(saturate(mu)));
                return 1.0 / (max(mu, 0.0) + 0.50572 * pow(max(96.07995 - z, 0.01), -1.6364));
            }
            float HG(float c, float g) { float g2 = g * g; return (1 - g2) / (4 * PI * pow(1 + g2 - 2 * g * c, 1.5)); }

            float4 frag(V i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float3 s = normalize(_MarsSunDir);
                float mu = d.y, muS = s.y;
                // path length from the ground to the top of the atmosphere (or 0 below the horizon)
                float r0 = Rp + 2.0;
                float b = r0 * mu;
                float len = -b + sqrt(max(b * b - (r0 * r0 - Ratm * Ratm), 0));
                if (mu < -0.02) len = 0;
                len = min(len, 60.0 * _ScaleH);
                int n = (int)_Steps;
                float ds = len / max(n, 1);
                float betaE0 = _Tau / _ScaleH;                 // extinction at the ground (tau = beta0 * H)
                float tauCam = 0;
                float3 L = 0;
                float c = dot(d, s);
                float ph = HG(c, _G);
                float sunAbove = smoothstep(-0.08, 0.02, muS);
                for (int k = 0; k < n; k++)
                {
                    float t = (k + 0.5) * ds;
                    float3 p = float3(0, r0, 0) + d * t;
                    float h = length(p) - Rp;
                    float rho = exp(-h / _ScaleH);
                    float dtau = betaE0 * rho * ds;
                    float tauSun = _Tau * rho * AirMass(max(muS, 0.0));
                    L += dtau * _SSA.rgb * ph * exp(-(tauCam + 0.5 * dtau) - tauSun) * sunAbove;
                    tauCam += dtau;
                }
                // approximate multiple scattering: diffuse dust glow proportional to the scattered fraction
                float3 ms = _MultiScatter * _SSA.rgb * _SSA.rgb * (1 - exp(-_Tau * AirMass(max(mu, 0.02)))) * exp(-_Tau * AirMass(max(muS, 0.0)) * 0.5) * max(muS + 0.1, 0) / (4 * PI);
                float3 col = (L + ms) * _SunIrr * 30.0;
                // sun disc, attenuated by the line-of-sight optical depth
                float disc = smoothstep(cos(_SunAngRad * 1.15), cos(_SunAngRad), c);
                col += disc * _SunIrr * 400.0 * exp(-_Tau * AirMass(max(muS, 0.0))) * sunAbove;
                if (mu < -0.02) col = float3(0.02, 0.015, 0.012) * _SunIrr;
                return float4(col * _Exposure, 1);
            }
            ENDHLSL
        }
    }
}
