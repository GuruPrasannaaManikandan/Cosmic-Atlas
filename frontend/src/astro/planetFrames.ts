/**
 * Body-fixed frames, rotation and ring systems of the eight planets.
 *
 * Orientation: the IAU north pole (PLANET_POLES, Archinal et al. 2018) is converted with the SAME frameToGalactic()
 * used for the moons' "planet equator" orbits, so a planet's equator, its regular moons and its rings agree.
 * Body frame -> three.js: local +Y = IAU north pole, local +X = ascending node of the equator on the ICRF equator
 * (the IAU origin of the prime-meridian angle W), local +Z = X x Y. A three.js SphereGeometry maps an equirectangular
 * texture so that longitude 0 lies on +X and east is towards -Z, so `rotation.y = W` places the prime meridian.
 *
 * Rotation: W = W0 + Wdot * d (d = days from J2000 TDB), IAU WGCCRE values. Negative Wdot = retrograde (Venus, Uranus).
 */
import * as THREE from 'three'
import { frameToGalactic } from './kepler'
import { toThree, Vec3 } from './coords'
import { PLANET_POLES } from '../data/solarSystem'

export const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const
export type PlanetId = (typeof PLANETS)[number]
export const isPlanet = (id: string): id is PlanetId => (PLANETS as readonly string[]).includes(id)

/** IAU prime-meridian models W = W0 + Wdot d (deg, deg/day). Periodic librations/nutation terms omitted (< 1°). */
export const PRIME_MERIDIAN: Record<PlanetId, { W0: number; Wdot: number; source: string }> = {
  mercury: { W0: 329.5988, Wdot: 6.1385108, source: 'IAU WGCCRE 2015' },
  venus: { W0: 160.2, Wdot: -1.4813688, source: 'IAU WGCCRE 2015 (retrograde)' },
  earth: { W0: 190.147, Wdot: 360.9856235, source: 'IAU WGCCRE 2015' },
  mars: { W0: 176.049863, Wdot: 350.891982443297, source: 'IAU WGCCRE 2015' },
  jupiter: { W0: 284.95, Wdot: 870.536, source: 'IAU WGCCRE 2015 (System III)' },
  saturn: { W0: 38.9, Wdot: 810.7939024, source: 'IAU WGCCRE 2015 (System III)' },
  uranus: { W0: 203.81, Wdot: -501.1600928, source: 'IAU WGCCRE 2015 (retrograde, 17.24 h)' },
  // 16.11 h (NASA Neptune fact sheet; Voyager 2 radio period) = 536.3128 deg/day, IAU 2009 W0
  neptune: { W0: 253.18, Wdot: 536.3128492, source: 'IAU WGCCRE 2009 (16.11 h Voyager radio period)' },
}

const J2000 = 2451545.0
export const primeMeridianRad = (id: PlanetId, jdTdb: number): number => {
  const p = PRIME_MERIDIAN[id]
  const w = (p.W0 + p.Wdot * (jdTdb - J2000)) % 360
  return (w * Math.PI) / 180
}

const quatCache = new Map<string, THREE.Quaternion>()
/** Body frame -> three.js scene rotation (see header). */
export function planetOrientation(id: PlanetId): THREE.Quaternion {
  const hit = quatCache.get(id)
  if (hit) return hit
  const pole = PLANET_POLES[id]
  const m = frameToGalactic({ kind: 'pole', raDeg: pole.raDeg, decDeg: pole.decDeg, label: 'planet equator' })
  const col = (c: number): Vec3 => toThree([m[0][c], m[1][c], m[2][c]])
  const x = new THREE.Vector3(...col(0)) // node of the equator on the ICRF equator
  const y = new THREE.Vector3(...col(2)) // IAU north pole
  const z = new THREE.Vector3().crossVectors(x, y)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  quatCache.set(id, q)
  return q
}

// --------------------------------------------------------------------------------------------- rings
export interface RingBand {
  name: string
  /** centre radius (km) and radial width (km) */
  radiusKm: number
  widthKm: number
  /** normal optical depth */
  tau: number
  /** 'main' = narrow dark particle ring, 'dust' = faint dusty ring (strong forward scattering) */
  kind: 'main' | 'dust'
}

/**
 * Uranian rings - NASA NSSDCA Uranus Rings Fact Sheet (D. R. Williams, updated 2015-10-14): radius, width, optical
 * depth. Ranges are represented by their midpoint (e.g. alpha 4-10 km -> 7 km, epsilon 20-96 km -> 58 km,
 * tau 0.5-2.3 -> 1.4). Albedo ~0.015 (main rings). R/2003 U 2 (nu) and R/2003 U 1 (mu): tau << 0.01 (Hubble dusty
 * rings); 1e-5 is used as a representative value.
 */
export const URANUS_RINGS: RingBand[] = [
  { name: '6', radiusKm: 41837, widthKm: 1.5, tau: 0.3, kind: 'main' },
  { name: '5', radiusKm: 42234, widthKm: 2, tau: 0.5, kind: 'main' },
  { name: '4', radiusKm: 42571, widthKm: 2, tau: 0.3, kind: 'main' },
  { name: 'Alpha', radiusKm: 44718, widthKm: 7, tau: 0.4, kind: 'main' },
  { name: 'Beta', radiusKm: 45661, widthKm: 8, tau: 0.3, kind: 'main' },
  { name: 'Eta', radiusKm: 47176, widthKm: 1.6, tau: 0.4, kind: 'main' },
  { name: 'Gamma', radiusKm: 47627, widthKm: 2.5, tau: 0.3, kind: 'main' },
  { name: 'Delta', radiusKm: 48300, widthKm: 5, tau: 0.5, kind: 'main' },
  { name: 'Lambda', radiusKm: 50024, widthKm: 2, tau: 0.1, kind: 'main' },
  { name: 'Epsilon', radiusKm: 51149, widthKm: 58, tau: 1.4, kind: 'main' },
  { name: 'Nu (R/2003 U 2)', radiusKm: 67300, widthKm: 3800, tau: 1e-5, kind: 'dust' },
  { name: 'Mu (R/2003 U 1)', radiusKm: 97700, widthKm: 17000, tau: 1e-5, kind: 'dust' },
]
export const URANUS_RING_ALBEDO = 0.015

/**
 * Neptunian rings - NASA NSSDCA Neptunian Rings Fact Sheet (updated 2015-10-14). Widths given as "< 100" use 100 km
 * for Le Verrier and 100 km for Arago (no optical depth listed; the Lassell value 1e-4 is used). Adams: tau 0.01-0.1
 * -> 0.01 for the continuous ring; the arcs (tau 0.12) are modelled separately (ADAMS_ARCS).
 */
export const NEPTUNE_RINGS: RingBand[] = [
  { name: 'Galle', radiusKm: 41900, widthKm: 2000, tau: 1e-4, kind: 'dust' },
  { name: 'Le Verrier', radiusKm: 53200, widthKm: 100, tau: 0.01, kind: 'main' },
  { name: 'Lassell', radiusKm: 55200, widthKm: 4000, tau: 1e-4, kind: 'dust' },
  { name: 'Arago', radiusKm: 57200, widthKm: 100, tau: 1e-4, kind: 'dust' },
  { name: 'Adams', radiusKm: 62933, widthKm: 15, tau: 0.01, kind: 'main' },
]
export const NEPTUNE_RING_ALBEDO = 0.015

/**
 * Adams-ring arcs (tau 0.12, width ~15 km). The arcs co-rotate at the Adams-ring mean motion (~820.12 deg/day).
 * Their relative longitudes are ILLUSTRATIVE: they reproduce the Voyager-era ordering and the ~40 deg total extent,
 * not measured arc boundaries. Liberté and Courage faded strongly after ~2003 (Keck/HST); fadeFrom/fadeTo encode that
 * as a linear decline of optical depth (ILLUSTRATIVE timing).
 */
export const ADAMS_ARCS: { name: string; startDeg: number; endDeg: number; tau: number; fadeFromYear?: number; fadeToYear?: number }[] = [
  { name: 'Fraternité', startDeg: 0, endDeg: 10, tau: 0.12 },
  { name: 'Egalité 1', startDeg: 12, endDeg: 15, tau: 0.12 },
  { name: 'Egalité 2', startDeg: 16, endDeg: 17, tau: 0.12 },
  { name: 'Liberté', startDeg: 21, endDeg: 25, tau: 0.12, fadeFromYear: 2003, fadeToYear: 2016 },
  { name: 'Courage', startDeg: 33, endDeg: 34, tau: 0.12, fadeFromYear: 2003, fadeToYear: 2016 },
]
export const ADAMS_ARC_MEAN_MOTION_DEG_PER_DAY = 820.1194

/** Decimal year (UTC) for a sim time in ms. */
export const decimalYear = (ms: number): number => 1970 + ms / (365.2425 * 86400000)

export function arcTau(arc: (typeof ADAMS_ARCS)[number], year: number): number {
  if (arc.fadeFromYear === undefined || arc.fadeToYear === undefined || year <= arc.fadeFromYear) return arc.tau
  const f = Math.min(1, (year - arc.fadeFromYear) / (arc.fadeToYear - arc.fadeFromYear))
  return arc.tau * (1 - 0.9 * f)
}

/**
 * Neptune's dark storms are transient: the Great Dark Spot and Dark Spot 2 were imaged by Voyager 2 in 1989 and had
 * disappeared in Hubble images by November 1994. The Solar System Scope map bakes them in, so they are shown only for
 * sim dates inside that window (faded over 0.3 yr at both ends) and replaced by the surrounding zonal band otherwise.
 * A third dark oval in the map's northern hemisphere has no documented counterpart and is always masked.
 * UV boxes (u, v-up centre and half-sizes) were measured on neptune_color_2k.jpg.
 */
export const NEPTUNE_MAP_SPOTS: { name: string; uv: [number, number, number, number]; fromYear: number; toYear: number }[] = [
  { name: 'Great Dark Spot (Voyager 2, 1989)', uv: [0.555, 0.415, 0.08, 0.05], fromYear: 1989.0, toYear: 1994.85 },
  { name: 'Dark Spot 2 (Voyager 2, 1989)', uv: [0.7, 0.205, 0.045, 0.025], fromYear: 1989.0, toYear: 1994.85 },
  { name: 'Unsourced northern oval (map gap fill)', uv: [0.112, 0.85, 0.05, 0.025], fromYear: 0, toYear: 0 },
]

export function spotVisibility(spot: (typeof NEPTUNE_MAP_SPOTS)[number], year: number): number {
  if (spot.toYear <= spot.fromYear) return 0
  const fade = 0.3
  const rise = THREE.MathUtils.clamp((year - spot.fromYear) / fade, 0, 1)
  const fall = THREE.MathUtils.clamp((spot.toYear - year) / fade, 0, 1)
  return Math.min(rise, fall)
}

/** Ring bands as shader uniforms in planet-radius units: (inner, outer, tau, kind 0 main / 1 dust). */
export function ringUniforms(rings: RingBand[], planetRadiusKm: number, max = 16): THREE.Vector4[] {
  const out = rings.slice(0, max).map((r) => new THREE.Vector4(
    (r.radiusKm - r.widthKm / 2) / planetRadiusKm, (r.radiusKm + r.widthKm / 2) / planetRadiusKm, r.tau, r.kind === 'dust' ? 1 : 0))
  while (out.length < max) out.push(new THREE.Vector4(0, 0, 0, 0))
  return out
}
