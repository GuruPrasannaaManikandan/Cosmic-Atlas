# Gameplay Controls — Audit (before any change)

**Directive:** Gameplay Controls, Camera System and Visual Reference, Parts 16–22.
**Branch:** `feat/space-exploration`. The audit came first; the baseline tests ran on the unchanged code.

## 1. The two reference screenshots

**They were not attached to the message.** Parts 18 and 19 (visual standard, flight HUD composition) refer to them, and they could not be studied. Control work (Parts 16, 17, 20–22) does not depend on them. The visual items are held until the images are provided.

## 2. Keyboard listeners found (all on `window`, each with its own rules)

| File | Context | What it did |
|---|---|---|
| `surface/SurfaceScene.tsx:407` | Moon surface | W/S/A/D **and Arrow keys moved the astronaut** (`:509`, the arrows duplicated WASD). Camera: mouse only (pointer lock / drag). E inspect, V camera, M map, H help, Space hop, Shift lope, Esc pause / close |
| `travel/travelKeys.ts` | Travel Mode (spacecraft) | W/S throttle, A/D strafe, Space/C up/down, Q/E roll, **Arrows yaw/pitch the ship**, Shift boost, B brake, V camera, X / F / 1–4 / M / Esc. **Any movement key cancelled the autopilot** |
| `scene/Controls.tsx:49` → `store/nav.ts:152` | Orbital / free view | W/S/A/D **and Arrow keys moved the camera**; Space/E up, C/Q down, Shift faster |
| `ui/App.tsx:327` | Orbital view | I / L / T toggle panels |
| `ui/App.tsx:104` | anywhere | `/` and Ctrl+K focus search |
| `surface/ExploreSurface.tsx`, `SpacecraftArchive.tsx`, `ui/AboutModal.tsx`, `ui/HelpModal.tsx`, `travel/TravelHUD.tsx`, `travel/NavMapModal.tsx`, `tutorial/TutorialOverlay.tsx`, `ui/TopNav.tsx` | dialogs | Esc / arrow navigation inside their own UI |
| `surface/DiscoveryPanel.tsx:139` | inspector | Arrow keys move between tabs (an accessible tablist; correct and kept) |

## 3. Gaps against the directive

| Requirement | Before |
|---|---|
| 16.1 Arrows = camera only | **Violated in all three gameplay contexts** (surface: move; travel: steer; orbital: move) |
| 16.3 Automatic travel stays autonomous; manual is explicit | **Violated:** any W/A/S/D/arrow cancelled the autopilot. There was no Auto/Manual switch |
| 16.4 Central input manager with modes | None. Eight or more independent listeners; each re-implemented "is the user typing?" |
| 16.4 No stale input across modes | Partial: each context cleared its own set on blur; nothing cleared on mode change |
| 16.5 C = camera | V on the surface and in travel; C was "descend" in travel and orbital |
| 17.2 Arrow-key camera with sensitivity, pitch limits, damping | Mouse only; no sensitivity or invert settings |
| 17.4 Camera collision | Terrain only (`desired.y ≥ ground + 0.35`); the camera could pass through the LM, the LRV and other hardware |
| 20 Rover driving | None: the LRV is a parked, inspectable object |
| 21 Contextual Controls panel + settings | A static help overlay (H) on the surface and a help dialog in travel. No settings |
| 22 Control acceptance tests | `travel_controls.py` (18 checks) and `surface_exploration_check.py` cover parts of the old scheme |

## 4. Baseline (unchanged code)

| Suite | Result |
|---|---|
| Vitest | 21 files pass |
| `travel_controls.py` | 18/18 |
| `surface_exploration_check.py` | 35/35 |
| `travel_overhaul_check.py`, `moon_sites_check.py`, `storytelling_check.py`, `surface_layout_check.py` | see the report (run before the changes) |

## 5. Values used, with sources

- **Moon gravity:** 1.62 m/s² (NSSDCA, already in `planets.ts`).
- **Mars gravity:** the directive says "approximately 3.71". The sourced NSSDCA mean of **3.73** stays in `planets.ts`. Mars is not explorable in the web app yet.
- **LRV** (NSSDCA `apollo_lrv.html`):
  - wheelbase 2.3 m; tyres 81.8 cm;
  - front and rear steering turning in opposite directions, giving a **3.1 m steering radius**;
  - 10,000 rpm motors through an 80:1 drive. This gives a **derived mechanical ceiling of ≈ 5.35 m/s**. It is not the operational top speed, which is not sourced.
