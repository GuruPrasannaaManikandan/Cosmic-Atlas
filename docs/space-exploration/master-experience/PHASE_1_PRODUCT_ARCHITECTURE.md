# Phase 1: Product Architecture

**Date:** 2026-11-10.
**Status:** **proposal for review.** Nothing in it is implemented. It extends, and does not replace:
- `MISSION_TIME_MACHINE_ARCHITECTURE.md`
- `historical-trajectories/ARCHITECTURE.md`
- `FINAL_VISUAL_REALISM_SPEC.md`
- `COSMIC_ATLAS_UNITY_MIGRATION_BLUEPRINT.md` §7

**Inputs:**
- `PHASE_0_DIRECTIVE_GAP_AUDIT.md`
- `mission-research/DEEP_SPACE_RESEARCH.md`
- the Stage 2 gate results (PR #13)

## 1. Principles

1. **One definition, many renderers.** The expedition and every historical replay are **data**: sequences of stages or chapters. A single React director runs them. Unity and R3F only implement *stage kinds*, so nothing is built twice for the Moon and Mars.
2. **No mission logic in shared systems.**
   - Shared systems know about stage kinds: `launch`, `heliocentric-cruise`, `flyby`, `orbit-insertion`, `edl`, `surface-ops`, `flight-log`, `solar-encounter`, `release`, `end`.
   - Mission specifics live in `mission-data/missions/<id>/`.
3. **Provenance on every frame.** Each chapter carries one of three tiers, shown on screen:
   - **recorded:** published data such as images or a measured route;
   - **data-driven reconstruction:** SPICE or Horizons vectors, or a registered traverse;
   - **educational reconstruction:** sourced dates with illustrative motion.

   The fictional user expedition is a fourth, separate label: **"Your expedition (fictional)"**.
4. **Honest availability.** A catalogue entry shows exactly what exists: `catalogue`, `inspect-basic`, `inspect-components`, `replay`, `visit-surface`.
5. **Renderer authority as in the spec:**
   - Moon surface: R3F, until Stage 6.
   - Mars surfaces, hardware inspection, expedition cinematics and replays: Unity.
   - Catalogue, panels, timeline UI and text: React.
6. **Never two live WebGL canvases.** When Unity is mounted, the R3F canvas is unmounted, and the reverse (Phase 0 risk R2).

## 2. Product structure and navigation

```
Home ── A. Explore the Solar System ── orbital view (existing) ── Choose destination (Moon | Mars)
     │                                                              └─ Expedition (§4) ─► Surface exploration
     ├─ B. Abandoned but Not Forgotten ── Catalogue (§3) ── Spacecraft page ── Inspect (§5) ── Go Back (§6)
     │                                                                   └─ Visit on the surface (if visit-surface)
     └─ C. Mission Stories and Science ── Story list (stories.ts) ── Story player (same replay engine, §6)
```

- **Routes:**
  - `/explore`
  - `/explore/expedition/:body`
  - `/surface/:siteId`
  - `/spacecraft` (catalogue)
  - `/spacecraft/:objectId`
  - `/spacecraft/:objectId/replay`
  - `/stories`
  - `/stories/:id`
- **Hash routing** keeps refresh and back working on the static Render host. On refresh, a deep link rebuilds its state from the URL and the saved snapshot (§6.5).
- **The existing `Spacecraft` archive modal becomes the catalogue page.** Its NASA-model validation is reused.
- **App modes** (one store field, used by the input manager and the bridge):

  `MAIN_MENU`, `CATALOGUE`, `EXPEDITION_CINEMATIC`, `PLANETARY_EXPLORATION`, `VEHICLE_EXPLORATION`, `HARDWARE_INSPECTION`, `HISTORICAL_REPLAY`, `UI_INTERACTION`, `SPACECRAFT_FLIGHT` (the existing free flight)

## 3. Catalogue model v0.2 (extends `frontend/src/missions/schema.ts`)

```ts
type Scope = 'nasa' | 'nasa-esa-collaboration' | 'out-of-scope'          // out-of-scope entries are never listed
type AgencyRole = 'built' | 'operated' | 'instruments' | 'launch' | 'mission-lead' | 'partner'
interface AgencyContribution { agency: string; roles: AgencyRole[]; detail: string; sources: string[] }

type MissionStatusV2 =                                                    // directive vocabulary
  | 'operational' | 'extended-mission' | 'mission-completed' | 'mission-concluded' | 'communication-lost'
  | 'decommissioned' | 'intentionally-destroyed' | 'landed-inactive' | 'unknown'

type Category = 'surface-rover' | 'helicopter' | 'lander' | 'orbiter' | 'deep-space-probe' | 'solar-probe'
  | 'atmospheric-probe' | 'human-exploration' | 'sample-return' | 'scientific-satellite'

type PowerKind = 'solar' | 'rtg' | 'mmrtg' | 'battery-only' | 'fuel-cell' | 'mixed'
interface PowerSystem { kind: PowerKind; detail: Fact<string>; electricalW?: Fact<string>; units?: Fact<number> }
// e.g. Voyager 1: rtg, "3 × MHW-RTG", ~158 We each at launch (nasa-voyager1)

type ReplayType = 'A-surface-rover' | 'B-helicopter' | 'C-orbiter' | 'D-deep-space' | 'E-solar' | 'F-lander' | 'G-human-lunar'
type Availability = 'catalogue' | 'inspect-basic' | 'inspect-components' | 'replay' | 'visit-surface'

type ObjectLocation =
  | { kind: 'surface'; position: Fact<SurfacePosition> }
  | { kind: 'orbit'; body: string }
  | { kind: 'heliocentric'; note: string }                        // Voyager, Pioneer, Parker
  | { kind: 'destroyed'; where: string; date: Fact<string> }      // Cassini in Saturn's atmosphere
  | { kind: 'unknown' }
```

- **Additions to `Mission`:**
  - `scope`
  - `contributions: AgencyContribution[]`. Cassini = NASA (built, operated) + ESA (built Huygens) + ASI (partner; detail to verify).
  - `statusV2: Fact<MissionStatusV2>`
  - `category: Category[]`
  - `replay?: { type: ReplayType; definition: string }`
- **Additions to `PhysicalObject`:** `power: PowerSystem | null`, `location: ObjectLocation` and `availability: Availability[]`.
- **Migration from the 5 existing statuses:**
  - `completed` → `mission-completed`
  - `ended` → `mission-concluded`, or something more specific from sources (Cassini → `intentionally-destroyed`, Opportunity → `landed-inactive`)
  - `operating` → `operational` or `extended-mission`
  - `lost` → `communication-lost`
  - `unknown` stays `unknown`

  A validator test forbids, for example, `intentionally-destroyed` together with `availability` containing `visit-surface`.
- **Filters** (all derived from fields, none hand-maintained): destination/body, type (`category`), agency (any contribution), launch period (decade buckets from `launch`), status, power (`kind`), mission category (`classes`).
- **Data location:**
  - The TypeScript catalogue stays the source of truth for v0.2, since its validators and tests are already there.
  - A build step exports it to `mission-data/catalogue.v2.json`, which `mission-data/schemas/` validates. FastAPI serves that file as `/api/catalogue` and Unity reads it on `session.init`. One copy of each fact.

## 4. Planetary expedition (Part 3)

### 4.1 Sequence definition (data, per destination)

`mission-data/expeditions/{moon,mars}.json`:

```jsonc
{ "id": "expedition-mars", "label": "Your expedition (fictional)", "body": "mars",
  "stages": [
    { "kind": "prep",            "durationS": 20, "captions": ["…"] },
    { "kind": "launch",          "durationS": 35, "events": ["ignition","liftoff","max-q","staging","separation"] },
    { "kind": "transfer",        "durationS": 30, "trajectory": "hohmann-like-educational",   // never labelled exact
      "show": ["earth-recede","planet-positions","eta-real-vs-cinematic"] },
    { "kind": "approach",        "durationS": 20 },
    { "kind": "edl",             "durationS": 45, "profile": "mars-atmospheric" },            // Moon: "lunar-powered-descent"
    { "kind": "touchdown-settle","durationS": 8 },
    { "kind": "egress",          "durationS": 25, "hatch": "side-hatch", "ladder": true },
    { "kind": "handoff",         "to": "surface", "site": "mars-endeavour-perseverance-valley" } ] }
```

- **EDL profiles are per body and are never shared.**
  - `mars-atmospheric`: heat shield, peak heating, parachute or other aerodynamic deceleration, powered terminal descent.
  - `lunar-powered-descent`: braking burn, pitch-over, legs deployed, touchdown. **No atmosphere effects.**
- **Neither profile copies a NASA mission's sequence**, and none is labelled as one.
- **Physics constants come from `planets.ts`:** Moon g = 1.62 and Mars g = 3.73 m/s², sourced. The directive's "≈3.71" is shown as "≈3.7".

### 4.2 Director and renderers

- **`ExpeditionDirector` (React, zustand):**
  - owns the stage index, pause, skip and the caption and narration cursor;
  - emits the bridge events;
  - **skip = jump to `handoff` with the same end state as playing to the end.** A test checks that the state reached by skipping and by playing is identical.
- **Stage renderers:**

  | Stage | Renderer |
  |---|---|
  | `prep`, `launch`, `transfer`, `approach`, `edl`, `touchdown-settle`, `egress` | **Unity** `PlanetaryTravelSystem` + `EDLSystem` + `CinematicCameraSystem`, in its own additive scene so it can be unloaded before the surface loads (heap budget, risk R4) |
  | `handoff` → Mars | Unity loads the surface scene. The astronaut is placed at the vehicle's hatch pose |
  | `handoff` → Moon | Unity unmounts, then R3F `enterSurface(site)` runs in a new **"arrived" mode**. The existing descent intro is skipped and the astronaut starts at the expedition lander's ladder. The expedition lander is a separate fictional model, **never an Apollo LM** |

- **The transfer is educational, not historical.** It shows a sourced planet configuration at the chosen date and a transfer arc labelled "illustrative transfer", with the real-world travel time beside the compressed cinematic time.

### 4.3 Controls during the expedition

Input mode `EXPEDITION_CINEMATIC` has only these bindings:

| Key | Action |
|---|---|
| Space | pause / resume |
| Esc | menu: skip / quit |
| K | captions |
| N | narration |

There is no movement. The arrival can be replayed from the surface HUD menu.

## 5. Universal inspection (Part 6)

- **Tabs are computed from data. An empty tab is not shown.**

  | Tab | Shown when |
  |---|---|
  | Inspect | always |
  | Historical Story | `stories.ts` has an entry |
  | Technical Specifications | any verified dimension or mass |
  | Mission Timeline | milestones ≥ 1 |
  | Science | science records |
  | Power and Engineering | `power` ≠ null |
  | Mission Replay | `availability` includes `replay` |

  This extends `DiscoveryPanel.tsx`, which already has the first five.
- **Viewers:**
  - Moon objects on the surface: existing R3F inspection.
  - Everything else: Unity `HardwareInspectionSystem`, in an **inspection hangar** scene (neutral studio lighting, scale figure, measuring overlay). Deep-space craft are inspected here, not on a planet.
- **Components:**
  - A component highlights only if it is a separate node in the model or has a documented region (existing rule).
  - Exploded and cutaway views only appear with a cited assembly document; the existing validator rejects them otherwise.
  - The MER `.blend` (63 named parts) is the first candidate. It needs Blender to convert.
- **Power explanations are templates per `PowerKind`, filled from sourced facts:**
  - **RTG:** Pu-238 decay heat → thermocouples → electricity; output falls over decades (Voyager: 158 We each at launch).
  - **Solar:** panels, battery, dust (Opportunity: τ 10.8 on sol 5111).
  - **Solar probe:** Parker's thermal protection and array cooling. **This one blocks on research** (DEEP_SPACE_RESEARCH gap 2).

  A test fails if two craft with different `power.detail` render the same text.

## 6. Universal Mission Time Machine (Part 7)

### 6.1 Replay definition (data)

`mission-data/missions/<id>/replay.json`:

```jsonc
{ "missionId": "voyager-2", "objectId": "voyager-2", "type": "D-deep-space",
  "chapters": [
    { "id": "launch",  "kind": "launch",              "events": ["v2-launch"],   "tier": "educational" },
    { "id": "cruise1", "kind": "heliocentric-cruise", "trajectory": "horizons:-32", "tier": "data-driven" },
    { "id": "jupiter", "kind": "flyby", "body": "jupiter", "events": ["v2-jupiter-ca"], "tier": "data-driven" },
    { "id": "saturn",  "kind": "flyby", "body": "saturn",  "events": ["v2-saturn-ca"],  "tier": "data-driven" },
    { "id": "uranus",  "kind": "flyby", "body": "uranus",  "events": ["v2-uranus-ca"],  "tier": "data-driven" },
    { "id": "neptune", "kind": "flyby", "body": "neptune", "events": ["v2-neptune-ca"], "tier": "data-driven" },
    { "id": "beyond",  "kind": "deep-space", "events": ["v2-termination-shock","v2-interstellar"], "tier": "data-driven" },
    { "id": "now",     "kind": "status", "tier": "recorded" } ] }
```

### 6.2 The seven types as chapter templates

| Type | Chapters | Must never contain |
|---|---|---|
| A surface rover | launch → cruise → approach → edl(mission profile) → landing → egress → surface-ops(route) → milestones → status | — |
| B helicopter | launch → cruise → edl (with host rover) → deployment → flight-log(per flight) → final flight → status | its own EDL |
| C orbiter | launch → cruise → flyby* (gravity assists) → orbit-insertion → orbital-science → milestones → end | landing |
| D deep-space | launch → cruise → flyby+ → deep-space → communication history → status | landing, EDL, orbit insertion |
| E solar | launch → venus-assist ×n → solar-orbit → perihelion+ → measurements → status | planetary landing, surface controls |
| F lander | launch → cruise → arrival → release → atmospheric-entry → descent → landing → surface-ops → end | — |
| G human lunar | launch → earth-orbit → TLI → lunar-orbit → LM descent → landing → EVA → ascent → rendezvous → return | — |

- **The "must never contain" column is a validator rule.** Pioneer 10 and 11, and Voyager 1 and 2, are separate definitions with separate events.
- **Cassini (C) ends with `end` at `saturn-atmosphere`. Huygens (F) lands on `titan`.** A test enforces both.

### 6.3 Engine

- **Unity side:**
  - `HistoricalReplaySystem` loads a definition.
  - `MissionTimelineSystem` holds the **three clocks**: event time, local planetary time and playback time (`MISSION_TIME_MACHINE_ARCHITECTURE.md` §1).
  - `TrajectorySystem` plays vector tables.
  - `EDLSystem` plays **mission-specific** EDL profiles. MER, for example, uses its own profile from sourced event times; no generic EDL exists.
- **React side:** the timeline bar.
  - Controls: play, pause, rewind, fast-forward, speed, scrub, jump to event, chapters, "Return to present".
  - Labels: the real UTC date, the mission phase, the tier label and source chips.
  - The bar receives `TIMELINE_UPDATED` from Unity at no more than 10 Hz.
- **Moon (type G) replays** run in R3F against the same definition format until Stage 6.

### 6.4 Trajectory data

- **Offline pipeline:** backend `horizons` connector → `scripts/trajectories/export.py` → `mission-data/trajectories/<naifId>.bin`. These are compact Hermite tables in heliocentric ecliptic J2000, with the TDB time base and source metadata.
- **The browser never calls Horizons or SPICE at runtime.**
- **Coverage is checked before each mission is built:**
  - Planned ids: Voyager 1 −31, Voyager 2 −32, Cassini −82.
  - Pioneer 10, Pioneer 11 and Parker: to confirm.
  - Missing coverage means the chapter tier becomes `educational` and the path is drawn as "approximate".
- **Tests:** flyby events must fall at local distance minima, and the sampled path must match the source nodes (existing design).

### 6.5 Present snapshot and restore

**`PresentSnapshot` is saved when Go Back is pressed. It holds:**
- the planet and site;
- the astronaut pose and the camera pose and mode;
- the selected object and inspector tab;
- HUD, minimap and waypoint state;
- the simulation time and the quality profile;
- the floating-origin position (Unity).

**How it's stored and restored:**
- **Unity:** `StateRestorationSystem` serialises the Unity part and React keeps its part.
- **Refresh:** both are written to `sessionStorage`, so a refresh during a replay can still return to the present.
- **Pass criteria:** pose within 1e-6 m and 1e-6 rad, and identical panel state (existing criterion).
- **Entering from the catalogue (no astronaut):** the snapshot is the catalogue state and orbital camera, restored the same way as `exitSurface`.

## 7. Unity architecture (Part 9)

- **Assemblies:**
  - `CosmicAtlas.Astro` (existing parity port)
  - `CosmicAtlas.Rendering` (existing)
  - **`CosmicAtlas.Experience`** (new). The 16 systems live here as plain C# services with typed data, plus thin MonoBehaviour adapters.
- **Scenes, loaded additively:**
  - `Boot` (bridge and quality)
  - `Travel`
  - `Surface_<site>`
  - `InspectionHangar`
  - `Replay_Heliocentric`
  - `Replay_Surface_<site>`

  At most one heavy scene is resident at a time (the heap budget, conditions C1 and C2).
- **Module groups:**

  | Group | Systems |
  |---|---|
  | Environment | `PlanetaryEnvironmentSystem` (existing Mars prototype code, generalised by site config) |
  | Actors | `AstronautSystem`, `RoverSystem`, `HelicopterSystem`, `OrbiterSystem`, `SolarProbeSystem`, which share a `SpacecraftSystem` base |
  | Narrative | `PlanetaryTravelSystem`, `EDLSystem`, `HistoricalReplaySystem`, `MissionTimelineSystem`, `TrajectorySystem`, `CinematicCameraSystem`, `StorytellingSystem` |
  | Interaction | `HardwareInspectionSystem`, `StateRestorationSystem` |

## 8. React–Unity bridge (adopts blueprint §7.3 protocol v1)

- **Envelope:** `{ v: 1, id, type, ts, payload }`. Unity sends `bridge.ready { protocol, build, catalogVersion, capabilities[] }` and React replies `session.init`. No other message is allowed before this handshake.
- **The directive's 19 events become typed messages, each with a JSON schema** (`mission-data/schemas/bridge/*.schema.json`), validated on both sides:

  | Direction | Events |
  |---|---|
  | React → Unity | `PLANET_SELECTED`, `TRAVEL_STARTED`, `GO_BACK_REQUESTED`, `REPLAY_PAUSED` (as a command), `RETURN_TO_PRESENT`, `OBJECT_SELECTED`, `INSPECTION_OPENED` |
  | Unity → React | `LAUNCH_COMPLETED`, `PLANET_APPROACH_STARTED`, `LANDING_STARTED`, `LANDING_COMPLETED`, `ASTRONAUT_DEPLOYED`, `EXPLORATION_STARTED`, `OBJECT_DISCOVERED`, `REPLAY_STARTED`, `TIMELINE_UPDATED` (≤ 10 Hz), `MISSION_EVENT_CHANGED`, `REPLAY_COMPLETED`, `PRESENT_RESTORED` |

  An invalid message is dropped and answered with `bridge.error`.
- **Failure handling:**
  - Unity load timeout (20 s), WebGL2 missing, or a crash → React shows "3D view unavailable", and everything React owns keeps working: catalogue, stories, specifications and timelines.
  - The Moon (R3F) keeps working whatever happens to Unity.
- **Keyboard:**
  - React's input manager is the only owner of the binding table.
  - The table is sent to Unity in `session.init`.
  - While React UI has focus, `WebGLInput.captureAllKeyboardInput = false`.
  - Inside Unity gameplay modes, Unity reads keys through the same bindings, so WASD moves and the arrows turn the camera in both renderers.
  - **No per-frame input over the bridge.**

## 9. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| D1 | Embed Unity in the React app now, starting with bridge v1 (handshake, validation, fallback), as the first Unity milestone | **Yes.** Every Unity scenario depends on it |
| D2 | Chandrayaan-3 (ISRO) and its two objects | Mark `scope: out-of-scope`: hidden from every list, data kept in the repo. Alternative: delete it |
| D3 | 3D assets for the fictional expedition vehicle, the rocket and the Unity astronaut. No NASA asset fits a fictional vehicle | (a) Original models built procedurally in Unity at production quality, with the risk that they look less realistic; (b) licensed or CC-BY assets you choose; (c) your own art. **Asset licences need your approval in every case** |
| D4 | Mars landing site for the expedition and the present-day Opportunity | **Endeavour crater rim / Perseverance Valley** (where Opportunity rests now). Needs the Endeavour DTM processing and a sourced final position. Victoria stays the historical replay site |
| D5 | Order of work | Controls fix first (small), then Unity embed (D1), catalogue v0.2, then the vertical slice |
| D6 | Downloads (each needs your yes): Endeavour orthoimage; PDS τ data set; MER-1 SPK subset; Horizons vector tables | Approve only per milestone as they are needed |

## 10. First complete vertical slice (for review before mass implementation)

**VS1, "Opportunity, end to end".** This covers acceptance Scenarios 1, 2 and 7 for the Mars / type A path, and Scenario 8 (Moon preserved).

| Milestone | Delivers | Exit evidence |
|---|---|---|
| M0 Controls | Install the input manager; move surface, travel and orbital views onto it; ControlsPanel | The 16 control checks pass in the browser (`controls_check.py`), Vitest passes, and the Moon e2e suites pass |
| M1 Unity embed and bridge v1 | Mount and unmount Unity in React; handshake; schema validation; fallback; heap measured inside the shell (condition C4) | Bridge contract tests; Stage 2 benchmark re-run embedded; Unity-failure test |
| M2 Catalogue v0.2 and "Abandoned but Not Forgotten" page | Schema extensions, status and scope migration, filters, cards with availability, Opportunity and the deep-space entries researched so far | Validator tests (scope, status, availability, power); browser check at every supported viewport |
| M3 Mars expedition | `expedition-mars.json`; Unity Travel scene; Mars EDL profile; egress; hand-off to the Endeavour surface; skip = play end state | `ASTRONAUT_DEPLOYED` reached by playing and by skipping; heap below budget per stage; captions and narration |
| M4 Unity astronaut on Endeavour | Astronaut controller (same bindings, g = 3.73), third and first person, discovery prompt for Opportunity at its sourced position | Movement checks in Unity; the Opportunity prompt shows the true status: `landed-inactive`, silent since 2018-06-10, mission ended 2019-02-13 |
| M5 Inspection and Go Back (type A) | Seven tabs, MER `.blend` parts (if D3/Blender is approved), replay from the 10 sourced Opportunity events, Victoria traverse chapter (registered locally), return to present | The snapshot-restore test; every chapter shows its tier; no unsourced event |

**VS1 is the review gate.** After it, Phase 5 (deep space) reuses everything except the Mars-specific stage renderers. It adds `heliocentric-cruise`, `flyby` and `solar-encounter` stage kinds and the `InspectionHangar`.

## 11. How acceptance is tested

| Scenario | Automated check | Manual / visual |
|---|---|---|
| 1 Travel to Mars | Playwright: select Mars → wait for `ASTRONAUT_DEPLOYED` → movement keys move the astronaut; the skip path reaches the same state | screenshots per stage at 1366×768 and 390×844 |
| 2 Opportunity | Discover → inspect → Go Back → `REPLAY_COMPLETED` → Return → pose restored within tolerance | narration review |
| 3–6 Deep space | Validator: no `landing`, `edl` or `surface` chapter in types D and E; Voyager 2 has 4 flybys and Voyager 1 has 2; Huygens lands on Titan; Cassini ends in Saturn's atmosphere | — |
| 7 Return to present | One restore test per replay type | — |
| 8 Moon | The existing `moon_sites_check.py`, `surface_exploration_check.py` and `storytelling_check.py` suites must pass after every milestone | — |
