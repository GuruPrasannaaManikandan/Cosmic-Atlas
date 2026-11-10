# Hardware Engineering Inspection (Stage 1 design)

**Status:**
- The component schema and its rules are **implemented and tested**.
- Opportunity's component records are **authored**: 21 components, 1 planned object.
- The inspection views are **planned** (Stage 3).

## 1. Views and when each is allowed

| View | Allowed when | Opportunity now |
|---|---|---|
| **Exterior** | A model exists (NASA, or a cited reconstruction) | Rover: `implemented`, using the NASA MER-B model (validated, but coarse). EDL hardware: `unavailable` (no NASA model) |
| **Component** | The part is a separate node in the model, *or* it is highlighted by a documented region | Data ready. The coarse model has no separate parts, so this view waits on the `.blend` evaluation |
| **Exploded** | A document shows the assembly relationships and directions | `unavailable` for every part (no document yet) |
| **Cutaway** | A document shows the internal layout | `unavailable` (no document) |
| **Operation** | A document describes the motion and its limits | `planned` for the rover drive and the rocker-bogie: turn in place within 1.9 m, top speed 5 cm/s, obstacles about one wheel diameter (PDS instrument host) |
| **Historical** | A dated, sourced image or event | Through the Time Machine events |

The validator (`validateComponents`) **rejects** any exploded, cutaway or operation view marked anything but `unavailable` unless a source is cited for it in `viewSources`.

## 2. Component record (summary)

`ComponentRecord` in `frontend/src/realism/records.ts`; schema in `mission-data/schemas/components.schema.json`.

| Field | Meaning |
|---|---|
| `id`, `parentId` | Hierarchy, checked for cycles and missing parents |
| `category` | vehicle / structure / mobility / power / thermal / avionics / telecom / instrument / mechanism / edl |
| `function` | Sourced text |
| `massKg`, `dimensions`, `quantity` | `Fact` values: verified, conflicting with alternatives, or unverified with a note |
| `representation` | nasa-model / reconstruction (with references) / illustrative (labelled) / none |
| `modelNode` | Node name inside the model, once one exists |
| `views` + `viewSources` | As in §1 |

## 3. Opportunity data (from `components.json`)

**Vehicle:**
- rover mass: **conflicting**, 185 kg (NASA mission page) vs 180 kg (PDS);
- size about 1.54 m tall; about 2.25 × 1.51 m at the solar panel; wheelbase about 1.41 × 1.22 m.

**Subsystems, with documented figures:**
- **Power:** solar array 1.3 m², 30 strings, ~800–900 Wh/sol at the start falling to ~600 Wh/sol by sol 90; two 8 Ah lithium-ion batteries.
- **Thermal:** warm electronics box with 2.5 cm aerogel, −40 to +50 °C inside.
- **Avionics:** RAD6000 at 20 MHz, 128 MB DRAM, 256 MB flash.
- **Telecom:** high-gain, low-gain and UHF antennas.
- **Mobility:** rocker-bogie, six wheels of 0.26 m.
- **Mast:** 1.54 m.
- **Arm:** five degrees of freedom, carrying APXS, Mössbauer, MI and RAT.

**EDL hardware:**
- entry vehicle 840 kg;
- heat shield, backshell (parachute, RAD and TIRS motors) and lander (550 kg, four petals, airbags).
- All have representation `none` and are shown as data only.

**Missing:**
- Hazcams are not described in the sources read;
- arm link lengths, mast geometry and the solar-panel layout;
- any internal layout (needed for cutaway).

## 4. Models

| Asset | Size | Fidelity | Status |
|---|---|---|---|
| NASA MER-B `.glb` | 36,668 bytes (3,845 triangles, 9 materials, one node) | Correct layout; no separate parts | In use. **Stage 2 finding:** its proportions disagree with the PDS dimensions. Scaling by the PDS footprint (width 2.25 m, length 1.51 m) gives one consistent scale (the two disagree by 1.8%), but then the height is 1.28 m against PDS 1.54 m (−17%). The Spacecraft Archive scales by height (1.5 m), which makes the footprint about 20% too large. The Unity prototype scales by footprint and records the height deviation |
| NASA "Spirit and Opportunity" `.blend` | 12,243,528 bytes (downloaded in Stage 2 with approval) | **Inspected without Blender** (`scripts/mars/inspect_blend.py`, reads the file's SDNA): Blender 4.2 file. 63 objects and 61 meshes, about 30.9k vertices and 18.3k faces, 9 materials, **13 packed PNG textures** (diffuse and normal maps for body, arm, mast, panels and suspension). **Named, parented parts:** body; mast base / neck / cam / top; high-gain antenna (base, arm, top); left / right / rear / front solar-panel segments; arm mount / base / joint1 / joint2 / wrist / turret; the full rocker-bogie (front / middle / rear rockers, axles, all six wheels) | **Suitable for part-level inspection and documented-motion demos** (the rocker-bogie and arm hierarchy has pivots). Converting it needs Blender (not installed). Next step: convert it with the Blender command line, map each object to a `modelNode`, and measure it against the PDS dimensions |
| EDL hardware | — | — | No NASA model. A reconstruction needs cited drawings or photos with dimensions; until then, none |

## 5. Reconstruction policy

A reconstruction is allowed only when:
1. every dimension used is a `verified` fact with a source;
2. its shape follows cited photos or drawings, listed in `sources`;
3. the UI labels it "Reconstruction" and shows its sources;
4. it passes the same measurement checks as NASA models (`measure.ts`), within a stated tolerance.
