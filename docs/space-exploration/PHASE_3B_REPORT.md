# Phase 3b — All Six Apollo Landing Sites on Real Terrain: Report

- **Branch:** `feat/space-exploration` (PR #12, not merged).

## What changed

**Real terrain at every site (LROC NAC DTMs, NASA PDS)**
- With approval, the rows around each LM were read from the official 32-bit GeoTIFF DTMs using HTTP range requests (`scripts/terrain/extract_lroc_dtm.py`). **65.5 MB transferred** in total; the full files would have been 1.5 GB.
- Each window is resampled onto the app's local site frame and stored as uint16 with a JSON sidecar. This is **12 MB** in `frontend/public/assets/terrain/`, above my ~8 MB estimate.
- **Independent check — DTM height at the LM vs LROC's published LM elevation:**

  | Site | Difference |
  |---|---|
  | Apollo 11 | −1.4 m |
  | Apollo 12 | −0.2 m |
  | Apollo 14 | +0.1 m |
  | Apollo 15 | +7.7 m |
  | Apollo 16 | −0.2 m |
  | Apollo 17 | −0.1 m |

  Apollo 15 sits on a slope near Hadley Rille, and LROC's elevation uses the coarser GLD100 model. The check is a unit test.

| Site | Product | Post spacing | Walkable square | Hardware |
|---|---|---|---|---|
| Tranquility Base — Apollo 11 | NAC_DTM_APOLLO11 | 2 m | ±780 m | LM, EASEP, LRRR |
| Oceanus Procellarum — Apollo 12 | NAC_DTM_APOLLO12 | 2 m | ±780 m | LM, ALSEP |
| Fra Mauro — Apollo 14 | NAC_DTM_APOLLO14 | 2 m | ±780 m | LM, ALSEP, LRRR |
| Hadley–Apennine — Apollo 15 | NAC_DTM_APOLLO15 | 2 m | ±780 m | LM, ALSEP, LRRR, **LRV** |
| Descartes — Apollo 16 | NAC_DTM_APOLLO16 | 2 m | ±380 m | LM, ALSEP, **LRV** |
| Taurus–Littrow — Apollo 17 | NAC_DTM_APOLLO17 | 5 m | ±980 m | LM, ALSEP, **LRV**, SEP (position marker) |

**Engine**
- **Terrain interface (`SiteTerrain`):** procedural and DTM terrains plug into the same controller, renderer and map.
- **Gap filling:** DTM gaps are filled from neighbouring heights.
- **Hardware pads:** each object sits on a small flat pad at its measured DTM height.
- **Detail patch:** a 1.5 m terrain patch follows the astronaut, and a shader cut-out removes the coarse base mesh underneath it.
- **Horizon:** the horizon ring uses the DTM inside its coverage and drops with the Moon's real curvature.
- **Fallback:** if a DTM fails to load, the site falls back to labelled procedural terrain and says so on screen.
- **Lighting:** each site has a sourced daylight moment (the Apollo 11 moonwalk, or the day after each landing). The night warning offers it, so every site can be seen in its historical light.

**New hardware models** (procedural, built to NSSDCA numbers; the deviations are written into each object's provenance)
- **Lunar Roving Vehicle:**
  - 3.1 m frame, 2.3 m wheelbase, 36 cm clearance;
  - 81.8 × 23 cm woven-mesh wheels with chevrons;
  - two seats, T-handle controller, communications relay unit, mesh dish on a front mast.
  - Track width is approximate (1.83 m).
- **ALSEP central station:** 25 kg box, sunshield, 58 cm axial-helical antenna. The SNAP-27 RTG and the instruments are **not placed**: their positions are not sourced.
- **Objects without a sourced model** (Apollo 17 SEP) show a **position marker**, never an invented shape.
- **All Apollo LMs use NASA's LM model** with the ascent stage removed. For Apollo 15–17, the extended J-mission descent stage is noted as not modelled.

**Catalogue**
- New sources:
  - NSSDCA LRV page: 210 kg; per-mission distances of 27.8, 26.7 and 35.9 km;
  - NSSDCA Apollo 15 LM/ALSEP record: SNAP-27 ~70 W; central station 25 kg; all ALSEPs shut down on 30 Sept 1977;
  - the LROC DTM products.
- **Stories:** every object now has one. Handcrafted stories are used where they exist; otherwise the story is assembled only from the object's catalogue facts, with citations. A unit test covers all 23 objects.

**Touch controls**
- **Phones and tablets** (coarse primary pointer): an on-screen joystick (walk), plus Lope and Hop buttons. A one-finger drag looks around. The minimap moves to the side.
- **Mouse devices** keep the keyboard UI. This is tested: a Windows touchscreen laptop with a mouse does not get the joystick.

## Tests

| Suite | Result |
|---|---|
| Unit (Vitest) | 169/169. New: DTM decode and gap fill; bilinear sampling and hardware pads; every committed heightmap checked (size, post spacing, LROC agreement, coverage of the walkable area); stories for all objects |
| `moon_sites_check.py` (new, Chrome) | 36/36 — see below |
| `surface_exploration_check` | 35/35 (two assertions updated: the map now cites the LROC terrain; the return-to-orbit comparison resets the clock first because the night shortcut now uses each site's own daylight moment) |
| Model validation | 22/22, plus the known LM deviation |
| Smoke | 12/12 |
| Travel overhaul | 30/30 |
| Travel controls | 18/18 |
| Layout audit | PASS |
| `occlusion_check` | **1 of 3 runs FAILED** with no failing-check detail captured; the 2 re-runs passed 60/60 with 0 console errors. Treated as intermittent and still open |

`moon_sites_check.py` covers:
- the picker offers all six sites;
- each site loads its DTM (not the fallback);
- all 18 objects are discovered, open the right record, and show a story and specifications;
- 60 fps at every site;
- the touch joystick moves the astronaut (2.2 m);
- the phone layout doesn't overflow;
- desktop shows no joystick;
- no console errors.

## Known limitations

1. **No distant mountains.** The DTM windows are narrow north–south, so features beyond them (the Taurus–Littrow massifs and Mount Hadley, several km away) are not on the horizon. The horizon beyond the data is a flat mean surface with curvature.
   - The LROC pyramid files are not published at the expected path (HTTP 404).
   - **Proposed fix:** a coarse LOLA-based horizon ring. This needs a separate approval for a new dataset download.
2. **Models:**
   - LRV and ALSEP are approximate reconstructions.
   - The J-mission LM descent stage is not modelled.
   - The Apollo 14/15 LRRR uses the Apollo 11 geometry (array sizes not sourced).
3. **Unplaced hardware:** the ALSEP instruments, RTGs and flags are not placed because their coordinates are not sourced. LROC lists only the central stations, PSEs, LRVs and SEP.
4. **Surveyor 3** at the Apollo 12 site has LROC coordinates but no mission record yet. Next step: an NSSDCA record and a model.
