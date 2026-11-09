# Mission Data Validation (2026-11-09)

## Status: not applicable yet

Section 8 of the brief covers mission dates, agency ownership (Huygens/ESA, Chandrayaan-3/ISRO), artifact coordinates, rover traverses, instruments and mission statuses. It cannot be validated because **the product contains no mission, rover, lander or artifact records**:

- **Frontend:** no mission or artifact data modules. The catalogue holds celestial objects only (planets, moons, stars, galaxies, structures).
- **Backend:** endpoints are health, dataset ingest/records/points, and SIMBAD/Horizons lookups. There is no mission store.
- **Unity project:** a rendering showcase (stars, planets, black hole, nebula, galaxies, pulsar, small bodies). No mission content.
- The defining specification, *Cosmic_Atlas_Mission_Archaeology_Master_Prompt.pdf*, is **not on this machine**, so the required record schema and sources are unknown.

The earlier P0 instruction also froze mission, rover and lander work until the foundation is accepted (PR #2 is awaiting review).

## Scientific data that *is* in the product and was validated

| Data | Source | Validation |
|---|---|---|
| Planet poles, rotation (W) | IAU WGCCRE 2015 (2009 for Mars and Neptune) | Unit tests: tilt to orbit vs NASA fact sheets ≤ 0.35° for all 8; periods |
| Uranus / Neptune rings | NASA NSSDCA ring fact sheets (updated 2015-10-14) | Unit tests on radii, order and ring sets |
| Neptune dark spots | Voyager 2 (1989); gone in Hubble images by Nov 1994 | Unit test: shown only for 1989–1994 sim dates |
| Moon orbits | JPL SSD satellite mean elements | Existing parity tests (Horizons-confirmed frames) |
| Black-hole optics (Unity) | Exact Schwarzschild integral, Bozza (2002) | 25 EditMode tests |

## Prerequisites for the mission phase

1. Provide the Mission Archaeology Master Prompt.
2. Define the record schema: UTC timestamps with precision, agency ownership, frames/epochs/datums, uncertainty.
3. Add deterministic fixture records for tests before any live source.
