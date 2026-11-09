/**
 * Navigation continuity regression tests (Travel Mode / warp-flight overhaul).
 * Every journey must depart from the ACTUAL current position and arrive at the target's framing position; a
 * cancelled flight must hold position and the next journey must start there; entering Travel Mode must not move
 * the view; destination requests in Travel Mode must be flown by the spacecraft.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { travelEngineState, initiateTravel, cancelTravel, stepTravel, travelSettings } from './travelEngine'
import { flightPose, slerpUnit, lookAtTargetQuat, ORIENT_FRACTION } from './flightPath'
import { nav } from '../store/nav'
import { useStore } from '../store/store'
import { ship } from './shipState'
import { BY_ID, positionOf } from '../data/catalog'
import { len, sub, add, fromThree, Vec3, LY_PER_AU, SUN_POS } from '../astro/coords'

const MS = Date.UTC(2026, 10, 9)
const km = 1 / 9.4607304725808e12 // ly per km

function flyUntilArrived(maxSteps = 2000) {
  for (let i = 0; i < maxSteps && travelEngineState.phase === 'traveling'; i++) stepTravel(1 / 60, MS)
}
const dist = (a: Vec3, b: Vec3) => len(sub(a, b))

beforeEach(() => {
  cancelTravel()
  travelEngineState.phase = 'idle'
  nav.flight = null
  nav.followId = null
  nav.lastFollowPos = null
  nav.quat.identity()
  travelSettings.speed = 1
  useStore.setState({ phase: 'explore', simMs: MS })
})

describe('flight path geometry', () => {
  it('slerps (anti)parallel directions without collapsing to zero', () => {
    const a = new THREE.Vector3(1, 0, 0)
    for (const b of [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 1e-9, 0).normalize()]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const v = slerpUnit(a, b, t)
        expect(v.length()).toBeCloseTo(1, 9)
        expect(Number.isFinite(v.x + v.y + v.z)).toBe(true)
      }
      expect(slerpUnit(a, b, 1).distanceTo(b)).toBeLessThan(1e-6)
    }
  })

  it('pose at t = 0 is the departure position and orientation; the heading turns smoothly, no snap', () => {
    const P: Vec3 = [-26673, 1e-5, 2e-5]
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 2.1, -0.4))
    const f = { dir0: new THREE.Vector3(0, 0, 1), dir1: new THREE.Vector3(1, 0.3, 0).normalize(), d0: 2e-5, d1: 4e-9, q0 }
    const p0 = flightPose(f, P, 0)
    expect(dist(p0.pos, add(P, fromThree([0, 0, 2e-5])))).toBeLessThan(1e-14) // three.js +Z offset, galactic axes
    expect(p0.quat.angleTo(q0)).toBeLessThan(1e-6) // acos resolution near 1 is ~1e-8 rad
    // the orientation changes continuously: no frame-to-frame jump above 0.1 rad at 60 fps over a 3 s flight
    let prev = p0.quat
    for (let i = 1; i <= 180; i++) {
      const q = flightPose(f, P, i / 180).quat
      expect(q.angleTo(prev)).toBeLessThan(0.1)
      prev = q
    }
    // after the turn phase the camera looks at the target
    const late = flightPose(f, P, ORIENT_FRACTION + 0.01)
    expect(late.quat.angleTo(lookAtTargetQuat(late.dir))).toBeLessThan(1e-6)
  })
})

describe('warp flights depart from the current position (no common start point)', () => {
  it('Earth → Moon → Mars → Phobos → Jupiter → Europa → Saturn → Titan → Neptune: each leg starts at the previous arrival', () => {
    // start at Earth's viewing position
    initiateTravel('earth', MS, { instant: true })
    const legs = ['moon', 'mars', 'phobos', 'jupiter', 'europa', 'saturn', 'titan', 'neptune']
    for (const id of legs) {
      const before: Vec3 = [...nav.pos]
      initiateTravel(id, MS)
      expect(travelEngineState.phase).toBe('traveling')
      // first step: the camera is still (within one frame of motion) at the departure point
      stepTravel(1e-6, MS)
      expect(dist(nav.pos, before)).toBeLessThan(Math.max(1e-12, 1e-6 * dist(before, positionOf(BY_ID[id], MS))))
      flyUntilArrived()
      expect(['arriving', 'inspecting', 'idle']).toContain(travelEngineState.phase)
      // arrival at the destination's framing distance, following it
      const d = dist(nav.pos, positionOf(BY_ID[id], MS))
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThan(BY_ID[id].viewDistanceLy * 50 + 1e-12)
      expect(nav.followId).toBe(id)
    }
  })

  it('flight duration depends on the departure distance and the user speed setting', () => {
    initiateTravel('earth', MS, { instant: true })
    initiateTravel('moon', MS)
    const nearEta = travelEngineState.etaSec
    cancelTravel()
    initiateTravel('earth', MS, { instant: true })
    initiateTravel('neptune', MS)
    const farEta = travelEngineState.etaSec
    expect(farEta).toBeGreaterThan(nearEta)
    cancelTravel()
    initiateTravel('earth', MS, { instant: true })
    travelSettings.speed = 2
    initiateTravel('neptune', MS)
    expect(travelEngineState.etaSec).toBeCloseTo(farEta / 2, 6)
  })

  it('cancel mid-flight holds the actual position; the next flight departs from there', () => {
    initiateTravel('earth', MS, { instant: true })
    initiateTravel('mars', MS)
    for (let i = 0; i < 120; i++) stepTravel(1 / 60, MS) // ~2 s in
    const mid: Vec3 = [...nav.pos]
    const midQuat = nav.quat.clone()
    cancelTravel()
    expect(travelEngineState.phase).toBe('cancelled')
    expect(nav.flight).toBeNull()
    expect(dist(nav.pos, mid)).toBe(0)
    expect(nav.quat.angleTo(midQuat)).toBe(0)
    // a later step must not move the camera (no stale animation loop)
    stepTravel(1 / 60, MS)
    expect(dist(nav.pos, mid)).toBe(0)
    // the next journey starts at the cancellation point, not at Earth or the Sun
    initiateTravel('jupiter', MS)
    stepTravel(1e-6, MS)
    expect(dist(nav.pos, mid)).toBeLessThan(1e-6 * dist(mid, positionOf(BY_ID.jupiter, MS)))
    expect(dist(nav.pos, positionOf(BY_ID.earth, MS))).toBeGreaterThan(0.01 * LY_PER_AU)
  })
})

describe('Travel Mode entry and destination requests', () => {
  it('entering Travel Mode inside the Solar System keeps the exact view (position + orientation) at rest', () => {
    initiateTravel('mars', MS, { instant: true })
    nav.quat.setFromEuler(new THREE.Euler(0.2, -1.1, 0.05))
    const pos: Vec3 = [...nav.pos]
    const q = nav.quat.clone()
    useStore.getState().enterTravelMode()
    expect(useStore.getState().phase).toBe('travel')
    expect(dist(ship.pos, pos)).toBeLessThan(1e-3 * km) // < 1 m
    expect(ship.quat.angleTo(q)).toBeLessThan(1e-9)
    expect(len(ship.vel)).toBe(0)
    expect(ship.refBodyId).toBe('mars')
  })

  it('from a cosmic view (welcome screen) the spacecraft starts next to the requested body', () => {
    nav.pos = [SUN_POS[0] + 5e8, SUN_POS[1], SUN_POS[2]]
    useStore.getState().enterTravelMode('earth')
    expect(dist(ship.pos, positionOf(BY_ID.earth, MS))).toBeLessThan(0.001 * LY_PER_AU)
  })

  it('a destination request in Travel Mode engages the spacecraft autopilot from its current position', () => {
    initiateTravel('moon', MS, { instant: true })
    useStore.getState().enterTravelMode()
    const shipPos: Vec3 = [...ship.pos]
    const camPos: Vec3 = [...nav.pos]
    useStore.getState().travel('mars')
    expect(ship.autopilot.active).toBe(true)
    expect(ship.autopilot.destinationId).toBe('mars')
    expect(dist(ship.pos, shipPos)).toBeLessThan(1e-3 * km) // the ship has not been teleported
    expect(travelEngineState.phase).not.toBe('traveling') // the detached observer camera does not fly
    expect(dist(nav.pos, camPos)).toBe(0)
  })

  it('exiting Travel Mode leaves the observer exactly at the ship and co-moving with its reference body', () => {
    initiateTravel('saturn', MS, { instant: true })
    useStore.getState().enterTravelMode()
    useStore.getState().exitTravelMode()
    expect(dist(nav.pos, ship.pos)).toBe(0)
    expect(nav.followId).toBe('saturn')
  })
})
