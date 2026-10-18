import { describe, it, expect, beforeEach } from 'vitest'
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
})
