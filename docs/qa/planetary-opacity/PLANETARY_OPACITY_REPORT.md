# Planetary Opacity, Depth and Occlusion: Root Cause, Fix and Verification

**Date:** 2026-11-09
**Branch:** `fix/planet-occlusion`
**Browser:** Google Chrome 156.0.8078.81 (Playwright `channel=chrome`), ANGLE/D3D11, Intel Arc iGPU

## 1. Root cause (reproduced in Chrome)

The **background starfield** (`Backdrop` in `frontend/src/scene/Scene.tsx`) was a `THREE.Points` layer with
`transparent: true`, `depthTest: false` and `renderOrder: -100`.

The intent was "draw first, behind everything". But three.js renders **all opaque objects first, then all transparent objects**, and `renderOrder` only sorts *within* each list. So the starfield was drawn **after** every opaque planet, with no depth test. Each star overwrote whatever planet pixel lay in front of it, which put stars on top of the solid surfaces of every body at every distance.

The planets were never transparent. Their materials, depth testing and depth writing were correct. The texture was not involved.

**Two more layers** used `depthTest: false` for objects that have real 3-D positions:
- the **dataset-points overlay** (Data Intelligence);
- the **selection-ring sprite**.

Both were drawn over any body in front of them.

### Ruled out by inspection or measurement

| Suspect | Finding |
|---|---|
| Planet material transparency / alpha | Surfaces are opaque (`MeshStandardMaterial`, or ShaderMaterial with `gl_FragColor.a = 1`). Albedo maps are JPEG (no alpha channel). Depth test and write are on. |
| Logarithmic depth buffer | `logarithmicDepthBuffer: true`, near 0.001, far 1e13. **All 13 custom shaders include `logdepthbuf_pars` and `logdepthbuf_vertex/fragment`**, so their depth is consistent with the built-in materials. |
| Floating origin / float32 precision | The camera stays at the scene origin (`Rig`). Body positions are computed in float64 relative to the camera, then compressed monotonically (`compressDistance`). Measured at the night-side pose: the Sun's scene distance is 378,680–1,057,812 units vs 60 for the body (3 R). The order is preserved; there is no precision inversion. |
| The Sun appearing at a night-side limb | Hiding *only* the Sun changes **0 pixels** inside the full disk of Mercury, Venus, the Moon and Mars. It is genuinely peeking past the limb (correct geometry), not drawn through the body. |
| Atmosphere / cloud shells | Additive or alpha layers with `depthWrite: false` on top of an opaque surface. They cannot open holes. |
| Unity URP | `PlanetSurface` and `StarSurface` are opaque (`Queue=Geometry`, default ZWrite On, ZTest LEqual). Star glow, atmosphere, nebula, particles and pulsar beams are transparent with depth test on. The black-hole proxy uses `ZTest Always` but is the only object in its isolated station. **No change needed.** |

## 2. Fix (material-specific; nothing made globally opaque or transparent)

| Layer | Before | After | Why |
|---|---|---|---|
| Backdrop starfield | transparent, depthTest off, renderOrder −100 (drawn *after* opaque) | **opaque** layer, depthTest/write off, renderOrder −100 → drawn **first** in the opaque pass. The former 0.9 opacity is folded into the colour (`#e6e6e6`). | A sky-at-infinity layer must be drawn first; every solid body, atmosphere and ring then draws over it. |
| Dataset points | depthTest off | depthTest on (depthWrite off) | Real 3-D positions must be hidden by bodies in front. |
| Selection-ring sprite | depthTest off | depthTest on (depthWrite off) | A selected object behind a planet must not have its marker drawn over that planet. |

The material classes are otherwise preserved:
- Atmospheres stay additive, back-face limb shells.
- Earth's clouds stay alpha-blended over the opaque surface.
- Saturn's, Uranus's and Neptune's rings stay transparent, with planet↔ring shadows unchanged.
- Nebulae, galaxy particles and event effects stay additive and depth-tested.
- Labels already had geometric occlusion (`Labels.tsx`).

## 3. Material audit (Three.js site)

| Object | Material / shader | Mode | Alpha | Depth test / write | Order | Texture alpha | Custom depth |
|---|---|---|---|---|---|---|---|
| Mercury, Mars, Jupiter, Moon, moons, asteroids, Pluto | MeshStandardMaterial (map) | Opaque | 1 | on / on | opaque pass | none (JPEG) | — |
| Venus | MeshStandardMaterial + AtmosphereMesh | Opaque surface + additive shell | 1 / additive | on/on · on/off | opaque · transparent | none | logdepth |
| Earth | MeshStandardMaterial (map, normal, roughness) + night-lights ShaderMaterial (additive, discards day side) + clouds MeshStandard (opacity 0.92) + AtmosphereMesh | Opaque surface + 3 blended layers | 1 / blended | on/on · on/off ×3 | opaque · transparent | clouds use the map only | logdepth |
| Saturn | ShaderMaterial (texture + ring shadow) + ring ShaderMaterial (DoubleSide) | Opaque planet + transparent rings | 1 / ring alpha | on/on · on/off | opaque · transparent | ring alpha texture | logdepth |
| Uranus, Neptune | IceGiantSurface ShaderMaterial + RingSystem ShaderMaterial (premultiplied) + AtmosphereMesh | Opaque planet + transparent rings + additive shell | 1 / physical τ coverage | on/on · on/off · on/off | opaque · transparent (ring order 2) | none | logdepth |
| Titan | MeshStandard + haze (opacity 0.88) + limb glow | Opaque surface + blended haze | 1 / blended | on/on · on/off | opaque · transparent | none | logdepth |
| Sun, stars | MeshStandard / MeshBasic core + additive corona shell + glow sprite | Opaque core + additive | 1 / additive | on/on · on/off | opaque · transparent | glow sprite | logdepth |
| Backdrop stars | PointsMaterial | **Opaque, drawn first** (fixed) | 1 | off / off | renderOrder −100 | — | — |
| Galaxy, cosmic web, asteroid belt | PointsMaterial, additive | Transparent | additive | on / off | transparent | — | — |
| Dataset points | PointsMaterial | Transparent | 0.95 | **on (fixed)** / off | transparent | — | — |
| Selection ring | SpriteMaterial | Transparent | texture | **on (fixed)** / off | transparent | ring texture | — |
| Orbit lines | LineBasicMaterial | Transparent | 0.22–0.6 | on / off | transparent | — | — |
| Spacecraft (Travel) | MeshStandard hull (opaque); canopy opacity 0.8; exhaust additive | Opaque + glass/exhaust | 1 / 0.8 | on/on · on/off | opaque · transparent | — | — |

## 4. Verification in Chrome (rendered result, not material flags)

`scripts/e2e/occlusion_check.py` renders the live page twice per pose: normally, and with everything **behind** the body hidden (background point layers, plus every other body's meshes and sprites that are farther from the camera than the body). Inside the body's projected disk (92 %), the two renders must be **pixel-identical**. Any difference is background leaking through the surface.

| Run | Bodies × poses | Result |
|---|---|---|
| **Before fix** | 7 bodies × 5 poses | **0/35 pass.** Mars leaks 4–963 px per pose (`before_mars_*.jpg`, `01_mars_before_after.png`). |
| **After fix** | 12 bodies (8 planets, Moon, Io, Titan, Pluto) × 5 poses (lit, terminator, night side, 1.6 R, 12 R) | **60/60 pass, 0 leaking pixels** |
| **Camera movement** (`--sweep`) | Mars and Saturn × 12 angles × 1.3/4/20 R (150 R and 2000 R: disk < 8 px, skipped) | **72/72 pass** |
| **Negative control** (`--simulate-defect`: old backdrop material restored at runtime) | Mars, Jupiter × 5 poses | **0/10 pass.** Leak counts match the original defect, so the test detects the bug. |
| **Multi-scale flight** (`multiscale_flight.py`) | Intro → Laniakea → Milky Way → Sun → Mars, adaptive scale 1.4e7 → 2.2e-11 | Arrives at each stage, **0 console errors** |

### Tests A–F of the brief

| Test | Result |
|---|---|
| A — Mars | No stars through the disk; lit/night/terminator, 1.3–20 R, 12 angles |
| B — Earth | Opaque disk; blue atmospheric limb, clouds and night lights intact (`after_earth_*.jpg`) |
| C — Jupiter, Saturn | Opaque; Saturn's rings keep transparency and shadows (`after_saturn_*.jpg`) |
| D — Uranus, Neptune | Opaque; rings and limb haze intact |
| E — Other objects | Moon, Io, Titan, Pluto, Mercury, Venus pass. The Sun behind bodies is occluded (0 px). Stars/galaxies behind are hidden. |
| F — Camera movement | Sweep 72/72; multi-scale flight OK; no flicker (identical frames in the A/B renders) |

## 5. Performance (headed Chrome, 1920×1080, vsync; 30 s per scenario after vs 60 s before)

| Scenario | Before (QA pass) | After |
|---|---|---|
| Idle Solar System | 16.67 ms, 100 % ≥ 58 fps | 16.67 ms, 100 % |
| Camera orbit | 16.67 / 100 % | 16.67 / 100 % |
| Fast navigation | 16.67 / 100 % | 16.69 / 99.6 % (one 33 ms frame) |
| Milky Way starfield | 16.67 / 100 % | 16.67 / 100 % |
| Black-hole event | 16.67 / 100 % | 16.67 / 100 % |
| Saturn close-up | 16.67 / 100 % | 16.67 / 100 % |
| Travel nav map | 16.67 / 100 % | 16.67 / 100 % |

There are no added draw calls: the fix changes material state only, with no new objects or passes. Long tasks: 0.

## 6. Regression

Vitest 132/132, `tsc` pass, Vite production build pass, Travel e2e 18/18, app smoke 12/12. No console or WebGL errors in any run.

## 7. Evidence files (this folder)

| # | Brief item | File |
|---|---|---|
| 1 | Original Mars defect | `before_mars_160deg_3p0R.jpg`, `before_mars_50deg_3p0R.jpg` |
| 2 | Corrected Mars | `after_mars_*.jpg`; `01_mars_before_after.png` |
| 3–7 | Corrected Earth, Jupiter, Saturn, Uranus, Neptune | `after_<planet>_50deg_3p0R.jpg` (lit), `after_<planet>_160deg_3p0R.jpg` (night side) |
| 8 | Moons | `after_moon_*.jpg`; `02_corrected_bodies_grid.png` (also Io, Titan, Pluto, Mercury, Venus) |
| 9 | Camera movement | `sweep_mars_*`, `sweep_saturn_*` |
| 10 | Multi-scale navigation | `multiscale_*` |

Reports: `occlusion_before.json`, `occlusion_after.json`, `occlusion_sweep.json`, `negative_control/`, `multiscale_flight.json`, `metrics/performance_balanced.json`.
