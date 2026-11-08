/**
 * Data-driven registry of the Solar System expansion: natural satellites, dwarf planets and asteroids.
 *
 * Every number here is copied from a cited source (retrieved 2026-10-25); nothing is invented. Values that are
 * unknown are recorded as unknown (null / 'unknown') with a note, never filled in.
 *   JPL-SAT-ELEM  NASA/JPL SSD "Planetary Satellite Mean Elements"   https://ssd.jpl.nasa.gov/sats/elem/
 *   JPL-SAT-PHYS  NASA/JPL SSD "Planetary Satellite Physical Parameters" https://ssd.jpl.nasa.gov/sats/phys_par/
 *   JPL-SBDB      NASA/JPL Small-Body Database API (osculating elements, physical parameters) https://ssd-api.jpl.nasa.gov/sbdb.api
 *   HORIZONS      NASA/JPL Horizons object data pages (radius where the tables above have none)
 *   IAU-2015      Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22 (WGCCRE 2015 rotation elements / poles)
 * Physical size (physical.*) is kept separate from any visual exaggeration, which exists only in the render layer.
 */
import { KeplerElements, RefFrame, KM_PER_AU, jplSatelliteRates } from '../astro/kepler'
import { jdFromCalendarEpoch } from '../astro/time'
import { SATELLITE_PHASE_FIT, PhaseFit } from './satellitePhaseFit'

export type BodyClass = 'moon' | 'dwarf-planet' | 'asteroid'

export interface PhysicalData {
  /** volumetric mean radius, km */
  meanRadiusKm: number
  radiusSigmaKm?: number | null
  /** triaxial semi-axes, km (shape fits); scaled so their geometric mean equals meanRadiusKm */
  triaxialKm?: [number, number, number]
  gmKm3s2?: number | null
  gmSigma?: number | null
  densityGcc?: number | null
  source: string
  shapeSource?: string
}

export type RotationModel =
  | { kind: 'synchronous'; note?: string }
  | { kind: 'synchronous-binary'; companion: string; note: string }
  | { kind: 'spin'; periodHours: number; pole?: { raDeg: number; decDeg: number }; source: string; note?: string }
  | { kind: 'chaotic'; note: string }
  | { kind: 'unknown'; note: string }

export interface Appearance {
  /** approximate visible-light colour (also used for the uncertainty / neutral representation) */
  color: string
  /** id in ASSET_REGISTRY of a REAL global map for this body only (never shared between bodies) */
  texture?: string
  /** evidence for the colour / look */
  evidence: string
  /** 0 = smooth sphere/ellipsoid, >0 = amplitude of deterministic low-order relief for irregular bodies (render only) */
  relief?: number
  /** Titan-style opaque haze shell colour */
  haze?: string
}

export interface OrbitSpec {
  elements: KeplerElements
  /** the published elements before the Horizons phase refinement (satellites only) */
  rawElements?: KeplerElements
  phaseFit?: PhaseFit
  /** body whose position is the origin of the elements ('sun' for heliocentric) */
  primary: string
  /** 'barycentre': the elements describe motion about the primary's system barycentre (Pluto–Charon) */
  centre: 'primary' | 'barycentre'
  model: 'mean-elements' | 'osculating-elements'
  source: string
  frameLabel: string
  uncertainty: string
}

export interface SolarBody {
  id: string
  name: string
  aliases: string[]
  cls: BodyClass
  /** physical parent in the catalogue hierarchy (planet, dwarf planet, or 'sun') */
  parent: string
  naifId?: number
  physical: PhysicalData
  orbit: OrbitSpec
  rotation: RotationModel
  appearance: Appearance
  importance: number
  confidence: 'high' | 'medium' | 'low'
  info: string
  notes?: string[]
}

const D2R = Math.PI / 180

/** IAU 2015 (Archinal et al. 2018) north-pole directions at J2000 and mean radii (km) of the planets that host moons. */
export const PLANET_POLES: Record<string, { raDeg: number; decDeg: number; source: string }> = {
  earth: { raDeg: 0, decDeg: 90, source: 'IAU 2015 (ICRF pole, precession ignored)' },
  mars: { raDeg: 317.269202, decDeg: 54.432516, source: 'IAU 2015' },
  jupiter: { raDeg: 268.056595, decDeg: 64.495303, source: 'IAU 2015' },
  saturn: { raDeg: 40.589, decDeg: 83.537, source: 'IAU 2015' },
  uranus: { raDeg: 257.311, decDeg: -15.175, source: 'IAU 2015 (IAU north pole; Uranus rotates retrograde about it)' },
  neptune: { raDeg: 299.36 + 0.7 * Math.sin(357.85 * D2R), decDeg: 43.46 - 0.51 * Math.cos(357.85 * D2R), source: 'IAU 2015 evaluated at J2000 (N = 357.85°)' },
  pluto: { raDeg: 132.993, decDeg: -6.163, source: 'IAU 2015 (IAU north pole; Pluto rotates retrograde about it)' },
  mercury: { raDeg: 281.0103, decDeg: 61.4155, source: 'IAU 2015' },
  venus: { raDeg: 272.76, decDeg: 67.16, source: 'IAU 2015 (retrograde rotator)' },
}

/** Planet radii used for true-scale rendering (NASA planetary fact sheets, volumetric mean radius). */
export const PLANET_RADIUS_KM: Record<string, number> = {
  mercury: 2439.7, venus: 6051.8, earth: 6371.0, mars: 3389.5, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622,
}
/** Saturn equatorial radius (1-bar, IAU 2015) used to express ring radii. */
export const SATURN_EQ_RADIUS_KM = 60268

/**
 * Saturn's main rings, radial boundaries in km from Saturn's centre (NASA Saturn Ring Fact Sheet; Cassini).
 * opacity is a representative visual opacity derived from typical normal optical depths (C ~0.1, B >1, CD ~0.1, A ~0.5).
 */
export const SATURN_RINGS: { name: string; innerKm: number; outerKm: number; opacity: number; color: string }[] = [
  { name: 'C ring', innerKm: 74658, outerKm: 92000, opacity: 0.18, color: '#8f8576' },
  { name: 'B ring', innerKm: 92000, outerKm: 117580, opacity: 0.92, color: '#ddd0b4' },
  { name: 'Cassini Division', innerKm: 117580, outerKm: 122170, opacity: 0.1, color: '#7d7468' },
  { name: 'A ring (inner)', innerKm: 122170, outerKm: 133423, opacity: 0.62, color: '#cbbfa6' },
  { name: 'Encke Gap', innerKm: 133423, outerKm: 133745, opacity: 0.0, color: '#000000' },
  { name: 'A ring (outer)', innerKm: 133745, outerKm: 136775, opacity: 0.55, color: '#c4b89f' },
]

// ---------------------------------------------------------------------------------------------------------------
// JPL satellite mean elements. Row format mirrors the JPL table:
// [a km, e, ω°, M°, i°, Ω°, P days, Papsis yr | null, Pnode yr | null, frame, epoch, ephemeris]
type SatRow = [number, number, number, number, number, number, number, number | null, number | null, RefFrame, string, string]

const laplace = (raDeg: number, decDeg: number): RefFrame => ({ kind: 'pole', raDeg, decDeg, label: 'Laplace plane' })
const ECLIPTIC: RefFrame = { kind: 'ecliptic' }
/**
 * "equatorial" JPL elements are referred to the planet's equator. JPL lists the regular satellites of the
 * retrograde rotators (Uranus, Pluto) with i ≈ 0, i.e. relative to the pole about which they orbit
 * counter-clockwise (the rotational angular-momentum pole), which is opposite to the IAU "north" pole.
 * This choice was confirmed against Horizons (see SOLAR_SYSTEM_VALIDATION.md).
 */
const equator = (planet: 'uranus' | 'neptune' | 'pluto'): RefFrame => {
  const p = PLANET_POLES[planet]
  const flip = planet === 'uranus'
  return flip
    ? { kind: 'pole', raDeg: (p.raDeg + 180) % 360, decDeg: -p.decDeg, label: 'planet equator' }
    : { kind: 'pole', raDeg: p.raDeg, decDeg: p.decDeg, label: 'planet equator' }
}

function satElements(r: SatRow): KeplerElements {
  const [aKm, e, w, M, i, node, P, Pw, Pn, frame, epoch] = r
  return {
    aKm, e, iDeg: i, nodeDeg: node, argPeriDeg: w, meanAnomalyDeg: M, epochJd: jdFromCalendarEpoch(epoch), frame,
    ...jplSatelliteRates({ iDeg: i, periodDays: P, apsisPeriodYr: Pw, nodePeriodYr: Pn }),
  }
}

const SAT_SRC = (eph: string) => `JPL SSD Planetary Satellite Mean Elements (ephemeris ${eph})`
const PHYS = (eph: string) => `JPL SSD Planetary Satellite Physical Parameters (${eph})`

interface SatDef {
  id: string; name: string; aliases?: string[]; parent: string; naif: number; row: SatRow
  phys: Omit<PhysicalData, 'source'> & { source?: string }; physEph: string
  rotation?: RotationModel; appearance: Appearance; importance?: number; confidence?: 'high' | 'medium' | 'low'
  info: string; notes?: string[]; uncertainty?: string; centre?: 'primary' | 'barycentre'
}

const SYNC: RotationModel = { kind: 'synchronous', note: 'Assumed tidally locked (IAU 2015 rotation model is synchronous): 0° longitude faces the planet.' }
const TRIAX = 'Axis ratios: Thomas et al. (Phobos, Deimos, Amalthea, Thebe, Metis, Adrastea, Hyperion), Karkoschka 2003 (Proteus), Weaver et al. 2016 (Pluto small moons); scaled to the JPL mean radius'

/** Scale published axis lengths so their geometric mean equals the JPL volumetric mean radius. */
function triax(r: number, a: number, b: number, c: number): [number, number, number] {
  const k = r / Math.cbrt(a * b * c)
  return [a * k, b * k, c * k]
}

const MARS_L = laplace(317.7, 52.9)
const JUP_L = laplace(268.1, 64.5)
const SAT_L = laplace(40.6, 83.5)

const SATS: SatDef[] = [
  // ----------------------------------------------------------------- Earth
  {
    id: 'moon', name: 'Moon', aliases: ['Luna', 'The Moon', 'Earth I'], parent: 'earth', naif: 301,
    row: [384400, 0.0554, 318.15, 135.27, 5.16, 125.08, 27.322, 5.997, 18.6, ECLIPTIC, '2000-01-01.5', 'DE405/LE405'],
    phys: { meanRadiusKm: 1737.4, radiusSigmaKm: 0.1, gmKm3s2: 4902.8, gmSigma: 0.001, densityGcc: 3.344 }, physEph: 'DE440',
    appearance: { color: '#bdbab4', texture: 'moon_albedo', evidence: 'Existing project lunar texture (see ASTRONOMICAL_ASSET_PIPELINE.md)' },
    importance: 0.7, confidence: 'medium',
    info: 'Earth\'s only natural satellite, now drawn at its true distance (mean 384,400 km) on a mean-element Keplerian orbit with 6.0-yr apsidal and 18.6-yr nodal precession. Solar perturbations (evection, variation) are not modelled, so its position can be off by a few degrees.',
    uncertainty: 'Mean elements without solar perturbations: typically 1–5° along-track (evection ±1.27°, variation ±0.66°). Measured against Horizons in SOLAR_SYSTEM_VALIDATION.md.',
    notes: ['Earth itself is placed at the Earth–Moon barycentre (existing planetary model, ~4,670 km offset ignored).'],
  },
  // ----------------------------------------------------------------- Mars
  {
    id: 'phobos', name: 'Phobos', aliases: ['Mars I'], parent: 'mars', naif: 401,
    row: [9375, 0.015, 216.3, 189.7, 1.1, 169.2, 0.3187, 1.1, 2.3, MARS_L, '2000-01-01.5', 'MAR099'],
    phys: { meanRadiusKm: 11.08, radiusSigmaKm: 0.04, gmKm3s2: 0.0007087, gmSigma: 0.0000006, densityGcc: 1.872, triaxialKm: triax(11.08, 13.0, 11.4, 9.1), shapeSource: TRIAX }, physEph: 'MAR097',
    appearance: { color: '#6e6459', texture: 'ss_phobos', relief: 0.07, evidence: 'Very dark (geometric albedo ~0.07), reddish-grey; Stickney crater and grooves visible in the Viking shaded-relief map' },
    importance: 0.62, confidence: 'high',
    info: 'The larger, inner moon of Mars: an irregular, heavily cratered body dominated by the 9-km Stickney crater. It orbits below synchronous altitude, so it rises in the west on Mars and is slowly spiralling inward.',
    uncertainty: 'Mean elements; Phobos\'s secular acceleration is not modelled (tens of km after decades).',
  },
  {
    id: 'deimos', name: 'Deimos', aliases: ['Mars II'], parent: 'mars', naif: 402,
    row: [23457, 0.0, 0.0, 205.0, 1.8, 54.3, 1.2625, 0.0, 56.2, laplace(316.6, 53.5), '2000-01-01.5', 'MAR099'],
    phys: { meanRadiusKm: 6.2, radiusSigmaKm: 0.24, gmKm3s2: 0.0000962, gmSigma: 0.0000028, densityGcc: 1.471, triaxialKm: triax(6.2, 7.8, 6.0, 5.1), shapeSource: TRIAX }, physEph: 'MAR097',
    appearance: { color: '#8a7f72', texture: 'ss_deimos', relief: 0.04, evidence: 'Dark (albedo ~0.07) but visibly smoother than Phobos: regolith blankets its craters (Viking mosaic)' },
    importance: 0.55, confidence: 'high',
    info: 'The small outer moon of Mars. Its surface is smoothed by a thick regolith that fills in craters, giving it a softer look than Phobos.',
  },
  // ----------------------------------------------------------------- Jupiter
  {
    id: 'io', name: 'Io', aliases: ['Jupiter I'], parent: 'jupiter', naif: 501,
    row: [421800, 0.004, 49.1, 330.9, 0.0, 0.0, 1.762732, 1.333, 0.0, JUP_L, '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 1821.49, radiusSigmaKm: 0.5, gmKm3s2: 5959.91547, gmSigma: 0.00135, densityGcc: 3.5276 }, physEph: 'JUP365',
    appearance: { color: '#d9c56a', texture: 'ss_io', evidence: 'Sulfur-yellow, orange and white plains with dark volcanic centres; red Pele plume deposit (Galileo SSI colour mosaic)' },
    importance: 0.8, confidence: 'high',
    info: 'The most volcanically active body known. Tidal heating from its orbital resonance with Europa and Ganymede drives hundreds of active volcanoes; sulfur compounds colour its surface yellow, orange and red.',
  },
  {
    id: 'europa', name: 'Europa', aliases: ['Jupiter II'], parent: 'jupiter', naif: 502,
    row: [671100, 0.009, 45.0, 345.4, 0.5, 184.0, 3.525463, 1.394, 30.202, JUP_L, '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 1560.8, radiusSigmaKm: 0.3, gmKm3s2: 3202.7121, gmSigma: 0.00181, densityGcc: 3.013 }, physEph: 'JUP365',
    appearance: { color: '#d8ccb4', texture: 'ss_europa', evidence: 'Bright water-ice crust (albedo ~0.67) crossed by reddish-brown lineae; mosaic is greyscale, tinted with the published beige-white colour' },
    importance: 0.78, confidence: 'high',
    info: 'An ice-shelled moon with a global subsurface salt-water ocean. Its young, bright surface is crossed by long dark ridges and chaos terrain.',
  },
  {
    id: 'ganymede', name: 'Ganymede', aliases: ['Jupiter III'], parent: 'jupiter', naif: 503,
    row: [1070400, 0.001, 198.3, 324.8, 0.2, 58.5, 7.155588, 68.301, 137.812, laplace(268.2, 64.6), '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 2631.2, radiusSigmaKm: 1.7, gmKm3s2: 9887.83275, gmSigma: 0.00247, densityGcc: 1.9416 }, physEph: 'JUP365',
    appearance: { color: '#a59c90', texture: 'ss_ganymede', evidence: 'Mixture of dark, old cratered terrain and brighter grooved terrain (Galileo/Voyager mosaic), greyish-brown' },
    importance: 0.78, confidence: 'high',
    info: 'The largest moon in the Solar System, bigger than Mercury, and the only moon known to generate its own magnetic field. Dark ancient terrain is cut by bright grooved bands.',
  },
  {
    id: 'callisto', name: 'Callisto', aliases: ['Jupiter IV'], parent: 'jupiter', naif: 504,
    row: [1882700, 0.007, 43.8, 87.4, 0.3, 309.1, 16.69044, 277.921, 577.264, laplace(268.7, 64.8), '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 2410.3, radiusSigmaKm: 1.5, gmKm3s2: 7179.2834, gmSigma: 0.00324, densityGcc: 1.834 }, physEph: 'JUP365',
    appearance: { color: '#857a6d', texture: 'ss_callisto', evidence: 'Dark (albedo ~0.2), saturated with bright-rimmed impact craters including the Valhalla multi-ring basin' },
    importance: 0.74, confidence: 'high',
    info: 'The most heavily cratered body in the Solar System, with an old, dark surface and the huge Valhalla impact basin. It is outside the Io–Europa–Ganymede resonance and experiences little tidal heating.',
  },
  {
    id: 'amalthea', name: 'Amalthea', aliases: ['Jupiter V'], parent: 'jupiter', naif: 505,
    row: [181400, 0.003, 180.1, 310.6, 0.4, 282.9, 0.499918, 0.196, 0.393, JUP_L, '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 83.5, radiusSigmaKm: 3.0, gmKm3s2: 0.16456, gmSigma: 0.00867, densityGcc: 1.0111, triaxialKm: triax(83.5, 125, 73, 64), shapeSource: TRIAX }, physEph: 'JUP365',
    appearance: { color: '#9a5a3e', relief: 0.12, evidence: 'Reddest body in the Solar System (Voyager/Galileo); no global map: neutral elongated shape in its measured colour' },
    importance: 0.4, confidence: 'medium',
    info: 'The largest of Jupiter\'s inner moons: an elongated, very red, low-density body inside the orbit of Io that contributes dust to the gossamer ring.',
  },
  {
    id: 'thebe', name: 'Thebe', aliases: ['Jupiter XIV'], parent: 'jupiter', naif: 514,
    row: [221900, 0.018, 26.6, 182.1, 1.1, 340.4, 0.676105, 0.398, 0.797, JUP_L, '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 49.3, radiusSigmaKm: 4.0, gmKm3s2: 0.03015, gmSigma: 0.0125, densityGcc: 0.9, triaxialKm: triax(49.3, 58, 49, 42), shapeSource: TRIAX }, physEph: 'JUP365',
    appearance: { color: '#7a5a4a', relief: 0.1, evidence: 'Dark reddish (Galileo); poorly resolved, so drawn as a neutral irregular body' },
    importance: 0.3, confidence: 'medium',
    info: 'A small, dark, irregular inner moon whose debris feeds the outer gossamer ring.',
  },
  {
    id: 'metis', name: 'Metis', aliases: ['Jupiter XVI'], parent: 'jupiter', naif: 516,
    row: [128000, 0.0, 0.0, 166.0, 0.0, 0.0, 0.294779, 0.0, 0.0, JUP_L, '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 21.5, radiusSigmaKm: 4.0, gmKm3s2: 0.0025, gmSigma: 0.0016, densityGcc: 0.9002, triaxialKm: triax(21.5, 30, 20, 17), shapeSource: TRIAX }, physEph: 'JUP365',
    appearance: { color: '#6f6459', relief: 0.1, evidence: 'Barely resolved by Galileo; neutral representation' },
    importance: 0.25, confidence: 'medium',
    info: 'The innermost known moon of Jupiter, orbiting inside the main ring faster than Jupiter rotates.',
  },
  {
    id: 'adrastea', name: 'Adrastea', aliases: ['Jupiter XV'], parent: 'jupiter', naif: 515,
    row: [129000, 0.0, 0.0, 214.5, 0.0, 0.0, 0.29826, 0.0, 0.0, JUP_L, '2000-01-01.5', 'JUP365'],
    phys: { meanRadiusKm: 8.2, radiusSigmaKm: 4.0, gmKm3s2: 0.00014, gmSigma: 0.0002, densityGcc: null, triaxialKm: triax(8.2, 10, 8, 7), shapeSource: TRIAX }, physEph: 'JUP365',
    appearance: { color: '#6f6459', relief: 0.1, evidence: 'Barely resolved; neutral representation' },
    importance: 0.2, confidence: 'low',
    info: 'A tiny moon at the outer edge of Jupiter\'s main ring. Its radius (8 ± 4 km) is very uncertain.',
    notes: ['JPL lists a density of 0.90 ± 1.85 g/cm³ — not meaningful at this uncertainty, so it is not shown.'],
  },
  {
    id: 'himalia', name: 'Himalia', aliases: ['Jupiter VI'], parent: 'jupiter', naif: 506,
    row: [11439000, 0.16, 321.1, 78.3, 28.4, 64.2, 249.909, 187.4, 297.1, ECLIPTIC, '2000-01-01.5', 'JUP347'],
    phys: { meanRadiusKm: 85.0, radiusSigmaKm: 10.0, gmKm3s2: 0.15155, gmSigma: 0.05763, densityGcc: null }, physEph: 'JUP344',
    rotation: { kind: 'spin', periodHours: 7.8, source: 'Pilcher et al. 2012 lightcurve (~7.8 h)', note: 'Pole and rotational phase unknown: spin shown about the orbit normal for illustration only.' },
    appearance: { color: '#6b6560', relief: 0.06, evidence: 'Grey, C-type-like (albedo ~0.04); only seen as a few pixels by Cassini and New Horizons' },
    importance: 0.35, confidence: 'medium',
    info: 'The largest irregular (captured) moon of Jupiter, on a distant, inclined and eccentric orbit strongly perturbed by the Sun.',
    uncertainty: 'Ecliptic mean elements for a strongly Sun-perturbed orbit: errors of 10⁵–10⁶ km are expected (see validation doc).',
  },
  {
    id: 'elara', name: 'Elara', aliases: ['Jupiter VII'], parent: 'jupiter', naif: 507,
    row: [11710700, 0.212, 129.9, 346.9, 27.8, 112.8, 258.8861, 173.0, 270.9, ECLIPTIC, '2000-01-01.5', 'JUP347'],
    phys: { meanRadiusKm: 40, radiusSigmaKm: 10, gmKm3s2: null, densityGcc: null, source: 'JPL Horizons object data (radius 40 ± 10 km); not in the JPL satellite physical-parameter table' }, physEph: 'n/a',
    rotation: { kind: 'unknown', note: 'Rotation state not well determined; drawn without rotation.' },
    appearance: { color: '#6b6560', evidence: 'Grey, low albedo; never resolved — neutral sphere with uncertainty' },
    importance: 0.25, confidence: 'low',
    info: 'An irregular moon of the Himalia group. Its size is known only to ±25%.',
    uncertainty: 'Ecliptic mean elements for a strongly Sun-perturbed orbit: errors of 10⁵–10⁶ km are expected.',
  },
  // ----------------------------------------------------------------- Saturn
  {
    id: 'mimas', name: 'Mimas', aliases: ['Saturn I'], parent: 'saturn', naif: 601,
    row: [186000, 0.02, 160.4, 275.3, 1.6, 66.2, 0.942422, 0.493, 0.986, SAT_L, '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 198.2, radiusSigmaKm: 0.4, gmKm3s2: 2.50349, gmSigma: 0.00014, densityGcc: 1.1501 }, physEph: 'SAT441',
    appearance: { color: '#c9c6c2', texture: 'ss_mimas', evidence: 'Bright icy surface dominated by the 139-km Herschel crater (Cassini ISS mosaic)' },
    importance: 0.55, confidence: 'high',
    info: 'A small icy moon whose giant Herschel crater makes it resemble the Death Star. Its 2:1 resonance with ring particles clears the Cassini Division.',
  },
  {
    id: 'enceladus', name: 'Enceladus', aliases: ['Saturn II'], parent: 'saturn', naif: 602,
    row: [238400, 0.005, 119.5, 57.0, 0.0, 0.0, 1.370218, 2.916, 0.0, SAT_L, '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 252.1, radiusSigmaKm: 0.2, gmKm3s2: 7.21037, gmSigma: 0.00009, densityGcc: 1.6097 }, physEph: 'SAT441',
    appearance: { color: '#f4f6f8', texture: 'ss_enceladus', evidence: 'Most reflective body in the Solar System (geometric albedo ~1.4); fresh ice, south-polar "tiger stripe" fractures' },
    importance: 0.7, confidence: 'high',
    info: 'A brilliant white moon with a global subsurface ocean. Geysers at its south pole vent water vapour and ice that supply Saturn\'s E ring.',
  },
  {
    id: 'tethys', name: 'Tethys', aliases: ['Saturn III'], parent: 'saturn', naif: 603,
    row: [295000, 0.001, 335.3, 0.0, 1.1, 273.0, 1.887802, 0.005, 4.982, SAT_L, '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 531.1, radiusSigmaKm: 0.6, gmKm3s2: 41.21353, gmSigma: 0.00031, densityGcc: 0.984 }, physEph: 'SAT441',
    appearance: { color: '#e6e4df', texture: 'ss_tethys', evidence: 'Bright ice (density ~1 g/cm³); Odysseus crater and Ithaca Chasma (Cassini mosaic)' },
    importance: 0.55, confidence: 'high',
    info: 'An almost pure water-ice moon with the large Odysseus impact basin and the 2,000-km Ithaca Chasma canyon.',
  },
  {
    id: 'dione', name: 'Dione', aliases: ['Saturn IV'], parent: 'saturn', naif: 604,
    row: [377700, 0.002, 116.0, 212.0, 0.0, 0.0, 2.736916, 11.698, 0.0, SAT_L, '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 561.4, radiusSigmaKm: 0.4, gmKm3s2: 73.11607, gmSigma: 0.00005, densityGcc: 1.4781 }, physEph: 'SAT441',
    appearance: { color: '#d7d4cf', texture: 'ss_dione', evidence: 'Icy surface with bright tectonic "wispy" cliffs on the trailing hemisphere (Cassini + Voyager mosaic)' },
    importance: 0.55, confidence: 'high',
    info: 'An icy moon whose trailing hemisphere is crossed by bright ice cliffs ("wispy terrain") formed by tectonic fracturing.',
  },
  {
    id: 'rhea', name: 'Rhea', aliases: ['Saturn V'], parent: 'saturn', naif: 605,
    row: [527200, 0.001, 44.3, 31.5, 0.3, 133.7, 4.517503, 33.939, 35.775, SAT_L, '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 763.5, radiusSigmaKm: 0.6, gmKm3s2: 153.94175, gmSigma: 0.00041, densityGcc: 1.2372 }, physEph: 'SAT441',
    appearance: { color: '#cfccc6', texture: 'ss_rhea', evidence: 'Heavily cratered ice; wispy trailing-hemisphere fractures (Cassini + Voyager mosaic PIA12803)' },
    importance: 0.6, confidence: 'high',
    info: 'Saturn\'s second-largest moon: a heavily cratered, icy body with a low density close to that of ice-rock mixtures.',
  },
  {
    id: 'titan', name: 'Titan', aliases: ['Saturn VI'], parent: 'saturn', naif: 606,
    row: [1221900, 0.029, 78.3, 11.7, 0.3, 78.6, 15.945448, 346.68, 687.37, laplace(36.4, 84.0), '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 2574.76, radiusSigmaKm: 0.02, gmKm3s2: 8978.1371, gmSigma: 0.00025, densityGcc: 1.8814 }, physEph: 'SAT441',
    appearance: { color: '#c98f45', haze: '#d9a05a', evidence: 'In visible light Titan is an opaque orange photochemical haze; its surface is only seen at near-IR/radar wavelengths, so no surface map is drawn' },
    importance: 0.85, confidence: 'high',
    info: 'Saturn\'s largest moon and the only moon with a thick atmosphere (1.5 bar, mostly nitrogen). Its orange haze hides methane lakes, rivers and dunes from visible-light view.',
  },
  {
    id: 'hyperion', name: 'Hyperion', aliases: ['Saturn VII'], parent: 'saturn', naif: 607,
    row: [1481500, 0.105, 214.0, 122.9, 0.6, 87.1, 21.276658, 20.843, 257.625, laplace(40.2, 83.6), '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 135.0, radiusSigmaKm: 4.0, gmKm3s2: 0.37049, gmSigma: 0.00005, densityGcc: 0.5386, triaxialKm: triax(135.0, 180.1, 133.0, 102.7), shapeSource: TRIAX }, physEph: 'SAT441',
    rotation: { kind: 'chaotic', note: 'Hyperion tumbles chaotically (Wisdom et al. 1984; Cassini). Its orientation cannot be predicted; a slow arbitrary tumble is drawn.' },
    appearance: { color: '#b0a08a', relief: 0.16, evidence: 'Reddish-tan, sponge-like porous surface (density 0.54 g/cm³) seen by Cassini; no global map, so a neutral irregular body is drawn' },
    importance: 0.45, confidence: 'medium',
    info: 'A highly porous, irregular moon with a sponge-like appearance. Its 4:3 resonance with Titan and elongated shape make its rotation chaotic.',
    uncertainty: 'Strong 4:3 resonance with Titan: mean elements can drift by 10⁴–10⁵ km.',
  },
  {
    id: 'iapetus', name: 'Iapetus', aliases: ['Saturn VIII'], parent: 'saturn', naif: 608,
    row: [3561700, 0.028, 254.5, 74.8, 7.6, 86.5, 79.331002, 1662.9, 3130.302, laplace(288.7, 78.9), '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 734.3, radiusSigmaKm: 2.8, gmKm3s2: 120.51511, gmSigma: 0.00242, densityGcc: 1.0887 }, physEph: 'SAT441',
    appearance: { color: '#e3d9c8', texture: 'ss_iapetus', evidence: 'Extreme two-tone albedo: the leading hemisphere (Cassini Regio, albedo ~0.03–0.05) is as dark as coal, the trailing side bright ice (~0.5–0.6)' },
    importance: 0.65, confidence: 'high',
    info: 'A two-toned moon: its leading hemisphere is coated with dark material while the trailing hemisphere is bright ice. An equatorial ridge up to ~13 km high encircles part of it.',
  },
  {
    id: 'phoebe', name: 'Phoebe', aliases: ['Saturn IX'], parent: 'saturn', naif: 609,
    row: [12929400, 0.164, 240.3, 308.0, 175.2, 192.7, 550.30391, 468.321, 741.483, laplace(276.0, 67.5), '2000-01-01.5', 'SAT441'],
    phys: { meanRadiusKm: 106.5, radiusSigmaKm: 0.7, gmKm3s2: 0.55479, gmSigma: 0.00108, densityGcc: 1.6428 }, physEph: 'SAT441',
    rotation: { kind: 'spin', periodHours: 9.2735, source: 'IAU 2015 (W rate 931.639°/day)', note: 'Rotational phase not modelled.' },
    appearance: { color: '#4b4641', texture: 'ss_phoebe', relief: 0.04, evidence: 'Very dark (albedo ~0.08), heavily cratered captured body (Cassini 2004 flyby mosaic)' },
    importance: 0.4, confidence: 'high',
    info: 'A dark, retrograde, captured moon far outside the regular satellites. Dust from Phoebe forms the enormous Phoebe ring and probably darkened Iapetus\'s leading side.',
    uncertainty: 'Distant, Sun-perturbed retrograde orbit: errors of 10⁵ km or more are expected.',
  },
  ...([
    ['janus', 'Janus', ['Saturn X'], 610, [151500, 0.007, 11.1, 111.7, 0.2, 159.9, 0.697353, 0.24, 0.482], 89.2, 0.8, 0.12662, 0.00007, 0.6381, 'SAT415', 'Co-orbital with Epimetheus: the two swap orbits every ~4 years. Mean elements cannot represent the swap.'],
    ['epimetheus', 'Epimetheus', ['Saturn XI'], 611, [151400, 0.02, 96.3, 197.2, 0.3, 189.8, 0.697012, 0.24, 0.482], 58.2, 1.2, 0.03514, 0.00002, 0.6375, 'SAT415', 'Co-orbital with Janus: the two swap orbits every ~4 years. Mean elements cannot represent the swap.'],
    ['pan', 'Pan', ['Saturn XVIII'], 618, [133600, 0.0, 0.0, 146.6, 0.0, 0.0, 0.575051, 0.0, 0.0], 14.0, 1.2, 0.00028, 0.00014, 0.365, 'SAT415', 'Orbits inside the Encke Gap of the A ring, which it keeps open.'],
    ['atlas', 'Atlas', ['Saturn XV'], 615, [137700, 0.001, 82.3, 289.1, 0.0, 0.0, 0.604602, 0.342, 0.0], 15.1, 0.8, 0.00037, 0.00001, 0.385, 'SAT415', 'Orbits just outside the A ring.'],
    ['prometheus', 'Prometheus', ['Saturn XVI'], 616, [139400, 0.002, 341.9, 135.4, 0.0, 0.0, 0.615878, 0.357, 0.0], 43.1, 1.2, 0.01071, 0.00001, 0.4784, 'SAT415', 'Inner shepherd of the F ring; chaotic interactions with Pandora.'],
    ['pandora', 'Pandora', ['Saturn XVII'], 617, [141700, 0.004, 217.9, 123.9, 0.0, 0.0, 0.631369, 0.379, 0.0], 40.6, 1.5, 0.00926, 0.00002, 0.4948, 'SAT415', 'Outer shepherd of the F ring; chaotic interactions with Prometheus.'],
    ['helene', 'Helene', ['Saturn XII', 'Dione B'], 612, [377600, 0.007, 194.3, -64.5, 0.2, 260.8, 2.736916, 5.825, 11.707], 18.0, 0.4, 0.00048, 0.00002, 0.2918, 'SAT441', 'Trojan moon at Dione\'s leading L4 Lagrange point.'],
  ] as const).map(([id, name, aliases, naif, r, R, Rs, gm, gms, rho, eph, note]): SatDef => ({
    id, name, aliases: [...aliases], parent: 'saturn', naif,
    row: [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], SAT_L, '2000-01-01.5', eph === 'SAT441' ? 'SAT441' : 'SAT415'],
    phys: { meanRadiusKm: R, radiusSigmaKm: Rs, gmKm3s2: gm, gmSigma: gms, densityGcc: rho }, physEph: eph,
    appearance: { color: '#cfc9bf', relief: 0.12, evidence: 'Small icy moon; no global map in this pipeline, so drawn as a neutral irregular body in a typical icy colour' },
    importance: 0.25, confidence: 'medium',
    info: `A small inner moon of Saturn. ${note}`,
  })),
  // ----------------------------------------------------------------- Uranus (URA182 equatorial elements)
  ...([
    ['miranda', 'Miranda', 705, [129846, 0.001, 154.8, 73.0, 4.4, 100.9, 1.413479, 8.939, 17.787], 235.8, 0.7, 4.3, 0.2, 1.178, '#b8b5b0', 'ss_miranda', 0.55, 'A small moon with a patchwork of grooved coronae and the 20-km-deep Verona Rupes cliff — among the strangest landscapes in the Solar System.', 'Grey icy surface with chevron and racetrack-shaped coronae (Voyager 2, southern hemisphere only)'],
    ['ariel', 'Ariel', 701, [190929, 0.001, 9.6, 193.5, 0.0, 0.0, 2.520379, 28.901, 0.0], 578.9, 0.6, 83.5, 1.4, 1.539, '#c8c4bd', 'ss_ariel', 0.55, 'The brightest Uranian moon, with a relatively young surface cut by fault valleys (chasmata).', 'Brightest of the major Uranian moons (albedo ~0.5); rift valleys (Voyager 2, southern hemisphere only)'],
    ['umbriel', 'Umbriel', 702, [265986, 0.004, 183.4, 253.0, 0.1, 174.8, 4.144177, 64.126, 129.945], 584.7, 2.8, 85.1, 1.9, 1.523, '#6f6b66', 'ss_umbriel', 0.5, 'The darkest of Uranus\'s large moons, ancient and uniformly cratered, with a mysterious bright ring (Wunda) near its equator.', 'Darkest major Uranian moon (albedo ~0.2) (Voyager 2, southern hemisphere only)'],
    ['titania', 'Titania', 703, [436298, 0.002, 184.0, 68.1, 0.1, 29.5, 8.705869, 579.928, 1644.649], 788.9, 1.8, 226.9, 4.1, 1.653, '#a9a39a', 'ss_titania', 0.65, 'Uranus\'s largest moon, with huge fault canyons such as Messina Chasma that indicate past internal activity.', 'Grey icy surface with long canyons (Voyager 2, southern hemisphere only)'],
    ['oberon', 'Oberon', 704, [583511, 0.002, 132.2, 143.6, 0.1, 76.8, 13.463237, 158.604, 192.798], 761.4, 2.6, 205.3, 5.8, 1.664, '#9a8e84', 'ss_oberon', 0.6, 'The outermost large Uranian moon: old, heavily cratered, with dark material on some crater floors and a 11-km-high mountain.', 'Slightly reddish, heavily cratered (Voyager 2, southern hemisphere only)'],
  ] as const).map(([id, name, naif, r, R, Rs, gm, gms, rho, color, tex, imp, info, ev]): SatDef => ({
    id, name, aliases: [`Uranus ${['', 'I', 'II', 'III', 'IV', 'V'][naif - 700]}`], parent: 'uranus', naif,
    row: [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], equator('uranus'), '2000-01-01.5', 'URA182'],
    phys: { meanRadiusKm: R, radiusSigmaKm: Rs, gmKm3s2: gm, gmSigma: gms, densityGcc: rho }, physEph: 'URA111',
    appearance: { color, texture: tex, evidence: `${ev}. RECONSTRUCTION: the unimaged northern hemisphere is a neutral fill.` },
    importance: imp, confidence: 'high', info,
    notes: ['Surface map is partial: Voyager 2 (1986) saw only the sunlit southern hemisphere. The north is shown as a neutral mean tone.'],
  })),
  {
    id: 'puck', name: 'Puck', aliases: ['Uranus XV'], parent: 'uranus', naif: 715,
    row: [86004, 0.0, 0.0, 50.1, 0.3, 216.1, 0.761833, 2.226, 4.454, equator('uranus'), '2000-01-01.5', 'URA182'],
    phys: { meanRadiusKm: 77, radiusSigmaKm: 3, gmKm3s2: null, densityGcc: null, source: 'JPL Horizons object data (radius 77 ± 3 km); not in the JPL physical-parameter table' }, physEph: 'n/a',
    appearance: { color: '#5a5754', evidence: 'Dark (albedo ~0.07) and roughly spherical in the single Voyager 2 image; neutral representation' },
    importance: 0.3, confidence: 'medium',
    info: 'The largest of Uranus\'s small inner moons, discovered by Voyager 2 in 1985.',
  },
  // ----------------------------------------------------------------- Neptune
  {
    id: 'triton', name: 'Triton', aliases: ['Neptune I'], parent: 'neptune', naif: 801,
    row: [354800, 0.0, 0.0, 63.0, 157.3, 177.7, 5.8792, 675.2, 299.4, equator('neptune'), '2000-01-01.5', 'NEP098'],
    phys: { meanRadiusKm: 1352.6, radiusSigmaKm: 2.4, gmKm3s2: 1428.49546, gmSigma: 0.61603, densityGcc: 2.0649 }, physEph: 'NEP097',
    appearance: { color: '#e2d3c6', texture: 'ss_triton', evidence: 'Pinkish nitrogen-ice south polar cap and "cantaloupe" terrain (Voyager 2 colour mosaic, southern hemisphere). RECONSTRUCTION: unimaged north is a neutral fill.' },
    importance: 0.75, confidence: 'high',
    info: 'Neptune\'s largest moon orbits RETROGRADE (opposite to Neptune\'s rotation), strong evidence that it is a captured Kuiper Belt object. Voyager 2 saw nitrogen geysers on its young surface.',
    notes: ['Surface map is partial: Voyager 2 (1989) imaged mainly the southern hemisphere.'],
  },
  {
    id: 'nereid', name: 'Nereid', aliases: ['Neptune II'], parent: 'neptune', naif: 802,
    row: [5513900, 0.751, 296.8, 318.5, 5.1, 319.5, 360.133039, 7990.433, 9426.334, ECLIPTIC, '2020-01-01.0', 'NEP105'],
    phys: { meanRadiusKm: 170, radiusSigmaKm: 25, gmKm3s2: null, densityGcc: null }, physEph: 'NEP101',
    rotation: { kind: 'unknown', note: 'Rotation period is debated in the literature; drawn without rotation.' },
    appearance: { color: '#8f8a85', evidence: 'Only a few pixels in Voyager 2 images; neutral sphere with uncertainty' },
    importance: 0.4, confidence: 'medium',
    info: 'A moon on one of the most eccentric orbits known (e = 0.75), swinging from 1.4 to 9.7 million km from Neptune.',
    notes: ['JPL lists GM = 0 for Nereid (mass not measured); shown as unknown.'],
  },
  {
    id: 'proteus', name: 'Proteus', aliases: ['Neptune VIII'], parent: 'neptune', naif: 808,
    row: [117700, 0.001, 357.2, 297.4, 0.6, 355.5, 1.1229, 6.5, 13.1, equator('neptune'), '2000-01-01.5', 'NEP098'],
    phys: { meanRadiusKm: 208, radiusSigmaKm: 8, gmKm3s2: 2.58342, gmSigma: 2.4207, densityGcc: null, triaxialKm: triax(208, 218, 208, 201), shapeSource: TRIAX }, physEph: 'NEP097',
    appearance: { color: '#4f4a46', relief: 0.08, evidence: 'Very dark (albedo ~0.1), box-like shape (Voyager 2); no global map in this pipeline' },
    importance: 0.45, confidence: 'medium',
    info: 'Neptune\'s second-largest moon: about as large as a body can be without being pulled round by its own gravity.',
    notes: ['The JPL density for Proteus (1.03 ± 0.97 g/cm³) is too uncertain to be shown.'],
  },
  ...([
    ['larissa', 'Larissa', 807, [73600, 0.001, 222.0, 215.1, 0.2, 317.4, 0.5549, 1.3, 2.5], 96, 7, 'Neptune VII'],
    ['galatea', 'Galatea', 806, [62000, 0.001, 113.9, 12.0, 0.0, 0.0, 0.4292, 1.4, 299.4], 79, 12, 'Neptune VI'],
    ['despina', 'Despina', 805, [52600, 0.001, 182.1, 354.1, 0.0, 0.0, 0.3347, 0.8, 299.4], 74, 10, 'Neptune V'],
  ] as const).map(([id, name, naif, r, R, Rs, alias]): SatDef => ({
    id, name, aliases: [alias], parent: 'neptune', naif,
    row: [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], equator('neptune'), '2000-01-01.5', 'NEP098'],
    phys: { meanRadiusKm: R, radiusSigmaKm: Rs, gmKm3s2: null, densityGcc: null }, physEph: 'NEP097',
    appearance: { color: '#56504a', relief: 0.1, evidence: 'Dark, irregular, barely resolved by Voyager 2; neutral representation' },
    importance: 0.25, confidence: 'medium',
    info: `A small, dark inner moon of Neptune discovered by Voyager 2 in 1989.`,
    notes: ['JPL GM for this moon has an uncertainty larger than the value; mass shown as unknown.'],
  })),
  // ----------------------------------------------------------------- Pluto system (PLU060)
  {
    id: 'charon', name: 'Charon', aliases: ['Pluto I'], parent: 'pluto', naif: 901,
    row: [19600, 0.0, 0.0, 304.1, 0.0, 0.0, 6.387222, null, null, equator('pluto'), '2000-01-01.5', 'PLU060'],
    phys: { meanRadiusKm: 606.0, radiusSigmaKm: 0.5, gmKm3s2: 106.1, gmSigma: 0.3, densityGcc: 1.853 }, physEph: 'PLU060',
    rotation: { kind: 'synchronous', note: 'Pluto and Charon are mutually tidally locked.' },
    appearance: { color: '#aba59f', texture: 'ss_charon', evidence: 'Grey water-ice surface with the dark red Mordor Macula pole (New Horizons). RECONSTRUCTION: unimaged southern latitudes are a neutral fill.' },
    importance: 0.7, confidence: 'high',
    info: 'Pluto\'s largest moon, half Pluto\'s diameter. Pluto and Charon orbit a common barycentre ~2,100 km above Pluto\'s surface, so they are often called a double dwarf planet.',
    notes: ['Elements are the Pluto-centred relative orbit; positions are split about the barycentre with the JPL mass ratio (see ORBITAL_MECHANICS.md).'],
  },
  ...([
    ['styx', 'Styx', 905, [43200, 0.025, 322.5, 358.1, 0.0, 0.0, 20.16, null, null], 5.2, 1.0, [16, 9, 8], 3.24 * 24, 'Pluto V'],
    ['nix', 'Nix', 902, [49300, 0.015, 31.4, 338.2, 0.0, 0.0, 24.85, null, null], 18.0, 1.0, [50, 35, 33], 1.829 * 24, 'Pluto II'],
    ['kerberos', 'Kerberos', 904, [58300, 0.01, 32.1, 276.1, 0.4, 314.3, 32.17, null, 9], 6.0, 1.0, [19, 10, 9], 5.31 * 24, 'Pluto IV'],
    ['hydra', 'Hydra', 903, [65200, 0.009, 139.3, 335.0, 0.3, 114.3, 38.2, null, 14], 18.5, 1.0, [51, 36, 31], 0.4295 * 24, 'Pluto III'],
  ] as const).map(([id, name, naif, r, R, Rs, ax, rotH, alias]): SatDef => ({
    id, name, aliases: [alias], parent: 'pluto', naif, centre: 'barycentre',
    row: [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], equator('pluto'), '2000-01-01.5', 'PLU060'],
    phys: { meanRadiusKm: R, radiusSigmaKm: Rs, gmKm3s2: null, densityGcc: null, triaxialKm: triax(R, ax[0], ax[1], ax[2]), shapeSource: TRIAX }, physEph: 'PLU060',
    rotation: { kind: 'spin', periodHours: rotH, source: 'Weaver et al. 2016, Science 351, aae0030 (New Horizons)', note: 'Non-synchronous, chaotic-like rotation; pole and phase not modelled.' },
    appearance: { color: '#d4d2cf', relief: 0.1, evidence: 'Bright, neutral water-ice surfaces (albedo ~0.5–0.8, New Horizons); no global maps exist — neutral elongated shape' },
    importance: 0.3, confidence: 'medium',
    info: `A small moon of Pluto orbiting the Pluto–Charon barycentre; imaged by New Horizons in 2015.`,
    notes: ['Elements treated as barycentric (circumbinary orbit). JPL masses for this moon are upper limits or highly uncertain.'],
  })),
]

// ---------------------------------------------------------------------------------------------------------------
// Heliocentric small bodies: JPL SBDB osculating elements (ecliptic J2000), retrieved 2026-10-25 with full precision.
interface SbdbDef {
  id: string; name: string; aliases: string[]; cls: BodyClass; spk: string
  el: { a: number; e: number; i: number; om: number; w: number; ma: number; n: number; epoch: number }
  phys: PhysicalData; rotation: RotationModel; appearance: Appearance; importance: number; confidence: 'high' | 'medium' | 'low'; info: string; notes?: string[]
}

const sbdb = (d: SbdbDef): SolarBody => ({
  id: d.id, name: d.name, aliases: d.aliases, cls: d.cls, parent: 'sun', physical: d.phys, rotation: d.rotation, appearance: d.appearance,
  importance: d.importance, confidence: d.confidence, info: d.info, notes: d.notes,
  orbit: {
    elements: { aKm: d.el.a * KM_PER_AU, e: d.el.e, iDeg: d.el.i, nodeDeg: d.el.om, argPeriDeg: d.el.w, meanAnomalyDeg: d.el.ma, epochJd: d.el.epoch, meanMotionDegPerDay: d.el.n, frame: ECLIPTIC },
    primary: 'sun', centre: 'primary', model: 'osculating-elements', source: `JPL SBDB osculating elements, epoch JD ${d.el.epoch} TDB (SPK-ID ${d.spk})`,
    frameLabel: 'heliocentric ecliptic J2000', uncertainty: 'Two-body propagation of osculating elements ignores planetary perturbations; error grows with |t − epoch| (see validation doc).',
  },
})

const SMALL: SolarBody[] = [
  sbdb({
    id: 'ceres', name: 'Ceres', aliases: ['1 Ceres', '(1) Ceres', 'A801 AA'], cls: 'dwarf-planet', spk: '20000001',
    el: { a: 2.765552595034094, e: 0.07969229514816586, i: 10.58802780183462, om: 80.24862682043221, w: 73.29421453021587, ma: 274.4193463761342, n: 0.21430445064843, epoch: 2461200.5 },
    phys: { meanRadiusKm: 939.4 / 2, radiusSigmaKm: 0.1, triaxialKm: [964.4 / 2, 964.2 / 2, 891.8 / 2], gmKm3s2: 62.6284, gmSigma: 0.0009, densityGcc: 2.162, source: 'JPL SBDB (Park et al. 2016, Nature 537, 515)', shapeSource: 'JPL SBDB extent 964.4 × 964.2 × 891.8 km' },
    rotation: { kind: 'spin', periodHours: 9.07417, pole: { raDeg: 291.421, decDeg: 66.758 }, source: 'JPL SBDB (Park et al. 2016)', note: 'Rotational phase not modelled.' },
    appearance: { color: '#77736f', texture: 'ss_ceres', evidence: 'Dark grey (albedo 0.09) with bright carbonate deposits in Occator crater (Dawn FC mosaic)' },
    importance: 0.75, confidence: 'high',
    info: 'The largest object in the asteroid belt and the only dwarf planet in the inner Solar System. Dawn found briny carbonate deposits (Occator\'s bright spots) and evidence of a past or present subsurface brine layer.',
  }),
  sbdb({
    id: 'vesta', name: 'Vesta', aliases: ['4 Vesta', '(4) Vesta', 'A807 FA'], cls: 'asteroid', spk: '20000004',
    el: { a: 2.361365965127599, e: 0.09020374382834395, i: 7.143925545058711, om: 103.701293265032, w: 151.4686478221564, ma: 81.19015607686903, n: 0.2716183613599909, epoch: 2461200.5 },
    phys: { meanRadiusKm: 522.77 / 2, radiusSigmaKm: 0.05, triaxialKm: [569.24 / 2, 554.48 / 2, 452.66 / 2], gmKm3s2: 17.2882844, gmSigma: 0.000003, densityGcc: 3.46, source: 'JPL SBDB (Park et al. 2025, Nature Astronomy)', shapeSource: 'JPL SBDB extent 569.24 × 554.48 × 452.66 km' },
    rotation: { kind: 'spin', periodHours: 5.3421276322, pole: { raDeg: 309.0611, decDeg: 42.232386 }, source: 'JPL SBDB (Park et al. 2025)', note: 'Rotational phase not modelled.' },
    appearance: { color: '#b0a796', texture: 'ss_vesta', evidence: 'Bright basaltic surface (albedo ~0.42) with the Rheasilvia south-polar basin (Dawn FC HAMO mosaic)' },
    importance: 0.65, confidence: 'high',
    info: 'The second-most-massive asteroid: a differentiated protoplanet with an iron core and basaltic crust. The giant Rheasilvia impact basin at its south pole is the source of the HED meteorites.',
  }),
  sbdb({
    id: 'pallas', name: 'Pallas', aliases: ['2 Pallas', '(2) Pallas', 'A802 FA'], cls: 'asteroid', spk: '20000002',
    el: { a: 2.769559010737709, e: 0.2307000995648547, i: 34.93279321851542, om: 172.8866193357694, w: 310.9699161652136, ma: 254.2496521742734, n: 0.2138396029251949, epoch: 2461200.5 },
    phys: { meanRadiusKm: 513 / 2, radiusSigmaKm: 3, triaxialKm: [568 / 2, 532 / 2, 448 / 2], gmKm3s2: 13.63, gmSigma: 0.18, densityGcc: 2.89, source: 'JPL SBDB (Marsset et al. 2020; Vernazza et al. 2021)', shapeSource: 'JPL SBDB extent 568 × 532 × 448 km' },
    rotation: { kind: 'spin', periodHours: 7.8132214, source: 'JPL SBDB (Carry et al. 2010)', note: 'Pole orientation not modelled (the SBDB pole entry does not state its frame); spin drawn about the orbit normal.' },
    appearance: { color: '#8b8781', relief: 0.05, evidence: 'B-type, moderately dark (albedo 0.155); no global map — neutral ellipsoid with its measured dimensions' },
    importance: 0.5, confidence: 'high',
    info: 'The third-largest asteroid, on a steeply inclined (35°) orbit. Its surface is heavily cratered, likely because of high-speed impacts on its tilted path.',
  }),
  sbdb({
    id: 'hygiea', name: 'Hygiea', aliases: ['10 Hygiea', '(10) Hygiea', 'A849 GA'], cls: 'asteroid', spk: '20000010',
    el: { a: 3.150974033963701, e: 0.1067092741240963, i: 3.829529946447122, om: 283.1198927508594, w: 312.4242387344704, ma: 252.0344242359649, n: 0.1762125505792448, epoch: 2461200.5 },
    phys: { meanRadiusKm: 407.12 / 2, radiusSigmaKm: 3.4, gmKm3s2: 7, gmSigma: null, densityGcc: null, source: 'JPL SBDB (IRAS diameter 407.12 ± 6.8 km; GM from Scholl et al. 1987, no uncertainty given)' },
    rotation: { kind: 'spin', periodHours: 13.828, source: 'JPL SBDB (LCDB)', note: 'Pole and phase not modelled.' },
    appearance: { color: '#5c5853', evidence: 'C-type, dark (albedo 0.07); no global map — neutral sphere' },
    importance: 0.45, confidence: 'medium',
    info: 'The fourth-largest asteroid and the largest of the dark C-type asteroids. VLT/SPHERE images show it is nearly spherical, making it a dwarf-planet candidate.',
  }),
  sbdb({
    id: 'eris', name: 'Eris', aliases: ['136199 Eris', '2003 UB313'], cls: 'dwarf-planet', spk: '20136199',
    el: { a: 67.93394687853566, e: 0.4382385347971672, i: 43.9258279471791, om: 36.00477044417249, w: 150.7949235840312, ma: 211.774434275007, n: 0.001760247770619088, epoch: 2461200.5 },
    phys: { meanRadiusKm: 1163, radiusSigmaKm: 6, gmKm3s2: null, densityGcc: null, source: 'Sicardy et al. 2011, Nature 478, 493 (stellar occultation); JPL tables give no radius' },
    rotation: { kind: 'unknown', note: 'Rotation period uncertain (SBDB/LCDB lists 25.9 h from partial coverage); drawn without rotation.' },
    appearance: { color: '#efeeec', evidence: 'Extremely bright (geometric albedo ~0.96) methane-frost surface; never resolved — neutral sphere' },
    importance: 0.55, confidence: 'medium',
    info: 'The most massive known dwarf planet after Pluto and nearly the same size. Its discovery in 2005 led to the IAU definition of "dwarf planet".',
  }),
  sbdb({
    id: 'haumea', name: 'Haumea', aliases: ['136108 Haumea', '2003 EL61'], cls: 'dwarf-planet', spk: '20136108',
    el: { a: 43.06029023650952, e: 0.1944430148898797, i: 28.20847393040364, om: 121.7860561329425, w: 240.6905472508661, ma: 223.2104118812299, n: 0.003488097731816818, epoch: 2461200.5 },
    phys: { meanRadiusKm: Math.cbrt(1161 * 852 * 513), radiusSigmaKm: null, triaxialKm: [1161, 852, 513], gmKm3s2: null, densityGcc: null, source: 'Ortiz et al. 2017, Nature 550, 219 (occultation semi-axes 1161 × 852 × 513 km)' },
    rotation: { kind: 'spin', periodHours: 3.9154, source: 'JPL SBDB (LCDB)', note: 'Pole and phase not modelled.' },
    appearance: { color: '#eeeef0', evidence: 'Crystalline water-ice surface with a dark red spot; never resolved — neutral ellipsoid with its measured semi-axes' },
    importance: 0.5, confidence: 'medium',
    info: 'A fast-spinning (3.9 h) dwarf planet stretched into an elongated ellipsoid, with a ring and two moons.',
  }),
  sbdb({
    id: 'makemake', name: 'Makemake', aliases: ['136472 Makemake', '2005 FY9'], cls: 'dwarf-planet', spk: '20136472',
    el: { a: 45.57093317300052, e: 0.1588889953992523, i: 29.02785603743067, om: 79.2948338209406, w: 297.0922733397207, ma: 169.9379962048232, n: 0.003203850120050116, epoch: 2461200.5 },
    phys: { meanRadiusKm: 715, radiusSigmaKm: 7, gmKm3s2: null, densityGcc: null, source: 'Ortiz et al. 2012, Nature 491, 566 (occultation, ~1430 × 1502 km)' },
    rotation: { kind: 'spin', periodHours: 22.8266, source: 'JPL SBDB (LCDB; partial coverage)', note: 'Pole and phase not modelled.' },
    appearance: { color: '#e4c9ac', evidence: 'Reddish-brown methane-rich surface (albedo ~0.8); never resolved — neutral sphere' },
    importance: 0.45, confidence: 'medium',
    info: 'A bright, reddish Kuiper Belt dwarf planet covered in methane and ethane ices, with one known moon.',
  }),
]

/** Pluto: dwarf planet whose heliocentric orbit is that of the Pluto–Charon barycentre. */
export const PLUTO_BODY: SolarBody = {
  id: 'pluto', name: 'Pluto', aliases: ['134340 Pluto', '(134340) Pluto', '1930 BM'], cls: 'dwarf-planet', parent: 'sun', naifId: 999,
  physical: { meanRadiusKm: 1188.3, radiusSigmaKm: 1.6, gmKm3s2: 869.3, gmSigma: 0.4, densityGcc: 1.86, source: 'JPL SSD (PLU060 GM) and Horizons (IAU 2015 mean radius)' },
  rotation: { kind: 'synchronous-binary', companion: 'charon', note: 'Pluto rotates once per Charon orbit (6.387 d): its 0° longitude faces Charon.' },
  appearance: { color: '#d4b48f', texture: 'ss_pluto', evidence: 'Tan-to-reddish tholin-coloured surface with the bright nitrogen-ice Sputnik Planitia "heart" (New Horizons). RECONSTRUCTION: unimaged southern latitudes are a neutral fill; map is greyscale, tinted with the published colour.' },
  importance: 0.85, confidence: 'high',
  info: 'A dwarf planet in the Kuiper Belt with nitrogen glaciers, water-ice mountains and a thin hazy atmosphere. New Horizons flew past in 2015.',
  notes: ['Surface map is partial: the hemisphere facing New Horizons at closest approach is high-resolution, the far side is low-resolution and the south is unimaged.'],
  orbit: {
    elements: { aKm: 39.58862938517124 * KM_PER_AU, e: 0.2518378778576892, iDeg: 17.14771140999114, nodeDeg: 110.2923840543057, argPeriDeg: 113.7090015158565, meanAnomalyDeg: 38.68366347318184, epochJd: 2457588.5, meanMotionDegPerDay: 0.003956838955553025, frame: ECLIPTIC },
    primary: 'sun', centre: 'primary', model: 'osculating-elements', source: 'JPL SBDB osculating elements for 134340 Pluto, epoch JD 2457588.5 TDB (compared with the Pluto-system barycentre in Horizons)',
    frameLabel: 'heliocentric ecliptic J2000 (Pluto–Charon barycentre)', uncertainty: 'Two-body propagation from a 2016 epoch; Neptune perturbations ignored (see validation doc).',
  },
}

/** Charon/Pluto mass ratio from JPL GM values (PLU060): 106.1 / 869.3. */
export const CHARON_PLUTO_MASS_RATIO = 106.1 / 869.3

/**
 * JPL's table gives periods to 4–7 significant digits and its longitude origin differs for some systems, so the
 * published phase drifts by tens of degrees over decades. The mean anomaly at epoch and the mean motion are therefore
 * refined by a linear least-squares fit to Horizons positions over 2016–2036 (scripts/fit_satellite_phase.ts);
 * a, e, i, Ω, ω, the precession rates and the reference plane stay exactly as published.
 */
function applyPhaseFit(el: KeplerElements, fit: PhaseFit | undefined): KeplerElements {
  if (!fit) return el
  return { ...el, meanAnomalyDeg: el.meanAnomalyDeg + fit.dM0Deg, meanMotionDegPerDay: el.meanMotionDegPerDay + fit.dMdotDegPerDay }
}

function fromSat(d: SatDef): SolarBody {
  const eph = d.row[11]
  const raw = satElements(d.row)
  const fit = SATELLITE_PHASE_FIT[d.id]
  return {
    id: d.id, name: d.name, aliases: d.aliases ?? [], cls: 'moon', parent: d.parent, naifId: d.naif,
    physical: { ...d.phys, source: d.phys.source ?? PHYS(d.physEph) },
    orbit: {
      elements: applyPhaseFit(raw, fit), rawElements: raw, phaseFit: fit,
      primary: d.parent, centre: d.centre ?? 'primary', model: 'mean-elements',
      source: SAT_SRC(eph) + (fit ? '; mean anomaly at epoch and mean motion fitted to JPL Horizons 2016–2036' : ''),
      frameLabel: d.row[9].kind === 'ecliptic' ? 'ecliptic J2000, planet-centred' : `${d.row[9].label} (pole RA ${d.row[9].raDeg.toFixed(1)}°, Dec ${d.row[9].decDeg.toFixed(1)}°)`,
      uncertainty: d.uncertainty ?? 'Mean elements with secular precession only; short-period perturbations ignored (see validation doc).',
    },
    rotation: d.rotation ?? SYNC, appearance: d.appearance, importance: d.importance ?? 0.4, confidence: d.confidence ?? 'medium', info: d.info, notes: d.notes,
  }
}

export const SOLAR_BODIES: SolarBody[] = [...SATS.map(fromSat), PLUTO_BODY, ...SMALL]
export const SOLAR_BODY_BY_ID: Record<string, SolarBody> = Object.fromEntries(SOLAR_BODIES.map((b) => [b.id, b]))
