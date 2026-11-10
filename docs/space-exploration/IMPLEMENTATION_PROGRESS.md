# Implementation Progress — Final Engineering and Visual Realism Directive

**Status key:**
- **implemented:** built and verified by tests or measurements in the repository.
- **partial:** some of it exists; the gap is stated.
- **planned:** designed or scheduled, not built.
- **unavailable:** the source data or asset does not exist or could not be obtained. It will not be faked.

**Current stage:** **Stage 1 complete** (see [final-directive/STAGE_1_REPORT.md](final-directive/STAGE_1_REPORT.md)). **Awaiting approval for Stage 2.**

## Stages (M6)

| Stage | Scope | Status |
|---|---|---|
| 0 | Repository audit and official research | **complete** ([report](final-directive/STAGE_0_REPORT.md)) |
| 1 | Architecture, schemas, data design | **complete** ([report](final-directive/STAGE_1_REPORT.md)) |
| 2 | Prototypes (renderer gate on the integrated GPU) | planned (awaiting approval and download approvals) |
| 3 | Opportunity vertical slice | planned |
| 4 | Spirit + Ingenuity | planned |
| 5 | Other Mars missions | planned |
| 6 | Moon replay | planned |
| 7 | Optimisation | planned |

## Directive items

| Area | Item | Status | Notes |
|---|---|---|---|
| Engine | Unity 6.3 LTS URP | **partial** | 6000.3.28f1 + URP 17.3 installed; WebGL2 build validated (space showcase only). Decision recorded with Stage 2 gates (`FINAL_VISUAL_REALISM_SPEC.md` §2) |
| Engine | Production renderer (R3F / Three.js 0.169) | implemented | Orbital view + Moon surface |
| Scale | 1 unit = 1 m; floating origin with curvature | planned (specified) | Spec §3: double-precision positions, ENU origin, rebase at 1 km, curved tiles |
| Quality | Ultra / High / Balanced / Performance | **partial** | Profiles defined as validated data (`mission-data/quality-profiles.json`); not yet applied in a renderer |
| Performance | Instrumentation and budgets | planned (specified) | Spec §5 contract; Unity M2 bridge reports frames already |
| Time | Three time systems | **partial** | **Mars time core implemented and tested** (`frontend/src/realism/marsTime.ts`, Mars24: both GISS worked examples, published sol 5111). Playback, UI and Go Back: planned |
| Time | Event records | **implemented (data layer)** | Schema + validator + 10 Opportunity events |
| Routes | Route records with coordinate provenance | **implemented (data layer)** | Schema + validator. An unknown frame is never usable (tested) |
| Routes | Opportunity traverse | planned | Product found (sols 1–5130); **frame not stated**; needs download approval + frame fit |
| Routes | SPICE positions | partial (data) | Archived MER-1 rover SPK covers sols 1–3240 only |
| Routes | Ingenuity flight paths | partial (data) | Flight log PDF; no Ingenuity SPICE kernels |
| Hardware | Component metadata schema | **implemented (data layer)** | Schema + validator (rejects undocumented exploded / cutaway / operation views) |
| Hardware | Opportunity components | **partial** | 21 records from the PDS instrument host + NASA; the rover-mass conflict (185 vs 180 kg) is recorded |
| Hardware | MER rover model | partial | NASA low-poly GLB validated; `.blend` evaluation needs approval |
| Hardware | MER EDL hardware models | **unavailable** | No NASA models; reconstruction only with cited drawings |
| Hardware | Exploded / cutaway views | unavailable (for now) | No document found yet that shows the assembly or internals |
| Moon | Six Apollo sites, LROC DTM + LOLA horizon, sourced lighting | implemented | Untouched in Stage 1 (all 182 earlier unit tests still pass) |
| Moon | Mission replay | planned | Stage 6 |
| Mars | Planet environment | partial | Interface present; Mars `planned`, not explorable. The Mars24 Sun model is ready to wire in |
| Mars | Terrain: HiRISE | partial (data) | Victoria + Endeavour DTMs (1.01 m). Landing site: `osu/` Eagle DTM (0.01 m, frame unknown) |
| Mars | Terrain: MOLA / CTX / HRSC | planned | MOLA MEGDR 128 ppd located; CTX / HRSC not yet searched |
| Mars | Atmosphere | partial (data) | τ ≈ 10.8 on sol 5111 (PIA22930, estimate); Lemmon et al. 2015 τ record identified; no pressure measurement |
| Audio | Vacuum-aware sound design | planned | No fabricated NASA communications |
| Story | Opportunity storyboard | **partial** | Draft: 10 beats, each marked ready / partly blocked / blocked with the reason |
| Validation | Scientific | **partial** | 24 new unit tests (Mars24, schemas, records) |
| Validation | Visual / responsive / Unity / performance for Mars | planned | Stage 2+ |

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
| `GRAPHICS_PERFORMANCE_REPORT.md` | planned (Stage 2) |
| `MOON_TERRAIN_AND_ENVIRONMENT.md` | planned (consolidates existing Moon docs) |
| `MISSION_STORYBOARD_SPIRIT.md`, `MISSION_STORYBOARD_INGENUITY.md` | planned (Stage 4) |
| `VISUAL_VALIDATION_REPORT.md`, `SCIENTIFIC_VERIFICATION_REPORT.md` | planned (Stage 2 onward) |
