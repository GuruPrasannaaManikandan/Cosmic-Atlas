# Cosmic Atlas: Milestone 2 Validation (WebGL production build, black hole, nebula, quality tiers)

**Date:** 2026-11-09
**Branch:** `feat/universal-realism-ui-travel`
**Software:** Unity 6000.3.28f1, URP 17.3.0
**Machine:** Intel Core Ultra 7 155H, Intel Arc iGPU, 15.6 GB RAM, Windows 11
**Browser:** Playwright Chromium 151.0.7922.34, ANGLE → Direct3D 11

Scope: the validation pass requested after Milestone 2. **No new feature was started.** Unity is **not** integrated into the React site, and the Render deployment was not touched.

## 0. Verdict

| Item | Result |
|---|---|
| 1. WebGL production build | **Succeeded, exit code 0**, 0 errors, 20 warnings (all URP Terrain shaders, which are not used). Final size **81,190,147 bytes (77.4 MiB), uncompressed**. |
| 2. Custom WebGL template in Chromium | **Passes.** `AtlasMinimal` loads in 5.0 s headless and 5.9 s headed. The no-WebGL path shows its message. |
| 3. JS ⇄ Unity communication | **Passes in both directions.** All 40 station × tier combinations round-trip. Malformed input is ignored safely. |
| 4. Catalogue survives IL2CPP stripping | **Passes.** Schema 1; 8 element sets, 9 poles, 8 radii, 6 ring bands, 79 objects, 54 solar bodies; Earth elements deserialised. |
| 5. Dynamically loaded shaders in the build | **Passes.** `Shader.Find` resolves all 9 runtime shaders inside the player (`missingShaders: []`). |
| 6. High-frequency nebula detail | **Restored** to the level of the old procedural version. Medium costs 12.9 ms vs 124 ms before. |
| 7. Black-hole bending across trajectories | **Fixed and validated.** Validation found two real defects (§3). Every trajectory tested (b = 40 down to 2.6 r_s, deflection up to 2.2π) is within 0.3% of the exact Schwarzschild integral at every tier. |
| 8. Shadow, photon rings, disk vs reference | **Pass.** Shadow edge within 0.001%. Rings n = 1 and n = 2 within 0.3% of b − b_c. Disk g-factors exact. Pixel check in the rendered image: ring at 90 ± 1 px vs predicted 89.1–91.9 px. |
| 9. Low / Medium / High / Ultra | All four tested in the Editor (timing + screenshots) and in WebGL (all stations, headless and headed). |
| 10. Before/after screenshots and performance | §4–§6; files under `docs/unity-m2/`. |
| Regression | All green: .NET core 22/22, Unity EditMode 49/49, PlayMode 2/2, Vitest 116/116, pytest 12/12, Travel/Explore e2e 18/18, layout audit 14/14. |

**Browser integration status:** an actual production WebGL build loaded in Chromium and passed the bridge tests (10/10 checks, twice). This is a **standalone** page served locally. Integration into the live React website has **not** been done, by design.

## 1. WebGL production build

| Build | Template | Exit | Result | Time | Notes |
|---|---|---|---|---|---|
| #1 (started before the template setting existed) | Unity default | **0** | Succeeded, 0 errors | 11 min 57 s (cold IL2CPP) | Superseded |
| #2 (clean output folder) | AtlasMinimal | **0** | Succeeded | 87 s wall (incremental) | Shader fixes |
| #3 | AtlasMinimal | **0** | Succeeded | 348 s wall (C# changed → IL2CPP) | Bridge diagnostics, input hardening |
| **#4 (final, tested)** | AtlasMinimal | **0** | **Succeeded, 0 errors** | 17 s wall | Inline favicon (fixed a 404) |

Command: `Unity.exe -batchmode -projectPath A:\CA\unity\CosmicAtlas -executeMethod CosmicAtlas.Rendering.Editor.WebGLBuild.Build -outDir A:\CA\unity\CosmicAtlas\Builds\WebGL -logFile …`. `WebGLBuild` exits with code 0 on success, 1 on build failure and 2 on exception.

### Build size (final)

| File | Bytes |
|---|---|
| `Build/WebGL.wasm` | 56,206,082 |
| `Build/WebGL.data` | 24,495,870 |
| `Build/WebGL.framework.js` | 458,814 |
| `Build/WebGL.loader.js` | 26,983 |
| `index.html` | 2,398 |
| **Total** | **81,190,147 (77.4 MiB)** |

- The build is **uncompressed**, deliberately for local testing (no server Content-Encoding needed). A production host should use Brotli. Compressed size was **not measured**.
- Settings:
  - IL2CPP;
  - managed stripping *Minimal*, plus `link.xml` preserving `CosmicAtlas.Astro` and `CosmicAtlas.Rendering`;
  - linear colour, WebGL 2 only;
  - 512 MB initial memory;
  - exceptions: explicitly thrown only.
- **`ExitCode: 4` lines in build #1's log** are `bee_backend` reporting "Require frontend run … dag couldn't be loaded". That is Unity's build-graph cache miss, after which it regenerates the graph and continues. It is not a failure: the build reported `Result: Success` and the process exited with 0.
- **20 warnings** are all "Shader Unsupported: Universal Render Pipeline/Terrain/Lit" (URP package shaders, no terrain in this project). None concern the project's shaders.

## 2. Chromium verification (`scripts/e2e/unity_webgl_check.py`)

Served by `scripts/e2e/serve_unity_webgl.py` (`application/wasm`, no-store) at `http://127.0.0.1:8091`. The renderer string is `ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)`.

| Check | Headless (uncapped) | Headed (vsync) |
|---|---|---|
| Template loads, `window.unityInstance` created, no `__atlasError` | PASS (5.0 s) | PASS (5.9 s) |
| Unity → JS: `AtlasReportReady` → `window.__atlas.ready`, `stationCount = 10`, device, auto tier | PASS | PASS |
| Unity → JS: `AtlasReportFrame` frame statistics | PASS | PASS |
| JS → Unity: `SelectFromJs` + `SetQualityFromJs`, Unity's next report echoes station **and** tier (40/40) | PASS | PASS |
| Robustness: `SetQualityFromJs('Bogus')`, `SelectFromJs('x,y')`: ignored with a `[Bridge]` warning, frames continue | PASS | PASS |
| Shaders: `Shader.Find` inside the player for all 9 runtime shaders → `missingShaders: []` | PASS | PASS |
| Catalogue after IL2CPP stripping: all collections populated, Earth elements present | PASS | PASS |
| All 10 stations built | PASS | PASS |
| No console errors / uncaught exceptions | PASS (0) | PASS (0, after the favicon fix) |
| Failure path: Chromium with WebGL disabled → "This 3D view needs WebGL 2 …" and `__atlasError` set | PASS | PASS |

Reports: `docs/unity-m2/webgl/webgl_report.json` and `docs/unity-m2/webgl/headed_vsync/webgl_report.json`.

Screenshots:
- `webgl_NN_<Station>_Medium.png` for every station;
- `webgl_0{3,4,5}_{Earth,BlackHole,Nebula}_{Low,High,Ultra}.png`;
- `webgl_failure_path_no_webgl.png`.

### Memory (WebGL, measured)

| Quantity | Value |
|---|---|
| WASM heap (`HEAPU8.length`) | **166 MB**. Constant from load through all 40 station × tier switches, so no heap growth was observed. |
| JS heap used (`performance.memory`) | 38 MB after load, 38–52 MB during the run, 48 MB at the end |
| Download | 81.2 MB uncompressed (see §1) |

## 3. Black hole: validation across trajectories

### Reference calculations (independent of the shader)

- **Exact Schwarzschild deflection** for a ray starting at radius r₀ with impact parameter b. With u = 1/r, u′² = C − u² + u³, where C = 1/b² − u₀³:
  α = 2∫₀^{u_t} du/√F − ∫₀^{u₀} du/√F − (π − asin(b u₀)).
  It is evaluated by Simpson's rule with a substitution that removes the turning-point singularity.
- Cross-checks of the reference itself: the weak-field series 2r_s/b + (15π/16)(r_s/b)² at b = 100 (0.3%), and the Bozza (2002) strong-deflection limit at b/b_c − 1 = 10⁻³ and 10⁻⁴ (within 0.004 rad).
- `BlackHoleValidationTests.cs` (25 tests) compares a line-for-line C# replica of the shader loop against these references, for each tier's step budget. The tests pass in Unity and in a standalone .NET run.

### Defects found (the earlier "one weak-field test" had hidden both)

1. **The shader committed in M2 (97273f1) renormalised the ray velocity every step**, while its test integrator did not. The test therefore never described the shader. In the rendered M2 image the shadow measures **> 140 px instead of 89 px, about 55% too large** (`validation/before/blackhole_edge_on.png`).
2. **Even without renormalisation, Cartesian Verlet (dt = 0.1 r) failed the new trajectory tests:**
   - The weak-field exit formula distributed the bend like a 1/r² force. The shader's force is (3/2)h²/r⁴, whose partial-path integral is (1 − 1.5x + 0.5x³)/b. Errors were +1% to +10% for b = 6 to 25.
   - Strong-field rays lost accuracy around the photon sphere: −8% at b = 2.62, and shadow edge 2.5870.

**Fix:** the rays now integrate the exact orbit equation u″ = 1.5u² − u **in the polar angle φ with classical RK4**, in each ray's orbital plane. Integration ends at u ≥ 1 (horizon) or at u = 0, the exact outgoing asymptote, so integrated rays need no weak-field patch. Rays with b > 25 r_s use the corrected analytic formula. Δφ = clamp(13/steps, 0.06, 0.2). This change also **reduced** step counts (24–84 steps at Medium vs 35–104).

### Results (Medium tier; all four tiers are in the test output)

| b (r_s) | Kind | Exact α (rad) | Shader α | Error |
|---|---|---|---|---|
| 40 | analytic shortcut | 0.04927 | 0.04931 | +0.10% |
| 25.5 | analytic shortcut | 0.08261 | 0.08237 | −0.29% |
| 24.5 | integrated | 0.08631 | 0.08629 | −0.02% |
| 15 | integrated | 0.14805 | 0.14803 | −0.01% |
| 10 | integrated | 0.23604 | 0.23606 | +0.01% |
| 6 | integrated | 0.45254 | 0.45254 | 0.00% |
| 4 | integrated | 0.85867 | 0.85869 | 0.00% |
| 3 | integrated | 1.71926 | 1.71923 | 0.00% |
| 2.7 | ≈ 0.93π | 2.91895 | 2.91893 | 0.00% |
| 2.62 | ≈ 1.4π | 4.39402 | 4.39399 | 0.00% |
| 2.6 | ≈ 2.2π, winds round the photon sphere | 6.78820 | 6.78769 | −0.01% |

Additional results:
- **Worst case at any tier:** +0.10% for integrated rays (Low, b = 15) and −0.29% for the analytic shortcut.
- **From the showcase camera** (r = 36.14, inside the proxy): b = 20, 5 and 2.8 are all within 0.003%. For b = 20, the observer-at-infinity value differs by 2.3%. That difference is real and is correctly *not* applied.
- **Capture vs escape:**
  - The shadow edge is b_c = 2.59800 / 2.59801 / 2.59801 / 2.59803 at Low / Medium / High / Ultra. The exact value for this start radius is 2.59803 (2.59808 at infinity).
  - b = 0.5, 1.5, 2.4 and 2.59 are captured; b = 2.61, 2.7 and 3.5 escape, at every tier.
- **Photon rings:**

  | Ring | Exact b − b_c | Shader at Medium / High / Ultra | Shader at Low |
  |---|---|---|---|
  | n = 1 (α = π) | 8.040 × 10⁻² | identical | identical |
  | n = 2 (α = 2π) | 3.264 × 10⁻³ | 3.263 / 3.264 / 3.264 × 10⁻³ | 3.255 × 10⁻³ |

  Every tier completes rays down to b/b_c − 1 ≈ 2 × 10⁻⁵, so both rings are resolved without step-budget truncation.
- **Accretion disk:**
  - Redshift for emission perpendicular to the orbit equals √(1 − 1.5/r) to 10⁻¹² at r = 3, 5, 10 and 14.
  - At the ISCO, g_max = √2 and g_min = 0.4714, exactly the analytic values. The bolometric beaming ratio is 81.
  - The Shakura–Sunyaev temperature peaks at (49/36) r_in.
- **In the rendered image** (camera 36.14 r_s, 40° vertical FOV, 900 px high): the bright photon-ring peak sits at **90 ± 1 px** from the centre. The predicted values are shadow edge 89.1 px, n = 2 ring 89.2 px and n = 1 ring 91.9 px.

Known simplification (unchanged and stated): directions at the camera are taken in the orbit-equation coordinates, not a static observer's local frame. At r = 36 this enlarges apparent angles by about 1.4% (89.1 px vs 87.9 px). There is no spin (Kerr).

## 4. Nebula: high-frequency detail restored, performance kept

| | Medium cost | Fine-detail energy, wide view (band-pass RMS / mean, 4 px / 10 px) | Inside view (4 px / 10 px) |
|---|---|---|---|
| Before: M2 procedural fbm (97273f1) | 124.0 ms | 5.80% / 8.09% | 2.04% / 2.23% |
| Texture-only optimisation (single fetch) | ≈ 12 ms | visibly smooth (not separately archived) | — |
| **After: 64³ baked noise + 2 zero-mean detail fetches** | **12.9 ms** | **5.51% / 7.99%** | **2.08% / 2.60%** |

- The 64³ volume resolves only about 3 octaves. Two zero-mean detail fetches, at about 4× and 16× the base frequency, restore the old 6-octave spectrum's high octaves at comparable amplitude. Cost: 2 texture reads per step.
- **A defect was also fixed (it pre-dated the optimisation):** the column-stretch direction used the *hard* nearest ionising star. That made straight creases on the planes midway between stars, visible in both the 97273f1 and optimised images. It now uses a luminosity-weighted direction with a coherence factor, which is continuous.
- Images: `captures/nebula_wide.png` and `captures/nebula_inside.png` (after); `validation/before/nebula_*.png` (before).

## 5. Quality tiers and performance

### Unity Editor, GPU-synchronised

Batch mode, 1600×900, first viewpoint. Median of 7 rounds × 10 renders, each round synchronised by a GPU readback (`captures/capture_report.json` also has the minima). Before = M2 baseline (`timing_report_medium_capture.json`, mean of 12 renders).

| Station | Low before → after | Medium before → after | High before → after | Ultra before → after |
|---|---|---|---|---|
| Black hole | 33.1 → **7.1** | 38.4 → **6.6** | 37.9 → **9.3** | 33.8 → **15.6** |
| Nebula | 97.0 → **11.8** | 124.0 → **12.9** | 168.7 → **32.4** (min 18.8) | 217.4 → **24.2** |
| Earth (atmosphere) | 9.9 → 7.6 | 11.4 → 7.3 | 13.5 → 5.3 | 13.7 → 11.2 |
| Stars | 7.8 → 5.0 | 7.1 → 5.1 | 7.3 → 3.6 | 6.5 → 5.2 |
| Galaxies | 3.0 → 4.2 | 3.5 → 5.6 | 5.7 → 3.8 | 10.1 → 8.5 |
| Jupiter / Moons / Pulsar / Small bodies / Comet | 2.7–6.9 → 4.2–4.7 | 3.0–6.9 → 2.8–5.2 | 3.2–7.1 → 2.8–4.7 | 2.8–6.0 → 2.6–5.5 |

- The integrated GPU changes clock speed during a run, so **comparisons across tiers within one run are approximate.** For example, High Nebula's rounds ranged 18.8–43.9 ms. The before/after factors (5–10× for the black hole and nebula) are far outside that noise.
- Every exhibit is now under 16.7 ms at Low and Medium on this GPU at 1600×900. The nebula at High and Ultra is not.

### WebGL in Chromium (production build, 1366×768, Unity's own frame time)

- **Headed, vsync (frames really presented):** every one of the 40 station × tier combinations has a median of **16.67 ms (locked 60 fps)**. The worst 30-frame average after warm-up is 18.9 ms.
- **Headless, uncapped:** medians of 1.1–11.1 ms, worst Ultra Nebula 11.1 ms and Ultra Galaxies 9.0 ms. This is the CPU-side frame interval without presentation. GPU work is pipelined, so it is a throughput figure, not a GPU cost. For example, headless Medium Black Hole (1.2 ms) is lower than Low (3.1 ms).
- The Editor table above is the GPU-cost reference.
- On the web, auto-selection picks **Low**, as designed.

Per-tier Editor screenshots are in `captures/tiers/{Low,Medium,High,Ultra}_{blackhole_edge_on,nebula_wide,earth_terminator}.png`. WebGL per-tier screenshots are in `webgl/`. Black-hole images are visually identical across tiers, as the tests predict. Tiers change the nebula's step count and the Earth atmosphere's sample count.

## 6. Regression

| Suite | Result |
|---|---|
| .NET astronomy core (`unity-migration`) | **22/22** |
| Unity EditMode | **49/49** (`unity_EditMode_results.xml`): 24 existing tests + 25 new black-hole validation tests. The two Verlet-replica tests were removed because the validation suite supersedes them. |
| Unity PlayMode | **2/2** (`unity_PlayMode_results.xml`): every station × viewpoint × tier runs with no errors; the pulsar pulses |
| Unity rendering | 28/28 viewpoints rendered, 0 black frames (`captures/capture_report.json`), including planets, moons, Earth atmosphere and simulations (Toomre interaction, comet tails, pulsar) |
| Frontend Vitest | **116/116** |
| Backend pytest | **12/12** |
| React camera navigation, Travel, autopilot (`travel_controls.py`) | **18/18** (`validation/regression_travel.json`) |
| React layout + object selection / Inspector (`layout_audit.py`, 7 viewports × Explore/Inspector) | **14/14 PASS** (`validation/layout_regression/layout_report.json`) |

## 7. Remaining defects and gaps (known, not fixed here)

1. **Nebula High/Ultra exceed a 60 fps budget in the Editor** (22–32 ms at 1600×900). They hold 60 fps in WebGL at 1366×768. A half-resolution volume pass remains the planned fix.
2. **The "α" in "Hα" is missing** in the WebGL on-screen caption, because the player's built-in IMGUI font lacks the glyph. The caption text itself is correct. The prototype UI will be replaced by React in Milestone 4.
3. **Compressed (Brotli/gzip) build size was not measured.** The download is 81 MB uncompressed. Production hosting needs compression and the matching `Content-Encoding` headers.
4. **Faint contour banding** in parts of the nebula interior where stretched coordinates sample the periodic 64³ texture. It is subtle (`captures/nebula_inside.png`, lower left).
5. **Black-hole camera frame:** directions are taken in coordinate space, not a static observer's tetrad (≈ 1.4% angular scale at r = 36). There is no Kerr spin.
6. **Headless frame times** are not GPU costs (§5). A browser-side GPU timer query (`EXT_disjoint_timer_query_webgl2`) would be needed for GPU time in WebGL.
7. **The Unity MCP bridge is still not connected.** All Unity work ran in batch mode.

## 8. Modified and new files (this pass)

**Shaders and runtime**
- `Shaders/BlackHole.shader`: φ-RK4 orbit-equation integrator, corrected weak-field formula, exposure on the proxy-miss path; `_StepScale` removed.
- `Shaders/Nebula.shader`: 3-D noise texture, 2 detail octaves, continuous stretch direction.
- `Runtime/NoiseVolume.cs` (new): baked tileable 64³ noise.
- `Runtime/Exhibits.cs`: binds the noise volume.
- `Runtime/ShowcaseController.cs`:
  - JS bridge (`AtlasReportFrame`, `AtlasReportReady` with diagnostics);
  - `RuntimeShaders` list;
  - malformed-input-safe `SelectFromJs` / `SetQualityFromJs`.

**WebGL build and template**
- `Plugins/WebGL/AtlasBridge.jslib` (new).
- `link.xml` (new).
- `Editor/WebGLBuild.cs` (new).
- `Assets/WebGLTemplates/AtlasMinimal/index.html` (new).

**Editor, tests and settings**
- `Editor/ShowcaseCapture.cs`: robust timing (7 × 10 rounds, median and minimum) and per-tier screenshots.
- `Tests/EditMode/BlackHoleValidationTests.cs` (new).
- `Tests/EditMode/PhysicsModelTests.cs`: superseded Verlet tests removed.
- `ProjectSettings/GraphicsSettings.asset`: always-included shaders.
- `ProjectSettings/ProjectSettings.asset`: WebGL player settings.
- URP and volume assets re-serialised by Unity.
- `Scenes/Showcase.unity`: re-saved by the capture.

**Scripts and docs**
- `scripts/e2e/serve_unity_webgl.py` (new) and `scripts/e2e/unity_webgl_check.py` (new).
- `docs/unity-m2/…`: this report, M2 report erratum, captures, tier images, WebGL screenshots and reports, before images, regression reports, test XML.
- `unity/.gitignore`: ignores the Performance Testing package's generated `Assets/Resources/PerformanceTestRun*`.

## 9. Recommended next milestone

Finish the remaining Milestone-2 performance items before Milestone 3:
- half-resolution nebula volume pass with depth-aware upsampling (target ≤ 16 ms at High in the Editor);
- Brotli build and served-size measurement;
- WebGL GPU timer queries in the harness.

Then start **Milestone 4's first slice in isolation**, not in the live site: a React test page (behind a dev-only route) that hosts this exact build and drives it through the now-verified bridge. The protocol would grow to selection, time and camera messages, with the same echo/robustness checks run in CI. Milestone 3 (simulations rebuilt on these systems) can proceed in parallel inside the Unity project.
