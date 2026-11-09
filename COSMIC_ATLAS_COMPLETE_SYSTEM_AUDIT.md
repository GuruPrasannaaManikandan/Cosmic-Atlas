# Cosmic Atlas — Complete System Audit (Milestone 0)

**Date:** 2026-11-08 · **Branch:** `feat/universal-realism-ui-travel` (from `main` @ `c6657eb`, PR #1 merged) · **Machine:** Intel Core Ultra 7 155H, Intel Arc integrated GPU, 15.6 GB RAM, Windows 11.

This audit re-validates the system against the **current source**, not the earlier blueprint. The repairs that followed are in [COSMIC_ATLAS_UI_AND_TRAVEL_REPAIR_REPORT.md](COSMIC_ATLAS_UI_AND_TRAVEL_REPAIR_REPORT.md).

### Evidence tags

| Tag | Meaning |
|---|---|
| **[F]** | Read in source. |
| **[M]** | Measured or reproduced by a script in this repository (`scripts/e2e/*`) or a test run. |
| **[V]** | Visually confirmed in a captured screenshot. |
| **[NR]** | Not re-verified in this milestone (existing automated coverage only). |

---

## 1. Baseline

| Item | Result |
|---|---|
| Frontend unit tests | **96/96** pass, 9 files [M] |
| Backend tests | **12/12** pass [M] |
| C# astronomy core | **22/22** pass (`dotnet test`) [M] |
| Production build | `tsc --noEmit && vite build` succeeds [M] |
| Working tree at start | Clean; `main` equal to `origin/main` [M] |

## 2. Implemented vs. documentation only

| Area | Status |
|---|---|
| Three.js app: explorer, travel, events, academy, data, search, audio | **Implemented**, running |
| Unity migration blueprint | **Document only** (design) |
| C# astronomy core (`unity-migration/`) | **Implemented and tested** headless (22 tests). Not yet inside a Unity project. |
| Unity project / URP renderer / bridge / web build | **Not implemented.** No Unity project exists in the repository. |
| Unity Editor 6000.3.28f1 | Installed. A batch-mode probe (`-batchmode -createProject` in a scratch folder) **succeeded with a valid licence** [M]. |
| Unity MCP connection | **Not connected** to this session. Editor work can only be done via batch-mode scripts and log/test verification. |

## 3. Reported defects: reproduction and root causes

### 3.1 Top navigation and layout

Reproduced with `scripts/e2e/layout_audit.py` at all 7 requested viewports [M]. Screenshots and JSON are in `docs/ui-audit/before/` [V].

| # | Symptom (measured) | Root cause [F] |
|---|---|---|
| UI-1 | At **1600 px** "Help" and "Notes" lie outside the viewport. At **1366/1280 px** "Solar System", "Data Intelligence", "Help" and "Notes" are off-screen. At **390 px**, 9 of 12 header controls are off-screen. | `.topnav` is `flex-wrap: nowrap` with ~14 controls and no collapse strategy. The `≤1080px` rule only makes the strip horizontally scrollable, with no visible affordance. |
| UI-2 | The breadcrumb bar overlaps the header at **every** size. On phones it covers the search box (`covered-by: scale-breadcrumbs-bar`). | Breadcrumbs `top: 54px` and z-index 38, while the header spans 10–64 px at z-index 25. |
| UI-3 | The search dropdown can never appear above the breadcrumbs. | The header (z 25, positioned) is its own stacking context, so `.results` (z 60) is capped at 25, below 38. |
| UI-4 | Side panels overlap the breadcrumbs (all sizes) and the timebar/dock (≤1366 px). The two panels overlap each other at ≤768 px. | Hard-coded `top: 76px; bottom: 80px` versus a bottom stack (dock, status, timebar) reaching ~154 px. There is no one-panel rule on narrow screens. |
| UI-5 | Phone: the dock wraps into a 5-row column over the timebar. The breadcrumb telemetry chips cover the trail. | `flex-wrap: wrap` without a compact layout. |

### 3.2 Travel Mode

Reproduced with `scripts/e2e/travel_controls.py` using real keyboard and mouse events in Chromium [M]. **Before: 8/17 checks passed** (`docs/travel-audit/before.json`).

| # | Symptom (measured) | Root cause [F] |
|---|---|---|
| TR-1 | Releasing S while W is held freezes the throttle (0.23 → 0.23). | Key-up zeroes the whole axis (`thrustDelta = 0`) regardless of other held keys. Same for every axis. |
| TR-2 | S never moves the ship backward. | `travelInput.reverse` is never set by any key. S only lowers the throttle to 0. |
| TR-3 | A/D rotate the ship instead of moving left/right. | Mapped to yaw; strafing was on Q/E. This doesn't match the requested scheme or the Explore-mode convention. |
| TR-4 | Throttle climbs to 100% after the window loses focus while W is held (0.65 → 1.00). | No `blur` / `visibilitychange` handling in Travel Mode (Explore mode has it). |
| TR-5 | Mouse drag in cockpit view does nothing. Releasing in chase view snaps the camera. | The pointer handler only adjusts chase/external camera offsets. |
| TR-6 | Typing "mars"/"moon" in the NavMap search closes the map. | The NavMap handler closes on `e.key === 'm'` with no check for an input target. |
| TR-7 | Escape doesn't exit Travel Mode (the flight manual says it does). | Not implemented. |
| TR-8 | The "Exit to Explore" button returns the camera to its pre-travel position. | It sets `phase` directly instead of calling `exitTravelMode()`, which copies the ship's position into `nav`. |
| TR-9 | **Autopilot to the Moon never arrives.** After 12 s it circles at ~12,600 km/s while closing ~700 km/s. | The autopilot only slerps the ship's attitude. It never steers the velocity vector, so sideways velocity is never cancelled. |
| TR-10 | A ship parked near a planet is left behind when time plays. At 1 day/s the Moon offset reaches ~41,000 km. | The ship lives in the fixed root frame with no co-moving reference. Separately, the Rig passes a `simMs` read **before** `advanceSim()` (one frame of lag ≈ 43,000 km of lunar motion at 1 day/s). |
| TR-11 | **Slow manoeuvres along the galactic X axis are lost.** At 45 km/s the per-frame step (~0.75 km) rounds to zero. | Blueprint finding D1 applies to the ship itself: positions are stored in galactic-centre ly, where 1 ULP ≈ 34 km near the Sun. |
| TR-12 | Warp near planets can jump many planetary radii per frame; collision correction teleports the ship. | No proximity speed limit; collision is tested only after integration. |
| TR-13 | The HUD G-force is wrong by ×1000 (+1 offset), and `C_LY_S` is 21 ppm too large (c = 299,798.9 km/s). | Wrong unit in the g formula; hand-typed constants (blueprint D6). |
| TR-14 | Autopilot overshoot when approaching from a higher gear. | Downshifting to gear 1 also cut braking authority to 250 km/s². |

### 3.3 Additional defects found in this audit

| # | Finding | Evidence |
|---|---|---|
| A-1 | **Timeline playback costs about 9 ms of CPU per frame** (93 fps vs 660–900 fps for static views, uncapped). | [M] `docs/perf/baseline_1366x768_uncapped.json`. Cause [F]: the Inspector (`Shell.tsx:168`), StatusBar (`Shell.tsx:536`), ScaleBreadcrumbs, TravelHUD, CockpitOverlay and NavMap subscribe to `simMs`, which changes every frame. |
| A-2 | **Orbit lines are drawn for the real current date, not the simulation date** (`orbitPolylineLy(id, Date.now())`, `orbitPathKm(..., Date.now())`). For precessing orbits (Moon: 18.6-yr nodal cycle) the drawn orbit doesn't pass through the body at other dates. | [F] `Scene.tsx` OrbitLines. Not visually reproduced. |
| A-3 | Earth's atmosphere renders as a hard bright-cyan ring (additive Fresnel rim with no scattering model). | [V] `docs/ui-audit/before/1366x768_inspector.png` |
| A-4 | The M87\* event draws a flat disk with torus rings and a jet made of **square** sprites: no lensing, no photon-ring geometry. | [V] `docs/perf/shots_1366x768/black-hole-event.png` |
| A-5 | Texture provenance (blueprint D4) is **still uncorrected**. `assetRegistry.ts` labels Solar System Scope / three.js-example / threex.planets maps "NASA, Public Domain", and `assetRegistry.test.ts` asserts it. | [F] `download_authentic_textures.py` lines 19–37 |
| A-6 | Tethys shows "Orbital period: −57.789 d" (blueprint D9). Still present. | [M] (C# tests track it) |

## 4. Feature audit matrix

| Feature | State at audit | Evidence | Unity dependency |
|---|---|---|---|
| Universe Explorer: camera, scale transitions, floating origin | Works; D1 quantisation near the Sun | [M] travel/precision tests, [F] | Core of Unity Phase 3 |
| Object selection / Inspector | Works; panel layout defects UI-4 | [M] layout audit | Stays in React |
| Breadcrumbs | Works; overlaps header (UI-2) | [M] | React |
| Search (local) | Works; dropdown under breadcrumbs (UI-3) | [M] | React |
| Search (SIMBAD live) | Backend connector unit-tested offline only | [NR] | FastAPI |
| FIND HOME (23 steps, pause/resume/skip/interrupt) | Unit-tested (order, interrupt/resume) | [NR] in browser | React orchestrates, Unity executes |
| Solar System: positions, moons, rotation | Keplerian engine validated vs Horizons; orbit-date defect A-2; spin placeholders (blueprint D2) | [M]/[F] | Unity Phase 2–3 |
| Timeline | Works; per-frame React cost A-1 | [M] | Unity clock authority |
| Travel Mode | 9/17 browser checks failed (TR-1…TR-14) | [M] | Unity port later; repaired in Three.js now |
| NavMap / autopilot | TR-6, TR-9, TR-14 | [M] | React UI + Unity execution |
| Cosmic Events (supernova, Crab pulsar, M87\*, Carina) | Run at 60 fps; visual models simplified (A-4) | [M]/[V] | Unity Milestone 3 |
| Cosmic Academy (8 missions) | 17 unit tests; detection hooks read `nav` and window events (blueprint D8) | [NR] in browser | React, needs bridge events |
| Astro Data Intelligence | 12 backend tests; 50k-point f32 layer jitters at sub-AU zoom (README) | [NR] | React + FastAPI; Unity renders points |
| Audio | 7 unit tests | [NR] | React (web) |

## 5. Rendering realism inventory (current Three.js) [F]

| Category | Current representation | Gap versus the brief |
|---|---|---|
| Planets | Textured spheres, normal/specular maps (Earth), additive Fresnel atmosphere shells, ring mesh (Saturn) | No scattering model (A-3); hard-coded axial tilts (D2) |
| Stars | Sphere + additive glow sprite. Betelgeuse has a texture; the Sun has a photosphere texture. | No spectral-class model, no limb darkening, no apparent vs intrinsic brightness separation |
| Moons | Per-body textures for the major moons (`ss_*`); neutral irregular meshes for small moons | Partial: no eclipses/transits/shadows between bodies |
| Galaxies | Additive sprites; Andromeda as a textured inclined plane; Milky Way as a procedural point cloud | No morphology classes, no dust lanes / volumetric disk |
| Nebulae | Sprites; Carina as textured planes | No volumetric depth |
| Black hole | Event renderer: flat disk, rings, square-sprite jet (A-4) | No lensing, no Doppler-correct disk |
| Pulsar | Event renderer (`PulsarRenderer.tsx`) | Not re-reviewed in this milestone |
| Asteroids / dwarf planets | 10,842-point GPU Kepler belt; irregular meshes for Phobos/Deimos-class bodies | No comets, no tails |

## 6. Performance baseline (measured)

Three.js renderer, 1366×768, Chromium with ANGLE/D3D11 on **"ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)"** [M]. Headless, so these are rendering-throughput numbers, not on-screen presentation.

| Scene | VSync-capped fps | Uncapped fps | Median / p95 / max frame (uncapped) |
|---|---|---|---|
| Intro (labelled "cosmic-web"; filaments not in frame) | 60.0 | 2105 | 0.4 / 0.7 / 7.3 ms |
| Milky Way | 60.0 | 676 | 1.4 / 2.2 / 19.0 ms |
| Solar System | 60.0 | 660 | 1.4 / 2.5 / 13.5 ms |
| Earth close-up | 60.0 | 799 | 1.1 / 2.7 / 33.6 ms |
| Moon close-up | 60.0 | 859 | 1.0 / 2.2 / 25.6 ms |
| Black-hole event | 60.0 | 843 | 1.2 / 1.7 / 12.7 ms |
| Nebula event | 60.0 | 919 | 1.1 / 1.6 / 16.7 ms |
| Travel Mode | 60.0 | 768 | 1.2 / 2.4 / 13.9 ms |
| **Timeline playback (10 d/s)** | 60.0 | **93** | **10.4 / 13.8 / 33.7 ms** (A-1) |

The JS heap was 36–43 MB. The isolated 13–34 ms max frames are likely one-off texture uploads or shader compiles on scene change; this was not profiled further. Sources: `docs/perf/baseline_1366x768.json`, `docs/perf/baseline_1366x768_uncapped.json`, screenshots in `docs/perf/shots_1366x768/`.

## 7. Unity migration dependencies

1. **Unblocked:** a Unity 6000.3.28f1 licence is active in batch mode, so a URP project can be created and tests run from the CLI.
2. **Blocked for an AI-assisted Editor workflow:** the Unity MCP bridge is not connected. Batch mode and logs are the only verification channel until it is.
3. The C# astronomy core is ready to drop in (`noEngineReferences` asmdef).
4. Travel Mode must be correct in TypeScript first. This milestone fixes it, and the repaired state machine becomes the reference behaviour for the C# port, together with the 19 new regression tests.
5. Asset provenance (A-5) must be corrected before any texture is imported into Unity.
