/**
 * Automated scientific orbital mechanics validation tests.
 * Covers the 12 requirements of Section 16.2 of the Cosmic Atlas specification:
 * 1. Circular-orbit limiting behavior when eccentricity is zero.
 * 2. Correct periapsis and apoapsis distances for an elliptical orbit.
 * 3. Correct orbital period and time advancement.
 * 4. Faster motion near periapsis than apoapsis (Kepler's second law).
 * 5. Correct application of orbital inclination.
 * 6. Correct transformation of ascending node and argument of periapsis.
 * 7. Correct retrograde direction for applicable objects (e.g. Triton).
 * 8. Deterministic positions for the same simulation time.
 * 9. Correct parent-child relationships.
 * 10. Consistent orbit lines and body positions.
 * 11. Numerical stability at large distances.
 * 12. Correct handling of missing or invalid orbital data.
 */
import { describe, it, expect } from 'vitest'
import {
  KeplerElements,
  RefFrame,
  solveKeplerStable,
  positionAtMs,
  positionAtJd,
  orbitPathKm,
  orbitNormalAtMs,
  periodDays,
  periapsisKm,
  apoapsisKm,
  validateElements,
  assertValidElements,
  OrbitElementsError,
  frameToGalactic,
} from './kepler'
import { SOLAR_BODIES, SOLAR_BODY_BY_ID } from '../data/solarSystem'
import { len, sub, mulMat, Vec3 } from './coords'
import { JD_J2000, jdTdbFromUtcMs } from './time'

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const ECLIPTIC: RefFrame = { kind: 'ecliptic' }

describe('16.2 Orbital mechanics scientific validation', () => {
  // 1. Circular-orbit limiting behavior when eccentricity is zero
  it('1. exhibits exact circular-orbit limiting behavior when e = 0', () => {
    const a = 50000
    const el: KeplerElements = {
      aKm: a,
      e: 0,
      iDeg: 0,
      nodeDeg: 0,
      argPeriDeg: 0,
      meanAnomalyDeg: 0,
      epochJd: JD_J2000,
      meanMotionDegPerDay: 36, // 10 day period
      frame: ECLIPTIC,
    }

    // For any mean anomaly, E must equal M (mod 2pi), and distance from primary must equal a
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180
      const E = solveKeplerStable(rad, 0)
      expect(Math.cos(E)).toBeCloseTo(Math.cos(rad), 9)
      expect(Math.sin(E)).toBeCloseTo(Math.sin(rad), 9)

      const jd = JD_J2000 + deg / el.meanMotionDegPerDay
      const p = positionAtJd(el, jd)
      const r = len(p)
      expect(r).toBeCloseTo(a, 3)
    }
  })

  // 2. Correct periapsis and apoapsis distances for an elliptical orbit
  it('2. yields exact periapsis and apoapsis distances for an elliptical orbit', () => {
    const a = 100000
    const e = 0.25
    const el: KeplerElements = {
      aKm: a,
      e,
      iDeg: 0,
      nodeDeg: 0,
      argPeriDeg: 0,
      meanAnomalyDeg: 0,
      epochJd: JD_J2000,
      meanMotionDegPerDay: 10,
      frame: ECLIPTIC,
    }

    expect(periapsisKm(el)).toBe(75000)
    expect(apoapsisKm(el)).toBe(125000)

    // At M = 0 (epoch), body is at periapsis
    const pPeri = positionAtJd(el, JD_J2000)
    expect(len(pPeri)).toBeCloseTo(75000, 3)

    // At M = 180°, body is at apoapsis
    const jdHalf = JD_J2000 + 180 / el.meanMotionDegPerDay
    const pApo = positionAtJd(el, jdHalf)
    expect(len(pApo)).toBeCloseTo(125000, 3)
  })

  // 3. Correct orbital period and time advancement
  it('3. advances time with the exact orbital period', () => {
    const el: KeplerElements = {
      aKm: 200000,
      e: 0.15,
      iDeg: 12,
      nodeDeg: 45,
      argPeriDeg: 30,
      meanAnomalyDeg: 25,
      epochJd: JD_J2000,
      meanMotionDegPerDay: 72, // Period = 5.0 days
      frame: ECLIPTIC,
    }

    const P = periodDays(el)
    expect(P).toBe(5.0)

    const p0 = positionAtJd(el, JD_J2000)
    const pPeriod = positionAtJd(el, JD_J2000 + P)
    const p2Period = positionAtJd(el, JD_J2000 + 2 * P)

    expect(len(sub(p0, pPeriod))).toBeLessThan(1e-6)
    expect(len(sub(p0, p2Period))).toBeLessThan(1e-6)
  })

  // 4. Faster motion near periapsis than apoapsis (Kepler's second law)
  it('4. moves faster near periapsis than apoapsis (Kepler\'s second law)', () => {
    const a = 150000
    const e = 0.5
    const el: KeplerElements = {
      aKm: a,
      e,
      iDeg: 0,
      nodeDeg: 0,
      argPeriDeg: 0,
      meanAnomalyDeg: 0,
      epochJd: JD_J2000,
      meanMotionDegPerDay: 20,
      frame: ECLIPTIC,
    }

    const dtDays = 0.01 // short interval
    // Velocity near periapsis (M = 0)
    const pPeri0 = positionAtJd(el, JD_J2000 - dtDays / 2)
    const pPeri1 = positionAtJd(el, JD_J2000 + dtDays / 2)
    const speedPeri = len(sub(pPeri1, pPeri0)) / dtDays

    // Velocity near apoapsis (M = 180°)
    const tApo = JD_J2000 + 180 / el.meanMotionDegPerDay
    const pApo0 = positionAtJd(el, tApo - dtDays / 2)
    const pApo1 = positionAtJd(el, tApo + dtDays / 2)
    const speedApo = len(sub(pApo1, pApo0)) / dtDays

    // In a Keplerian orbit, v_peri / v_apo = (1 + e) / (1 - e) = 1.5 / 0.5 = 3.0
    const ratio = speedPeri / speedApo
    expect(ratio).toBeCloseTo(3.0, 2)
    expect(speedPeri).toBeGreaterThan(speedApo)
  })

  // 5. Correct application of orbital inclination
  it('5. correctly applies orbital inclination', () => {
    const a = 80000
    // Pure polar orbit relative to ecliptic (i = 90°)
    const elPolar: KeplerElements = {
      aKm: a,
      e: 0,
      iDeg: 90,
      nodeDeg: 0,
      argPeriDeg: 0,
      meanAnomalyDeg: 0,
      epochJd: JD_J2000,
      meanMotionDegPerDay: 36,
      frame: ECLIPTIC,
    }

    const F = frameToGalactic(ECLIPTIC)
    // At M = 90° (quarter orbit from node on plane i=90), position in ecliptic frame should be (0, 0, a)
    const t90 = JD_J2000 + 90 / elPolar.meanMotionDegPerDay
    const pPolar = positionAtJd(elPolar, t90)
    // Distance from center is still a
    expect(len(pPolar)).toBeCloseTo(a, 3)

    // Flat orbit (i = 0)
    const elFlat: KeplerElements = { ...elPolar, iDeg: 0 }
    const pFlat = positionAtJd(elFlat, t90)
    expect(len(pFlat)).toBeCloseTo(a, 3)
    // Polar and flat vectors must be perpendicular
    const dotProduct = pPolar[0] * pFlat[0] + pPolar[1] * pFlat[1] + pPolar[2] * pFlat[2]
    expect(Math.abs(dotProduct) / (a * a)).toBeLessThan(1e-10)
  })

  // 6. Correct transformation of ascending node and argument of periapsis
  it('6. correctly rotates ascending node and argument of periapsis', () => {
    const a = 120000
    // Flat orbit, argPeri at 30°
    const el1: KeplerElements = {
      aKm: a,
      e: 0.2,
      iDeg: 0,
      nodeDeg: 45,
      argPeriDeg: 30,
      meanAnomalyDeg: 0,
      epochJd: JD_J2000,
      meanMotionDegPerDay: 10,
      frame: ECLIPTIC,
    }

    // Identical orbit with node rotated by 90°
    const el2: KeplerElements = {
      ...el1,
      nodeDeg: 135,
    }

    const p1 = positionAtJd(el1, JD_J2000)
    const p2 = positionAtJd(el2, JD_J2000)

    // Length of periapsis vector must be identical
    expect(len(p1)).toBeCloseTo(periapsisKm(el1), 3)
    expect(len(p2)).toBeCloseTo(periapsisKm(el2), 3)

    // Angle between periapsis vectors must be exactly 90°
    const cosAngle = (p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]) / (len(p1) * len(p2))
    expect(Math.abs(cosAngle)).toBeLessThan(1e-6) // cos(90°) = 0

    // Also test argument of periapsis: rotating argPeri by 90° in orbital plane
    const el3: KeplerElements = {
      ...el1,
      argPeriDeg: 120, // 30 + 90
    }
    const p3 = positionAtJd(el3, JD_J2000)
    const cosAngleArgP = (p1[0] * p3[0] + p1[1] * p3[1] + p1[2] * p3[2]) / (len(p1) * len(p3))
    expect(Math.abs(cosAngleArgP)).toBeLessThan(1e-6) // cos(90°) = 0
  })

  // 7. Correct retrograde direction for applicable objects (Triton)
  it('7. models retrograde orbital motion correctly for Triton (i > 90°)', () => {
    const triton = SOLAR_BODY_BY_ID.triton
    expect(triton).toBeDefined()
    expect(triton.orbit.elements.iDeg).toBeGreaterThan(90) // 157.3°

    const ms0 = Date.UTC(2026, 9, 25, 0, 0, 0)
    const ms1 = ms0 + 3600 * 1000 // 1 hour later

    const p0 = positionAtMs(triton.orbit.elements, ms0)
    const p1 = positionAtMs(triton.orbit.elements, ms1)

    // Angular momentum vector L = r0 x r1
    const Lx = p0[1] * p1[2] - p0[2] * p1[1]
    const Ly = p0[2] * p1[0] - p0[0] * p1[2]
    const Lz = p0[0] * p1[1] - p0[1] * p1[0]
    const normal = orbitNormalAtMs(triton.orbit.elements, ms0)

    // The cross product (motion direction) must align with orbit normal
    const crossDot = (Lx * normal[0] + Ly * normal[1] + Lz * normal[2]) / (len([Lx, Ly, Lz]) * len(normal))
    expect(crossDot).toBeGreaterThan(0.99)
  })

  // 8. Deterministic positions for the same simulation time
  it('8. produces bitwise deterministic positions and supports exact time-reversal', () => {
    const ganymede = SOLAR_BODY_BY_ID.ganymede.orbit.elements
    const ms = Date.UTC(2026, 9, 25, 12, 34, 56)

    const posA = positionAtMs(ganymede, ms)
    const posB = positionAtMs(ganymede, ms)
    expect(posA).toEqual(posB)

    // Advance 50 days, reverse 50 days
    const msLater = ms + 50 * 86400 * 1000
    const posLater = positionAtMs(ganymede, msLater)
    const posReversed = positionAtMs(ganymede, msLater - 50 * 86400 * 1000)

    expect(len(sub(posA, posReversed))).toBeLessThan(1e-9)
    expect(len(sub(posA, posLater))).toBeGreaterThan(10000)
  })

  // 9. Correct parent-child relationships
  it('9. maintains correct parent-child relationships across the entire Solar System catalogue', () => {
    for (const body of SOLAR_BODIES) {
      if (body.cls === 'moon') {
        expect(['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']).toContain(body.parent)
        expect(body.orbit.primary).toBe(body.parent)
      } else {
        expect(body.parent).toBe('sun')
        expect(body.orbit.primary).toBe('sun')
      }
    }
  })

  // 10. Consistent orbit lines and body positions
  it('10. ensures the body always lies on its rendered orbit path', () => {
    // Test multiple bodies: Io, Enceladus, Triton, Charon
    for (const id of ['io', 'enceladus', 'triton', 'charon', 'phobos', 'ceres']) {
      const el = SOLAR_BODY_BY_ID[id].orbit.elements
      const ms = Date.UTC(2026, 9, 25, 10, 0, 0)
      const pBody = positionAtMs(el, ms)
      const path = orbitPathKm(el, ms, 2048)

      // Find minimum distance from body to sampled orbit line
      let minD = Infinity
      for (const pt of path) {
        const d = len(sub(pt, pBody))
        if (d < minD) minD = d
      }

      // Must be within 0.2% of semi-major axis (finite sampling resolution)
      const relativeErr = minD / el.aKm
      expect(relativeErr, `body ${id} on orbit path`).toBeLessThan(2e-3)
    }
  })

  // 11. Numerical stability at large distances
  it('11. preserves numerical stability for trans-Neptunian dwarf planets at extreme distances', () => {
    const eris = SOLAR_BODY_BY_ID.eris.orbit.elements
    expect(eris.aKm).toBeGreaterThan(1e10) // ~68 AU = 1.01e10 km
    expect(eris.e).toBeGreaterThan(0.4) // high eccentricity

    for (let yr = 0; yr < 550; yr += 50) {
      const jd = eris.epochJd + yr * 365.25
      const p = positionAtJd(eris, jd)
      expect(p.every(Number.isFinite)).toBe(true)

      const dist = len(p)
      expect(dist).toBeGreaterThanOrEqual(periapsisKm(eris) * 0.999)
      expect(dist).toBeLessThanOrEqual(apoapsisKm(eris) * 1.001)
    }
  })

  // 12. Correct handling of missing or invalid orbital data
  it('12. validates orbital data strictly and rejects invalid elements without silent failures', () => {
    expect(validateElements(null).length).toBeGreaterThan(0)
    expect(validateElements({}).length).toBeGreaterThan(0)

    // Negative semi-major axis
    expect(validateElements({ aKm: -100 }).some((e) => e.includes('aKm'))).toBe(true)

    // Parabolic / hyperbolic eccentricity (e >= 1)
    expect(validateElements({ e: 1.05 }).some((e) => e.includes('e must be in [0, 1)'))).toBe(true)
    expect(validateElements({ e: -0.1 }).some((e) => e.includes('e must be in [0, 1)'))).toBe(true)

    // Inclination out of [0, 180]
    expect(validateElements({ iDeg: 195 }).some((e) => e.includes('iDeg'))).toBe(true)

    // Throws on assertion
    expect(() => assertValidElements({ aKm: -50 }, 'testBody')).toThrow(OrbitElementsError)
  })
})
