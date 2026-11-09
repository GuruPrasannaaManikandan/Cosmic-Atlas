# B. Verified Mission Dataset and Source References (v0.1.0)

## Data layers (kept separate on purpose)

| Layer | File | Contains |
|---|---|---|
| Raw research | `frontend/src/missions/sources.ts` | 18 source records: title, organisation, URL, retrieval date (2026-11-09) and what was extracted |
| Curated facts | `frontend/src/missions/catalog/*.ts` | 40 missions and 23 physical objects (65 sourced milestones). Every value is a `Fact {value, status, sources, note, alternatives}` |
| Storytelling | `frontend/src/missions/stories.ts` | Short and expanded stories that reuse catalogue facts and cite the same source ids; they add no new facts |
| Rendering | `frontend/src/surface/models/*`, `surface/sites.ts` | Procedural reconstructions that reference object ids; placement is derived from catalogue coordinates |

**Rules:**
- No React component contains a historical fact.
- The UI reads facts from the catalogue: the Specifications tab, the Timeline tab and the time-bar mission events.

## Sources used

| id | Organisation | Document |
|---|---|---|
| `nssdca-apollo-sites` | NASA NSSDCA | Apollo Landing Site Coordinates (LRO-derived, Wagner et al. 2017) |
| `nssdca-apollo-landings` | NASA NSSDCA | Apollo Lunar Landings (1969–1972) |
| `lroc-2016-coords` | LROC / ASU | Spacecraft Related Coordinates — 2016 Update (Wagner et al. 2016, doi:10.1016/j.icarus.2016.05.011) |
| `nssdca-a11-lm` | NASA NSSDCA | Apollo 11 Lunar Module / EASEP (1969-059C) |
| `nssdca-a11-csm` | NASA NSSDCA | Apollo 11 CSM (1969-059A) |
| `nssdca-a11-lrrr` | NASA NSSDCA | Laser Ranging Retroreflector experiment (1969-059C-04) |
| `nasa-apollo11` | NASA | Apollo 11 mission page |
| `nssdca-chronology` | NASA NSSDCA | Chronology of Lunar and Planetary Exploration |
| `nssdca-mars-chronology` | NASA NSSDCA | Chronology of Mars Exploration |
| `nssdca-moon-fact` / `nssdca-mars-fact` | NASA NSSDCA | Moon and Mars fact sheets (gravity, radius) |
| `pds-ode-mars-sites` | NASA PDS Geosciences Node | ODE landing sites |
| `nasa-opportunity` | NASA Science | Opportunity (MER-B) mission page |
| `nasa-cassini` | NASA Science | Cassini home, quick facts, about and Grand Finale pages |
| `nasa-huygens-site` | NASA Science | Cassini-Huygens page (landing coordinates) |
| `egu2015-huygens` | EGU 2015 | Huygens revised landing coordinates |
| `isro-ch3-details`, `isro-ch3` | ISRO | Chandrayaan-3 details and mission updates |

## Discrepancies found and how they are recorded

| Item | Values | Handling |
|---|---|---|
| Apollo 11 EASEP distance from the LM | NSSDCA text: "about 17 m south". LRO measurement: ~28 m south | The LRO coordinates are used (measured, ±0.4 m). The text value is kept in the note |
| Opportunity landing date | 25 Jan 2004 04:54 UTC vs 24 Jan (US Pacific) | `conflicting`, both recorded |
| Huygens landing site | 10.25°S 192.32°W (NASA) vs 10.573°S 192.335°W (EGU 2015 radar-based) | `conflicting`, both recorded |
| Cassini Grand Finale start | "late 2016" (About page) vs "April 2017" (Grand Finale page) | Milestone dated 2017-04; the description mentions both |
| Mars surface gravity | Brief: "≈3.71 m/s²". NSSDCA fact sheet: 3.73 (mean), 3.69 (equator) | The sourced 3.73 is used |
| Apollo 11 LRRR mass | NSSDCA experiment page: 77 kg | Recorded "as stated", pending a second source |
| Chandrayaan-3 rover name | The ISRO pages read call it "Chandrayaan-3 Rover"; "Pragyan" does not appear on them | Name kept with the note "pending a source" |

## Known gaps (tracked as `unverified` in the data, never filled)

- **Landing dates and status** of Viking 1/2, Pathfinder, Spirit, Phoenix, Curiosity, InSight and Mars 2020; landing coordinates of InSight and Perseverance.
- **Cassini's** Venus, Earth and Jupiter gravity-assist dates. Needed for Phase 6.
- **Chandrayaan-3's** measured landing position. A candidate source is the LROC image of the Vikram lander, not yet read.
- **Opportunity's** final coordinates in Perseverance Valley.
- **Apollo 12–17:** splashdown dates, landing times of day, and LM dimensions for the J-missions (15–17).
- **Dimensions** of EASEP, the LRRR panel and the Huygens probe.
