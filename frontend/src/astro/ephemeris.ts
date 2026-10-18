/**
 * Approximate Keplerian planetary positions (JPL "Approximate Positions of the Planets", Table 1,
 * valid 1800–2050 AD, accuracy of order arcminutes to tens of arcminutes). NOT a substitute for JPL Horizons.
 * The Moon uses a simplified circular, inclined orbit (illustrative).
 */
import { Vec3, eclipticToGalactic, LY_PER_AU, SUN_POS } from './coords'

export interface Elements { a: number; e: number; I: number; L: number; w: number; node: number }
export interface ElementSet { el: Elements; rate: Elements }

const E = (a: number, e: number, I: number, L: number, w: number, node: number): Elements => ({ a, e, I, L, w, node })

export const PLANET_ELEMENTS: Record<string, ElementSet> = {
  mercury: { el: E(0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593), rate: E(0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081) },
  venus: { el: E(0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255), rate: E(0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418) },
  earth: { el: E(1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0), rate: E(0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0) },
  mars: { el: E(1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891), rate: E(0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343) },
  jupiter: { el: E(5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909), rate: E(-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106) },
  saturn: { el: E(9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448), rate: E(-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794) },
  uranus: { el: E(19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503), rate: E(-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589) },
  neptune: { el: E(30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574), rate: E(0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664) },
}

const D2R = Math.PI / 180
export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0)
export const VALID_FROM = Date.UTC(1800, 0, 1)
export const VALID_TO = Date.UTC(2050, 11, 31)
export const MS_PER_DAY = 86400000

export function centuriesSinceJ2000(ms: number): number {
  return (ms - J2000_MS) / (MS_PER_DAY * 36525)
}

export function solveKepler(M: number, e: number): number {
  let Ea = e < 0.8 ? M : Math.PI
  for (let i = 0; i < 30; i++) {
    const d = (Ea - e * Math.sin(Ea) - M) / (1 - e * Math.cos(Ea))
    Ea -= d
    if (Math.abs(d) < 1e-12) break
  }
  return Ea
}

/** Heliocentric ecliptic J2000 position in AU. */
export function planetEclipticAU(name: string, ms: number): Vec3 {
  const s = PLANET_ELEMENTS[name]
  if (!s) throw new Error(`No elements for ${name}`)
  const T = centuriesSinceJ2000(ms)
  const a = s.el.a + s.rate.a * T
  const e = s.el.e + s.rate.e * T
  const I = (s.el.I + s.rate.I * T) * D2R
  const L = s.el.L + s.rate.L * T
  const w = s.el.w + s.rate.w * T // longitude of perihelion
  const node = (s.el.node + s.rate.node * T) * D2R
  const M = ((((L - w) % 360) + 540) % 360 - 180) * D2R
  const Ea = solveKepler(M, e)
  const xp = a * (Math.cos(Ea) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(Ea)
  const om = w * D2R - node // argument of perihelion
  const cw = Math.cos(om), sw = Math.sin(om), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(I), si = Math.sin(I)
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ]
}

/** Heliocentric position (galactic axes, ly) relative to the Sun. */
export function planetOffsetLy(name: string, ms: number): Vec3 {
  const p = eclipticToGalactic(planetEclipticAU(name, ms))
  return [p[0] * LY_PER_AU, p[1] * LY_PER_AU, p[2] * LY_PER_AU]
}

export function planetRootPos(name: string, ms: number): Vec3 {
  const o = planetOffsetLy(name, ms)
  return [SUN_POS[0] + o[0], SUN_POS[1] + o[1], SUN_POS[2] + o[2]]
}

/** Simplified Moon: circular orbit, 27.3217 d, inclined 5.145° to the ecliptic. displayAU may be exaggerated. */
export function moonOffsetLy(ms: number, displayAU: number): Vec3 {
  const ph = 2 * Math.PI * ((((ms - J2000_MS) / MS_PER_DAY) / 27.321661) % 1)
  const inc = 5.145 * D2R
  const ecl: Vec3 = [Math.cos(ph) * displayAU, Math.sin(ph) * Math.cos(inc) * displayAU, Math.sin(ph) * Math.sin(inc) * displayAU]
  const g = eclipticToGalactic(ecl)
  return [g[0] * LY_PER_AU, g[1] * LY_PER_AU, g[2] * LY_PER_AU]
}

/** Orbit polyline for one sidereal period, heliocentric galactic-axes ly. */
export function orbitPolylineLy(name: string, ms: number, n = 256): Vec3[] {
  const s = PLANET_ELEMENTS[name]
  const periodDays = 36525 / (s.rate.L / 360)
  const out: Vec3[] = []
  for (let i = 0; i <= n; i++) out.push(planetOffsetLy(name, ms + (i / n) * periodDays * MS_PER_DAY))
  return out
}

export function isModelRange(ms: number): boolean {
  return ms >= VALID_FROM && ms <= VALID_TO
}
