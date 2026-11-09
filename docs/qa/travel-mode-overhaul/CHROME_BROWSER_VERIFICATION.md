# Chrome browser verification

Google Chrome 156 (Playwright `channel=chrome`), live local site.
`scripts/e2e/travel_overhaul_check.py`: **30/30 PASS.**

| Check | Result |
|---|---|
| P1 default view: no Catalogue, Inspector or Timeline open | PASS |
| P2 selecting Earth shows a compact chip, not the Inspector | PASS |
| W1 earth -> moon: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W2 moon -> mars: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W3 mars -> phobos: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W4 phobos -> jupiter: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W5 jupiter -> europa: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W6 europa -> saturn: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W7 saturn -> titan: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W8 titan -> neptune: departs from previous arrival, arrives, panels hidden in flight | PASS |
| W HUD is compact (< 3 % of the viewport) and never covers the centre | PASS |
| C1 Cancel stops the flight and holds the actual position | PASS |
| C2 the next flight departs from the cancellation point | PASS |
| T1 entering Travel Mode keeps the exact view (position, orientation) at rest | PASS |
| T2 every visible Travel-Mode control has a meaningful accessible name | PASS |
| T3 destination request engages the autopilot from the current ship position | PASS |
| T4 autopilot accelerates, decelerates and arrives at the Moon | PASS |
| T5 manual input (W) overrides the autopilot | PASS |
| T6 braking (B) reduces the actual velocity | PASS |
| T7 V cycles cockpit / chase / external | PASS |
| T8 nav map opens docked (no dimming backdrop) and leaves the centre visible | PASS |
| T9 nav map minimizes, expands and closes | PASS |
| T10 Escape exits Travel Mode to Explore | PASS |
| P3 Catalogue (L), Inspector (Details), Timeline (T) open on demand | PASS |
| P4 panels step aside during warp and return after arrival | PASS |
| P5 panel shortcuts do not fire while typing | PASS |
| R 1366x768: selection chip fully on screen | PASS |
| R 768x1024: selection chip fully on screen | PASS |
| R 390x844: selection chip fully on screen | PASS |
| No console errors or uncaught exceptions | PASS |

Related results:
- **Travel HUD control inventory:** 11 controls, all with meaningful accessible names.
- **Console:** no errors.
- **Regression in the same tree:** `travel_controls` 18/18, app smoke 12/12, journeys 40/40, layout audit 100/150 % PASS, occlusion PASS, Vitest 141/141, backend 12/12.
- **Screenshots:** `01`-`20` in this folder.
