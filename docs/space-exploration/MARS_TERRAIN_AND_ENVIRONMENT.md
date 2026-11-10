# Mars Terrain and Environment

**Status (after Stage 2):**
- **Victoria terrain:** downloaded with approval and processed for the Unity prototype (§6).
- **Sun model:** implemented and tested in TypeScript and C#.
- **Mars radii:** now sourced: 3396.19 / 3396.19 / 3376.20 km (NAIF `pck00011`). The planetographic latitude conversion is implemented in the prototype.
- **Atmosphere:** the τ archive is located (§4); dust optical properties are still unsourced.
- **Mars in the app:** still `planned` in `surface/planets.ts`. The prototype is a separate Unity build.

## Stage 2 update: Victoria terrain as built (`scripts/mars/prepare_victoria_prototype.py`)

| Item | Value |
|---|---|
| Source | HiRISE DTM `DTEEC_001414_1780_001612_1780_U01`, 1,279 × 1,694, float32. Elevations above the Mars 2000 areoid (label). 1,749,782 valid cells of 2,166,626; no-data cells stay holes |
| Frame | ENU about the Victoria crater centre, fitted to the DTM rim crest (2.05136°S, 354.50424°E; crest radius 408.7 m, circle RMS 17.1 m). Up includes the sphere curvature (R = 3,396.19 km) |
| Grid | East spacing 1.0112 m (projection spacing × cos lat0), north 1.0119 m. **Largest difference between the regular grid and exact ENU: 7.2 mm** |
| Storage | uint16, step 1.21 mm. **Largest quantisation error: 0.6 mm** (100-point check) |
| Albedo | HiRISE `PSP_001414_1780_RED_A_01_ORTHO` resampled (area average) to 3,072 × 4,096 over the DTM extent (~0.42 m/texel). **Grayscale RED band, not colour.** The prototype applies an *illustrative* tint and says so on screen |
| Mesh | 128-cell chunks with three LODs (base stride, ×2, ×4), skirts at chunk edges, base stride set by the quality profile (1 / 1 / 2 / 4 cells) |

**τ archive (located, not downloaded):**
- PDS data set `MER1_MER2-M-PANCAM-5-ATMOS-OPACITY-V1`.
- Opportunity files: `1tau440_5106_*.tab` (765,748 bytes) and `1tau880_5106_*.tab` (760,644 bytes), covering 2004-01-05 to 2018-06-05.
- This gives a sourced τ for any sol up to 5106, including the Victoria-entry sol the prototype shows. Downloading it needs approval (Stage 3).

## 1. Terrain products for Opportunity

All entries below are read from the product labels or headers; none are assumed.

| Product | Resolution | Extent | Frame | Size | Role |
|---|---|---|---|---|---|
| HiRISE DTM `DTEEC_018701_1775_018846_1775_U01` | 1.0118 m, float32 | lat −2.1248 to −2.4913, lon 354.5547 to 354.6887 E (7,854 × 21,470) | equirectangular, R 3,396.19 km | 674.5 MB | Endeavour west rim, Perseverance Valley. **Windowed reads** (as for LROC) |
| HiRISE DTM `DTEEC_001414_1780_001612_1780_U01` | 1.0119 m, float32 | lat −2.0363 to −2.0652, lon 354.4932 to 354.5151 E (1,279 × 1,694) | equirectangular, R 3,396.19 km | 8.7 MB | Victoria crater; **Stage 2 prototype tile** |
| HiRISE orthoimages (`*_RED_A_01_ORTHO.JP2`) | ~0.25–1 m | as the DTMs | as the DTMs | 54–599 MB each | Ground albedo / texture (windowed) |
| Eagle crater DTM (`osu/` folder; producer not named) | **0.01 m**, float32 | 27 × 27 m (2,700²) | local metres, **frame unknown** | 29.2 MB | Landing crater close-up, once the frame is established |
| Endurance crater DTM (`osu/` folder) | ~0.30 m | 167 × 176 m | local metres, **frame unknown** | 1.3 MB | Endurance crater |
| MOLA MEGDR 128 px/deg (`megt*hb.img`) | ~463 m | 44° × 90° tiles | to read from the `.lbl` | 129.8 MB per tile | Horizon to ±tens of km. The tile covering Meridiani is to be confirmed from its label |
| CTX / HRSC DTMs | ~5–50 m | — | — | — | Mid-range ring between HiRISE and MOLA. **Not yet searched in archives**; the traverse basemap was georeferenced with HRSC ND4 / DA4 |

**Gap:** no HiRISE DTM covers the landing site. The landing area uses the `osu/` Eagle DTM (local) inside a lower-resolution ring (CTX / HRSC / MOLA). The UI labels the resolution of the ground under the camera.

## 2. Pipeline (reuses the lunar design)

1. **Windowed reads** with rasterio / GDAL over HTTP. Same approach as `scripts/terrain/extract_lroc_dtm.py`.
2. **Handle no-data:** HiRISE DTMs have no-data borders. They are filled from the next coarser ring and flagged; never invented relief.
3. **Re-project** into the site's East-North-Up (ENU) frame on the 3,396.19 km sphere, **with curvature** (`FINAL_VISUAL_REALISM_SPEC.md` §3).
4. **Tile for Unity Terrain:** power-of-two-plus-one heightmaps at the native 1.01 m spacing, at most 2,049² per tile. Neighbouring tiles share edge heights.
5. **Cross-checks** (the lunar pipeline matched within 1.4–7.7 m):
   - HiRISE vs MOLA over the overlap;
   - Victoria vs Endeavour DTM where both exist (they don't overlap; checked against MOLA);
   - **Tolerance:** within MOLA's stated vertical accuracy, to be read from its label.

## 3. Sun (implemented)

`frontend/src/realism/marsTime.ts`:
- Mars24 solar longitude, equation of time, declination, subsolar longitude, zenith and azimuth;
- an ENU Sun vector;
- heliocentric distance, which scales irradiance by 1/R².

Tested against both GISS worked examples (`MISSION_TIME_MACHINE_ARCHITECTURE.md` §1.1).

**Note:** Mars24 latitudes are planetographic. Converting the catalogue's planetocentric latitudes needs the IAU polar radius. That value is **not yet sourced**, so the conversion is not implemented.

## 4. Atmosphere

| Quantity | Source | Status |
|---|---|---|
| Optical depth τ on sol 5111 | PIA22930: "a tau of about 10.8" (estimated from Pancam solar images) | verified (estimate) |
| τ time series, Opportunity | Lemmon et al. 2015, Icarus 251: more than 3,500 sols from Pancam solar imaging | source identified; values not yet extracted |
| Surface pressure / density at Meridiani | **No Opportunity measurement found** | gap. Use a cited climate model (for example the Mars Climate Database), labelled *modelled* |
| Dust optical properties (single-scattering albedo, phase function) | not yet researched | gap (Stage 2) |
| Sky colour | Must come from calibrated Pancam sky imagery, or from the scattering model with sourced dust properties | gap |

**Rendering plan** (Stage 2 prototype):
- precomputed transmittance and single- plus multiple-scattering lookup tables;
- dust-dominated scattering driven by τ;
- table resolutions per quality profile.

**What the UI shows:** τ is shown as data whenever it is used. When no sourced τ exists for the date, the UI shows "τ assumed = x".

## 5. Environment constants

| Quantity | Value | Source |
|---|---|---|
| Gravity | 3.73 m/s² | NSSDCA (already in `planets.ts`) |
| Reference radius (terrain) | 3,396.19 km | HiRISE DTM labels |
| Local time | Mars24 (GISS) | `giss-mars24-algorithm` |
| Leap seconds | TAI−UTC table | NAIF `naif0012.tls` |
