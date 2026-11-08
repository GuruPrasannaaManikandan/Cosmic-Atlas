// Camera-facing particle billboards expanded in the vertex shader (no geometry shaders: works on WebGL).
// Mesh layout per particle (4 vertices): POSITION = particle centre (object space), TEXCOORD0 = corner (-1..1),
// TEXCOORD1.x = size (object units), TEXCOORD1.y = intensity, COLOR = linear colour.
// _Mode 0 = emissive (stars, gas, comet tails) additive; 1 = absorbing dust (multiplicative darkening).
Shader "CosmicAtlas/ParticleBillboard"
{
    Properties
    {
        _Intensity ("Global intensity", Float) = 1
        [Enum(Additive,0,Absorb,1)] _Mode ("Mode", Float) = 0
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src blend", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst blend", Float) = 1
        _Softness ("Profile sharpness", Float) = 3
        _MinPixelSize ("Minimum on-screen size (px)", Float) = 1.2
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Forward"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_SrcBlend] [_DstBlend]
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "AtlasCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float _Intensity; float _Mode; float _SrcBlend; float _DstBlend; float _Softness; float _MinPixelSize;
            CBUFFER_END

            struct A { float4 pos : POSITION; float2 corner : TEXCOORD0; float2 si : TEXCOORD1; float4 col : COLOR; };
            struct V { float4 pos : SV_POSITION; float2 corner : TEXCOORD0; float4 col : COLOR; float k : TEXCOORD1; };

            V vert(A i)
            {
                V o;
                float3 cWS = TransformObjectToWorld(i.pos.xyz);
                float3 cVS = TransformWorldToView(cWS);
                float objScale = length(float3(UNITY_MATRIX_M[0].x, UNITY_MATRIX_M[1].x, UNITY_MATRIX_M[2].x));
                float size = i.si.x * objScale;
                // keep unresolved particles at a minimum pixel footprint so distant structure does not alias away;
                // when enlarged, intensity is scaled down so the integrated flux is conserved
                float depth = max(-cVS.z, 1e-4);
                // P11 = 1/tan(fov/2); abs(): the projection is Y-flipped when rendering into a texture on D3D
                float pxPerUnit = _ScreenParams.y * abs(UNITY_MATRIX_P[1].y) / (2.0 * depth);
                float minSize = _MinPixelSize / max(pxPerUnit, 1e-6);
                float k = 1.0;
                if (size < minSize) { k = (size * size) / (minSize * minSize); size = minSize; }
                cVS.xy += i.corner * size;
                o.pos = TransformWViewToHClip(cVS);
                o.corner = i.corner;
                o.col = i.col * i.si.y;
                o.k = k;
                return o;
            }

            half4 frag(V i) : SV_Target
            {
                float r2 = dot(i.corner, i.corner);
                float prof = exp(-r2 * _Softness) * saturate(1.0 - r2);
                if (_Mode < 0.5)
                    return half4(i.col.rgb * prof * _Intensity * i.k * max(_AtlasExposure, 1e-3), 0);
                // absorbing: output a transmission factor for Blend DstColor Zero
                float tau = i.col.a * prof * _Intensity * i.k;
                float3 trans = exp(-tau * (1.0 - i.col.rgb * 0.6)); // reddening: blue absorbed more than red
                return half4(trans, 1);
            }
            ENDHLSL
        }
    }
}
