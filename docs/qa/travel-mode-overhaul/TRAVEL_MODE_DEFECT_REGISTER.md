# Travel Mode defect register

| ID | Sev | Defect (reproduced) | Root cause | Fix | Evidence |
|---|---|---|---|---|---|
| TM-1 | P1 | Entering Travel Mode teleported the view to a fixed spot next to the body. The ship then drifted at 30 km/s. | `initShipNear` used a fixed (0, 0.7, 0.7) x 2.5 R offset and a hard-coded orbital velocity | `initShipAt`: the ship takes the camera's exact position and orientation, at rest in the viewed body's co-moving frame. The fixed spot is used only from cosmic/galactic views. | T1: position delta 0, quaternion dot 1.0, speed 0 |
| TM-2 | P1 | Search, label double-click and the chip in Travel Mode flew the hidden observer camera, not the ship. UI and physics disagreed. | `store.travel` always called the Explore warp engine | In Travel Mode, `store.travel` engages the spacecraft autopilot from its current position | T3: ship not moved, autopilot on, observer static |
| TM-3 | P2 | Camera orientation snapped on the first frame of a flight | Heading set to look at the target immediately | Smooth heading turn from the departure orientation over the first 22 % (`flightPath.ts`) | Unit test: < 0.1 rad per frame |
| TM-4 | P2 | Possible flip when the approach direction is opposite to the departure direction | Linear lerp + normalize collapsed to zero | Slerp on the unit sphere | Unit test |
| TM-5 | P2 | Two copies of the flight interpolation | Duplication (`nav.ts`, `travelEngine.ts`) | Both use the shared `flightPose` | Code |
| TM-6 | P2 | Warp streaks crossed the view sideways | Streaks fixed to world axes | Streaks follow the camera; reduced-motion option | Visual |
| TM-7 | P2 | Oversized "WARP FLIGHT TO ..." banner with a large Cancel button | Design | Compact strip (< 2 % of the viewport, off-centre); labelled icon cancel; real light time shown | W-HUD check: 1.86 %, centre clear |
| TM-8 | P2 | Nav map was a full-screen modal with a dimming backdrop | Modal design | Docked non-modal overlay below the HUD bar; minimize / expand / close | T8, T9 |
| TM-9 | P2 | Catalogue and Inspector open by default; selecting auto-opened the Inspector | Defaults | Panels on demand (chip Details / I, L, T); they step aside during flights | P1-P5 |
| TM-10 | P2 | Wrapped dock overlapped panels on narrow screens | Fixed per-breakpoint heights | Panels positioned from the measured dock height (ResizeObserver) | Layout audit at 100/125/150 % |
| TM-11 | P3 | HUD showed the nearest body as the departure point ("Enceladus -> Titan") | Used the nearest body | Uses the viewed body, else the nearest | Leg data |
| TM-12 | P3 | Travel help button announced only "?" | No accessible name | `aria-label` + `aria-expanded` | T2 |
