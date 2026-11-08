/**
 * Shared two-body (Keplerian) orbital engine used by every moon, dwarf planet and asteroid.
 *
 * Pipeline for a body at simulation time t (UTC ms):
 *   1. t -> JD(TDB); Δd = JD - epoch (days)
 *   2. secularly precessing angles: Ω(t) = Ω0 + Ω̇Δd, ω(t) = ω0 + ω̇Δd, M(t) = M0 + ṀΔd
 *   3. Kepler's equation M = E - e sin E (Newton, bisection fallback)
 *   4. orbital-plane position (a(cos E - e), a√(1-e²) sin E, 0)
 *   5. rotation Rz(Ω)·Rx(i)·Rz(ω) into the element reference frame (ecliptic, Laplace plane, planet equator)
 *   6. reference frame -> ICRF equatorial -> galactic axes (the root frame's axes)
 * Orbit polylines go through exactly the same steps 4–6 (see orbitPathKm), so a body always lies on its drawn orbit.
 *
 * These are MEAN or OSCULATING elements with secular precession only. They are not an ephemeris: short-period
 * perturbations, resonances and (for heliocentric bodies) planetary perturbations are ignored. See
 * docs/ORBITAL_MECHANICS.md and docs/SOLAR_SYSTEM_VALIDATION.md for the measured errors against JPL Horizons.
 */
import { Vec3, EQ_TO_GAL, OBLIQUITY_J2000_DEG, mulMat } from './coords'
import { jdTdbFromUtcMs } from './time'

const D2R = Math.PI / 180
const TAU = Math.PI * 2
export const KM_PER_AU = 149597870.7
export const DAYS_PER_JULIAN_YEAR = 365.25

export type RefFrame =
  /** Mean ecliptic and equinox of J2000 (node measured from the vernal equinox). */
  | { kind: 'ecliptic' }
  /** A plane given by its pole in ICRF (Laplace plane or a planet's equator). Node measured from the plane's ascending node on the ICRF equator. */
  | { kind: 'pole'; raDeg: number; decDeg: number; label: 'Laplace plane' | 'planet equator' }

export interface KeplerElements {
  /** semi-major axis, km */
  aKm: number
  e: number
  iDeg: number
  /** longitude of ascending node Ω at epoch */
  nodeDeg: number
  /** argument of periapsis ω at epoch */
  argPeriDeg: number
  /** mean anomaly at epoch */
  meanAnomalyDeg: number
  /** epoch, Julian Date TDB */
  epochJd: number
  /** rate of the mean anomaly, deg/day */
  meanMotionDegPerDay: number
  /** secular rate of ω, deg/day (0 if not modelled) */
  argPeriRateDegPerDay?: number
  /** secular rate of Ω, deg/day (0 if not modelled) */
  nodeRateDegPerDay?: number
  frame: RefFrame
}

export class OrbitElementsError extends Error {}

/** Returns a list of problems (empty when the elements are usable). Never guesses missing values. */
export function validateElements(el: Partial<KeplerElements> | null | undefined): string[] {
  if (!el) return ['elements missing']
  const errs: string[] = []
  const finite = (k: keyof KeplerElements) => {
    const v = el[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${String(k)} missing or not finite`)
  }
  ;(['aKm', 'e', 'iDeg', 'nodeDeg', 'argPeriDeg', 'meanAnomalyDeg', 'epochJd', 'meanMotionDegPerDay'] as const).forEach(finite)
  if (typeof el.aKm === 'number' && !(el.aKm > 0)) errs.push('aKm must be > 0')
  if (typeof el.e === 'number' && !(el.e >= 0 && el.e < 1)) errs.push('e must be in [0, 1) (closed orbits only)')
  if (typeof el.iDeg === 'number' && !(el.iDeg >= 0 && el.iDeg <= 180)) errs.push('iDeg must be in [0, 180]')
  if (typeof el.meanMotionDegPerDay === 'number' && !(el.meanMotionDegPerDay > 0)) errs.push('mean motion must be > 0')
  for (const k of ['argPeriRateDegPerDay', 'nodeRateDegPerDay'] as const) {
    const v = el[k]
    if (v !== undefined && !Number.isFinite(v)) errs.push(`${k} not finite`)
  }
  if (!el.frame || (el.frame.kind !== 'ecliptic' && el.frame.kind !== 'pole')) errs.push('frame missing')
  else if (el.frame.kind === 'pole' && !(Number.isFinite(el.frame.raDeg) && Number.isFinite(el.frame.decDeg))) errs.push('frame pole not finite')
  return errs
}

export function assertValidElements(el: Partial<KeplerElements> | null | undefined, who = 'body'): asserts el is KeplerElements {
  const errs = validateElements(el)
  if (errs.length) throw new OrbitElementsError(`${who}: invalid orbital elements: ${errs.join('; ')}`)
}

/** Wrap to (-π, π]. */
function wrapPi(x: number): number {
  const y = ((x + Math.PI) % TAU + TAU) % TAU - Math.PI
  return y === -Math.PI ? Math.PI : y
}

/**
 * Solve Kepler's equation M = E - e sin E for elliptic orbits (0 <= e < 1).
 * Newton–Raphson from a robust starting guess; if it fails to converge (only possible for e very close to 1)
 * falls back to bisection, which always converges because f(E) = E - e sin E - M is monotonic.
 */
export function solveKeplerStable(Mrad: number, e: number): number {
  if (!(e >= 0 && e < 1)) throw new OrbitElementsError(`eccentricity ${e} outside [0,1)`)
  const M = wrapPi(Mrad)
  if (e === 0) return M
  let E = e < 0.8 ? M + e * Math.sin(M) : M >= 0 ? Math.PI : -Math.PI
  for (let k = 0; k < 50; k++) {
    const f = E - e * Math.sin(E) - M
    const d = f / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-14) return E
  }
  let lo = -Math.PI, hi = Math.PI
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi)
    if (mid - e * Math.sin(mid) - M > 0) hi = mid
    else lo = mid
  }
  return 0.5 * (lo + hi)
}

const frameCache = new WeakMap<RefFrame, number[][]>()

/** 3×3 matrix taking a vector in the element reference frame to galactic (root-frame) axes. */
export function frameToGalactic(frame: RefFrame): number[][] {
  const hit = frameCache.get(frame)
  if (hit) return hit
  let toEq: number[][]
  if (frame.kind === 'ecliptic') {
    const ep = OBLIQUITY_J2000_DEG * D2R, c = Math.cos(ep), s = Math.sin(ep)
    toEq = [[1, 0, 0], [0, c, -s], [0, s, c]]
  } else {
    const a = frame.raDeg * D2R, d = frame.decDeg * D2R
    const p: Vec3 = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
    const n: Vec3 = [-Math.sin(a), Math.cos(a), 0] // ascending node of the plane on the ICRF equator
    const y: Vec3 = [p[1] * n[2] - p[2] * n[1], p[2] * n[0] - p[0] * n[2], p[0] * n[1] - p[1] * n[0]]
    toEq = [[n[0], y[0], p[0]], [n[1], y[1], p[1]], [n[2], y[2], p[2]]]
  }
  const m = [0, 1, 2].map((r) => [0, 1, 2].map((c) => EQ_TO_GAL[r][0] * toEq[0][c] + EQ_TO_GAL[r][1] * toEq[1][c] + EQ_TO_GAL[r][2] * toEq[2][c]))
  frameCache.set(frame, m)
  return m
}

/** Angles (radians) at a given JD, including secular precession. */
export function anglesAt(el: KeplerElements, jd: number): { node: number; argp: number; M: number; i: number } {
  const dd = jd - el.epochJd
  return {
    node: (el.nodeDeg + (el.nodeRateDegPerDay ?? 0) * dd) * D2R,
    argp: (el.argPeriDeg + (el.argPeriRateDegPerDay ?? 0) * dd) * D2R,
    M: (el.meanAnomalyDeg + el.meanMotionDegPerDay * dd) * D2R,
    i: el.iDeg * D2R,
  }
}

/** Orbital-plane coordinates (periapsis along +x) for eccentric anomaly E. */
function planeFromE(aKm: number, e: number, E: number): [number, number] {
  return [aKm * (Math.cos(E) - e), aKm * Math.sqrt(1 - e * e) * Math.sin(E)]
}

/** Orbital plane -> element reference frame -> galactic axes. Shared by bodies and orbit lines. */
function planeToGalactic(x: number, y: number, ang: { node: number; argp: number; i: number }, F: number[][]): Vec3 {
  const cw = Math.cos(ang.argp), sw = Math.sin(ang.argp), cn = Math.cos(ang.node), sn = Math.sin(ang.node), ci = Math.cos(ang.i), si = Math.sin(ang.i)
  const ref: Vec3 = [
    (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y,
    (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y,
    sw * si * x + cw * si * y,
  ]
  return mulMat(F, ref)
}

/** Position relative to the primary (km, galactic axes) at Julian Date jd (TDB). */
export function positionAtJd(el: KeplerElements, jd: number): Vec3 {
  const ang = anglesAt(el, jd)
  const E = solveKeplerStable(ang.M, el.e)
  const [x, y] = planeFromE(el.aKm, el.e, E)
  return planeToGalactic(x, y, ang, frameToGalactic(el.frame))
}

/** Position relative to the primary (km, galactic axes) at a UTC millisecond timestamp. Deterministic. */
export function positionAtMs(el: KeplerElements, ms: number): Vec3 {
  return positionAtJd(el, jdTdbFromUtcMs(ms))
}

/** Unit orbit normal (angular-momentum direction) in galactic axes at the given time. */
export function orbitNormalAtMs(el: KeplerElements, ms: number): Vec3 {
  const ang = anglesAt(el, jdTdbFromUtcMs(ms))
  const ci = Math.cos(ang.i), si = Math.sin(ang.i), cn = Math.cos(ang.node), sn = Math.sin(ang.node)
  return mulMat(frameToGalactic(el.frame), [si * sn, -si * cn, ci])
}

/**
 * Closed orbit polyline (km, galactic axes, relative to the primary) using the orientation at time ms.
 * Samples are uniform in eccentric anomaly (denser near periapsis in true anomaly, as needed for high e).
 */
export function orbitPathKm(el: KeplerElements, ms: number, n = 256): Vec3[] {
  const ang = anglesAt(el, jdTdbFromUtcMs(ms))
  const F = frameToGalactic(el.frame)
  const out: Vec3[] = []
  for (let k = 0; k <= n; k++) {
    const [x, y] = planeFromE(el.aKm, el.e, (k / n) * TAU)
    out.push(planeToGalactic(x, y, ang, F))
  }
  return out
}

export function periodDays(el: KeplerElements): number {
  return 360 / el.meanMotionDegPerDay
}
export function periapsisKm(el: KeplerElements): number {
  return el.aKm * (1 - el.e)
}
export function apoapsisKm(el: KeplerElements): number {
  return el.aKm * (1 + el.e)
}

/**
 * Convert a row of the JPL SSD "Planetary Satellite Mean Elements" table to engine rates.
 * JPL lists the sidereal period P and the precession periods of ω (Papsis) and Ω (Pnode), in years.
 * Sign convention (lowest-order secular theory, verified against Horizons in SOLAR_SYSTEM_VALIDATION.md):
 * ω advances; Ω regresses for prograde orbits (i < 90°) and advances for retrograde ones (i > 90°).
 * The sidereal rate is that of the mean longitude λ = Ω ± (ω + M), hence Ṁ = 360/P − ω̇ + |Ω̇|.
 */
export function jplSatelliteRates(row: { iDeg: number; periodDays: number; apsisPeriodYr?: number | null; nodePeriodYr?: number | null }): {
  meanMotionDegPerDay: number; argPeriRateDegPerDay: number; nodeRateDegPerDay: number
} {
  const argRate = row.apsisPeriodYr ? 360 / (row.apsisPeriodYr * DAYS_PER_JULIAN_YEAR) : 0
  const nodeMag = row.nodePeriodYr ? 360 / (row.nodePeriodYr * DAYS_PER_JULIAN_YEAR) : 0
  const retro = row.iDeg > 90
  return {
    meanMotionDegPerDay: 360 / row.periodDays - argRate + nodeMag,
    argPeriRateDegPerDay: argRate,
    nodeRateDegPerDay: retro ? nodeMag : -nodeMag,
  }
}
