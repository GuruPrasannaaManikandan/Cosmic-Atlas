import type { Fact, Mission, PhysicalObject, Milestone } from './schema'
import { SOURCES } from './sources'
import { MOON_MISSIONS, MOON_OBJECTS } from './catalog/moon'
import { MARS_MISSIONS, MARS_OBJECTS } from './catalog/mars'
import { DEEP_SPACE_MISSIONS, DEEP_SPACE_OBJECTS } from './catalog/deepSpace'

export * from './schema'
export { SOURCES }

export const CATALOG_VERSION = '0.1.0 (2026-11-09)'
export const MISSIONS: Mission[] = [...MOON_MISSIONS, ...MARS_MISSIONS, ...DEEP_SPACE_MISSIONS]
export const OBJECTS: PhysicalObject[] = [...MOON_OBJECTS, ...MARS_OBJECTS, ...DEEP_SPACE_OBJECTS]
export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]))
export const OBJECT_BY_ID: Record<string, PhysicalObject> = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))

/**
 * Parse a catalogue date to UTC ms. Partial dates ('1969', '2005-01', '1969-07-20') resolve to the START of the
 * period so ordering checks are conservative; full ISO timestamps are exact.
 */
export function dateMs(d: string): number {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(T.*)?$/.exec(d)
  if (!m) return NaN
  if (m[4]) return Date.parse(d)
  return Date.UTC(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1)
}

export const missionsForBody = (bodyId: string) => MISSIONS.filter((m) => m.target === bodyId)
export const objectsForMission = (id: string) => OBJECTS.filter((o) => o.missionId === id)

export interface TimelineEvent extends Milestone {
  missionId: string
  missionName: string
  ms: number
}

/** every milestone in date order, optionally only for missions to one body */
export function timelineEvents(bodyId?: string | null): TimelineEvent[] {
  const ms = bodyId ? missionsForBody(bodyId) : MISSIONS
  return ms
    .flatMap((m) => m.milestones.map((e) => ({ ...e, missionId: m.id, missionName: m.name, ms: dateMs(e.date) })))
    .sort((a, b) => a.ms - b.ms)
}

/** missions launched but not yet ended at the given time */
export function missionsActiveAt(ms: number): Mission[] {
  return MISSIONS.filter((m) => {
    const a = m.launch.value ? dateMs(m.launch.value) : NaN
    const b = m.end?.value ? dateMs(m.end.value) : Infinity
    return Number.isFinite(a) && a <= ms && ms <= b
  })
}

// ---------------------------------------------------------------- validation

const DATE_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?Z)?)?)?$/

export function validateCatalog(missions = MISSIONS, objects = OBJECTS): string[] {
  const errs: string[] = []
  const ids = new Set<string>()
  const checkSources = (where: string, src: string[]) => src.forEach((s) => !SOURCES[s] && errs.push(`${where}: unknown source "${s}"`))
  const checkFact = (where: string, f: Fact<unknown> | undefined) => {
    if (!f) return
    checkSources(where, f.sources)
    if (f.status === 'verified' && (f.value === null || f.sources.length === 0)) errs.push(`${where}: verified fact without value or source`)
    if (f.status === 'unverified' && f.value !== null) errs.push(`${where}: unverified fact must not carry a value`)
    if (f.status === 'unverified' && !f.note) errs.push(`${where}: unverified fact must say what is missing`)
    if (f.status === 'conflicting' && !(f.alternatives && f.alternatives.length)) errs.push(`${where}: conflicting fact without alternatives`)
    f.alternatives?.forEach((a) => checkSources(where, a.sources))
  }
  const checkDate = (where: string, f?: Fact<string>) => {
    if (f?.value && !DATE_RE.test(f.value)) errs.push(`${where}: bad date "${f.value}"`)
  }
  const checkPos = (where: string, f?: Fact<{ latDeg: number; lonEastDeg: number }>) => {
    const p = f?.value
    if (p && (Math.abs(p.latDeg) > 90 || p.lonEastDeg < -180 || p.lonEastDeg > 360)) errs.push(`${where}: coordinates out of range`)
  }

  for (const m of missions) {
    const w = `mission ${m.id}`
    if (ids.has(m.id)) errs.push(`${w}: duplicate id`)
    ids.add(m.id)
    ;(['launch', 'arrival', 'landing', 'end'] as const).forEach((k) => {
      checkFact(`${w}.${k}`, m[k])
      checkDate(`${w}.${k}`, m[k])
    })
    ;(['status', 'landingSite', 'plannedDuration', 'actualDuration'] as const).forEach((k) => checkFact(`${w}.${k}`, m[k] as Fact<unknown>))
    checkPos(`${w}.landingSite`, m.landingSite)
    const seq = [m.launch, m.arrival, m.landing, m.end].map((f) => (f?.value ? dateMs(f.value) : NaN)).filter(Number.isFinite)
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) errs.push(`${w}: launch/arrival/landing/end out of order`)
    if (!m.nasaMission && !m.nonNasaNote) errs.push(`${w}: non-NASA mission needs a nonNasaNote`)
    if (!m.nasaMission && m.agency === 'NASA') errs.push(`${w}: flagged non-NASA but agency is NASA`)
    const launch = m.launch.value ? dateMs(m.launch.value) : -Infinity
    let prev = -Infinity
    for (const e of m.milestones) {
      if (!DATE_RE.test(e.date)) errs.push(`${w} milestone "${e.title}": bad date`)
      const t = dateMs(e.date)
      if (t < prev) errs.push(`${w} milestone "${e.title}": out of order`)
      if (t < launch) errs.push(`${w} milestone "${e.title}": before launch`)
      if (!e.sources.length) errs.push(`${w} milestone "${e.title}": no source`)
      checkSources(`${w} milestone "${e.title}"`, e.sources)
      prev = t
    }
    for (const oid of m.objectIds) if (!objects.some((o) => o.id === oid)) errs.push(`${w}: object "${oid}" missing`)
  }
  for (const o of objects) {
    const w = `object ${o.id}`
    if (ids.has(o.id)) errs.push(`${w}: duplicate id`)
    ids.add(o.id)
    const m = missions.find((x) => x.id === o.missionId)
    if (!m) errs.push(`${w}: unknown mission "${o.missionId}"`)
    else if (!m.objectIds.includes(o.id)) errs.push(`${w}: not listed by its mission`)
    if (m && !m.nasaMission && o.nasaHardware) errs.push(`${w}: hardware of a non-NASA mission marked as NASA`)
    if (!o.nasaHardware && /^NASA/.test(String(o.builtBy))) errs.push(`${w}: non-NASA hardware built by NASA?`)
    ;(['dimensions', 'massKg', 'location', 'currentStatus'] as const).forEach((k) => checkFact(`${w}.${k}`, o[k] as Fact<unknown>))
    checkPos(`${w}.location`, o.location)
    checkSources(w, o.sources)
    o.components.forEach((cpt) => checkSources(`${w}.${cpt.id}`, cpt.sources))
  }
  return errs
}
