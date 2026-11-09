# End-to-End Test Report (Chrome 156, 2026-11-09)

Harness: `scripts/e2e/qa_chrome_audit.py --only journeys`, real Google Chrome (Playwright `channel=chrome`), local dev site.
Screenshots: `screenshots/`. Logs: `logs/journeys_console.log`, `logs/journeys_network_failures.log`.

| Journey | Steps passed | Result |
|---|---|---|
| A - Basic app | 6/6 | PASS |
| B - Solar System | 3/3 | PASS |
| C - Search | 5/5 | PASS |
| D - Travel | 5/5 | PASS |
| E - Timeline | 6/6 | PASS |
| F - Cosmic event | 2/2 | PASS |
| G - Surface explore | 0/1 | NOT IMPLEMENTED in the product |
| H - Artifact details | 0/1 | NOT IMPLEMENTED in the product |
| I - Failure recovery | 6/6 | PASS |
| J - Responsive UI | 8/8 | PASS |

**Implemented journeys: 41/41 steps pass.** Journeys G/H need features that do not exist yet (see MISSION_DATA_VALIDATION.md).

## Step detail

| Journey | Step | Result | Evidence |
|---|---|---|---|
| A | page loads, canvas present | PASS | 2.4 s to canvas |
| A | first-visit Academy prompt shown (expected for a new visitor) | PASS | 2 academy elements |
| A | universe visible in Explore | PASS |  |
| A | select Earth -> inspector shows Earth | PASS |  |
| A | close inspector | PASS |  |
| A | no console errors | PASS | [] |
| B | select Jupiter -> planet and Galilean moons render | PASS | labelled: ['io', 'europa', 'ganymede', 'callisto'] |
| B | time controls advance the system | PASS | 2.03 days in 2 s at 1 d/s |
| B | breadcrumb returns to a larger scale | PASS | scale 1.42e-05 -> 1.28e+03 |
| C | typing shows suggestions | PASS | 9 |
| C | selecting a result moves the camera | PASS |  |
| C | inspector shows Jupiter | PASS |  |
| C | no-match query shows an empty-state / live-lookup option | PASS | BUNDLED CATALOGUE
No match in bundled catalogue — query the CDS SIMBAD database  |
| C | clear search empties the field | PASS |  |
| D | enter Travel Mode | PASS |  |
| D | W thrust moves the ship | PASS | [-6.048439970863041, 11149.249999999998, 11149.249999999998] -> [-6.145434257746333, 11018.6954904904, 11018.6954904904] |
| D | nav map opens with M | PASS |  |
| D | window resize + blur keep Travel Mode alive | PASS | [] |
| D | Escape exits Travel Mode | PASS |  |
| E | Time Engine visible at Solar System scale | PASS |  |
| E | set date via the date picker | PASS | sim year 2030 |
| E | Reverse + Play runs time backwards | PASS | {'r': -1, 'p': True, 'dt': -1.5168} |
| E | Pause stops time | PASS |  |
| E | celestial state changes consistently with time | PASS |  |
| E | Now returns to the present | PASS | /sim - now/ = 1 s |
| F | event scene loads with narrative/labels | PASS |  |
| F | exit restores the previous scene (phase, selection, camera) | PASS | saturn/explore -> saturn/explore, camera kept=True |
| G | Surface Explore (Moon/Mars/Titan) | N/A | NOT IMPLEMENTED: no surface/explore mode exists in the frontend or Unity project |
| H | Artifact details (rover/instrument inspection) | N/A | NOT IMPLEMENTED: no artifact/rover models or inspection UI exist |
| I | API 500: live lookup shows an actionable error, no endless spinner | PASS | BUNDLED CATALOGUE
No match in bundled catalogue — query the CDS SIMBAD database below.
🌐 Query CDS SIMBAD live for “Qqzx |
| I | API 500: Horizons check reports the failure in the inspector | PASS | injected failure |
| I | API 500 + missing asteroid data: app stays usable (navigation works) | PASS |  |
| I | API abort: live lookup shows an actionable error, no endless spinner | PASS | BUNDLED CATALOGUE
No match in bundled catalogue — query the CDS SIMBAD database below.
🌐 Query CDS SIMBAD live for “Qqzx |
| I | API abort: Horizons check reports the failure in the inspector | PASS | Backend unreachable (Failed to fetch). Start it with: uvicorn app.main:app --port 8000 |
| I | API abort + missing asteroid data: app stays usable (navigation works) | PASS |  |
| J | 1366x768: inspector opens with an on-screen close control | PASS | {'x': 1307, 'y': 133, 'width': 28, 'height': 28} |
| J | 1366x768: Travel Mode reachable and exits with Escape | PASS | travel |
| J | 768x1024: inspector opens with an on-screen close control | PASS | {'x': 709, 'y': 133, 'width': 28, 'height': 28} |
| J | 768x1024: Travel Mode reachable and exits with Escape | PASS | travel |
| J | 430x932: inspector opens with an on-screen close control | PASS | {'x': 371, 'y': 133, 'width': 28, 'height': 28} |
| J | 430x932: Travel Mode reachable and exits with Escape | PASS | travel |
| J | 390x844: inspector opens with an on-screen close control | PASS | {'x': 331, 'y': 133, 'width': 28, 'height': 28} |
| J | 390x844: Travel Mode reachable and exits with Escape | PASS | travel |

## Additional automated suites (same session)

| Suite | Result |
|---|---|
| Travel controls (`travel_controls.py`) | 18/18 |
| App feature smoke (`app_smoke.py`) | 12/12 |
| Feature inventory (`qa_chrome_audit.py --only inventory` + re-verify) | 142 controls: 140 functional, 2 correct no-ops (already-active 'All' tab) |
| Layout, 8 viewports x Explore/Inspector at 80/100/125/150 % zoom | All PASS after fixes QA-1..QA-5 |
| Unity WebGL load paths, Chrome 156 and Edge 157 | 6/6 each |
| Vitest / tsc / Vite build / pytest | 132/132 / pass / pass / 12/12 |
