# Travel Mode QA (Chrome 156, 2026-11-09)

The sources are `scripts/e2e/travel_controls.py` (18 state- and physics-level checks), the journey D and J steps in `scripts/e2e/qa_chrome_audit.py`, and the app smoke. Every check drives the real page with keyboard and mouse input and asserts on the ship state (`window.__ship`), not only on the visuals.

| Area | Check | Result |
|---|---|---|
| Entry / exit | Enter from the top nav, and from "More" at ≤1000 px; Escape exits to Explore | PASS (desktop; 768×1024, 430×932, 390×844) |
| Thrust | W forward (cos(move, forward) = 1.000), S backward, release of S keeps a held W active | PASS |
| Lateral / vertical | A left, D right (attitude unchanged), Space up, C down | PASS |
| Boost | Shift boosts only while held | PASS |
| Focus safety | Window blur releases held keys (no stuck throttle) | PASS |
| Focus safety | **Typing in the search box does not drive the ship** (thrust stays 0) | PASS |
| Look / zoom | Mouse drag looks around in cockpit view; wheel zooms the external camera | PASS |
| Camera modes | V cycles cockpit → chase → external | PASS |
| Nav map | M opens; its search accepts "mars"; Escape closes it | PASS |
| Autopilot | Autopilot to the Moon arrives (phase "arrive") | PASS |
| Time interaction | Station keeping: Moon distance stable (4,752 km) while time plays at 1 d/s | PASS |
| Resize | Window resize 1440 → 1024 → 1440 and blur keep Travel Mode alive, no errors | PASS |
| Errors | No uncaught page errors | PASS |

## Not covered by automated checks (honest gaps)

- **Throttle gears and speed-limit labels:** not asserted against the HUD text.
- **Collision / proximity warning:** no automated approach-to-surface test.
- **Nav-map marker position vs ship state:** the map opens and searches, but the marker coordinates are not compared numerically.
- **Pointer lock:** not used by the app (mouse-drag look); not testable headless.
- **Pitch/roll keys beyond the listed bindings:** the control-hint text was not compared to the key bindings.

These are candidates for the next QA increment. No defect was observed manually in these areas during the session.
