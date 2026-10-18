/**
 * Coordinate frames and transforms.
 *
 * ROOT FRAME ("galactic cartesian, ly"): origin = Galactic Centre, axes follow the IAU galactic system
 * seen from the Sun: +X toward the Galactic Centre direction (l=0,b=0), +Y toward l=90°, +Z toward the
 * North Galactic Pole. The Sun sits at (-SUN_GC_LY, 0, 0). Units: light-years, double precision.
 *
 * RENDER FRAME (three.js, Y-up): (x, y, z)_three = (X, Z, -Y)_galactic. Only used at draw time, camera-relative.
 */
export type Vec3 = [number, number, number]

export const LY_PER_PC = 3.2615637771674337
export const LY_PER_AU = 1.5812507409819728e-5
export const SUN_GC_LY = 26673 // GRAVITY Collaboration 2019: 8.178 kpc
export const SUN_POS: Vec3 = [-SUN_GC_LY, 0, 0]
export const C_KM_S = 299792.458

const D2R = Math.PI / 180

// J2000 equatorial (ICRS) -> galactic rotation matrix (Hipparcos documentation, ESA 1997).
export const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
]

export const OBLIQUITY_J2000_DEG = 23.4392911

export function mulMat(m: number[][], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
}

/** Unit vector (equatorial J2000) for RA/Dec in degrees. */
export function raDecToUnit(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * D2R
  const d = decDeg * D2R
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
}

export function equatorialToGalactic(v: Vec3): Vec3 {
  return mulMat(EQ_TO_GAL, v)
}

export function galacticLBToUnit(lDeg: number, bDeg: number): Vec3 {
  const l = lDeg * D2R
  const b = bDeg * D2R
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]
}

export function unitToGalacticLB(v: Vec3): { l: number; b: number } {
  const l = ((Math.atan2(v[1], v[0]) / D2R) + 360) % 360
  const b = Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R
  return { l, b }
}

/** Heliocentric direction+distance -> root-frame position (ly). */
export function sunRelativeToRoot(unitGal: Vec3, distanceLy: number): Vec3 {
  return [SUN_POS[0] + unitGal[0] * distanceLy, SUN_POS[1] + unitGal[1] * distanceLy, SUN_POS[2] + unitGal[2] * distanceLy]
}

export function raDecDistToRoot(raDeg: number, decDeg: number, distanceLy: number): Vec3 {
  return sunRelativeToRoot(equatorialToGalactic(raDecToUnit(raDeg, decDeg)), distanceLy)
}

/** Ecliptic J2000 vector -> galactic vector (same origin). */
export function eclipticToGalactic(v: Vec3): Vec3 {
  const e = OBLIQUITY_J2000_DEG * D2R
  const eq: Vec3 = [v[0], v[1] * Math.cos(e) - v[2] * Math.sin(e), v[1] * Math.sin(e) + v[2] * Math.cos(e)]
  return equatorialToGalactic(eq)
}

/** Root (galactic) -> three.js axes. */
export function toThree(v: Vec3): Vec3 {
  return [v[0], v[2], -v[1]]
}
export function fromThree(v: Vec3): Vec3 {
  return [v[0], -v[2], v[1]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
export function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}
export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

/** "05 55 10.3" / "05:55:10.3" / "5h55m10.3s" / decimal -> degrees. isRA => hours*15. */
export function parseSexagesimal(input: string | number, isRA: boolean): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const s = String(input).trim()
  if (!s) return null
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const cleaned = s.replace(/[hdms°:'"]/gi, ' ').replace(/[′″]/g, ' ').trim()
  const parts = cleaned.split(/\s+/).map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p))) return null
  const sign = s.startsWith('-') ? -1 : 1
  const v = Math.abs(parts[0]) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600
  return isRA ? v * 15 : sign * v
}

const TO_LY: Record<string, number> = {
  ly: 1, kly: 1e3, mly: 1e6, gly: 1e9,
  pc: LY_PER_PC, kpc: LY_PER_PC * 1e3, mpc: LY_PER_PC * 1e6, gpc: LY_PER_PC * 1e9,
  au: LY_PER_AU, km: 1.0570008340246154e-13,
}
/** Convert a distance to light-years. Throws on unknown units (never guesses). */
export function toLightYears(value: number, unit: string): number {
  const k = TO_LY[unit.trim().toLowerCase()]
  if (k === undefined) throw new Error(`Unknown distance unit: ${unit}`)
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid distance: ${value}`)
  return value * k
}

export function formatDistance(ly: number): string {
  const a = Math.abs(ly)
  if (a >= 9.995e8) {
    const v = ly / 1e9
    return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} Gly`
  }
  if (a >= 9.995e5) {
    const v = ly / 1e6
    return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} Mly`
  }
  if (a >= 9.995e3) {
    const v = ly / 1e3
    return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} kly`
  }
  if (a >= 1) {
    return `${ly >= 10 ? ly.toFixed(1) : ly.toFixed(2)} ly`
  }
  const au = ly / LY_PER_AU
  if (au >= 0.01) {
    return `${au >= 10 ? au.toFixed(1) : au.toFixed(3)} AU`
  }
  const km = au * 149597870.7
  return `${Math.round(km).toLocaleString()} km`
}
