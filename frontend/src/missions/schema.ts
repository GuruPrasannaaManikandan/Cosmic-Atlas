/**
 * Mission catalogue schema (Phase 1).
 *
 * Layers are kept apart on purpose:
 *   sources.ts      raw research: every document a fact was taken from (title, organisation, URL, retrieval date)
 *   catalog/*.ts    curated facts: each value carries its source ids and a verification status
 *   stories.ts      storytelling text, written only from curated facts (it references them, it never adds new ones)
 *   surface models  rendering data (procedural reconstructions) live in src/surface/models and reference object ids
 *
 * Nothing here is filled in from memory. A value that no source in sources.ts gives is null with status 'unverified'
 * (and a note saying what is missing), never a plausible-looking guess.
 */

/** verified = read from a cited authoritative source; conflicting = sources disagree (all values recorded) */
export type Verification = 'verified' | 'conflicting' | 'unverified'

export interface SourceRef {
  id: string
  title: string
  organisation: string
  url: string
  /** ISO date the page was read */
  retrieved: string
  /** what was taken from it */
  extracted: string
}

export interface Fact<T> {
  value: T | null
  status: Verification
  sources: string[]
  note?: string
  /** competing values when status is 'conflicting' */
  alternatives?: { value: T; sources: string[] }[]
}

export type Agency = 'NASA' | 'ESA' | 'ASI' | 'ISRO' | 'JPL' | 'Roscosmos' | 'CNSA'

export type MissionClass =
  | 'crewed-landing'
  | 'lander'
  | 'rover'
  | 'orbiter'
  | 'flyby'
  | 'atmospheric-probe'
  | 'impactor'
  | 'sample-return'
  | 'helicopter'

export type MissionStatus = 'completed' | 'ended' | 'operating' | 'lost' | 'unknown'

/** Selenographic / areographic position. Longitude is EAST-positive, 0..360 or −180..180 as published. */
export interface SurfacePosition {
  bodyId: string
  latDeg: number
  lonEastDeg: number
  /** elevation above the body's reference (m), when the source gives it */
  elevationM?: number
  /** 1-sigma positional uncertainty (m), when given */
  uncertaintyM?: number
  datum: string
}

export interface Milestone {
  /** ISO 8601 (UTC). Date-only strings mean the time of day is not sourced. */
  date: string
  title: string
  description: string
  sources: string[]
  /** event kind drives the timeline icon */
  kind: 'launch' | 'flyby' | 'arrival' | 'orbit-insertion' | 'landing' | 'surface-op' | 'release' | 'last-contact' | 'end' | 'other'
}

export type TrajectoryKind = 'none' | 'reconstructed' | 'approximate-educational' | 'planned'

export interface Mission {
  id: string
  name: string
  /** lead agency; partners listed separately so collaborations are never collapsed into "NASA" */
  agency: Agency
  partners: { agency: Agency | string; role: string }[]
  /** false for non-NASA missions included as labelled educational exceptions */
  nasaMission: boolean
  nonNasaNote?: string
  classes: MissionClass[]
  /** catalogue body id of the destination ('moon', 'mars', 'saturn', 'titan', ...) */
  target: string
  launch: Fact<string>
  arrival?: Fact<string>
  landing?: Fact<string>
  end?: Fact<string>
  status: Fact<MissionStatus>
  landingSite?: Fact<SurfacePosition>
  plannedDuration?: Fact<string>
  actualDuration?: Fact<string>
  summary: string
  milestones: Milestone[]
  objectIds: string[]
  trajectory: { kind: TrajectoryKind; reference?: string; note: string }
  lastResearchUpdate: string
}

export type ObjectCategory =
  | 'lunar-module-descent-stage'
  | 'surface-experiment'
  | 'retroreflector'
  | 'roving-vehicle'
  | 'rover'
  | 'lander'
  | 'atmospheric-probe'
  | 'helicopter'
  | 'orbiter'

export interface Component {
  id: string
  name: string
  description: string
  sources: string[]
}

export interface PhysicalObject {
  id: string
  missionId: string
  name: string
  category: ObjectCategory
  /** agency that built it (Huygens = ESA, Pragyan = ISRO) */
  builtBy: Agency | string
  nasaHardware: boolean
  dimensions: Fact<string>
  massKg: Fact<number>
  design: string
  components: Component[]
  location: Fact<SurfacePosition>
  currentStatus: Fact<string>
  /** procedural reconstruction id in src/surface/models, or null when no model exists yet */
  model: { id: string | null; provenance: string }
  sources: string[]
}
