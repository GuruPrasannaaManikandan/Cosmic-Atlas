using UnityEngine;

namespace CosmicAtlas.Rendering
{
    /// <summary>
    /// Tileable 3-D fractal value-noise baked into a Texture3D once, so volume ray-marchers sample a texture
    /// (hardware trilinear filtering) instead of evaluating ~20 octaves of procedural noise per step.
    /// Channels: R = 6-octave fbm (structure), G/B = 3-octave fbm (domain warp), A = 5-octave fbm (dust).
    /// One texture period spans <see cref="BaseCells"/> noise cells, so sampling at x / BaseCells reproduces
    /// the shader's former Fbm3(x) frequency content.
    /// </summary>
    public static class NoiseVolume
    {
        public const int BaseCells = 8;
        static Texture3D _cached;
        static int _cachedSize;

        public static Texture3D Get(int size = 64)
        {
            if (_cached && _cachedSize == size) return _cached;
            _cached = Build(size, 1234);
            _cachedSize = size;
            return _cached;
        }

        public static Texture3D Build(int size, int seed)
        {
            var px = new Color32[size * size * size];
            for (int z = 0; z < size; z++)
                for (int y = 0; y < size; y++)
                    for (int x = 0; x < size; x++)
                    {
                        float u = (float)x / size, v = (float)y / size, w = (float)z / size;
                        px[x + size * (y + size * z)] = new Color32(
                            ToByte(Fbm(u, v, w, 6, seed)),
                            ToByte(Fbm(u, v, w, 3, seed + 101)),
                            ToByte(Fbm(u, v, w, 3, seed + 202)),
                            ToByte(Fbm(u, v, w, 5, seed + 303)));
                    }
            var tex = new Texture3D(size, size, size, TextureFormat.RGBA32, false)
            {
                name = "AtlasNoiseVolume", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear, anisoLevel = 0,
            };
            tex.SetPixels32(px);
            tex.Apply(false, true); // upload and free the CPU copy
            return tex;
        }

        static byte ToByte(float f) => (byte)Mathf.Clamp(Mathf.RoundToInt(f * 255f), 0, 255);

        /// <summary>Periodic fbm over the unit cube (period 1 in u,v,w) with amplitudes 0.5, 0.25, … (range ≈ 0..1).</summary>
        public static float Fbm(float u, float v, float w, int octaves, int seed)
        {
            float s = 0, a = 0.5f;
            int period = BaseCells;
            for (int o = 0; o < octaves; o++)
            {
                s += a * PeriodicValueNoise(u * period, v * period, w * period, period, seed + o * 17);
                period *= 2;
                a *= 0.5f;
            }
            return s;
        }

        static float PeriodicValueNoise(float x, float y, float z, int period, int seed)
        {
            int ix = Mathf.FloorToInt(x), iy = Mathf.FloorToInt(y), iz = Mathf.FloorToInt(z);
            float fx = x - ix, fy = y - iy, fz = z - iz;
            float ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
            float H(int a, int b, int c) => Hash(Mod(a, period), Mod(b, period), Mod(c, period), seed);
            float x00 = Mathf.Lerp(H(ix, iy, iz), H(ix + 1, iy, iz), ux);
            float x10 = Mathf.Lerp(H(ix, iy + 1, iz), H(ix + 1, iy + 1, iz), ux);
            float x01 = Mathf.Lerp(H(ix, iy, iz + 1), H(ix + 1, iy, iz + 1), ux);
            float x11 = Mathf.Lerp(H(ix, iy + 1, iz + 1), H(ix + 1, iy + 1, iz + 1), ux);
            return Mathf.Lerp(Mathf.Lerp(x00, x10, uy), Mathf.Lerp(x01, x11, uy), uz);
        }

        static int Mod(int a, int m) { int r = a % m; return r < 0 ? r + m : r; }

        static float Hash(int x, int y, int z, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665);
                h = (h ^ (h >> 13)) * 1274126177u;
                h ^= h >> 16;
                return (h & 0xFFFFFF) / 16777215f;
            }
        }
    }
}
