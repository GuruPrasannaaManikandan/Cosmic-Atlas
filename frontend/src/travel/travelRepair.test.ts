/**
 * Regression tests for the Travel Mode repair (COSMIC_ATLAS_UI_AND_TRAVEL_REPAIR_REPORT.md).
 * Each test corresponds to a defect reproduced in the browser before the fix.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { BY_ID, positionOf } from '../data/catalog'
import { len, sub, add, toThree, scale } from '../astro/coords'
import { heliocentricKm, relativeKm } from '../astro/heliocentric'
import { ship, initShipNear, stepShipPhysics, engageAutopilot, cancelAutopilot, setCameraView, KM_TO_LY, C_LY_S, FlightInput } from './shipState'
import { travelInput, travelUi, travelView, releaseAllTravelInput, pollTravelInput, settleTravelView, installTravelActions, viewDirLocal } from './travelKeys'
import { input } from '../input/appInput'
import { useStore } from '../store/store'

const T0 = Date.UTC(2026, 10, 8, 12)
const MS_PER_DAY = 86400000

type FakeKey = { code: string; key: string; target: unknown; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault: () => void }
const key = (code: string, extra: Partial<FakeKey> = {}): KeyboardEvent =>
  ({ code, key: code, target: { tagName: 'CANVAS' }, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, ...extra }) as unknown as KeyboardEvent
const down = (code: string, extra: Partial<FakeKey> = {}) => input.handleKeyDown(key(code, extra))
const up = (code: string) => input.handleKeyUp(key(code))
/** one frame of keyboard polling (Scene.tsx does this before every physics step) */
const poll = (dt = 0.016, now?: number) => pollTravelInput(dt, now)

const idle = (): FlightInput => ({ yaw: 0, pitch: 0, roll: 0, thrustDelta: 0, reverse: false, boost: false, strafeX: 0, strafeY: 0, brake: false })

function axes() {
  const q = ship.quat
  return {
    fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(q),
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
  }
}
/** exact displacement (three axes, km) from the ship's local offset */
const localThree = () => new THREE.Vector3(...toThree(ship.localKm!))

describe('Travel Mode keyboard mapping (central input manager → travelKeys)', () => {
  let uninstall: () => void = () => {}
  beforeEach(() => {
    useStore.setState({ phase: 'travel', navMapOpen: false })
    travelUi.helpOpen = false
    releaseAllTravelInput()
    initShipNear('earth', T0)
    cancelAutopilot()
    setCameraView('chase')
    travelView.yaw = 0
    travelView.pitch = 0
    uninstall()
    uninstall = installTravelActions()
  })

  it('maps W/S, A/D, Space/Z, Q/E, Shift and B to translation, roll, boost and brake', () => {
    const check = (code: string, f: () => void) => { down(code); poll(); f(); up(code); poll() }
    check('KeyW', () => expect(travelInput.thrustDelta).toBe(1))
    check('KeyS', () => { expect(travelInput.thrustDelta).toBe(-1); expect(travelInput.reverse).toBe(true) })
    check('KeyA', () => expect(travelInput.strafeX).toBe(-1))
    check('KeyD', () => expect(travelInput.strafeX).toBe(1))
    check('Space', () => expect(travelInput.strafeY).toBe(1))
    check('KeyZ', () => expect(travelInput.strafeY).toBe(-1))
    check('KeyE', () => expect(travelInput.roll).toBe(1))
    check('ShiftLeft', () => expect(travelInput.boost).toBe(true))
    check('KeyB', () => expect(travelInput.brake).toBe(true))
    expect(travelInput).toMatchObject({ thrustDelta: 0, strafeX: 0, strafeY: 0, yaw: 0, pitch: 0, roll: 0, boost: false, brake: false })
  })

  it('WASD never turns the camera; the arrows never translate the ship', () => {
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      down(c); poll(0.5); up(c)
      expect(travelView).toEqual({ yaw: 0, pitch: 0 })
    }
    for (const c of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      down(c); poll(0.1)
      expect(travelInput).toMatchObject({ thrustDelta: 0, strafeX: 0, strafeY: 0, reverse: false })
      up(c)
    }
  })

  it('arrows aim the camera: right = look right, up = look up', () => {
    down('ArrowRight'); poll(0.2); up('ArrowRight')
    expect(travelView.yaw).toBeGreaterThan(0)
    down('ArrowUp'); poll(0.2); up('ArrowUp')
    expect(travelView.pitch).toBeGreaterThan(0)
  })

  const frames = (n: number) => {
    for (let i = 0; i < n; i++) {
      poll(0.016)
      const before = ship.quat.clone()
      stepShipPhysics(0.016, T0, travelInput)
      settleTravelView(before, ship.quat)
    }
  }

  it('the arrows alone never rotate the ship (they only aim the camera)', () => {
    const q0 = ship.quat.clone()
    down('ArrowRight'); frames(30); up('ArrowRight')
    down('ArrowUp'); frames(30); up('ArrowUp')
    frames(60)
    expect(Math.abs(ship.quat.dot(q0))).toBeCloseTo(1, 9)
    expect(travelView.yaw).toBeGreaterThan(0.3)
  })

  it('in manual piloting, while thrusting, the ship turns toward the aimed view and the offset settles to zero', () => {
    down('ArrowRight'); poll(0.3); up('ArrowRight')
    const target = viewDirLocal(travelView.yaw, travelView.pitch).applyQuaternion(ship.quat)
    down('KeyW'); frames(200); up('KeyW')
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)
    expect(fwd.dot(target)).toBeGreaterThan(Math.cos(0.02)) // the nose now points where the pilot looked
    expect(Math.abs(travelView.yaw)).toBeLessThan(0.02)
  })

  it('releasing one key of an opposing pair keeps the other active (was: axis zeroed)', () => {
    down('KeyW'); down('KeyS'); poll()
    expect(travelInput.thrustDelta).toBe(0)
    up('KeyS'); poll()
    expect(travelInput.thrustDelta).toBe(1)
  })

  it('works with Shift held (physical key codes, not upper-case key values)', () => {
    down('ShiftLeft')
    down('KeyW', { key: 'W' }); poll()
    expect(travelInput.thrustDelta).toBe(1)
    up('KeyW'); poll()
    expect(travelInput.thrustDelta).toBe(0)
  })

  it('releases every key on focus loss (was: stuck throttle after Alt-Tab)', () => {
    down('KeyW'); down('KeyD'); down('ShiftLeft')
    releaseAllTravelInput(); poll()
    expect(travelInput).toMatchObject({ thrustDelta: 0, strafeX: 0, boost: false })
  })

  it('ignores flight keys while typing and while a dialog owns the keyboard', () => {
    down('KeyW', { target: { tagName: 'INPUT' } }); poll()
    expect(travelInput.thrustDelta).toBe(0)
    useStore.setState({ navMapOpen: true })
    down('KeyW'); poll()
    expect(travelInput.thrustDelta).toBe(0)
    up('KeyW')
    useStore.setState({ navMapOpen: false })
    travelUi.helpOpen = true
    down('KeyW'); poll()
    expect(travelInput.thrustDelta).toBe(0)
  })

  it('Escape exits Travel Mode, but not while the nav map or help dialog is open', () => {
    useStore.setState({ navMapOpen: true })
    down('Escape')
    expect(useStore.getState().phase).toBe('travel')
    useStore.setState({ navMapOpen: false })
    travelUi.helpOpen = true
    down('Escape')
    expect(useStore.getState().phase).toBe('travel')
    travelUi.helpOpen = false
    down('Escape')
    expect(useStore.getState().phase).toBe('explore')
  })

  it('no flight key or arrow cancels the autopilot; movement keys only show how to take over', () => {
    engageAutopilot('moon', T0)
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyZ', 'KeyQ', 'KeyE', 'KeyB', 'ArrowUp', 'ArrowLeft']) {
      down(c); poll(0.05, 1e9); up(c)
      expect(ship.autopilot.active, c).toBe(true)
    }
    expect(travelInput.thrustDelta).toBe(0)
    expect(ship.event?.text).toMatch(/press P/i)
  })

  it('P switches to manual piloting and back to the autopilot for the locked destination', () => {
    engageAutopilot('moon', T0)
    down('KeyP'); up('KeyP')
    expect(ship.autopilot.active).toBe(false)
    down('KeyW'); poll()
    expect(travelInput.thrustDelta).toBe(1)
    up('KeyW')
    down('KeyP'); up('KeyP')
    expect(ship.autopilot.active).toBe(true)
    expect(ship.autopilot.destinationId).toBe('moon')
  })
})

describe('Travel Mode flight model', () => {
  beforeEach(() => {
    releaseAllTravelInput()
    initShipNear('earth', T0)
    ship.vel = [0, 0, 0]
    setCameraView('chase')
  })

  it('S held at zero throttle thrusts backward (was: no reverse thrust at all)', () => {
    const a = axes()
    const p0 = localThree()
    for (let i = 0; i < 10; i++) stepShipPhysics(0.1, T0, { ...idle(), thrustDelta: -1, reverse: true })
    const d = localThree().sub(p0)
    expect(d.length()).toBeGreaterThan(0)
    expect(d.normalize().dot(a.fwd)).toBeLessThan(-0.99)
    expect(ship.reverse).toBe(true)
  })

  it('A/D translate left/right without turning the ship (was: yaw)', () => {
    const a = axes()
    const q0 = ship.quat.clone()
    const p0 = localThree()
    for (let i = 0; i < 5; i++) stepShipPhysics(0.1, T0, { ...idle(), strafeX: -1 })
    const d = localThree().sub(p0)
    expect(d.normalize().dot(a.right)).toBeLessThan(-0.99)
    expect(Math.abs(ship.quat.dot(q0))).toBeCloseTo(1, 12)
  })

  it('slow manoeuvres are not lost to root-frame quantisation (blueprint D1)', () => {
    // 1 km/s for 0.1 s = 100 m: far below the 34 km float64 spacing of root-frame positions near the Sun
    ship.vel = scale([1, 0, 0], KM_TO_LY)
    const x0 = ship.localKm![0]
    ship.flightModel = 'inertial'
    ship.stabilization = false
    stepShipPhysics(0.1, T0, idle())
    expect(ship.localKm![0] - x0).toBeCloseTo(0.1, 9)
    ship.flightModel = 'assisted'
    ship.stabilization = true
  })

  it('mouse look rotates the ship', () => {
    const f0 = axes().fwd
    stepShipPhysics(0.016, T0, { ...idle(), lookYaw: 0.2, lookPitch: 0 })
    expect(axes().fwd.dot(f0)).toBeLessThan(Math.cos(0.15))
  })

  it('warp cannot carry the ship into or through a planet in one frame', () => {
    ship.gear = 4
    const earth = positionOf(BY_ID.earth, T0)
    const toEarth = new THREE.Vector3(...toThree(sub(earth, ship.pos))).normalize()
    ship.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), toEarth, new THREE.Vector3(0, 1, 0)))
    ship.vel = [0, 0, 0]
    for (let i = 0; i < 100; i++) stepShipPhysics(0.1, T0, { ...idle(), thrustDelta: 1, boost: true })
    const rEarthKm = 6371
    expect(len(ship.localKm!)).toBeGreaterThan(rEarthKm)
    expect(ship.speedC).toBeLessThan(1) // the proximity governor, not the 2,400c boosted warp cap, sets the speed here
  })

  it('a ship holding position next to a planet stays with it while time runs (co-moving frame)', () => {
    const before = len(relativeKm('earth', 'earth', T0)) + len(ship.localKm!)
    let ms = T0
    for (let i = 0; i < 60; i++) {
      ms += 0.016 * MS_PER_DAY // 1 day/s
      stepShipPhysics(0.016, ms, idle())
    }
    const earth = positionOf(BY_ID.earth, ms)
    const afterRoot = len(sub(ship.pos, earth)) / KM_TO_LY
    expect(Math.abs(afterRoot - before)).toBeLessThan(100) // root-frame check is limited to ~34 km quantisation
    expect(ship.refBodyId).toBe('earth')
  })
})

describe('Autopilot', () => {
  beforeEach(() => {
    releaseAllTravelInput()
    initShipNear('earth', T0)
  })

  it('reaches the Moon despite large initial sideways velocity (was: circled it indefinitely)', () => {
    ship.vel = scale([0, 0, 1], 5000 * KM_TO_LY) // 5,000 km/s sideways
    engageAutopilot('moon', T0)
    let steps = 0
    while (ship.autopilot.active && steps < 3000) {
      stepShipPhysics(0.05, T0, idle())
      steps++
    }
    expect(ship.autopilot.active).toBe(false)
    expect(ship.autopilot.phase).toBe('arrive')
    expect(ship.arrivedId).toBe('moon')
    const distKm = len(ship.localKm!)
    expect(distKm).toBeGreaterThan(1737.4 * 2.4)
    expect(distKm).toBeLessThan(1737.4 * 2.8)
    expect(ship.speedKmS).toBe(0)
  })

  it('arrives at a moving target while time runs and then holds station', () => {
    engageAutopilot('mars', T0, true)
    let ms = T0
    let steps = 0
    while (ship.autopilot.active && steps < 20000) {
      ms += 0.05 * 0.1 * MS_PER_DAY // 0.1 day/s
      stepShipPhysics(0.05, ms, idle())
      steps++
    }
    expect(ship.arrivedId).toBe('mars')
    const held = len(ship.localKm!)
    for (let i = 0; i < 100; i++) {
      ms += 0.05 * MS_PER_DAY
      stepShipPhysics(0.05, ms, idle())
    }
    expect(Math.abs(len(ship.localKm!) - held)).toBeLessThan(1e-6)
  })

  it('reports phases align → accelerate/cruise → decelerate → arrive', () => {
    engageAutopilot('moon', T0)
    const seen = new Set<string>()
    for (let i = 0; i < 4000 && ship.autopilot.active; i++) {
      stepShipPhysics(0.05, T0, idle())
      seen.add(ship.autopilot.phase)
    }
    seen.add(ship.autopilot.phase)
    expect(seen.has('decelerate')).toBe(true)
    expect(seen.has('arrive')).toBe(true)
    expect(seen.has('accelerate') || seen.has('cruise')).toBe(true)
  })
})

describe('Heliocentric km helpers', () => {
  it('match the catalogue root positions (within root-frame quantisation)', () => {
    for (const id of ['earth', 'moon', 'mars', 'phobos', 'pluto', 'charon', 'nix', 'ceres']) {
      const h = heliocentricKm(id, T0)!
      const root = positionOf(BY_ID[id], T0)
      const sun = positionOf(BY_ID.sun, T0)
      const fromRoot = scale(sub(root, sun), 1 / KM_TO_LY)
      expect(len(sub(h, fromRoot))).toBeLessThan(100)
    }
  })

  it('give exact body-to-body offsets (Phobos–Mars equals its orbital radius)', () => {
    const d = len(relativeKm('phobos', 'mars', T0))
    expect(d).toBeGreaterThan(9234 * 0.98)
    expect(d).toBeLessThan(9518 * 1.02)
    expect(len(add(relativeKm('moon', 'earth', T0), relativeKm('earth', 'moon', T0)))).toBe(0)
  })

  it('keep c-relative speed constants consistent', () => {
    expect(C_LY_S / KM_TO_LY).toBeCloseTo(299792.458, -1)
  })
})
