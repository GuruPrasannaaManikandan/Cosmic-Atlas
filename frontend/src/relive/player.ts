/**
 * Relive Mission player — the mission state machine, the playback clock, snapshots and resume points.
 *
 *   idle ──open()──▶ intro ──play()──▶ playing ⇄ paused ──(end of script)──▶ ended ──close()──▶ idle
 *                                         ▲                                   │
 *                                         └────────── restart() / seek() ─────┘
 *
 * The clock runs on requestAnimationFrame outside React: `clock` is read by the 3-D scene every frame, and the store
 * is updated at ~10 Hz for the HUD. Crossing an event fires the listeners (audio cues, the event card).
 *
 * Snapshot: opening a mission saves the explorer's present state (selection, simulation clock, panels) and closing
 * restores it exactly. Resume: the playback position is remembered per mission in localStorage.
 */
import { create } from 'zustand'
import { APOLLO_11 } from './scripts/apollo11'
import { OPPORTUNITY } from './scripts/opportunity'
import type { MissionEvent, MissionScript } from './types'
import { eventIndexAt, eventsCrossed, metAt, phaseAt, playAt, playLength, rateAt } from './timeline'
import { useStore } from '../store/store'

export const RELIVE_SCRIPTS: Record<string, MissionScript> = { [APOLLO_11.id]: APOLLO_11, [OPPORTUNITY.id]: OPPORTUNITY }

export type ReliveStatus = 'idle' | 'intro' | 'playing' | 'paused' | 'ended'
export const SPEEDS = [0.5, 1, 2, 4, 8]

interface ReliveUI {
  id: string | null
  status: ReliveStatus
  u: number
  t: number
  length: number
  speed: number
  phaseId: string | null
  eventIdx: number
  /** the event card currently shown (index), with the time it was raised */
  card: { i: number; at: number } | null
  rate: number
  resumeU: number | null
  set: (p: Partial<ReliveUI>) => void
}

export const useRelive = create<ReliveUI>((set) => ({
  id: null, status: 'idle', u: 0, t: 0, length: 0, speed: 1, phaseId: null, eventIdx: -1, card: null, rate: 1, resumeU: null,
  set: (p) => set(p),
}))

/** read every frame by the scene (no React) */
export const clock = { u: 0, t: 0, script: null as MissionScript | null, wall: 0 }

type Listener = (e: MissionEvent, script: MissionScript) => void
const listeners = new Set<Listener>()
export const onReliveEvent = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn) } }

const KEY = (id: string) => `cosmic-atlas.relive.${id}`
const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v) } catch { /* private mode */ } },
}

interface Snapshot { phase: string; selectedId: string | null; simMs: number; playing: boolean; leftOpen: boolean; rightOpen: boolean; timeOpen: boolean; dataOpen: boolean }
let snapshot: Snapshot | null = null
/** expeditions: what happens when the flight completes (open the surface, return to orbit) */
let onComplete: (() => void) | null = null
let completed = false
let raf = 0
let last = 0
let lastUi = 0
let lastSave = 0

function tick(now: number) {
  raf = requestAnimationFrame(tick)
  const S = useRelive.getState()
  const sc = clock.script
  if (!sc) return
  const dt = Math.min(0.1, (now - (last || now)) / 1000)
  last = now
  clock.wall += dt
  if (S.status === 'playing') {
    const u0 = clock.u
    clock.u = Math.min(S.length, clock.u + dt * S.speed)
    const t0 = clock.t
    clock.t = metAt(sc.segments, clock.u)
    const crossed = eventsCrossed(sc.events, t0, clock.t)
    if (crossed.length) {
      for (const e of crossed) for (const fn of listeners) fn(e, sc)
      const last = crossed[crossed.length - 1]
      S.set({ card: { i: sc.events.indexOf(last), at: clock.wall } })
    }
    if (clock.u >= S.length && u0 < S.length) {
      S.set({ status: 'ended' })
      save(true)
      if (sc.kind === 'expedition') relive.complete()
    }
    if (now - lastSave > 4000) { lastSave = now; save() }
  }
  if (now - lastUi > 100) {
    lastUi = now
    S.set({ u: clock.u, t: clock.t, phaseId: phaseAt(sc.phases, clock.t).id, eventIdx: eventIndexAt(sc.events, clock.t), rate: rateAt(sc.segments, clock.u) })
  }
}

function save(done = false) {
  const S = useRelive.getState()
  if (!S.id || clock.script?.kind === 'expedition') return
  store.set(KEY(S.id), done ? '0' : String(Math.round(clock.u * 10) / 10))
}

export const relive = {
  open(id: string) {
    const sc = RELIVE_SCRIPTS[id]
    if (sc) relive.openScript(sc)
  },
  /** open any script; expeditions auto-play and call `done` when they finish (instead of showing an ending) */
  openScript(sc: MissionScript, done?: () => void) {
    RELIVE_SCRIPTS[sc.id] = sc
    onComplete = done ?? null
    completed = false
    const id = sc.id
    const st = useStore.getState()
    if (st.surfaceSiteId) st.exitSurface()
    if (useStore.getState().phase === 'travel') useStore.getState().exitTravelMode()
    if (useStore.getState().phase === 'tour') useStore.getState().tourExit()
    const g = useStore.getState()
    if (!snapshot) snapshot = { phase: g.phase, selectedId: g.selectedId, simMs: g.simMs, playing: g.playing, leftOpen: g.leftOpen, rightOpen: g.rightOpen, timeOpen: g.timeOpen, dataOpen: g.dataOpen }
    useStore.getState().set({ playing: false, navMapOpen: false, dataOpen: false })
    clock.script = sc
    clock.u = 0
    clock.t = metAt(sc.segments, 0)
    const saved = Number(store.get(KEY(id)) ?? '0')
    const L = playLength(sc.segments)
    const exp = sc.kind === 'expedition'
    useRelive.getState().set({ id, status: exp ? 'playing' : 'intro', u: 0, t: clock.t, length: L, speed: 1, card: null, phaseId: sc.phases[0].id, eventIdx: -1, resumeU: !exp && saved > 5 && saved < L - 5 ? saved : null })
    if (!raf && typeof requestAnimationFrame !== 'undefined') { last = 0; raf = requestAnimationFrame(tick) }
  },
  play() {
    const S = useRelive.getState()
    if (!S.id) return
    if (S.status === 'ended') relive.seek(0)
    S.set({ status: 'playing' })
  },
  pause() {
    const S = useRelive.getState()
    if (S.status === 'playing') { S.set({ status: 'paused' }); save() }
  },
  toggle() {
    const S = useRelive.getState()
    if (S.status === 'playing') relive.pause()
    else relive.play()
  },
  seek(u: number) {
    const S = useRelive.getState()
    const sc = clock.script
    if (!sc) return
    clock.u = Math.max(0, Math.min(S.length, u))
    clock.t = metAt(sc.segments, clock.u)
    S.set({ u: clock.u, t: clock.t, card: null, status: S.status === 'ended' ? 'paused' : S.status === 'intro' ? 'paused' : S.status, eventIdx: eventIndexAt(sc.events, clock.t), phaseId: phaseAt(sc.phases, clock.t).id })
  },
  /** jump just before an event (2 s of playback lead-in) and show its card */
  seekEvent(i: number) {
    const sc = clock.script
    if (!sc) return
    const e = sc.events[Math.max(0, Math.min(sc.events.length - 1, i))]
    relive.seek(Math.max(0, playAt(sc.segments, e.t) - 2))
    useRelive.getState().set({ card: { i: sc.events.indexOf(e), at: clock.wall } })
  },
  nextEvent() {
    const sc = clock.script
    if (!sc) return
    const i = sc.events.findIndex((e) => e.t > clock.t + 0.5)
    if (i >= 0) relive.seekEvent(i)
  },
  prevEvent() {
    const sc = clock.script
    if (!sc) return
    let i = -1
    for (let k = 0; k < sc.events.length; k++) if (sc.events[k].t < clock.t - 3 * Math.max(1, rateAt(sc.segments, clock.u))) i = k
    relive.seekEvent(Math.max(0, i))
  },
  /** jump to a mission time (seconds of MET) */
  seekMet(t: number) {
    const sc = clock.script
    if (sc) relive.seek(playAt(sc.segments, t))
  },
  seekPhase(id: string) {
    const sc = clock.script
    const p = sc?.phases.find((x) => x.id === id)
    if (sc && p) relive.seek(playAt(sc.segments, p.t0) + 0.01)
  },
  setSpeed(s: number) {
    useRelive.getState().set({ speed: s })
  },
  faster() {
    const s = useRelive.getState().speed
    relive.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)])
  },
  slower() {
    const s = useRelive.getState().speed
    relive.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)])
  },
  resume() {
    const r = useRelive.getState().resumeU
    if (r !== null) relive.seek(r)
    useRelive.getState().set({ resumeU: null })
    relive.play()
  },
  /** expedition finished (or skipped to its end): hand over to whatever comes next, without restoring the old state */
  complete() {
    if (completed) return
    completed = true
    const done = onComplete
    snapshot = null
    window.setTimeout(() => { relive.close(); done?.() }, 350)
  },
  /** skip an expedition flight to its end */
  finish() {
    const S = useRelive.getState()
    relive.seek(S.length)
    S.set({ status: 'ended' })
    relive.complete()
  },
  /** leave the mission and return to the explorer exactly as it was */
  close() {
    save(useRelive.getState().status === 'ended')
    if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf)
    raf = 0
    clock.script = null
    useRelive.getState().set({ id: null, status: 'idle', card: null })
    onComplete = null
    if (snapshot) {
      const s = snapshot
      snapshot = null
      useStore.getState().set({ phase: s.phase as never, selectedId: s.selectedId, simMs: s.simMs, playing: s.playing, leftOpen: s.leftOpen, rightOpen: s.rightOpen, timeOpen: s.timeOpen, dataOpen: s.dataOpen })
    }
  },
  active: () => useRelive.getState().id !== null,
}

if (typeof window !== 'undefined') (window as unknown as { __relive?: unknown }).__relive = { relive, state: () => useRelive.getState(), clock }
