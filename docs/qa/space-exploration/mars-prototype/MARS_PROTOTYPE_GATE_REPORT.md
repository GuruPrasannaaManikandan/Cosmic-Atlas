# Mars Prototype — Stage 2 Gate Report

**Date:** 2026-11-10
**Build under test:** `unity/CosmicAtlas/Builds/MarsPrototype` (Unity 6000.3.28f1, URP 17.3, WebGL2). The log says `Result: Success`, with 0 errors and 22 warnings (`Builds/logs/mars_build_1.log`).
**Scene:** `Assets/CosmicAtlas/Scenes/MarsPrototype.unity`, which shows the Victoria crater DTM tile, the MER-B model, the Mars24 Sun, a τ-driven sky and four quality profiles.
**Gates:** from `docs/space-exploration/FINAL_VISUAL_REALISM_SPEC.md` §2.1.
**Harness:** `scripts/e2e/mars_prototype_benchmark.py`, which uses Playwright Chromium 151.0.7922.34. Frame timing comes from Unity itself through `MarsBridge.jslib` (`window.__mars`).

## Reference machine (verified)

| Item | Spec §2.1 | This machine |
|---|---|---|
| CPU | Intel Core Ultra 7 155H | Intel Core Ultra 7 155H |
| GPU | Intel Arc iGPU | Intel Arc Graphics. WebGL reports `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| RAM | 15.6 GB | 15.6 GB |
| Display | — | 60 Hz |

## Runs

| Run | Command flags | Result file | Status |
|---|---|---|---|
| Headless, vsync | (default) | `benchmark_headless.json` | **RUN** |
| Headed, vsync | `--headed` | `benchmark_headed.json` | **RUN** |
| Headed, uncapped | `--headed --uncapped` (adds `--disable-gpu-vsync --disable-frame-rate-limit`) | `benchmark_headed_uncapped.json` | **RUN** |
| Headless, uncapped | — | — | NOT RUN (the headed uncapped run is the more representative of the two) |

**Run details:**
- 1366 × 768 viewport.
- 60 s scripted camera path per profile.
- Profile order: Balanced, Performance, High, Ultra.
- Then 10 profile switches.

The screenshots in this folder (`*_overview.png`, `*_rover.png`, `load_balanced.png`) were written by the **last** run (headed, uncapped).

> **Earlier attempt:** the previous session's headless run left screenshots but never wrote `benchmark_headless.json`, so its numbers were lost. All the numbers below come from the three runs made on 2026-11-10 in this session.

## Gate results

| Gate (threshold) | Headless | Headed | Headed uncapped | Verdict |
|---|---|---|---|---|
| Balanced fps p50 ≥ 30 | 58.8 | 58.8 | **250.0** | **PASS** |
| Balanced fps p5 ≥ 24 | 55.6 | 58.8 | **200.0** | **PASS** |
| First-scene download ≤ 40 MB (Brotli q11) | 31.45 MB (29.99 MiB) | same build | same build | **PASS** (see caveat 3) |
| WASM heap ≤ 512 MB after load and after 10 switches | 239 / 495 MB | 239 / 495 MB | 239 / 495 MB | **PASS** (17 MB margin) |
| Heap stops growing after the switches | 495 = highest profile value | same | same | **PASS** |
| Load to first frame ≤ 15 s (local, `Cache-Control: no-store`) | 4.6 s | 6.4 s | 6.0 s | **PASS** |
| Terrain heights within 0.05 m at 100 random DTM nodes | max error 0.60 mm | — | — | **PASS** |
| Sun direction within 0.1° of Mars24 | see `SCIENTIFIC_VERIFICATION_REPORT.md` | — | — | **PASS** (unit tests plus cross-implementation readback) |
| Console errors | 0 | 0 | 0 | **PASS** |

## Per-profile measurements

### Headed, uncapped (real per-frame cost)

| Profile | fps mean | fps p50 | fps p5 | ms p50 / p95 / p99 / max | Draw calls | Terrain tris (LOD0) | Heap |
|---|---|---|---|---|---|---|---|
| Performance | 322.7 | 333.3 | 250.0 | 3 / 4 / 5 / 10 | 128 | 271,068 | 239 MB |
| **Balanced** | 270.7 | 250.0 | 200.0 | 4 / 5 / 6 / 30 | 134 | 979,844 | 239 MB |
| High | 131.9 | 142.9 | 76.9 | 7 / 13 / 15 / 50 | 251 | 3,709,546 | 495 MB |
| Ultra | 93.8 | 100.0 | 55.6 | 10 / 18 / 26 / 75 | 279 | 3,709,546 | 495 MB |

### Headed, vsync on (what a user sees on a 60 Hz display)

| Profile | fps mean | fps p50 | fps p5 | ms p50 / p95 / p99 / max |
|---|---|---|---|---|
| Balanced | 60.0 | 58.8 | 58.8 | 17 / 17 / 17 / 18 |
| Performance | 60.0 | 58.8 | 58.8 | 17 / 17 / 19 / 20 |
| High | 59.1 | 58.8 | 52.6 | 17 / 19 / 33 / 36 |
| Ultra | 55.7 | 58.8 | **30.3** | 17 / **33** / 34 / 37 |

The headless vsync run held 60 fps at every profile: p50 is 17 ms and p95 is 18 ms throughout. It cannot tell the profiles apart.

## Caveats (read before quoting the numbers)

1. **Frame times are whole milliseconds.** Unity reports every frame time in whole ms. The fps percentiles are therefore buckets: 3 ms = 333, 4 ms = 250, 17 ms = 58.8. The uncapped figures are accurate to ±1 ms per frame.
2. **Vsync runs only show a floor.** At 60 Hz, a vsync run only proves that a frame finishes inside 16.7 ms. Use the uncapped table for headroom.
3. **The 40 MB figure is computed, not served.** The script computes the Brotli size itself at quality 11. The build is **uncompressed**: `index.html` loads `MarsPrototype.data` and `.wasm`, 88.6 MiB raw. To meet the download gate in production, the build or the host must actually serve Brotli. That isn't configured yet.
4. **WASM memory never shrinks.** WebAssembly memory can't be returned once allocated. Opening High or Ultra once raises the heap to 495 MB for the rest of the session. That is 3.3% under the 512 MB gate, and any new asset in the scene will push it over.
5. **The floating origin was never exercised.** The overlay reports `floating-origin rebases: 0`. The 60 s path stays within 1 km of the origin, so the rebasing code (`MarsPrototype.cs:248–250`) ran but never fired.
6. **One machine, one browser.** Only this machine, Chromium and D3D11 were tested. Firefox, Safari, mobile, a discrete GPU and a remote, non-local download are NOT RUN.
7. **Not yet embedded in the app.** The prototype runs on its own, not inside the React shell. The cost of running it next to the existing Three.js canvas, which means two WebGL contexts, is NOT MEASURED.

## Visual defects found in the screenshots

The numeric gates do not detect these.

| # | Defect | Evidence | Severity |
|---|---|---|---|
| V1 | The traverse overlay swamps the rover close-up. It is a flat, unlit, cyan 0.6 m ribbon (`LineRenderer`, `MarsPrototype.cs:125–130`), and in the low rover shot it covers much of the foreground. It was also present in the committed screenshot, so this is not a regression. | `*_rover.png` | High for presentation, none for the gates |
| V2 | The rover reads poorly in the close-up. Its dark solar-panel deck (about 2.25 × 1.51 m) looks like a flat slab, and the low-poly model (3,845 triangles, one node) shows no wheels or detail at this distance | `*_rover.png` | Medium: needs the `.blend` conversion |
| V3 | In the overview, the route line breaks up into dashes along the far rim, probably because the terrain LODs hide it | `*_overview.png` | Low |
| V4 | The rover model is 17% short (1.28 m vs PDS 1.54 m) because it is scaled to its footprint. This is disclosed on screen. | overlay text | Known, documented |

## Verdict

**All Stage 2 performance and correctness gates PASS on the reference machine, with evidence in this folder.** Balanced has about 6× headroom against its 30 fps gate: 4 ms p50 against a 33 ms budget. Two concerns go into the renderer decision:
- the memory margin on High and Ultra (caveat 4);
- the Ultra frame drops under vsync (p5 30.3 fps).
