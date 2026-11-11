import type { Frame, Obj } from '../flight'

/** mutable per-frame state shared by the scene's components (never React state) */
export const live = {
  frame: null as Frame | null,
  objs: new Map<string, Obj>(),
  /** ambient pressure 0..1 at the subject (1 = sea level), for plume expansion */
  pressure: 0,
  /** mission seconds per second right now */
  rate: 1,
  t: 0,
  wall: 0,
  /** framing extent of the subject (m) */
  subject: 10,
  /** 0 night ... 1 day, from the Sun's elevation at the subject */
  day: 1,
}
