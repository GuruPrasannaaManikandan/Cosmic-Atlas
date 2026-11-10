# Final Engineering and Visual Realism Directive — Stage 1 Report

**Stage:** 1 — architecture, schemas, data design.
**Date:** 2026-11-10.
**Branch:** `feat/space-exploration` (PR #12, not merged).
**Scope kept:**
- no rendering or Unity scene changes;
- no downloads;
- the Moon experience untouched.

## Delivered

| Deliverable | Where | Verified by |
|---|---|---|
| Visual realism spec: renderer decision + Stage 2 gates; 1 unit = 1 m; floating origin with curvature; quality profiles; instrumentation contract | `docs/space-exploration/FINAL_VISUAL_REALISM_SPEC.md` | Review |
| **Mars time and Sun core** (Mars24 / Allison & McEwen 2000) | `frontend/src/realism/marsTime.ts` | **11 tests:** both GISS worked examples reproduced; leap-second table equals NAIF `naif0012.tls`; Opportunity Sol 1 at landing; **sol 5111 at the time PIA22930 gives (16:33 UTC on 10 Jun 2018)** |
| Record types + semantic rules (frames, routes, events, components, quality profiles) | `frontend/src/realism/records.ts` | 13 tests, including rejection tests for invented content |
| JSON Schemas (contract for Unity and authoring tools) | `mission-data/schemas/*.schema.json` | Validated in tests by a small JSON Schema 2020-12 subset validator (no new dependency) |
| Opportunity seed data | `mission-data/missions/mer-opportunity/` | Schema + semantic rules + agreement with the catalogue (launch, landing, end) |
| Quality profiles as data | `mission-data/quality-profiles.json` | Ordering rules; Balanced carries the gate |
| 11 new sources (PDS instrument host, GISS Mars24 ×2, NAIF LSK + MER-1 SPICE, traverse page + label, HiRISE DTMs ×2, PIA22930, Lemmon 2015, MOLA MEGDR) | `frontend/src/missions/sources.ts` | Every id used by the data resolves (tested) |
| Time machine architecture | `MISSION_TIME_MACHINE_ARCHITECTURE.md` | — |
| Route reconstruction method | `HISTORICAL_ROUTE_RECONSTRUCTION.md` | — |
| Authoring guide + template | `MISSION_DATA_AUTHORING_GUIDE.md`, `mission-data/README.md` | — |
| Drafts: Opportunity storyboard, Mars terrain and environment, hardware inspection | `docs/space-exploration/*.md` | — |

## Results

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| Production build | pass |
| Vitest | **206 / 206**: the 182 earlier tests are unchanged and pass, plus 24 new |
| E2E suites | Not re-run. No UI, scene or style file changed: the only edit outside new folders is new entries in `sources.ts`, and the unit tests that read it pass |

## Research findings in Stage 1

1. **Rover engineering figures.** They now come from the PDS instrument-host description (MER Analyst's Notebook, PDS Geosciences Node):
   - entry vehicle 840 kg; lander 550 kg;
   - rover about 154 cm tall, about 225 × 151 cm at the panel, wheels 26 cm;
   - solar array 1.3 m², two 8 Ah lithium-ion batteries;
   - 5-DOF arm; RAD6000 at 20 MHz.

   **New conflict:** rover mass is 180 kg (PDS) vs 185 kg (NASA), recorded as `conflicting`.
2. **Landing-site terrain exists after all.** An Eagle crater DTM at **0.01 m** (27 × 27 m) and an Endurance DTM at about 0.30 m are on the traverse page (`osu/` folder). Their headers say `PROJECTION_NAME Unknown`, so they are recorded with frame `unknown`.
3. **Sol numbering.** MER uses Sol 1 for the touchdown sol (GISS notes), and the mission clock was a hybrid offset from LMST. Computed sols are therefore only trusted away from local midnight; published sols take precedence.
4. **PIA22930** (read via the PDS Rings mirror): τ "about 10.8", estimated from Pancam 440 / 750 nm solar images, around 9:33 a.m. PDT on 10 June 2018 (sol 5,111). The caption also prints "12:33 a.m. EDT", which doesn't match; this is recorded.
5. **Still missing:**
   - EDL figures: the JPL press kit now redirects to a general page, and the NTRS records have no full text;
   - Hazcam details;
   - the traverse frame;
   - Mars surface pressure;
   - dust optical properties;
   - the IAU polar radius, needed for converting planetographic and planetocentric latitudes.

## Process note

One `sed` replacement in Stage 1 had two side effects, both fixed:
- it broke a TypeScript string (caught by `tsc`, fixed);
- it rewrote the line endings of two committed reports (no text change; restored from git with `git checkout --` on those two files only).

## Proposed Stage 2 (prototypes), needs approval

1. **Unity terrain + sky prototype** on the Victoria HiRISE DTM tile:
   - the MER model;
   - the Sun from Mars24;
   - a τ-driven sky;
   - the quality profiles;
   - bridge instrumentation.

   Measure the gates on this machine and write `GRAPHICS_PERFORMANCE_REPORT.md`. The renderer decision is confirmed or reversed with numbers.
2. **Traverse frame fit** (method in `HISTORICAL_ROUTE_RECONSTRUCTION.md` §3), using the traverse CSV and, optionally, the SPICE time subset.
3. **`.blend` evaluation:** convert offline, count separable parts, measure against the PDS dimensions.
4. **Mars environment research:** CTX / HRSC availability, the Lemmon τ series, dust optical properties, the IAU radii.

**Downloads Stage 2 needs (each needs your yes):**

| File | Source | Size |
|---|---|---|
| `MERB_traverse_5130.csv` | an.rsl.wustl.edu (WUSTL / PDS Geosciences Node; not a PDS archive product) | 1,463,086 bytes |
| `DTEEC_001414_1780_001612_1780_U01.IMG` (Victoria DTM) | hirise-pds.lpl.arizona.edu | 8,671,620 bytes |
| `Mars Exploration Rover - Spirit and Opportunity.blend` | github.com/nasa/NASA-3D-Resources | 12,243,528 bytes |
| `eagle_dtm_binary.bin` (Eagle crater DTM) | an.rsl.wustl.edu | 29,160,000 bytes |
| Victoria orthoimage `PSP_001414_1780_RED_A_01_ORTHO.JP2` (texture) | hirise-pds.lpl.arizona.edu | 8,855,816 bytes |
| *Optional:* MER-1 rover SPK for the sol 1–3240 frame cross-check, via NAIF's time-subset service | naif.jpl.nasa.gov | up to 232 MB (subset smaller) |
