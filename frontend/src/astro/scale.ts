/**
 * Scale management. All simulation positions are double-precision light-years in the root frame.
 * Rendering is CAMERA-RELATIVE (floating origin): every object is drawn at (pos - cam) / S, where S ("ly per
 * render unit") adapts to the nearest object so that the nearest thing is always ~NEAR_UNITS away.
 * Beyond COMPRESS_START render units, distance is log-compressed (angular size preserved) -- a labelled,
 * non-linear display scale; it affects only how far objects are DRAWN, never catalogue values.
 */
export const NEAR_UNITS = 40
export const COMPRESS_START = 1e6
export const MIN_ANGULAR_PX = 10

export function adaptiveScale(nearestSurfaceDistLy: number): number {
  return Math.max(1e-12, nearestSurfaceDistLy / NEAR_UNITS)
}

/** Returns render distance (units) for a true render-unit distance u. Identity below COMPRESS_START. */
export function compressDistance(u: number): number {
  if (u <= COMPRESS_START) return u
  return COMPRESS_START * (1 + Math.log10(u / COMPRESS_START) * 0.25)
}

/** Level-of-detail tier from camera distance relative to object size (angular size ~ extent/dist). */
export type Lod = 'hidden' | 'dot' | 'sprite' | 'detail'
export function lodFor(distLy: number, radiusLy: number): Lod {
  if (distLy <= 0) return 'detail'
  const ang = radiusLy / distLy // radians (small angle)
  if (ang > 0.15) return 'detail'
  if (ang > 0.004) return 'sprite'
  return 'dot'
}

/** Adaptive travel speed (ly/s) given distance to the nearest object surface. */
export function adaptiveSpeed(nearestSurfaceDistLy: number, multiplier = 1): number {
  return Math.max(1e-12, nearestSurfaceDistLy) * 1.2 * multiplier
}

/** Travel duration (s) grows with log of distance ratio. */
export function travelDuration(d0: number, d1: number): number {
  const r = Math.max(1, d0 / Math.max(d1, 1e-12))
  return Math.min(11, Math.max(3, 2 + 0.95 * Math.log10(r)))
}

export function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Distance interpolated logarithmically between d0 and d1. */
export function logLerp(d0: number, d1: number, t: number): number {
  return Math.exp(Math.log(d0) * (1 - t) + Math.log(d1) * t)
}
