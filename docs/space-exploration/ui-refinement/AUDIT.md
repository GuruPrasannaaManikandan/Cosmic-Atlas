# Surface UI Audit — Baseline Before Any Frontend Change

- **Baseline commit:** `c866ce1` (storytelling verified).
- **Baseline evidence:** `docs/qa/space-exploration/ui-refinement/before/`, with screenshots and `layout_report.json`.
- **Measured by:** `scripts/e2e/surface_layout_check.py` at the Apollo 17 site, in real Chrome, at 1920×1080, 1600×900, 1366×768, 1280×720, 1024×768, 768×1024 and 390×844.

**Baseline result: 36 of 64 layout checks pass (28 fail).**

## Root causes

| # | Symptom (measured) | Responsible code | Cause |
|---|---|---|---|
| 1 | Compass overlaps the header at **every** viewport (1,560 px² on desktop, 15,600 px² at 768 wide). The banner overlaps the header and compass on phones | `styles.css` `.surf-compass {top: 86px}`, `.surf-waypoint/.surf-night {top: 126px}`, `.surf-banner {top: 128px}`, plus phone patches `top: 176px / 214px` | Every HUD element is `position:absolute` with **fixed pixel offsets measured against the whole window**. The header `.surf-top` is a wrapping flex row whose height changes with width and content (1–3 rows), so the fixed offsets don't follow it |
| 2 | The inspection panel covers the header (Map, First person, **Return to orbit**) at every viewport, and the compass and banner at ≤1366 px | `.discovery {position:absolute; top/right/bottom:12px; width:min(460px,…)}` in `.surface-root` | The panel is a floating overlay on the same full-window layer as the HUD. Nothing reserves space for it, and nothing moves out of its way |
| 3 | The 3-D canvas stays full-width behind the panel at all 7 sizes, so the inspected object is centred **behind** the panel (the Apollo 17 LM is half hidden at 1024 px) | `SurfaceExperience.tsx` renders the Canvas full-window; `SurfaceScene` frames the object at the canvas centre | There is no layout region for the viewport. The canvas and camera don't know the panel exists |
| 4 | The "Science" tab is clipped and a horizontal scrollbar is visible at all sizes ("Mission Timeline" too on phones) | `.discovery-tabs {display:flex; overflow-x:auto}` + `white-space:nowrap` on 5 long labels | The tab row can't wrap, so it overflows the panel. There is no tablist keyboard model (no arrow keys, no roving tabindex) |
| 5 | The DISCOVERED banner collides with the guide bubble (1280/1024), and the bubble covers the minimap on phones | `GuideBubble` is positioned in window coordinates from the projected helmet. Docked: `bottom:150px`. `z-index:3` vs panel `4` | The bubble has no notion of the safe HUD area (header, status row, bottom controls) or of the panel |
| 6 | The Inspect prompt is clipped and overlaps the touch buttons; the minimap is patched to `top:214px` on touch | `.surf-prompt {bottom:120px}`, `.touch-stick/.touch-buttons` absolute, `[data-touch] .surf-minimap {top:214px}` | The same fixed-offset positioning, with a separate set of magic numbers for touch |
| 7 | The phone inspection is a 366 px "side panel" covering the whole screen | `.discovery` width rule only | There is no small-screen layout (no bottom sheet) and no way to collapse the panel to see the 3-D scene |
| 8 | The Apollo 17 LM fills the inspection view | `SurfaceScene` Player: `dist = L.inspDist(7 m) × per-model factor (1.5 LM / 0.95 LRV / 0.45 others)` or `guideDist`; target height fixed at 1.6 m / 0.5 m | The camera distance is **not derived from the object's size, the field of view or the visible viewport's aspect ratio**. Zoom changes an absolute distance (m), not a framing factor |
| 9 | z-index values are ad hoc (bubble 3, panel 4, overlay 5, map 6) | `styles.css` | Stacking was used to paper over the layout problems |

## Moon-specific assumptions inside the "shared" UI

These matter for Mars.

| Where | Assumption |
|---|---|
| `SurfaceExperience` night warning | "**Lunar** night … only **earthshine** lights the ground" (hard-coded) |
| `SurfaceExperience` help | "about **one sixth** of Earth's" gravity (hard-coded) |
| `SurfaceScene` | Lighting is always `sunDirectionAtLunarSite`; Earth is always drawn in the sky; earthshine is the night fill; the sky is always black; regolith and rock colours are constants; dust is always ballistic (no drag) |
| `sites.ts` `SURFACE_BODIES` | Holds a Mars entry, but nothing says whether the environment is implemented |

## Not the cause

- **The canvas/3-D content itself:** R3F already resizes the canvas with its container. The problem is that no container is sized for it.
- **Fonts:** the tabs clip because the row can't wrap, not because the type is too large.

## Fix plan (one layout architecture, not z-index patches)

1. **`.surface-root` becomes a layout grid.**
   - Desktop (≥ 900 px): `viewport | inspector`.
   - Narrow: `viewport / bottom sheet`.
   - The canvas lives only in the viewport cell, so opening a panel **shrinks the 3-D view instead of covering it**.
   - The panel can be collapsed at any size to give the full view back.
2. **The HUD becomes an in-flow overlay grid inside the viewport.** Rows: header → status (compass, waypoint, night) → centre (banner, prompt) → bottom (minimap, provenance, controls). No fixed offsets, so the header height can change freely.
3. **Nonessential HUD is hidden while inspecting** (compass, minimap, prompt, banner, waypoint, key hints). The header (with Return to orbit) and the guide stay.
4. **The guide bubble is clamped to the viewport's safe area,** measured from the header/status and bottom rows. It docks inside the viewport, never under the panel.
5. **Tabs:** a wrapping tablist with arrow-key roving focus. Visible labels are short and contained in the accessible names (Story ⊂ "Historical Story").
6. **Inspection framing from the object's bounding sphere,** the vertical and horizontal FOV and the *visible* viewport aspect. Zoom becomes a framing factor. The exploration camera state stays untouched.
7. **A planet environment interface (`planets.ts`)** carries gravity, atmosphere, lighting, sky, night light, ground colours, dust and wording. The Moon is implemented; Mars is configured as *planned* with its requirements and cannot be opened.
