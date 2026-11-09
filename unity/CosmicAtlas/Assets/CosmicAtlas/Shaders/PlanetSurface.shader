// Surface of a planet, moon, dwarf planet or small body, lit by the single Atlas sun.
//  * reflectance: blend of Lommel-Seeliger (airless regolith: mu0 / (mu0 + mu), flat-looking full disk, as observed
//    for the Moon and asteroids) and Lambert (bodies seen through/with atmospheres)
//  * eclipses, moon shadows on planets, transits: SunVisibility() - analytic solar-disk overlap (umbra + penumbra)
//  * albedo: texture (real map, see provenance) or vertex colour (procedural small bodies - labelled as such)
//  * optional ocean glint (specular mask) and night-side emission map (city lights)
Shader "CosmicAtlas/PlanetSurface"
{
    Properties
    {
        _MainTex ("Albedo map (equirectangular)", 2D) = "white" {}
        _BaseColor ("Albedo tint", Color) = (1, 1, 1, 1)
        _Albedo ("Albedo scale", Float) = 1
        _UseVertexColor ("Use vertex colour (procedural bodies)", Float) = 0
        _LommelSeeliger ("Lommel-Seeliger weight (airless=1, atmosphere=0)", Range(0, 1)) = 1
        _BumpStrength ("Relief from albedo gradient", Range(0, 4)) = 0.6
        _SpecMap ("Specular (ocean) mask", 2D) = "black" {}
        _SpecStrength ("Ocean glint strength", Float) = 0
        _NightMap ("Night emission map", 2D) = "black" {}
        _NightStrength ("Night emission", Float) = 0
        _SelfIndex ("Occluder index of this body (-1 none)", Float) = -1
        _Ambient ("Ambient (planetshine)", Float) = 0.002
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

            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            TEXTURE2D(_SpecMap); SAMPLER(sampler_SpecMap);
            TEXTURE2D(_NightMap); SAMPLER(sampler_NightMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST; float4 _MainTex_TexelSize; float4 _BaseColor; float _Albedo; float _UseVertexColor; float _LommelSeeliger;
                float _BumpStrength; float _SpecStrength; float _NightStrength; float _SelfIndex; float _Ambient;
            CBUFFER_END

            struct A { float4 pos : POSITION; float3 nrm : NORMAL; float4 tan : TANGENT; float2 uv : TEXCOORD0; float4 col : COLOR; };
            struct V { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float3 nWS : TEXCOORD1; float3 tWS : TEXCOORD2; float3 bWS : TEXCOORD3; float3 pWS : TEXCOORD4; float4 col : COLOR; };

            V vert(A i)
            {
                V o;
                o.pWS = TransformObjectToWorld(i.pos.xyz);
                o.pos = TransformWorldToHClip(o.pWS);
                o.uv = TRANSFORM_TEX(i.uv, _MainTex);
                o.nWS = TransformObjectToWorldNormal(i.nrm);
                o.tWS = TransformObjectToWorldDir(i.tan.xyz);
                o.bWS = cross(o.nWS, o.tWS) * (i.tan.w * GetOddNegativeScale());
                o.col = i.col;
                return o;
            }

            float Lum(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

            half4 frag(V i) : SV_Target
            {
                float3 albedo = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).rgb * _BaseColor.rgb * _Albedo;
                if (_UseVertexColor > 0.5) albedo = i.col.rgb * _BaseColor.rgb * _Albedo;

                float3 n = normalize(i.nWS);
                if (_BumpStrength > 0 && _UseVertexColor < 0.5)
                {
                    // relief cue from the albedo gradient (maps are albedo, not DEMs: this is a shading aid, not topography)
                    float2 d = _MainTex_TexelSize.xy * 1.5;
                    float hx = Lum(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv + float2(d.x, 0)).rgb) - Lum(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv - float2(d.x, 0)).rgb);
                    float hy = Lum(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv + float2(0, d.y)).rgb) - Lum(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv - float2(0, d.y)).rgb);
                    n = normalize(n - _BumpStrength * (hx * normalize(i.tWS) + hy * normalize(i.bWS)));
                }

                float3 l = SunDirection(i.pWS);
                float3 v = normalize(GetCameraPositionWS() - i.pWS);
                float mu0 = saturate(dot(n, l));
                float mu = saturate(dot(n, v));
                float lambert = mu0;
                float lommel = (mu0 > 0) ? 2.0 * mu0 / (mu0 + max(mu, 1e-3)) : 0.0; // x2 so it equals Lambert (=1) at mu0 = mu = 1
                float refl = lerp(lambert, lommel, _LommelSeeliger);

                float sun = SunVisibility(i.pWS, _SelfIndex);
                float3 col = albedo * _AtlasSunColor.rgb * refl * sun;

                if (_SpecStrength > 0)
                {
                    float mask = SAMPLE_TEXTURE2D(_SpecMap, sampler_SpecMap, i.uv).r;
                    float3 h = normalize(l + v);
                    col += _AtlasSunColor.rgb * mask * _SpecStrength * pow(saturate(dot(n, h)), 120.0) * sun * step(0.0, dot(n, l));
                }
                if (_NightStrength > 0)
                {
                    float night = smoothstep(0.05, -0.15, dot(normalize(i.nWS), l));
                    col += SAMPLE_TEXTURE2D(_NightMap, sampler_NightMap, i.uv).rgb * _NightStrength * night;
                }
                col += albedo * _Ambient;
                return half4(col * max(_AtlasExposure, 1e-3), 1);
            }
            ENDHLSL
        }
    }
}
