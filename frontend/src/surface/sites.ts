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
    .map((m) => ({ missionId: m.id, name: m.name, nasa: m.nasaMission, site: m.landingSite!.value!, explorable: SURFACE_SITES.some((s) => s.missionIds.includes(m.id) && s.available) || UNITY_SITES.some((s) => s.missionIds.includes(m.id)) }))
}

export const SITE_BY_ID: Record<string, SurfaceSite> = Object.fromEntries(SURFACE_SITES.map((s) => [s.id, s]))
/** explorable R3F sites only: a site exists only when its world's environment is implemented */
export const sitesForBody = (bodyId: string) => SURFACE_SITES.filter((s) => s.bodyId === bodyId && isExplorable(bodyId))

/**
 * Sites drawn by the embedded Unity player (Mars). Their terrain, Sun and hardware positions come from the Unity data
 * (Assets/CosmicAtlas/Mars/Data, prepared by scripts/mars/*.py) and are reported back over the bridge at run time.
 */
export interface UnitySite {
  id: string
  bodyId: string
  name: string
  missionIds: string[]
  /** fitted crater centre of the DTM tile (locally registered, see terrainProvenance) */
  origin: { latDeg: number; lonEastDeg: number }
  /** the build the player loads (served at /unity/<build>/) */
  build: string
  /** the moment the scene shows, and why */
  scene: { date: string; label: string; note: string }
  objectIds: string[]
  terrainProvenance: string
  summary: string
  /** M4 landing-site package (frontend/public/mars-sites/<site>/); absent = the Victoria scene built into the player */
  site?: string
  /** rover missions drive the illustrative expedition vehicle; stationary landers are explored on foot */
  mode?: 'rover' | 'lander'
  /** the historical hardware in the scene, for the catalogue card */
  hardware?: string
}

/** M4 landing sites: terrain = USGS controlled HiRISE DTM + orthoimage (scripts/mars/build_site.py, site_defs.py) */
const m4 = (id: string, missionId: string, name: string, mode: 'rover' | 'lander', lat: number, lon: number, hardware: string, sceneDate: string, sceneLabel: string, summary: string): UnitySite => ({
  id: `mars-${id}`,
  bodyId: 'mars',
  name,
  missionIds: [missionId],
  origin: { latDeg: lat, lonEastDeg: lon },
  build: 'mars',
  scene: { date: sceneDate, label: sceneLabel, note: 'Hardware at the sourced landing coordinate; see the site record for the registration status.' },
  objectIds: [],
  terrainProvenance: 'USGS Astrogeology controlled HiRISE DTM (1 m) and orthoimage; ground colour ILLUSTRATIVE (HiRISE RED is one band).',
  summary,
  site: id,
  mode,
  hardware,
})

export const UNITY_SITES: UnitySite[] = [
  {
    id: 'victoria-crater',
    bodyId: 'mars',
    name: 'Victoria crater — Meridiani Planum',
    missionIds: ['mer-opportunity'],
    origin: { latDeg: -2.0513630760095034, lonEastDeg: 354.5042359725547 },
    build: 'mars',
    scene: {
      date: '2007-09-11',
      label: '11 Sep 2007, the day Opportunity drove into Victoria crater',
      note: 'Opportunity is shown at its recorded drive position for that sol. It left Victoria in 2008; its final resting place is Perseverance Valley on the rim of Endeavour crater, which is not modelled yet.',
    },
    objectIds: ['opportunity-rover'],
    terrainProvenance:
      'Terrain: HiRISE DTM DTEEC_001414_1780_001612_1780 (1.01 m posts; NASA PDS). Ground shade: HiRISE RED band (grayscale) with an ILLUSTRATIVE tint. Sun: Mars24 algorithm (NASA GISS) at an ILLUSTRATIVE 14:00 local solar time. Sky and dust: ILLUSTRATIVE. Opportunity: NASA 3D Resources MER-B model on its recorded traverse (WUSTL / PDS Geosciences Node, locally registered, about 15 m RMS).',
    summary: 'An 800 m crater Opportunity explored for two years. Drive its rim, find the rover, and relive its Victoria campaign drive by drive.',
    mode: 'rover',
    hardware: 'Opportunity (NASA articulated MER model)',
  },
  m4('viking-1', 'viking-1', 'Viking 1 — Chryse Planitia', 'lander', 22.272895, -47.951474, 'Viking 1 lander (NASA model)', '1976-07-20', 'Landing day, 20 July 1976',
    'The first successful US Mars landing. Walk around the lander on the boulder-strewn plains of Chryse Planitia.'),
  m4('viking-2', 'viking-2', 'Viking 2 — Utopia Planitia', 'lander', 47.668, 134.28, 'Viking 2 lander (NASA model)', '1976-09-03', 'Landing day, 3 September 1976',
    "Viking 1's twin, about 6,500 km away on the northern plains of Utopia Planitia."),
  m4('pathfinder', 'mars-pathfinder', 'Mars Pathfinder and Sojourner — Ares Vallis', 'rover', 19.073883, -33.258629, 'Pathfinder lander + Sojourner (documented reconstructions)', '1997-07-06', 'Just after Sojourner rolled onto Mars',
    'The first rover on Mars, 65 cm long, beside its airbag-landed lander in an ancient flood channel.'),
  m4('spirit', 'mer-spirit', 'Spirit (MER-A) — Gusev crater', 'rover', -14.565818, 175.475472, 'Spirit (NASA MER model) + lander (simplified)', '2004-01-20', 'Columbia Memorial Station, early mission',
    "Opportunity's twin at its landing site inside 160 km-wide Gusev crater."),
  m4('phoenix', 'phoenix', 'Phoenix — Vastitas Borealis', 'lander', 68.217789, -125.750032, 'Phoenix lander (documented reconstruction)', '2008-05-26', 'First days after landing',
    'The arctic lander that dug down to water ice at 68° north.'),
  m4('curiosity', 'msl-curiosity', 'Curiosity — Gale crater (Bradbury Landing)', 'rover', -4.589646, 137.441388, 'Curiosity (NASA model)', '2012-08-06', 'Bradbury Landing, landing day',
    'The car-sized nuclear-powered rover at its landing site on the floor of Gale crater.'),
  m4('insight', 'insight', 'InSight — Elysium Planitia', 'lander', 4.502384, 135.623447, 'InSight lander (NASA model) with SEIS and HP3 deployed', '2019-02-13', 'February 2019: SEIS and HP3 deployed on the ground',
    "The geophysics lander that listened for marsquakes. Walk around its seismometer and heat probe on the ground and its solar arrays."),
]
export const UNITY_SITE_BY_ID: Record<string, UnitySite> = Object.fromEntries(UNITY_SITES.map((s) => [s.id, s]))
export const unitySitesForBody = (bodyId: string) => UNITY_SITES.filter((s) => s.bodyId === bodyId && isExplorable(bodyId))
/** the first explorable site on a body, for the expedition's landing (any renderer) */
export const defaultSiteFor = (bodyId: string): string | null => sitesForBody(bodyId)[0]?.id ?? unitySitesForBody(bodyId)[0]?.id ?? null
