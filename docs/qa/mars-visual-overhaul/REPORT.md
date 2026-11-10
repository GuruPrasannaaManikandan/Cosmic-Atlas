# Mars visual reconstruction: Victoria crater and Opportunity

**Date:** 2026-11-10.
**Renderer:** Unity 6000.3.28f1, URP 17.3, WebGL 2, embedded in Cosmic Atlas. Default profile: Balanced.
**Evidence:** all screenshots and metrics come from the running app (`scripts/e2e/mars_visual_check.py`, real Chrome with the GPU, 1366×768). The "before" images are the committed acceptance captures in `docs/qa/abandoned-but-not-forgotten/`.

## 1. Diagnosis: why the scene looked primitive

| # | Cause | Where |
|---|---|---|
| D1 | Opportunity was NASA's **low-poly MER-B GLB**: 3,845 triangles, flat colours, no textures, 17% short. It had no separate parts, only material groups | `MarsRover.cs` |
| D2 | The vehicle you drive was built from **Unity primitive cubes and cylinders**, so its wheels were black cylinders | `BuildExpeditionRover` |
| D3 | **The terrain had no normal map.** Balanced draws a 2 m mesh, so the DTM's 1 m relief was lost. Its only shade was a 1 m grayscale image multiplied by a dark tint, and the detail-map slot was taken by the traverse overlay | `MarsTerrain.cs`, `MarsPrototypeBuild.cs` |
| D4 | **No rocks or small-scale ground detail anywhere** | — |
| D5 | **Lighting.** The direct beam was attenuated correctly (`exp(−τ·m)` ≈ 34% at τ = 0.9). The sky's diffuse light, which carries most of the energy lost from the beam on a dusty Mars, was modelled as a flat ambient of about 0.15. So shadowed faces were nearly black | `ApplySun` |
| D6 | **Dust particles had no texture**, so they rendered as orange squares. There was no distance haze | `MakeDust` |
| D7 | **Camera.** It sat 9 m back with a 55° FOV, so Opportunity appeared as a small dark object | explorer camera |

## 2. What changed (and on what data)

**Opportunity (D1): NASA's articulated MER model.**
- **Source:** `Mars Exploration Rover - Spirit and Opportunity.blend` from NASA 3D Resources (`nasa/NASA-3D-Resources`, GitHub).
- **Conversion:** `scripts/mars/blender_export_mer.py`, run in Blender 5.3 from the official build, SHA-256 verified, exports it to FBX.
- **Parts:** 40 rendered parts, each with NASA's own name and pivot:
  - six wheels and their axles;
  - rocker and bogie links;
  - five solar-panel sections;
  - the arm (mount, base, two joints, wrist, instrument turret);
  - the Pancam mast assembly (base, neck, head, camera);
  - the high-gain antenna and its gimbal arm;
  - the body.
- **Textures:** NASA's 1024² textures, plus the model's packed tangent-space normal maps. Those maps were in the file but not connected; they are now.
- **Scale:** calibrated so the solar-panel span is 2.25 m (PDS). The model then measures 1.43 m tall against PDS 1.54 m (−7%) and 1.65 m long against 1.51 m. The extra length is the stowed arm.
- **Inspection:** highlighting applies to NASA's named part groups: panels, suspension, mast, arm, high-gain antenna, body. There are no invented hotspots.
- **Replay:** the wheels turn with the distance driven, using the PDS wheel radius of 0.13 m.
- **Dust coating:** ILLUSTRATIVE (20% toward a dust colour).

**Terrain (D3): data from the same HiRISE stereo pair, USGS controlled versions.**
- **Generator:** `scripts/mars/victoria_surface.py`. It reads only small windows of USGS cloud-optimised GeoTIFFs over HTTP.
- **Registration:** the existing terrain was measured against the controlled DTM `DTEEC_001414_1780_001612_1780_U01` by phase correlation of their high-pass relief. Offset: 0.51 m west and 0.53 m north. Relief residual: 0.26 → 0.12 m RMS.
- **Ground shade at 0.5 m/px:** from the 25 cm `PSP_001414_1780_RED_A_01_ORTHO`, twice the previous resolution. It shows Victoria's real capes and bays, the central dune field, wind streaks and bright Burns-formation outcrop. Deep shadows in the image are kept dark rather than filled. The colour ramp is ILLUSTRATIVE, because HiRISE RED is a single band.
- **Normal map at 1 m:** computed from the DTM itself, relative to the render mesh's 3×3 smoothed surface. The Balanced 2 m mesh therefore shows the measured 1 m relief, without counting the slope twice.

**Rocks (D4): data-driven placement, illustrative shapes.**
- **Placement:** 88,796 cobbles, outcrop slabs and boulders, placed where HiRISE shows bright outcrop and where the DTM is steep. This matches Meridiani's geology: rock-poor plains and exposed outcrop along the rim.
- **Near the camera:** a deterministic clast scatter, driven by a 2 m surface-brightness mask.
- **Shapes:** procedurally varied meshes per category: layered outcrop slabs, angular boulders, rounded cobbles, small dark clasts. Neighbouring rocks never repeat a shape.
- **Rendering:** GPU-instanced, about 7.7k instances in about 30 draw calls.
- **Labelling:** individual rock shapes are ILLUSTRATIVE, since they are below the DTM's 1 m resolution.

**Lighting and atmosphere (D5, D6): physically motivated, labelled illustrative where not sourced.**
- **Direct light:** the existing Beer–Lambert extinction. The Sun's position is still Mars24 for the scene date.
- **Diffuse light:** 75% of the light scattered out of the beam reaches the ground (forward-scattering dust; ILLUSTRATIVE fraction). It is applied as a warm sky, horizon and ground ambient.
- **Haze:** linear distance fog in the sky's horizon colour.
- **Dust:** soft round motes at low opacity.
- **Tuning:** the look (Sun, fill, exposure, haze, bloom threshold) can be changed from React at runtime (`SetLook`), so the presentation can be adjusted without rebuilding the player.

**Expedition vehicle (D2): still ILLUSTRATIVE, not a NASA design, but no longer primitive.**
- cleated brushed-aluminium wheels with hubs and spokes;
- rocker-bogie links between the real pivot points, with a differential bar;
- a solar deck with a cell-grid texture (illustrative layout);
- gold-foil side blankets;
- a stereo camera head;
- a parabolic dish.

**Camera (D7):** 7.5 m back, 50° FOV, lower pitch.

**The traverse overlay** is now a subtle tint, about ×1.45 at the centre of the track.

## 3. Before → after

| View | Before | After |
|---|---|---|
| Crater overview | `abandoned-but-not-forgotten/m05_mars_arrival_descent.png` | `after_01_crater_overview.png` |
| Wide landscape | `abandoned-but-not-forgotten/m06_mars_surface_explore.png` | `after_02_wide_landscape.png` |
| Expedition vehicle | `abandoned-but-not-forgotten/m06_mars_surface_explore.png` | `after_03_expedition_rover_medium.png` |
| Ground level | — | `after_04_ground_level.png` |
| Opportunity, medium | `abandoned-but-not-forgotten/m07_approach_opportunity.png` | `after_05_opportunity_medium.png` |
| Opportunity close-up (Pancam mast) | — | `after_06_opportunity_closeup_mast.png` |
| Wheels and rocker-bogie | `abandoned-but-not-forgotten/m11b_inspect_rocker_bogie.png` | `after_07_wheels_rocker_bogie.png` |
| Solar array | `abandoned-but-not-forgotten/m11_inspect_solar_array_highlight.png` | `after_08_solar_array.png` |
| Instrument arm | — | `after_09_instrument_arm.png` |
| High-gain antenna | — | `after_10_high_gain_antenna.png` |

## 4. Performance (Balanced, Intel Arc iGPU, Chrome, 1366×768, measured in the app)

| | Before | After |
|---|---|---|
| Frame time p50 / p95 | 17 / 17 ms | **17 / 23–26 ms** (vsync cap 60 fps; the 30 fps gate passes) |
| Draw calls | 155 | 423–497 |
| Triangles (all passes) | 0.22 M | 6.1–6.2 M (terrain 0.98 M; rocks; the MER model; shadows) |
| Rock instances / draw calls | — | about 7.7k / about 30 |
| Player `.data` (uncompressed) | 34.6 MB | 47.9 MB |
| Player total (uncompressed) | 93 MB | 100 MB |
| Load to ready (fresh browser, localhost) | about 14 s | about 22 s |
| Console errors | 0 | 0 |

**Not measured:** GPU memory (the browser doesn't expose it), the WASM heap after the change, and the High and Ultra profiles in the app.

## 5. Regression

- `abandoned_journey_check.py`: **42/42**. Covers WASD and arrow separation, discovery, inspection, replay, exact return to present, and the Moon.
- `controls_check.py`: **27/27**.
- Unit tests: **246/246**.

## 6. Still open

1. **Colour.** The ground colour is a ramp over the single RED band. HiRISE IRB is false colour and Pancam calibrated colour is not used, so true colour is not sourced.
2. **The expedition vehicle** is a better illustrative model, not an engineering reconstruction (it represents no real vehicle).
3. **The MER model's own limits.** NASA's model does not separate Navcam, Hazcams or the four arm instruments (APXS, Mössbauer, MI, RAT) into individual parts: the turret is one part. Splitting them would mean inventing geometry.
4. **Sub-metre terrain detail** comes from the 0.5 m image and the instanced rocks, not from measured relief.
5. **Compression and memory.** Brotli serving (C3) is not enabled, and the High/Ultra memory budget (C2) has not been re-measured.
