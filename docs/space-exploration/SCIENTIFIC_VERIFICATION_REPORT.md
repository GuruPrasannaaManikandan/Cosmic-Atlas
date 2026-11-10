# Scientific Verification Report — Mars Prototype (Stage 2)

**Date:** 2026-11-10.
**Scope:** the Unity Victoria crater prototype and the data it uses.

**Every quantity is labelled as one of these:**
- **verified:** checked against a source or an independent computation in this session;
- **sourced:** taken from a cited product but not re-checked here;
- **derived:** computed from sourced values;
- **assumed / illustrative:** no source. The prototype shows this label on screen.

## 1. Time and Sun

| Item | Status | Evidence |
|---|---|---|
| Mars24 algorithm (Allison & McEwen 2000, NASA GISS) in C# (`Runtime/Mars/MarsTime.cs`) | **verified** | Unity EditMode run on 2026-11-10: `MarsTimeTests`, 3 of 3 pass (GISS example 1 for 2000-01-06, example 2 for the Spirit landing target, and the LTST search). Tolerances are 1e-3° for zenith and azimuth. Results are in `docs/qa/space-exploration/mars-prototype/unity_EditMode_results.xml` |
| Mars24 in TypeScript (`frontend/src/realism/marsTime.ts`) | **verified** | Vitest `marsTime.test.ts` passes (226 of 226 in the full suite) |
| **Sun in the scene, cross-checked** | **verified** | The Unity player reports elevation **56.38259988°** and azimuth **238.52481308°** for 2007-09-11 16:48 UTC at the Victoria centre. Running the TypeScript implementation separately on the same inputs gives elevation 56.38259988027646°, azimuth 238.52481308361234° and LTST 13.9922 h, identical to every printed digit. Since the 0.1° gate is met by the tested core, this check confirms that the scene feeds it the right inputs |
| Planetocentric-to-planetographic latitude | **sourced** | tan φg = (a/b)² tan φc, with a = 3396.19 km and b = 3376.20 km as cited in code to NAIF `pck00011` BODY499_RADII. The note in `MARS_TERRAIN_AND_ENVIRONMENT.md` §3 that the conversion is "not implemented" is out of date for Unity. The web app still doesn't convert |
| Scene date 2007-09-11 (Victoria entry) | **sourced** (date only) | The computed mission sol is **1291**. The local time of 14:00 LTST is **illustrative** and labelled so on screen |
| Irradiance scaling by 1/R² | **derived** | Uses the Mars24 heliocentric distance and a mean distance of 1.52367934 AU |

## 2. Terrain

| Item | Status | Evidence |
|---|---|---|
| Source | **sourced** | HiRISE DTM `DTEEC_001414_1780_001612_1780_U01` (MRO-M-HIRISE-5-DTM-V1.0), 1.0119 m spacing, 1,279 × 1,694 cells. Elevations are above the Mars 2000 areoid (label) |
| Frame | **derived** | ENU about the Victoria centre fitted to the rim crest (2.05136°S, 354.50424°E; crest radius 408.7 m, circle RMS 17.1 m). Curvature is included (R = 3,396.19 km) |
| Grid vs exact ENU | **verified** (in preparation) | Largest difference 7.2 mm (`victoria_height.json`) |
| Storage quantisation | **verified** | uint16 with a 1.21 mm step. Largest error 0.6 mm |
| **Heights in the player** | **verified** | 100 random DTM nodes, read back in the running WebGL build: **largest error 0.60 mm**. The gate is 50 mm |
| No-data cells | correct by design | 416,844 of 2,166,626 cells are no-data. They stay as holes and are never filled with invented relief |
| Albedo | **sourced, illustrative colour** | HiRISE `PSP_001414_1780_RED_A_01_ORTHO`, about 0.42 m per texel, **grayscale RED band**. The tint is illustrative and labelled so on screen |

## 3. Atmosphere and sky

| Item | Status | Note |
|---|---|---|
| τ in the scene = 0.9 | **assumed** | Labelled on screen as "tau 0.9 ASSUMED (no sourced value for this sol)". A sourced value exists in the PDS data set `MER1_MER2-M-PANCAM-5-ATMOS-OPACITY-V1`, which covers sols up to 5106. Downloading it needs approval |
| Sky colour, dust spectral tilt, ambient light | **illustrative** | Marked `ILLUSTRATIVE` in code (`MarsPrototype.cs:163,171`) and on screen |
| Dust optical properties (single-scattering albedo, phase function) | **gap** | Not yet researched |
| Surface pressure and density | **gap** | No Opportunity measurement. A cited climate model labelled *modelled* is still to be chosen |

## 4. Traverse (Opportunity route)

| Item | Status | Evidence |
|---|---|---|
| Source | **sourced** | `MERB_traverse_5130.csv` (WUSTL / PDS Geosciences Node; **not a PDS archive product**). 21,104 rows, sols 1–5081 |
| Registration | **derived, local** | One translation puts the centre of the rim-drive circle on the DTM rim-crest centre (`fit_victoria.json`). Local uncertainty is about 15 m RMS radially, plus up to about 20 m if the traverse frame is rotated 2.8° |
| Absolute registration | **unresolved** | The traverse frame sits 316–335 m from the DTM. A rotation of about 2.7–2.8° or an offset of about 300 m explains it equally well (`fit_traverse.json`, `fit_victoria.json`). The SPICE rover SPK, which covers sols 1–3240, could settle it. It needs download approval |
| Data anomaly | noted | One drive starts on an earlier sol than the drive before it (2170 after 2169 in row order; `startSolDecreaseCount: 1`). It is kept as is and not "corrected" |
| Scene label | correct | "drive record starting sol 1291 (traverse, locally registered)" |

## 5. Rover model

| Item | Status | Evidence |
|---|---|---|
| Model in use | **sourced** | NASA 3D Resources MER-B `.glb`: 3,845 triangles, one node |
| Scale | **derived** | Scaled to the PDS footprint (2.25 × 1.51 m), scale 0.1754. The two footprint dimensions disagree by 1.8% |
| Height | **known deviation** | 1.28 m in the model against 1.54 m in PDS, which is **−17%**. Shown on screen |
| `.blend` (Spirit and Opportunity) | **partial** | Inspected without Blender (`blend_inspect.json`): 63 objects, 61 meshes, about 30.9k vertices and 18.3k faces, with a named rocker-bogie, arm, mast and HGA hierarchy. **Not converted: Blender is not installed** |

## 6. Open scientific items carried into Stage 3

1. Get the sourced τ for the scene sol (PDS Pancam opacity data set, download approval needed).
2. Absolute registration of the traverse frame (MER-1 SPK subset, download approval needed).
3. Dust optical properties and the source of the sky colour.
4. Find out whether CTX and HRSC products exist for the wider terrain beyond the HiRISE tile. Not yet searched.
5. Convert the `.blend` (needs Blender) and check every part against the PDS dimensions.
6. Planetographic latitude conversion in the web app (`marsTime.ts`), using the same NAIF radii.
