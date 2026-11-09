#ifndef COSMIC_ATLAS_COMMON_INCLUDED
#define COSMIC_ATLAS_COMMON_INCLUDED

// Shared lighting model for every Cosmic Atlas exhibit.
// Space has one dominant light source, so instead of URP's light loop every shader reads the same globals
// (set by AtlasLighting.cs): sun position/radius/colour and up to 8 spherical occluders for eclipses & transits.

float4 _AtlasSunPosRadius;   // xyz world position, w radius (world units)
float4 _AtlasSunColor;       // rgb linear colour * intensity
float4 _AtlasOccluders[8];   // xyz centre, w radius
float  _AtlasOccluderCount;
float  _AtlasExposure;
float  _AtlasTime;

static const float ATLAS_PI = 3.14159265359;

// Area of intersection of two circles with angular radii a, b and centre separation c (all radians, small-angle plane).
float CircleOverlapArea(float a, float b, float c)
{
    if (c >= a + b) return 0.0;
    float rmin = min(a, b);
    if (c <= abs(a - b)) return ATLAS_PI * rmin * rmin;
    float a2 = a * a, b2 = b * b, c2 = c * c;
    float alpha = acos(clamp((c2 + a2 - b2) / (2.0 * c * a), -1.0, 1.0));
    float beta  = acos(clamp((c2 + b2 - a2) / (2.0 * c * b), -1.0, 1.0));
    return a2 * (alpha - 0.5 * sin(2.0 * alpha)) + b2 * (beta - 0.5 * sin(2.0 * beta));
}

// Fraction of the solar disk visible from world point p (1 = full sun, 0 = total eclipse / umbra).
// `selfIndex` lets a body skip itself (pass -1 to test all occluders).
float SunVisibility(float3 p, float selfIndex)
{
    float3 toSun = _AtlasSunPosRadius.xyz - p;
    float dSun = length(toSun);
    float aSun = asin(saturate(_AtlasSunPosRadius.w / max(dSun, 1e-5)));
    float visible = 1.0;
    int n = (int)_AtlasOccluderCount;
    [loop] for (int i = 0; i < 8; i++)
    {
        if (i >= n) break;
        if ((float)i == selfIndex) continue;
        float3 toOcc = _AtlasOccluders[i].xyz - p;
        float dOcc = length(toOcc);
        if (dOcc >= dSun || dOcc <= _AtlasOccluders[i].w) continue; // behind the sun, or p inside the occluder
        float aOcc = asin(saturate(_AtlasOccluders[i].w / dOcc));
        float c = acos(clamp(dot(toSun / dSun, toOcc / dOcc), -1.0, 1.0));
        float frac = CircleOverlapArea(aSun, aOcc, c) / (ATLAS_PI * aSun * aSun);
        visible = min(visible, 1.0 - saturate(frac));
    }
    return visible;
}

float3 SunDirection(float3 p) { return normalize(_AtlasSunPosRadius.xyz - p); }

// ---- noise (used only where the model is explicitly procedural/illustrative) -----------------------------------
float Hash13(float3 p)
{
    p = frac(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return frac((p.x + p.y) * p.z);
}

float ValueNoise3(float3 p)
{
    float3 i = floor(p), f = frac(p);
    float3 u = f * f * (3.0 - 2.0 * f);
    float n000 = Hash13(i), n100 = Hash13(i + float3(1, 0, 0)), n010 = Hash13(i + float3(0, 1, 0)), n110 = Hash13(i + float3(1, 1, 0));
    float n001 = Hash13(i + float3(0, 0, 1)), n101 = Hash13(i + float3(1, 0, 1)), n011 = Hash13(i + float3(0, 1, 1)), n111 = Hash13(i + float3(1, 1, 1));
    return lerp(lerp(lerp(n000, n100, u.x), lerp(n010, n110, u.x), u.y), lerp(lerp(n001, n101, u.x), lerp(n011, n111, u.x), u.y), u.z);
}

float Fbm3(float3 p, int octaves)
{
    float s = 0.0, a = 0.5;
    [loop] for (int i = 0; i < 8; i++)
    {
        if (i >= octaves) break;
        s += a * ValueNoise3(p);
        p = p * 2.03 + 17.1;
        a *= 0.5;
    }
    return s;
}

// Approximate blackbody chromaticity (linear sRGB, max component ≈ 1): Tanner Helland's widely used empirical fit,
// valid ~1,000–40,000 K. Used on the GPU only where temperature varies per pixel (accretion disk). The CPU path
// (Blackbody.cs) integrates Planck's law against the CIE 1931 colour-matching functions instead; an EditMode test
// checks that the two agree in hue ordering.
float3 BlackbodyColorApprox(float tK)
{
    float t = clamp(tK, 1000.0, 40000.0) / 100.0;
    float r = t <= 66.0 ? 1.0 : saturate(1.29293618606 * pow(t - 60.0, -0.1332047592));
    float g = t <= 66.0 ? saturate(0.39008157876 * log(t) - 0.63184144378) : saturate(1.12989086089 * pow(t - 60.0, -0.0755148492));
    float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : saturate(0.54320678911 * log(t - 10.0) - 1.19625408914));
    float3 srgb = float3(r, g, b);
    return pow(srgb, 2.2); // the fit is in display (gamma) space; convert to linear
}

#endif
