# Cosmic Atlas: Foundation Stabilisation and Planetary Realism

**Date:** 2026-11-09
**Branch:** `feat/universal-realism-ui-travel`
**Machine:** Intel Core Ultra 7 155H, Intel Arc iGPU, 15.6 GB RAM, Windows 11
**Browser:** Chromium (Playwright), ANGLE/D3D11
**Scope:** no NASA-mission, rover, lander, spacecraft or instrument work was started.

## 1. "3D render download failed": root cause

| | |
|---|---|
| **Failing message** | `Could not download the 3D renderer.` This is the Unity WebGL page template's own message (`Assets/WebGLTemplates/AtlasMinimal/index.html`). The React app has no download or export feature; a repository search found none. |
| **Failing resource** | `Build/WebGL.loader.js`, requested relative to `index.html`. |
| **Root cause** | The production build was opened **without an HTTP server serving its `Build/` folder**. The template fires this message when the loader script cannot be fetched. |
| **Second path, same cause** | Opening `index.html` from disk (`file://`). The loader script loads, but Chromium refuses `fetch()` for `Build/WebGL.data` and `.wasm` ("URL scheme "file" is not supported"). Unity logs "Failed to download file Build/WebGL.data …". **The template did not report this at all**: it stayed on "Loading 3D renderer… 0%" with an uncaught "Failed to fetch". |
| **Not a failure** | On reload, `GET Build/WebGL.data → 304, net::ERR_ABORTED`. That is Unity's IndexedDB cache revalidating the file, and the instance starts normally. MIME types (`application/wasm`), compression (disabled, no Content-Encoding needed) and CORS (same-origin) were all verified correct. |

**Fix (template; no compression or security setting was changed):**
- The template detects non-HTTP origins and says how to serve the build.
- It names the failing URL and its HTTP status (HEAD probe).
- Unity's own error banner (`showBanner`) and unhandled load rejections now reach the visible message and `window.__atlasError`.
- An inline favicon removes a spurious 404.

**Verified in Chromium** by `scripts/e2e/unity_webgl_load_paths.py`, **4/4**:

| Load path | Before | After |
|---|---|---|
| `file://` | Hung at 0% | Clear "serve over HTTP" message |
| HTTP, first visit | Loads | Loads |
| HTTP, reload through the cache (304) | Loads | Loads |
| `index.html` without `Build/` | Generic message | Names `…/Build/WebGL.loader.js (HTTP 404)` |

## 2. Unity WebGL production build

| Item | Value |
|---|---|
| Build exit status | **0**, `Result: Success`, 0 errors. All 20 warnings are unused URP Terrain shaders. |
| Size | **81.2 MB uncompressed** (wasm 56.2 MB, data 24.5 MB) |
| Compression | Deliberately disabled for local serving. **Brotli size not measured** (open item). |
| Bridge check (`unity_webgl_check.py`, Low/Medium/High) | **10/10** checks pass. |
| Load time | 6.1 s |
| WASM heap / JS heap | 166 MB (constant) / 39–47 MB |

The 10 bridge checks cover:
- the custom template and instance creation;
- Unity→JS and JS→Unity round trips (30 station × tier combinations);
- all 9 runtime shaders present;
- the catalogue surviving IL2CPP stripping (79 objects, 54 solar bodies);
- malformed input ignored;
- no console errors;
- the no-WebGL fallback.

The WebGL build is verified as a **standalone page**. It is still **not integrated** into the React site.

## 3. Uranus and Neptune (live Three.js site)

### New module and shared component

`src/astro/planetFrames.ts` (data and maths, unit-tested) and `src/scene/outerPlanets.tsx` (shared ice-giant shader and ring material) contain:

- **Rings from NASA NSSDCA fact sheets.** Values are radius, width and optical depth (retrieved 2026-11-09; pages updated 2015-10-14).
  - **Uranus:** 10 narrow main rings (6, 5, 4, α, β, η, γ, δ, λ, ε) plus the dusty ν and μ rings. Main-ring albedo is about 1.5%.
  - **Neptune:** Galle, Le Verrier, Lassell, Arago and Adams, plus the Adams-ring arcs.
  - The arcs co-rotate at 820.12°/day. Their relative placement is illustrative, and the post-2003 fading of Liberté and Courage is modelled; both are labelled in the code.
- **Ring material, physically based.**
  - Each ring contributes coverage × (1 − e^(−τ/μ)) per pixel (`fwidth`), so km-wide rings stay correct at every distance with no aliasing or artificial widening.
  - The planet shadows the rings, and the rings shadow the planet.
  - Reflected light uses a stated exposure response, 1 − e^(−G·b), like a long-exposure image.
  - Occultation and shadows are never exaggerated.
  - Dusty rings appear only in forward-scattered light, as they did for Voyager.
- **Distinct planets.**
  - Uranus: pale cyan, Minnaert limb darkening, faint zonal banding and north polar haze (both labelled as reconstruction).
  - Neptune: deep-blue observation-derived map.
- **Neptune's storms are tied to their epoch.** The 1989 Voyager Great Dark Spot and Dark Spot 2, which are baked into the map, are shown only for sim dates 1989.0–1994.85 (gone in Hubble images by November 1994). An unsourced northern oval in the map is always hidden.

### Planet orientation fix (all eight planets)

- **Before:** tilts were hardcoded Euler angles on the *spinning* mesh. `rotation.y` was overwritten every frame with x and z kept fixed, so each tilted planet spun about the parent axis instead of its own pole. Spin rates were a placeholder 0.1 rad/day for all planets except Earth and Jupiter.
- **Now:**
  - Each planet sits in an IAU body frame built with the same `frameToGalactic` the moons use, so equators, moons and rings agree. A test confirms that Uranus's moon frame and its pole are parallel to 10⁻⁵.
  - Spin follows the IAU prime meridian W(t), including the retrograde rotation of Venus and Uranus.
  - Saturn's ring shadows use the actual mesh frames.
- **Tests (`planetFrames.test.ts`, 16):**
  - For all eight planets, the angle between pole and orbit normal matches NASA within 0.35°: obliquity for prograde rotators; for Venus and Uranus, the inclination of the equator (2.64°, 82.23°).
  - Rotation periods (h): Earth 23.934, Jupiter 9.925, Saturn 10.656, Uranus 17.24 (retrograde), Neptune 16.11.
- **Data bug found by these tests:** `PLANET_POLES.mars` held only the constant terms of the IAU 2015 model, giving a 1.3° pole error. It now uses the IAU 2009 J2000 pole.

### Other defect found

`setCameraAt()` pointed the camera exactly *away* from its target (forward·target = −1). Its only app caller was the intro camera, which now faces the cosmic web as intended.

### Remaining limitations

- Planets are spheres; oblateness is not modelled for the ring shadow.
- Recent JWST/Keck features (for example Neptune's 2018 northern dark spot) are not added.
- Irwin et al. (2024) found that the true colours of Uranus and Neptune are closer to each other than the Voyager-enhanced blue of the Neptune map. The map is kept because it is the observation-derived asset, and this is noted.

## 4. Planetary consistency audit (`scripts/e2e/planet_audit.py`)

Eight planets × five camera distances (2.5, 6, 20, 150 and 2000 planet radii), lit 3/4 from the Sun, simulation paused.
- `planets/contact_sheet_balanced.jpg` and 40 individual frames; **0 console errors**.
- Each planet's appearance is continuous from close-up to point source. There are no broken LOD transitions; spheres use 64×48 segments and the rings stay anti-aliased.
- Saturn's rings now appear near edge-on, which is correct for 2025–2026, the ring-plane-crossing epoch.

## 5. Performance (measured on this machine)

| Test | Result |
|---|---|
| Live site, **headed Chromium with vsync, 1920×1080**: Uranus 2.5 R, tiers interleaved in one session (High/Balanced/Performance × 2) | **Mean 16.67 ms, p95 ≤ 16.90 ms at every tier** (locked 60 fps) |
| Live site, headed, Earth / Saturn / Uranus / Neptune at 2.5 R and 6 R (separate runs per tier) | Performance and High 16.67 ms. Balanced 17–21 ms in its runs only. All three tiers produce the same 1920×1080 buffer (DPR 1), and interleaving shows no difference, so this was measurement drift during first-time texture and shader uploads, not a tier cost. |
| Unity WebGL (headless, uncapped CPU frame interval) | Medium: black hole 9.8 ms, nebula 3.1 ms. Low: 4.1 / 5.6 ms. High: 4.2 / 7.9 ms. |
| Earlier GPU-synced Editor reference (M2 validation) | Black hole 6.6 ms, nebula 12.9 ms at Medium. Previous optimisations are preserved; no Unity shader changed in this pass. |

## 6. Regression results

| Suite | Result |
|---|---|
| TypeScript `tsc --noEmit` | Pass |
| Vitest | **132/132** (116 existing + 16 new) |
| Vite production build | Pass. The dev-only `__navApi` hook is absent from `dist`. |
| Backend pytest | **12/12** |
| Travel Mode e2e: keys, mouse, camera views, NavMap search, autopilot, station keeping, Escape | **18/18** |
| Layout audit (7 viewports × Explore/Inspector) | **14/14** |
| App smoke (`app_smoke.py`) | **12/12** |
| Planet audit | Pass, 0 errors |
| Unity load paths / bridge | 4/4, 10/10 |

The app smoke covers: Explore entry, search, selection and Inspector, fly-to Saturn, timeline rate, Find Home tour, Cosmic Events launch and exit, Academy, audio, the Data panel, and no console errors.

Unity EditMode/PlayMode were not re-run: no C# or shader changed in this pass, only the WebGL HTML template. The last results are 49/49 and 2/2.

## 7. Remaining blockers and open items

1. Compressed (Brotli) WebGL size and server `Content-Encoding` setup, needed before any hosted deployment of the Unity build.
2. Unity is not yet integrated into the React site (by design for this milestone).
3. Render deployment: the PR is opened but **not merged**. Merge needs review, and Render deploys only from `main`.
4. Nebula High/Ultra Editor cost (22–32 ms) is unchanged from the validation report.
