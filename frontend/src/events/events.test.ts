import { describe, it, expect, beforeEach } from 'vitest'
import { COSMIC_EVENTS, EVENT_BY_ID } from './eventsCatalog'
import {
  eventState,
  startEvent,
  stopEvent,
  stepEventTime,
  setEventPlaying,
  toggleEventPlaying,
  setEventTime,
  resetEvent,
  setEventSpeed,
  setEventCameraAngle,
  subscribeEventState,
} from './eventState'

describe('Cosmic Events Observatory & Simulation Lifecycle', () => {
  beforeEach(() => {
    stopEvent()
  })

  describe('Astrophysical Events Catalogue', () => {
    it('contains all required astronomical simulation events', () => {
      expect(COSMIC_EVENTS.length).toBeGreaterThanOrEqual(4)
      expect(EVENT_BY_ID['supernova-betelgeuse']).toBeDefined()
      expect(EVENT_BY_ID['pulsar-crab']).toBeDefined()
      expect(EVENT_BY_ID['black-hole-m87']).toBeDefined()
      expect(EVENT_BY_ID['nebula-carina']).toBeDefined()
    })

    it('validates Betelgeuse supernova stages and provenance', () => {
      const sn = EVENT_BY_ID['supernova-betelgeuse']
      expect(sn.category).toBe('supernova')
      expect(sn.provenance).toBe('hypothetical-simulation')
      expect(sn.durationSec).toBe(16)
      expect(sn.stages.length).toBe(4)

      // Stages should have strictly ordered timestamps starting at 0
      expect(sn.stages[0].timeSec).toBe(0)
      for (let i = 1; i < sn.stages.length; i++) {
        expect(sn.stages[i].timeSec).toBeGreaterThan(sn.stages[i - 1].timeSec)
        expect(sn.stages[i].timeSec).toBeLessThan(sn.durationSec)
      }
    })

    it('validates Crab Pulsar relativistic magnetosphere metadata', () => {
      const pulsar = EVENT_BY_ID['pulsar-crab']
      expect(pulsar.category).toBe('pulsar')
      expect(pulsar.provenance).toBe('model-based')
      expect(pulsar.stages.length).toBeGreaterThanOrEqual(3)
      expect(pulsar.source.name).toContain('Gold 1968')
    })

    it('validates M87* Black Hole gravitational lensing and Doppler beaming', () => {
      const bh = EVENT_BY_ID['black-hole-m87']
      expect(bh.category).toBe('black-hole')
      expect(bh.provenance).toBe('model-based')
      expect(bh.stages.length).toBe(3)
      expect(bh.source.name).toContain('Event Horizon Telescope')
    })

    it('validates Carina star-forming pillars and Herbig-Haro jets', () => {
      const neb = EVENT_BY_ID['nebula-carina']
      expect(neb.category).toBe('nebula')
      expect(neb.stages.length).toBe(3)
    })
  })

  describe('Event Playback State Management', () => {
    it('starts an event correctly and sets initial parameters', () => {
      const started = startEvent('supernova-betelgeuse')
      expect(started).toBe(true)
      expect(eventState.activeId).toBe('supernova-betelgeuse')
      expect(eventState.definition).toBe(EVENT_BY_ID['supernova-betelgeuse'])
      expect(eventState.playing).toBe(true)
      expect(eventState.timeSec).toBe(0)
      expect(eventState.speed).toBe(1)
      expect(eventState.cameraAngle.dist).toBe(55)
    })

    it('stops an event and clears state completely', () => {
      startEvent('supernova-betelgeuse')
      expect(eventState.activeId).toBe('supernova-betelgeuse')

      stopEvent()
      expect(eventState.activeId).toBeNull()
      expect(eventState.definition).toBeNull()
      expect(eventState.playing).toBe(false)
      expect(eventState.timeSec).toBe(0)
    })

    it('steps simulation time forward and honors speed multipliers', () => {
      startEvent('supernova-betelgeuse')
      expect(eventState.timeSec).toBe(0)

      stepEventTime(1.0)
      expect(eventState.timeSec).toBeCloseTo(1.0, 2)

      // Test speed multiplier 2x
      setEventSpeed(2.0)
      stepEventTime(0.5)
      expect(eventState.timeSec).toBeCloseTo(2.0, 2) // 1.0 + 0.5 * 2 = 2.0
    })

    it('clamps time to event duration', () => {
      startEvent('supernova-betelgeuse')
      setEventTime(25.0)
      expect(eventState.timeSec).toBe(16) // clamped to durationSec

      setEventTime(-5.0)
      expect(eventState.timeSec).toBe(0) // clamped to min 0
    })

    it('toggles play/pause state', () => {
      startEvent('supernova-betelgeuse')
      expect(eventState.playing).toBe(true)

      toggleEventPlaying()
      expect(eventState.playing).toBe(false)

      // When paused, stepping time does not advance simulation
      stepEventTime(1.0)
      expect(eventState.timeSec).toBe(0)

      toggleEventPlaying()
      expect(eventState.playing).toBe(true)
      stepEventTime(1.0)
      expect(eventState.timeSec).toBeCloseTo(1.0, 2)
    })

    it('updates camera orbit angles', () => {
      startEvent('supernova-betelgeuse')
      setEventCameraAngle(1.2, 0.4, 30)
      expect(eventState.cameraAngle.yaw).toBe(1.2)
      expect(eventState.cameraAngle.pitch).toBe(0.4)
      expect(eventState.cameraAngle.dist).toBe(30)
    })

    it('triggers listener callbacks on state mutations', () => {
      let callCount = 0
      const unsubscribe = subscribeEventState(() => {
        callCount++
      })

      startEvent('supernova-betelgeuse')
      expect(callCount).toBe(1)

      setEventPlaying(false)
      expect(callCount).toBe(2)

      setEventTime(5.0)
      expect(callCount).toBe(3)

      resetEvent()
      expect(callCount).toBe(4)

      unsubscribe()
      stopEvent()
      // callCount should not increment after unsubscribe
      expect(callCount).toBe(4)
    })
  })
})
