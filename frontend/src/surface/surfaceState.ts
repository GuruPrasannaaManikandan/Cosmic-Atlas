import { create } from 'zustand'

export type PanelTab = 'inspect' | 'story' | 'specs' | 'timeline' | 'science'
export type CamMode = 'third' | 'first'

export interface SurfaceUI {
  siteId: string | null
  /** descent animation running */
  intro: boolean
  paused: boolean
  mapOpen: boolean
  helpOpen: boolean
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
  player: { x: 0, z: 0, yaw: 0, speed: 0, grounded: true, camYaw: 0 },
}

export const useSurface = create<SurfaceUI>((set) => ({
  siteId: null,
  ...initial,
  set: (p) => set(p),
  reset: (siteId) => set({ siteId, ...initial, discovered: [] }),
}))

/** test/automation handle (read + a few safe actions), same pattern as window.__store / __nav */
export const surfaceDebug: { teleport?: (x: number, z: number) => void; character?: () => unknown; camera?: () => unknown; terrain?: () => unknown; guide?: () => unknown; inspectFrame?: () => unknown; astronautScreen?: () => unknown } = {}
if (typeof window !== 'undefined') (window as any).__surface = { state: () => useSurface.getState(), debug: surfaceDebug }
