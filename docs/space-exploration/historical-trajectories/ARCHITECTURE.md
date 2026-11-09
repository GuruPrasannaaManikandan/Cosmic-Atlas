# E. Historical Mission Timeline Architecture

## Implemented now (Phase 1)

- **Mission milestones from the catalogue in the time bar.** `MissionEventSelect` in `ui/Shell.tsx` shows the selected body's missions (Moon: 25 events) or all missions. Picking one pauses time and sets `simMs` to that sourced moment. Date-only events resolve to 00:00 UTC.
- The surface Mission Timeline tab has the same "set clock" action. The planets, the Moon's phase and the surface Sun all follow it.
- **Helpers:** `timelineEvents(bodyId)`, `missionsActiveAt(ms)` and `dateMs()` (partial dates resolve to the start of the period, so ordering checks are conservative).

## Spacecraft trajectories (Phase 6 design)

**Data source priority:**
1. **JPL Horizons** spacecraft ephemerides: Cassini −82, Voyager 1 −31, Voyager 2 −32, New Horizons −98, Juno −61, Galileo −77, MESSENGER −236, Dawn −203, MER-B cruise if available. The project already has a backend `horizons` connector (`/api/health` lists it).
2. **NAIF SPICE kernels** where Horizons coverage is missing. They would be pre-processed offline into compact vector tables; no SPICE runs in the browser.
3. **Approximate educational trajectories**, built from sourced milestone dates and positions only when neither of the above exists. They are always labelled `approximate-educational` in the data and the UI.

**Pipeline:**
- The backend endpoint `/api/trajectory/{naifId}?start&stop&step` queries Horizons. It returns heliocentric ecliptic J2000 state vectors (km, km/s, TDB) and is cached on disk.
- The frontend interpolates with cubic Hermite (position + velocity) at the current `simMs` and converts TDB↔UTC with the existing `astro/time.ts` (`jdTdbFromUtcMs`).
- It then transforms to the scene's galactic frame through the existing `eclipticToGalactic`. Units: km → ly via `LY_PER_AU`.
- **Rendering:** a polyline of the past trajectory up to `simMs` (fading), a future dashed path, and a spacecraft marker. Flyby and arrival milestones become markers on the path.
- **Labelling:** every path carries `trajectory.kind` (`reconstructed` / `planned` / `approximate-educational`) and its source. The HUD shows it.

**Time controls:** reuse the TimeBar (play, pause, reverse, rate, date picker), plus:
- a mission scrubber limited to [launch, end];
- milestone next/previous buttons;
- a "follow spacecraft" camera mode, using the existing `nav.followId` mechanism with a spacecraft pseudo-body.

**Correctness tests:**
- interpolated positions match the Horizons samples at the nodes;
- the spacecraft–planet distance at flyby milestones is a local minimum;
- TDB/UTC handling;
- scrubbing updates the position monotonically.

## Cassini-Huygens first

- **Sourced already:** launch 1997-10-15; Saturn orbit insertion 2004-06-30 (PDT); Huygens landing January 2005; Grand Finale; end 2017-09-15.
- **Missing:** the Venus ×2, Earth and Jupiter gravity-assist dates and the Huygens release date. These come from the NASA Saturn Tour page or Horizons closest-approach searches before Phase 6 starts.
