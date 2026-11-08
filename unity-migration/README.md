# unity-migration — Milestone 1: headless astronomy core parity

Implements **Milestone 1** of [`COSMIC_ATLAS_UNITY_MIGRATION_BLUEPRINT.md`](../COSMIC_ATLAS_UNITY_MIGRATION_BLUEPRINT.md) §13:
a C# port of the Cosmic Atlas astronomy engine, checked against the existing TypeScript engine with exported fixtures.
No rendering, no UI, no Unity project. Nothing under `frontend/` or `backend/` is modified; the exporter only reads TS modules.

```
unity-migration/
  exporter/export-astro-data.ts           reads frontend/src/{astro,data} → writes data/*.json (+ self-checks)
  data/catalog.v1.json                    canonical astronomy data artefact (79 objects, 54 solar bodies, 8 planets)
  data/parity_fixtures.v1.json            TS-engine reference outputs (52 epochs 1800–2050, 62 time cases, …)
  src/CosmicAtlas.Astro/                  netstandard2.1 / C# 9 library, no dependencies
    Runtime/*.cs + CosmicAtlas.Astro.asmdef   drop-in for Unity (asmdef: noEngineReferences = true)
  tests/CosmicAtlas.Astro.Tests/          NUnit (net10.0): parity, catalogue, axis mapping, precision
  Directory.Build.props                   puts bin/obj under %LOCALAPPDATA%\CosmicAtlas\unity-migration-build
```

## Run

Prerequisites: Node 22 + `frontend/node_modules` (for `vite-node`), .NET SDK 10 (tested 10.0.403).

```bash
cd frontend && npx vite-node ../unity-migration/exporter/export-astro-data.ts
```
```bash
cd unity-migration && dotnet test tests/CosmicAtlas.Astro.Tests
```

Re-export whenever `frontend/src/astro/*` or `frontend/src/data/{catalog,solarSystem,satellitePhaseFit}.ts` change; the
artefact records the git HEAD, any dirty source files and a SHA-256 content hash, and the tests check that the fixtures
and the catalogue come from the same export.

## What is ported

| TS module | C# | Notes |
|---|---|---|
| `astro/coords.ts` | `Coords.cs` (`AstroConstants`, `Coords`, `AxisMapping`) | Sexagesimal parsing, unit parsing and `formatDistance` stay React-only (UI concerns). |
| `astro/time.ts` | `AstroTime.cs` | Same leap-second table; sim time is UTC ms in a `double`, as in JS. |
| `astro/kepler.ts` | `Kepler.cs` | Same solver, tolerances, iteration limits and operation order. |
| `astro/ephemeris.ts` | `PlanetEphemeris.cs` | Element values come from `catalog.v1.json`, not hard-coded. Adds `PlanetHeliocentricKm`. |
| `data/catalog.ts` positionOf / solarBodyRootPos | `AstroCatalog.cs` | Legacy single-frame (galactic ly) semantics, kept **for parity only**. |
| — (new) | `SolarSystemFrames.cs` | Hierarchical km frames + lowest-common-ancestor subtraction (blueprint §6.3). |
| `CosmicObject`, `SolarBody` types | `CatalogModel.cs` | Serializer-agnostic POCOs (System.Text.Json in tests, Newtonsoft in Unity). |

## Verified results (`dotnet test`, 22/22 passed)

| Check | Tolerance | Max observed |
|---|---|---|
| Time (TT−UTC, JD TDB, centuries, model range, calendar epochs) | bit-exact | bit-exact |
| Constants in the artefact vs compiled constants | exact | exact |
| Unit vectors, frame matrices, orbit normals | 1e-15 abs | 1.7e-16 |
| Eccentric anomaly (both solvers) | 1e-13 rad | 0 |
| Planet heliocentric km / body relative-to-primary km / body heliocentric km / orbit polylines | max(1e-6 km, 1e-12·\|v\|) | ≤ 6.4e-4 of tolerance |
| Legacy root-frame ly (all 79 objects × 11 epochs, planets, bodies) | 4 ULP of coordinate magnitude | ≤ 1 ULP |
| Camera 21.7 km from Deimos, 52 epochs | hierarchical < 1e-9 km | **7.3e-13 km** (legacy root frame: **21.4 km**) |

## Findings surfaced by this milestone

- **D1 confirmed numerically:** one ULP of the TS root frame at the Sun is 34.42 km; a camera at Deimos' arrival distance
  is mispositioned by up to 21.4 km in that model, versus 7e-13 km with hierarchical frames.
- **D9 (new, existing app):** Tethys' derived mean motion is negative (−6.23°/day) because the JPL apsidal period used
  (0.005 yr) gives ω̇ ≈ 197°/day. The TS `validateElements` reports the same error. Positions are unaffected (e ≈ 0, phase fit
  RMS 0.23° vs Horizons), but the app's Inspector shows **"Orbital period: −57.789 d"** and Tethys' synchronous spin uses that
  value. Recorded in `CatalogTests.KnownUpstreamDefects`; not fixed here because the app must not be modified in this phase.

## Not in this milestone

Unity project, rendering, bridge, navigation/travel ports (Phases 1–3), and the out-of-scope M1 items listed above.
