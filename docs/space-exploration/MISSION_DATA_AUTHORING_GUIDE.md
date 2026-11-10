# Mission Data Authoring Guide

How to add a mission to the Time Machine and the engineering inspection without breaking the rules on sources.

## 1. Where things live

| Layer | Location | Format |
|---|---|---|
| Sources (every document used) | `frontend/src/missions/sources.ts` | `SourceRef`: id, title, organisation, URL, date read, what was extracted |
| Mission and object catalogue | `frontend/src/missions/catalog/*.ts` | `Mission`, `MissionObject` with `Fact<T>` values |
| **Mission records (this directive)** | `mission-data/missions/<mission-id>/` | JSON: `frames.json`, `routes.json`, `events.json`, `components.json` |
| Schemas (the contract for Unity and tools) | `mission-data/schemas/*.schema.json` | JSON Schema 2020-12 |
| Quality profiles | `mission-data/quality-profiles.json` | JSON |
| Types + semantic rules | `frontend/src/realism/records.ts` | TypeScript |
| Tests | `frontend/src/realism/records.test.ts` | Vitest. Runs both the JSON Schemas and the semantic rules over every file |

## 2. Steps for a new mission

1. **Research first.** Record each document you read in `sources.ts`, with the exact values extracted. Use primary sources: NASA/JPL mission pages, PDS products and labels, NAIF, peer-reviewed papers by the mission teams. Use secondary sites only to find primary ones.
2. **Catalogue.** Add the mission and its objects to `catalog/*.ts` if they aren't there. Hardware that is not yet a catalogue object goes in `components.json` → `plannedObjects`, with sources.
3. **Frames.** List every coordinate frame your data uses. If a product doesn't state its frame, use kind `unknown` and describe what *is* known. Never guess an origin.
4. **Events.** One record per sourced event. Pick the time basis carefully: Earth-received time and spacecraft time differ by the light time. Add `sol` only when a source publishes it.
5. **Routes.** One record per position product. Start with `points: []` and status `planned` until the data is approved, downloaded and its frame is established. Follow `HISTORICAL_ROUTE_RECONSTRUCTION.md`.
6. **Components.** Build the hierarchy from documented subsystems. For each view:
   - **exterior:** what the model actually shows (`implemented`, or `partial` if the model is coarse);
   - **exploded / cutaway / operation:** `unavailable` unless a document shows that arrangement or operation. List that document in `viewSources`;
   - **representation:** `nasa-model`, `reconstruction` (cite the drawings and photos used), `illustrative` (must be labelled in the UI) or `none`.
7. **Run the tests:** `cd frontend && npx vitest run src/realism`. The tests fail on:
   - unknown source ids;
   - verified values without sources;
   - conflicts without alternatives;
   - views without documents;
   - routes marked implemented in an unusable frame;
   - mismatched time bases;
   - disagreement with the catalogue.

## 3. Values: the three states

| State | When | Example |
|---|---|---|
| `verified` | Read from a cited source | Lander mass 550 kg (PDS instrument host) |
| `conflicting` | Sources disagree. Keep all of them in `alternatives` and explain in `note` | Rover mass: 185 kg (NASA mission page) vs 180 kg (PDS) |
| `unverified` | No source yet. `value: null`, plus a `note` on what is missing | Traverse positional uncertainty: not stated by the product |

**Never:**
- round a conflict into one number;
- fill a dimension from a model's geometry and call it a fact;
- write dialogue or radio calls for real people;
- give a time without its basis.

## 4. Template

```text
mission-data/missions/<mission-id>/
  frames.json       []  of FrameRecord
  routes.json       []  of RouteRecord
  events.json       []  of MissionEventRecord
  components.json   { "plannedObjects": [], "components": [] }
```

Copy `mission-data/missions/mer-opportunity/` as the worked example. It contains:
- conflicting values;
- frames of kind `unknown`;
- a planned route;
- EDL hardware recorded as `unavailable`.
