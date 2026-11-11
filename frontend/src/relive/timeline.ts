/**
 * Pure timeline maths for Relive Mission: playback ↔ mission time, phase / event lookup, published-telemetry
 * interpolation, and the camera director's shot selection with blending. No React, no three.js — unit-tested.
 */
import type { Met, MissionEvent, MissionScript, Phase, Segment, Shot, ShotCue, TelemetryTrack } from './types'

/** total playback length at 1× (seconds) */
export function playLength(segs: Segment[]): number {
  return segs.reduce((s, g) => s + g.play, 0)
}

/** playback seconds → MET. Clamped to the script. */
export function metAt(segs: Segment[], u: number): Met {
  if (!segs.length) return 0
  if (u <= 0) return segs[0].t0
  let acc = 0
  for (const g of segs) {
    if (u <= acc + g.play) return g.t0 + ((u - acc) / g.play) * (g.t1 - g.t0)
    acc += g.play
  }
  return segs[segs.length - 1].t1
}

/** MET → playback seconds (inverse of metAt) */
export function playAt(segs: Segment[], t: Met): number {
  if (!segs.length) return 0
  let acc = 0
  for (const g of segs) {
    if (t <= g.t1) return acc + Math.max(0, (t - g.t0) / (g.t1 - g.t0)) * g.play
    acc += g.play
  }
  return acc
}

/** mission seconds per playback second at u (the current time compression) */
export function rateAt(segs: Segment[], u: number): number {
  let acc = 0
  for (const g of segs) {
    if (u < acc + g.play) return (g.t1 - g.t0) / g.play
    acc += g.play
  }
  const g = segs[segs.length - 1]
  return g ? (g.t1 - g.t0) / g.play : 1
}

export function phaseAt(phases: Phase[], t: Met): Phase {
  for (const p of phases) if (t >= p.t0 && t < p.t1) return p
  return t < phases[0].t0 ? phases[0] : phases[phases.length - 1]
}

/** index of the last event at or before t (-1 before the first) */
export function eventIndexAt(events: MissionEvent[], t: Met): number {
  let lo = 0, hi = events.length - 1, ans = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (events[m].t <= t) { ans = m; lo = m + 1 } else hi = m - 1
  }
  return ans
}

/** events crossed when MET moved from a (exclusive) to b (inclusive), forward only */
export function eventsCrossed(events: MissionEvent[], a: Met, b: Met): MissionEvent[] {
  if (b <= a) return []
  return events.filter((e) => e.t > a && e.t <= b)
}

export interface Interp { v: number; exact: boolean; at?: Met }

/**
 * Value of a published track at t: exact when t is a sample time; otherwise interpolated between the two published
 * neighbours (log-linear for distances spanning orders of magnitude, linear otherwise). Outside the samples: null.
 */
export function sampleTrack(tr: TelemetryTrack, t: Met): Interp | null {
  const s = tr.samples
  if (tr.interp === false) {
    let best: { t: Met; v: number } | null = null
    for (const x of s) if (x.t <= t + 0.5 && t - x.t < 25) best = x
    return best ? { v: best.v, exact: true, at: best.t } : null
  }
  if (!s.length || t < s[0].t || t > s[s.length - 1].t) return null
  for (let i = 0; i < s.length; i++) {
    if (Math.abs(s[i].t - t) < 0.5) return { v: s[i].v, exact: true, at: s[i].t }
    if (i > 0 && t < s[i].t) {
      const a = s[i - 1], b = s[i]
      const f = (t - a.t) / (b.t - a.t)
      const logish = a.v > 0 && b.v > 0 && Math.max(a.v, b.v) / Math.min(a.v, b.v) > 20
      const v = logish ? Math.exp(Math.log(a.v) + f * (Math.log(b.v) - Math.log(a.v))) : a.v + f * (b.v - a.v)
      return { v, exact: false }
    }
  }
  return { v: s[s.length - 1].v, exact: true, at: s[s.length - 1].t }
}

export function track(script: MissionScript, name: TelemetryTrack['name']): TelemetryTrack | undefined {
  return script.telemetry.find((t) => t.name === name)
}

/** the camera director: the active shot cue at t, the previous one, and the blend weight between them (0..1) */
export function shotAt(cues: ShotCue[], t: Met, blendMet: number): { shot: Shot; prev: Shot; w: number; label?: string } {
  let i = 0
  for (let k = 0; k < cues.length; k++) if (cues[k].t <= t) i = k
  const cur = cues[i], prev = cues[Math.max(0, i - 1)]
  const w = i === 0 ? 1 : Math.min(1, Math.max(0, (t - cur.t) / Math.max(1e-6, blendMet)))
  const e = w * w * (3 - 2 * w) // smoothstep
  return { shot: cur.shot, prev: prev.shot, w: e, label: cur.label }
}

export function lerpShot(a: Shot, b: Shot, w: number): Shot {
  if (a.kind !== b.kind) return w < 0.5 ? a : b
  const L = (x = 0, y = 0) => x + (y - x) * w
  return { kind: b.kind, dist: Math.exp(L(Math.log(a.dist), Math.log(b.dist))), elev: L(a.elev, b.elev), azim: L(a.azim, b.azim), fov: L(a.fov ?? 50, b.fov ?? 50) }
}

/** "L+201 d 01:34:44" for long missions */
export function formatDays(t: Met): string {
  const s = Math.abs(t)
  const d = Math.floor(s / 86400)
  const p = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return `L${t < 0 ? '−' : '+'}${d ? d + ' d ' : ''}${p(h)}:${p(m)}:${p(sec)}`
}
export const formatClock = (style: 'get' | 'days', t: Met) => (style === 'days' ? formatDays(t) : formatMet(t))

/** "T−00:00:06", "T+002:44:16" (hhh:mm:ss GET, as NASA's tables print it) */
export function formatMet(t: Met): string {
  const s = Math.abs(t)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `T${t < 0 ? '−' : '+'}${p(h, 3)}:${p(m)}:${p(sec)}`
}

export function formatUtc(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  return `${p(d.getUTCDate())} ${mon} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
}

/** "+ 3 d 2 h", "45 s" … for the time-compression chip */
export function formatRate(r: number): string {
  if (r < 1.5) return 'real time'
  if (r < 90) return `${Math.round(r)}× (seconds per second)`
  if (r < 5400) return `${Math.round(r / 60)} min per second`
  if (r < 129600) return `${(r / 3600).toFixed(r < 36000 ? 1 : 0)} h per second`
  return `${(r / 86400).toFixed(1)} days per second`
}

/** validation used by the tests and at load (dev): monotonic segments covering the phases, sorted events */
export function validateScript(s: MissionScript): string[] {
  const err: string[] = []
  for (let i = 0; i < s.segments.length; i++) {
    const g = s.segments[i]
    if (!(g.t1 > g.t0) || !(g.play > 0)) err.push(`segment ${i} not increasing`)
    if (i > 0 && Math.abs(s.segments[i - 1].t1 - g.t0) > 1e-6) err.push(`segment ${i} not contiguous`)
  }
  for (let i = 1; i < s.events.length; i++) if (s.events[i].t < s.events[i - 1].t) err.push(`event ${s.events[i].id} out of order`)
  for (let i = 1; i < s.phases.length; i++) if (Math.abs(s.phases[i].t0 - s.phases[i - 1].t1) > 1e-6) err.push(`phase ${s.phases[i].id} not contiguous`)
  const t0 = s.segments[0]?.t0, t1 = s.segments[s.segments.length - 1]?.t1
  if (s.phases[0].t0 !== t0 || s.phases[s.phases.length - 1].t1 !== t1) err.push('phases and segments cover different spans')
  for (const e of s.events) if (e.t < t0 || e.t > t1) err.push(`event ${e.id} outside the playback span`)
  for (const e of s.events) if (e.basis !== 'sourced' && !e.timeNote) err.push(`event ${e.id}: ${e.basis} time without a note`)
  return err
}
