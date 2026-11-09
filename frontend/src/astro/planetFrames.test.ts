import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  PLANETS, planetOrientation, PRIME_MERIDIAN, primeMeridianRad, URANUS_RINGS, NEPTUNE_RINGS, ringUniforms,
  NEPTUNE_MAP_SPOTS, spotVisibility, ADAMS_ARCS, arcTau,
} from './planetFrames'
import { eclipticToGalactic, toThree } from './coords'
import { frameToGalactic } from './kepler'
import { SOLAR_BODY_BY_ID } from '../data/solarSystem'

const D2R = Math.PI / 180
const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
/** Orbit normal (ecliptic J2000) from inclination and node, mapped to three.js scene axes. */
const orbitNormal = (iDeg: number, nodeDeg: number) =>
  v3(toThree(eclipticToGalactic([Math.sin(iDeg * D2R) * Math.sin(nodeDeg * D2R), -Math.sin(iDeg * D2R) * Math.cos(nodeDeg * D2R), Math.cos(iDeg * D2R)])))
const poleOf = (id: (typeof PLANETS)[number]) => new THREE.Vector3(0, 1, 0).applyQuaternion(planetOrientation(id))

// J2000 orbital i, node (Standish/JPL approximate elements) and the NASA fact-sheet angle between the IAU north pole
// and the orbit normal: 'obliquity to orbit', or for the retrograde rotators (Venus, Uranus) 180 deg minus it
// ('inclination of equator' 2.64 / 82.23 deg) - the IAU north pole lies 180 deg from their spin vector.
const CASES: [(typeof PLANETS)[number], number, number, number][] = [
  ['mercury', 7.005, 48.331, 0.034], ['venus', 3.395, 76.68, 180 - 177.36], ['earth', 0, 0, 23.44], ['mars', 1.85, 49.558, 25.19],
  ['jupiter', 1.304, 100.464, 3.13], ['saturn', 2.486, 113.666, 26.73], ['uranus', 0.773, 74.017, 180 - 97.77], ['neptune', 1.77, 131.784, 28.32],
]

describe('planet body frames (IAU poles)', () => {
  it.each(CASES)('%s pole tilt to its orbit matches the NASA fact sheet', (id, i, node, obliquity) => {
    const deg = poleOf(id).angleTo(orbitNormal(i, node)) / D2R
    expect(Math.abs(deg - obliquity)).toBeLessThan(0.35)
  })

  it('orientation is a proper rotation for every planet', () => {
    for (const id of PLANETS) {
      const m = new THREE.Matrix4().makeRotationFromQuaternion(planetOrientation(id))
      expect(m.determinant()).toBeCloseTo(1, 9)
    }
  })

  it('Uranus moons orbit in the plane of the rendered Uranian equator (same frame as the rings)', () => {
    const f = SOLAR_BODY_BY_ID['ariel'].orbit.elements.frame
    const m = frameToGalactic(f)
    const moonPole = v3(toThree([m[0][2], m[1][2], m[2][2]]))
    // the satellite frame uses the angular-momentum pole (opposite to the IAU north pole): same plane
    expect(Math.abs(moonPole.dot(poleOf('uranus')))).toBeGreaterThan(0.99999)
  })

  it('sidereal rotation periods follow from the IAU W rates', () => {
    const hours = (id: (typeof PLANETS)[number]) => (360 / Math.abs(PRIME_MERIDIAN[id].Wdot)) * 24
    expect(hours('earth')).toBeCloseTo(23.934, 2)
    expect(hours('jupiter')).toBeCloseTo(9.925, 2)
    expect(hours('saturn')).toBeCloseTo(10.656, 2)
    expect(hours('uranus')).toBeCloseTo(17.24, 2)
    expect(hours('neptune')).toBeCloseTo(16.11, 2)
    expect(PRIME_MERIDIAN.uranus.Wdot).toBeLessThan(0) // retrograde about the IAU north pole
    expect(PRIME_MERIDIAN.venus.Wdot).toBeLessThan(0)
    // W advances by exactly one turn per sidereal day
    const day = 360 / PRIME_MERIDIAN.earth.Wdot
    expect(Math.abs(primeMeridianRad('earth', 2451545 + 10 * day) - primeMeridianRad('earth', 2451545))).toBeLessThan(1e-6)
  })
})

describe('ring systems', () => {
  it('Uranian rings are at the NSSDCA radii in planet-radius units, in order, non-overlapping', () => {
    const u = ringUniforms(URANUS_RINGS, 25362)
    const eps = URANUS_RINGS.findIndex((r) => r.name === 'Epsilon')
    expect((u[eps].x + u[eps].y) / 2).toBeCloseTo(51149 / 25362, 6)
    for (let i = 1; i < URANUS_RINGS.length; i++) expect(u[i].x).toBeGreaterThan(u[i - 1].y)
    expect(URANUS_RINGS.filter((r) => r.kind === 'main')).toHaveLength(10)
  })

  it('Neptune keeps its own ring set (not the Uranian one) with the Adams ring outermost', () => {
    expect(NEPTUNE_RINGS.map((r) => r.name)).toEqual(['Galle', 'Le Verrier', 'Lassell', 'Arago', 'Adams'])
    expect(Math.max(...NEPTUNE_RINGS.map((r) => r.radiusKm))).toBe(62933)
  })

  it('Liberté and Courage arcs fade after 2003; Fraternité does not', () => {
    const lib = ADAMS_ARCS.find((a) => a.name === 'Liberté')!
    const fra = ADAMS_ARCS.find((a) => a.name === 'Fraternité')!
    expect(arcTau(lib, 1989)).toBe(0.12)
    expect(arcTau(lib, 2020)).toBeCloseTo(0.012, 6)
    expect(arcTau(fra, 2020)).toBe(0.12)
  })
})

describe('Neptune transient storms are tied to their observation epoch', () => {
  const gds = NEPTUNE_MAP_SPOTS[0]
  it('the Great Dark Spot shows during the Voyager era only', () => {
    expect(spotVisibility(gds, 1989.6)).toBe(1)
    expect(spotVisibility(gds, 2026.9)).toBe(0)
    expect(spotVisibility(gds, 1988.0)).toBe(0)
  })
  it('the unsourced oval baked into the map is always hidden', () => {
    expect(spotVisibility(NEPTUNE_MAP_SPOTS[2], 1989.6)).toBe(0)
  })
})
