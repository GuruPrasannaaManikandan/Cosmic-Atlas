# Deployment Verification Report (2026-11-09)

**Result: PASS.** The live site runs `main` (`b356968`, same frontend tree as PR #9 `b409f93`) and passes all 19 live checks in Chrome.

## Proof of the deployed commit

| | Local build of `main` | Live (`https://cosmic-atlas-jk2e.onrender.com/`) at 14:49 UTC |
|---|---|---|
| JS | `assets/index-2v9BLBJf.js` | `assets/index-2v9BLBJf.js` (200, `application/javascript`) |
| Vendor | `assets/vendor-three-DKcu54yN.js` | `assets/vendor-three-DKcu54yN.js` |
| CSS | `assets/index-DDEEF0IO.css` | `assets/index-DDEEF0IO.css` |
| Published | — | `last-modified: 14:48:52 UTC` (owner's manual deploy of `main`) |

Vite file names are content hashes, so identical names mean identical built code. A hard reload with the HTTP cache disabled (L16) served the same three files.

## Live check in Chrome (clean profile, 1440×900, 14:50 UTC)

`python scripts/e2e/live_site_check.py --base https://cosmic-atlas-jk2e.onrender.com --out docs/qa/deployment`: **19/19 PASS**. Raw results are in `docs/qa/deployment/live_site_report.json`; screenshots are `docs/qa/deployment/live_*.jpg`.

| # | Area | Result | Detail |
|---|---|---|---|
| L1 | Initial load, 3-D canvas | PASS | bundle above |
| L2 | Contextual UI: no panels open by default | PASS | left, right and timeline all closed |
| L3 | Compact warp-flight HUD | PASS | "DEPARTING Laniakea Supercluster → Jupiter 10.8 s" |
| L4 | Solar System navigation | PASS | Jupiter; Io, Europa, Ganymede and Callisto labelled |
| L5 | Selection chip + on-demand Inspector | PASS | chip → Details opens the Jupiter Inspector |
| L6 | Search | PASS | "Satur" → suggestion → flies to and selects Saturn |
| L7 | Timeline | PASS | opens with T / dock button; Play advanced 1.55 days |
| L8 | Travel Mode entry continuity | PASS | ship starts exactly at the camera (Δ = 0), at rest |
| L9 | Autopilot from a destination request | PASS | active, destination Titan |
| L10 | Nav map | PASS | docked overlay (not modal), minimizes, closes |
| L11 | Escape | PASS | returns to Explore |
| L12 | Cosmic Events | PASS | event runs and exits |
| L13 | Cosmic Academy | PASS | opens |
| L14 | Settings | PASS | Flight speed select and Reduce motion present |
| L15 | Responsive | PASS | 1366×768, 768×1024, 390×844: no horizontal overflow |
| L16 | Hard reload, cache disabled | PASS | same bundle |
| L17 | Console / network | PASS | 0 console errors, 0 failed or 4xx/5xx requests |

**Planetary graphics, reviewed in the screenshots:**
- Jupiter and Saturn show a lit day side and a dark night side.
- Saturn's globe casts its shadow on the rings and hides the far side of the rings.
- The starfield is hidden behind the planets.
- The Inspector shows correct values (Jupiter radius 69,911 km, a = 5.203 AU; Saturn 58,232 km, 9.537 AU).

## Backend

`GET /api/health` → 200 `{"status":"ok","connectors":["simbad","horizons"],...}` (0.6 s while warm, 23 s from a cold start on the free plan). The backend code is unchanged since PR #1.

## Unity WebGL loader

Not applicable to production. Unity is intentionally not integrated into the live site yet.

## Before the redeploy (kept for the record)

At 14:45 UTC the live site still served the PR #4 build (`index-Bkzw5OKv.js`):
- L1 and L4 passed;
- L2 and L3 failed because those features were not in that build;
- the run stopped at L5.

Screenshots are in `docs/qa/deployment/live-before-redeploy/`. See `RENDER_DEPLOYMENT_REPORT.md` for why the redeploy was needed.
