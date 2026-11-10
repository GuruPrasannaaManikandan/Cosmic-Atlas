import type { Fact, SurfacePosition } from '../schema'

/** a value read from the cited sources */
export const v = <T,>(value: T, sources: string[], note?: string): Fact<T> => ({ value, status: 'verified', sources, ...(note ? { note } : {}) })
/** not yet sourced: kept null, with what is missing */
export const u = <T,>(note: string): Fact<T> => ({ value: null, status: 'unverified', sources: [], note })
/** sources disagree: the preferred value plus every alternative */
export const c = <T,>(value: T, sources: string[], alternatives: { value: T; sources: string[] }[], note: string): Fact<T> => ({
  value,
  status: 'conflicting',
  sources,
  alternatives,
  note,
})

export const ME_DE421 = 'Mean Earth/Polar Axis (ME), DE421 — LRO-derived'
export const LROC_ME = 'Mean Earth/Polar Axis (ME); elevation relative to GLD100'

export const moonPos = (latDeg: number, lonEastDeg: number, datum: string, elevationM?: number, uncertaintyM?: number): SurfacePosition => ({
  bodyId: 'moon',
  latDeg,
  lonEastDeg,
  datum,
  ...(elevationM !== undefined ? { elevationM } : {}),
  ...(uncertaintyM !== undefined ? { uncertaintyM } : {}),
})

export const marsPos = (latDeg: number, lonEastDeg: number, datum: string): SurfacePosition => ({ bodyId: 'mars', latDeg, lonEastDeg, datum })
