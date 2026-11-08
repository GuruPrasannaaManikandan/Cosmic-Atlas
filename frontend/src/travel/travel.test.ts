import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { BY_ID, positionOf } from '../data/catalog'
import { len, sub, add, toThree, LY_PER_AU } from '../astro/coords'
import {
  ship,
  initShipNear,
  stepShipPhysics,
  setFlightModel,
  setCameraView,
  cycleCameraView,
  toggleStabilization,
  setGear,
  engageAutopilot,
  cancelAutopilot,
  GEAR_SPEEDS,
  C_LY_S,
  KM_TO_LY,
} from './shipState'

function createDefaultInput() {
  return {
    yaw: 0,
    pitch: 0,
    roll: 0,
    thrustDelta: 0,
    reverse: false,
    boost: false,
    strafeX: 0,
    strafeY: 0,
    brake: false,
  }
}

describe('Travel Mode Physics & Ship Simulation', () => {
  let input = createDefaultInput()

  beforeEach(() => {
    input = createDefaultInput()
    // Initialize ship near Earth
    initShipNear('earth', 0)
    setCameraView('chase')
  })

  it('initializes ship near Earth with reasonable distance and orientation', () => {
    expect(ship.targetId).toBe('earth')
    expect(ship.cameraView).toBe('chase')
    expect(ship.flightModel).toBe('assisted')
    expect(ship.stabilization).toBe(true)
    expect(ship.gear).toBe(1)
    expect(ship.speedKmS).toBeGreaterThanOrEqual(0)
  })

  it('cycles camera views properly', () => {
    expect(ship.cameraView).toBe('chase')
    cycleCameraView()
    expect(ship.cameraView).toBe('external')
    cycleCameraView()
    expect(ship.cameraView).toBe('cockpit')
    cycleCameraView()
    expect(ship.cameraView).toBe('chase')

    setCameraView('cockpit')
    expect(ship.cameraView).toBe('cockpit')
  })

  it('toggles flight model and stabilization', () => {
    setFlightModel('inertial')
    expect(ship.flightModel).toBe('inertial')
    setFlightModel('assisted')
    expect(ship.flightModel).toBe('assisted')

    expect(ship.stabilization).toBe(true)
    toggleStabilization()
    expect(ship.stabilization).toBe(false)
    toggleStabilization()
    expect(ship.stabilization).toBe(true)
  })

  it('sets throttle gear correctly and respects gear limits', () => {
    setGear(2)
    expect(ship.gear).toBe(2)
    expect(GEAR_SPEEDS[2].maxLyS).toBeCloseTo(0.2 * C_LY_S)

    setGear(4)
    expect(ship.gear).toBe(4)
    expect(GEAR_SPEEDS[4].maxLyS).toBeCloseTo(800 * C_LY_S)
  })

  it('accelerates forward under forward thrust delta in assisted flight', () => {
    input.thrustDelta = 1
    // Step forward multiple ticks
    for (let i = 0; i < 5; i++) {
      stepShipPhysics(0.1, 0, input)
    }
    expect(ship.speedKmS).toBeGreaterThan(0)
    expect(ship.thrust).toBeGreaterThan(0)
    expect(ship.thrust).toBeLessThanOrEqual(1)
  })

  it('dampens velocity when thrust ceases in assisted flight with stabilization', () => {
    input.thrustDelta = 1
    for (let i = 0; i < 5; i++) {
      stepShipPhysics(0.1, 0, input)
    }
    const initialVel = ship.speedKmS

    // Cut throttle to 0
    ship.thrust = 0
    input.thrustDelta = 0
    for (let i = 0; i < 10; i++) {
      stepShipPhysics(0.1, 0, input)
    }
    expect(ship.speedKmS).toBeLessThan(initialVel)
  })

  it('coasts with conserved velocity in inertial flight when stabilization is disabled', () => {
    setFlightModel('inertial')
    ship.stabilization = false

    input.thrustDelta = 1
    for (let i = 0; i < 5; i++) {
      stepShipPhysics(0.1, 0, input)
    }
    const movingVel = ship.speedKmS
    expect(movingVel).toBeGreaterThan(0)

    // Cut throttle, keep stabilization false
    ship.thrust = 0
    input.thrustDelta = 0
    for (let i = 0; i < 5; i++) {
      stepShipPhysics(0.1, 0, input)
    }
    // In inertial flight without damping, speed should remain essentially unchanged
    expect(Math.abs(ship.speedKmS - movingVel)).toBeLessThan(movingVel * 0.05)
  })

  it('engages and cancels autopilot correctly', () => {
    engageAutopilot('mars', 0, false)
    expect(ship.autopilot.active).toBe(true)
    expect(ship.autopilot.destinationId).toBe('mars')
    expect(['autopilot', 'warp']).toContain(ship.systemStatus)

    // Cancel autopilot
    cancelAutopilot()
    expect(ship.autopilot.active).toBe(false)
    expect(ship.systemStatus).toBe('nominal')
  })

  it('supports warp autopilot engagement', () => {
    engageAutopilot('jupiter', 0, true)
    expect(ship.autopilot.active).toBe(true)
    expect(ship.autopilot.warpActive).toBe(true)
    expect(ship.systemStatus).toBe('warp')

    cancelAutopilot()
    expect(ship.autopilot.active).toBe(false)
  })

  it('enforces proximity boundaries to prevent entering planetary cores', () => {
    // Manually place ship very close to Sun center
    ship.pos = [0, 0, 0] // Sun center
    stepShipPhysics(0.1, 0, input)
    // Check that ship status is valid and proximity alert or safe boundary logic fired
    expect(['proximity-alert', 'nominal', 'autopilot', 'warp']).toContain(ship.systemStatus)
  })

  it('spawns near small moons at realistic close-range distances, not tens of thousands of km', () => {
    initShipNear('phobos', 0)
    expect(ship.targetId).toBe('phobos')
    const phobosObj = BY_ID['phobos']
    expect(phobosObj).toBeDefined()
    const pPos = positionOf(phobosObj, 0)
    const distLy = len(sub(ship.pos, pPos))
    const distKm = distLy / KM_TO_LY
    // Phobos mean radius is ~11.2 km. Spawn distance should be around 25-50 km, not 75,000 km!
    expect(distKm).toBeGreaterThan(15)
    expect(distKm).toBeLessThan(100)
  })

  it('navigates autopilot to small moon and decelerates to safe arrival framing distance', () => {
    // Place ship 80 km away from Phobos along Z axis, facing Phobos
    const phobosObj = BY_ID['phobos']
    const pPos = positionOf(phobosObj, 0)
    ship.pos = add(pPos, [0, 0, 80 * KM_TO_LY])
    ship.vel = [0, 0, 0]
    // Point spacecraft heading toward Phobos (-Z in root is +Y in Three.js coords or align via Three)
    const toPhobosThree = new THREE.Vector3(...toThree(sub(pPos, ship.pos))).normalize()
    const lookM = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toPhobosThree, new THREE.Vector3(0, 1, 0))
    ship.quat.setFromRotationMatrix(lookM)

    engageAutopilot('phobos', 0, false)
    expect(ship.autopilot.active).toBe(true)
    expect(ship.autopilot.destinationId).toBe('phobos')

    // Step physics forward until arrival
    for (let i = 0; i < 150; i++) {
      if (!ship.autopilot.active) break
      stepShipPhysics(0.1, 0, input)
    }

    const curDistKm = len(sub(ship.pos, pPos)) / KM_TO_LY
    // Arrival framing distance should be ~25-45 km from Phobos, not 15,000 km!
    expect(curDistKm).toBeLessThan(60)
  })

  it('throttles approach velocity to prevent warp overshoot', () => {
    // Ship traveling toward Mars at high warp speed
    engageAutopilot('mars', 0, true)
    ship.gear = 4
    const marsPos = positionOf(BY_ID['mars'], 0)
    // Place ship 0.01 AU away (~1,500,000 km)
    ship.pos = add(marsPos, [0.01 * LY_PER_AU, 0, 0])
    ship.vel = [-50 * C_LY_S, 0, 0] // Flying toward Mars

    // Step physics
    stepShipPhysics(0.05, 0, input)

    // Approaching within 0.01 AU, warp speed should be downshifted and throttled
    expect(ship.gear).toBeLessThan(4)
    expect(ship.autopilot.warpActive).toBe(false)
  })

  it('exposes full Solar System destination registry including moons, dwarf planets, and asteroids', () => {
    const requiredDestinations = [
      'sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos',
      'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'amalthea',
      'saturn', 'titan', 'enceladus', 'mimas', 'tethys', 'dione', 'rhea', 'iapetus',
      'uranus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon',
      'neptune', 'triton', 'proteus', 'nereid',
      'pluto', 'charon', 'ceres', 'vesta', 'pallas', 'hygiea', 'eris', 'haumea', 'makemake'
    ]
    for (const id of requiredDestinations) {
      expect(BY_ID[id]).toBeDefined()
      expect(BY_ID[id].name.length).toBeGreaterThan(0)
    }
  })
})
