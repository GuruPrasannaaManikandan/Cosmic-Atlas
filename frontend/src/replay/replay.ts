/**
 * Historical replay ("Relive the mission") — definitions and the saved present-day state.
 *
 * Honesty rules:
 * - every event is a catalogue milestone (dated, sourced); nothing is added for the replay;
 * - an event is SHOWN only when the scene can show it from data (Opportunity's recorded drives at Victoria; an Apollo
 *   descent to the site's measured LM position). Everything else is TOLD (text card), with where it happened;
 * - reconstructions are labelled: the Apollo descent camera move and the Mars drive interpolation within a sol are
 *   illustrative; the drive positions themselves are the recorded traverse.
 *
 * State: entering a replay saves the exploration state (planet, site, position, heading, camera, selected object,
 * open record tab, simulation clock). "Go back to present" restores exactly that — not the landing point.
 */
import { MISSION_BY_ID, OBJECT_BY_ID, dateMs, type Milestone } from '../missions'
import { missionSol } from '../realism/marsTime'

export interface ReplayEvent extends Milestone {
  ms: number
  /** mission sol, for Mars surface missions (computed from the date; month-only dates are flagged) */
  sol?: number
  approxDate: boolean
  /** the scene can show this moment from data */
  shown: boolean
  /** why not, or what is shown */
  how: string
}

export interface ReplayDef {
  objectId: string
  missionId: string
  title: string
  renderer: 'unity-traverse' | 'r3f-descent'
  /** what the 3-D part of the replay is, in one honest sentence */
  sceneNote: string
  events: ReplayEvent[]
  /** Mars traverse replays: the sol range the recorded drives cover in this scene */
  solRange?: [number, number]
}

const OPPORTUNITY_LANDING = Date.parse('2004-01-25T04:54:00Z') // nasa-opportunity (catalogue landing)
const OPPORTUNITY_LANDING_LON = 354.47417 // catalogue landing site

/** Opportunity's Victoria campaign: drives recorded in the scene's traverse file (reported by Unity at start-up) */
function opportunityReplay(solRange: [number, number]): ReplayDef {
  const m = MISSION_BY_ID['mer-opportunity']
  const events = m.milestones.map((e) => {
    const ms = dateMs(e.date)
    const approx = !/^\d{4}-\d{2}-\d{2}/.test(e.date)
    const dateOnly = !approx && !/T\d{2}:\d{2}/.test(e.date)
    // a date without a time of day is ±1 sol: take its sol at midday UTC (the scene shows an afternoon of that date)
    const solMs = dateOnly ? ms + 12 * 3600e3 : ms
    const sol = ms >= OPPORTUNITY_LANDING ? missionSol(solMs, OPPORTUNITY_LANDING, OPPORTUNITY_LANDING_LON, 1) : undefined
    const inRange = sol !== undefined && sol >= solRange[0] - (approx ? 40 : 0) && sol <= solRange[1]
    const how = inRange
      ? approx
        ? `Shown: the date is month-only (${e.date}); the recorded Victoria drives in this scene begin at sol ${solRange[0]}.`
        : `Shown: Opportunity at its recorded drive position for sol ${sol}.`
      : e.kind === 'launch'
        ? 'Told, not shown: the launch happened at Cape Canaveral, Florida.'
        : sol === undefined
          ? 'Told, not shown: before Opportunity reached Mars.'
          : `Told, not shown: this happened ${sol < solRange[0] ? 'before' : 'after'} the Victoria campaign (sol ${sol}), away from this crater.`
    return { ...e, ms, sol, approxDate: approx || dateOnly, shown: inRange, how }
  })
  return {
    objectId: 'opportunity-rover',
    missionId: m.id,
    title: "Opportunity's mission — the Victoria crater campaign",
    renderer: 'unity-traverse',
    sceneNote: `Opportunity moves along its recorded drives at Victoria crater, sol ${solRange[0]} to ${solRange[1]} (WUSTL / PDS Geosciences Node traverse, locally registered, ~15 m RMS). Within a sol the motion between drive records is interpolated. The Sun follows each sol at an illustrative 14:00 local solar time.`,
    events,
    solRange,
  }
}

/** Apollo hardware: the descent to the measured LM position, then the mission timeline (clock moves the Sun) */
function apolloReplay(objectId: string): ReplayDef | null {
  const o = OBJECT_BY_ID[objectId]
  const m = o && MISSION_BY_ID[o.missionId]
  if (!m || m.target !== 'moon' || !m.landing?.value) return null
  const landing = dateMs(m.landing.value)
  const events = m.milestones.map((e) => {
    const ms = dateMs(e.date)
    const shown = e.kind === 'landing'
    const onSurface = ms >= landing && e.kind !== 'launch'
    return {
      ...e,
      ms,
      approxDate: !/T\d{2}:\d{2}/.test(e.date),
      shown,
      how: shown
        ? 'Shown: an illustrative descent camera move onto the LRO-measured landing position (not a reconstruction of the real trajectory).'
        : onSurface
          ? 'Told: set the clock to this moment to see the Sun and shadows the crew had.'
          : 'Told, not shown: this happened away from the landing site.',
    }
  })
  return {
    objectId,
    missionId: m.id,
    title: `${m.name} — the landing and the mission`,
    renderer: 'r3f-descent',
    sceneNote: 'The descent is an illustrative camera move onto the measured LM position. Mission events are told from the catalogue; setting the clock moves the Sun to that moment.',
    events,
  }
}

export function replayFor(objectId: string, opts: { solRange?: [number, number] } = {}): ReplayDef | null {
  if (objectId === 'opportunity-rover') return opts.solRange ? opportunityReplay(opts.solRange) : null
  return apolloReplay(objectId)
}

/** saved present-day exploration state (renderer specific fields are opaque here) */
export interface ExplorationSnapshot {
  savedAt: number
  bodyId: string
  siteId: string
  objectId: string
  panelTab: string | null
  component: string | null
  simMs: number
  /** renderer pose: Unity {x,z,heading,camYawOffset,camPitch,camDist} or R3F {pos,yaw,camYaw,camPitch,camDist,camMode} */
  pose: Record<string, unknown>
}

export const replayState: { saved: ExplorationSnapshot | null; lastRestore: { at: number; pose: Record<string, unknown> | null; snapshot: ExplorationSnapshot } | null } = {
  saved: null,
  lastRestore: null,
}
if (typeof window !== 'undefined') (window as unknown as { __replay?: unknown }).__replay = replayState
