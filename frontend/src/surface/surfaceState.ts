import { create } from 'zustand'

export type PanelTab = 'overview' | 'inspect' | 'story' | 'specs' | 'timeline' | 'science'
export type CamMode = 'third' | 'first'

export interface SurfaceUI {
  siteId: string | null
  /** descent animation running */
  intro: boolean
  paused: boolean
  mapOpen: boolean
  helpOpen: boolean
  /** Mars: the discovery catalogue (J) */
  catalogueOpen: boolean
  driving?: boolean
  camMode: CamMode
  discovered: string[]
  /** the object whose "DISCOVERED" banner is showing */
  banner: string | null
  /** object within interaction range */
  nearbyId: string | null
  panel: { objectId: string; tab: PanelTab } | null
  /** inspector minimised to give the 3-D view back (side rail on wide screens, header-only sheet on narrow) */
  panelCollapsed: boolean
  /** focused component while inspecting */
  component: string | null
  waypointId: string | null
  /** Apollo LM: official NASA model (stylised legs) or the dimension-accurate procedural reconstruction */
  lmModel: 'nasa' | 'reconstruction'
  /** historical replay running for this object (the exploration state is saved in replay.ts and restored on return) */
  replay: { objectId: string } | null
  /** the explorer's (conceptual) expedition lander beside the spawn point: parked, landing, or lifting off */
  lander: { phase: 'parked' | 'descent' | 'ascent'; t0: number }
  /** HUD snapshot of the astronaut (updated ~10×/s) */
  player: { x: number; z: number; yaw: number; speed: number; grounded: boolean; camYaw: number }
  set: (p: Partial<SurfaceUI>) => void
  reset: (siteId: string | null) => void
}

const initial = {
  intro: true,
  paused: false,
  mapOpen: false,
  helpOpen: false,
  catalogueOpen: false,
  driving: false,
  camMode: 'third' as CamMode,
  discovered: [] as string[],
  banner: null,
  nearbyId: null,
  panel: null,
  panelCollapsed: false,
  component: null,
  waypointId: null,
  lmModel: 'nasa' as 'nasa' | 'reconstruction',
  replay: null as { objectId: string } | null,
  player: { x: 0, z: 0, yaw: 0, speed: 0, grounded: true, camYaw: 0 },
  lander: { phase: 'parked' as 'parked' | 'descent' | 'ascent', t0: 0 },
}

/** set by the expedition module: called once the lander has climbed away during "Return to orbit" */
export const landerHooks = { onAscentDone: null as null | (() => void) }
/** landing: 26 s powered descent from the hand-off hover, ramp, egress; liftoff: ramp up, then a 14 s climb */
export const LANDER_T = { descent: 26000, ramp: 1500, egress: 2600, settle: 4200, ascentClimb: 14000 }

export const useSurface = create<SurfaceUI>((set) => ({
  siteId: null,
  ...initial,
  set: (p) => set(p),
  reset: (siteId) => set({ siteId, ...initial, discovered: [] }),
}))

/** R3F surface pose, as saved for "Go back to present" */
export interface SurfacePose { pos: [number, number, number]; yaw: number; camYaw: number; camPitch: number; camDist: number; camMode: CamMode }
/** app-level control of the running R3F scene (historical replay): set by SurfaceScene while it is mounted */
export const surfaceControl: { snapshot?: () => SurfacePose; restore?: (p: SurfacePose) => void; replayDescent?: () => void } = {}

/** test/automation handle (read + a few safe actions), same pattern as window.__store / __nav */
export const surfaceDebug: { teleport?: (x: number, z: number) => void; character?: () => unknown; camera?: () => unknown; terrain?: () => unknown; guide?: () => unknown; inspectFrame?: () => unknown; astronautScreen?: () => unknown } = {}
if (typeof window !== 'undefined') (window as any).__surface = { state: () => useSurface.getState(), debug: surfaceDebug }
