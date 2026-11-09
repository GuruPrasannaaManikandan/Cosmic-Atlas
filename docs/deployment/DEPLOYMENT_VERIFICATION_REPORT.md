# Deployment Verification Report (2026-11-09)

**Result: the live site does NOT run `main`.** It is healthy, but it serves the PR #4 build (`8504a14`). The Travel overhaul (PR #9) is merged into `main` but not deployed. See `RENDER_DEPLOYMENT_REPORT.md` for the cause and the dashboard steps.

## Live check in Chrome (clean profile, 14:45 UTC)

`python scripts/e2e/live_site_check.py --base https://cosmic-atlas-jk2e.onrender.com --out docs/qa/deployment/live-before-redeploy`. Screenshots are in that folder.

| Check | Result | Meaning |
|---|---|---|
| L1 initial load, 3-D canvas | **PASS** | Bundle `index-Bkzw5OKv.js` / `vendor-three-B0AfMsil.js` / `index-BEoNyWTm.css` = PR #4 build |
| L2 no panels open by default | FAIL (expected for this build) | Left and right panels open by default: PR #4 behaviour, not PR #9 |
| L3 compact warp HUD | FAIL (expected for this build) | `.flight-hud` is not in this build |
| L4 navigation to Jupiter; Io, Europa, Ganymede, Callisto labelled | **PASS** | Core Solar System navigation works on the live build |
| L5 onward | not run | The script stops at the selection chip's **Details** button, which only exists in the PR #9 build |

These failures show that the deployed build is older than `main`. They are not regressions in `main`. The same script's checks for those features (L2, L3, L5, L8–L10, L14) passed against `main`'s build locally (`travel_overhaul_check` 30/30, journeys 40/40, smoke 12/12).

## Backend

`/api/health` → 200 `{"status":"ok","connectors":["simbad","horizons"],...}` (23 s cold start, free plan).

## Unity WebGL loader

Not applicable to production. Unity is not integrated into the live site, as the earlier milestone constraint required.

## Still to verify (after Render publishes `main`)

1. Live `/` serves `assets/index-2v9BLBJf.js`.
2. `live_site_check.py` passes all of L1–L17: Inspector, search, timeline, Travel Mode, nav map, Cosmic Events, Academy, settings, responsive layouts, hard reload, and console/network errors.
3. Update this report with those results.
