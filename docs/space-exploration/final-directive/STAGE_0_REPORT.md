# Final Engineering and Visual Realism Directive — Stage 0 Report

**Stage:** 0 — repository audit and official research (Section M6).
**Date:** 2026-11-10.
**Branch:** `feat/space-exploration` (PR #12, open and **not merged**).
**Code changes in this stage:** none. Only this report and `IMPLEMENTATION_PROGRESS.md` were added.
**Next step:** waiting for approval before Stage 1 (architecture, schemas, data design).

Every fact below names the page it came from. Anything not found is marked **not found** or **gap**. Nothing has been filled in by estimate.

---

## 1. Repository audit (M4)

| Check | Result |
|---|---|
| Current branch | `feat/space-exploration`, in sync with `origin/feat/space-exploration` |
| Uncommitted work | none (only the untracked `.claude/` tool folder) |
| Latest commit | `20d7563`: UI refinement + planet environment interface |
| Stashes | 1: `stash@{0}` "BACKUP before main branch consolidation – travel overhaul". Kept, not touched |
| PR #12 | open, mergeable, not merged |
| `main` | `11d8482`; Render serves `main`; auto-deploy appears off |
| Last full regression (on `20d7563`) | `tsc` + build pass. Vitest 182/182. E2E: layout 78/78, surface 35/35, storytelling 15/15, Moon sites 42/42, models 22/22, smoke 12/12, travel 30/30, controls 18/18, occlusion 60/60 ×2, layout audit PASS |

### 1.1 Production frontend (what the directive builds on)

**Stack:** React 18 + React Three Fiber 8.17 + Three.js 0.169 + drei 9.114 + zustand, built with Vite. No post-processing library.

#### Moon: implemented and validated
- **Sites and terrain:** six Apollo sites on LROC NAC DTM terrain. A LOLA LDEM_64 horizon extends to ±24 km. Lighting uses the IAU 2015 Moon rotation and the JPL ephemeris.
- **Models:** seven validated NASA 3D Resources models.
- **Storytelling:** an astronaut guide plus a narrator, with sourced claims only.
- **Layout:** responsive, with an inspector panel or a bottom sheet.

**This must be preserved (directive: "Moon preserved").**

#### Mars: configured as `planned` in `surface/planets.ts`
- Not explorable.
- No terrain, sky, lighting or site.
- Gravity is 3.73 m/s² (NSSDCA mean).

#### Gaps measured against the directive (the frontend today)

| Directive item | Current state |
|---|---|
| Quality profiles Ultra / High / Balanced / Performance | **None** on the surface |
| Performance instrumentation | Only a `showStats` flag and ad-hoc `performance.now()`. No frame-time budget or reporting on the surface |
| Shadows | The astronaut casts shadows. No cascaded shadows. Terrain self-shadowing comes from the DTM normals only |
| Post-processing (tone mapping beyond default, bloom, exposure) | None |
| Floating origin | Only in the orbital view (`astro/scale.ts`, camera-relative). The surface uses one local metre frame per site, a log depth buffer and a 60 km far plane. That works for a ±24 km Apollo site; Opportunity's 45 km route would need origin rebasing |
| Surface audio | None. `audio/CosmicAudioEngine.ts` is used by the orbital view only |
| Mission Time Machine (three time systems, playback, event records) | None on the surface. A date picker sets lighting; there is no playback |
| Engineering inspection (exploded, cutaway, operation demos) | None. There are part close-ups and "parts" lists from sourced catalogue text |
| Component metadata schema with provenance | Partial: `Fact<T>` with verified / conflicting / unverified status and a `SOURCES` registry exist, but there is no per-component engineering record |
| Historical routes with coordinate provenance | None. Apollo positions are single points |

### 1.2 Unity project (the directive's default engine)

| Item | Finding |
|---|---|
| Location | `unity/CosmicAtlas` (also opened as `A:/CA/unity/CosmicAtlas`, the same folder). Tracked on this branch and in `main` |
| Editor | **6000.3.28f1 = Unity 6.3 LTS**, installed at `C:\Program Files\Unity\Hub\Editor\6000.3.28f1` |
| Render pipeline | **URP 17.3.0**, linear colour space |
| Content | Milestone 2 "space showcase" only: stars, planets, galaxies, pulsar, black hole, nebula, small bodies, quality tiers Low / Medium / High / Ultra with auto-select, EditMode and PlayMode tests |
| What Unity does **not** have | No surface or terrain code; no Mars; no MER; no time-machine, route or component systems. Packages: no Cinemachine, Timeline or Splines (the built-in terrain module is present) |
| WebGL build (measured, `docs/unity-m2/COSMIC_ATLAS_UNITY_M2_VALIDATION_REPORT.md`) | 81,190,147 bytes uncompressed (Brotli size **not measured**). WASM heap 166 MB, stable. Loads in 5.0 s headless / 5.9 s headed on this machine. JS ⇄ Unity bridge: 10/10 checks |
| Integration with the React site | **Not done.** The standalone page is served by `scripts/e2e/serve_unity_webgl.py` |
| This machine | Intel Core Ultra 7 155H, **Intel Arc integrated GPU**, 15.6 GB RAM. Unity auto-selects **Medium** here. Measured exhibit costs: 3–13 ms at Medium (editor, 1600×900, GPU-synchronised; not a player FPS) |

---

## 2. Official research — Opportunity (benchmark vertical slice, M3)

### 2.1 Mission facts (NASA)

Source: [NASA Science: Opportunity](https://science.nasa.gov/mission/mer-opportunity/), plus the [Spirit & Opportunity overview](https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/).

| Fact | Value as stated | Status |
|---|---|---|
| Rover mass | 185 kg (spacecraft 1,062 kg) | verified (already in the catalogue) |
| Mast cameras above the ground | "about … 1.5 meters" | verified (used for model calibration) |
| Instruments | Pancam, Navcam, Mini-TES (mast); Mössbauer, APXS, Microscopic Imager, RAT (arm, "IDD"); magnets | verified. **Hazcam is not on this page**; it needs another NASA source |
| Landing | 21:05 PST 24 Jan 2004 = **04:54 UTC 25 Jan 2004** | verified. **Gap:** the page does not say whether this is Earth-received or spacecraft time |
| Landing site | 1.9483°S, 354.47417°E, Eagle crater, Meridiani Planum, about 14.9 km from the target | verified (already in the catalogue) |
| EDL | "bounced at least 26 times" | verified. **Gap:** entry speed, parachute size, airbag details and bounce distance were not found (see 2.5) |
| Hardware left at the landing site | Lander, backshell, parachute visible; a "discarded heat shield" | verified as named; positions not sourced |
| Planned mission | 90 sols; 600 m nominal | the page also gives 1,000 m elsewhere: **conflicting** |
| Distance driven | 45.16 km (28.06 mi) | verified |
| Distance record | Perseverance passed it on 11 Oct 2026 (45.22 km "and counting") | verified (overview page) |
| Places | Eagle (exited 22 Mar 2004); Endurance; Heat Shield Rock (iron-nickel meteorite, Jan 2005); Erebus (~300 m); Victoria (~800 m; arrived Sep 2006, entered 11 Sep 2007); Endeavour (~22 km; arrived 9 Aug 2011); final site Perseverance Valley | verified |
| Last contact / end | 10 Jun 2018 / 13 Feb 2019 | verified |
| 2007 storm | solar output fell to 128 Wh | verified |
| 2018 storm opacity | **τ ≈ 10.8 on sol 5111** (10 Jun 2018), from Pancam solar imaging ([PIA22930](https://photojournal.jpl.nasa.gov/catalog/PIA22930); [JPL news](https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/)) | NASA says Pancam images were used to **estimate** τ. Record it as an estimate, not a calibrated measurement |
| Rover dimensions (1.5 × 2.3 × 1.6 m), solar array area (1.3 m²), wheel diameter, battery | Only found in **secondary** reproductions of the 2004 press kit. The JPL press-kit PDF (`merlandings.pdf`) did not load (connection reset twice) | **unverified** until a NASA copy is read |

### 2.2 Historical route (traverse)

| Item | Finding |
|---|---|
| Product | `MERB_traverse_5130.csv` + `.lbl` + `.zip`, linked from the [MER Analyst's Notebook traverse page](https://an.rsl.wustl.edu/mera/AN/pages/mer/mer_traverse.htm) |
| Label (read in full) | PDS3 label. **`DATA_SET_ID = "N/A"`: "This product is not archived in PDS."** Producer June Wang, Washington University. Created 2018-12-28. **"File has data from sols 1 through 5130."** 21,104 rows, one per drive. Fields: SITE, DRIVE, START_SOL, END_SOL, RAW_X/Y/Z, CORRECTED_X, CORRECTED_Y |
| Method (traverse page) | Positions from rover motion counters, corrected by the science team against orbital images, then linearly interpolated by PDS Geosciences. "Opportunity rover traverse provided by science team member Tim Parker" |
| Size | **1,463,086 bytes** (HTTP header; not downloaded) |
| **Gaps** | The label does **not** state the map projection, datum or base map for CORRECTED_X / Y. The page links a "Meridiani Endeavour 25 cm basemap" README at USGS (`pdsimage2.wr.usgs.gov/.../MER_mosaics/`), which now returns **404**. The coordinate frame must be established before any route is drawn (Stage 1 task: recover the README, or fit to known positions such as the landing site and SPICE positions, and document the residuals) |
| Rover Motion Counter (PDS archive) | Listed on [PDS Geosciences MER](https://pds-geosciences.wustl.edu/missions/mer/geo_mer_datasets.htm) as a PDS4 product: the raw source of truth for site/drive frames |

### 2.3 SPICE coverage (NAIF)

**Correction to the earlier note:** Opportunity is **MER-1** (hardware designation; MER-B by launch order); Spirit is MER-2.

| Item | Finding ([NAIF archived data](https://naif.jpl.nasa.gov/naif/data_archived.html)) |
|---|---|
| Archive | `mer1-m-spice-6-v1.0/mer1sp_1000`, PDS3, **4.1 GB**, 2003-07-07 → 2018-06-10. A time-interval subset service exists |
| Kernel types | ck, ek, fk, ik, lsk, pck, sclk, spk (`aareadme.txt`). Produced by B. Semenov and L. Elson (NAIF) |
| Rover surface position | `spkinfo.txt` lists `mer1_surf_rover_*` ("Rover and site position SPK"), `mer1_ls_040128_iau2000_v1` (landing site), `mer1_rvr_rpf_*` and `mer1_still_at_ls_v1` |
| **Coverage of rover positions** | The directory listing shows **`mer1_surf_rover_0001_3240_v1.bsp` (232 MB): sols 1–3240 only**. `mer1_rvr_rpf_*` files run 040128–040422 (early 2004). **No archived surface-rover SPK beyond sol 3240 was found.** For sols 3241–5111 the traverse CSV is the only position source found so far |
| Spirit (MER-2) | Archive 2003-06-10 → 2010-05-03 |

**Consequence:** SPICE can position the landing site and the first 3,240 sols, and can cross-check the traverse frame. It cannot supply the final ~1,870 sols (including Perseverance Valley).

### 2.4 Terrain

| Product | Coverage (read from the PDS labels by ranged requests; nothing downloaded) | Size | Status |
|---|---|---|---|
| HiRISE DTM `DTEEC_018701_1775_018846_1775_U01` ([PDS](https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_018700_018799/ESP_018701_1775_ESP_018846_1775/)) | **Endeavour western rim**: lat −2.1248 to −2.4913, lon 354.5547 to 354.6887 E. 7,854 × 21,470 px at **1.012 m/px**, float32, equirectangular, R = 3,396.19 km. Orthoimages exist (RED_A 599 MB) | 674,532,936 bytes | available. Windowed reads, as for LROC. Whether Perseverance Valley lies inside is **to be checked** against the traverse in Stage 1 |
| HiRISE DTM `DTEEC_001414_1780_001612_1780_U01` ([PDS](https://hirise-pds.lpl.arizona.edu/PDS/DTM/PSP/ORB_001400_001499/PSP_001414_1780_PSP_001612_1780/)) | **Victoria crater**: lat −2.0363 to −2.0652, lon 354.4932 to 354.5151 E. 1,279 × 1,694 px at 1.012 m/px | 8,671,620 bytes | available |
| **Eagle crater / landing site (−1.9483, 354.474)** | **Not covered by either HiRISE DTM** | — | **gap.** Options: a CTX DTM (to search), HRSC DTM, MOLA. The landing-site slice may have to be lower resolution, and must be labelled so |
| MOLA MEGDR (horizon, regional) | Standard PDS product (PDS Geosciences) | to confirm | to verify in Stage 1 |
| CTX / HRSC over Meridiani | Not yet searched | — | Stage 1 |

### 2.5 3D models

| Item | Finding ([nasa/NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources)) |
|---|---|
| Opportunity (MER-B) `.glb` | **36,668 bytes**, about 3.8k triangles. Already validated in the Spacecraft Archive. **Too coarse for engineering inspection** (no separable components) |
| Spirit and Opportunity `.blend` | **12,243,528 bytes**, plus a preview `.png` (410 KB). Not downloaded; needs approval. Fidelity unknown until inspected |
| Ingenuity `.glb` | 2,019,408 bytes; already in use |
| MER lander, airbags, backshell, parachute, heat shield | **No NASA model exists** in the repository |

**Consequence:** the EDL hardware would have to be reconstructed from documented drawings and photographs, labelled as a reconstruction, or omitted.

---

## 3. Spirit and Ingenuity (Stage 4): availability only

| Item | Finding |
|---|---|
| Spirit traverse | `MERA_traverse.csv` / `.lbl` / `.zip` on the same Analyst's Notebook page (size not checked) |
| Spirit SPICE | MER-2 archive, 2003-06-10 → 2010-05-03 |
| Spirit model | The shared `.blend` above |
| Ingenuity flights | NASA [flight log PDF](https://science.nasa.gov/wp-content/uploads/2024/06/ingenuity-helicopter-flight-log.pdf): 72 flights, ~128.8 min, ~17.0 km, max 24 m altitude, max 10 m/s (per-flight rows to be read from the PDF) |
| Ingenuity SPICE | The Mars 2020 SPICE archive documents state that **no Ingenuity kernels are included** ("may be added in a future release"; not confirmed). Flight paths need another sourced product, such as NASA's published flight map |

---

## 4. Renderer assessment (directive: Unity 6.3 LTS URP unless the audit justifies an alternative)

**Facts:**
1. The required engine is installed and configured: Unity 6000.3.28f1, URP 17.3.
2. A WebGL2 build of this project already runs in Chromium on this machine and talks to JavaScript.
3. Unity has **none** of the surface, terrain, route, time or story systems. All of that exists only in R3F, with 182 unit tests and more than 300 e2e checks.
4. The Unity web build is ~81 MB uncompressed before any Mars terrain. The compressed size has not been measured.
5. Unity 6.3 WebGPU is documented as **experimental** ([Unity 6.3 manual: WebGPU limitations](https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU-limitations.html)), so a Unity build would target **WebGL2**.
6. The target hardware for validation is an integrated GPU.

**Assessment:** the audit does **not** justify abandoning the directive's default, but it shows three real risks:
- integration (no React ⇄ Unity surface bridge yet);
- download size;
- integrated-GPU frame time with terrain, shadows and atmosphere together.

**Recommendation for Stage 1/2:**
- Use Unity 6.3 URP (WebGL2) as the **Mars and engineering-inspection renderer**, embedded in the existing React shell.
- **Keep the Moon in R3F.** Whether the Moon replay moves is a Stage 6 decision.
- Gate the choice on a **Stage 2 prototype measured on this machine:** the Victoria DTM tile, the MER model and a sourced-opacity sky, at Balanced and Ultra.

**Proposed gates (for approval in Stage 1):**
- Balanced: ≥ 30 fps at 1366×768.
- First-scene download with Brotli: ≤ 40 MB.
- WASM heap: ≤ 512 MB.

If the prototype fails these gates, the documented alternative is the R3F pipeline with added quality profiles, cascaded shadows and post-processing. That alternative would be decided with measurements, not assumed.

---

## 5. Gaps that block "maximum realism" without invention

1. **Traverse coordinate frame:** the projection and datum of CORRECTED_X / Y are not in the label, and the base-map README is a 404.
2. **No HiRISE DTM at the landing site** (Eagle crater).
3. **No NASA EDL hardware models.** The press kit, which is the EDL figure source, did not load. Needs another NASA copy, such as the NTRS EDL papers.
4. **Rover engineering dimensions** (wheels, arrays, mast, arm link lengths) are not yet from a primary NASA source. These are required before any exploded or cutaway view. Rule: no dimension without a source; an exploded view will use only components and relationships that are documented.
5. **Rover positions after sol 3240:** not in the archived SPICE; traverse CSV only.
6. **Mars atmosphere:**
   - no surface-pressure measurement from Opportunity was found;
   - τ history beyond the sol-5111 record is still to source (Pancam τ time series, Lemmon et al.);
   - sky colour must come from calibrated Pancam data or a cited model.
7. **The three time systems** need a cited Mars time algorithm: the Mars24 / Allison & McEwen (2000) sol and LMST conversion is to be sourced in Stage 1.

---

## 6. Downloads needed later (nothing downloaded yet; each needs your approval)

| File | Source | Size | Purpose |
|---|---|---|---|
| `MERB_traverse_5130.csv` (+ `.lbl`, read already) | an.rsl.wustl.edu (Washington University; not a PDS archive product) | 1,463,086 bytes | Opportunity route |
| `DTEEC_001414_1780_001612_1780_U01.IMG` | hirise-pds.lpl.arizona.edu | 8,671,620 bytes | Victoria terrain: Stage 2 prototype tile |
| `DTEEC_018701_1775_018846_1775_U01.IMG` | hirise-pds.lpl.arizona.edu | 674,532,936 bytes: **windowed reads proposed**, not a full download | Endeavour / Perseverance Valley |
| `Mars Exploration Rover - Spirit and Opportunity.blend` | github.com/nasa/NASA-3D-Resources | 12,243,528 bytes | Higher-fidelity rover, to be evaluated |
| `mer1_surf_rover_0001_3240_v1.bsp` | naif.jpl.nasa.gov | 232 MB, or the subset service | Cross-check of the traverse frame |
| Ingenuity flight log PDF | science.nasa.gov | not checked | Stage 4 |

---

## 7. Proposed Stage 1 scope (on approval)

1. **`FINAL_VISUAL_REALISM_SPEC.md`:**
   - renderer decision record with the gates;
   - unit and floating-origin design (1 unit = 1 m, rebasing);
   - quality profiles Ultra / High / Balanced / Performance, mapped to concrete settings;
   - the performance-instrumentation contract.
2. **Schemas (TypeScript and JSON Schema, validated by tests):**
   - component metadata with per-field provenance and implemented / partial / planned / unavailable status;
   - mission event records;
   - route records with coordinate provenance, frame and uncertainty;
   - Mars `PlanetEnvironment`;
   - the mission authoring template (`MISSION_DATA_AUTHORING_GUIDE.md`).
3. **`MISSION_TIME_MACHINE_ARCHITECTURE.md`:**
   - the three time systems: UTC/TDB event time, Mars local time (sol + LMST), playback time;
   - playback controls, "Go Back" state restoration and the camera choreography model;
   - the SPICE coverage table above.
4. **`HISTORICAL_ROUTE_RECONSTRUCTION.md`:** the method to establish the traverse frame, with residuals against the landing site and SPICE.
5. **Research completion:**
   - primary NASA sources for rover dimensions and EDL;
   - CTX / HRSC / MOLA availability at Eagle crater;
   - the Pancam τ series;
   - the Mars time algorithm.
6. **Storyboard draft:** `MISSION_STORYBOARD_OPPORTUNITY.md`, sourced beats only.

**Not in Stage 1:** no rendering code, no Unity scene work, no downloads beyond what you approve.
