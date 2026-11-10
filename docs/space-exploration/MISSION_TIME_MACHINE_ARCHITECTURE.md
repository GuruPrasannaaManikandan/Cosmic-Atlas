# Mission Time Machine — Architecture

**Status:**
- **Stage 1 design.** The time-conversion core is **implemented and tested** (`frontend/src/realism/marsTime.ts`).
- The event-record schema is **implemented and validated**: `mission-data/schemas/events.schema.json` and `records.ts`.
- Playback, the UI and camera choreography are **planned** (Stage 3).

## 1. Three separate time systems

No single "current time" is shared by everything. The Time Machine keeps three clocks and converts between them explicitly.

| # | Clock | What it is | Used for |
|---|---|---|---|
| 1 | **Event time (UTC / TT)** | When something happened, as an instant. Stored as ISO 8601 UTC; TT = UTC + (TAI−UTC) + 32.184 s from the leap-second table (NAIF `naif0012.tls`) | Ordering events. Sun and planet geometry (Mars24 needs TT). Lunar lighting (the existing JPL ephemeris path) |
| 2 | **Local planetary time** | Mars: Mars Sol Date, LMST and LTST at the site, plus the **mission sol**. Moon: the existing Sun-elevation model | What the sky looks like and what the mission called the day |
| 3 | **Playback time** | Presentation time: play, pause, speed and scrubbing. Maps to event time through a playback mapping, either linear or "jump to the next event" | The user's experience only. It never creates or alters a fact |

**The rule:** an on-screen time label always says which clock it shows ("UTC", "Sol 5111", "Local true solar time 13:02"). If a clock value is computed rather than published, it is labelled *computed*.

### 1.1 Mars conversion (implemented)

`marsTime(utcMs)` follows the NASA GISS Mars24 algorithm, steps A-1 to D-2 (Allison & McEwen 2000; Allison 1997). On top of it:
- `lmstHours` / `ltstHours` give local mean and true solar time;
- `sunPosition` gives solar zenith, azimuth and an East-North-Up (ENU) Sun vector (D-5, D-6);
- `missionSol` gives the mission sol.

**Verification** (`marsTime.test.ts`, 11 tests):
- **Worked example 1** (2000-01-06 00:00 UTC): every printed intermediate value is reproduced. That includes M, α_FMS, the perturbers, ν−M, Ls, EOT, MST 23:59:39, LTST 23:38:54, the subsolar longitude, declination, heliocentric distance, zenith and azimuth.
- **Worked example 2** (Spirit landing target, 2004-01-03 13:46:31 UTC at 14.640°S 184.702°W):
  - LTST = 00:00:00 and the azimuth of 179.994° are reproduced;
  - the declination comes out 0.00025° (about 1″) from the printed value when evaluated from the page's own Ls; the zenith comes out 0.00065° off. Both are recorded in the test, and both are far inside the 0.1° gate.
- **Published sol at a published time:** PIA22930 says images were taken around 9:33 a.m. PDT (16:33 UTC) on 10 June 2018, sol 5111. `missionSol` returns 5111 for that instant, counting from Opportunity's landing at 354.47417°E with MER's Sol 1 convention.

**Stated limitation:** MER ran a "hybrid" mission clock offset from LMST at the landing site (Mars24 notes: more than 37 minutes for Opportunity). Within about ±45 minutes of local midnight, a computed sol can therefore differ from the mission's own count. The rule:
- event records carry the **published** sol (`time.sol` + `solSources`);
- computed sols are only interpolated between published ones, and are labelled as computed.

**Convention table** (Mars24 notes): MER uses **Sol 1** for the landing sol. Phoenix, MSL, InSight and Mars 2020 use **Sol 0**. `missionSol` takes the convention as an argument; there is no default.

## 2. Event records

Schema: `mission-data/schemas/events.schema.json`. Types and rules: `MissionEventRecord` and `validateEvents` in `records.ts`.

| Field | Rule |
|---|---|
| `time.utc` | ISO 8601 with a time and `Z`, or `YYYY-MM-DD` (basis `date-only`), or `YYYY-MM` (basis `month-only`), or null (basis `sol-only`). The validator enforces each pairing |
| `time.basis` | `spacecraft-utc` / `earth-received-utc` / `utc-unspecified` / `date-only` / `month-only` / `sol-only`. **Spacecraft time and Earth-received time differ by the one-way light time (4–24 min for Mars).** When a source doesn't say which it is, the record says `utc-unspecified`, as Opportunity's landing and PIA22930 do |
| `time.sol` | The **published** sol only. It needs `solSources` |
| `place` | x / y / z in a declared frame (`frames.json`). A frame of kind `unknown` can be stored but never drawn |
| `status` | verified / conflicting / unverified, as in the catalogue |
| `camera` | A presentation cue only (`orbit-target`, `follow`, `fixed`, `flyover` + duration). It never carries a fact |

**Opportunity seed:** `mission-data/missions/mer-opportunity/events.json` has 10 events, from launch to the end of the mission. They include Heat Shield Rock (month-only), the darkest sky (τ about 10.8, sol 5111, PIA22930) and last contact. A test checks that launch, landing and end agree with the mission catalogue.

## 3. Playback (planned, Stage 3)

**State:**
```ts
{ clock: 'paused' | 'playing'; rate: number; eventMs: number; mode: 'continuous' | 'event-to-event'; focusEventId: string | null }
```
It is held in a zustand store, like `surfaceState`.

**Controls:**
- play / pause;
- speed: 1×, 1 sol/s and 10 sols/s in continuous mode;
- previous / next event;
- a scrubber with event ticks;
- a "Now" button.

The keyboard and screen-reader patterns follow the existing tablist work.

**Interpolation:** a rover position between two route points is linearly interpolated. That is the same method the traverse product uses, and the UI says so. Without a usable route, the rover stays at the last verified place.

**Lighting:** at every frame, `sunPosition(marsTime(eventMs), lat, lon)` drives the Sun. Atmospheric opacity comes from the τ record for that sol when it exists (`MARS_TERRAIN_AND_ENVIRONMENT.md`); otherwise it is labelled *assumed*.

## 4. "Go Back" / return to present

**Before the Time Machine changes anything, it snapshots the present state:**
- the camera pose and mode;
- the selected object and inspector tab;
- quality profile, playback state, site and the floating-origin position.

**"Return to present"** restores that snapshot exactly, the same pattern the existing **Return to orbit** uses (`exitSurface` restores the orbital view; e2e-tested).

**"Go back"** steps to the previous event or view on a history stack, capped at 50 entries.

**Tests (Stage 3):** a restore must leave the camera within 1e-6 m and 1e-6 rad of its saved pose and leave the panel state identical.

## 5. Camera choreography (planned)

- Each event can carry a cue. A cue chains:
  - **orbit-target:** circle the object at its bounding-sphere distance, reusing the inspection framing from the UI refinement;
  - **follow:** trail a moving rover along the interpolated route;
  - **fixed:** hold a viewpoint;
  - **flyover:** a spline over the terrain, kept above it by DTM height plus clearance.
- **Reduced motion:** with `prefers-reduced-motion`, every cue becomes a cut.
- **Facts:** the camera never implies a fact. For example, it shows no "view from orbit at the time" unless an orbiter image of that date is cited.

## 6. SPICE coverage (from Stage 0)

| Mission | Archive | Rover surface positions |
|---|---|---|
| Opportunity (MER-1) | `mer1sp_1000`: 2003-07-07 → 2018-06-10, 4.1 GB | `mer1_surf_rover_0001_3240_v1.bsp`: **sols 1–3240 only**. Later positions: traverse product only |
| Spirit (MER-2) | 2003-06-10 → 2010-05-03 | to be listed in Stage 4 |
| Ingenuity | Mars 2020 SPICE archive: **no helicopter kernels included** | Flight log PDF (NASA) instead |

SPICE is used **offline**, to validate frames and positions. It is not shipped to the browser.
