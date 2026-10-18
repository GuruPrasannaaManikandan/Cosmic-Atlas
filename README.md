# COSMIC ATLAS — interactive 3D universe explorer

Fly from a ~1-billion-light-year view of an (illustrative) cosmic web down to Earth, inspect catalogued landmarks,
run the **FIND HOME** guided journey, query live catalogues, and ingest unfamiliar astronomy datasets.

## Run it

Requirements: Node 18+ (tested 22.14), Python 3.10+ (tested 3.13).

```bash
cd backend && pip install -r requirements.txt && python -m uvicorn app.main:app --port 8000
```
```bash
cd frontend && npm install && npm run dev
```
Open http://localhost:5173 (Vite proxies `/api` to the backend). The 3D explorer, tour and time controls work
**without the backend**; only live catalogue search, Horizons comparison and dataset upload need it.

Build / tests:
```bash
cd frontend && npm run build && npm test
```
```bash
cd backend && python -m pytest -q
```

### Deploy / Docker

- **Live:** https://cosmic-atlas.onrender.com, hosted on Render (free plan): a Static Site, with `/api/*` rewritten to a Dockerized FastAPI service ([`render.yaml`](render.yaml)).
- **Docker:** `docker compose up --build -d`, then open http://localhost:8080. nginx serves the app and proxies `/api`, and SQLite is kept on a named volume.
- Full guide: [DEPLOYMENT.md](DEPLOYMENT.md). It covers architecture, env vars, health checks, logs, backups, redeploying and free-plan limits.
- Smoke-test any deployment: `python scripts/smoke_test_deployment.py <base-url>`.

### Keyboard Shortcuts & Navigation
- **Flight:** `W` / `↑` forward, `S` / `↓` backward, `A` / `←` strafe left, `D` / `→` strafe right
- **Altitude:** `Space` / `E` ascend vertically, `C` / `Q` descend vertically
- **Warp Boost:** `Shift` (6× velocity multiplier)
- **Mouse / Touch:** Left-drag look (pitch/yaw), Right-drag or Shift-drag pan, Wheel dolly (zoom in/out), Double-click to fly to any landmark
- **Search:** `/` or `Ctrl+K` to focus universe search
- **Quick Jumps:** Direct jump buttons in intro & topbar for Earth, Milky Way, Solar System, Andromeda, and Laniakea
- **Cosmic Academy (Tutorial):** Interactive 8-stage cadet story mode teaching attitude calibration, object inspection, scale transitions, FIND HOME, Data Intelligence, and Cosmic Events simulations. Relaunchable anytime via topbar `🎓 Academy` or Help modal.
- **Dataset Intelligence:** 1-click sample dataset ingestion (`unfamiliar_catalogue.csv`) with drag-and-drop support, 4-way spatial classification, editable schema mapping, and 3D point visualization.

Configuration (all optional, see `backend/.env.example`): `ANTHROPIC_API_KEY` enables LLM suggestions for
*unmapped* columns only; `ANTHROPIC_MODEL`; `ATLAS_DB` (SQLite path). No keys are needed for SIMBAD or Horizons.

## Architecture

```
frontend/src
  astro/coords.ts      frames & transforms (RA/Dec→galactic, ecliptic→galactic, units, sexagesimal)
  astro/ephemeris.ts   approximate Keplerian planets (JPL elements, 1800–2050) + simplified Moon
  astro/scale.ts       adaptive scale, log distance compression, LOD tiers, travel timing
  data/catalog.ts      canonical object model + curated starter catalogue (provenance, confidence, relations)
  data/tour.ts         FIND HOME landmark sequence (20 stages)
  events/*             Cosmic Events 3D simulations (Supernova, Crab Pulsar, M87* Black Hole, Carina)
  travel/*             Travel Mode 6-DoF spacecraft cockpit flight simulation
  tutorial/*           Cosmic Academy 8-stage interactive story mode & first-time onboarding system
  audio/*              Web Audio API cosmic synthesizer, drone generator, and telemetry sonification
  store/nav.ts         camera state in double-precision ly, fly-to, follow, orbit, free flight
  store/store.ts       UI/time/tour state (zustand); tour controller with pause/resume/skip/interrupt
  scene/*              R3F scene: camera-relative rendering, procedural galaxy/cosmic web/textures, controls
  ui/*                 search, browser, inspector, HUD, timeline, tour, data-intelligence panel
backend/app
  ingest/parsers.py    CSV/TSV/JSON/VOTable (+FITS via astropy, Parquet via pyarrow); plugin registry
  ingest/mapping.py    hybrid mapper: aliases → statistical/semantic profiling → optional LLM
  ingest/normalize.py  validation, unit conversion, 4-way visualizability classification, identity resolution
  ingest/units.py      unit + coordinate conversions, flat-ΛCDM comoving distance
  connectors/live.py   SIMBAD (name resolver + TAP) and JPL Horizons adapters with validation + caching
  repo.py              Repository protocol + SQLite implementation (datasets, reusable profiles, cache)
```

**Multi-scale rendering.** All positions are double-precision light-years in one root frame (Galactic-Centre
origin, galactic axes; Sun at 26,673 ly). Each frame the scene is drawn *camera-relative* (floating origin) and
divided by an adaptive scale S tied to the nearest object, so values sent to the GPU stay small. Distances beyond
10⁶ render units are log-compressed (angular size kept), and a logarithmic depth buffer covers the remaining range.
Point clouds (galaxy, cosmic web, datasets) are instanced `Points` shown only in the scale range where they matter.

## Implemented & verified

| Feature | Status |
|---|---|
| **Astronomical Visual Realism Pipeline** (2K photorealistic textures, NASA Blue Marble Earth with independent rotating clouds & specular glint, USGS lunar albedo, Viking Mars, Cassini Jupiter/Saturn with high-res optical depth rings, SDO Sun granulation, ESO-VLT SPHERE Betelgeuse convective surface, 3D inclined Andromeda M31 spiral disk, multi-wavelength Carina Nebula) | verified in browser + Playwright screenshots + 4 unit tests |
| **Astronomical Travel Engine** (8-stage formal state machine, intelligent framing by celestial object type, log-space distance easing, mid-flight retargeting, smooth cancelation, live countdown ETA & progress bar HUD) | verified in browser + 6 unit tests |
| **Hierarchical Scale Breadcrumbs** (`Cosmic Web › Laniakea › Milky Way › Solar System › [Object]` navigation ladder with live spatial scale and coordinate origin telemetry) | verified in browser + responsive styling |
| **Cosmic Academy — Your First Mission** (8-stage cadet story tutorial, real interaction detection, welcome modal, graduation screen, returning user persistence, topbar relaunch) | verified in browser + Playwright E2E + 17 unit tests |
| Free flight: drag look, right-drag/shift-drag pan, wheel dolly, WASD/arrows, Space/C vertical, Shift boost, touch rotate/pinch | implemented; mouse/keys checked in browser, touch not tested on a device |
| Click select, double-click travel, label click, search (name/alias/designation) | verified in browser + unit tests |
| Scales from ~1 Gly to planetary (Earth globe with atmosphere, Moon) | verified in browser |
| FIND HOME: 20 stages, Laniakea → Coma → Virgo → Local Sheet → Local Group → M31 → M33 → Milky Way → Orion Arm → Carina → Alnitak/Alnilam/Mintaka → Betelgeuse → Pleiades → Aldebaran → Sun → Jupiter → Saturn → (Mars) → Mercury → Venus → Earth; pause/resume/skip/explore; interruption by any input | verified in browser + unit test (order, interrupt/resume) |
| Travel Mode: 6-DoF spacecraft simulation with cockpit HUD, orbital velocity, throttle gears (Impulse/Sub-Light/Warp), autopilot dock | verified in browser + 10 unit tests |
| Cosmic Events Observatory: 3D astrophysical simulations for Betelgeuse Supernova, Crab Pulsar, M87* Black Hole, and Carina Nebula | verified in browser + 12 unit tests |
| Ambient & Interactive Audio: Web Audio cosmic background drone synthesizer, SFX audio engine, volume mixer | verified in browser + 7 unit tests |
| Arrival screen: visited route, locate Moon, return to Solar System, restart, explore | verified in browser |
| Solar-System date: play/pause/reverse/speed/date picker/now; deterministic | verified in browser (forward +3 d, reverse) + unit tests |
| Inspector: type, aliases, distance ± uncertainty & basis, RA/Dec, l/b, extent, relations (physical / membership / proximity kept separate), provenance, confidence, links | verified in browser |
| **Live SIMBAD** (CDS name resolver + TAP) | verified live (M31, Betelgeuse, unknown name → clean 502) |
| **Live JPL Horizons** vectors + “compare with model” | verified live (Mars, 2026-10-17) |
| Dataset upload, profiling, editable mapping, validation, classification, identity resolution, table (search/filter/sort), original vs normalized, 3D visualization, profile reuse | verified in browser + API tests |
| WebGL missing / context-loss banner, error boundary, quality modes, stats overlay | implemented; not fault-injected |

Tests: `frontend` 77 vitest tests across 7 test suites (`assetRegistry`, `travelEngine`, `travel`, `events`, `audio`, `tutorial`, `astro`).
`backend` 12 pytest tests across data ingestion, normalization, and coordinate transforms.
E2E automated Playwright browser verification passed with 16 visual screenshots captured.

Tests: `frontend` 21 vitest tests (transforms, units, RA/Dec parsing, ephemeris, compression/LOD functions,
catalogue relations, search, fly-to, tour interruption/resume, time engine). `backend` 12 pytest tests (units,
sexagesimal, galactic round trip, unfamiliar schemas, unit-less distances, sky-only rows, invalid/malformed rows,
redshift/blueshift/parallax handling, duplicates, exact-alias vs similar-name identity, formats & empty/unsupported
files, offline connector parsing, API end-to-end incl. profile reuse).

## Scientific honesty notes

- Starter catalogue values are curated approximations (see each object's `source`); Laniakea, Local Sheet,
  Local Group and Orion Arm are **schematic markers**.
- The Milky Way, cosmic web, background stars, nebula sprites and planet textures are **procedural/illustrative**.
- Planet positions use an **approximate Keplerian model**, labelled in the UI; Horizons is the reference.
- Planet sizes, the Sun and the Moon's distance are **exaggerated**; far distances are drawn log-compressed.
- Records with only RA/Dec are never placed in 3D; redshift/parallax/cartesian distances are flagged as assumptions;
  units are never guessed; similar names are only *candidates* for review, never merged.
- “Learning” = reusable, user-editable mapping profiles keyed by column signature. No model is trained.

## Known limitations

- NED, VizieR, Gaia and the NASA Exoplanet Archive connectors are **not implemented** (SIMBAD + Horizons are).
- No Web Worker yet: ingestion runs server-side; client-side point building is on the main thread.
- No spatial index/progressive loading for very large uploads (points are capped at 50k per request).
- The `lodFor` tiers are tested but the renderer uses continuous fades/minimum sizes rather than mesh swapping.
- No automated browser E2E test; the end-to-end route was verified manually in a browser.
- Dataset points are drawn in absolute float32 coordinates, so they can jitter at sub-AU zoom.
- Sun's galactic orbit, proper motions and epochs other than J2000 are ignored.

## 60–90 s demo

1. Opening screen (slow rotation in the cosmic web) → **FIND HOME**.
2. Let Laniakea → Coma → Virgo play; drag the mouse mid-flight to show interruption → **Resume tour**.
3. **Skip** through the Local Group (point at M31's inspector: distance ± uncertainty, provenance).
4. At the Orion belt stars, note “they only look aligned” (different distances in the inspector).
5. Arrive at the Sun/Jupiter/Saturn; press **Play** at +30 d/s, then **◀◀** to reverse; pick a date in 1969.
6. Earth arrival → **Locate Moon** → **Compare with JPL Horizons** on Earth.
7. Search “Vega” → *Search SIMBAD live* → fly there.
8. **Astro Data Intelligence** → upload `sample-data/unfamiliar_catalogue.csv` → show mappings, the
   “no distance / non-spatial” rows and the typo candidate → **Visualize** (yellow points).
