/**
 * Expedition (Explore, Milestone 3): Earth → Moon / Mars → the surface, and back — flown automatically, no cuts.
 *
 * Outbound: a conceptual expedition flight on the Relive engine (relive/expeditionFlight.ts) — Earth departure, the
 * coast (as long as the site's real mission took, derived from the catalogue), orbit or entry, descent — then:
 *   Moon: the surface view takes over at a 420 m hover and the lander flies its last metres onto the measured LROC
 *         terrain beside the historic hardware; the astronaut steps off the ramp (surface/SurfaceScene.tsx);
 *   Mars: the expedition flight lands and deploys the rover itself; the Unity view opens at the rover.
 * Return ("Return to orbit"): Moon: the lander lifts off on the measured terrain, then the return flight to Earth
 * orbit; Mars: the rover stays (as every Mars rover has) and the view climbs back to orbit.
 *
 * While a flight runs, Relive owns the keyboard (UI_INTERACTION). Skip jumps to the end of the flight (still landing
 * or returning — never a cut from orbit to the ground); Cancel restores the explorer as it was.
 */
import { create } from 'zustand'
import { useStore } from '../store/store'
import { initiateTravel } from '../travel/travelEngine'
import { defaultSiteFor, UNITY_SITE_BY_ID, SITE_BY_ID } from '../surface/sites'
import { MISSION_BY_ID, dateMs } from '../missions'
import { relive, useRelive, clock } from '../relive/player'
import { marsOutbound, marsReturn, moonOutbound, moonReturn, type ExpeditionTarget } from '../relive/expeditionFlight'
import { useSurface, landerHooks, LANDER_T } from '../surface/surfaceState'

export type ExpeditionStage = 'idle' | 'departure' | 'cruise' | 'approach' | 'arrival'
export type ExpeditionDest = 'moon' | 'mars'

interface ExpeditionUI {
  stage: ExpeditionStage
  dest: ExpeditionDest | null
  siteId: string | null
  /** 0..1 within the flight */
  progress: number
  direction: 'outbound' | 'return' | null
  set: (p: Partial<ExpeditionUI>) => void
}

export const useExpedition = create<ExpeditionUI>((set) => ({ stage: 'idle', dest: null, siteId: null, progress: 0, direction: null, set: (p) => set(p) }))

/** the site whose surface should open with its landing (consumed once by the surface) */
let pendingArrival: string | null = null

export const STAGE_TEXT: Record<ExpeditionDest, Record<Exclude<ExpeditionStage, 'idle'>, { title: string; text: string }>> = {
  moon: {
    departure: { title: 'Earth departure', text: 'Leaving Earth for the Moon from low Earth orbit.' },
    cruise: { title: 'Translunar coast', text: 'Coasting across the 384,400 km to the Moon.' },
    approach: { title: 'Lunar orbit', text: 'Braking into lunar orbit and lining up with the site.' },
    arrival: { title: 'Powered descent', text: 'The lander descends on its engine to the landing site.' },
  },
  mars: {
    departure: { title: 'Earth departure', text: 'Leaving Earth for Mars. A Mars cruise follows a transfer orbit around the Sun lasting months, not a straight line.' },
    cruise: { title: 'Interplanetary cruise', text: 'Crossing the inner solar system toward Mars.' },
    approach: { title: 'Mars approach', text: 'Mars grows ahead. The capsule enters the atmosphere directly from its approach path.' },
    arrival: { title: 'Entry, descent and landing', text: 'Through the thin CO₂ atmosphere to the surface, then the rover drives off.' },
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

export function targetFor(siteId: string): ExpeditionTarget | null {
  const moon = SITE_BY_ID[siteId], mars = UNITY_SITE_BY_ID[siteId]
  const site = moon ?? mars
  const real = realCruise(siteId)
  if (!site || !real) return null
  return {
    siteId, name: site.name.split(' — ')[0], dest: moon ? 'moon' : 'mars', latDeg: site.origin.latDeg, lonEastDeg: site.origin.lonEastDeg,
    cruiseDays: real.days, cruiseMission: real.mission, cruiseSources: real.sources,
  }
}

/** the Mars scene's moment (the Unity view shows the scene date in the afternoon, Sun ~56° up at 16:48 UTC) */
const marsSceneMs = (siteId: string) => Date.parse(UNITY_SITE_BY_ID[siteId].scene.date + 'T16:48:00Z')

/** phase of the running flight → the expedition stage the rest of the app (and the checks) read */
const STAGE_OF: Record<string, ExpeditionStage> = { depart: 'departure', coast: 'cruise', cruise: 'cruise', orbit: 'approach', approach: 'approach', descent: 'arrival', entry: 'arrival', landing: 'arrival', deploy: 'arrival' }
useRelive.subscribe((s) => {
  const sc = clock.script
  const E = useExpedition.getState()
  if (!s.id || sc?.kind !== 'expedition' || sc.direction !== 'outbound' || E.stage === 'idle') return
  const st = STAGE_OF[s.phaseId ?? ''] ?? E.stage
  const progress = s.length ? s.u / s.length : 0
  if (st !== E.stage || Math.abs(progress - E.progress) > 0.01) E.set({ stage: st, progress })
})

function land(siteId: string) {
  const moonSite = SITE_BY_ID[siteId]
  // the surface plays the final descent: the Moon's lander, or the Mars carrier landing with THEIA (E3)
  pendingArrival = siteId
  useExpedition.getState().set({ stage: 'arrival', progress: 1 })
  const st = useStore.getState()
  st.set({ phase: 'explore' })
  if (moonSite) st.setSim(moonSite.daylight.ms)
  st.enterSurface(siteId)
  window.setTimeout(() => useExpedition.getState().set({ stage: 'idle', dest: null, direction: null }), 50)
}

/** after a return flight: the orbital explorer, at the body the flight ended at */
function backToOrbit(bodyId: 'earth' | 'mars') {
  const st = useStore.getState()
  st.set({ phase: 'explore', navMapOpen: false })
  st.select(bodyId)
  initiateTravel(bodyId, useStore.getState().simMs, { instant: true })
  useExpedition.getState().set({ stage: 'idle', dest: null, direction: null })
}

export const expedition = {
  start(dest: ExpeditionDest, siteId: string | null = defaultSiteFor(dest)) {
    if (!siteId) return
    const tg = targetFor(siteId)
    if (!tg) return
    const moon = SITE_BY_ID[siteId]
    const landingMs = moon ? moon.daylight.ms : marsSceneMs(siteId)
    const script = tg.dest === 'moon' ? moonOutbound(tg, landingMs) : marsOutbound(tg, landingMs)
    useExpedition.getState().set({ stage: 'departure', dest, siteId, progress: 0, direction: 'outbound' })
    relive.openScript(script, () => land(siteId))
  },
  /** skip the rest of the flight: it still ends with the landing (never a cut from orbit to the ground) */
  skip() {
    if (clock.script?.kind === 'expedition') relive.finish()
  },
  cancel() {
    if (clock.script?.kind === 'expedition') relive.close()
    useExpedition.getState().set({ stage: 'idle', dest: null, direction: null })
  },
  /** "Return to orbit" from a surface: liftoff (Moon) or the view climbing away (Mars), then the flight back */
  returnToOrbit() {
    const st = useStore.getState()
    const siteId = st.surfaceSiteId
    const tg = siteId ? targetFor(siteId) : null
    if (!siteId || !tg) { st.exitSurface(); return }
    const fly = () => {
      const script = tg.dest === 'moon' ? moonReturn(tg, useStore.getState().simMs) : marsReturn(tg, marsSceneMs(siteId))
      useExpedition.getState().set({ stage: 'idle', dest: tg.dest, siteId, direction: 'return' })
      relive.openScript(script, () => backToOrbit(tg.dest === 'moon' ? 'earth' : 'mars'))
    }
    if (tg.dest === 'moon' && useSurface.getState().siteId === siteId) {
      // board and lift off on the measured terrain; the return flight takes over above the site
      const S = useSurface.getState()
      S.set({ intro: true, panel: null, mapOpen: false, paused: false, lander: { phase: 'ascent', t0: performance.now() } })
      let done = false
      const go = () => { if (done) return; done = true; landerHooks.onAscentDone = null; fly() }
      landerHooks.onAscentDone = go
      window.setTimeout(go, LANDER_T.ascentClimb + 4500) // safety net if the surface view is not drawing
      return
    }
    fly()
  },
  /** a Mars landing site entered straight from the catalogue also lands its carrier (no interplanetary flight) */
  markArrival(siteId: string) {
    pendingArrival = siteId
  },
  /** true when the surface opening now is the end of an expedition (it plays its landing). Read-only (StrictMode). */
  peekArrival: (siteId: string): boolean => pendingArrival === siteId,
  clearArrival() {
    pendingArrival = null
  },
  /** true while an expedition flight owns the camera */
  active: () => useExpedition.getState().stage !== 'idle' || clock.script?.kind === 'expedition',
}

if (typeof window !== 'undefined') (window as unknown as { __expedition?: unknown }).__expedition = { state: () => useExpedition.getState(), start: expedition.start, skip: expedition.skip, returnToOrbit: expedition.returnToOrbit }
