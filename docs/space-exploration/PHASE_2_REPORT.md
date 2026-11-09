# Phase 2 — Spacecraft and Instrument Models: Report

- **Branch:** `feat/space-exploration` (PR #12, not merged).
- **Asset register:** [3d-asset-provenance/ASSET_PROVENANCE.md](3d-asset-provenance/ASSET_PROVENANCE.md).

## What changed

**Official NASA models**
- Seven models from NASA 3D Resources, downloaded with approval: Apollo LM, MER-B, Perseverance, Ingenuity, Viking lander, InSight and Huygens.
- Recorded for each: SHA-256, size, licence statement and NASA's preview render.

**Loader** (`surface/models/NasaModel.tsx`)
- drei `useGLTF` with a **self-hosted Draco decoder**.
- Per-model processing:
  - part removal (the LM ascent stage);
  - animation posing (Perseverance's mast);
  - calibration to sourced dimensions (MER-B, Viking);
  - re-centring on the footprint; shadows.
- **Measurement and validation** (`measure.ts`): width, length, height, footpad span, rotor or shield span, and the three-leg footpad triangle, all compared to sourced values with a tolerance.

**Spacecraft Archive** (top bar → 🛰 Spacecraft; a lazy-loaded modal)
- Orbit view of every model, with a 1 m grid and a 1.8 m person for scale.
- Live measured dimensions and a validation table (PASS / DEVIATES).
- Scale and pose notes, provenance with a link and SHA-256, and a fidelity rating.
- Non-NASA hardware (Huygens, ESA) is labelled.

**Moon**
- The Apollo 11 LM is now **NASA's official model with the ascent stage removed**: 85 meshes. Only the descent stage stayed on the Moon.
- A procedural model is shown while it loads, and if loading fails.
- The Inspect tab switches between the NASA model and the **dimension-accurate reconstruction**.
- Colliders and inspection anchors were measured on the NASA model.

**Catalogue (Phase 1b data)**
- 9 new sources (NASA Science, NSSDCA, ESA, NASA 3D Resources).
- **New objects:**
  - Perseverance: 3 × 2.7 × 2.2 m, 1,025 kg;
  - Ingenuity: 1.8 kg, 1.2 m rotors, 72 flights;
  - Viking 1 lander: 572 kg, 2.21 m footpad triangle;
  - InSight lander.
- **Updated records:**
  - Viking 1: landing 1976-07-20 11:53:06 UT; contact lost 1982-11-13.
  - InSight: landing 2018-11-26 19:52:59 UT at about 4.5°N 135.9°E; end 2022-12-15.
  - Mars 2020: landing 2021-02-18; Ingenuity milestones.
  - Huygens: landing 14 Jan 2005 (⚠ 11:30 vs 12:34 UTC, both ESA); 318 kg; 2.7 m shield.
- Every object links to its model id.

## Validation results (Chrome)

| Model | Result |
|---|---|
| Perseverance | Length +3.6%, width +0.2%, height +1.7% — PASS (mast deployed) |
| Ingenuity | Rotor span +1.0% — PASS |
| Huygens | Shield diameter −1.9% — PASS, but placeholder-grade visually |
| Apollo LM | Footpad span **−31.6% — DEVIATES** (stylised legs). The reconstruction alternative is in-app |
| MER-B, Viking | Calibrated to sourced dimensions; no independent second dimension yet |
| InSight | Not validated (no sourced overall dimension) |

## Tests

| Suite | Result |
|---|---|
| Unit (Vitest) | 165/165 — 5 new in `measure.test.ts`: dimensions, footpad span, three-leg calibration that recovers 2.21 m, check deviation maths, and registry provenance and source integrity |
| `model_validation_check.py` | 22/22 pipeline checks; 1 model deviation recorded (above) |
| `surface_exploration_check.py` | 35/35, including A9 (the LM is the NASA model with the ascent stage removed) and D4b (model switch) |
| Regressions | See the PR comment for this push |

## Known limitations

1. **Huygens** needs a real reconstruction (Phase 5).
2. **Curiosity** needs a Blender conversion.
3. **LRV, ALSEP, Sojourner, Phoenix and Pragyan** are not in NASA 3D Resources and need reconstructions.
4. **MER-B** is low-poly. A higher-detail model would come from the `.blend` "Spirit and Opportunity" (12 MB, needs conversion).
5. **Asset size:** the NASA models load lazily per use (archive or site), adding about 15 MB to the static site, not to the JS bundle.
