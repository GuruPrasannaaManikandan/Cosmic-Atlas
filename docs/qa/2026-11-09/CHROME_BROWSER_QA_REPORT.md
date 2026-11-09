# Chrome Browser QA Report (2026-11-09)

**Browser:** Google Chrome 156.0.8078.81 (real Chrome via Playwright `channel=chrome`). Edge 157 was the second browser, used for the Unity load paths.
**Site:** local Vite dev frontend (`:5173`/`:5174`) with the FastAPI backend (`:8000`), and the Unity WebGL build (`:8091`).
**GPU:** ANGLE → Direct3D 11, Intel Arc.

## What was inspected, and how

| Area | Method | Result |
|---|---|---|
| UI inventory | Every visible button/input/select/menu item in Explore, Inspector and the More menu: 142 controls, each clicked on a **fresh page**, with the store/nav state diff, opened overlays, visible-text change and page errors recorded (`FEATURE_INVENTORY.csv`). Flagged rows were re-verified with role/name actionability clicks. | **140 functional**, 2 correct no-ops (the "All" tab is already active), **0 errors** |
| User journeys A–J | Real input (mouse/keyboard), state assertions plus screenshots | 41/41 implemented steps pass; G/H not implemented |
| Layout and overlap | 8 viewports (1920×1080 … 390×844, incl. 430×932) × Explore/Inspector × zoom 80/100/125/150 %: page/header overflow, controls inside the viewport, hit-testing, nav reachability (inline or More), Escape closes menus, search dropdown not covered | **All pass after fixes QA-1…QA-5** |
| Console | Captured per journey | Only errors deliberately injected by journey I (500, connection refused, removed asteroid file). **No React warnings, shader errors or WebGL context loss.** |
| Network | Status ≥ 400 and failed requests captured | Only the injected failures. The favicon 404 was fixed in PR #2. |
| Failure handling | API 500 and API unreachable: SIMBAD live search and the JPL Horizons check show actionable messages, with no endless spinner. With the asteroid dataset missing (404), the app stays usable: navigation works and the warning is logged. | PASS |
| Planet rendering | 8 planets × 5 distances (2.5–2000 R), contact sheet (`docs/foundation/planets`) | No broken LOD transitions; rings and shadows correct |
| Unity canvas | Load paths (file://, first visit, cache 304, hard refresh, clean profile, missing `Build/`) in Chrome and Edge; bridge-ready event, messages, WebGL-disabled failure path | 6/6 per browser; bridge 10/10 |
| Performance | 7 scenarios × 60 s plus a 300 s soak, headed Chrome with vsync | 60 fps locked, 0 long tasks, no heap growth (`PERFORMANCE_REPORT.md`) |

## Defects found and fixed in this pass

Detail with root causes: `VISUAL_DEFECT_REGISTER.md`.

- **QA-1 (P2):** at 150 % zoom on a 1366×768 laptop, the header overflowed and "More" (all primary navigation) was off-screen.
- **QA-2 (P2):** on phones at 125–150 % zoom, the header overflowed and "More" was off-screen at ≤287 px.
- **QA-3 / QA-4 (P3):** time bar/dock and inspector/time bar overlaps on small screens.
- **QA-5 (P3):** the "Solar" category tab was clipped and its centre unclickable.

## DOM / accessibility notes

- **Accessible names:** all icon buttons have them (aria-label or title). The More menu uses `role=menu` / `menuitem`. The search has `role=search` and a labelled input. The inspector close button is labelled.
- **Not dialogs:** the Cosmic Events selector and the Academy overlay do not use `role=dialog`, and the Events selector does not close on Escape (it closes via its ✕ or a backdrop click). Recorded as a P3 accessibility improvement, not changed in this pass.

## Evidence

- `screenshots/`: A1 initial screen … J responsive.
- `reports/`: `journeys.json`, `FEATURE_INVENTORY.csv`, `layout_zoom_*/layout_report.json`, `travel_controls.json`.
- `logs/`: console, network failures, Unity load paths (Chrome/Edge), layout and performance runs.
- `metrics/performance_balanced.json`.
