# Planetary Exploration Architecture (Moon + Mars)

**Status:** the shared architecture is in place. **The Moon is implemented. Mars is configured as *planned* and cannot be opened.** No Mars terrain, sky, lighting or site exists, and none is faked.

## Shared vs. planet-specific

| Shared, world-agnostic (`frontend/src/surface/`) | Reads from |
|---|---|
| Layout: `SurfaceExperience` root grid (viewport + inspector / bottom sheet) | — |
| HUD (header, compass, status chips, banner, prompt, minimap, key hints) | `PlanetEnvironment.name / gravity / words`, site record |
| Inspection panel (`DiscoveryPanel`): tabs, parts, specifications, timeline, science | Mission catalogue (`src/missions`) |
| Guide dialogue (`guide.ts`) and narrator (`narrator.ts`) | Catalogue stories and sources |
| Surface map and minimap (`SurfaceMap`) | Site terrain + objects |
| Character controller + gait (`controller.ts`) | `PlanetEnvironment.gravity` |
| Camera: exploration, first/third person, inspection framing | Hardware bounds, viewport aspect |
| Terrain engine (`SiteTerrain`: DTM + horizon + procedural fallback) | Site terrain spec |
| Touch controls | — |

| Planet-specific (`planets.ts` → `PlanetEnvironment`) | Moon (implemented) | Mars (planned) |
|---|---|---|
| `gravity` | 1.62 m/s² (NSSDCA) | **3.73 m/s² (NSSDCA mean)**. The brief's "≈3.71" is not the sourced value, so it is not used |
| `atmosphere` | vacuum | thin CO₂; surface pressure **not sourced yet** (kept empty) |
| `sunDirection(ms, lat, lon)` | IAU 2015 Moon rotation + JPL ephemeris (unit-tested against Apollo 11) | **`null`: not implemented**, so the environment cannot be explored |
| `skyBodies` | Earth (mean direction) | none yet |
| `sky` | black sky; stars faint in daylight | to be derived from a sourced scattering model |
| `nightFill` | earthshine | none |
| `ground` colours | regolith greys | **not set**: they must come from orbital imagery |
| `dust.drag` | false (ballistic in vacuum) | true (drag model still to be written) |
| `words` | "Lunar night…", "only earthshine lights the ground" | "Night at this date." |

**Guards:**
- `isExplorable(bodyId)` requires `status: 'implemented'` and a lighting model.
- `sitesForBody()` returns only explorable sites, so the **EXPLORE** action never appears for Mars.
- Unit tests (`planets.test.ts`) enforce that Mars has no sites, no lighting and its own sourced gravity.

## Selecting a world

The orbital view offers **EXPLORE ⟨WORLD⟩** when you are near a body that has explorable sites. A site record (`sites.ts`) carries its `bodyId`. Everything downstream resolves the environment with `planetFor(site.bodyId)`. Adding Mars therefore means adding:
1. a `PlanetEnvironment` with its models;
2. site records.

No HUD, inspector, guide, narrator or map code changes.

## What Mars still needs (from `PLANETS.mars.requirements`)

1. **Lighting:** the Mars rotation model (IAU WGCCRE 2015 Mars elements) and the Sun direction at a site, unit-tested against a sourced lander sol time.
2. **Daytime sky:** from a sourced atmospheric scattering model. No guessed colours.
3. **Terrain:**
   - HiRISE / CTX DTMs (NASA PDS) around each landing site;
   - MOLA MEGDR for the horizon;
   - the same windowed-read pipeline and cross-checks as the Moon.
4. **Surface colour and albedo** from orbital imagery.
5. **Dust with atmospheric drag** (sourced pressure and density).
6. **Site records** — sourced coordinates for:
   - Perseverance (Jezero; currently none);
   - InSight (currently "about 4.5°N 135.9°E" only);
   - the final positions of Spirit and Opportunity.
7. **Hardware placement:** Viking 1/2, Pathfinder + Sojourner, Spirit, Opportunity, Curiosity, Perseverance + Ingenuity. NASA models for Perseverance, Ingenuity, Viking, InSight and MER-B are already validated in the Spacecraft Archive; Curiosity needs a `.blend` conversion.

## Roadmap (separate, validated vertical slice)

| Order | Site | Why first |
|---|---|---|
| 1 | Meridiani Planum — Opportunity's landing site (coordinates sourced) | Story and catalogue already exist |
| 2 | Jezero — Perseverance + Ingenuity | Models validated; coordinates still needed |
| 3 | Gale — Curiosity | Coordinates sourced (PDS ODE); model needs conversion |
| 4 | Gusev — Spirit; Viking 1 / 2; Pathfinder | Coordinates sourced (PDS ODE / NSSDCA) |
