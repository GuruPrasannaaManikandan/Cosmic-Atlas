import { MISSION_BY_ID, OBJECT_BY_ID, dateMs } from '../missions'
import { PLANETS, PlanetEnvironment, isExplorable } from './planets'
import { GeoOrigin, toLocal } from './geo'

/** worlds that can host surface sites: the planet environment table is the single source */
export type SurfaceBody = PlanetEnvironment
export const SURFACE_BODIES: Record<string, PlanetEnvironment> = PLANETS

export interface PlacedObject {
  objectId: string
  x: number
  z: number
  /** elevation relative to the site origin (m), from the source when it gives one */
  dy: number
  /** heading of the model's +z axis, degrees clockwise from north — never sourced, always marked approximate */
  headingDeg: number
  /** discovery / interaction radii (m) */
  noticeM: number
  interactM: number
}

export type SiteTerrainSpec =
  | { kind: 'procedural'; seed: number }
  /** LROC NAC DTM heightmap extracted by scripts/terrain/extract_lroc_dtm.py (falls back to procedural if it fails to load) */
  | { kind: 'dtm'; file: string; seed: number; product: string; postSpacingM: number }

export interface SurfaceSite {
  id: string
  bodyId: string
  name: string
  missionIds: string[]
  origin: GeoOrigin & { elevationM: number }
  /** half-size of the walkable square (m) */
  halfExtentM: number
  terrain: SiteTerrainSpec
  terrainProvenance: string
  objects: PlacedObject[]
  /** a sourced daylight moment for the "lunar night" shortcut, and its label */
  daylight: { ms: number; label: string }
  /** environment implemented and explorable now */
  available: boolean
}

function place(site: Omit<SurfaceSite, 'objects'>, specs: { id: string; heading: number; notice: number; interact: number }[]): SurfaceSite {
  const objects = specs.map((s) => {
    const loc = OBJECT_BY_ID[s.id].location.value
    if (!loc) throw new Error(`object ${s.id} has no sourced location — it cannot be placed`)
    const p = toLocal(site.origin, loc.latDeg, loc.lonEastDeg)
    return { objectId: s.id, x: p.x, z: p.z, dy: loc.elevationM !== undefined ? loc.elevationM - site.origin.elevationM : 0, headingDeg: s.heading, noticeM: s.notice, interactM: s.interact }
  })
  return { ...site, objects }
}

const DTM_NOTE = (product: string, post: number) =>
  `Terrain: LROC NAC digital terrain model ${product} (${post} m posts, tied to LOLA; NASA PDS); distant horizon to 24 km from LOLA LDEM_64 (~474 m/px). Rocks smaller than the post spacing are illustrative. Hardware at LRO-measured positions (LROC 2016 / NSSDCA 2017).`

/** standard Apollo site: origin at the LM, LROC DTM terrain, LM + every catalogued object with a sourced position */
function apolloSite(n: number, id: string, name: string, halfExtentM: number, post: number, extra: { id: string; notice: number; interact: number; heading?: number }[]): SurfaceSite {
  const lmId = `a${n}-lm-descent`
  const lm = OBJECT_BY_ID[lmId].location.value!
  const mission = MISSION_BY_ID[`apollo-${n}`]
  const landing = mission.landing!.value!
  // the day after the (date-only) landing: still early lunar morning, sunlit
  const ms = landing.length > 10 ? dateMs(landing) + 7 * 3600e3 : dateMs(landing) + 36 * 3600e3
  const product = `NAC_DTM_APOLLO${n}`
  return place(
    {
      id,
      bodyId: 'moon',
      name,
      missionIds: [`apollo-${n}`],
      origin: { latDeg: lm.latDeg, lonEastDeg: lm.lonEastDeg, radiusM: SURFACE_BODIES.moon.radiusM, elevationM: lm.elevationM ?? 0 },
      halfExtentM,
      terrain: { kind: 'dtm', file: `/assets/terrain/${id}.json`, seed: 1960 + n, product, postSpacingM: post },
      terrainProvenance: DTM_NOTE(product, post),
      daylight: { ms, label: landing.length > 10 ? `the ${mission.name} moonwalk` : `the day after the ${mission.name} landing` },
      available: true,
    },
    // LM heading is NOT sourced: approximate (ladder side facing west, as at Apollo 11)
    [{ id: lmId, heading: 90, notice: 40, interact: 7 }, ...extra.map((e) => ({ id: e.id, heading: e.heading ?? 0, notice: e.notice, interact: e.interact }))],
  )
}

export const SURFACE_SITES: SurfaceSite[] = [
  apolloSite(11, 'tranquility-base', 'Tranquility Base — Apollo 11', 780, 2, [
    { id: 'a11-easep-pse', notice: 18, interact: 3.5 },
    { id: 'a11-lrrr', notice: 18, interact: 3, heading: 90 },
  ]),
  apolloSite(12, 'apollo-12', 'Oceanus Procellarum — Apollo 12', 780, 2, [{ id: 'a12-alsep', notice: 22, interact: 3.5 }]),
  apolloSite(14, 'apollo-14', 'Fra Mauro — Apollo 14', 780, 2, [
    { id: 'a14-alsep', notice: 22, interact: 3.5 },
    { id: 'a14-lrrr', notice: 18, interact: 3 },
  ]),
  apolloSite(15, 'apollo-15', 'Hadley–Apennine — Apollo 15', 780, 2, [
    { id: 'a15-alsep', notice: 22, interact: 3.5 },
    { id: 'a15-lrrr', notice: 18, interact: 3 },
    { id: 'a15-lrv', notice: 28, interact: 4.5 },
  ]),
  apolloSite(16, 'apollo-16', 'Descartes Highlands — Apollo 16', 380, 2, [
    { id: 'a16-alsep', notice: 22, interact: 3.5 },
    { id: 'a16-lrv', notice: 28, interact: 4.5 },
  ]),
  apolloSite(17, 'apollo-17', 'Taurus–Littrow — Apollo 17', 980, 5, [
    { id: 'a17-alsep', notice: 22, interact: 3.5 },
    { id: 'a17-lrv', notice: 28, interact: 4.5 },
    { id: 'a17-sep', notice: 18, interact: 3 },
  ]),
]

/** other catalogued landing sites, listed (not yet explorable) so the picker shows the full map of what exists */
export function catalogueSitesFor(bodyId: string) {
  return Object.values(MISSION_BY_ID)
    .filter((m) => m.target === bodyId && m.landingSite?.value)
    .map((m) => ({ missionId: m.id, name: m.name, nasa: m.nasaMission, site: m.landingSite!.value!, explorable: SURFACE_SITES.some((s) => s.missionIds.includes(m.id) && s.available) }))
}

export const SITE_BY_ID: Record<string, SurfaceSite> = Object.fromEntries(SURFACE_SITES.map((s) => [s.id, s]))
/** explorable sites only: a site exists only when its world's environment is implemented */
export const sitesForBody = (bodyId: string) => SURFACE_SITES.filter((s) => s.bodyId === bodyId && isExplorable(bodyId))
