import { SoundtrackCategory, SOUNDTRACKS } from './types'

export class CosmicAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null

  // Active soundtrack synth nodes
  private currentTrack: SoundtrackCategory = 'deep-space'
  private isPlaying = false
  private isMuted = false
  private volume = 0.65
  private musicVolume = 0.7
  private sfxVolume = 0.5
  private sfxEnabled = true
  private activeVoices: { stop: () => void }[] = []
  private trackTimer: number | null = null

  // Spacecraft engine sound state
  private engineOsc: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private warpGain: GainNode | null = null

  private listeners = new Set<() => void>()

  constructor() {
    // Restore persistent session preferences
    try {
      const savedVol = localStorage.getItem('cosmic_audio_vol')
      if (savedVol !== null) this.volume = Math.max(0, Math.min(1, parseFloat(savedVol)))
      const savedMute = localStorage.getItem('cosmic_audio_mute')
      if (savedMute !== null) this.isMuted = savedMute === 'true'
      const savedTrack = localStorage.getItem('cosmic_audio_track') as SoundtrackCategory
      if (savedTrack && SOUNDTRACKS[savedTrack]) this.currentTrack = savedTrack
    } catch {
      // Ignore local storage errors
    }
  }

  public subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  private initContext() {
    if (typeof window === 'undefined') return
    if (this.ctx) return
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return
      this.ctx = new AudioContextClass()

      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)

      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.setValueAtTime(0.7, this.ctx.currentTime)
      this.musicGain.connect(this.masterGain)

      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
      this.sfxGain.connect(this.masterGain)
    } catch (e) {
      console.warn('Cosmic Audio Engine could not initialize Web Audio context:', e)
    }
  }

  public async unlock() {
    this.initContext()
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // user gesture required
      }
    }
  }

  public getTrack(): SoundtrackCategory {
    return this.currentTrack
  }

  public getTrackInfo() {
    return SOUNDTRACKS[this.currentTrack]
  }

  public getState() {
    return {
      masterVolume: this.volume,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      muted: this.isMuted,
      sfxEnabled: this.sfxEnabled,
      isPlaying: this.isPlaying,
      currentTrack: this.getTrackInfo(),
    }
  }

  public setMasterVolume(vol: number) {
    this.setVolume(vol)
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol))
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05)
    }
    this.notify()
  }

  public setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol))
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05)
    }
    this.notify()
  }

  public playTrack(track: SoundtrackCategory) {
    if (track in SOUNDTRACKS) {
      this.currentTrack = track
      return this.play(track)
    }
  }

  public nextTrack() {
    const list: SoundtrackCategory[] = ['deep-space', 'interstellar', 'cosmic-wonder', 'stellar', 'solar-system']
    const idx = list.indexOf(this.currentTrack)
    const next = list[(idx + 1) % list.length]
    this.setTrack(next)
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }

  public getIsMuted(): boolean {
    return this.isMuted
  }

  public getVolume(): number {
    return this.volume
  }

  public getSfxEnabled(): boolean {
    return this.sfxEnabled
  }

  public async play(track?: SoundtrackCategory) {
    await this.unlock()
    if (!this.ctx || !this.musicGain) return

    if (track) {
      this.currentTrack = track
      try {
        localStorage.setItem('cosmic_audio_track', track)
      } catch {}
    }

    this.stopCurrentVoices()
    this.isPlaying = true
    this.startTrackSynthesis(this.currentTrack)
    this.notify()
  }

  public pause() {
    this.isPlaying = false
    this.stopCurrentVoices()
    this.notify()
  }

  public togglePlay() {
    if (this.isPlaying) {
      this.pause()
    } else {
      this.play()
    }
  }

  public setTrack(track: SoundtrackCategory) {
    if (this.currentTrack === track && this.isPlaying) return
    this.currentTrack = track
    try {
      localStorage.setItem('cosmic_audio_track', track)
    } catch {}
    if (this.isPlaying) {
      this.play(track)
    } else {
      this.notify()
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol))
    try {
      localStorage.setItem('cosmic_audio_vol', String(this.volume))
    } catch {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05)
    }
    this.notify()
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted
    try {
      localStorage.setItem('cosmic_audio_mute', String(this.isMuted))
    } catch {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05)
    }
    this.notify()
  }

  public toggleMute() {
    this.setMuted(!this.isMuted)
  }

  public setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled
    this.notify()
  }

  private stopCurrentVoices() {
    if (this.trackTimer) {
      clearInterval(this.trackTimer)
      this.trackTimer = null
    }
    for (const v of this.activeVoices) {
      try {
        v.stop()
      } catch {}
    }
    this.activeVoices = []
  }

  // =========================================================================
  // PROCEDURAL SOUNDTRACK GENERATORS (100% Original Web Audio Synthesizers)
  // =========================================================================

  private startTrackSynthesis(track: SoundtrackCategory) {
    if (!this.ctx || !this.musicGain) return

    switch (track) {
      case 'deep-space':
        this.synthDeepSpace()
        break
      case 'interstellar':
        this.synthInterstellar()
        break
      case 'cosmic-wonder':
        this.synthCosmicWonder()
        break
      case 'stellar':
        this.synthStellar()
        break
      case 'solar-system':
        this.synthSolarSystem()
        break
    }
  }

  /** Deep Space Odyssey: Sub-bass drone, resonant filter sweeps, cosmic microwave breath */
  private synthDeepSpace() {
    if (!this.ctx || !this.musicGain) return
    const ctx = this.ctx

    // Sub-bass root (D1 = 36.71 Hz, D2 = 73.42 Hz)
    const subOsc = ctx.createOscillator()
    subOsc.type = 'sine'
    subOsc.frequency.setValueAtTime(36.71, ctx.currentTime)

    const subGain = ctx.createGain()
    subGain.gain.setValueAtTime(0, ctx.currentTime)
    subGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 3)

    subOsc.connect(subGain)
    subGain.connect(this.musicGain)
    subOsc.start()

    // Harmonic Fifth Drone (A2 = 110.0 Hz)
    const fifthOsc = ctx.createOscillator()
    fifthOsc.type = 'triangle'
    fifthOsc.frequency.setValueAtTime(110.0, ctx.currentTime)

    // Slow filter modulation
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(180, ctx.currentTime)
    filter.Q.setValueAtTime(3.5, ctx.currentTime)

    const fifthGain = ctx.createGain()
    fifthGain.gain.setValueAtTime(0, ctx.currentTime)
    fifthGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 4)

    fifthOsc.connect(filter)
    filter.connect(fifthGain)
    fifthGain.connect(this.musicGain)
    fifthOsc.start()

    // LFO for slow ambient breathing
    const lfo = ctx.createOscillator()
    lfo.frequency.setValueAtTime(0.04, ctx.currentTime) // 25s cycle
    const lfoGain = ctx.createGain()
    lfoGain.gain.setValueAtTime(80, ctx.currentTime)
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()

    this.activeVoices.push({
      stop: () => {
        try {
          subGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1)
          fifthGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1)
          setTimeout(() => {
            subOsc.stop()
            fifthOsc.stop()
            lfo.stop()
          }, 1100)
        } catch {}
      },
    })
  }

  /** Interstellar Voyage: Minor 9th chord pads, evolving detuned analog warmth */
  private synthInterstellar() {
    if (!this.ctx || !this.musicGain) return
    const ctx = this.ctx

    const chordFreqs = [55.0, 110.0, 164.81, 196.0, 246.94] // A1, A2, E3, G3, B3 (Am9)
    const gains: GainNode[] = []
    const oscs: OscillatorNode[] = []

    chordFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      osc.type = idx === 0 ? 'sine' : 'sawtooth'
      osc.frequency.setValueAtTime(freq + (idx * 0.15 - 0.3), ctx.currentTime)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(320 + idx * 40, ctx.currentTime)
      filter.Q.setValueAtTime(2.0, ctx.currentTime)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.08 / Math.sqrt(idx + 1), ctx.currentTime + 2.5 + idx * 0.5)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(this.musicGain!)

      osc.start()
      oscs.push(osc)
      gains.push(gain)
    })

    this.activeVoices.push({
      stop: () => {
        gains.forEach((g) => g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1))
        setTimeout(() => oscs.forEach((o) => o.stop()), 1100)
      },
    })
  }

  /** Cosmic Wonder: Ethereal crystalline FM bells, spacious reverberant pads */
  private synthCosmicWonder() {
    if (!this.ctx || !this.musicGain) return
    const ctx = this.ctx

    // Warm pad foundation (F2 = 87.31 Hz, C3 = 130.81 Hz, A3 = 220.0 Hz)
    const padFreqs = [87.31, 130.81, 174.61, 220.0]
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []

    padFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, ctx.currentTime)

      const g = ctx.createGain()
      g.gain.setValueAtTime(0, ctx.currentTime)
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 2 + i * 0.4)

      osc.connect(g)
      g.connect(this.musicGain!)
      osc.start()
      oscs.push(osc)
      gains.push(g)
    })

    // Random gentle crystalline chime generator
    const bellNotes = [349.23, 440.0, 523.25, 659.25, 698.46, 880.0]
    const playBell = () => {
      if (!this.isPlaying || !this.ctx || !this.musicGain) return
      const note = bellNotes[Math.floor(Math.random() * bellNotes.length)]
      const bOsc = ctx.createOscillator()
      bOsc.type = 'sine'
      bOsc.frequency.setValueAtTime(note, ctx.currentTime)

      const bGain = ctx.createGain()
      bGain.gain.setValueAtTime(0, ctx.currentTime)
      bGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.05)
      bGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 4.5)

      bOsc.connect(bGain)
      bGain.connect(this.musicGain)
      bOsc.start()
      bOsc.stop(ctx.currentTime + 4.6)
    }

    const interval = window.setInterval(playBell, 3800)

    this.activeVoices.push({
      stop: () => {
        clearInterval(interval)
        gains.forEach((g) => g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1))
        setTimeout(() => oscs.forEach((o) => o.stop()), 1100)
      },
    })
  }

  /** Stellar Exploration: Warm analog drone, solar pulsation LFO */
  private synthStellar() {
    if (!this.ctx || !this.musicGain) return
    const ctx = this.ctx

    // Warm C Major drone (C2 = 65.41 Hz, G2 = 98.0 Hz, E3 = 164.81 Hz)
    const freqs = [65.41, 98.0, 130.81, 164.81]
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator()
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(f, ctx.currentTime)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(260 + idx * 30, ctx.currentTime)

      const g = ctx.createGain()
      g.gain.setValueAtTime(0, ctx.currentTime)
      g.gain.linearRampToValueAtTime(0.14 / Math.sqrt(idx + 1), ctx.currentTime + 2)

      osc.connect(filter)
      filter.connect(g)
      g.connect(this.musicGain!)

      osc.start()
      oscs.push(osc)
      gains.push(g)
    })

    this.activeVoices.push({
      stop: () => {
        gains.forEach((g) => g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1))
        setTimeout(() => oscs.forEach((o) => o.stop()), 1100)
      },
    })
  }

  /** Solar System: Restrained, tranquil exploration */
  private synthSolarSystem() {
    if (!this.ctx || !this.musicGain) return
    const ctx = this.ctx

    // G Major ambient pad (G2 = 98.0 Hz, D3 = 146.83 Hz, B3 = 246.94 Hz)
    const freqs = [98.0, 146.83, 196.0, 246.94]
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, ctx.currentTime)

      const g = ctx.createGain()
      g.gain.setValueAtTime(0, ctx.currentTime)
      g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 2)

      osc.connect(g)
      g.connect(this.musicGain!)

      osc.start()
      oscs.push(osc)
      gains.push(g)
    })

    this.activeVoices.push({
      stop: () => {
        gains.forEach((g) => g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1))
        setTimeout(() => oscs.forEach((o) => o.stop()), 1100)
      },
    })
  }

  // =========================================================================
  // ENVIRONMENTAL & SCIENTIFIC AUDIO CUES
  // =========================================================================

  /** Subtle UI button click feedback */
  public playUiClick(variant: 'click' | 'navigate' | 'select' = 'click') {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain || this.isMuted) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    const startFreq = variant === 'navigate' ? 1200 : variant === 'select' ? 980 : 880
    const endFreq = variant === 'navigate' ? 600 : variant === 'select' ? 490 : 440
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.04)

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04)

    osc.connect(gain)
    gain.connect(this.sfxGain)
    osc.start()
    osc.stop(ctx.currentTime + 0.05)
  }

  /** Navigation arrival chime */
  public playArrivalChime() {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain || this.isMuted) return
    const ctx = this.ctx
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6 arpeggio
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07)

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.07)
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + idx * 0.07 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.07 + 1.2)

      osc.connect(gain)
      gain.connect(this.sfxGain!)
      osc.start(ctx.currentTime + idx * 0.07)
      osc.stop(ctx.currentTime + idx * 0.07 + 1.3)
    })
  }

  /** Supernova core collapse & explosion acoustic cue */
  public playSupernovaSound(phase: 'collapse' | 'shockwave' | 'remnant') {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain || this.isMuted) return
    const ctx = this.ctx

    if (phase === 'collapse') {
      // Infalling frequency glissando
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(400, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 1.2)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(800, ctx.currentTime)
      filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 1.2)

      gain.gain.setValueAtTime(0.01, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.8)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(this.sfxGain)
      osc.start()
      osc.stop(ctx.currentTime + 1.35)
    } else if (phase === 'shockwave') {
      // Colossal low-frequency sub-bass boom + expanding noise blast
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(75, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 3.5)

      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 4.0)

      osc.connect(gain)
      gain.connect(this.sfxGain)
      osc.start()
      osc.stop(ctx.currentTime + 4.1)
    }
  }

  /** Pulsar radio beam pulse chirp */
  public playPulsarPulse(frequencyHz: number = 15) {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain || this.isMuted) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(650, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.025)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(450, ctx.currentTime)
    filter.Q.setValueAtTime(4.0, ctx.currentTime)

    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)
    osc.start()
    osc.stop(ctx.currentTime + 0.035)
  }

  /** Spacecraft thruster engine sound (Travel Mode) */
  public setEngineThrust(thrust: number, boost: boolean) {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain || this.isMuted || thrust <= 0) {
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
      }
      return
    }

    const ctx = this.ctx
    if (!this.engineOsc) {
      this.engineOsc = ctx.createOscillator()
      this.engineOsc.type = 'triangle'
      this.engineOsc.frequency.setValueAtTime(55, ctx.currentTime)

      this.engineGain = ctx.createGain()
      this.engineGain.gain.setValueAtTime(0, ctx.currentTime)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(160, ctx.currentTime)

      this.engineOsc.connect(filter)
      filter.connect(this.engineGain)
      this.engineGain.connect(this.sfxGain)
      this.engineOsc.start()
    }

    const targetFreq = 55 + thrust * (boost ? 80 : 40)
    const targetGain = Math.min(0.2, thrust * (boost ? 0.2 : 0.12))
    if (this.engineOsc && this.engineGain) {
      this.engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.08)
      this.engineGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08)
    }
  }

  /** Relativistic warp drive sound */
  public playWarpSound(active: boolean) {
    if (!this.sfxEnabled || !this.ctx || !this.sfxGain || this.isMuted) return
    const ctx = this.ctx
    if (active) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 1.2)
      gain.gain.setValueAtTime(0.01, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.6)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3)
      osc.connect(gain)
      gain.connect(this.sfxGain)
      osc.start()
      osc.stop(ctx.currentTime + 1.35)
    }
  }
}

export const audio = new CosmicAudioEngine()
