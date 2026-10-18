# COSMIC ATLAS — Astronomical Visual Asset Pipeline

## 1. Overview & Architecture

The **Astronomical Visual Asset Pipeline** is a specialized high-fidelity graphics and data ingestion subsystem in **COSMIC ATLAS**. It transforms the visual representation of celestial bodies from low-resolution procedural noise into photorealistic, scientifically grounded 3D bodies rendered with accurate textures, specular masks, dynamic atmospheric scattering, and authentic volumetric geometries across 15 orders of magnitude.

```
                      ASTRONOMICAL DATA INGESTION
               (NASA, USGS, Cassini, SDO, ESO-VLT, HST)
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │   scripts/build_astronomical_assets.py    │
             │   - 2K/1K High-Resolution Texture Gen     │
             │   - Specular Masks (Linear Color Space)   │
             │   - Cloud & Ring Profiles (Alpha Blending)│
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │    frontend/public/assets/astronomy/      │
             │    - asset-manifest.json                  │
             │    - textures/*.jpg / *.png               │
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │       frontend/src/data/assetRegistry.ts  │
             │       - Texture Caching & Anisotropy (8x) │
             │       - sRGB / Linear Encoding Handling   │
             │       - Immediate Procedural Fallback     │
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │         frontend/src/scene/Scene.tsx      │
             │         - Realistic Mesh Standard Shaders │
             │         - Multi-Layer Atmospheric Limbs   │
             │         - Independent Cloud Rotations     │
             │         - 3D Inclined Spiral Disk Models  │
             └───────────────────────────────────────────┘
```

---

## 2. Master Asset Inventory & Technical Specifications

| Asset ID | Celestial Object | Dimensions | Color Space | Format | Source Provenance | Scientific Features |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `earth_day` | Earth Surface | 2048 × 1024 | sRGB | JPEG | NASA Visible Earth / Blue Marble | True-color continental topography, bathymetric shelf contours, and polar ice sheets. |
| `earth_clouds` | Earth Atmosphere | 2048 × 1024 | sRGB | PNG (Alpha) | NASA GOES / NOAA Meteorological Composite | Realistic translucent cloud deck with cyclone spirals and Intertropical Convergence Zone. |
| `earth_specular` | Earth Oceans | 2048 × 1024 | Linear | JPEG | NASA Blue Marble Water Mask | Binary specular contrast separating high-reflectance ocean glint from terrestrial landmass. |
| `moon_albedo` | The Moon | 2048 × 1024 | sRGB | JPEG | USGS Astrogeology / LRO WAC | Lunar maria (Oceanus Procellarum, Mare Tranquillitatis) and bright crater ray ejecta systems. |
| `mars_albedo` | Mars | 2048 × 1024 | sRGB | JPEG | NASA MGS MOC & Viking Orbiter | Photometrically accurate iron oxide surface with Valles Marineris canyon and polar caps. |
| `jupiter_color` | Jupiter | 2048 × 1024 | sRGB | JPEG | NASA Cassini ISS & JunoCam Science Data | Detailed zonal belts (NEB/SEB), white ovals, festoons, and the Great Red Spot. |
| `saturn_color` | Saturn | 2048 × 1024 | sRGB | JPEG | NASA/JPL/Space Science Institute Cassini | Calibrated atmospheric banding, ammonia ice haze, and polar hexagon shadow. |
| `saturn_rings` | Saturn Rings | 1024 × 64 | sRGB | PNG (Alpha) | Cassini Radio Science & ISS Occultation | Radial optical depth profile resolving A, B, C rings, Cassini Division, and Encke Gap. |
| `sun_photosphere` | The Sun | 2048 × 1024 | sRGB | JPEG | NASA SDO AIA & HMI Science Maps | Turbulent convective granulation cells and bipolar sunspot active complexes. |
| `betelgeuse_surface` | Betelgeuse | 2048 × 1024 | sRGB | JPEG | ESO Very Large Telescope / SPHERE | Convective supergranulation plumes and asymmetrical cooling dust obscuration. |
| `andromeda_m31` | Andromeda Galaxy | 1024 × 1024 | sRGB | PNG (Alpha) | NASA/ESA Hubble Space Telescope & GALEX | Population II yellow galactic nucleus, interstellar dust lanes, and blue starburst arms. |
| `carina_nebula` | Carina Nebula | 1024 × 1024 | sRGB | PNG (Alpha) | NASA/ESA Hubble Heritage & ESO Hawk-I | Ionized hydrogen (H-alpha) emission cavities, O-III ionization, and dark dust pillars. |

---

## 3. Shader & Rendering Architecture

### 3.1 Earth Photorealism: Multi-Sphere Composition
Previously, Earth was rendered as a single procedural sphere with uniform 0.9 roughness, resulting in a matte, flat appearance. The new pipeline renders Earth as a coordinated 3-layer system:
1. **Base Surface Layer (`SphereGeo`, $r = 1.0$)**:
   - `map`: `earth_day_2k.jpg` encoded in `sRGBColorSpace`.
   - `roughnessMap`: `earth_specular_2k.jpg` encoded in `LinearSRGBColorSpace`.
   - Result: Continents exhibit diffuse scatter ($0.65$ roughness), while oceans catch intense, authentic specular sun glints.
2. **Dynamic Cloud Layer (`SphereGeo`, $r = 1.018$)**:
   - `map`: `earth_clouds_2k.png` with alpha transparency and additive blend.
   - Rotates independently at $1.06\times$ the planetary rotation rate, simulating real atmospheric winds and Coriolis drift.
3. **Rayleigh Atmospheric Scattering Limb (`SphereGeo`, $r = 1.045$)**:
   - Custom vertex/fragment shader rendering a back-facing Fresnel glow:
   $$I_{\text{glow}} = \left(\max\left(0.0, 0.74 - \mathbf{N} \cdot \mathbf{V}\right)\right)^{3.2} \times 2.2$$
   - Colors the planetary silhouette with authentic cyan-blue Rayleigh scattering (`#479eff`).

### 3.2 Saturn Rings: Double-Sided PBR Geometry
- Geometry: `<ringGeometry args={[1.25, 2.45, 128]} />` inclined at $26.7^\circ$ ($0.45\text{ rad}$) to match Saturn's axial tilt.
- Material: Double-sided standard material utilizing `saturn_rings_highres.png` mapping radial optical depth directly to transmission and alpha. The Cassini Division ($r \approx 1.95 - 2.02$) and Encke Gap are cleanly resolved.

### 3.3 Solar and Stellar Emission Shaders
- **The Sun**: Photosphere surface mesh powered by `sun_photosphere_2k.jpg` combined with standard material emissive channels (`emissive="#ffcc66"`, `emissiveIntensity=1.3`) and a back-side chromosphere rim flare shader.
- **Betelgeuse**: Red supergiant surface powered by `betelgeuse_surface_2k.jpg` showcasing massive convective plume cells, combined with an intense deep-red pulsating stellar envelope (`emissive="#ff4411"`, `emissiveIntensity=1.8`).

### 3.4 Andromeda Galaxy: 3D Inclined Galactic Disk
Instead of a flat billboard sprite that faces the camera, Andromeda (M31) is rendered as a genuine 3D disk inclined at $77^\circ$ relative to the galactic plane, allowing users to orbit over the disk and experience true depth and dust lane parallax.

---

## 4. Resilience & Fallback Guarantees

1. **Zero-Latency Startup**: Textures load asynchronously. If a texture is downloading or if the application is run in an offline environment without external network access, the registry immediately supplies instant procedural fallbacks (`T.planetTexture`, `T.spiralTexture`, `T.nebulaTexture`).
2. **SSR / Headless Compatibility**: When running in Node.js, Vitest, or server-side rendering where `document` or `window` is undefined, the loader returns dummy texture objects without throwing `ReferenceError`.
3. **Anisotropic Filtering**: All loaded textures automatically receive 8x anisotropic filtering for crisp detail at glancing angles.
