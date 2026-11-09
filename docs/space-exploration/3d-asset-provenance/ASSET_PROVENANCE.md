# 3D Asset Provenance Register (Phase 2)

## Official NASA models (NASA 3D Resources)

**Licence and download:**
- Source: [github.com/nasa/NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources). Its README says the assets "are free and without copyright".
- Downloaded on 2026-11-09 with the user's approval into `frontend/public/assets/models/nasa/`.
- NASA's own preview renders are kept for comparison in `references/`.

**Runtime:**
- All seven files are glTF 2.0 with Draco compression and WebP textures.
- The Draco decoder is self-hosted in `public/draco/` (copied from `three@0.169.0`), so there is no CDN at runtime.

**Validation:**
- Every number below is measured on the loaded geometry, in real Chrome, by `scripts/e2e/model_validation_check.py`.
- The same numbers are shown live in the in-app **Spacecraft Archive** (top bar → 🛰 Spacecraft).

| Model file | Represents | SHA-256 (first 16) | Size | Triangles | Scale | Sourced check | Fidelity |
|---|---|---|---|---|---|---|---|
| `apollo-lm.glb` | Apollo 11 LM **descent stage** (85 ascent-stage meshes removed) | `379101dfcee39926` | 0.72 MB | 47,024 | native metres | Footpad span **6.43 m vs 9.4 m (−31.6%) — DEVIATES** (NSSDCA) | Medium (stylised legs) |
| `mer-b.glb` | Opportunity (MER-B) | `95c852efb385b55b` | 0.04 MB | 3,845 | ×0.2053, calibrated so the mast cameras are 1.5 m up (NASA) | No independent dimension sourced yet | Medium (low-poly, correct layout) |
| `perseverance.glb` | Perseverance | `10db7c03a5e63a5a` | 4.99 MB | 199,521 | native metres; posed with the model's own `CylinderAction` clip at t = 1.0 s (mast deployed) | Length 3.11 vs 3.0 m (+3.6%) ✅; width 2.70 vs 2.7 m (+0.2%) ✅; height 2.24 vs 2.2 m (+1.7%) ✅ | High |
| `ingenuity.glb` | Ingenuity | `9e5a5398ab335eae` | 2.02 MB | 9,124 | native metres | Rotor span 1.21 vs 1.2 m (+1.0%) ✅ | High |
| `viking-lander.glb` | Viking 1 lander | `1233dc2c96a1c0b0` | 1.85 MB | 99,526 | ×0.2036, calibrated to the NSSDCA footpad triangle (2.21 m sides) | Calibration only | High |
| `insight.glb` (panels deployed) | InSight lander | `4e4c0c8b034de9f2` | 3.95 MB | 146,890 | native metres | No overall dimension found on the NASA page read | High |
| `huygens.glb` (Cassini-Huygens A, "without Cassini") | Huygens (ESA) | `d2cb317244d4a64e` | 1.01 MB | 684 | native metres | Front shield 2.65 vs 2.7 m (−1.9%) ✅ | **Low — placeholder-grade; not presented as faithful** |

Full SHA-256 values are in `frontend/src/surface/models/nasaModels.ts`.

## Findings about the official models

1. **Apollo LM — the legs are too short.**
   - The model's octagonal stage is about 4.1 m across (NSSDCA: 4.2 m), but its footpads span only 6.43 m against 9.4 m.
   - **Handling:** the NASA model is the default on the Moon because it is far more recognisable (plaque, foil, ladder, porch, plume deflectors). The Inspect tab offers a **dimension-accurate reconstruction** built to the NSSDCA numbers.
   - The deviation is shown in the archive and in the object's provenance text.
2. **Perseverance — the file stores the mast stowed.** It is 1.85 m tall as stored, against NASA's 2.2 m. Its own animation clip deploys the mast (found by sampling every clip in Chrome), which brings it to 2.24 m (+1.7%).
3. **Huygens — the model is a placeholder.** It is a foil disc plus a box. Its diameter is right, but it does not resemble the probe. Phase 5 will reconstruct it from ESA engineering references.
4. **MER-B and Viking ship in arbitrary units.** They are calibrated to sourced dimensions, and the calibration is disclosed in the archive.

## Procedural reconstructions (this repository)

| Model | Basis | Status |
|---|---|---|
| LM descent stage (dimension-accurate) | NSSDCA: 4.2 m octagon, 1.7 m thick, 1.5 m clearance, 9.4 m footpad span, ~1 m skirt | Alternative to the NASA model |
| EASEP passive seismic station | NSSDCA description (square base, two canted solar panels, antenna, dust detector) | In use; dimensions approximate (LPI pages returned HTTP 403) |
| Laser Ranging Retroreflector | NSSDCA description; aimed at Earth's mean direction | In use; panel size and cube count approximate |
| Astronaut | Stylised Apollo-era EVA suit | In use; generic explorer |

## Not yet available as NASA glTF

- **Curiosity:** `.blend` only (10 MB). It needs a Blender → glTF conversion; Blender is not installed here.
- **Not in NASA 3D Resources:** Apollo LRV, ALSEP, Sojourner/Pathfinder, Phoenix, Spirit-specific, Chandrayaan-3 (ISRO). These are planned as reconstructions from official engineering references.
