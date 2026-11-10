# Deep-Space Spacecraft: Primary-Source Research (Phase 1)

**Retrieved:** 2026-11-10.
**Scope:** the mandatory catalogue additions (Voyager 1 and 2, Pioneer 10 and 11, Cassini–Huygens, Parker Solar Probe), researched as far as the architecture and the replay event skeletons need. **Nothing here is in the catalogue yet.** Each value enters `frontend/src/missions/catalog` as a `Fact` with these source ids when Phase 5 starts.

**Status meanings:**
- **verified:** read on the cited page;
- **conflicting:** the page or pages disagree, and every value is kept;
- **to verify:** not yet read on a primary source. Never shown as fact.

## Sources

| id (proposed) | Page | URL |
|---|---|---|
| `nasa-voyager1` | NASA Science, Voyager 1 | https://science.nasa.gov/mission/voyager/voyager-1/ |
| `nasa-voyager2` | NASA Science, Voyager 2 | https://science.nasa.gov/mission/voyager/voyager-2/ |
| `nasa-pioneer10` | NASA Science, Pioneer 10 | https://science.nasa.gov/mission/pioneer-10/ |
| `nasa-pioneer11` | NASA Science, Pioneer 11 | https://science.nasa.gov/mission/pioneer-11/ |
| `nasa-cassini-timeline` | NASA Science, Cassini journey timeline | https://science.nasa.gov/mission/cassini/the-journey/timeline/ |
| `nasa-parker` | NASA Science, Parker Solar Probe | https://science.nasa.gov/mission/parker-solar-probe/ |
| `nasa-parker-vga7` | NASA Science, "Final Venus Flyby for NASA's Parker Solar Probe Queues Closest Sun Pass" | https://science.nasa.gov/science-research/heliophysics/final-venus-flyby-for-nasas-parker-solar-probe-queues-closest-sun-pass/ |
| `apl-parker-vga7` | JHU/APL news release, Venus gravity assist 7 | https://www.jhuapl.edu/news/news-releases/241108-venus-gravity-assist-7 |

## Voyager 1 (replay type D: deep-space probe)

| Event / fact | Value | Status |
|---|---|---|
| Launch | 1977-09-05 12:56:01 UT, Titan IIIE-Centaur (TC-6), Cape Canaveral LC-41 | verified |
| Jupiter closest approach | 1979-03-05 12:05 UT, about 280,000 km | verified |
| Saturn closest approach | 1980-11-12 23:46 UT, about 126,000 km | verified |
| Pale Blue Dot | 1990, from 40 AU, part of the 64-image "family portrait" | verified (month and day not given) |
| Most distant human-made object | 1998-02-17 at 69.4 AU, overtaking Pioneer 10 | verified |
| Termination shock / heliosheath | 2004-12-16 | verified |
| Interstellar space | 2012-08-25 | verified |
| One light-day from Earth | page countdown target 2026-11-18 | verified (a forecast, labelled as such) |
| Power | 3 × MHW-RTG on a boom, about 158 We each at launch | verified |
| Golden Record | 30 cm gold-plated copper disc: 55 languages, 35 sounds, 90 min of music, 115 images | verified |
| Instruments still operating | The page says both "two science instruments" (after a shut-off on April 17; the linked post is dated 2026) and "four still-functioning instruments" | **conflicting**. Shown as "status changing; see source" until a dated mission status post is read |
| Status | Active, extended mission | verified |

**No Uranus or Neptune encounter:** the page lists only Jupiter and Saturn. The reason (the trajectory after the Titan-targeted Saturn flyby) is **to verify** from a primary source before any story text uses it.

## Voyager 2 (type D)

| Event / fact | Value | Status |
|---|---|---|
| Launch | 1977-08-20 14:29:44 UT, Titan IIIE-Centaur (TC-7), LC-41. **It launched before Voyager 1** | verified |
| Jupiter | 1979-07-09 22:29 UT, about 645,000 km | verified |
| Saturn | 1981-08-26 01:21 UT, about 101,000 km. The key-dates list says 1981-08-25 | **conflicting** (date convention) |
| Uranus | 1986-01-24 17:59 UT, about 81,500 km. First and only flyby | verified |
| Neptune | 1989-08-25 03:56 UT, about 4,800 km | verified |
| Nonessential instruments turned off | 1998-11, leaving seven instruments operating | verified |
| Termination shock | 2007-08-30 | verified |
| Interstellar space | The key-dates list gives 2018-11-25. The overview says it "joined Voyager 1" on 2018-12-10 | **conflicting**. Read the 2018 NASA announcement before use |
| Thruster change | 2019-07-08: trajectory-correction thrusters used for pointing | verified |
| Power | 3 plutonium-oxide RTGs on a boom | verified (wattage not on this page) |
| Status | Active, extended mission | verified |

## Pioneer 10 (type D)

| Event / fact | Value | Status |
|---|---|---|
| Launch | 1972-03-02 01:49:04 UT, Atlas-Centaur AC-27, LC-36A | verified |
| Enters the asteroid belt | 1972-07-15 (first spacecraft to do so) | verified |
| Jupiter closest approach | 1973-12-04 02:26 UT, 130,354 km | verified |
| Crosses Neptune's orbit | 1983-06-13 | verified |
| Routine contact ends | 1997-03-31 19:35 UT, 67 AU (budget) | verified |
| Last telemetry | 2002-04-27 | verified |
| Last signal | 2003-01-23, 12.23 billion km, 11 h 20 min one-way light time | verified |
| Last failed contact attempt | 2006-03-04 | verified |
| Power | 2 × SNAP-19 RTG, about 140 W at Jupiter | verified |
| Plaque | Aluminium plaque: a man and a woman, the Solar System, and its position relative to 14 pulsars | verified |
| Status for the catalogue | **Communication lost** (contact ended 2003) | derived from the above |

## Pioneer 11 (type D)

| Event / fact | Value | Status |
|---|---|---|
| Launch | 1973-04-06 02:11 UT, Atlas-Centaur AC-30, LC-36B | verified |
| Jupiter closest approach | 1974-12-03 05:22 UT, about 42,500 km from the cloud tops | verified |
| Saturn closest approach | 1979-09-01 16:31 UT, about 20,900 km. A caption says 21,000 km | **conflicting** (rounding) |
| Firsts | First Saturn flyby; discovered the F ring | verified |
| Crosses Neptune's orbit | 1990-02-23 | verified |
| Last contact | 1995-09-30 at 44.1 AU, plus a few minutes of data on 1995-11-24 | verified |
| Power | RTG (one RTG boom failed to deploy on the way out). Count and type not on this page | **to verify**: NSSDCA spacecraft record |
| Status for the catalogue | **Communication lost** (1995) | derived |

## Cassini–Huygens (Cassini: type C orbiter; Huygens: type F lander)

| Event | Value | Status |
|---|---|---|
| Launch | 1997-10-15 | verified |
| Venus flyby 1 | 1998-04-25 | verified |
| Venus flyby 2 | 1999-06-24 | verified |
| Earth flyby | 1999-08-17 | verified |
| Jupiter flyby | Timeline entry 2000-12-29; closest approach 2000-12-30 | verified (use 12-30 for closest approach) |
| Saturn orbit insertion | The catalogue already has 2004-06-30 (PDT). The timeline entry text gives "July 1, 2004 at 9:12 p.m. UTC" | **conflicting**. The time of day needs the SOI press kit |
| Huygens release | Timeline gives 2004-12-23 | **to verify** against ESA records before use (the date convention may differ) |
| Huygens descent and landing on Titan | Descent entry 2005-01-13; landing 2005-01-14 | verified (time-zone basis to state) |
| Solstice mission starts | 2010-09-26 | verified |
| Grand Finale starts | 2017-04-26 | verified. The catalogue's earlier "late 2016 vs April 2017" conflict is now settled to 2017-04-26 for the first ring dive |
| End of mission (Saturn plunge) | 2017-09-15 | verified |
| RTG count and type, masses, instruments, ASI contribution | NASA's spacecraft page is a placeholder | **to verify**: the Quick Facts page or ESA |

**The rules are encoded in the data, not in the UI:**
- Cassini's last event is `kind: 'end'` with `place: saturn-atmosphere`.
- Huygens' landing is `body: titan`.
- No Cassini event carries `kind: 'landing'`.

## Parker Solar Probe (type E: solar probe)

| Event / fact | Value | Status |
|---|---|---|
| Launch | 2018-08-12 07:31 UTC, Delta IV Heavy with upper stage | verified |
| Venus gravity assists | **Seven.** The seventh and last was on 2024-11-06, at about 387 km altitude (pre-flyby NASA text: 376 km). Dates of flybys 1–6 to come from the mission blog | count and VGA 7 verified; 1–6 **to verify** |
| Closest perihelion | 2024-12-24, about 3.8 million miles (pre-flyby 3.86 million). The mission page gives 6.2 million km in one place and "about 4 million miles (6.5 million km)" in another | **conflicting**. Use the dated post-VGA-7 figure, with the source |
| Top speed | About 430,000 mph (about 692,000 km/h) at perihelion | verified |
| Heat shield | Carbon composite, 4.5 in (11.43 cm) thick, takes nearly 2,500 °F (1,377 °C) on the front | verified |
| Temperature behind the shield; how the solar arrays are cooled | Not on the mission page | **to verify** (needed for the required "why the whole body stays cool" explanation) |
| Investigations | FIELDS, IS☉IS, WISPR, SWEAP | verified |
| Communications | No contact during the 2024-12-24 perihelion; beacon tones on 12-21 and 12-27 | verified |
| Status | Active | verified |

## Gaps that block a complete deep-space replay (to close in Phase 5, before building)

1. Trajectory vectors. JPL Horizons is the preferred source; the backend already has a `horizons` connector. Planned ids: Voyager 1 = −31, Voyager 2 = −32, Cassini = −82 (from `historical-trajectories/ARCHITECTURE.md`); Pioneer 10, Pioneer 11 and Parker ids and coverage still need checking against Horizons.
2. Pioneer 11 power. Cassini RTGs, instruments and ASI's role. Parker's thermal and cooling design.
3. Engineering dimensions for every craft (NSSDCA spacecraft pages).
4. Official 3D models (NASA 3D Resources): availability and part structure for each craft.
