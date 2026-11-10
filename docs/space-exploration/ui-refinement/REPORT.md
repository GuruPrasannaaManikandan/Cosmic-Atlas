# Lunar Surface UI/UX Refinement — Completion Report

**Order of work:**
1. Regression-verified baseline (`c866ce1`).
2. Audit ([AUDIT.md](AUDIT.md)).
3. Baseline screenshots and measurements (`docs/qa/space-exploration/ui-refinement/before/`).
4. Frontend changes.
5. The same measurements and screenshots again (`…/after/`).
6. Full regression.

## Measured result (same script, same site, same seven viewports)

| | Before | After |
|---|---|---|
| Layout checks passed (`surface_layout_check.py`) | **36 / 64** | **78 / 78** (the after run adds the collapse/expand check and the whole-object framing check at every viewport) |
| HUD overlaps while exploring | at **all 7** viewports (compass under the header everywhere; 5 collisions on phones) | **none** |
| Header / Return to orbit covered by the panel | **all 7** | **none** |
| 3-D viewport behind the panel | **all 7** (canvas full width) | **none**: the canvas ends at the panel (side layout) or above the sheet (narrow layout) |
| Tabs clipped / visible scrollbar | **all 7** ("Science"; plus "Mission Timeline" on phones) | **none**: tabs wrap, with no scrollbar |
| Guide bubble under the panel or colliding with the banner | 1280, 1024, 390 | **none** |
| Whole-object framing inside the visible viewport | not measurable (no hook; the object sat behind the panel) | **inside at all 7**, from the real bounding sphere |

## Root causes (details in AUDIT.md)

1. **Fixed pixel offsets.** Every HUD element used them, measured against the whole window. The header changes height as it wraps.
2. **The inspector floated over the full-window layer** and covered the header. Nothing reserved space for it.
3. **The canvas was always full-window,** so the camera centred objects behind the panel.
4. **The tab row couldn't wrap,** with no tablist keyboard model.
5. **The bubble was positioned in window coordinates** and knew nothing of the HUD or the panel.
6. **Touch controls had their own set of fixed offsets.**
7. **Phones had no small-screen inspection layout.**
8. **Inspection distance was a fixed 7 m times a per-model factor,** not derived from the object's size or the FOV.
9. **z-index was used to patch layout.**

**Moon assumptions inside the shared UI:**
- "Lunar night / earthshine" in the night warning;
- "one sixth of Earth's" gravity in the help;
- lunar lighting, Earth in the sky, regolith colours and ballistic dust, all hard-coded.

## Layout architecture

```text
.surface-root   CSS grid
  wide landscape (≥ 900 px):  [ viewport | inspector (clamp(340px, 26vw, 420px)) ]   → collapsed: [ viewport | 52 px rail ]
  narrow or portrait:         [ viewport ] / [ bottom sheet (≤ 62 dvh) ]             → collapsed: header-only sheet
  .surf-viewport  the only place the canvas lives (R3F resizes with it)
    .surf-hud     in-flow grid: header · status (compass, waypoint, night) · centre (banner, prompt) · bottom
    guide bubble  absolute, placed every frame inside the measured safe area (hudLayout.ts)
  overlays (map, pause, help) cover the whole root
```

- **While inspecting, only the header (with Return to orbit) and the guide stay.** The compass, minimap, banner, prompt, waypoint and key hints are suppressed.
- **Tabs:** `role="tablist"` with arrows, Home and End, and roving `tabIndex`. Visible labels are Inspect · Story · Specifications · Timeline · Science; the accessible names are the full titles, each containing its visible label.
- **Inspector:** the header and tabs stay fixed and the body scrolls on its own. The close button is always in the header. A collapse toggle returns the 3-D space at every size.
- **Inspection camera:**
  - **Distance:** the real bounding sphere of the rendered object, fitted into the narrower of the vertical and horizontal FOV of the *visible* viewport, with a 1.08 margin. It stays behind the guide when that keeps the object a sensible size.
  - **Zoom:** a framing factor (0.45–2.5×).
  - **Unchanged:** close-ups of parts keep their established distances, and the exploration camera's state is untouched.
  - **Not done:** the model is never rescaled to compensate.
- **Planet configuration (`planets.ts`):** see [../surface-exploration/PLANETARY_ARCHITECTURE.md](../surface-exploration/PLANETARY_ARCHITECTURE.md). The HUD, help, lighting, sky, night fill, ground colours and dust now read the environment. Mars is *planned*, has no sites, and is not explorable.

## Files

| File | Change |
|---|---|
| `frontend/src/surface/SurfaceExperience.tsx` | Root grid and viewport cell. HUD rebuilt as in-flow regions. HUD registers its regions. World-agnostic night and help text |
| `frontend/src/surface/hudLayout.ts` (new) | Safe-area measurement and bubble placement |
| `frontend/src/surface/SurfaceScene.tsx` | Bubble placed in the safe area. Framing from real bounds and FOV. Zoom factor. Hardware group registry. `inspectFrame` test hook. Lighting, sky, night fill, ground and rock colours from the planet config |
| `frontend/src/surface/DiscoveryPanel.tsx` | Docked `<aside>`, header actions (collapse, close), accessible tablist, scrolling tabpanel |
| `frontend/src/surface/TouchControls.tsx` | Split into `TouchStick` / `TouchButtons` so they sit in the HUD's bottom row |
| `frontend/src/surface/surfaceState.ts` | `panelCollapsed`; `inspectFrame` debug hook type |
| `frontend/src/surface/planets.ts` (new) | `PlanetEnvironment` interface: Moon implemented, Mars planned with requirements |
| `frontend/src/surface/sites.ts` | The body table *is* the planet table; only explorable sites are listed |
| `frontend/src/surface/planets.test.ts` (new) | Moon complete; Mars not explorable, own sourced gravity, no sites |
| `frontend/src/ui/styles.css` | 55 lines of fixed-offset and patch rules removed; one layout block added (grid, HUD regions, inspector, sheet, tabs) |
| `scripts/e2e/surface_layout_check.py` (new) | The before/after layout measurement |
| `scripts/e2e/surface_exploration_check.py`, `storytelling_check.py` | Unchanged assertions; same flows |

**Unchanged:**
- terrain data and calculations;
- LROC and LOLA products;
- mission coordinates and sources;
- stories and specifications;
- movement and controls;
- time and Sun positioning;
- return to orbit.

## Screenshots

Each viewport has `before/<W>x<H>_*.jpg` and `after/<W>x<H>_*.jpg`:
- `_explore`
- `_inspect`
- `_inspect_lasttab`
- `_inspect_collapsed` (after only)

Recommended comparisons:

| Pair | Shows |
|---|---|
| `before/1024x768_inspect.jpg` vs `after/1024x768_inspect.jpg` | Header covered and LM behind the panel → header free, LM framed in the remaining viewport |
| `before/390x844_explore.jpg` vs `after/390x844_explore.jpg` | Banner over the header, clipped prompt, minimap under the bubble → separate regions |
| `before/390x844_inspect.jpg` vs `after/390x844_inspect.jpg` | Full-screen "side panel" → bottom sheet with the 3-D view above |
| `before/1920x1080_inspect.jpg` vs `after/1920x1080_inspect.jpg` | Clipped tabs and covered header → one-row tabs, 78% of the width left for 3-D |

## Test results (final run, after all changes)

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | pass |
| Production build (`tsc && vite build`) | pass |
| Vitest | **182 / 182**, including 3 new planet-environment tests |
| `surface_layout_check.py` (7 viewports) | **78 / 78** — see below |
| `surface_exploration_check.py` | **35 / 35** — see below |
| `storytelling_check.py` | **15 / 15** — guide bubble, approach and discovery lines, inspection with the guide, component ↔ story, narration |
| `moon_sites_check.py` | **42 / 42** — all six sites on LROC + LOLA terrain, 18 objects, touch joystick, desktop without joystick |
| `model_validation_check.py` | 22 / 22, plus the known, documented LM leg-span deviation |
| `app_smoke.py` | 12 / 12 |
| `travel_overhaul_check.py` | 30 / 30 |
| `travel_controls.py` | 18 / 18 |
| `occlusion_check.py` | 60 / 60 on both runs |
| `layout_audit.py` (orbital UI) | PASS |

`surface_layout_check.py` verifies, at every viewport:
- no HUD overlaps and nothing under the header;
- opening the record while the guide is talking keeps the bubble clear of the panel;
- the close button is visible and clickable;
- all 5 tabs are visible, with no scrollbar, and each one opens;
- the canvas ends where the panel begins (side layout) or above the sheet (narrow layout);
- nothing is hidden under the panel;
- the whole object is framed inside the viewport;
- collapsing returns the 3-D space and expanding restores the panel;
- no horizontal overflow.

`surface_exploration_check.py` covers:
- entry, the site picker, descent;
- walking, lope, hop, collisions;
- first and third person (A8);
- discovery and the inspect record;
- the map and waypoint;
- day and night lighting;
- pause;
- **Return to orbit restores the view (R3)**;
- Travel Mode afterwards.

## Remaining limitations

1. **The bubble can cover part of the 3-D scene.** When the guide's bubble can't sit above the helmet (the astronaut is near the top of the view, or a banner is showing), it docks above the prompt, inside the viewport. It never goes under a panel or the header.
2. **Five tabs need two rows in the narrowest side panel.** At 340 px (1024–1280 wide) they wrap, with "Science" on its own row. The visible labels were kept readable rather than shrunk.
3. **The bottom-sheet height is fixed by CSS** (≤ 62% of the height, the 3-D view ≥ 34%). Only the collapse toggle changes it; there is no draggable sheet.
4. **Mars is architecture and documentation only.** There is no Mars terrain, sky, lighting or site, by design (see the planetary architecture document).
5. **Headless Chrome only:** the checks ran there. Real-GPU behaviour on very low-end phones has not been measured.
