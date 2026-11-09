// Non-rotating (Schwarzschild) black hole, ray-traced per pixel. Units: Schwarzschild radius r_s = 1 (object space).
//
// Light bending: a null geodesic stays in the plane of its start point and direction, and its shape obeys the exact
// orbit equation u'' + u = (3/2) r_s u^2 (u = 1/r, ' = d/dphi). Each pixel's ray is traced backwards from the camera
// by integrating that equation in the polar angle phi with classical RK4 (u'' = 1.5 u^2 - u), starting from
// u = 1/r0, u' = -(v.r_hat)/h. Integration stops when u >= 1 (horizon) or when u reaches 0: the polar angle of that
// zero IS the outgoing asymptotic direction, so no weak-field patch is applied to integrated rays. Validated in
// BlackHoleValidationTests against the exact Schwarzschild deflection integral (< 0.05 % at every quality tier from
// b = 24.5 r_s down to b = 2.6 r_s, i.e. rays winding more than once around the hole). Consequences that EMERGE:
//   * the shadow (critical impact parameter b_c = (3*sqrt(3)/2) r_s ~ 2.598 r_s)
//   * the photon rings (rays that orbit near the photon sphere r = 1.5 r_s; order n where deflection ~ n pi)
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

            // Analytic deflection for rays that never come within 25 r_s (they cannot reach the disk): bend still to come
            // for a ray at p moving along v. In the orbit-equation picture the transverse pull is (3/2) h^2 / r^4, whose
            // first-order integral from path coordinate s (s = p.v_hat, < 0 before closest approach) to infinity is
            // alpha1 = (1 - 1.5 x + 0.5 x^3) / b with x = s / sqrt(s^2 + b^2) (a full pass gives 2 r_s / b). The
            // second-order Schwarzschild term (15 pi / 16)(r_s / b)^2 is applied in the same proportion. Within 0.3 % of
            // the exact deflection for b >= 25 r_s (BlackHoleValidationTests).
            float3 WeakFieldBend(float3 p, float3 vIn)
            {
                float3 v = normalize(vIn);
                float s = dot(p, v);
                float3 c = p - s * v;                 // closest-approach vector
                float b = max(length(c), 1e-3);
                float x = s * rsqrt(s * s + b * b);
                float alpha = (1.0 - 1.5 * x + 0.5 * x * x * x) / b * (1.0 + 15.0 * ATLAS_PI / (32.0 * b));
                return normalize(v - (c / b) * alpha);
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
                    if (disc < 0) return half4(Background(rd) * max(_AtlasExposure, 1e-3), 1);
                    p += rd * (-b - sqrt(disc));
                }
                float3 v = rd;
                float exposure = max(_AtlasExposure, 1e-3);
                // orbital-plane basis: e1 along the start radius, e2 along the transverse part of the direction
                float r0 = length(p);
                float3 e1 = p / r0;
                float vr = dot(v, e1);
                float3 vt = v - vr * e1;
                float vtl = length(vt);
                float h = r0 * vtl;                                    // impact parameter (unit-speed ray)
                if (h < 1e-4) return half4((vr < 0.0 ? 0.0 : Background(v)) * exposure, 1); // radial ray
                float3 e2 = vt / vtl;
                // rays that never come within 25 r_s cannot reach the disk (outer edge 14 r_s) and are only weakly
                // bent: analytic deflection, no integration (not with jets, which extend far along the axis)
                if (_Jets < 0.5 && h > 25.0) return half4(Background(WeakFieldBend(p, v)) * exposure, 1);

                float u = 1.0 / r0, w = -vr / h, phi = 0.0;
                int n = (int)_Steps;
                // angular step: the step budget is spread over ~13 rad of polar angle (deflection up to ~3 pi, the
                // n = 2 photon ring), never coarser than 0.2 rad (RK4 error < 0.05 % at 0.2 - see the tests)
                float dphi = clamp(13.0 / max(_Steps, 1.0), 0.06, 0.2);
                float nPrev = e1.y;                                    // y = (cos(phi) e1.y + sin(phi) e2.y) / u
                float3 pPrev = p;
                float3 dir = v;                                        // current direction of travel
                float3 col = 0;
                float throughput = 1.0;
                [loop] for (int k = 0; k < 400; k++)
                {
                    if (k >= n) break;
                    // classical RK4 for u'' = 1.5 u^2 - u
                    float a1 = 1.5 * u * u - u;
                    float u2 = u + 0.5 * dphi * w,  w2 = w + 0.5 * dphi * a1;  float a2 = 1.5 * u2 * u2 - u2;
                    float u3 = u + 0.5 * dphi * w2, w3 = w + 0.5 * dphi * a2;  float a3 = 1.5 * u3 * u3 - u3;
                    float u4 = u + dphi * w3,       w4 = w + dphi * a3;        float a4 = 1.5 * u4 * u4 - u4;
                    float uN = u + dphi / 6.0 * (w + 2.0 * w2 + 2.0 * w3 + w4);
                    float wN = w + dphi / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
                    if (uN >= 1.0) { throughput = 0; break; }           // crossed the event horizon
                    bool escaped = uN <= 0.0;
                    float f = escaped ? u / (u - uN) : 1.0;             // fraction of the step to the asymptote u = 0
                    float phiN = phi + dphi * f;
                    float sN, cN;
                    sincos(phiN, sN, cN);
                    float3 radial = cN * e1 + sN * e2;
                    float3 tangential = -sN * e1 + cN * e2;
                    float nN = cN * e1.y + sN * e2.y;

                    // thin-disk crossing (plane y = 0): y = n(phi) / u changes sign with n
                    if (nPrev * nN < 0.0)
                    {
                        float t = nPrev / (nPrev - nN);
                        float ph = phi + (phiN - phi) * t;
                        float uh = lerp(u, escaped ? 0.0 : uN, t);
                        float wh = lerp(w, wN, t);
                        float sh, ch;
                        sincos(ph, sh, ch);
                        float3 rhHat = ch * e1 + sh * e2;
                        float rh = 1.0 / max(uh, 1e-4);
                        if (rh > _DiskInner && rh < _DiskOuter)
                        {
                            float3 hit = rhHat * rh;
                            float3 travel = normalize(-wh * rhHat + uh * (-sh * e1 + ch * e2));
                            float x = _DiskInner / rh;
                            float tLocal = _DiskTempK * pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) * 2.2;
                            float g = DiskShift(hit, -travel);
                            float3 bb = BlackbodyColorApprox(g * tLocal);
                            float emiss = pow(x, 3.0) * max(1.0 - sqrt(x), 0.0) * 40.0; // flux ~ r^-3 (1 - sqrt(r_in/r))
                            float edge = smoothstep(_DiskOuter, _DiskOuter * 0.7, rh);
                            col += throughput * bb * emiss * pow(g, 4.0) * _DiskBrightness * edge;
                            throughput *= 0.15; // optically thick: little light from behind passes through
                        }
                    }
                    if (escaped) { dir = radial; break; }               // outgoing asymptote: exact direction

                    // direction of travel at the new point: dr/dphi = -u'/u^2, so tangent ~ -u' r_hat + u phi_hat
                    dir = normalize(-wN * radial + uN * tangential);
                    float3 pNew = radial / uN;
                    // educational jet cue along the spin axis (Doppler boosted toward the viewer)
                    if (_Jets > 0.5)
                    {
                        float ay = abs(pNew.y);
                        float wJet = 0.35 + ay * 0.08;
                        float radialDist = length(pNew.xz);
                        if (ay > 1.5 && ay < _FarRadius * 0.8 && radialDist < wJet)
                        {
                            float3 jdir = float3(0, sign(pNew.y), 0);
                            float boost = pow(1.0 / (1.0 - 0.6 * dot(jdir, -dir)), 3.0);
                            float ds = length(pNew - pPrev);
                            col += throughput * _JetBrightness * float3(0.55, 0.65, 1.0) * boost * exp(-radialDist / wJet * 3.0) * exp(-ay / 25.0) * ds * 0.05;
                        }
                    }
                    u = uN; w = wN; phi = phiN; nPrev = nN; pPrev = pNew;
                }
                col += throughput * Background(dir);
                return half4(col * exposure, 1);
            }
            ENDHLSL
        }
    }
}
