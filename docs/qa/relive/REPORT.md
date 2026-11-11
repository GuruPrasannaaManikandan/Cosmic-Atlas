# Relive Mission: M1 foundation and M2 lifecycles (local, uncommitted)

## What was built

**M1: the shared cinematic foundation.** It lives in `frontend/src/relive/`.

- **Mission script schema** (`types.ts`):
  - events carry a time basis: sourced, derived, or sequence (≈);
  - phases, pacing segments, published telemetry tracks and camera shots;
  - an explicit `illustrative` list for anything drawn without a source.
- **Timeline maths** (`timeline.ts`):
  - playback ↔ mission time, and phase and event lookup;
  - telemetry interpolation, labelled "published" or "interpolated" (and never interpolated across untimed steps);
  - GET and L+days clocks.
- **Player and state machine** (`player.ts`):
  - states: idle → intro → playing ⇄ paused → ended;
  - a requestAnimationFrame clock, plus seek, previous/next event, phase jumps and speeds from 0.5× to 8×;
  - snapshot and restore of the explorer state;
  - per-mission resume points.
- **Camera director** (`scene/director.ts`):
  - chase, side, orbit, top, ground, low and wide shots;
  - blends on wall-clock time, cuts on seeks and environment changes;
  - auto-framing from the subject's extent.
- **Audio manager** (`audio.ts`):
  - synthesised Web Audio sound design that follows the app's mute and volume;
  - event cues;
  - no archival audio.

**M2: full lifecycles.**

- **Apollo 11.** Covers the terminal count through to the flotation collar (75 events) and is built from NASA SP-4029 *Apollo by the Numbers*:
  - every GET time;
  - the ascent table (altitude, velocity, latitude/longitude at each event);
  - the Earth-orbit, translunar and transearth tables;
  - Saturn V, CSM, LM and LES key-facts dimensions.
  The coast starts from a two-body conic propagated from the published TLI state. A unit test shows it reproduces SP-4029's coast distances within 6 %.
- **Opportunity (MER-B).** Covers launch through egress on sol 7 (32 events). Sources:
  - the NASA PDS MER mission description;
  - the archived JPL MER launch-vehicle, spacecraft and EDL pages;
  - the app catalogue.
  Steps that are published in order but not timed are marked ≈ and placed between their sourced neighbours.

## Evidence (real Chrome, GPU, 1600×900)

| Check | Result |
|---|---|
| `scripts/e2e/relive_check.py` on the dev server (:5173) | PASS for both missions: intro, event card, info panel, ending with the surface hand-off, exit, snapshot restored, resume offered; ~60 fps; 0 console errors |
| The same check on the production preview (:4173) | PASS |
| Unit tests | 271/271 (25 new in `relive.test.ts`) |
| Abandoned journey | 42/42 |
| Controls | 27/27 (2 skipped) |
| `tsc` and production build | clean |

The screenshots in this folder are named `<mission>_<moment>.png`. `relive_check.json` holds the DOM readings: clock, phase and telemetry at each moment.

## Known limits

All of these are disclosed in the app under "How this is built".

- **Illustrative geometry.** The following are drawn without a source:
  - lunar-orbit geometry and the descent ground track;
  - the entry corridors and the bounce trajectory;
  - Delta II proportions (only the 2.9 m fairing and the 1168 mm strap-on motors are sourced);
  - local terrain patches.
- **LM configuration.** The LM is the NASA 3D Resources model in its landed configuration throughout.
- **Sound.** All sound is synthesised; there is no archival or licensed audio yet.
- **Dark frames.** Lighting follows the real Sun:
  - the Opportunity launch (23:18 EDT) and the Apollo 11 splashdown (pre-dawn) are dark;
  - the Apollo 11 TLI happens on Earth's night side.
- **Not started.** M3 (the automated Explore expedition), M4 (the seven other Mars sites), M5, quality presets and archival audio.
