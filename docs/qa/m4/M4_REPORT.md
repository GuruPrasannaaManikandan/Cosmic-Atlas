# M4 — Seven Mars Landing-Site Environments in Unity: Implementation and Evidence Report

**Date:** 2026-11-11.
**Branch:** `main`, uncommitted. **Nothing was committed or pushed.**
**Authoritative evidence:** `docs/qa/m4/production-preview/` (production build, `vite preview` on :4173, real Chrome on the Intel Arc iGPU / D3D11).

## 1. Status per mission

Every environment is a real Unity scene: the embedded Mars player's new **site mode** builds it at run time from that site's package (`frontend/public/mars-sites/<id>/`). Each site was opened from the catalogue in the production preview and checked for terrain, hardware, controls, inspection, minimap, coordinates, map, exit and switching.

| Mission | Status | Terrain (USGS controlled HiRISE DTM, 1 m) | Hardware and its provenance | Controls | Production preview |
|---|---|---|---|---|---|
| Viking 1 — Chryse Planitia | **Implemented** | DTEEC_001521_2025_001719_2025_U01 | NASA model (Viking Lander), footpad triangle scaled to 2.21 m (NSSDCA) | On foot, first person | 17/17 checks, plus 1 skip: no named parts |
| Viking 2 — Utopia Planitia | **Implemented** | DTEEC_002055_2280_001976_2280_A01 (its own terrain) | Same NASA lander model (the landers were identical) | On foot | 17/17, plus 1 skip |
| Pathfinder + Sojourner — Ares Vallis | **Implemented** | DTEEC_002391_1995_001890_1995_A01 | **Documented reconstructions** (NASA publishes no model): lander (0.9 m tetrahedron, three petals with 2.8 m² of cells, IMP ~1.5 m) and Sojourner (65 × 48 × 30 cm, six 13 cm wheels, rocker-bogie) | Expedition rover | 17/17, component: petals |
| Spirit — Gusev crater | **Implemented** | DTEEC_001513_1655_001777_1650_U01 | NASA articulated MER model (Opportunity's twin) and a **simplified** MER lander (no NASA model) | Expedition rover | 17/17, component: mast |
| Phoenix — Vastitas Borealis | **Implemented** | DTEPC_008591_2485_008644_2485_U01 (polar stereographic) | **Documented reconstruction**: deck 1.5 m, array span 5.52 m, arm 2.35 m, meteorology mast top 2.2 m (Phoenix press kit) | On foot | 17/17, component: solar |
| Curiosity — Gale crater | **Implemented** | DTEEC_018854_1755_018920_1755_U01 (61.6 % of the square lies inside the DTM; the rest is left empty) | NASA model (Curiosity), scaled to a 2.2 m height | Expedition rover | 17/17, plus 1 skip: no named parts |
| InSight — Elysium Planitia | **Implemented** | DTEEC_037262_1845_036761_1845_U01 | NASA model (InSight Cruise Lander), native metres, 143 parts; SEIS, WTS, HP3, arm, IDC, ICC, solar, RISE, TWINS and UHF are highlightable | On foot | 17/17, component: SEIS |

**Total: 116 of 116 checks pass; 3 component checks are skipped** because those models have no separately named parts (`production-preview/m4_sites_check.json`). A second run on the final bundle (Viking 1 and InSight) passed 33/33.

## 2. What was built

### Unity

- **`Runtime/Mars/MarsPrototype.Sites.cs` (new): site mode.**
  - Boot request through the bridge.
  - Runtime loading of the terrain, the horizon, the ground image, rocks and hardware.
  - A converted NASA mesh loader.
  - Procedural documented reconstructions: Sojourner, the Pathfinder lander, Phoenix and the MER lander. Solar panels carry a procedural cell texture.
  - A first-person walker for landers.
  - Inspection of a whole vehicle or a component, with highlights only on the model's own parts.
  - Discovery events, pose and ready reports, restore, and unload of everything the site created.
- **`MarsPrototype.cs` / `.Explorer.cs`:** site-mode branches in `Start`, `Update`, `LateUpdate`, `ApplyProfile` and the JS commands. **Victoria's code paths are unchanged.**
- **`MarsTerrain.cs`:** a byte-array loader and `Destroy()`. Profile switches now free the previous meshes, which leaked before.
- **`MarsRocks.cs`:** a byte-array constructor.
- **`Plugins/WebGL/MarsBridge.jslib`:** `MarsGetSite()`.
- **Player:** `Builds/MarsExplorer` (100.6 MB raw, Unity 6000.3.28f1). The build log reports "6 errors"; these are URP editor messages about `AutodeskInteractiveTransparent.shadergraph` during the asset refresh, not script or player errors.

### React

- **`mars/MarsSiteExperience.tsx` (new):**
  - HUD: mission, scene date, UTC, computed sol and Sun.
  - Compass with hardware markers, nearest-hardware waypoint, persistent minimap (collapsible), and live E/N offsets plus latitude/longitude.
  - Site map.
  - Inspector with four tabs: Overview, Inspect (components), Timeline from the sourced catalogue, and Sources.
  - Controls panel and pause.
- **`surface/sites.ts`:** seven `m4(...)` site entries (rover or lander).
- **`mars/MarsMiniMap.tsx`:** draws every site's hardware.
- **`mars/marsBridge.ts`:** the site parameter and its types.
- **`ui/App.tsx`:** routing, plus a single global landing-site catalogue host.

### Data pipeline

- **`scripts/mars/build_site.py` (new):** projection-independent sampling over an exact local ENU grid.
  - Local terrain: 1,401 × 1,401 at 1 m.
  - Ground image at 0.5 m.
  - Horizon from the same DTM: 751 × 751 at 24 m, out to about 9 km.
  - Rocks placed from orthoimage brightness and DTM slope, as at Victoria.
  - A terrain check file.
- **`scripts/mars/site_defs.py` (new):** writes `site.json`; every date comes from the catalogue, and every model and placement is labelled.
- **`scripts/mars/mars_sites.py`:**
  - InSight now uses the HiRISE-located lander position.
  - The ortho lookup handles both STAC asset naming schemes.
  - The DTM URL falls back to the pair folder for the A01 products.
- **`scripts/mars/hardware_candidates.py` (new):** a location aid. It was inconclusive (see §5).

### UI (Phase 6)

- **Homepage:** the hero title was hidden under the fixed bar. It started at 8 px (1280 × 720), 13 px (1024 × 768) and **−236 px** on phones, against a bar ending at 64 px. The hero now starts below the bar, centres only when it fits, scrolls otherwise, and uses a smaller title on short windows.
  - Measured after the fix: the title starts at 139 px (154 px on phones) at every tested size, with no horizontal overflow (`ui/layout_check.json`).
  - The homepage has new entries: "Mars landing sites · 8 environments" and "Moon landing sites".
- **Catalogue (`SitePicker`):** a responsive grid of equal cards. Each card shows:
  - a Rover-mission or Stationary-lander badge and an Available badge;
  - mission, site, coordinates and landing date;
  - the hardware's provenance and the scene.

  Unbuilt entries are listed separately as "Catalogued — no surface environment yet" and never marked available. Two older defects are fixed: the heading read "Explore the Mars", and the close button had no style at all.
- **Exit during a return flight:** entering a site from the catalogue now ends a return flight that is still playing. Before, its overlay kept the keyboard on the new site.

## 3. Data sources

| Data | Source |
|---|---|
| Terrain and images | USGS Astrogeology analysis-ready **controlled** HiRISE DTMs and orthoimages (STAC collection `mro_hirise_socet_dtms`), read over HTTP |
| Landing coordinates | PDS ODE as in the catalogue (Folkner et al. 1997; Arvidson et al. 2004; Smith et al. 2009; Seelos et al. 2014). InSight: Golombek et al. 2020 (doi:10.1029/2020EA001248), HiRISE-located at 4.502384°N, 135.623447°E |
| Dimensions | NASA Mars Pathfinder Landing Press Kit (lander, Sojourner); NASA Phoenix press kit (deck, arrays, arm, mast); NSSDCA (Viking footpads, Pathfinder, Phoenix) |
| Models | NASA 3D Resources (Viking Lander, Curiosity, InSight Cruise Lander, MER). Free of copyright, as the existing provenance notes record |
| Dates | The sourced mission catalogue (`frontend/src/missions/catalog/mars.ts`) |
| Sun | Mars24 (NASA GISS), as at Victoria |

## 4. Verification

| Suite (production preview :4173) | Before M4 (same tree, baseline) | After M4 |
|---|---|---|
| **M4 seven sites** (`m4_sites_check.py`) | — | **116/116 (3 skipped)** |
| Abandoned journey (Opportunity / Victoria) | 42/42 | 42/42 |
| M3 expeditions | 23/23 | 23/23 |
| Relive Mission | PASS | PASS |
| Controls (WASD / arrows) | 27/27 | 27/27 |
| Moon sites | 42/42 | 42/42 |
| Storytelling | 15/15 | 15/15 |
| Surface exploration | 1 failure (R3 return-to-orbit position delta) | the same 1 failure |
| Surface layout | 14 failures (the check expects the old inspector tab set; an "Overview" tab was added earlier) | the same 14 |
| Travel overhaul | timeout (30 s wait) | the same |
| Travel controls (old scheme) | 16/18 (expects "C descends" and "drag steers the ship", both replaced by the M0 controls) | the same |

- **No regression:** every failure after M4 was already there, identically, before any M4 code ran.
- **Unit tests:** Vitest 284/284.
- **Types:** `tsc --noEmit` is clean.
- **Errors:** 0 console errors and 0 Unity errors on all seven sites.

## 5. Performance (production preview, Balanced, 1366 × 768, iGPU)

| Site | Ready after clicking Land (s) | Unity frame time p50 | Draw calls | Total used memory (MB) | Rocks drawn | Terrain / horizon triangles |
|---|---|---|---|---|---|---|
| Viking 1 | 11.2 (first load: player download) | 17 ms | 305 | 103.8 | 12,826 | 1.10 M / 0.38 M |
| Viking 2 | 5.3 | 17 ms | 245 | 103.2 | 10,644 | 1.10 M / 0.26 M |
| Pathfinder | 5.1 | 17 ms | 534 | 112.3 | 9,131 | 1.10 M / 0.24 M |
| Spirit | 6.1 | 17 ms | 538 | 105.6 | 13,212 | 1.10 M / 0.19 M |
| Phoenix | 5.3 | 17 ms | 226 | 102.6 | 8,644 | 1.10 M / 0.21 M |
| Curiosity | 5.2 | 17 ms | 316 | 98.4 | 8,162 | 0.68 M / 0.29 M |
| InSight | 9.3 | 17 ms | 451 | 100.6 | 5,678 | 1.10 M / 0.28 M |

- **Frame rate:** a frame time of 17 ms is the 60 Hz vsync cap, so every site holds 60 fps. Uncapped frame times for the sites were **not measured**.
- **Load:** inside the player, a site builds in 1.7 s, measured on Viking 1.
- **Package size:** each site package is 7.5–9.8 MB.
- **Isolation:** only the selected site is ever downloaded or resident. Leaving a site quits the player (S10 passes for all seven) and the next site starts a fresh one. There is never a second player.

## 6. Limitations (stated, not hidden)

1. **Registration:** only InSight's hardware is at a HiRISE-measured position. The other six sit at their sourced catalogue coordinates, but **I could not identify the landers in the HiRISE orthoimages**. The bright-feature contact sheets were inconclusive, and the 2010 and 2014 images predate Curiosity and InSight. Historical coordinate frames can differ from the controlled frame by up to hundreds of metres; every site record says so.
2. **No far horizon:**
   - The USGS global HRSC-MOLA DEM was unreachable over HTTP from this machine (403 / hang).
   - The horizon therefore ends at the DTM footprint, about 9 km away.
   - **Mount Sharp is not modelled**; the Curiosity scene says so.
   - About 38 % of Curiosity's local square lies outside its DTM and is left empty.
3. **Reconstructions:**
   - Pathfinder, Sojourner and Phoenix: no NASA model exists. The reconstructions use sourced overall dimensions, but part shapes and positions are simplified.
   - The MER lander at Spirit's site: a simplified model with unsourced dimensions.
   - All four are labelled in the site record and on the catalogue card.
4. **No component highlights for Viking and Curiosity:** the NASA Viking and Curiosity models have no separately named parts, so inspection frames the whole vehicle. The Curiosity model also measures +31 % in length, because of its arm pose.
5. **Illustrative elements:**
   - the ground colour, since HiRISE RED is a single band;
   - the time of day;
   - τ = 0.5 (assumed);
   - rock shapes (their placement is data-informed);
   - the expedition rover;
   - the camera arrival;
   - the rover-beside-lander placements at Pathfinder and Spirit;
   - the arm pose on Phoenix.
6. **No historical replay for the new sites:** only Victoria has a recorded traverse replay. The new sites show the scene date plus the mission timeline.
7. **Terrain detail:** no per-site normal map. Close-range relief comes from the 1 m mesh and the rocks only.

## 7. Git

Everything is uncommitted on `main`. **No commit, push or merge was made.** The working tree also still holds the earlier sessions' uncommitted M3, Relive and visual-overhaul work, untouched. `unity/CosmicAtlas/ProjectSettings/ShaderGraphSettings.asset` shows a line-ending-only change from the Unity batch build.
