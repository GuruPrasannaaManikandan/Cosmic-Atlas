# Final Visual Realism Specification

**Status:** Stage 1 design. Nothing in this document is rendered yet unless it is marked *implemented*.
**Companion documents:**
- [MISSION_TIME_MACHINE_ARCHITECTURE.md](MISSION_TIME_MACHINE_ARCHITECTURE.md)
- [HISTORICAL_ROUTE_RECONSTRUCTION.md](HISTORICAL_ROUTE_RECONSTRUCTION.md)
- [MISSION_DATA_AUTHORING_GUIDE.md](MISSION_DATA_AUTHORING_GUIDE.md)
- [MARS_TERRAIN_AND_ENVIRONMENT.md](MARS_TERRAIN_AND_ENVIRONMENT.md)
- [HARDWARE_ENGINEERING_INSPECTION.md](HARDWARE_ENGINEERING_INSPECTION.md)

## 1. Rules that override everything below

1. **Realism never comes from invented data.** Every visible quantity has a source id or is labelled as one of:
   - *reconstruction* (built from documented references);
   - *illustrative* (artistic and educational, and said so in the UI);
   - *unavailable* (not shown).
2. **The Moon experience is preserved.** No change below may regress the existing lunar suites: Vitest, layout, surface, storytelling, Moon sites, models.
3. **Performance is a requirement, not a polish item.** Every profile has a measured budget. A feature that breaks the gate on the reference machine is off by default at that profile.

## 2. Renderer decision record

| | |
|---|---|
| Decision | **Unity 6.3 LTS (6000.3.28f1) + URP 17.3, WebGL2**, as the renderer for Mars surfaces and hardware engineering inspection. It is embedded in the existing React shell through the existing JS ⇄ Unity bridge (`AtlasBridge.jslib`) |
| Moon | Stays on the production R3F / Three.js renderer. A port is reconsidered only in Stage 6, with measurements |
| WebGPU | Not used. Unity 6.3 documents it as experimental ([manual](https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU-limitations.html)) |
| Approval | Approved with Stage 1 on 2026-11-10, **subject to the Stage 2 gates below** |
| Fallback | If the gates fail, use the R3F pipeline with the same quality profiles, cascaded shadows and post-processing. This is decided from the Stage 2 measurements and recorded here |
| **Stage 2 result (2026-11-10)** | **CONFIRMED.** Every §2.1 gate passes on the reference machine (Balanced: 4 ms p50 uncapped; heap 495 / 512 MB; Brotli 31.45 MB; load 4.6–6.4 s; terrain 0.6 mm), so the fallback is not triggered. Six conditions are attached: default to Balanced on an iGPU, a heap budget, serving Brotli, measuring inside the shell, a camera path that rebases, and a cross-browser pass. See `GRAPHICS_PERFORMANCE_REPORT.md` §3 |

### 2.1 Stage 2 gates (reference machine)

Reference machine: Intel Core Ultra 7 155H, Intel Arc iGPU, 15.6 GB RAM, Chromium.

| Gate | Threshold | Measured how |
|---|---|---|
| Frame rate, **Balanced** | ≥ 30 fps p50 and ≥ 24 fps p5 at 1366×768 over a scripted 60 s camera path on the Victoria DTM tile, with the MER model and sky | In-player frame timing via the bridge (§5) |
| First-scene download | ≤ 40 MB with Brotli (framework + data + wasm + first terrain tile) | Byte count of the compressed build artefacts |
| WASM heap | ≤ 512 MB after load and after 10 profile switches; no growth | `HEAPU8.length` via the bridge |
| Load to first frame | ≤ 15 s on a local server, cold cache | Playwright timing |
| Visual correctness | Sun direction matches the Mars24 reference within 0.1°. Terrain matches the DTM heights within 0.05 m at 100 random points | Unit tests + in-player readback |

## 3. Units, frames and floating origin

| Item | Specification |
|---|---|
| Unit | **1 unit = 1 metre**, everywhere: Unity scenes, route data, component data |
| Body shape | Mars IAU 2000 sphere, **R = 3,396.19 km**. This is the radius in the labels of both HiRISE DTMs used here, so terrain and coordinates share one figure. The Moon keeps its existing frame |
| Coordinates in data | Planetocentric latitude, **east-positive** longitude (as in `SurfacePosition`), plus height above the sphere. Local products (the `osu/` Eagle and Endurance DTMs, rover site frames) carry their own frame record (see the route reconstruction document) and are never mixed in without a documented transform |
| World positions | Held in double precision: C# `double` in Unity, JS `number`. Each object stores its planetocentric position or a position in a documented frame |
| Render positions | Float32, relative to a **floating origin**: a surface point with its local East-North-Up (ENU) frame. A render position is the ENU vector from the origin to the object, computed in double and then cast |
| Rebasing | When the camera is **more than 1 km** from the origin (horizontal), the origin moves to the camera's ground point. Every object's ENU vector is recomputed from its double-precision position. Float32 spacing at 1 km is about 0.06 mm, so jitter stays far below a pixel at inspection distances |
| Curvature | Terrain tiles are built in the ENU frame of the current origin, **including the sphere's curvature**. A flat frame is wrong at Opportunity's scale: the drop over a distance *d* is about *d*²/2R, which is **0.59 m at 2 km and about 300 m across 45 km**. The existing Moon horizon already bends its mesh the same way |
| Depth | Reversed-Z, or a logarithmic depth buffer if reversed-Z isn't available in WebGL2. The far plane covers the horizon. Near-plane precision is checked at a 0.05 m inspection distance |

## 4. Quality profiles

These are the initial settings. Stage 2 tunes them against the gates and records the measured costs in `GRAPHICS_PERFORMANCE_REPORT.md`. Profiles are data (`QualityProfile` in `frontend/src/realism/records.ts`, and `mission-data/schemas/quality-profile.schema.json`), so Unity and the web shell read one definition.

| Setting | Ultra | High | Balanced | Performance |
|---|---|---|---|---|
| Intended hardware | discrete GPU, desktop | discrete or strong integrated GPU | **integrated GPU (reference machine)** | low-end laptops, tablets |
| Gate on the reference machine | measured, reported | measured, reported | **≥ 30 fps p50** | ≥ 45 fps p50 |
| Render scale | 1.0 | 1.0 | 0.85 | 0.7 |
| Anti-aliasing | MSAA 4× + SMAA | MSAA 2× | FXAA | none |
| Sun shadows: cascades / distance / map | 4 / 400 m / 4096 | 4 / 250 m / 2048 | 2 / 150 m / 2048 | 1 / 80 m / 1024 |
| Ambient occlusion (SSAO) | on | on | off | off |
| Terrain: near-field mesh spacing | DTM native (1.01 m HiRISE; finer local DTMs where available) | native | 2 m | 4 m |
| Terrain: detail normal / micro-relief | on | on | on | off |
| Max texture size | 4096 | 2048 | 2048 | 1024 |
| Sky: atmosphere lookup tables (transmittance / scattering) | 256 / 64³ | 128 / 32³ | 64 / 32³ (multiple scattering approximated) | 32 / 16³ |
| Airborne dust particles | 100% | 60% | 30% | 10% |
| Bloom / exposure adaptation | on / on | on / on | on / fixed | off / fixed |
| Hardware model LOD | full | full | LOD1 beyond 20 m | LOD1 beyond 8 m |

**Auto-select:** an integrated GPU starts at Balanced and the web starts at Balanced. The user can always change it. This reuses the Unity M2 auto-select logic (`AtlasQuality.cs`).

## 5. Performance instrumentation contract

Every Unity scene reports through the bridge once per second:
- **frame time:** p50 / p95 / p99 over the last 120 frames;
- **CPU main-thread time;**
- **GPU time**, only when `EXT_disjoint_timer_query_webgl2` is available, otherwise "unavailable" (never estimated);
- **render statistics:** draw calls, SetPass calls and triangle count;
- **memory:** texture memory, WASM heap and JS heap;
- **context:** the active profile and the render resolution.

The web shell shows these in the existing stats overlay (`showStats`), and Playwright scripts collect them.

A run is valid only when both are recorded:
- the device string (`WEBGL_debug_renderer_info`);
- whether the tab was visible. Hidden tabs throttle, so their numbers are rejected.

## 6. Physically informed shading (scope)

| Area | Approach | Source requirement |
|---|---|---|
| Sun | Direction from Mars24 (Allison & McEwen 2000), implemented and tested in `frontend/src/realism/marsTime.ts`. Solar irradiance scales with 1/R_M² | GISS Mars24 algorithm (cited in the code) |
| Atmosphere | Single + multiple scattering lookup tables, driven by **optical depth τ** at the time and place | τ from the Pancam record (Lemmon et al. 2015) where it exists. Otherwise the τ value is labelled *assumed* in the UI |
| Ground | Physically based (PBR) albedo from calibrated orbital or rover imagery; roughness and normals from the DTM plus micro-relief | Colour source recorded per site; "illustrative" if not calibrated |
| Hardware | PBR materials. Colours come from NASA imagery of the hardware and are labelled; no invented markings | Asset provenance file per model |
| Dust on hardware | Only where a dated, sourced image shows it (for example, the solar array state on a given sol) | Image id per state |

## 7. What "realism" does not include

- No fabricated NASA audio, radio calls or crew or controller dialogue. See `AUDIO_AND_EDUCATIONAL_DESIGN.md` (Stage 3).
- No component dimensions, masses or internal layouts without a source. Exploded and cutaway views show only documented parts and relationships (`HARDWARE_ENGINEERING_INSPECTION.md`).
- No route drawn in an unverified coordinate frame (`HISTORICAL_ROUTE_RECONSTRUCTION.md`).
