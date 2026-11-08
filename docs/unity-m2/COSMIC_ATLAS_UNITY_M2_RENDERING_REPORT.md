# Cosmic Atlas — Milestone 2: Universal Astronomical Rendering (Unity URP prototype)

**Date:** 2026-11-08 · **Branch:** `feat/universal-realism-ui-travel` · **Unity:** 6000.3.28f1 (6.3 LTS), URP 17.3.0, Direct3D 11
**Machine:** Intel Core Ultra 7 155H, Intel Arc integrated GPU ("Intel(R) Arc(TM) Graphics", reported by Unity), 15.6 GB RAM.

## Status

| Label | Meaning |
|---|---|
| **Unity Editor verified** | Compiled, rendered and tested by Unity in batch mode on this machine (logs and images in this folder). |
| **Tested** | Covered by a passing Unity EditMode/PlayMode test. |
| **Planned / Not done** | Explicitly not in this milestone. |

**Blocker that remains:** the Unity MCP bridge is **not connected** to the assistant session. All Editor work was done and verified through batch mode instead (`-executeMethod`, `-runTests`, logs, rendered PNGs). No interactive Editor session was used.

## 1. What exists

`unity/CosmicAtlas/` is a URP project created from Unity's bundled "3D URP" template. Content lives in `Assets/CosmicAtlas/`:

| Folder | Contents |
|---|---|
| `Shaders/` | `AtlasCommon.hlsl` (single-sun lighting, analytic eclipses, noise), `StarSurface`, `StarGlow`, `PlanetSurface`, `Atmosphere`, `BlackHole`, `Nebula`, `ParticleBillboard`, `PulsarBeam` |
| `Runtime/` | `Blackbody`, `StellarModel`, `AtlasLighting`, `AtlasQuality`, `MeshUtil`, `GalaxyGenerator`, `InteractingGalaxies`, `SmallBodies` (crater meshes + comet simulator), `Exhibits`, `Showcase` (factory), `ShowcaseController` (interactive) |
| `Editor/` | `ShowcaseCapture` (batch-mode render, timing, scene save) |
| `Tests/` | EditMode (25 tests), PlayMode (2 tests) |
| `Resources/` | `catalog.v1.json` (byte-identical copy of the parity-tested artefact; a test enforces this); 10 maps with `PROVENANCE.md` |
| `Scenes/Showcase.unity` | Interactive prototype (Play): 1–9/0 station · Space next view · right-drag orbit · wheel zoom · **Q quality tier** · H help |

The **shared astronomy core** (`unity-migration/src/CosmicAtlas.Astro`, 22 .NET parity tests) is consumed as a local UPM package (`com.cosmicatlas.astro`). It is not copied.

**Path requirement:** the repository path is about 110 characters. Unity's package cache then exceeds Windows' 260-character limit (import failed with `DirectoryNotFoundException`). The project is therefore opened through a directory junction, `A:\CA` → repository root (`unity/CosmicAtlas` → `A:\CA\unity\CosmicAtlas`). No Windows setting was changed. On another machine, either clone to a short path or create a similar junction.

## 2. Rendering systems (scientific model vs. illustration)

Each exhibit's caption (shown in the prototype and in `captures/capture_report.json`) states the same split.

| Category | Physical model / data (what is real) | Illustrative (labelled) | Status |
|---|---|---|---|
| **Stars** | Blackbody chromaticity from Planck × CIE 1931 CMFs (Wyman et al. 2013 fit) → linear sRGB. Linear limb-darkening law. Stefan–Boltzmann, IAU 2015 solar Teff/M_bol. **Apparent brightness ≠ luminosity** (distance modulus). Point PSF (Moffat) when unresolved, disk when resolved (≥ 3 px). Parsing of MK types. | Granulation / spots (cell scale per class); class-typical radii and Teff interpolation; R^0.35 radius compression in the lineup | Editor verified, tested |
| **Planets / moons** | Real maps (USGS / NASA 3D Resources / Solar System Scope CC BY 4.0). Lommel–Seeliger photometry for regolith. **Analytic eclipses/shadows** (solar-disk overlap → umbra + penumbra). **Galilean-moon positions, Jupiter's IAU pole and the Sun's true angular size from the shared Kepler engine.** A real Io shadow transit near 2026-11-08 is found and rendered. | Relief from the albedo gradient (maps are not DEMs) | Editor verified, tested |
| **Atmospheres** | Single-scattering Rayleigh + Mie ray-march (Earth: standard sea-level coefficients and scale heights), planet shadowing, eclipse-aware | Titan haze coefficients; no multiple scattering | Editor verified |
| **Black hole** | **Per-pixel null-geodesic integration in the Schwarzschild metric.** The shadow edge reproduces the analytic critical impact parameter 2.5979 r_s vs (3√3/2) r_s = 2.5981 (test). Photon ring and lensed far-side disk emerge. Thin disk with ISCO inner edge, Shakura–Sunyaev T(r), gravitational redshift × Doppler beaming (g⁴). Lensed starfield. | Jets (Doppler-boosted cone, **educational**); disk colour mapping temperature; **no spin (Kerr)** | Editor verified, tested |
| **Nebula** | Volumetric ray-march: emission ∝ density² (emission measure), Hα 656 nm / [O III] 501 nm / [S II] 672 nm line colours by ionisation, dust extinction with reddening, wind cavities, columns pointing at ionising stars | The 3-D density field is procedural (no measured 3-D map exists) | Editor verified |
| **Galaxies** | Exponential disk, log-spiral arms (pitch), Hernquist bulge (exact inverse CDF; median tested), bar, Plummer dwarf. Blue young arms vs old red bulge. Dust on the **concave** side of the arms (tested). **Interacting pair from a restricted three-body simulation (Toomre & Toomre 1972)**: tails and bridge from gravity alone (tested). | Parameters are class-typical, not a specific galaxy | Editor verified, tested |
| **Pulsar** | Inclined dipole: field lines r = L sin²θ. Beams along the magnetic axis. Pulse when a beam sweeps the observer. **The geometric selection effect is tested**: an observer 85° from the spin axis sees no pulse when α = 50°. | Beams drawn as luminous cones (**educational**); rotation slowed ×300 (Crab P ≈ 33.7 ms) | Editor verified, tested |
| **Asteroids / comets** | Phobos shape from catalogue triaxial axes. Crater size distribution N(>D) ∝ D⁻², bowl+rim profile. **Comet tails integrated in the heliocentric frame**: dust under gravity × (1−β) (curves behind the orbit, tested); ion tail from the solar wind with aberration (straight, anti-sunward, tested). | Crater positions, bilobed nucleus shape, enlarged nucleus | Editor verified, tested |
| **Quality tiers** | Low / Medium / High / Ultra control ray-march steps, particle counts and tessellation. **Auto-select** is conservative (Intel/integrated → Medium or Low, web → Low; tested); `Q` cycles live. | — | Editor verified, tested |
| **Post-processing** | URP HDR, ACES tonemapping, **selective bloom** (threshold 1.0, intensity 0.35), SMAA | — | Editor verified |

## 3. Verification

| Check | Result |
|---|---|
| Unity EditMode tests | **25/25 passed** (`unity_EditMode_results.xml`) |
| Unity PlayMode tests | **2/2 passed** (`unity_PlayMode_results.xml`): every station × viewpoint × quality tier runs with no errors; pulsar pulses on-cone and not off-cone |
| Rendered viewpoints | **28/28 rendered, 0 black frames** (`captures/*.png`, `captures/capture_report.json`) |
| C# core (.NET) | 22/22 (unchanged) |
| Frontend / backend | 116/116 Vitest, 12/12 pytest (unchanged by this milestone's Unity work) |

### Defects found by these checks and fixed during the milestone

| Symptom | Root cause | Fix |
|---|---|---|
| Stars flat grey, Jupiter back-lit, black hole invisible | UV-sphere triangle winding inverted (spheres rendered inside-out; the BH proxy's `Cull Front` culled everything) | Winding corrected; regression test `Sphere_triangles_face_outward` |
| Galaxies and comet black, about 2 s/frame | `UNITY_MATRIX_P[1][1]` is negative when rendering into a texture on D3D, so the minimum-pixel-size logic inflated every particle to full-screen quads | `abs()`; galaxies now 3–10 ms |
| Interacting galaxies never interacted | Simulated 18 time units; Barker's equation gives about 41 units to pericentre | Start at 4 r_p (≈ 24 units to pericentre), 2,200 steps; test asserts tails form |
| "On-pulse" frame showed no pulse | Observer 85° from the spin axis is outside the beam cone of an α = 50° pulsar (physically correct outcome) | Observer placed on the cone (ζ = 50°); the selection effect itself became a test |
| Overexposed Sun, disk, nebula (detail clipped to white) | HDR intensities far above ACES' useful range | Intensities lowered: limb darkening, granulation and Doppler asymmetry now visible |
| No [O III] in the nebula | The wind cavity removed the gas exactly where high ionisation produces [O III] | Separate, smaller wind-cavity scale |

## 4. Performance (measured, this machine)

Editor batch mode, 1600×900, first viewpoint of each station. Each figure is the mean of 12 `camera.Render()` calls, synchronised by a 1-pixel GPU readback. It includes CPU submission. **It is not a player-build FPS measurement.** Source: `timing_report_medium_capture.json`.

| Station | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Stars | 7.8 ms | 7.1 | 7.3 | 6.5 |
| Jupiter system | 6.3 | 5.8 | 5.8 | 4.8 |
| Moons | 6.9 | 6.9 | 7.1 | 6.0 |
| Earth (atmosphere) | 9.9 | 11.4 | 13.5 | 13.7 |
| Black hole | 33.1 | 38.4 | 37.9 | 33.8 |
| **Nebula** | **97.0** | **124.0** | **168.7** | **217.4** |
| Galaxies | 3.0 | 3.5 | 5.7 | 10.1 |
| Pulsar | 2.7 | 3.0 | 3.4 | 3.0 |
| Small bodies | 3.1 | 3.2 | 3.2 | 2.8 |
| Comet | 3.1 | 3.0 | 3.8 | 3.2 |

Reading:
- Most exhibits run within a 60 fps budget even at 1600×900 on the integrated GPU.
- **The black hole costs about 35 ms** (about 28 fps at full resolution). Most rays escape after a few dozen adaptive steps, so the step-count tiers barely change its cost. The fix is half-resolution rendering for the lensing pass.
- **The volumetric nebula is too expensive** (124 ms at Medium, about 8 fps). It spends about 17 procedural value-noise evaluations per ray step. The planned fix is a baked 3-D noise texture, half-resolution ray-marching with upsampling, and possibly temporal reprojection. **Until then the nebula does not meet the "never sacrifice responsiveness" rule on this GPU.**
- The automatic tier picks **Medium** for this device (Intel Arc, reported 2 GB).

## 5. Limitations and honest gaps

1. **WebGL / web build: not built or tested.** All shaders avoid geometry and compute shaders (billboards are expanded in the vertex shader), but WebGL2 compatibility is **unverified**. HDR render targets on WebGL2 are also unverified.
2. **Not implemented:** solar flares/prominences; Saturn and its rings in Unity; Kerr (spinning) black holes; multiple scattering in atmospheres; comet tail curvature is real but not obvious from the captured viewpoint.
3. **Colour:** [O III] / Hα separation in the nebula is weak (they overlap spatially). The accretion disk reads near-grey after ACES. The O/B star blues look over-saturated.
4. **Integration with React / FastAPI:** not started (Milestone 4). The prototype runs standalone.
5. **Galaxy realism:** the arms wind more tightly than in a typical Sb galaxy, and particle density is visibly discrete at Medium.

## 6. How to run

```bash
cd unity-migration && dotnet test tests/CosmicAtlas.Astro.Tests
```
```powershell
New-Item -ItemType Junction -Path A:\CA -Target <repo>      # once, if the repo path is long
& "C:\Program Files\Unity\Hub\Editor\6000.3.28f1\Editor\Unity.exe" -batchmode -projectPath A:\CA\unity\CosmicAtlas -runTests -testPlatform EditMode -testResults editmode.xml -logFile editmode.log
& "C:\Program Files\Unity\Hub\Editor\6000.3.28f1\Editor\Unity.exe" -batchmode -projectPath A:\CA\unity\CosmicAtlas -executeMethod CosmicAtlas.Rendering.Editor.ShowcaseCapture.Run -outDir captures -quality Medium -timing -logFile capture.log
```
Interactive: open `A:\CA\unity\CosmicAtlas` in Unity Hub, open `Assets/CosmicAtlas/Scenes/Showcase.unity`, then press Play.

## 7. Recommended next milestone

1. Performance: nebula baked 3-D noise plus a half-resolution pass; black-hole half-resolution pass. Target ≤ 16 ms per exhibit at Medium on this GPU.
2. A WebGL2 build of the showcase, measured in Chromium on this machine (proves or disproves the web path).
3. Connect the Unity MCP bridge for interactive Editor work.
4. Then Milestone 3 (Cosmic Events simulations rebuilt on these systems) and Milestone 4 (React ⇄ Unity bridge per the blueprint protocol).
