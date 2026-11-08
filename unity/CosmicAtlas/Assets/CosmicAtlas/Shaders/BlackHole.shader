// Non-rotating (Schwarzschild) black hole, ray-traced per pixel. Units: Schwarzschild radius r_s = 1 (object space).
//
// Light bending: for a null geodesic the spatial path obeys the Binet equation u'' + u = (3/2) r_s u^2, which in
// Cartesian form is the acceleration a = -(3/2) r_s h^2 r_hat / r^4 (h = |r x v|, conserved). Rays are integrated
// backwards from the camera with velocity-Verlet; no lensing is "painted on". Consequences that EMERGE:
//   * the shadow (critical impact parameter b_c = (3*sqrt(3)/2) r_s ~ 2.598 r_s - checked by an EditMode test)
//   * the photon ring (rays that orbit near the photon sphere r = 1.5 r_s)
//   * the lensed far side of the accretion disk arching over and under the hole, and a lensed starfield
// Accretion disk: geometrically thin, optically thick, Keplerian, inner edge at the ISCO (3 r_s). Local temperature
// follows the Shakura-Sunyaev profile T(r) ~ r^-3/4 (1 - sqrt(r_in/r))^1/4. Observed colour/brightness use the total
// frequency shift g = sqrt(1 - r_s/r) / (gamma (1 - beta cos theta)) (DiskShift): gravitational redshift x Doppler
// beaming for Keplerian gas (static-observer speed beta = sqrt(M/(r - 2M))); observed T = g T_local, I_obs ~ g^4.
// Jets (optional) are an EDUCATIONAL volumetric cue only (Doppler-boosted emission cone), not a jet-physics model.
// Known simplification: real M87* is expected to spin (Kerr metric); spin is not modelled.
Shader "CosmicAtlas/BlackHole"
{
    Properties
    {
        _DiskInner ("Disk inner radius (r_s)", Float) = 3
        _DiskOuter ("Disk outer radius (r_s)", Float) = 14
        _DiskTempK ("Disk peak temperature scale (K, colour mapping)", Float) = 9000
        _DiskBrightness ("Disk brightness", Float) = 0.3
        _Steps ("Integration steps", Float) = 160
        _FarRadius ("Integration bound (r_s)", Float) = 60
        _StarDensity ("Background star density", Float) = 1
        _Jets ("Jets (0/1, educational)", Float) = 0
        _JetBrightness ("Jet brightness", Float) = 0.6
        _Spin ("Disk rotation sense (+1/-1)", Float) = 1
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent-50" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Forward"
            Tags { "LightMode" = "UniversalForward" }
            Blend One Zero
            ZWrite Off
            ZTest Always
            Cull Front
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "AtlasCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float _DiskInner; float _DiskOuter; float _DiskTempK; float _DiskBrightness; float _Steps; float _FarRadius;
                float _StarDensity; float _Jets; float _JetBrightness; float _Spin;
            CBUFFER_END

            struct A { float4 pos : POSITION; };
            struct V { float4 pos : SV_POSITION; float3 pOS : TEXCOORD0; };

            V vert(A i) { V o; o.pos = TransformObjectToHClip(i.pos.xyz); o.pOS = i.pos.xyz; return o; }

            // Lensed background: procedural star field + faint band, sampled by the FINAL ray direction.
            float3 Background(float3 d)
            {
                float3 col = 0;
                [unroll] for (int layer = 0; layer < 3; layer++)
                {
                    float scale = 60.0 + layer * 70.0;
                    float3 q = d * scale;
                    float3 cell = floor(q);
                    float h = Hash13(cell + layer * 17.0);
                    float3 starPos = cell + float3(Hash13(cell + 3.1), Hash13(cell + 5.7), Hash13(cell + 9.3));
                    float dist = length(q - starPos);
                    float on = step(1.0 - 0.06 * _StarDensity, h);
                    float temp = lerp(3000.0, 12000.0, Hash13(cell + 11.0));
                    col += on * BlackbodyColorApprox(temp) * exp(-dist * dist * 40.0) * (0.6 + 2.0 * Hash13(cell + 1.7));
                }
                float band = exp(-d.y * d.y * 18.0) * (0.5 + 0.5 * Fbm3(d * 6.0, 4));
                col += band * float3(0.05, 0.045, 0.04);
                return col;
            }

            // Total frequency ratio g = nu_obs / nu_emit for disk gas on a circular Keplerian orbit at radius r,
            // emitting along photon direction n (unit, toward the observer). Static-observer velocity in Schwarzschild:
            // beta = sqrt(M/(r - 2M)) with M = r_s/2 = 0.5; combined with gravitational redshift sqrt(1 - r_s/r).
            float DiskShift(float3 p, float3 n)
            {
                float r = length(p);
                float beta = sqrt(0.5 / max(r - 1.0, 1e-3));
                beta = min(beta, 0.99);
                float gamma = 1.0 / sqrt(1.0 - beta * beta);
                float3 vdir = normalize(cross(float3(0, _Spin, 0), p)); // circular orbit tangent
                float cosT = dot(vdir, n);
                return sqrt(max(1.0 - 1.0 / r, 0.0)) / (gamma * (1.0 - beta * cosT));
            }

            half4 frag(V i) : SV_Target
            {
                float3 camOS = TransformWorldToObject(GetCameraPositionWS());
                float3 rd = normalize(i.pOS - camOS);
                // start the integration at the proxy boundary (or at the camera if inside)
                float3 p = camOS;
                float b = dot(p, rd), cc = dot(p, p) - _FarRadius * _FarRadius;
                float disc = b * b - cc;
                if (cc > 0)
                {
                    if (disc < 0) return half4(Background(rd), 1);
                    p += rd * (-b - sqrt(disc));
                }
                float3 v = rd;
                float h2 = dot(cross(p, v), cross(p, v));
                float3 col = 0;
                float throughput = 1.0;
                int n = (int)_Steps;
                [loop] for (int k = 0; k < 400; k++)
                {
                    if (k >= n) break;
                    float r = length(p);
                    if (r < 1.0) { throughput = 0; break; } // crossed the event horizon
                    float dt = clamp(0.06 * r, 0.015, 1.5);
                    // velocity Verlet
                    float3 acc = -1.5 * h2 * p / pow(r, 5.0);
                    float3 pNew = p + v * dt + 0.5 * acc * dt * dt;
                    float rN = length(pNew);
                    float3 accN = -1.5 * h2 * pNew / pow(max(rN, 1e-3), 5.0);
                    float3 vNew = v + 0.5 * (acc + accN) * dt;

                    // thin-disk crossing (plane y = 0)
                    if (p.y * pNew.y < 0.0)
                    {
                        float f = p.y / (p.y - pNew.y);
                        float3 hit = lerp(p, pNew, f);
                        float rh = length(hit);
                        if (rh > _DiskInner && rh < _DiskOuter)
                        {
                            float x = _DiskInner / rh;
                            float tLocal = _DiskTempK * pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) * 2.2;
                            float g = DiskShift(hit, -normalize(v));
                            float3 bb = BlackbodyColorApprox(g * tLocal);
                            float emiss = pow(x, 3.0) * max(1.0 - sqrt(x), 0.0) * 40.0; // flux ~ r^-3 (1 - sqrt(r_in/r))
                            float edge = smoothstep(_DiskOuter, _DiskOuter * 0.7, rh);
                            col += throughput * bb * emiss * pow(g, 4.0) * _DiskBrightness * edge;
                            throughput *= 0.15; // optically thick: little light from behind passes through
                        }
                    }
                    // educational jet cue along the spin axis (Doppler boosted toward the viewer)
                    if (_Jets > 0.5)
                    {
                        float ay = abs(pNew.y);
                        float wJet = 0.35 + ay * 0.08;
                        float radial = length(pNew.xz);
                        if (ay > 1.5 && ay < _FarRadius * 0.8 && radial < wJet)
                        {
                            float3 jdir = float3(0, sign(pNew.y), 0);
                            float boost = pow(1.0 / (1.0 - 0.6 * dot(jdir, -normalize(v))), 3.0);
                            col += throughput * _JetBrightness * float3(0.55, 0.65, 1.0) * boost * exp(-radial / wJet * 3.0) * exp(-ay / 25.0) * dt * 0.05;
                        }
                    }
                    p = pNew; v = normalize(vNew);
                    if (rN > _FarRadius && dot(p, v) > 0) break; // escaped
                }
                col += throughput * Background(normalize(v));
                return half4(col * max(_AtlasExposure, 1e-3), 1);
            }
            ENDHLSL
        }
    }
}
