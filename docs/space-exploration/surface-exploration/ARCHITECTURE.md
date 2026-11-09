# D. Surface Exploration Architecture

## What the repository audit found

- **Production renderer:** React 18 + React Three Fiber + Three.js 0.169 (`frontend/src/scene/Scene.tsx`).
- **Unity:** the Unity URP prototype (`A:/CA/unity/CosmicAtlas`) is **not** integrated into production. It ran in a separate WebGL validation harness only.
- **Decision:** surface exploration uses the established R3F path. No second renderer was introduced.
- **State:**
  - zustand `useStore` (phase, selection, `simMs` clock, quality);
  - mutable `nav` (camera position and orientation, `followId`);
  - `shipState` (Travel Mode);
  - `travelEngine` (warp flights).
- There was no mission infrastructure before this phase. Existing reusable pieces:
  - the `simMs` time engine and TimeBar;
  - the JPL Keplerian ephemeris (`astro/ephemeris.ts`);
  - the IAU frames;
  - the `positionOf()` / `distanceTo()` helpers;
  - the quality tiers;
  - the lazy-loaded module pattern in `App.tsx`.

## Modules (`frontend/src/surface/`)

| Module | Responsibility | Interface |
|---|---|---|
| `sites.ts` | Explorable sites: body, origin (the LM's LRO position), gravity (sourced), and placed objects from **catalogue coordinates** | `SURFACE_SITES`, `sitesForBody()`, `catalogueSitesFor()` |
| `geo.ts` | lat/lon ↔ local metres (+x east, +y up, +z south), compass bearing | Pure functions |
| `terrain.ts` | Seeded procedural terrain: noise, ~900 craters in a spatial hash, rocks. Flattened to the **measured** relative elevations of the hardware | `Terrain.heightAt/normalAt/rockColliders` |
| `lighting.ts` | Sun direction at the site from the shared `simMs` clock: JPL ephemeris + IAU 2015 Moon rotation (secular terms). Earth's mean direction | Pure; unit-tested against the Apollo 11 landing and the EASEP sunset |
| `controller.ts` | Character physics and the gait solver | `stepCharacter(state, input, params, ground, colliders, dt)`, `gaitPose()` — pure and unit-tested |
| `surfaceState.ts` | Surface UI state: intro, pause, map, panel, discovered, waypoint, HUD snapshot | zustand `useSurface`; `window.__surface` for tests |
| `models/*` | Procedural astronaut rig and hardware reconstructions, component anchors and colliders | `<HardwareModel modelId highlight tilt/>`, `<Astronaut ref/>` |
| `SurfaceScene.tsx` | Its own R3F Canvas: terrain, horizon ring with real curvature drop, rocks, sky (stars, Earth, Sun), hardware, player, camera rig, footprints, ballistic dust | Props: `site` |
| `SurfaceMap.tsx` | Map: hillshade of the generated grid, markers, waypoint, scale bar, north arrow, zoom and pan; also the minimap | Reads `useSurface` |
| `DiscoveryPanel.tsx` | Tabs: Inspect, Historical Story (text-first, optional Web Speech narration with subtitles), Technical Specifications (facts with verification badges and citations), Mission Timeline ("set clock"), Science | Reads the catalogue only |
| `SurfaceExperience.tsx` | Root: scene + HUD (compass, prompt, banner, minimap, night warning) + pause and help | Lazy chunk (61 kB, 22 kB gzipped) |
| `ExploreSurface.tsx` | Contextual **EXPLORE MOON** action (camera within 120,000 km of the Moon) and the site picker | Eager; tiny |

## Integration with the app (reversible)

```text
Orbit (explore or travel)
  │  approach the Moon → EXPLORE MOON → site picker → Descend
  ▼
store.enterSurface(siteId)
  - in Travel Mode, exits it first (its continuity rules apply)
  - saves the orbital view RELATIVE to the followed body (pos − body), plus quat, follow, selection, play state
  - surfaceSiteId = siteId; the clock pauses
  ▼
App: .app[data-surface] hides the orbital UI
     CosmicCanvas frameloop = 'never' (no GPU work; its state is kept)
     lazy SurfaceExperience mounts its own Canvas
  ▼
store.exitSurface()
  - restores pos = body(simMs_now) + offset, so it still works if the clock was moved on the surface
  - restores quat, follow, selection and play state
  - re-enters Travel Mode if that is where the user came from
```

**Shared clock:** the surface lighting is driven by the global `simMs`. Changing it from the Mission Timeline tab, or with the night-warning button, moves the real Sun at the site. Apollo 11 at 1969-07-21 03:30 UT gives a Sun 14.2° above the eastern horizon. A date after the 3 Aug 1969 local sunset gives lunar night lit only by earthshine.

## Controls and physics

- **Movement:** W/A/S/D relative to the camera. Shift = lope. Space = hop. Mouse = pointer-lock look, or drag as a fallback. E = inspect. M = map. V = first/third person. H = help. Esc = pause, or close the open layer.
- **Gravity** comes from the body record (Moon 1.62 m/s², NSSDCA). Jump take-off speed is the same on every body, so the apex follows v²/2g: 0.69 m on the Moon, 0.30 m on Mars.
- **Gameplay tuning (not measured astronaut data):** walking 1.1 m/s and lope 2.2 m/s on the Moon. Acceleration and braking are scaled by a traction factor that falls with gravity.
- **No sliding:**
  - limited acceleration and braking, and a hard stop below 2 cm/s;
  - the gait phase is driven by distance travelled and the leg swing is sized from the step length (unit-tested: foot travel = step length);
  - the stride lengthens and turns into a bounding lope in low gravity.
- **Collision:** circle colliders for rocks and hardware, from per-model footprints rotated to the placement. Ground snapping on slopes; the site boundary is clamped.

## Discovery flow

1. Within the notice radius → the object is added to `discovered` and a **DISCOVERED: …** banner shows for 5 s.
2. Within the interact radius → the "E Inspect …" prompt appears. A button gives the same action on touch devices.
3. **E** opens the record. The camera switches to orbiting the object and opens on its front (the LRRR's Earth-facing array, the LM's ladder side). The astronaut is hidden and a soft inspection fill light is added.
4. Choosing a component focuses the camera on its anchor and highlights it.

## Upgrade path

- **Real terrain:**
  - replace `Terrain.heightAt` with a sampler over an LROC NAC DTM of the Apollo 11 site (or LOLA gridded data for wider areas);
  - same interface, plus tiling and a LOD ring;
  - the hardware anchors stay valid because they are measured positions.
- **Mars:** add `sites.ts` entries with MOLA/HiRISE-derived terrain, `SURFACE_BODIES.mars` (3.73 m/s², already sourced), dust and an atmosphere sky. No module changes are needed.
- **Titan:** a haze sky and a 1.35 m/s² gravity record, which still needs a source.
