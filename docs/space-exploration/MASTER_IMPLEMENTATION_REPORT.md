# Cosmic Atlas — Space Exploration: Master Implementation Report

- **Branch:** `feat/space-exploration`, based on `main` @ `11d8482`. **Not merged** — merging waits for your review and explicit approval.
- **Scope of this milestone:**
  - Phase 0: audit, research and deliverables A–F;
  - Phase 1: mission data foundation and timeline connection;
  - the first end-to-end vertical slice of lunar surface exploration at Tranquility Base.

## Deliverables

| | Deliverable | Where |
|---|---|---|
| A | NASA Historical Hardware Catalogue | [mission-research/NASA_HISTORICAL_HARDWARE_CATALOGUE.md](mission-research/NASA_HISTORICAL_HARDWARE_CATALOGUE.md) |
| B | Verified Mission Dataset + source references | [mission-research/VERIFIED_MISSION_DATASET.md](mission-research/VERIFIED_MISSION_DATASET.md); data in `frontend/src/missions/` |
| C | 3D Reconstruction Plan + provenance | [3d-asset-provenance/RECONSTRUCTION_PLAN.md](3d-asset-provenance/RECONSTRUCTION_PLAN.md) |
| D | Surface Exploration Architecture | [surface-exploration/ARCHITECTURE.md](surface-exploration/ARCHITECTURE.md) |
| E | Historical Mission Timeline Architecture | [historical-trajectories/ARCHITECTURE.md](historical-trajectories/ARCHITECTURE.md) |
| F | Phased Development Plan | below |
| QA | Chrome evidence (screenshots + JSON) | `docs/qa/space-exploration/` |

## What was built

**Phase 1 — mission data foundation** (`frontend/src/missions/`)

- **Schemas** for missions, physical objects, components, milestones, sources and `Fact<T>`, with verification status and conflict alternatives.
- **Catalogue:**
  - 40 missions, 23 physical objects, 65 sourced milestones and 18 authoritative sources;
  - covers the Moon (Apollo 11–17), Mars (10 missions), Saturn/Titan (Cassini, Huygens) and 20+ other NASA missions to Venus, Mercury, Jupiter, the outer planets, Pluto, asteroids and comets;
  - Chandrayaan-3 (ISRO) and Huygens (ESA) are flagged non-NASA; validation guarantees their hardware can never be marked as NASA.
- **Validation** (`validateCatalog`): source resolution, fact consistency, date format and order, milestone order, non-NASA labelling, object↔mission links, coordinate ranges. It runs in the unit-test suite.
- **Storytelling layer** (`stories.ts`): short and full stories for the Apollo 11 LM descent stage, EASEP and LRRR, plus Opportunity (ready for Phase 4). It reuses catalogue facts only, with citations.
- **Timeline connection:** the time bar has a mission-events picker (sourced dates). The surface Mission Timeline tab can set the global clock.

**Lunar vertical slice** (`frontend/src/surface/`)

- **Entry:** approaching the Moon (< 120,000 km) shows **EXPLORE MOON**. The site picker lists:
  - Tranquility Base (explorable);
  - the other Apollo sites (catalogued, with LRO positions);
  - Chandrayaan-3, labelled ISRO / not NASA.
- **Descent:** a 4.2 s camera descent onto the site (instant with reduced motion).
- **Astronaut:**
  - articulated procedural rig (hips, spine, head, shoulders, elbows, knees) in a stylised Apollo-era suit;
  - procedural gait matched to distance travelled, so the feet don't slide;
  - a bounding lope in low gravity;
  - footprints and ballistic dust (no air drag, lunar g).
- **Controls:**
  - WASD relative to the camera; Shift lope; Space hop (0.68 m measured at lunar g); E inspect; M map; V first/third person; Esc pause;
  - mouse look with pointer lock, or drag;
  - collisions with rocks and hardware; stays grounded on uneven terrain.
- **Environment:**
  - procedural regolith terrain with ~900 craters and rocks (**labelled as procedural**);
  - a horizon ring with the Moon's real curvature drop;
  - black sky; Earth at its mean position (~66° up, west);
  - **real Sun position from the simulation clock:** at the Apollo 11 moonwalk the Sun is 14.2° above the eastern horizon; at night only earthshine lights the ground.
- **Hardware at its LRO-measured positions:** LM descent stage, EASEP passive seismic station, Laser Ranging Retroreflector (aimed at Earth). All are procedural reconstructions with documented provenance.
- **Discovery:**
  - DISCOVERED banner and E prompt;
  - a record with Inspect (orbit camera + component focus), Historical Story (short/full, optional voice narration with subtitles and transcript, user-controlled), Technical Specifications (facts with verification badges and citations), Mission Timeline (set clock) and Science.
- **Surface map:**
  - hillshaded site map with zoom, pan, north arrow and scale bar;
  - hardware markers with distance and bearing; waypoint with a guidance line, a HUD distance/bearing readout and a 3D beacon;
  - circular minimap and compass strip.
- **Reversible:** Return to orbit restores the exact previous view relative to the Moon (measured Δ = 0). It re-enters Travel Mode if you came from there. While you are on the surface the orbital canvas is paused (`frameloop='never'`), not unmounted.

## Architecture changes

| File | Change |
|---|---|
| `store/store.ts` | `surfaceSiteId`, `enterSurface()`, `exitSurface()`; the orbital view is saved relative to the followed body |
| `ui/App.tsx` | Lazy `SurfaceExperience`, `ExploreSurfaceButton`, `data-surface` attribute; panel shortcuts disabled on the surface |
| `scene/Scene.tsx` | `CosmicCanvas` frameloop pauses while on the surface |
| `ui/Shell.tsx` | `MissionEventSelect` in the TimeBar |
| `ui/styles.css` | Surface HUD, map, discovery and site-picker styles, including narrow-screen layouts |

The new code lives in `src/missions/` and `src/surface/`. It adds no new dependency and no second renderer. Unity remains unintegrated, as found.

## Tests and evidence

**Unit (Vitest): 160/160 pass.** 19 of these are new:

| File | Tests | Covers |
|---|---|---|
| `missions/missions.test.ts` | 8 | Validation; fabrication detection; non-NASA guarantees; LRO coordinates; missing values stay empty; date ordering; active missions; story citations; catalogue breadth |
| `surface/lighting.test.ts` | 5 | Apollo 11 landing had a low eastern Sun; the Sun sets between 2 and 6 Aug 1969, matching NSSDCA's "EASEP stopped before local sunset on 3 Aug"; Earth high in the west; LRRR ≈ 21.5 m S / 2.1 m W of the LM; bearings |
| `surface/controller.test.ts` | 6 | Camera-relative movement and facing; smooth stop with no drift; jump apex = v²/2g (Moon/Mars ratio); LM collision; stays on terrain and inside bounds; stride = step length (no sliding) |

**Build:** `tsc --noEmit && vite build` passes. `SurfaceExperience` is a lazy chunk of 60.9 kB (21.7 kB gzipped).

**Chrome (real Chrome via Playwright, headless): `scripts/e2e/surface_exploration_check.py` passes 33/33.**
- T1: the time bar jumps to Apollo 11's launch at 13:32 UT.
- E1–E3: EXPLORE MOON appears, the site picker is right, and the descent hides the orbital UI.
- A1–A8: grounded start, drag look, W follows the camera, the astronaut faces the travel direction, lope 2.2 m/s, hop 0.67 m, LM collision, first person.
- D1–D8: discovery, prompt, the right record, component focus, specifications with the LRO position and badges, story, ordered timeline, close.
- M1–M3: map lists the hardware, waypoint, HUD guidance.
- L1–L3: daylight at the moonwalk, the night warning, and the button that returns to the moonwalk.
- R1–R4: no overflow at 1366×768 and 390×844, pause menu, return restores the view (Δ 0), Travel Mode still starts at the view and at rest.
- P1: frame rate. Z1: no console errors.

**Existing regressions in Chrome:** all pass (next section).

## Regression results (existing suites)

All suites were run on this branch against the dev server, in real Chrome:

| Suite | Result |
|---|---|
| `app_smoke.py` | 12/12 PASS |
| `travel_overhaul_check.py` (continuous navigation, warp HUD, nav map, contextual panels) | 30/30 PASS |
| `travel_controls.py` (autopilot, station keeping) | 18/18 PASS |
| `occlusion_check.py` (planet/starfield depth) | 60/60 PASS, 0 console errors |
| Vitest | 160/160 PASS |

No existing behaviour changed.

## Performance

| Scene | Measurement |
|---|---|
| Surface, balanced quality, headless Chrome 1440×900 | 37.7–44.6 fps (rAF over 3 s), with 400×400 terrain segments, 2048 shadow map, ~650 instanced rocks, dust |
| Quality tiers | Terrain segments 260 / 400 / 520; shadow map 1024 / 2048; dust off in Performance and with reduced motion |
| Lazy loading | The main bundle grows only by the catalogue and the button; the surface code loads on first descent |

## Known limitations (honest)

1. **Terrain is procedural.** It is not LOLA or LROC NAC DTM data. It is labelled in the HUD and on the map. The hardware positions and relative elevations **are** measured.
2. **Model detail is approximate.** Footpad size, strut layout, foil layout, the LRRR panel size and cube count, and all EASEP dimensions. The LM heading is not sourced (ladder facing west, from crew photographs).
3. **Moon orientation** uses the IAU secular terms only (librations omitted): Sun direction is good to a few degrees. Earth is shown at its mean position.
4. **Speeds and acceleration are gameplay tuning**, not measured astronaut data. Gravity and the jump physics are real.
5. **Voice** uses the browser's Web Speech API (quality depends on the OS). It is text-first; nothing depends on voice.
6. **Data gaps** (see B): Mars landing dates and status, Cassini flyby dates, Chandrayaan-3's measured position, Opportunity's final coordinates.
7. **Not built yet:** Mars, Titan and other Apollo surface environments; trajectories; the J-mission LM, ALSEP and LRV models; Apollo crew-specific suits; a touch joystick (touch can use the buttons, but walking needs a keyboard).

## F. Phased development plan

| Phase | Depends on | Work | Acceptance criteria | Main risks |
|---|---|---|---|---|
| 1b data | — | Fill the B gaps (Mars landing dates and status; Cassini assists; Opportunity's final position; Chandrayaan-3 from LROC); add Surveyor 3 and the ALSEP instruments | `validateCatalog` clean; 0 unverified values for the slice's objects | Source availability; conflicting values |
| 2 models | 1b | J-mission LM, ALSEP central station + RTG + instruments, LRV, MER, Curiosity/Perseverance, Huygens; adopt NASA 3D Resources models where licences allow | Silhouette overlay against official photos documented per model; provenance recorded | Licences; geometry accuracy; polygon budgets |
| 3b Moon | 2 | Apollo 15/16/17 sites with LRVs and ALSEPs; real terrain from LROC NAC DTMs; touch joystick | DTM-based terrain at ≥ 2 m/px; hardware on the measured surface; 30 fps on balanced quality | DTM size and streaming; WebGL memory |
| 4 Mars | 1b, 2 | Meridiani (Opportunity) + Gale + Jezero sites; MOLA/HiRISE terrain; dust; atmosphere sky; Opportunity story and model | Opportunity at its sourced final position; story matches the catalogue; g = 3.73 | Final-position sourcing; terrain data volume |
| 5 Titan | 1b, 2 | Huygens site (conflict shown), haze, lakes and dunes from Cassini RADAR/VIMS; ESA-labelled probe | Huygens clearly ESA; both landing-site values visible | Sparse surface data — must stay labelled illustrative |
| 6 Trajectories | backend Horizons | `/api/trajectory`, Hermite interpolation, path rendering, scrubber, follow camera; Cassini first, then Voyager, New Horizons, Juno, Galileo, MESSENGER, Dawn | Positions match Horizons at the nodes; flyby minima at the sourced dates; kind label shown | Horizons rate limits (cache); frame and time-scale bugs |
| 7 Integration | 3–6 | Mission → launch → cruise → landing → surface site, one flow | One continuous journey per mission in Chrome | UX complexity |
| 8 QA | all | Extend the e2e scripts, perf budgets, live-site checks after deploy | All suites green; Render bundle hash = `main` | Render auto-deploy is currently off (see deployment reports) |

## Next recommendations

1. Review this branch in the browser:
   ```bash
   cd frontend && npm run dev
   ```
   Then fly to the Moon → EXPLORE MOON.
2. Approve or adjust the slice's look and feel before Phase 2 models.
3. Turn Render auto-deploy back on before merging anything (see `docs/deployment/RENDER_DEPLOYMENT_REPORT.md`).
