# Cosmic Atlas — UI and Travel Mode Repair Report (Milestone 1)

**Date:** 2026-11-08 · **Branch:** `feat/universal-realism-ui-travel` · Defect IDs refer to [COSMIC_ATLAS_COMPLETE_SYSTEM_AUDIT.md](COSMIC_ATLAS_COMPLETE_SYSTEM_AUDIT.md).

## Status

| Label | Meaning |
|---|---|
| **Tested** | Covered by an automated test that passes. |
| **Browser verified** | Exercised with real input events in Chromium via `scripts/e2e/*`. |
| **Not done** | Explicitly out of this milestone. |

## 1. Results

| Suite | Before | After |
|---|---|---|
| Frontend unit tests (Vitest) | 96/96 | **115/115** (+19 regression tests) |
| Backend (pytest) | 12/12 | 12/12 |
| C# astronomy core (`dotnet test`) | 22/22 | 22/22 |
| Travel Mode browser checks (`scripts/e2e/travel_controls.py`) | 8/17 | **18/18** (one check added: station keeping) |
| Layout audit, 7 viewports × 2 states (`scripts/e2e/layout_audit.py`) | FAIL: clipped controls at 6 of 7 sizes; overlaps at every size | **PASS** at all 7 sizes |
| Production build | OK | OK |

Evidence: `docs/travel-audit/before.json` / `after.json`; `docs/ui-audit/before/*` / `after/*` (screenshots + `layout_report.json`).

## 2. Travel Mode repairs

### 2.1 Input (`travel/travelKeys.ts`, new; `travel/travelControls.ts`)

| Defect | Fix | Status |
|---|---|---|
| TR-1 opposing keys | Axes are recomputed from the **set of held keys** on every key event. | Tested, browser verified |
| TR-2 no reverse | Holding S at 0% throttle applies reverse thrust (50% of gear acceleration). | Tested, browser verified |
| TR-3 A/D yaw | New scheme below; A/D now thrust left/right. | Tested, browser verified |
| TR-4 stuck keys | `blur` and `visibilitychange` release everything; key-up is always processed (even inside inputs). | Tested, browser verified |
| Shift/layout issues | Keys are matched by `KeyboardEvent.code` (physical position), so W still works with Shift held and on non-QWERTY layouts. | Tested |
| TR-5 mouse | Drag = look/steer in cockpit and chase; orbit camera in external. Wheel = camera distance (chase/external) or throttle (cockpit). The chase snap-back is gone. | Browser verified |
| TR-6 NavMap "m" | "M" closes the map only when not typing; Escape always closes it. | Browser verified |
| TR-7 Escape | Escape exits Travel Mode, except while the NavMap or flight-help dialog is open (they close first). | Tested, browser verified |
| TR-8 exit button | Now calls `exitTravelMode()`, so the camera continues from the ship's position. | Code fix |
| Dialogs vs keys | Flight keys are ignored while typing, while the NavMap is open, and while the help dialog is open. | Tested |
| Autopilot override | Any flight key or mouse look disengages the autopilot and shows "Autopilot disengaged — manual override". | Tested |

**Control scheme (as documented in the in-app flight manual):**

| Input | Action |
|---|---|
| W / S | Throttle up / down; hold S at 0% to thrust backward |
| A / D | Thrust left / right |
| Space / C | Thrust up / down |
| Mouse drag | Look / steer (cockpit, chase); orbit the camera (external) |
| ← → ↑ ↓ | Yaw left/right, pitch up/down |
| Q / E | Roll left / right |
| Shift | Boost ×3 while held |
| B | Brake |
| Wheel | Camera distance (chase, external); throttle (cockpit) |
| V | Camera view |
| M | NavMap |
| F | Flight model (assisted / inertial) |
| X | Stabilisation |
| 1–4 | Speed range (gear) |
| Esc | Close dialog / exit Travel Mode |

### 2.2 Flight model (`travel/shipState.ts`, `astro/heliocentric.ts` new)

| Defect | Fix | Status |
|---|---|---|
| TR-11 34 km quantisation | The ship's authoritative state is `ship.localKm`: an **exact km offset from its reference body**, integrated in km. `ship.pos` (root ly) is derived after each step, for the rest of the app. Reference-body changes use `relativeKm()`, which composes heliocentric km from the engine primitives (same composition as the C# `SolarSystemFrames`), so hand-offs are exact. | Tested: a 100 m step is preserved to 1e-9 km |
| TR-10 left behind / frame lag | The ship **co-moves with its reference body**: the autopilot target while engaged, the arrival body while holding station, otherwise the nearest body, with hysteresis so a passing small moon can't flip it. The Rig now uses the clock value read **after** `advanceSim()`. | Tested; browser verified (Moon distance 4,645 km → 4,645 km at 1 day/s) |
| TR-9 autopilot circling | **Velocity-vector guidance:** desired velocity along the line of sight is min(gear max, 0.8·√(2·a·d), d/1.5 s). The correction Δv cancels sideways drift under an acceleration limit. Phases: align → accelerate/cruise → decelerate → arrive. | Tested (5,000 km/s sideways start still arrives); browser verified |
| TR-14 overshoot | Downshifting lowers the speed ceiling, not the braking authority (deceleration ≥ 1.25·v²/2d). | Tested |
| Arrival | Stops relative to the target and **holds station**. The HUD shows "ARRIVED · HOLDING STATION". Any thrust resumes manual flight. | Tested, browser verified |
| TR-12 warp jumps / tunnelling | **Proximity governor:** manual speed ≤ max(1.5 × surface distance per second, 2 km/s). One step can never cover more than ~15% of the distance to the nearest surface. Collision push-out removes only the inward velocity component. | Tested (boosted warp at Earth stays outside and sub-light) |
| TR-13 constants | `KM_TO_LY` and `C_LY_S` are derived from the exact catalogue constants. The G-force is proper acceleration in standard g (shown in exponent form for the fictional warp drive). | Tested |
| Inertial + stabilisation | The pre-existing damping behaviour is kept. | Existing tests |

### 2.3 Camera and HUD (`scene/Scene.tsx`, `travel/TravelHUD.tsx`)

- **Chase zoom:** wheel, ×0.5–×4.
- **Camera clipping guard:** chase and external cameras are pushed outside the nearest body.
- **Ship model placement:** drawn from the exact camera-to-ship offset (`travelCam.fromShip`), not two quantised root positions. The reference body is drawn from `ship.localKm`, so it no longer jitters against the ship.
- **New HUD fields:** velocity "relative to <body>"; **altitude** above the nearest body, with a proximity warning; arrival / station-keeping banner; timed flight-event messages ("Autopilot engaged → Moon", "Collision avoided", …); corrected acceleration readout; rewritten help table.
- **Debug handles:** `window.__ship` / `window.__shipApi`, same convention as `__nav` / `__store`. The browser suite uses them, because dynamic `import()` returns a stale module instance after a Vite hot update.

**Not done in this milestone:** orbit insertion (a circular orbit around the target). The autopilot arrives and holds station instead, and the HUD says so. There is also no separate "free" camera mode; external is the free-orbit camera.

## 3. UI and layout repairs

### 3.1 Top navigation (`ui/TopNav.tsx`, new)

Priority collapse: every control has one inline element and one "More" menu item, and CSS breakpoints decide which is visible. **Nothing is hidden without a reachable alternative.**

| Width | Inline | In "More" |
|---|---|---|
| > 1760 px | All controls | (menu hidden) |
| ≤ 1760 | Primary actions, audio, tools | Earth, Milky Way, Solar System |
| ≤ 1440 | Primary actions, audio icon | + Data Intelligence, Help, Notes |
| ≤ 1180 | Events and Academy become icon-only (accessible name and tooltip kept) | — |
| ≤ 860 | Logo, search, audio, More | + Find Home, Travel Mode, Cosmic Events, Academy |

The "More" menu:
- has `aria-haspopup` / `aria-expanded` / `role="menu"`;
- moves focus to its first item on open and supports ↑/↓;
- closes on Escape (returning focus to its button) and on outside click;
- shows visible focus rings.

### 3.2 Layout system (`ui/styles.css`, "LAYOUT SYSTEM" section; `ui/App.tsx`)

- **Tokens:** `--header-h`, `--crumbs-top`, `--panel-top`, `--stack-base`, `--stack-time` and z-index layers. The header (z 42) is now above the breadcrumbs (z 30), so the search dropdown and menus are never covered (UI-3).
- **Breadcrumbs:** placed below the header (UI-2).
- **Panels:** start below the breadcrumbs and stop above the bottom stack. `data-timebar` on the app root reserves room for the clock (UI-4). At ≥ 1560 px the centred stack fits between the panels, so they use the full height.
- **≤ 1080 px:** one side panel at a time; the Inspector takes precedence over the Object Browser.
- **Phones:** two-row dock grid, compact clock, and breadcrumb telemetry chips hidden (UI-5).

### 3.3 Verified (layout audit after the fix)

At **1920×1080, 1600×900, 1366×768, 1280×720, 1024×768, 768×1024 and 390×844**, in both the Explore and Inspector-open states:
- 0 controls clipped or covered;
- 0 region overlaps;
- no horizontal page overflow;
- all 10 navigation actions reachable;
- the "More" menu closes on Escape;
- search results are visible and not covered.

## 4. Files changed

**New:**
- `frontend/src/ui/TopNav.tsx`
- `frontend/src/travel/travelKeys.ts`
- `frontend/src/astro/heliocentric.ts`
- `frontend/src/travel/travelRepair.test.ts`
- `scripts/e2e/layout_audit.py`, `travel_controls.py`, `perf_baseline.py`

**Modified:**
- `frontend/src/travel/shipState.ts`, `types.ts`, `travelControls.ts`, `TravelHUD.tsx`, `NavMapModal.tsx`
- `frontend/src/scene/Scene.tsx` (Travel rig only)
- `frontend/src/ui/App.tsx`, `styles.css`

## 5. Known limitations and open items (carried forward)

1. **A-1:** timeline playback costs ~9 ms of CPU per frame (React components subscribed to `simMs`). Next optimisation target.
2. **A-2:** orbit lines use `Date.now()` instead of the simulation date.
3. **A-5:** the asset provenance labels are still wrong. They must be corrected before any Unity asset import.
4. **D1 outside Travel Mode:** Explore-mode rendering still subtracts root-frame positions (34 km quantisation). Travel Mode is fixed locally; the general fix is the Unity hierarchical-frame renderer.
5. The FIND HOME, Academy, Data Intelligence, SIMBAD and audio flows were **not re-verified in a browser** in this milestone; they keep their existing unit coverage.
6. **Not started:** Unity Milestones 2–4 (universal rendering architecture, scientific simulations, hybrid integration).

## 6. How to re-run

```bash
cd frontend && npm test && npm run build
```
```bash
cd frontend && npm run dev
```
```bash
python scripts/e2e/travel_controls.py --base http://localhost:5173
```
```bash
python scripts/e2e/layout_audit.py --base http://localhost:5173 --out docs/ui-audit/latest
```
```bash
python scripts/e2e/perf_baseline.py --base http://localhost:5173 --uncapped --out docs/perf/latest.json
```
