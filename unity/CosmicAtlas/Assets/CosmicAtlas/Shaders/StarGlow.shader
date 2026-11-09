// Camera-facing point-spread glow for a star (also the ONLY representation when the disk is unresolved).
// Profile: Moffat PSF I(r) = (1 + (r/alpha)^2)^-beta, a standard model of a stellar image through optics/atmosphere.
// Brightness is set from APPARENT flux (distance-dependent), never from luminosity alone (StarRenderer.cs).
Shader "CosmicAtlas/StarGlow"
{
    Properties
    {
        _StarColor ("Colour (linear)", Color) = (1, 1, 1, 1)
        _Intensity ("Peak intensity (HDR)", Float) = 2
        _Alpha ("Moffat alpha (fraction of quad)", Float) = 0.06
        _Beta ("Moffat beta", Float) = 2.5
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent+10" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Forward"
            Tags { "LightMode" = "UniversalForward" }
            Blend One One
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "AtlasCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _StarColor; float _Intensity; float _Alpha; float _Beta;
            CBUFFER_END

            struct A { float4 pos : POSITION; float2 uv : TEXCOORD0; };
            struct V { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };

            // Billboard: the quad's object-space XY is re-expressed in view space so it always faces the camera.
            V vert(A i)
            {
                V o;
                float3 centerWS = TransformObjectToWorld(float3(0, 0, 0));
                float scale = length(float3(UNITY_MATRIX_M[0].x, UNITY_MATRIX_M[1].x, UNITY_MATRIX_M[2].x));
                float3 centerVS = TransformWorldToView(centerWS);
                float3 pVS = centerVS + float3(i.pos.xy * scale, 0);
                o.pos = TransformWViewToHClip(pVS);
                o.uv = i.uv * 2.0 - 1.0;
                return o;
            }

            half4 frag(V i) : SV_Target
            {
                float r = length(i.uv);
                float psf = pow(1.0 + (r / _Alpha) * (r / _Alpha), -_Beta);
                psf *= saturate(1.0 - r); // fade to zero at the quad edge
                return half4(_StarColor.rgb * _Intensity * psf * max(_AtlasExposure, 1e-3), 0);
            }
            ENDHLSL
        }
    }
}
