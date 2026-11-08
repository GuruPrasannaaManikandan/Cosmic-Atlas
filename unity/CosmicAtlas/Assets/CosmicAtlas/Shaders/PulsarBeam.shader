// Emission cone along a pulsar's magnetic axis (educational visualisation of the "lighthouse" model).
// Mesh: open cone, apex at the star, UV.y = 0 at the apex .. 1 at the far end, UV.x = angle around the axis.
// Intensity falls off along the beam and toward the cone wall; additive. Real radio/optical beams are not visible
// as luminous cones in space - this is a didactic depiction and is labelled as such in the exhibit.
Shader "CosmicAtlas/PulsarBeam"
{
    Properties
    {
        _Color ("Colour (linear)", Color) = (0.55, 0.7, 1, 1)
        _Intensity ("Intensity", Float) = 2
        _Pulse ("Pulse brightness (set per frame)", Float) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent+5" "IgnoreProjector" = "True" }
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
                float4 _Color; float _Intensity; float _Pulse;
            CBUFFER_END
            struct A { float4 pos : POSITION; float3 nrm : NORMAL; float2 uv : TEXCOORD0; };
            struct V { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float3 nWS : TEXCOORD1; float3 pWS : TEXCOORD2; };
            V vert(A i) { V o; o.pWS = TransformObjectToWorld(i.pos.xyz); o.pos = TransformWorldToHClip(o.pWS); o.uv = i.uv; o.nWS = TransformObjectToWorldNormal(i.nrm); return o; }
            half4 frag(V i) : SV_Target
            {
                float3 v = normalize(GetCameraPositionWS() - i.pWS);
                float facing = abs(dot(normalize(i.nWS), v));        // the wall of the cone is seen edge-on -> soft core
                float along = exp(-i.uv.y * 3.0) * smoothstep(0.0, 0.03, i.uv.y);
                float core = pow(facing, 2.0);
                float3 c = _Color.rgb * _Intensity * along * core * (1.0 + 4.0 * _Pulse);
                return half4(c * max(_AtlasExposure, 1e-3), 0);
            }
            ENDHLSL
        }
    }
}
