/**
 * Official NASA 3D models (github.com/nasa/NASA-3D-Resources — "free and without copyright"), downloaded
 * 2026-11-09 with the user's approval into public/assets/models/nasa/. Each entry records provenance (repository
 * path + SHA-256 of the file), how it is scaled, and the SOURCED dimensions it is validated against. Validation runs
 * on the loaded geometry (models/measure.ts), so every number the archive shows is measured, not typed in.
 */
export interface DimCheck {
  label: string
  /** what to measure on the loaded model (metres, after scaling) */
  measure: 'width' | 'length' | 'height' | 'maxHorizontal' | 'lowSpan' | 'footTriangleSide'
  expectedM: number
  /** acceptable deviation, fraction */
  tol: number
  source: string
  note?: string
}

export type Calibration =
  | { kind: 'native'; note: string }
  | { kind: 'height'; valueM: number; source: string; note: string }
  | { kind: 'footTriangleSide'; valueM: number; source: string; note: string }

export interface NasaModelSpec {
  id: string
  title: string
  file: string
  repoPath: string
  sha256: string
  bytes: number
  /** catalogue object this model represents, when catalogued */
  objectId?: string
  builtBy: string
  calibration: Calibration
  /**
   * drop meshes that start above minYAbove or reach above maxYAbove (m, model units) — used to remove the LM ascent
   * stage, whose shell and tanks start just below the descent-stage deck
   */
  remove?: { minYAbove: number; maxYAbove: number }
  /** play the model's own animation clips to a pose (e.g. deploy a stowed mast) before measuring and showing it */
  pose?: { clips: string[] | 'all'; at: 'end' | number; note: string }
  checks: DimCheck[]
  /** visual fidelity judged against NASA/ESA photographs: high = recognisably faithful, medium = stylised, low = placeholder-grade */
  fidelity: 'high' | 'medium' | 'low'
  notes: string
}

const REPO = 'https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/'

export const NASA_MODELS: NasaModelSpec[] = [
  {
    id: 'apollo-lm',
    fidelity: 'medium',
    title: 'Apollo Lunar Module — descent stage (as left on the Moon)',
    file: '/assets/models/nasa/apollo-lm.glb',
    repoPath: REPO + 'Apollo%20Lunar%20Module',
    sha256: '379101dfcee399267addf771709107c35e826b0b9e5233272f123e4c8a585c4e',
    bytes: 716840,
    objectId: 'a11-lm-descent',
    builtBy: 'NASA',
    calibration: { kind: 'native', note: 'Model is in metres (Blender glTF export).' },
    // the ascent stage lifted off on 21 July 1969 — only the descent stage remains, so its meshes are removed
    // (descent stage deck top at 2.32 m in this model; deck-edge fittings reach 2.82 m)
    remove: { minYAbove: 2.33, maxYAbove: 3.0 },
    checks: [
      { label: 'Footpad span (outer edges of opposite pads)', measure: 'lowSpan', expectedM: 9.4, tol: 0.06, source: 'nssdca-a11-lm', note: 'The NASA model\'s legs are stylised and too short: its footprint is about a third smaller than the real LM. The surface view offers a dimension-accurate reconstruction as an alternative (Inspect tab).' },
    ],
    notes: 'Stylised NASA model: correct overall structure (octagonal gold-foil stage, four trussed legs with footpads, ladder, flag plaque). Fine detail is simplified.',
  },
  {
    id: 'mer-b',
    fidelity: 'medium',
    title: 'Mars Exploration Rover — Opportunity (MER-B)',
    file: '/assets/models/nasa/mer-b.glb',
    repoPath: REPO + 'Mars%20Exploration%20Rover%20-%20Opportunity%20(MER-B)',
    sha256: '95c852efb385b55bea3104a0fca2730cd2ef25353af4d38273d3f0bda5c68c31',
    bytes: 36668,
    objectId: 'opportunity-rover',
    builtBy: 'NASA JPL',
    calibration: { kind: 'height', valueM: 1.5, source: 'nasa-mer-spirit', note: 'Model units are arbitrary; scaled so the camera mast head is ~1.5 m above the ground (NASA: mast cameras "about 1.5 meters off the ground").' },
    checks: [],
    notes: 'Low-poly NASA model (3.8k triangles) with the right rover-family layout: Pancam mast, solar wings, rocker-bogie, instrument arm. No independent numeric dimension is sourced yet, so only the calibration applies.',
  },
  {
    id: 'perseverance',
    fidelity: 'high',
    title: 'Mars 2020 Perseverance rover',
    file: '/assets/models/nasa/perseverance.glb',
    repoPath: REPO + 'Mars%202020%20Perseverance%20Rover',
    sha256: '10db7c03a5e63a5a3b3e7baa6243aa4918ba045fa8ff0a731d0217491adc727f',
    bytes: 4987176,
    objectId: 'perseverance-rover',
    builtBy: 'NASA JPL',
    calibration: { kind: 'native', note: 'Model is in metres.' },
    // the file stores the remote-sensing mast stowed (1.85 m tall); the model's own 'CylinderAction' clip raises it
    pose: { clips: ['CylinderAction'], at: 1.0, note: "Shown with the remote-sensing mast deployed, using the model's own 'CylinderAction' animation at t = 1.0 s (stowed, the file is 1.85 m tall)." },
    checks: [
      { label: 'Length', measure: 'length', expectedM: 3.0, tol: 0.08, source: 'nasa-perseverance-components' },
      { label: 'Width', measure: 'width', expectedM: 2.7, tol: 0.08, source: 'nasa-perseverance-components' },
      { label: 'Height (mast deployed)', measure: 'height', expectedM: 2.2, tol: 0.08, source: 'nasa-perseverance-components', note: 'NASA height includes the deployed mast' },
    ],
    notes: 'Detailed NASA/JPL model (≈200k triangles, PBR textures).',
  },
  {
    id: 'ingenuity',
    fidelity: 'high',
    title: 'Ingenuity Mars Helicopter',
    file: '/assets/models/nasa/ingenuity.glb',
    repoPath: REPO + 'Ingenuity%20Mars%20Helicopter',
    sha256: '9e5a5398ab335eae7d46335085301ce46fb7de052300b645debe8bac6d39f2b5',
    bytes: 2019408,
    objectId: 'ingenuity-helicopter',
    builtBy: 'NASA JPL',
    calibration: { kind: 'native', note: 'Model is in metres.' },
    checks: [{ label: 'Rotor span (tip to tip)', measure: 'maxHorizontal', expectedM: 1.2, tol: 0.06, source: 'nasa-ingenuity' }],
    notes: 'NASA/JPL model with textured legs, solar panel and coaxial rotors.',
  },
  {
    id: 'viking-lander',
    fidelity: 'high',
    title: 'Viking lander',
    file: '/assets/models/nasa/viking-lander.glb',
    repoPath: REPO + 'Viking%20Lander',
    sha256: '1233dc2c96a1c0b08ca9a20f7ed9c09e0223f06f14f6ae6371349504c1929149',
    bytes: 1849384,
    objectId: 'viking-1-lander',
    builtBy: 'NASA',
    calibration: { kind: 'footTriangleSide', valueM: 2.21, source: 'nssdca-viking1-lander', note: 'Model units are arbitrary; scaled so the three footpads form an equilateral triangle of 2.21 m sides (NSSDCA).' },
    checks: [],
    notes: 'Detailed NASA model (three legs, high-gain dish, sampler arm, RTG covers).',
  },
  {
    id: 'insight',
    fidelity: 'high',
    title: 'InSight lander (solar panels deployed)',
    file: '/assets/models/nasa/insight.glb',
    repoPath: REPO + 'InSight%20Cruise%20Lander',
    sha256: '4e4c0c8b034de9f265d2e0b52bd7547254b5547eb09edc97e694b3d990849fb8',
    bytes: 3948936,
    objectId: 'insight-lander',
    builtBy: 'NASA JPL',
    calibration: { kind: 'native', note: 'Model is in metres.' },
    checks: [],
    notes: 'Detailed NASA model. No overall dimension was found on the NASA page read, so it is not yet validated.',
  },
  {
    id: 'huygens',
    fidelity: 'low',
    title: 'Huygens probe (ESA)',
    file: '/assets/models/nasa/huygens.glb',
    repoPath: REPO + 'Cassini-Huygens%20(A)',
    sha256: 'd2cb317244d4a64eca408bcaf1c908f77c3c25124df2b4d083ec23f5eee14aca',
    bytes: 1014092,
    objectId: 'huygens-probe',
    builtBy: 'ESA (model from NASA 3D Resources)',
    calibration: { kind: 'native', note: 'Model is in metres.' },
    checks: [{ label: 'Front shield diameter', measure: 'maxHorizontal', expectedM: 2.7, tol: 0.06, source: 'esa-huygens-engineering' }],
    notes: 'Placeholder-grade NASA model (684 triangles): a foil-covered disc with a box — it does not resemble the real probe and is NOT used as a faithful reconstruction. Only its front-shield diameter matches ESA. A reconstruction from ESA engineering references (front shield, back cover, descent module) is planned for Phase 5; after landing only the descent module is on Titan.',
  },
]

export const NASA_MODEL_BY_ID: Record<string, NasaModelSpec> = Object.fromEntries(NASA_MODELS.map((m) => [m.id, m]))
