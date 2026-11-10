# Implementation Progress — Final Engineering and Visual Realism Directive

**Status key:**
- **implemented:** built and verified by tests or measurements in the repository.
- **partial:** some of it exists; the gap is stated.
- **planned:** designed or scheduled, not built.
- **unavailable:** the source data or asset does not exist or could not be obtained. It will not be faked.

**Current stage:** **Stage 2: all gates passed** (see [final-directive/STAGE_2_REPORT.md](final-directive/STAGE_2_REPORT.md)). **Closing Stage 2 and starting Stage 3 are awaiting approval.**

## Stages (M6)

| Stage | Scope | Status |
|---|---|---|
| 0 | Repository audit and official research | **complete** ([report](final-directive/STAGE_0_REPORT.md)) |
| 1 | Architecture, schemas, data design | **complete** ([report](final-directive/STAGE_1_REPORT.md)) |
| 2 | Prototypes (renderer gate on the integrated GPU) | **gates passed** ([report](final-directive/STAGE_2_REPORT.md)). The `.blend` conversion and the environment research are partial and carried into Stage 3 |
| 3 | Opportunity vertical slice | planned |
| 4 | Spirit + Ingenuity | planned |
| 5 | Other Mars missions | planned |
| 6 | Moon replay | planned |
| 7 | Optimisation | planned |

## Directive items

| Area | Item | Status | Notes |
|---|---|---|---|
| Engine | Unity 6.3 LTS URP | **partial** | 6000.3.28f1 + URP 17.3. The Mars prototype WebGL2 build passes every Stage 2 gate, and the **renderer is confirmed** with conditions C1–C6 (`GRAPHICS_PERFORMANCE_REPORT.md` §3). Not yet embedded in the React shell |
| Engine | Production renderer (R3F / Three.js 0.169) | implemented | Orbital view + Moon surface |
| Scale | 1 unit = 1 m; floating origin with curvature | **partial** | Implemented in the Unity prototype: curved ENU terrain, and rebasing at 1 km in `MarsPrototype.cs`. **No rebase has happened in a benchmark yet** (the 60 s path stays within 1 km) |
| Quality | Ultra / High / Balanced / Performance | **partial** | Applied in the Unity Mars prototype and measured (`GRAPHICS_PERFORMANCE_REPORT.md` §1). On an iGPU, Balanced is the default; High is opt-in and Ultra is for discrete GPUs. Not applied in the web renderer |
| Performance | Instrumentation and budgets | **implemented (Unity prototype)** | Bridge frame timing (`window.__mars`), heap readback and the gate harness `mars_prototype_benchmark.py`. Three runs are recorded |
| Time | Three time systems | **partial** | **Mars time core implemented and tested** (`frontend/src/realism/marsTime.ts`, Mars24: both GISS worked examples, published sol 5111). Playback, UI and Go Back: planned |
| Time | Event records | **implemented (data layer)** | Schema + validator + 10 Opportunity events |
| Routes | Route records with coordinate provenance | **implemented (data layer)** | Schema + validator. An unknown frame is never usable (tested) |
| Routes | Opportunity traverse | **partial** | Downloaded (21,104 rows, sols 1–5081). **Locally registered** at Victoria (about 15 m RMS). The absolute frame is unresolved: a 316–335 m discrepancy that the MER-1 SPK subset could settle (download approval needed) |
| Routes | SPICE positions | partial (data) | Archived MER-1 rover SPK covers sols 1–3240 only |
| Routes | Ingenuity flight paths | partial (data) | Flight log PDF; no Ingenuity SPICE kernels |
| Hardware | Component metadata schema | **implemented (data layer)** | Schema + validator (rejects undocumented exploded / cutaway / operation views) |
| Hardware | Opportunity components | **partial** | 21 records from the PDS instrument host + NASA; the rover-mass conflict (185 vs 180 kg) is recorded |
| Hardware | MER rover model | partial | The low-poly GLB is in use: scaled to the footprint, height −17% against PDS. The `.blend` has been inspected (63 named parts) but **not converted: Blender is not installed** |
| Hardware | MER EDL hardware models | **unavailable** | No NASA models; reconstruction only with cited drawings |
| Hardware | Exploded / cutaway views | unavailable (for now) | No document found yet that shows the assembly or internals |
| Moon | Six Apollo sites, LROC DTM + LOLA horizon, sourced lighting | implemented | Untouched in Stage 1 (all 182 earlier unit tests still pass) |
| Moon | Mission replay | planned | Stage 6 |
| Mars | Planet environment | partial | Interface present; Mars `planned`, not explorable. The Mars24 Sun model is ready to wire in |
| Mars | Terrain: HiRISE | partial | **The Victoria DTM is rendered in the Unity prototype.** Heights read back in the player are within 0.60 mm (100 points). The Endeavour DTM is data only. Landing site: the `osu/` Eagle DTM (0.01 m, frame unknown) |
| Mars | Terrain: MOLA / CTX / HRSC | planned | MOLA MEGDR 128 ppd located; CTX / HRSC not yet searched |
| Mars | Atmosphere | partial (data) | τ ≈ 10.8 on sol 5111 (PIA22930, estimate); Lemmon et al. 2015 τ record identified; no pressure measurement |
| Audio | Vacuum-aware sound design | planned | No fabricated NASA communications |
| Story | Opportunity storyboard | **partial** | Draft: 10 beats, each marked ready / partly blocked / blocked with the reason |
| Validation | Scientific | **partial** | 24 unit tests (Mars24, schemas, records), plus Unity `MarsTimeTests` 3/3, a cross-implementation Sun check and the in-player terrain check (`SCIENTIFIC_VERIFICATION_REPORT.md`). Still open: τ, dust optics, absolute route registration |
| Validation | Visual / responsive / Unity / performance for Mars | **partial** | Unity EditMode 52/52; performance gates passed in three runs. **Visual defects V1–V3 are open** (`MARS_PROTOTYPE_GATE_REPORT.md`). Responsive and cross-browser checks: NOT RUN |

## Required documents (Section L)

| Document | Status |
|---|---|
| `IMPLEMENTATION_PROGRESS.md` | this file |
| `FINAL_VISUAL_REALISM_SPEC.md` | **written** (Stage 1) |
| `MISSION_TIME_MACHINE_ARCHITECTURE.md` | **written** (Stage 1) |
| `MISSION_DATA_AUTHORING_GUIDE.md` | **written** (Stage 1) |
| `HISTORICAL_ROUTE_RECONSTRUCTION.md` | **written** (Stage 1; method; result pending data) |
| `MISSION_STORYBOARD_OPPORTUNITY.md` | **draft** (Stage 1) |
| `MARS_TERRAIN_AND_ENVIRONMENT.md` | **draft** (Stage 1) |
| `HARDWARE_ENGINEERING_INSPECTION.md` | **draft** (Stage 1) |
| `AUDIO_AND_EDUCATIONAL_DESIGN.md` | planned (Stage 3) |
| `GRAPHICS_PERFORMANCE_REPORT.md` | **written** (Stage 2; includes the renderer decision) |
| `MOON_TERRAIN_AND_ENVIRONMENT.md` | planned (consolidates existing Moon docs) |
| `MISSION_STORYBOARD_SPIRIT.md`, `MISSION_STORYBOARD_INGENUITY.md` | planned (Stage 4) |
| `SCIENTIFIC_VERIFICATION_REPORT.md` | **written** (Stage 2, Mars prototype) |
| `VISUAL_VALIDATION_REPORT.md` | planned (Stage 3). The Stage 2 visual findings are in `docs/qa/space-exploration/mars-prototype/MARS_PROTOTYPE_GATE_REPORT.md` |
| `final-directive/STAGE_2_REPORT.md` | **written** |
