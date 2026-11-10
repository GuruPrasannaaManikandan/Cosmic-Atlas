# Graphics Performance Report and Renderer Decision (Stage 2)

**Date:** 2026-11-10.
**Evidence:**
- `docs/qa/space-exploration/mars-prototype/MARS_PROTOTYPE_GATE_REPORT.md`
- `benchmark_headless.json`, `benchmark_headed.json`, `benchmark_headed_uncapped.json` (same folder)

**Machine:** the spec §2.1 reference machine (Core Ultra 7 155H, Intel Arc iGPU, 15.6 GB, Chromium on D3D11, 60 Hz).

## 1. Measured cost per quality profile

These figures come from the headed, uncapped run at 1366 × 768, over a 60 s scripted path on the Victoria DTM tile with the MER model, the sky and airborne dust. Frame times are reported in whole milliseconds.

| Profile | Render scale | Terrain tris (LOD0) | Draw calls | Frame ms p50 / p95 / p99 | fps p50 | Gate | Meets 60 Hz? | Heap |
|---|---|---|---|---|---|---|---|---|
| Performance | 0.70 | 271,068 | 128 | 3 / 4 / 5 | 333 | ≥ 45 p50: **PASS** | yes | 239 MB |
| **Balanced** | 0.85 | 979,844 | 134 | 4 / 5 / 6 | 250 | ≥ 30 p50 and ≥ 24 p5: **PASS** | yes | 239 MB |
| High | 1.00 | 3,709,546 | 251 | 7 / 13 / 15 | 143 | measured | mostly. The vsync run drops frames: p99 33 ms | 495 MB |
| Ultra | 1.00 | 3,709,546 | 279 | 10 / 18 / 26 | 100 | measured | **no**. The vsync run gives p5 30.3 fps and p95 33 ms | 495 MB |

**What costs what:**
These settings are what `MarsPrototype.ApplyProfile` applies; the values come from `mission-data/quality-profiles.json`.
- Going from Balanced to High means native terrain spacing (3.8× the triangles), twice the draw calls, full render scale, MSAA 2× and SSAO. That adds about 3 ms at p50 and about 8 ms at p95, and **doubles the WASM heap**: 239 MB becomes 495 MB.
- Going from High to Ultra adds MSAA 4× with SMAA, a larger shadow map and more sky ray-march steps. That adds about 3 ms at p50 and about 11 ms at p99.
- **The prototype sky is a ray-march, not the precomputed lookup tables described in spec §4.** The lookup tables are still planned.

## 2. Download and load

| Item | Value |
|---|---|
| Build, raw | 92,886,996 bytes (88.6 MiB). Of that, `.data` is 34.5 MB and `.wasm` is 57.9 MB |
| Build, Brotli quality 11 (computed by the script) | 31,447,134 bytes (29.99 MiB). **Gate is ≤ 40 MB: PASS** |
| Served today | **Uncompressed.** Brotli has to be turned on in the build or on the host before the gate holds in production |
| Load to first frame (local server, cold) | 4.6 s headless; 6.0–6.4 s headed. **Gate is ≤ 15 s: PASS** |

## 3. Renderer decision (closes `FINAL_VISUAL_REALISM_SPEC.md` §2)

**Decision: CONFIRMED. Unity 6.3 LTS with URP 17.3 on WebGL2 is the renderer for Mars surfaces and hardware inspection.** The R3F fallback is not triggered.

**Reasons:**
1. Every §2.1 gate passes on the reference machine in three independent runs, with 0 console errors.
2. Balanced runs at 4 ms p50 against its 33 ms budget, about 6× headroom. That leaves room for the Stage 3 content: more terrain, routes, the EDL hardware and the inspection UI.
3. Terrain readback error is 0.6 mm against a 50 mm gate. The Sun matches the independent Mars24 implementation to every printed digit.

**Conditions attached to the decision:**

| # | Condition | Why | When |
|---|---|---|---|
| C1 | **The default on an integrated GPU is Balanced.** High is opt-in. Ultra is for discrete GPUs only | Ultra drops to p5 30 fps under vsync on the iGPU. High shows p99 33 ms spikes | Before Stage 3 ships |
| C2 | **Memory budget.** Bring High and Ultra below about 450 MB, or don't load native-spacing terrain on an iGPU | High and Ultra reach 495 MB of the 512 MB budget. WASM memory never shrinks, so one visit to High uses up the margin for the whole session | Stage 3, before more assets are added |
| C3 | **Serve Brotli** (Unity "Compression Format: Brotli" with decompression fallback, or compression at the host) | The 40 MB gate is only met when the build is served compressed | Before the build is deployed |
| C4 | **Measure inside the React shell.** Run the benchmark with Unity embedded through `AtlasBridge.jslib` next to the Three.js canvas | The embedded cost is NOT MEASURED (two WebGL contexts, shared GPU) | Stage 3, during integration |
| C5 | **Extend the camera path past 1 km** so the floating origin actually rebases during a benchmark | It recorded 0 rebases. The code is untested in practice | Stage 3 |
| C6 | **Cross-browser and device pass** on Firefox, Safari / WebKit, a tablet and a discrete GPU | Only Chromium on D3D11 was tested | Stage 7 (optimisation), or earlier if users need it |

**The Moon is unchanged.** It stays on the production R3F / Three.js renderer, as the spec says. A port is reconsidered only in Stage 6, with measurements.
