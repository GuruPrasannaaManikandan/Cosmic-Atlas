# Final Engineering and Visual Realism Directive — Stage 2 Report

**Stage:** 2, prototypes and the renderer gate on the integrated GPU.
**Date:** 2026-11-10.
**Branch:** `main` (PR #12 merged as `ff0d57c`). The Stage 2 evidence below is **not committed yet**.
**Status:** **All gates passed, with measured evidence.** Closing Stage 2 needs your approval. The partial items are listed under "Carried into Stage 3".

## Delivered against the proposed Stage 2 scope (`STAGE_1_REPORT.md`)

| # | Proposed item | Result | Evidence |
|---|---|---|---|
| 1 | Unity terrain and sky prototype on the Victoria HiRISE tile, with the MER model, Mars24 Sun, τ-driven sky, quality profiles and bridge instrumentation. Measure the gates and confirm or reverse the renderer | **Done.** All gates PASS. The renderer is **confirmed**, with six conditions | `docs/qa/space-exploration/mars-prototype/MARS_PROTOTYPE_GATE_REPORT.md`, `GRAPHICS_PERFORMANCE_REPORT.md` |
| 2 | Traverse frame fit | **Done locally.** The local registration has about 15 m RMS error. The **absolute** registration is unresolved, with a 316–335 m discrepancy | `fit_victoria.json`, `fit_traverse.json`, `SCIENTIFIC_VERIFICATION_REPORT.md` §4 |
| 3 | `.blend` evaluation | **Partial.** The file was inspected (63 named, parented objects, suitable for part-level inspection). It was **not converted** because Blender is not installed, and it was **not measured** against PDS | `blend_inspect.json`, `HARDWARE_ENGINEERING_INSPECTION.md` |
| 4 | Mars environment research: CTX and HRSC, the Lemmon τ series, dust optics, IAU radii | **Partial.** IAU radii: done (NAIF `pck00011`, used in Unity). τ archive: located, not downloaded. CTX and HRSC: not searched. Dust optics: not researched | `SCIENTIFIC_VERIFICATION_REPORT.md` §§1, 3, 6 |

## Gate summary

These are from the reference machine: Core Ultra 7 155H, Arc iGPU, Chromium on D3D11.

| Gate | Threshold | Measured | Verdict |
|---|---|---|---|
| Balanced fps | ≥ 30 p50, ≥ 24 p5 | 250 p50 / 200 p5 uncapped; 58.8 / 58.8 at vsync | PASS |
| First-scene download | ≤ 40 MB Brotli | 31.45 MB (computed; the build is served uncompressed today) | PASS (condition C3) |
| WASM heap | ≤ 512 MB, no growth | 239 MB after load, 495 MB after High/Ultra and 10 switches, then flat | PASS (17 MB margin, condition C2) |
| Load to first frame | ≤ 15 s | 4.6–6.4 s | PASS |
| Terrain heights | ≤ 0.05 m at 100 points | 0.60 mm | PASS |
| Sun direction | ≤ 0.1° of Mars24 | C# tests 3/3 at 1e-3°; scene readback identical to the TypeScript implementation | PASS |
| Console errors | — | 0 in every run | PASS |

## Validation run in this stage

| Suite | Result |
|---|---|
| Unity EditMode | 52 / 52 (MarsTime 3 / 3) |
| Frontend `tsc` and `vite build` | pass |
| Vitest | 226 / 226 |
| Backend pytest | 12 / 12 |
| Mars benchmarks | headless, headed and headed-uncapped all ran; headless-uncapped NOT RUN |
| Unity PlayMode | NOT RUN (no Mars PlayMode tests exist) |

Details are in `docs/qa/space-exploration/mars-prototype/BUILD_AND_TEST_REPORT.md`.

## Defects found

| # | Defect | Severity |
|---|---|---|
| V1 | The traverse overlay (a flat cyan 0.6 m ribbon) swamps the rover close-up | High (presentation) |
| V2 | The low-poly MER model reads poorly up close. Its height is 17% short when scaled to the PDS footprint | Medium |
| V3 | The route line breaks into dashes along the far rim | Low |
| B1 | Two `pow` warnings in the `MarsSky` shader | Low |

## Not covered (stated limits)

- Unity embedded in the React shell, and the cost of running two WebGL contexts.
- The floating origin actually rebasing: 0 rebases on the 60 s path.
- Firefox, Safari, tablets and phones, and a discrete GPU.
- A download from a remote host with Brotli actually served.
- A visual review of the sky against calibrated Pancam imagery. The sky is illustrative.

## Carried into Stage 3

1. Renderer conditions C1–C6 (`GRAPHICS_PERFORMANCE_REPORT.md` §3).
2. Fix V1 and V3. Fix V2 by converting the `.blend`, which needs Blender installed (your approval).
3. Downloads that need your approval:
   - the PDS Pancam τ data set, to replace the assumed τ of 0.9;
   - the MER-1 SPK subset, for the absolute traverse registration.
4. Search for CTX and HRSC data, and research dust optical properties.
