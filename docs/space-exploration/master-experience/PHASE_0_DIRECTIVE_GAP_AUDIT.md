# Phase 0: Repository Audit Against the Master Implementation Prompt

**Date:** 2026-11-10.
**Code audited:** `main` at `b6357b1`, plus the Stage 2 evidence on `docs/stage-2-mars-gates` (PR #13).
**Rule:** this audit changed no application code. Each row says what exists in the code, not what the earlier reports claim.

**Key:**
- **have:** implemented and tested;
- **partial:** some of it exists; the gap is stated;
- **design only:** documented, no code;
- **missing:** nothing exists.

## 1. Headline findings

1. **Unity is not embedded in the React app.**
   - The two Unity builds (the M2 showcase and the Mars prototype) run as separate pages.
   - The "versioned bridge" is a **design** (`COSMIC_ATLAS_UNITY_MIGRATION_BLUEPRINT.md` §7.3, protocol v1, marked [R]). The code is two one-way `jslib` calls that write `window.__atlas` / `window.__mars`.
   - Every directive scenario that runs in Unity (Mars travel, Opportunity on Mars, replays) depends on this embedding. **It is the first engineering prerequisite.**
2. **The present-day Opportunity is not where the Mars prototype is.**
   - The prototype shows **Victoria crater** (Opportunity entered it on sol 1291, in 2007).
   - Opportunity's present-day resting place is **Perseverance Valley on the rim of Endeavour crater**. In the catalogue its coordinates are `unverified`.
   - So Scenario 2 ("the astronaut discovers Opportunity") needs the Endeavour DTM and sourced final coordinates. Victoria remains a correct **historical** replay location.
3. **The catalogue has the right foundations but the wrong taxonomy for this directive.** It has 40 missions and 27 objects, every value is a sourced `Fact`, and the source and story layers are separate. But:
   - its status vocabulary has 5 values, while the directive has 9;
   - it has no power architecture, no agency roles, no replay type and no "experience availability";
   - objects can only have surface locations;
   - **Parker, Surveyor, MGS, Odyssey, MRO, MAVEN, Sojourner and Ingenuity-as-its-own-entry are missing.** Voyager and Pioneer are one-line stubs.
4. **Out-of-scope content is in the catalogue:** Chandrayaan-3 (ISRO), with its lander and rover. Huygens is flagged `nasaMission: false` with no "NASA–ESA collaboration" scope. **This needs your decision** (Phase 1 §8).
5. **The controls fix from the previous handoff is still open.** The input manager exists but isn't installed, and the arrow keys still move the astronaut and steer the ship. Every gameplay feature in this directive sits on top of it.
6. **The expedition is new work.**
   - Today, "Travel Mode" is a free-flight spacecraft game in the orbital view, with autopilot and warp.
   - The Moon surface has a short descent intro.
   - Missing: launch, staging, a transfer trajectory, EDL, astronaut emergence, and an expedition vehicle or astronaut asset in Unity.

## 2. Directive part by part

| Part | Requirement | State | Evidence and gap |
|---|---|---|---|
| 1 | "Abandoned but Not Forgotten" main section, three entry points | **partial** | There is a `Spacecraft` archive modal (`SpacecraftArchive.tsx`, NASA 3D models validated against dimensions) and an Explore menu in `TopNav.tsx`. No catalogue page, no three-entry home, no Mission Stories section |
| 1.2 | Searchable catalogue: 8 filters, 9 card fields | **missing** | The data supports destination, agency, launch and status. Missing: power, category, mission duration (as a field), "experience available" |
| 2 | Scope: NASA plus verified NASA–ESA | **partial** | `agency` + `partners` + `nasaMission` exist; there is no scope field. Chandrayaan-3 is out of scope |
| 2.1 | Moon: Apollo ×6, Surveyor, LRO | **partial** | Six Apollo missions with objects and sites: have. LRO and LCROSS: stubs. Surveyor: missing |
| 2.2 | Mars priority list (16 craft) | **partial** | Opportunity, InSight and Mars 2020: sourced. Viking, Pathfinder, Spirit, Phoenix, Curiosity and Mariner 9: stubs. MGS, Odyssey, MRO and MAVEN: missing. Sojourner and Ingenuity: not separate entries |
| 2.3 | Voyager ×2, Pioneer ×2, Cassini, Huygens, Parker | **partial** | Cassini and Huygens are sourced (5 and 2 milestones). Voyager and Pioneer: stubs. Parker: missing. Research for all of them is in `mission-research/DEEP_SPACE_RESEARCH.md` (this phase) |
| 3 | Automatic Earth → Moon / Mars expedition (stages 1–8) | **missing** | Reusable parts: the orbital scene and ephemerides, `travelEngine` (progress and ETA), `SpacecraftModel`, the Moon descent intro, and `enterSurface` / `exitSurface` (the saved-orbit pattern) |
| 3.3 | Skip, pause, captions, narration, replay arrival | **partial** | The narrator and captions exist on the surface (`narrator.ts`, `GuideBubble`). There is no expedition controller |
| 3.4 | Planet-specific physics | **partial** | `planets.ts` holds sourced gravity (Moon 1.62, Mars 3.73). Mars is `planned` in the web app |
| 4.1 | Mars environments (MOLA, HiRISE, CTX, HRSC; 5 regions) | **partial** | The Victoria HiRISE tile runs in Unity and passed the Stage 2 gates. Endeavour DTM: data only. Gusev, Gale, Jezero, Viking sites, a global and a regional layer: missing |
| 4.2 | Moon preserved | **have** | Six sites, LROC + LOLA. Must not regress |
| 4.3 | Quality profiles, adaptive, measured | **partial** | Four profiles measured in Unity (`GRAPHICS_PERFORMANCE_REPORT.md`). Adaptive switching: missing |
| 5 | Astronaut: walk, run, jump, 1st/3rd person, gravity | **have (Moon, R3F)** / **missing (Unity)** | The R3F astronaut controller is tested (`controller.ts`). Unity has no astronaut |
| 5.1 | Discovery prompt (name, mission, status) | **have (Moon)** | `DiscoveryPanel`, waypoint HUD |
| 6 | Inspection, 7 tabs | **partial** | 5 tabs exist (Inspect, Story, Specifications, Timeline, Science). Missing: "Power and Engineering", "Mission Replay" |
| 6.2 | Components, exploded and cutaway views | **partial** | Component schema and validator (they reject undocumented exploded views). The MER `.blend` has 63 named parts but is not converted (no Blender) |
| 6.3 | Power explanations per architecture | **missing** | No power field. Research has started: MHW-RTG ×3 (Voyager), SNAP-19 ×2 (Pioneer 10), carbon-composite TPS (Parker) |
| 7 | Universal Go Back / Time Machine, 7 replay types | **design only** | `MISSION_TIME_MACHINE_ARCHITECTURE.md` covers Mars surface replay only: the three clocks (implemented), event schema (implemented), snapshot/restore (design). Types C–G aren't designed. Trajectory design: `historical-trajectories/ARCHITECTURE.md` (Horizons → backend → interpolation) |
| 7.3 | Timeline controls | **partial** | The orbital TimeBar has play, pause, reverse, rate and date, plus milestone jumps. No replay timeline |
| 7.5 | Return to present | **partial** | Pattern: `enterSurface` saves the orbital camera relative to its body and `exitSurface` restores it (e2e-tested). No astronaut or replay snapshot |
| 8 | Spacecraft stories, about 3–4 min | **partial** | `stories.ts` (from facts) and an Opportunity storyboard draft (10 beats) |
| 9 | Unity modules (16 systems) | **partial** | Unity has the M2 Showcase (space rendering, `CosmicAtlas.Astro` parity port) and the Mars prototype (terrain, sky, Sun, profiles). The other 14 systems: missing |
| 9.2 | Bridge events (19) | **design only** | Blueprint protocol v1 has an envelope, a handshake and versioning, but no expedition or replay events. Code: minimal |
| 10 | UI refinement (overlaps) | **partial** | `ui-refinement/REPORT.md` fixed the lunar layout. The new panels (timeline, catalogue) aren't designed |
| 11 | Source provenance for every fact | **have (model)** | `Fact` / `SourceRef`; validators reject invented content |
| 12 | Performance measured | **have (Mars prototype)** | Stage 2 gates passed, with conditions C1–C6 |

## 3. Risks

| # | Risk | Consequence | Mitigation (Phase 1 architecture) |
|---|---|---|---|
| R1 | Two renderers: Moon in R3F, Mars and inspection in Unity | The expedition and replays could be built twice | One renderer-agnostic **sequence and replay definition** (data) and one React director. Renderers implement stage kinds. Moon surface hand-off at touchdown |
| R2 | Unity and Three.js running at once on an iGPU | Two WebGL contexts, memory over budget | Never run both canvases live: Unity is mounted or the R3F canvas is, never both. Measure it (condition C4) |
| R3 | No production 3D assets for the expedition vehicle, rocket and Unity astronaut | The "realistic animation" requirement can't be met with primitives | Your decision (Phase 1 §8, D3) |
| R4 | WASM heap 495 / 512 MB already in the prototype | Adding the astronaut, vehicle and EDL hardware goes over | Load scenes additively and unload them per stage. Balanced by default. Budget each stage |
| R5 | Trajectory data coverage (Pioneer, Parker in Horizons) | Replays would need approximate paths | Check coverage before Phase 5. Label `approximate-educational` where it's missing |
| R6 | Scope size: 7 replay types, about 30 craft | Breadth instead of depth | Vertical slices only. Each spacecraft is shown in the catalogue at its real availability level |
