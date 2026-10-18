import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SOUNDTRACKS, SOUNDTRACK_LIST, TRACK_BY_ID } from './types'
import { CosmicAudioEngine } from './CosmicAudioEngine'

describe('Cosmic Audio Engine & Soundtracks', () => {
  it('has valid, complete soundtrack catalog entries', () => {
    expect(SOUNDTRACK_LIST.length).toBeGreaterThanOrEqual(5)
    for (const track of SOUNDTRACK_LIST) {
      expect(track.id).toBeTruthy()
      expect(track.title).toBeTruthy()
      expect(track.category).toBeTruthy()
      expect(track.bpm).toBeGreaterThan(0)
      expect(track.key).toBeTruthy()
      expect(TRACK_BY_ID[track.id]).toBe(track)
    }
  })

  it('provides music suitable for each astronomical domain', () => {
    const categories = SOUNDTRACK_LIST.map((t) => t.category)
    expect(categories).toContain('deep-space')
    expect(categories).toContain('stellar')
    expect(categories).toContain('solar-system')
    expect(categories).toContain('cosmic-wonder')
    expect(categories).toContain('interstellar')
  })

  describe('Audio Engine Runtime & Preferences', () => {
    let engine: CosmicAudioEngine

    beforeEach(() => {
      // Mock AudioContext in node/jsdom environment if not native
      if (typeof window !== 'undefined' && !window.AudioContext) {
        class MockGain {
          gain = { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }
          connect = vi.fn()
          disconnect = vi.fn()
        }
        class MockOsc {
          frequency = { value: 440, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
          type = 'sine'
          connect = vi.fn()
          start = vi.fn()
          stop = vi.fn()
          disconnect = vi.fn()
        }
        class MockBiquad {
          frequency = { value: 1000, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }
          Q = { value: 1 }
          type = 'lowpass'
          connect = vi.fn()
          disconnect = vi.fn()
        }
        class MockBufferSource {
          buffer: any = null
          connect = vi.fn()
          start = vi.fn()
          stop = vi.fn()
          disconnect = vi.fn()
        }
        ;(window as any).AudioContext = class {
          state = 'running'
          currentTime = 0
          destination = {}
          createGain() { return new MockGain() }
          createOscillator() { return new MockOsc() }
          createBiquadFilter() { return new MockBiquad() }
          createBufferSource() { return new MockBufferSource() }
          createBuffer() {
            return {
              getChannelData: () => new Float32Array(44100),
            }
          }
          resume = vi.fn().mockResolvedValue(undefined)
          close = vi.fn().mockResolvedValue(undefined)
        }
      }

      engine = new CosmicAudioEngine()
    })

    it('initializes with default volume levels and enabled state', () => {
      const state = engine.getState()
      expect(state.masterVolume).toBeGreaterThan(0)
      expect(state.musicVolume).toBeGreaterThan(0)
      expect(state.sfxVolume).toBeGreaterThan(0)
      expect(state.muted).toBe(false)
      expect(state.sfxEnabled).toBe(true)
    })

    it('sets volume levels clamped between 0 and 1', () => {
      engine.setMasterVolume(0.85)
      expect(engine.getState().masterVolume).toBe(0.85)

      engine.setMasterVolume(1.5)
      expect(engine.getState().masterVolume).toBe(1.0)

      engine.setMasterVolume(-0.2)
      expect(engine.getState().masterVolume).toBe(0.0)

      engine.setMusicVolume(0.4)
      expect(engine.getState().musicVolume).toBe(0.4)

      engine.setSfxVolume(0.7)
      expect(engine.getState().sfxVolume).toBe(0.7)
    })

    it('toggles mute correctly', () => {
      expect(engine.getState().muted).toBe(false)
      engine.toggleMute()
      expect(engine.getState().muted).toBe(true)
      engine.toggleMute()
      expect(engine.getState().muted).toBe(false)
    })

    it('switches tracks without error', () => {
      engine.playTrack('solar-system')
      expect(engine.getState().currentTrack?.id).toBe('solar-system')

      engine.nextTrack()
      expect(engine.getState().currentTrack).not.toBeNull()
    })

    it('executes UI and environmental sound triggers safely', () => {
      expect(() => engine.playUiClick('click')).not.toThrow()
      expect(() => engine.playUiClick('navigate')).not.toThrow()
      expect(() => engine.playSupernovaSound('collapse')).not.toThrow()
      expect(() => engine.playSupernovaSound('shockwave')).not.toThrow()
      expect(() => engine.playPulsarPulse(25)).not.toThrow()
      expect(() => engine.playWarpSound(true)).not.toThrow()
      expect(() => engine.playArrivalChime()).not.toThrow()
    })
  })
})
