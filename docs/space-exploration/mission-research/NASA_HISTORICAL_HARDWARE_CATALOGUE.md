# A. NASA Historical Hardware Catalogue (v0.1.0, 2026-11-09)

The machine-readable source of truth is `frontend/src/missions/`:
- schema: `schema.ts`;
- sources: `sources.ts`;
- data: `catalog/moon.ts`, `catalog/mars.ts`, `catalog/deepSpace.ts`;
- validation: `validateCatalog()` in `index.ts`, run by `missions.test.ts`.

This page is a readable summary of the same data.

**Status legend:**
- ✅ **verified**: read from a cited source.
- ⚠️ **conflicting**: sources disagree, and every value is recorded.
- ⬜ **unverified**: not sourced yet. The value is left empty, never guessed.

**Where the hardware is now:**
- 🪨 on a planetary surface;
- 🛰 in orbit or deep space;
- 🔥 destroyed (impact or atmospheric entry).

## The Moon

All coordinates below are LRO-measured, in the Mean Earth/Polar Axis frame. Hardware sources are NSSDCA (Wagner et al. 2017) and LROC (Wagner et al. 2016).

**Apollo 11 — Tranquility Base, Mare Tranquilitatis.** Launch ✅ 1969-07-16 13:32 UT. Landing ✅ 1969-07-20 20:17:40 UT.

| Hardware | Where | Position |
|---|---|---|
| LM descent stage | 🪨 | ✅ 0.67416, 23.47314 (−1926 m, ±0.3 m) |
| EASEP passive seismic station | 🪨 | ✅ 0.67322, 23.47315 (±0.4 m) |
| Laser Ranging Retroreflector (LRRR) | 🪨 | ✅ 0.67345, 23.47307 |

**Apollo 12 — Oceanus Procellarum.** Launch ✅ 1969-11-14. Landing ✅ 1969-11-19.

| Hardware | Where | Position |
|---|---|---|
| LM descent stage | 🪨 | ✅ −3.0128, 336.5781 |
| ALSEP | 🪨 | ✅ −3.0098, 336.5751 |

**Apollo 14 — Fra Mauro.** Launch ✅ 1971-01-31. Landing ✅ 1971-02-05.

| Hardware | Where | Position |
|---|---|---|
| LM descent stage | 🪨 | ✅ −3.64589, 342.52806 |
| ALSEP | 🪨 | ✅ −3.64419, 342.52232 |
| LRRR | 🪨 | ✅ −3.64417, −17.47865 |

**Apollo 15 — Hadley Rille.** Launch ✅ 1971-07-26. Landing ✅ 1971-07-30.

| Hardware | Where | Position |
|---|---|---|
| LM descent stage | 🪨 | ✅ 26.13239, 3.63330 |
| ALSEP | 🪨 | ✅ 26.13406, 3.62991 |
| LRRR | 🪨 | ✅ 26.13341, 3.62850 |
| Lunar Roving Vehicle | 🪨 | ✅ 26.13174, 3.63803 |

**Apollo 16 — Descartes.** Launch ✅ 1972-04-16. Landing ✅ 1972-04-20.

| Hardware | Where | Position |
|---|---|---|
| LM descent stage | 🪨 | ✅ −8.9734, 15.5011 |
| ALSEP | 🪨 | ✅ −8.9759, 15.4986 |
| Lunar Roving Vehicle | 🪨 | ✅ −8.9729, 15.5037 |

**Apollo 17 — Taurus-Littrow.** Launch ✅ 1972-12-07. Landing ✅ 1972-12-11.

| Hardware | Where | Position |
|---|---|---|
| LM descent stage | 🪨 | ✅ 20.1911, 30.7723 |
| ALSEP | 🪨 | ✅ 20.1923, 30.7655 |
| Lunar Roving Vehicle | 🪨 | ✅ 20.1896, 30.7769 |
| Surface Electrical Properties (SEP) experiment | 🪨 | ✅ 20.1920, 30.7768 |

**Chandrayaan-3 — ISRO, NOT NASA** (labelled educational exception). Launch ✅ 2023-07-14. Landing ✅ 2023-08-23.

| Hardware | Where | Position |
|---|---|---|
| Vikram lander (1752 kg including the rover) | 🪨 | ⬜ ISRO publishes only the planned prime site (69.367621°S, 32.348126°E) |
| Rover (26 kg, 50 W; "Pragyan" name pending a source) | 🪨 | ⬜ not sourced |

Only the passive Laser Retroreflector Array on the Chandrayaan-3 lander came from NASA.

**Also on the Moon, from LROC, not yet in the mission catalogue:**
- Surveyor 1, 3, 5, 6 and 7 landers;
- Luna 16, 17, 20, 21, 23 and 24, and Lunokhod 1 and 2;
- Chang'e 3 and Yutu;
- Ranger 6–9 impact sites;
- Apollo 13–17 S-IVB impact sites;
- GRAIL-A and -B and LADEE impact sites.

LROC coordinates for all of these are already recorded in `SOURCES['lroc-2016-coords']`. **Next step:** add Surveyor 3 first (Apollo 12 visited it).

**Not yet catalogued:**
- the individual ALSEP instruments (seismometers, heat flow, solar wind, magnetometers);
- the Apollo 11 Solar Wind Composition experiment (it was returned to Earth, not left behind);
- the flags.

Each needs its own NSSDCA experiment record first.

## Mars

Landing-site coordinates (°N, °E) come from NASA PDS ODE, which cites Folkner 1997, Arvidson 2004, Smith 2009 and Seelos 2014. Launch dates come from the NSSDCA chronologies. Landing dates are ⬜ unless stated: the chronology lists launches only.

| Mission | Hardware | Launch | Landing site | Status |
|---|---|---|---|---|
| Viking 1 | orbiter + lander 🪨 | ✅ 1975-08-20 | ✅ 22.269, 312.049 | ⬜ |
| Viking 2 | orbiter + lander 🪨 | ✅ 1975-09-09 | ✅ 47.668, 134.280 | ⬜ |
| Mars Pathfinder | lander + Sojourner rover 🪨 | ✅ 1996-12-04 | ✅ 19.095, 326.747 | ⬜ |
| Spirit (MER-A) | rover 🪨 | ✅ 2003-06-10 | ✅ −14.5692, 175.4729 (cartographic) | ⬜ |
| **Opportunity (MER-B)** | rover 🪨 | ✅ 2003-07-08 03:18:15 UT | ✅ −1.9483, 354.47417 (Eagle crater) | ✅ ended (see below) |
| Phoenix | lander 🪨 | ✅ 2007-08-04 | ✅ 68.22, 234.25 | ⬜ |
| MSL Curiosity | rover 🪨 | ✅ 2011-11-26 | ✅ −4.59, 137.44 (Gale) | ⬜ |
| InSight | lander 🪨 | ✅ 2018-05-05 | ⬜ | ⬜ |
| Mars 2020 | Perseverance rover + Ingenuity helicopter 🪨 | ✅ 2020-07-30 | ⬜ | ⬜ |
| Mariner 4 / Mariner 9 | flyby 🛰 / orbiter 🛰 | ✅ 1964-11-28 / 1971-05-30 | — | ⬜ |

**Opportunity details:**
- Landing is ⚠️ conflicting: 2004-01-25 04:54 UTC, versus 24 Jan in US Pacific time.
- Planned mission ✅ 90 sols.
- Last contact ✅ 10 June 2018.
- End of mission ✅ 13 Feb 2019.
- Distance driven ✅ 45.16 km.
- Final location: Perseverance Valley, with coordinates ⬜.

## Saturn and Titan

| Mission | Agency | Hardware | Key facts | Final location |
|---|---|---|---|---|
| Cassini | NASA, with partners ESA and ASI | orbiter | ✅ launch 1997-10-15; ✅ Saturn orbit insertion 2004-06-30 (PDT); ✅ 294 orbits; ✅ 162 targeted moon flybys; ✅ 22 Grand Finale orbits | 🔥 plunged into Saturn ✅ 2017-09-15 |
| **Huygens** | **ESA, not NASA** | atmospheric probe | ✅ landed on Titan January 2005 (the exact day is pending a primary source) | 🪨 Titan, ⚠️ 10.573°S 192.335°W (EGU 2015) vs 10.25°S 192.32°W (NASA) |

## Other destinations

Launch dates and mission types are ✅ from the NSSDCA chronology. End dates, final locations and status are ⬜ and will be researched mission by mission in Phase 6.

| Destination | Missions |
|---|---|
| Venus | Mariner 2 (flyby, 1962-08-27); Pioneer Venus 1 (orbiter, 1978-05-20); Pioneer Venus 2 (probes, 1978-08-08); Magellan (orbiter, 1989-05-04) |
| Mercury | Mariner 10 (Venus/Mercury flybys, 1973-11-04); MESSENGER (orbiter, 2004-08-03) |
| Jupiter | Pioneer 10 (1972-03-03); Galileo (orbiter + probe, 1989-10-18); Juno (orbiter, 2011-08-05) |
| Saturn | Pioneer 11 (1973-04-05); Voyager 1 (1977-09-05) |
| Uranus and Neptune | Voyager 2 (1977-08-20) |
| Pluto / Kuiper Belt | New Horizons (2006-01-19) |
| Asteroids | NEAR Shoemaker (Eros, 1996-02-17); Dawn (Vesta + Ceres, 2007-09-27); OSIRIS-REx (sample return, 2016-09-08) |
| Comets | Stardust (coma sample return, 1999-02-07); Deep Impact (rendezvous + impactor, 2005-01-12) |
| Moon (orbital) | LRO and LCROSS (2009-06-18) |

## Hardware classes represented

| Class | Examples |
|---|---|
| Surface equipment | Apollo descent stages, ALSEPs, EASEP, LRRRs, LRVs, Mars landers and rovers, Huygens |
| Orbiters | Cassini, Magellan, MESSENGER, Galileo, Juno, LRO, Dawn, Mariner 9 |
| Flybys | Mariner 2, 4 and 10; Pioneer 10 and 11; Voyager 1 and 2; New Horizons |
| Atmospheric probes | Pioneer Venus 2, the Galileo probe, Huygens |
| Impactors | LCROSS, Deep Impact |
| Sample return | Stardust, OSIRIS-REx |

## Validation guarantees (automated)

- Every source id resolves.
- A "verified" fact has a value and at least one source; an "unverified" fact has no value and a note saying what is missing.
- Dates follow ISO format, and launch ≤ arrival ≤ landing ≤ end.
- Milestones are in order and none falls before launch.
- Non-NASA missions carry `nonNasaNote`, and their hardware can never be flagged `nasaHardware`.
- Every object belongs to a mission that lists it.
- Coordinates are within valid ranges.
