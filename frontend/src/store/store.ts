import { create } from 'zustand'
import { BY_ID } from '../data/catalog'
import { TOUR } from '../data/tour'
import { flyTo, interrupt, nav, onInterrupt, updateNearest } from './nav'
import { len, sub, SUN_POS } from '../astro/coords'
import { positionOf } from '../data/catalog'
import { MS_PER_DAY } from '../astro/ephemeris'
import { ship, initShipNear, initShipAt, cancelAutopilot, engageAutopilot } from '../travel/shipState'
import { initiateTravel, setTravelArrivalHandler, cancelTravel } from '../travel/travelEngine'

export type Phase = 'intro' | 'explore' | 'tour' | 'travel'
export type TourStatus = 'idle' | 'flying' | 'dwelling' | 'paused' | 'interrupted' | 'done'
export type Quality = 'high' | 'balanced' | 'performance'

interface State {
  phase: Phase
  selectedId: string | null
  breadcrumbs: string[]
  simMs: number
  playing: boolean
  daysPerSec: number
  tourIndex: number
  tourStatus: TourStatus
  visited: string[]
  quality: Quality
  showStats: boolean
  showOrbits: boolean
  showGrid: boolean
  showLabels: boolean
  leftOpen: boolean
  rightOpen: boolean
  /** Timeline (Time Engine) shown on demand */
  timeOpen: boolean
  dataOpen: boolean
  navMapOpen: boolean
  error: string | null
  message: string | null
  datasetPoints: { id: string; name: string; pos: [number, number, number] }[]
  objectsVersion: number
  /** planetary surface exploration: the active site id (src/surface/sites.ts), null in orbit */
  surfaceSiteId: string | null
  enterSurface(siteId: string): void
  exitSurface(): void
  setPhase(p: Phase): void
  select(id: string | null): void
  travel(id: string, instant?: boolean, viewDistanceLy?: number): void
  goHome(): void
  setSim(ms: number): void
  setPlaying(p: boolean): void
  setRate(d: number): void
  startTour(): void
  tourPause(): void
  tourResume(): void
  tourSkip(): void
  tourExit(): void
  enterTravelMode(targetId?: string): void
  exitTravelMode(): void
  set(p: Partial<State>): void
}

let dwellTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Orbital view saved when descending to a surface. The camera is stored RELATIVE to the body it was following, so
 * if the simulation clock is moved while on the surface (e.g. to the Apollo 11 date) the view returns next to the
 * same body instead of to an empty point in space.
 */
let surfaceReturn: {
  phase: Phase
  bodyId: string | null
  offset: [number, number, number]
  pos: [number, number, number]
  quat: [number, number, number, number]
  followId: string | null
  selectedId: string | null
  playing: boolean
} | null = null
export const getSurfaceReturn = () => surfaceReturn
const clearDwell = () => {
  if (dwellTimer) {
    clearTimeout(dwellTimer)
    dwellTimer = null
  }
}

export const useStore = create<State>((set, get) => {
  const runStep = (index: number) => {
    clearDwell()
    if (index >= TOUR.length) {
      set({ tourStatus: 'done', tourIndex: TOUR.length - 1 })
      return
    }
    const step = TOUR[index]
    set({ tourIndex: index, tourStatus: 'flying', selectedId: step.target })
    initiateTravel(step.target, get().simMs, {
      onArrive: () => {
        set((s) => ({
          tourStatus: 'dwelling',
          visited: s.visited.includes(step.target) ? s.visited : [...s.visited, step.target],
          breadcrumbs: [...get().breadcrumbs, step.target].slice(-8),
        }))
        if (index === TOUR.length - 1) {
          dwellTimer = setTimeout(() => set({ tourStatus: 'done' }), 500)
          return
        }
        dwellTimer = setTimeout(
          () => {
            if (get().tourStatus === 'dwelling') runStep(index + 1)
          },
          step.dwellMs ?? 4500
        )
      },
    })
  }

  // user input during a flight interrupts the tour; they can resume later
  onInterrupt(() => {
    const s = get()
    if (s.phase === 'tour' && s.tourStatus === 'flying') {
      clearDwell()
      set({ tourStatus: 'interrupted' })
    }
  })

  return {
    phase: 'intro',
    selectedId: null,
    breadcrumbs: [],
    simMs: Date.now(),
    playing: false,
    daysPerSec: 1,
    tourIndex: 0,
    tourStatus: 'idle',
    visited: [],
    quality: 'balanced',
    showStats: false,
    showOrbits: true,
    showGrid: false,
    showLabels: true,
    // contextual UI: the 3-D universe is the primary interface - panels open on demand
    leftOpen: false,
    rightOpen: false,
    timeOpen: false,
    dataOpen: false,
    navMapOpen: false,
    error: null,
    message: null,
    datasetPoints: [],
    objectsVersion: 0,
    surfaceSiteId: null,
    setPhase: (p) => set({ phase: p }),
    // selecting shows a compact selection chip; the Inspector opens on demand (chip 'Details' or the I key)
    select: (id) => set({ selectedId: id, rightOpen: id ? get().rightOpen : false }),
    travel: (id, instant = false, viewDistanceLy?: number) => {
      clearDwell()
      const s = get()
      if (s.phase === 'travel') {
        // In Travel Mode every destination request (search, label double-click, breadcrumbs) is flown by the
        // SPACECRAFT from its current position - never by the detached observer camera.
        set({ selectedId: id })
        engageAutopilot(id, s.simMs)
        return
      }
      if (s.phase === 'tour') set({ tourStatus: 'interrupted' })
      set({ selectedId: id, breadcrumbs: [...s.breadcrumbs, id].slice(-8) })
      initiateTravel(id, get().simMs, { instant, viewDistanceLy })
    },
    goHome: () => {
      clearDwell()
      set({ phase: 'explore', selectedId: 'earth', tourStatus: 'idle' })
      initiateTravel('earth', get().simMs, {})
    },
    setSim: (ms) => set({ simMs: ms }),
    setPlaying: (p) => set({ playing: p }),
    setRate: (d) => set({ daysPerSec: d }),
    startTour: () => {
      interrupt()
      nav.followId = null
      set({ phase: 'tour', visited: [], breadcrumbs: [], tourIndex: 0, tourStatus: 'flying', leftOpen: false })
      runStep(0)
    },
    tourPause: () => {
      clearDwell()
      nav.flight = null
      set({ tourStatus: 'paused' })
    },
    tourResume: () => {
      const s = get()
      runStep(s.tourStatus === 'done' ? 0 : s.tourIndex)
    },
    tourSkip: () => {
      runStep(Math.min(get().tourIndex + 1, TOUR.length - 1))
    },
    tourExit: () => {
      clearDwell()
      nav.flight = null
      set({ phase: 'explore', tourStatus: 'idle', leftOpen: true })
    },
    enterTravelMode: (targetId) => {
      clearDwell()
      interrupt()
      nav.followId = null
      const ms = get().simMs
      const fallback = targetId ?? get().selectedId ?? 'earth'
      // Continuity: inside the Solar System the spacecraft starts exactly where the observer is (position and
      // orientation, at rest relative to the nearest body). Only from cosmic/galactic views (e.g. the welcome
      // screen) is it placed next to the requested body to begin a journey.
      const inSystem = len(sub(nav.pos, SUN_POS)) < 0.01
      if (inSystem) initShipAt(nav.pos, nav.quat, ms, nav.followId ?? get().selectedId)
      else initShipNear(fallback, ms)
      updateNearest(ms)
      set({ phase: 'travel', navMapOpen: false, selectedId: inSystem ? get().selectedId ?? ship.refBodyId : fallback })
    },
    exitTravelMode: () => {
      cancelAutopilot()
      nav.pos = [...ship.pos]
      nav.quat.copy(ship.quat)
      // keep co-moving with the body the ship was flying near, so time does not carry it away from the view
      nav.followId = ship.refBodyId && BY_ID[ship.refBodyId] ? ship.refBodyId : null
      nav.lastFollowPos = nav.followId ? positionOf(BY_ID[nav.followId], get().simMs) : null
      set({ phase: 'explore', navMapOpen: false })
    },
    enterSurface: (siteId) => {
      if (get().surfaceSiteId) return
      if (get().phase === 'travel') get().exitTravelMode()
      cancelTravel()
      interrupt()
      const s = get()
      const bodyId = nav.followId ?? s.selectedId
      const bp = bodyId && BY_ID[bodyId] ? positionOf(BY_ID[bodyId], s.simMs) : null
      surfaceReturn = {
        phase: s.phase === 'travel' ? 'travel' : s.phase,
        bodyId: bp ? bodyId : null,
        offset: bp ? (sub(nav.pos, bp) as [number, number, number]) : [0, 0, 0],
        pos: [...nav.pos] as [number, number, number],
        quat: [nav.quat.x, nav.quat.y, nav.quat.z, nav.quat.w],
        followId: nav.followId,
        selectedId: s.selectedId,
        playing: s.playing,
      }
      set({ surfaceSiteId: siteId, playing: false, navMapOpen: false })
    },
    exitSurface: () => {
      const r = surfaceReturn
      surfaceReturn = null
      if (!r) return set({ surfaceSiteId: null })
      const ms = get().simMs
      if (r.bodyId && BY_ID[r.bodyId]) {
        const bp = positionOf(BY_ID[r.bodyId], ms)
        nav.pos = [bp[0] + r.offset[0], bp[1] + r.offset[1], bp[2] + r.offset[2]]
      } else nav.pos = [...r.pos]
      nav.quat.set(r.quat[0], r.quat[1], r.quat[2], r.quat[3])
      nav.followId = r.followId
      nav.lastFollowPos = r.followId && BY_ID[r.followId] ? positionOf(BY_ID[r.followId], ms) : null
      set({ surfaceSiteId: null, selectedId: r.selectedId, playing: r.playing })
      if (r.phase === 'travel') get().enterTravelMode()
    },
    set: (p) => set(p as never),
  }
})

setTravelArrivalHandler((id) => {
  useStore.getState().select(id)
})

export const simDate = () => new Date(useStore.getState().simMs)
export function advanceSim(dtSec: number) {
  const s = useStore.getState()
  if (!s.playing) return
  s.setSim(s.simMs + dtSec * s.daysPerSec * MS_PER_DAY)
}
export const hasObject = (id: string) => !!BY_ID[id]
if (typeof window !== 'undefined') (window as any).__store = useStore

