/**
 * Mission data records for the Final Engineering and Visual Realism directive (Stage 1).
 *
 * These are the authoring contract shared by the web shell and the Unity renderer. The canonical JSON lives in
 * /mission-data (schemas in /mission-data/schemas, validated by records.test.ts); this file holds the TypeScript types
 * and the semantic rules a JSON Schema cannot express (source ids must exist, documented views need documents, a
 * route in an unknown frame cannot be drawn, …).
 *
 * Same rules as the mission catalogue: nothing is filled in from memory; a value without a source is null with
 * status 'unverified'. See docs/space-exploration/MISSION_DATA_AUTHORING_GUIDE.md.
 */
import type { Fact, Milestone } from '../missions/schema'

/** delivery status used in IMPLEMENTATION_PROGRESS.md and on every record that can be shown */
export type ImplStatus = 'implemented' | 'partial' | 'planned' | 'unavailable'

/** what the user sees for a piece of hardware */
export type Representation = 'nasa-model' | 'reconstruction' | 'illustrative' | 'none'

export interface StoryText {
  text: string
  sources: string[]
}

// ───────────────────────────── coordinate frames ─────────────────────────────

export interface FrameOrigin {
  latDeg: number
  lonEastDeg: number
  heightM?: number
}

export interface FrameRecord {
  id: string
  bodyId: string
  /**
   * planetocentric: lat / east lon / height on the body sphere.
   * local-enu: metres East-North-Up from `origin`.
   * rover-site: a MER "site" frame (x north, y east, z down per the MER convention) — needs its own origin.
   * map-projected: easting/northing of a named map projection.
   * unknown: the product does not say. Data in an unknown frame is stored but never rendered.
   */
  kind: 'planetocentric' | 'local-enu' | 'rover-site' | 'map-projected' | 'unknown'
  description: string
  /** axis meaning, e.g. "x east, y north, z up" — required for every kind except planetocentric/unknown */
  axes?: string
  origin?: Fact<FrameOrigin>
  /** sphere radius (m) the frame refers to, when stated */
  radiusM?: Fact<number>
  sources: string[]
}

// ───────────────────────────── routes ─────────────────────────────

export interface RoutePoint {
  sol: number
  endSol?: number
  x: number
  y: number
  z?: number
}

export interface RouteProduct {
  name: string
  url: string
  producer: string
  /** false when the producer says it is not a PDS archive product */
  pdsArchived: boolean
  solRange: [number, number]
  sizeBytes?: number
}

export interface RouteRecord {
  id: string
  missionId: string
  objectId: string
  frameId: string
  status: ImplStatus
  product: RouteProduct
  /** positional uncertainty (m), when the producer states one */
  uncertaintyM: Fact<number>
  /** empty until the data is obtained (with approval) and its frame established */
  points: RoutePoint[]
  notes: string
  sources: string[]
}

// ───────────────────────────── events (Mission Time Machine) ─────────────────────────────

/**
 * What a recorded time means. Spacecraft event time and Earth-received time differ by the one-way light time
 * (4–24 min for Mars), so a time is never used without knowing which it is.
 */
export type TimeBasis = 'spacecraft-utc' | 'earth-received-utc' | 'utc-unspecified' | 'date-only' | 'month-only' | 'sol-only'

export interface EventTime {
  /** ISO 8601 UTC ending in Z; YYYY-MM-DD when only the date is sourced; YYYY-MM when only the month; null when only a sol */
  utc: string | null
  basis: TimeBasis
  /** mission sol as PUBLISHED (not computed); null when no source gives it */
  sol: number | null
  solSources?: string[]
  note?: string
}

/** presentation only — a camera move never asserts a fact */
export interface CameraCue {
  mode: 'orbit-target' | 'follow' | 'fixed' | 'flyover'
  targetId?: string
  durationS: number
}

export interface MissionEventRecord {
  id: string
  missionId: string
  kind: Milestone['kind'] | 'traverse' | 'science' | 'environment' | 'hardware'
  title: string
  description: string
  time: EventTime
  /** where it happened, in a declared frame (or planetocentric) */
  place?: { frameId: string; x: number; y: number; z?: number }
  status: Fact<unknown>['status']
  sources: string[]
  camera?: CameraCue
}

// ───────────────────────────── hardware components ─────────────────────────────

export type ComponentCategory =
  | 'vehicle' | 'structure' | 'mobility' | 'power' | 'thermal' | 'avionics' | 'telecom' | 'instrument' | 'mechanism' | 'edl'

export interface ComponentViews {
  exterior: ImplStatus
  /** exploded / cutaway / operation may be anything but 'unavailable' only with documents in viewSources */
  exploded: ImplStatus
  cutaway: ImplStatus
  operation: ImplStatus
}

export interface ComponentRecord {
  id: string
  objectId: string
  name: string
  parentId: string | null
  category: ComponentCategory
  function: StoryText
  massKg?: Fact<number>
  /** named dimensions in metres, e.g. { heightM, widthM, lengthM, diameterM } */
  dimensions?: Fact<Record<string, number>>
  quantity?: Fact<number>
  representation: Representation
  /** node name inside the model file, when the model separates this part */
  modelNode?: string
  views: ComponentViews
  /** documents that justify exploded / cutaway / operation views */
  viewSources?: Partial<Record<'exploded' | 'cutaway' | 'operation', string[]>>
  sources: string[]
}

// ───────────────────────────── quality profiles ─────────────────────────────

export interface QualityProfile {
  id: 'ultra' | 'high' | 'balanced' | 'performance'
  label: string
  intendedHardware: string
  renderScale: number
  antiAliasing: 'msaa4+smaa' | 'msaa2' | 'fxaa' | 'none'
  shadows: { cascades: number; distanceM: number; mapSize: number }
  ssao: boolean
  /** 'native' = the DTM's own post spacing */
  terrainSpacingM: 'native' | number
  detailNormals: boolean
  maxTextureSize: number
  skyLut: { transmittance: number; scattering: number; multipleScattering: 'full' | 'approximate' }
  dustFraction: number
  bloom: boolean
  autoExposure: boolean
  /** distance at which hardware switches to LOD1; null = always full */
  lod1DistanceM: number | null
  /** acceptance gate on the reference machine (integrated GPU), when the profile has one */
  gate: { fpsP50: number; fpsP5?: number; width: number; height: number } | null
}

// ───────────────────────────── semantic validation ─────────────────────────────

export interface Issue {
  record: string
  problem: string
}

function checkFact(id: string, field: string, f: Fact<unknown> | undefined, known: (s: string) => boolean, out: Issue[]) {
  if (!f) return
  const bad = (problem: string) => out.push({ record: id, problem: `${field}: ${problem}` })
  for (const s of f.sources) if (!known(s)) bad(`unknown source "${s}"`)
  if (f.status === 'verified' && (f.value === null || f.sources.length === 0)) bad('verified without a value and a source')
  if (f.status === 'conflicting' && !(f.alternatives && f.alternatives.length > 0)) bad('conflicting without alternatives')
  if (f.status === 'unverified' && f.value !== null && !f.note) bad('unverified value needs a note saying why it is shown')
}

export function validateFrames(frames: FrameRecord[], known: (s: string) => boolean): Issue[] {
  const out: Issue[] = []
  const ids = new Set<string>()
  for (const f of frames) {
    if (ids.has(f.id)) out.push({ record: f.id, problem: 'duplicate frame id' })
    ids.add(f.id)
    for (const s of f.sources) if (!known(s)) out.push({ record: f.id, problem: `unknown source "${s}"` })
    if ((f.kind === 'local-enu' || f.kind === 'rover-site' || f.kind === 'map-projected') && !f.axes)
      out.push({ record: f.id, problem: `${f.kind} frame must state its axes` })
    if (f.kind === 'local-enu' && !f.origin) out.push({ record: f.id, problem: 'local-enu frame must have an origin' })
    checkFact(f.id, 'origin', f.origin, known, out)
    checkFact(f.id, 'radiusM', f.radiusM, known, out)
  }
  return out
}

/** can this frame's data be placed in the scene? (unknown or unverified frames: no) */
export function frameUsable(f: FrameRecord | undefined): { ok: boolean; reason?: string } {
  if (!f) return { ok: false, reason: 'frame not defined' }
  if (f.kind === 'unknown') return { ok: false, reason: `frame "${f.id}" is not stated by its product` }
  if (f.kind === 'planetocentric') return { ok: true }
  if (!f.origin || f.origin.status !== 'verified') return { ok: false, reason: `frame "${f.id}" has no verified origin` }
  return { ok: true }
}

export function validateRoutes(routes: RouteRecord[], frames: FrameRecord[], known: (s: string) => boolean): Issue[] {
  const out: Issue[] = []
  const byId = new Map(frames.map((f) => [f.id, f]))
  for (const r of routes) {
    for (const s of r.sources) if (!known(s)) out.push({ record: r.id, problem: `unknown source "${s}"` })
    checkFact(r.id, 'uncertaintyM', r.uncertaintyM, known, out)
    if (!byId.has(r.frameId)) out.push({ record: r.id, problem: `frame "${r.frameId}" not defined` })
    const [a, b] = r.product.solRange
    if (!(a >= 0 && b >= a)) out.push({ record: r.id, problem: 'solRange must be ascending' })
    for (const p of r.points) {
      if (p.sol < a || p.sol > b) { out.push({ record: r.id, problem: `point at sol ${p.sol} outside the product's sol range` }); break }
    }
    const usable = frameUsable(byId.get(r.frameId))
    if (r.status === 'implemented' && !usable.ok) out.push({ record: r.id, problem: `marked implemented but ${usable.reason}` })
    if (r.status === 'implemented' && r.points.length < 2) out.push({ record: r.id, problem: 'marked implemented without points' })
  }
  return out
}

export function validateEvents(events: MissionEventRecord[], frames: FrameRecord[], known: (s: string) => boolean): Issue[] {
  const out: Issue[] = []
  const ids = new Set<string>()
  const frameIds = new Set(frames.map((f) => f.id))
  for (const e of events) {
    if (ids.has(e.id)) out.push({ record: e.id, problem: 'duplicate event id' })
    ids.add(e.id)
    if (e.sources.length === 0) out.push({ record: e.id, problem: 'event without a source' })
    for (const s of [...e.sources, ...(e.time.solSources ?? [])]) if (!known(s)) out.push({ record: e.id, problem: `unknown source "${s}"` })
    const t = e.time
    if (t.utc === null && t.basis !== 'sol-only') out.push({ record: e.id, problem: 'no UTC: basis must be sol-only' })
    if (t.utc !== null) {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(t.utc)
      const monthOnly = /^\d{4}-\d{2}$/.test(t.utc)
      const parsed = Date.parse(monthOnly ? t.utc + '-01T00:00:00Z' : dateOnly ? t.utc + 'T00:00:00Z' : t.utc)
      if (Number.isNaN(parsed)) out.push({ record: e.id, problem: `bad UTC "${t.utc}"` })
      if (dateOnly !== (t.basis === 'date-only')) out.push({ record: e.id, problem: 'YYYY-MM-DD and basis "date-only" must go together' })
      if (monthOnly !== (t.basis === 'month-only')) out.push({ record: e.id, problem: 'YYYY-MM and basis "month-only" must go together' })
      if (!dateOnly && !monthOnly && !t.utc.endsWith('Z')) out.push({ record: e.id, problem: 'UTC with a time must end in Z' })
    }
    if (t.sol !== null && !(t.solSources && t.solSources.length)) out.push({ record: e.id, problem: 'published sol needs solSources' })
    if (e.place && !frameIds.has(e.place.frameId)) out.push({ record: e.id, problem: `frame "${e.place.frameId}" not defined` })
  }
  return out
}

export function validateComponents(parts: ComponentRecord[], known: (s: string) => boolean): Issue[] {
  const out: Issue[] = []
  const ids = new Set(parts.map((p) => p.id))
  if (ids.size !== parts.length) out.push({ record: '*', problem: 'duplicate component ids' })
  for (const p of parts) {
    const bad = (problem: string) => out.push({ record: p.id, problem })
    for (const s of [...p.sources, ...p.function.sources]) if (!known(s)) bad(`unknown source "${s}"`)
    if (p.function.sources.length === 0) bad('function text without a source')
    if (p.parentId !== null && !ids.has(p.parentId)) bad(`parent "${p.parentId}" not defined`)
    checkFact(p.id, 'massKg', p.massKg, known, out)
    checkFact(p.id, 'dimensions', p.dimensions, known, out)
    checkFact(p.id, 'quantity', p.quantity, known, out)
    if (p.representation === 'reconstruction' && p.sources.length === 0) bad('a reconstruction must cite its references')
    for (const v of ['exploded', 'cutaway', 'operation'] as const) {
      const st = p.views[v]
      if ((st === 'implemented' || st === 'partial' || st === 'planned') && !(p.viewSources?.[v]?.length))
        bad(`${v} view is "${st}" but no document is cited for it — use "unavailable"`)
      for (const s of p.viewSources?.[v] ?? []) if (!known(s)) bad(`unknown source "${s}"`)
    }
    if (p.views.exterior === 'implemented' && p.representation === 'none') bad('exterior implemented with no representation')
  }
  // no cycles in the hierarchy
  const parent = new Map(parts.map((p) => [p.id, p.parentId]))
  for (const p of parts) {
    let cur: string | null = p.id
    for (let i = 0; cur !== null && i <= parts.length; i++) cur = parent.get(cur) ?? null
    if (cur !== null) out.push({ record: p.id, problem: 'component hierarchy has a cycle' })
  }
  return out
}

export function validateProfiles(ps: QualityProfile[]): Issue[] {
  const out: Issue[] = []
  const order = ['ultra', 'high', 'balanced', 'performance']
  if (ps.map((p) => p.id).join() !== order.join()) out.push({ record: '*', problem: `profiles must be ${order.join(', ')} in that order` })
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1]
    const b = ps[i]
    if (b.renderScale > a.renderScale) out.push({ record: b.id, problem: 'render scale must not increase as quality drops' })
    if (b.shadows.distanceM > a.shadows.distanceM) out.push({ record: b.id, problem: 'shadow distance must not increase as quality drops' })
    if (b.dustFraction > a.dustFraction) out.push({ record: b.id, problem: 'dust fraction must not increase as quality drops' })
    if (b.maxTextureSize > a.maxTextureSize) out.push({ record: b.id, problem: 'texture size must not increase as quality drops' })
  }
  const balanced = ps.find((p) => p.id === 'balanced')
  if (!balanced?.gate) out.push({ record: 'balanced', problem: 'Balanced must carry the reference-machine gate' })
  return out
}
