import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  travelEngineState,
  initiateTravel,
  cancelTravel,
  stepTravel,
  computeIntelligentFraming,
  subscribeTravelEngine,
} from './travelEngine'
import { BY_ID } from '../data/catalog'
import { nav } from '../store/nav'
import { len, sub } from '../astro/coords'

describe('Travel Engine State Machine & Navigation', () => {
  beforeEach(() => {
    cancelTravel()
    nav.pos = [1e9, 0, 0]
    nav.flight = null
    nav.followId = null
    travelEngineState.phase = 'idle'
    travelEngineState.targetId = null
    travelEngineState.progress = 0
  })

  it('computes intelligent framing tailored by astronomical object type', () => {
    // Planet (Earth)
    const earthObj = BY_ID['earth']
    const earthFraming = computeIntelligentFraming(earthObj, [0, 0, 0])
    expect(earthFraming.approachDistanceLy).toBeGreaterThanOrEqual(earthObj.viewDistanceLy)
    expect(earthFraming.targetDirection.length()).toBeCloseTo(1, 4)

    // Star (Betelgeuse)
    const betelgeuseObj = BY_ID['betelgeuse']
    const betelgeuseFraming = computeIntelligentFraming(betelgeuseObj, [0, 0, 0])
    expect(betelgeuseFraming.approachDistanceLy).toBeGreaterThan(0)
    // Elevation approach angle (y component) is positive
    expect(betelgeuseFraming.targetDirection.y).toBeGreaterThan(0)

    // Galaxy (Andromeda)
    const andromedaObj = BY_ID['andromeda']
    const andromedaFraming = computeIntelligentFraming(andromedaObj, [0, 0, 0])
    expect(andromedaFraming.approachDistanceLy).toBeGreaterThan(30000)
    expect(andromedaFraming.targetDirection.y).toBeGreaterThan(0.5) // 35°+ elevation above disk
  })

  it('initiates travel with proper state machine progression', () => {
    let notified = 0
    const unsub = subscribeTravelEngine(() => {
      notified++
    })

    initiateTravel('earth', 0)

    expect(travelEngineState.phase).toBe('traveling')
    expect(travelEngineState.targetId).toBe('earth')
    expect(travelEngineState.targetName).toBe('Earth')
    expect(travelEngineState.progress).toBe(0)
    expect(travelEngineState.etaSec).toBeGreaterThan(0)
    expect(nav.flight).not.toBeNull()
    expect(notified).toBeGreaterThan(0)

    unsub()
  })

  it('steps flight forward, updating progress and telemetry', () => {
    initiateTravel('earth', 0)
    const initialEta = travelEngineState.etaSec

    // Advance 1 second
    stepTravel(1.0, 0)

    expect(travelEngineState.progress).toBeGreaterThan(0)
    expect(travelEngineState.etaSec).toBeLessThan(initialEta)
    expect(travelEngineState.phase).toBe('traveling')
  })

  it('reaches destination smoothly and transitions to arriving and inspecting', () => {
    const onArrive = vi.fn()
    initiateTravel('earth', 0, { onArrive })

    // Step across full duration (20 seconds is well above travelDuration)
    for (let i = 0; i < 400; i++) {
      stepTravel(0.1, 0)
    }

    expect(travelEngineState.progress).toBe(1.0)
    expect(travelEngineState.phase).toBe('arriving')
    expect(nav.flight).toBeNull()
    expect(nav.followId).toBe('earth')
    expect(onArrive).toHaveBeenCalled()
  })

  it('supports cancellation without jumping camera position', () => {
    initiateTravel('earth', 0)
    stepTravel(1.0, 0)
    const posDuringFlight = [...nav.pos]

    cancelTravel()

    expect(travelEngineState.phase).toBe('cancelled')
    expect(nav.flight).toBeNull()
    // Camera position should stay where it was cancelled
    expect(nav.pos[0]).toBe(posDuringFlight[0])
    expect(nav.pos[1]).toBe(posDuringFlight[1])
    expect(nav.pos[2]).toBe(posDuringFlight[2])
  })

  it('handles invalid celestial object identifiers gracefully', () => {
    initiateTravel('invalid-quasar-9999', 0)
    expect(travelEngineState.phase).toBe('error')
    expect(travelEngineState.errorMsg).toContain('invalid-quasar-9999')
  })
})
