# Abandoned but Not Forgotten: local acceptance

**Date:** 2026-11-10.
**Branch:** `feat/abandoned-not-forgotten-experience`.
**App:** `npm run dev` (http://localhost:5173) and the FastAPI backend (port 8000).
**Mars renderer:** Unity 6000.3.28f1 player `unity/CosmicAtlas/Builds/MarsExplorer`, served by the dev server at `/unity/mars/`.

**How it was verified:** `scripts/e2e/abandoned_journey_check.py` drives the running app in real Chrome (headless, GPU on: Intel Arc iGPU through ANGLE/D3D11) at 1366×768. It uses only the UI and real key presses. The results are in `journey_check.json`, and every screenshot in this folder comes from that run.

**Result: 42 of 42 checks pass, 0 console errors.**
Unit tests: 246 of 246 pass (`npm test`, which includes 15 new tests in `src/replay/replay.test.ts`). `tsc --noEmit` is clean.

## Feature matrix (what a user can do now)

| Feature | In code | Integrated | Reachable locally | Working (evidence) |
|---|---|---|---|---|
| Solar system | yes | yes | yes | yes (existing) |
| Planet selection | yes | yes | yes | yes. The Moon and Mars info panels offer "Begin expedition" (L01) |
| Cinematic travel (expedition) | yes | yes | Home screen, info panel, selection chip | yes: departure, cruise, approach and the stage-specific arrival (m02–m05). **PARTIAL:** time-compressed camera flight, no launch vehicle or staging model |
| Moon exploration | yes | yes | yes | yes, no regression (l01–l05). The existing `controls_check.py` was re-run on this branch: T0–T6, T8–T12 pass; T7 and T10b are skipped as before (lunar rover driving is not implemented) |
| Mars exploration | yes | **yes: Unity embedded in the React app** | yes | yes (m05–m07, m16). Victoria crater only |
| Spacecraft discovery | yes | yes | yes | yes. Discovery at 45 m and an E prompt (m07) |
| Engineering inspection | yes | yes | yes | yes. Overview, Story, Specifications, Timeline and Science tabs, plus component framing. The solar array and the rocker-bogie are highlighted on the NASA model's own parts (m08–m12) |
| Mission timeline | yes | yes | yes | yes (m12, m13) |
| Historical replay | yes | yes | yes | Mars: Opportunity moves along its recorded drives, sol 951 to 1686 (m13, m14). Moon: descent replay and the clock (l04) |
| Return to present | yes | yes | yes | yes. Mars restores position, heading, camera yaw, pitch and distance, the open record tab and component, and the scene clock, all with zero difference (M17). Moon restores the astronaut, camera, clock and record (L05) |
| Astronaut controls | yes | yes | Moon | yes (L03; the existing `controls_check.py` covers T1–T6) |
| Rover controls | yes | yes | Mars (Unity) | yes. W accelerates, S brakes then reverses, A and D steer, the wheels have terrain contact, the suspension is spring-damped, there is a 32° slope limit, and you cannot drive through Opportunity. The arrow keys only turn the camera (M07, M08) |

## Measured (renderer conditions)

| | Value | Condition |
|---|---|---|
| Embedded frame time, Balanced, 1366×768 | **17 ms p50 / 17 ms p95** (vsync-capped at 60 fps), 155 draw calls | **C4 measured: pass.** The orbital R3F canvas is paused (`frameloop="never"`). One Unity player at a time: Return to orbit calls `Quit()`, and 1 canvas is left (M-exit) |
| Device pixel ratio for the Mars view | capped at 1.5 | C1 (integrated GPU) |
| Terrain readback in the embedded player | 0.60 mm max over 100 points (gate 50 mm) | unchanged from Stage 2 |
| Player load from localhost | about 1.0 s, uncompressed | **C3 is still open.** Brotli is not enabled (see Open items) |

## Mars visual defects (Stage 2)

- **V1 (cyan ribbon) and V3 (broken far line): fixed.** The floating 0.6 m `LineRenderer` is gone. The traverse is now painted into a 1 m/texel terrain detail map (URP Lit `_DETAIL_SCALED`), so it follows the terrain exactly, filters to a continuous line at distance, and fades out in the last 12 m before the rover. In the replay it is drawn only up to the current sol (m05, m13).
- **V2 (low-detail rover): open.** Converting the NASA MER `.blend` (63 named parts) needs Blender, which is not installed on this machine.

## Accuracy notes

- The Mars scene is set on **11 Sep 2007**, the day Opportunity drove into Victoria (NASA). Opportunity is shown at its recorded drive position for sol 1291. The HUD and the record say this, and they say that its final resting place is Perseverance Valley, Endeavour crater, which is not modelled.
- The expedition rover you drive, its speeds and slope limit, the arrival camera descent, the sky, the dust and the terrain tint are **ILLUSTRATIVE**, and they are labelled that way in the app.
- Replay events come only from the catalogue. The UI marks each one **SHOWN** (from data) or **TOLD** (with where it happened).
- The Mars catalogue now has sourced key dates and status from the NASA mission pages (read 2026-11-10) for:
  - Spirit, Curiosity, Pathfinder with Sojourner, Phoenix and Viking 2;
  - the orbiters Mariner 9, Mars Global Surveyor, Odyssey, MRO and MAVEN.
  Orbiters have no surface position, and the Overview tab says "orbital mission". MAVEN is recorded as **lost**: contact was lost on 6 Dec 2025 and the end of mission was declared on 3 Jun 2026.

## Open items (not done)

1. **Other Mars sites have no terrain yet:** Endeavour, Gusev, Gale, Jezero and the Viking and Pathfinder sites. They are listed in the site picker as "catalogued — not built".
2. **No launch vehicle, staging or interplanetary trajectory model.** The cruise is the app's camera flight, labelled time-compressed.
3. **No astronaut on Mars.** The Unity scene has the rover only.
4. **C3: serve Brotli.** **C6: cross-browser and device pass.** **C2: the High/Ultra memory budget**, which is unchanged; the embedded default stays Balanced.
5. **V2 rover model** (needs Blender).
6. **The Opportunity replay covers only the Victoria campaign.** Earlier and later events are told, not shown.
