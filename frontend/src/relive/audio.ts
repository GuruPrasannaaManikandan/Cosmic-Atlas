/**
 * Relive Mission audio manager. Synthesised sound design only (Web Audio, no recordings), so there is nothing to
 * license; the UI says it is not archival audio. Follows the app's global mute and volume (audio engine).
 *
 * Layers: engine rumble (filtered noise, follows the thrust of whatever is burning and thins out in vacuum, where it
 * stands for structure-borne vibration), airflow (dynamic-pressure proxy during ascent and entry), and one-shot cues
 * fired by the player when playback crosses an event (ignition, staging, pyro, parachute, bounce, touchdown, splash,
 * sonic, comms beep).
 */
import { audio } from '../audio/CosmicAudioEngine'
import type { AudioCue } from './types'

class MissionAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rumble: GainNode | null = null
  private rumbleLP: BiquadFilterNode | null = null
  private air: GainNode | null = null
  private airBP: BiquadFilterNode | null = null
  private noise: AudioBuffer | null = null
  private srcs: AudioBufferSourceNode[] = []
  enabled = true

  private ensure() {
    if (this.ctx || typeof window === 'undefined') return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    // brown noise buffer
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 }
    this.noise = buf
    const loop = (dest: AudioNode) => {
      const s = ctx.createBufferSource()
      s.buffer = buf; s.loop = true; s.connect(dest); s.start()
      this.srcs.push(s)
    }
    this.rumbleLP = ctx.createBiquadFilter(); this.rumbleLP.type = 'lowpass'; this.rumbleLP.frequency.value = 140
    this.rumble = ctx.createGain(); this.rumble.gain.value = 0
    this.rumbleLP.connect(this.rumble); this.rumble.connect(this.master)
    loop(this.rumbleLP)
    this.airBP = ctx.createBiquadFilter(); this.airBP.type = 'bandpass'; this.airBP.frequency.value = 700; this.airBP.Q.value = 0.6
    this.air = ctx.createGain(); this.air.gain.value = 0
    this.airBP.connect(this.air); this.air.connect(this.master)
    loop(this.airBP)
  }

  async start() {
    this.ensure()
    try { await this.ctx?.resume() } catch { /* autoplay policy: resumes on the next gesture */ }
  }

  private level() {
    return this.enabled && !audio.getIsMuted() ? audio.getVolume() : 0
  }

  /** per frame: thrust 0..1 (sum of burning engines, normalised), pressure 0..1, airflow 0..1 */
  update(thrust: number, pressure: number, airflow: number, paused: boolean) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.rumble || !this.air || !this.rumbleLP || !this.airBP) return
    const now = ctx.currentTime
    this.master.gain.setTargetAtTime(paused ? 0 : this.level() * 0.9, now, 0.15)
    const r = Math.min(1, thrust) * (0.25 + 0.75 * pressure)
    this.rumble.gain.setTargetAtTime(r * 0.9, now, 0.12)
    this.rumbleLP.frequency.setTargetAtTime(70 + 260 * pressure * Math.min(1, thrust), now, 0.2)
    this.air.gain.setTargetAtTime(Math.min(1, airflow) * 0.35, now, 0.2)
    this.airBP.frequency.setTargetAtTime(400 + 1400 * Math.min(1, airflow), now, 0.3)
  }

  cue(c: AudioCue) {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noise || this.level() <= 0) return
    const now = ctx.currentTime
    const g = ctx.createGain()
    g.connect(this.master)
    const burst = (dur: number, f: number, q: number, peak: number, type: BiquadFilterType = 'lowpass') => {
      const s = ctx.createBufferSource(); s.buffer = this.noise
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q
      s.connect(fl); fl.connect(g)
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(peak, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      s.start(now, Math.random() * 2); s.stop(now + dur + 0.05)
    }
    const tone = (f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator(); o.type = type
      o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + dur)
      o.connect(g)
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(peak, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      o.start(now); o.stop(now + dur + 0.05)
    }
    switch (c) {
      case 'ignition': burst(2.4, 220, 0.7, 1.2); break
      case 'staging': burst(0.9, 900, 0.8, 1.4, 'bandpass'); break
      case 'pyro': burst(0.25, 2600, 1.2, 1.0, 'bandpass'); break
      case 'chute': burst(1.4, 1200, 0.5, 0.7, 'highpass'); break
      case 'bounce': tone(90, 40, 0.5, 1.1, 'triangle'); break
      case 'touchdown': tone(70, 35, 0.8, 0.9, 'triangle'); break
      case 'splash': burst(2.2, 600, 0.4, 1.2); break
      case 'sonic': burst(0.6, 400, 0.6, 1.0); break
      case 'beep': tone(1250, 1250, 0.22, 0.25, 'square'); break
    }
  }

  stop() {
    for (const s of this.srcs) { try { s.stop() } catch { /* already stopped */ } }
    this.srcs = []
    const ctx = this.ctx
    this.ctx = null
    this.master = this.rumble = this.air = null
    this.rumbleLP = this.airBP = null
    ctx?.close().catch(() => {})
  }
}

export const missionAudio = new MissionAudio()
