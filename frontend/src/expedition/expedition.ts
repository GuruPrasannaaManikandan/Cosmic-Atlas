/**
 * Expedition: Earth → Moon / Mars, then down to a surface site (Abandoned but Not Forgotten, Experience A).
 *
 * Stages: departure (at Earth) → cruise → approach → arrival (mission-specific: the Apollo-style powered descent on the
 * Moon, an entry-descent-landing style camera descent on Mars) → surface. The flight is the app's existing cinematic
 * camera flight, time-compressed; it is NOT a reconstructed trajectory and there is no launch-vehicle model yet (no
 * sourced asset), and the overlay says so. The real cruise time of the site's mission is shown, DERIVED from the
 * catalogue's launch and landing dates.
 *
 * The flight stays autonomous: while an expedition runs, the input manager is in UI_INTERACTION (no WASD / arrows
 * reach the camera), so the keyboard cannot cancel it by accident. "Skip" goes straight to the surface.
 */
import { create } from 'zustand'
import { useStore } from '../store/store'
import { initiateTravel, cancelTravel, subscribeTravelEngine, travelEngineState } from '../travel/travelEngine'
import { defaultSiteFor, UNITY_SITE_BY_ID, SITE_BY_ID } from '../surface/sites'
import { MISSION_BY_ID, dateMs } from '../missions'

export type ExpeditionStage = 'idle' | 'departure' | 'cruise' | 'approach' | 'arrival'
export type ExpeditionDest = 'moon' | 'mars'

interface ExpeditionUI {
  stage: ExpeditionStage
  dest: ExpeditionDest | null
  siteId: string | null
  /** 0..1 within the flight */
  progress: number
  set: (p: Partial<ExpeditionUI>) => void
}

export const useExpedition = create<ExpeditionUI>((set) => ({ stage: 'idle', dest: null, siteId: null, progress: 0, set: (p) => set(p) }))

const DEPARTURE_MS = 3600
let departureTimer: number | null = null
let unsub: (() => void) | null = null
/** the site whose surface should open with its arrival sequence (consumed once by the surface) */
let pendingArrival: string | null = null

export const STAGE_TEXT: Record<ExpeditionDest, Record<Exclude<ExpeditionStage, 'idle'>, { title: string; text: string }>> = {
  moon: {
    departure: { title: 'Earth departure', text: 'Leaving Earth for the Moon. Apollo crews left Earth orbit with a translunar injection burn of the Saturn V third stage.' },
    cruise: { title: 'Translunar coast', text: 'Coasting across the 384,400 km to the Moon.' },
    approach: { title: 'Lunar approach', text: 'The Moon fills the view. Apollo crews entered lunar orbit before the lunar module separated.' },
    arrival: { title: 'Powered descent', text: 'The lunar module descends on its engine to the landing site.' },
  },
  mars: {
    departure: { title: 'Earth departure', text: 'Leaving Earth for Mars. A Mars cruise follows a transfer orbit around the Sun lasting months, not a straight line.' },
    cruise: { title: 'Interplanetary cruise', text: 'Crossing the inner solar system toward Mars.' },
    approach: { title: 'Mars approach', text: 'Mars grows ahead. Rovers do not stop in orbit: they enter the atmosphere directly from their approach path.' },
    arrival: { title: 'Entry, descent and landing', text: 'Through the thin CO₂ atmosphere to the surface.' },
  },
}

/** the real mission's launch → landing time, DERIVED from the catalogue dates of the site's mission */
export function realCruise(siteId: string | null): { days: number; mission: string; sources: string[] } | null {
  if (!siteId) return null
  const mid = (UNITY_SITE_BY_ID[siteId] ?? SITE_BY_ID[siteId])?.missionIds[0]
  const m = mid ? MISSION_BY_ID[mid] : null
  if (!m?.launch.value || !m.landing?.value) return null
  const days = (dateMs(m.landing.value) - dateMs(m.launch.value)) / 86400e3
  return { days, mission: m.name, sources: [...m.launch.sources, ...m.landing.sources] }
}

function clear() {
  if (departureTimer) clearTimeout(departureTimer)
  departureTimer = null
  unsub?.()
  unsub = null
}

function land(siteId: string, withArrival: boolean) {
  clear()
  pendingArrival = withArrival ? siteId : null
  useExpedition.getState().set({ stage: 'arrival', progress: 1 })
  // land in daylight: an Apollo site opens at its sourced daylight moment (as the Mars scene opens on its scene date);
  // the surface HUD shows the date, and the orbital view keeps that clock afterwards
  const moonSite = SITE_BY_ID[siteId]
  if (moonSite) useStore.getState().setSim(moonSite.daylight.ms)
  useStore.getState().enterSurface(siteId)
  // the surface takes over (its own arrival sequence); the overlay hides once the surface is open
  window.setTimeout(() => useExpedition.getState().set({ stage: 'idle', dest: null }), 50)
}

export const expedition = {
  start(dest: ExpeditionDest) {
    const siteId = defaultSiteFor(dest)
    if (!siteId) return
    clear()
    const st = useStore.getState()
    if (st.surfaceSiteId) st.exitSurface()
    if (useStore.getState().phase === 'travel') useStore.getState().exitTravelMode()
    if (useStore.getState().phase === 'tour') useStore.getState().tourExit()
    useStore.getState().set({ phase: 'explore', navMapOpen: false, dataOpen: false })
    useExpedition.getState().set({ stage: 'departure', dest, siteId, progress: 0 })
    // depart from Earth: the camera is placed at Earth (instant), then the flight starts
    useStore.getState().select('earth')
    initiateTravel('earth', useStore.getState().simMs, { instant: true })
    departureTimer = window.setTimeout(() => {
      departureTimer = null
      if (useExpedition.getState().stage !== 'departure') return
      useExpedition.getState().set({ stage: 'cruise' })
      useStore.getState().select(dest)
      unsub = subscribeTravelEngine(() => {
        const t = travelEngineState
        const E = useExpedition.getState()
        if (E.stage === 'idle') return
        if (t.phase === 'cancelled' || t.phase === 'error') {
          clear()
          E.set({ stage: 'idle', dest: null })
          return
        }
        if (t.phase === 'traveling') E.set({ progress: t.progress, stage: t.progress > 0.72 ? 'approach' : 'cruise' })
      })
      initiateTravel(dest, useStore.getState().simMs, { onArrive: () => land(siteId, true) })
    }, DEPARTURE_MS)
  },
  /** skip the cinematic: straight to the surface (no arrival sequence) */
  skip() {
    const E = useExpedition.getState()
    if (E.stage === 'idle' || !E.siteId) return
    cancelTravel()
    land(E.siteId, false)
  },
  cancel() {
    clear()
    cancelTravel()
    useExpedition.getState().set({ stage: 'idle', dest: null })
  },
  /**
   * true when the surface opening now is the end of an expedition (it plays its arrival sequence). Read-only, so a
   * re-mounted effect (React StrictMode in development) sees the same answer; cleared by clearArrival.
   */
  peekArrival: (siteId: string): boolean => pendingArrival === siteId,
  /** the arrival has played (or the surface was left): later visits open without it */
  clearArrival() {
    pendingArrival = null
  },
  /** true while the expedition owns the camera */
  active: () => useExpedition.getState().stage !== 'idle',
}

if (typeof window !== 'undefined') (window as unknown as { __expedition?: unknown }).__expedition = { state: () => useExpedition.getState(), start: expedition.start, skip: expedition.skip }
