// Resolved stellar photosphere.
//  * colour: blackbody chromaticity of Teff (computed on the CPU by Blackbody.cs, passed as _StarColor)
//  * limb darkening: linear law I(mu) = 1 - u (1 - mu), mu = cos(angle between normal and view)
//  * granulation / spots: animated cellular noise ONLY when the disk is resolved - an illustrative texture,
//    with cell scale tied to the star class (_GranuleScale); not a reconstruction of a particular star
Shader "CosmicAtlas/StarSurface"
{
    Properties
    {
        _StarColor ("Blackbody colour (linear)", Color) = (1, 0.9, 0.8, 1)
        _Intensity ("Surface intensity (HDR)", Float) = 6
        _LimbU ("Limb darkening u", Range(0, 1)) = 0.6
        _GranuleScale ("Granule cells across the disk", Float) = 40
        _GranuleContrast ("Granulation contrast", Range(0, 0.5)) = 0.12
        _SpotCoverage ("Spot coverage", Range(0, 0.5)) = 0.05
        _Resolved ("Resolved (0/1)", Float) = 1
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Opaque" "Queue" = "Geometry" }
        Pass
        {
            Name "Forward"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "AtlasCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _StarColor; float _Intensity; float _LimbU; float _GranuleScale; float _GranuleContrast; float _SpotCoverage; float _Resolved;
            CBUFFER_END

            struct A { float4 pos : POSITION; float3 nrm : NORMAL; };
            struct V { float4 pos : SV_POSITION; float3 nWS : TEXCOORD0; float3 pWS : TEXCOORD1; float3 pOS : TEXCOORD2; };

            V vert(A i)
            {
                V o;
                o.pWS = TransformObjectToWorld(i.pos.xyz);
                o.pos = TransformWorldToHClip(o.pWS);
                o.nWS = TransformObjectToWorldNormal(i.nrm);
                o.pOS = normalize(i.pos.xyz);
                return o;
            }

            // Voronoi-style convection cells: bright granule centres, dark intergranular lanes.
            float Granulation(float3 p, float t)
            {
                float3 q = p * _GranuleScale + float3(0, t * 0.05, 0);
                float3 i = floor(q), f = frac(q);
                float d1 = 8.0, d2 = 8.0;
                [unroll] for (int z = -1; z <= 1; z++)
                [unroll] for (int y = -1; y <= 1; y++)
                [unroll] for (int x = -1; x <= 1; x++)
                {
                    float3 g = float3(x, y, z);
                    float3 r = g + float3(Hash13(i + g), Hash13(i + g + 7.3), Hash13(i + g + 13.1)) - f;
                    float d = dot(r, r);
                    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
                }
                return saturate((sqrt(d2) - sqrt(d1)) * 2.0);
            }

            half4 frag(V i) : SV_Target
            {
                float3 n = normalize(i.nWS);
                float3 v = normalize(GetCameraPositionWS() - i.pWS);
                float mu = saturate(dot(n, v));
                float limb = 1.0 - _LimbU * (1.0 - mu);
                float detail = 1.0;
                if (_Resolved > 0.5)
                {
                    float g = Granulation(i.pOS, _AtlasTime);
                    detail = 1.0 + _GranuleContrast * (g - 0.5) * 2.0;
                    float spots = smoothstep(1.0 - _SpotCoverage, 1.0, Fbm3(i.pOS * 3.0 + 4.0, 4));
                    detail *= 1.0 - 0.6 * spots;
                }
                float3 c = _StarColor.rgb * _Intensity * limb * detail * max(_AtlasExposure, 1e-3);
                return half4(c, 1);
            }
            ENDHLSL
        }
    }
}
