import { create } from 'zustand'
import { BY_ID } from '../data/catalog'
import { TOUR } from '../data/tour'
import { flyTo, interrupt, nav, onInterrupt } from './nav'
import { MS_PER_DAY } from '../astro/ephemeris'
import { ship, initShipNear, cancelAutopilot } from '../travel/shipState'
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
  dataOpen: boolean
  navMapOpen: boolean
  error: string | null
  message: string | null
  datasetPoints: { id: string; name: string; pos: [number, number, number] }[]
  objectsVersion: number
  setPhase(p: Phase): void
  select(id: string | null): void
  travel(id: string): void
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
    leftOpen: true,
    rightOpen: true,
    dataOpen: false,
    navMapOpen: false,
    error: null,
    message: null,
    datasetPoints: [],
    objectsVersion: 0,
    setPhase: (p) => set({ phase: p }),
    select: (id) => set({ selectedId: id, rightOpen: id ? true : get().rightOpen }),
    travel: (id) => {
      clearDwell()
      const s = get()
      if (s.phase === 'tour') set({ tourStatus: 'interrupted' })
      set({ selectedId: id, breadcrumbs: [...s.breadcrumbs, id].slice(-8) })
      initiateTravel(id, get().simMs, {})
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
      const currentTarget = targetId ?? get().selectedId ?? 'earth'
      initShipNear(currentTarget, get().simMs)
      set({ phase: 'travel', navMapOpen: false, selectedId: currentTarget })
    },
    exitTravelMode: () => {
      cancelAutopilot()
      nav.pos = [...ship.pos]
      nav.quat.copy(ship.quat)
      set({ phase: 'explore', navMapOpen: false })
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
