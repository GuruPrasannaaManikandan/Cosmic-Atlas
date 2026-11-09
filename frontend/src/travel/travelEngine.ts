/**
 * COSMIC ATLAS — High-Precision Astronomical Travel Engine
 * Implements a formal state machine for cosmic navigation across 15 orders of magnitude:
 * 'idle' -> 'resolving_destination' -> 'preparing_scene' -> 'traveling' -> 'arriving' -> 'inspecting'
 * Supports smooth S-curve easing, intelligent category-specific framing, mid-flight retargeting,
 * and reliable cancellation without camera snapping.
 */
import * as THREE from 'three'
import { BY_ID, positionOf, radiusLyOf, CosmicObject } from '../data/catalog'
import { Vec3, add, fromThree, len, sub, toThree, SUN_POS, LY_PER_AU } from '../astro/coords'
import { travelDuration, adaptiveScale } from '../astro/scale'
import { flightPose } from './flightPath'
import { nav, onInterrupt, updateNearest } from '../store/nav'
import { audio } from '../audio/CosmicAudioEngine'

let arrivalHandler: ((id: string) => void) | null = null
export function setTravelArrivalHandler(fn: (id: string) => void) {
  arrivalHandler = fn
}

export type TravelPhase =
  | 'idle'
  | 'resolving_destination'
  | 'preparing_scene'
  | 'traveling'
  | 'arriving'
  | 'inspecting'
  | 'error'
  | 'cancelled'

/** User-configurable flight settings (time compression factor and reduced motion). */
export const travelSettings = {
  /** 0.5 = slow (cinematic), 1 = normal, 2 = fast */
  speed: 1,
  /** suppress warp streaks and use a gentler camera turn */
  reduceMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
}

export interface TravelEngineState {
  phase: TravelPhase
  /** body the flight departed from (nearest body at departure) */
  fromName: string | null
  /** real light-travel time for the remaining distance (s) - the flight itself is time-compressed */
  lightTimeSec: number
  /** current camera speed in units of c (display only) */
  speedC: number
  targetId: string | null
  targetName: string | null
  targetCategory: string | null
  progress: number // 0.0 to 1.0
  etaSec: number
  distanceLy: number
  speedLySec: number
  errorMsg: string | null
}

export const travelEngineState: TravelEngineState = {
  phase: 'idle',
  fromName: null,
  lightTimeSec: 0,
  speedC: 0,
  targetId: null,
  targetName: null,
  targetCategory: null,
  progress: 0,
  etaSec: 0,
  distanceLy: 0,
  speedLySec: 0,
  errorMsg: null,
}

const listeners = new Set<() => void>()
export function subscribeTravelEngine(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

function lookAtQuat(from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(from, to, new THREE.Vector3(0, 1, 0))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

/**
 * Intelligent Framing Calculator
 * Computes optimal camera distance and approach orientation based on celestial object type.
 */
export function computeIntelligentFraming(o: CosmicObject, P: Vec3): { approachDistanceLy: number; targetDirection: THREE.Vector3 } {
  const rTrue = radiusLyOf(o)
  const dir = new THREE.Vector3(0, 0.35, 1).normalize()

  if (o.category === 'planet') {
    // Approach sunlit hemisphere at 35° phase angle and 18° latitude to highlight equatorial continents & terminator
    const toSun = new THREE.Vector3(...toThree(sub(SUN_POS, P))).normalize()
    if (toSun.lengthSq() > 0.01) {
      const eqSun = new THREE.Vector3(toSun.x, 0, toSun.z).normalize()
      if (eqSun.lengthSq() > 0.01) {
        dir.copy(eqSun).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.52)
        dir.y = 0.32
        dir.normalize()
      } else {
        dir.set(0.7, 0.32, 0.65).normalize()
      }
    }
    const approachDist = Math.max(o.viewDistanceLy, rTrue * 3.2, 1e-10)
    return { approachDistanceLy: approachDist, targetDirection: dir }
  }

  if (o.category === 'moon' || o.category === 'dwarf-planet' || o.category === 'asteroid') {
    // Approach on illuminated hemisphere at gentle elevation
    const toSun = new THREE.Vector3(...toThree(sub(SUN_POS, P))).normalize()
    if (toSun.lengthSq() > 0.01) {
      const eqSun = new THREE.Vector3(toSun.x, 0, toSun.z).normalize()
      if (eqSun.lengthSq() > 0.01) {
        dir.copy(eqSun).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.45)
        dir.y = 0.26
        dir.normalize()
      } else {
        dir.set(0.6, 0.26, 0.75).normalize()
      }
    } else {
      dir.set(0.4, 0.26, 0.85).normalize()
    }
    const approachDist = Math.max(o.viewDistanceLy, rTrue * 3.0, 1e-12)
    return { approachDistanceLy: approachDist, targetDirection: dir }
  }

  if (o.id === 'sun') {
    dir.set(0.25, 0.35, 0.9).normalize()
    return { approachDistanceLy: Math.max(o.viewDistanceLy, 0.00035), targetDirection: dir }
  }

  if (o.category === 'star') {
    // Approach tilted 20° above equatorial plane to view photosphere and corona flare
    dir.set(0.2, 0.35, 0.9).normalize()
    // Approach distance between 40 AU and 90 AU for stellar inspection
    const approachDist = Math.max(o.viewDistanceLy, 40 * LY_PER_AU, rTrue * 4.0)
    return { approachDistanceLy: approachDist, targetDirection: dir }
  }

  if (o.category === 'galaxy' || o.id === 'milky-way') {
    // 35° elevated perspective above the galactic disk to frame full spiral arms and dust lanes
    dir.set(0.2, 0.72, 0.65).normalize()
    const approachDist = Math.max(o.viewDistanceLy, rTrue * 1.35, 30000)
    return { approachDistanceLy: approachDist, targetDirection: dir }
  }

  if (o.category === 'nebula') {
    dir.set(0.1, 0.4, 0.9).normalize()
    const approachDist = Math.max(o.viewDistanceLy, rTrue * 1.5, 10)
    return { approachDistanceLy: approachDist, targetDirection: dir }
  }

  // Clusters, structures, and default
  const approachDist = Math.max(o.viewDistanceLy, rTrue * 1.25, 1.0)
  return { approachDistanceLy: approachDist, targetDirection: dir }
}

interface ActiveFlight {
  targetId: string
  dir0: THREE.Vector3
  dir1: THREE.Vector3
  d0: number
  d1: number
  /** camera orientation at departure: the heading turns from here toward the target */
  q0: THREE.Quaternion
  t: number
  dur: number
  onArrive?: () => void
}

const SEC_PER_YEAR = 365.25 * 86400

let currentFlight: ActiveFlight | null = null

/**
 * Initiates travel to any celestial landmark with full state machine lifecycle.
 */
export function initiateTravel(id: string, ms: number, opts: { onArrive?: () => void; viewDistanceLy?: number; instant?: boolean } = {}) {
  travelEngineState.phase = 'resolving_destination'
  travelEngineState.targetId = id
  travelEngineState.errorMsg = null
  notify()

  const o = BY_ID[id]
  if (!o) {
    travelEngineState.phase = 'error'
    travelEngineState.errorMsg = `Celestial object "${id}" could not be resolved in the astronomical catalogue.`
    notify()
    return
  }

  travelEngineState.targetName = o.name
  travelEngineState.targetCategory = o.category
  travelEngineState.phase = 'preparing_scene'
  notify()

  const P = positionOf(o, ms)
  const rel = toThree(sub(nav.pos, P))
  const d0 = Math.max(len(rel), 1e-15)
  const dir0 = new THREE.Vector3(...rel).normalize()
  if (!Number.isFinite(dir0.x) || d0 < 1e-14) dir0.set(0, 0.35, 1).normalize()

  const { approachDistanceLy, targetDirection } = computeIntelligentFraming(o, P)
  const d1 = opts.viewDistanceLy ?? approachDistanceLy
  const dir1 = targetDirection.clone()

  if (opts.instant) {
    const off: Vec3 = [dir1.x * d1, dir1.y * d1, dir1.z * d1]
    nav.pos = add(P, fromThree(off))
    nav.quat.copy(lookAtQuat(new THREE.Vector3(0, 0, 0), dir1.clone().multiplyScalar(-1)))
    nav.followId = id
    nav.lastFollowPos = P
    nav.flight = null
    currentFlight = null
    travelEngineState.phase = 'inspecting'
    travelEngineState.progress = 1.0
    travelEngineState.etaSec = 0
    travelEngineState.distanceLy = d1
    updateNearest(ms)
    nav.scale = adaptiveScale(nav.nearestSurface)
    arrivalHandler?.(id)
    opts.onArrive?.()
    notify()
    return
  }

  // Duration from the actual departure distance (log of the zoom ratio, 3-11 s), divided by the user's
  // time-compression setting. This is a compressed, educational flight - the HUD shows the real light time.
  const dur = travelDuration(d0, d1) / Math.max(0.25, travelSettings.speed)
  const fromId = nav.followId ?? nav.nearestId // the body being viewed, else the nearest one
  travelEngineState.fromName = fromId && BY_ID[fromId] && fromId !== id ? BY_ID[fromId].name : null

  // Clear previous follow state
  nav.followId = null
  nav.lastFollowPos = null

  currentFlight = {
    targetId: id,
    dir0,
    dir1,
    d0,
    d1,
    q0: nav.quat.clone(),
    t: 0,
    dur,
    onArrive: opts.onArrive,
  }

  // Also maintain nav.flight compatibility
  nav.flight = currentFlight as any

  travelEngineState.phase = 'traveling'
  travelEngineState.progress = 0
  travelEngineState.etaSec = dur
  travelEngineState.distanceLy = d0
  audio.playUiClick('navigate')
  notify()
}

/**
 * Cancels current travel smoothly, leaving the camera at its current position.
 */
export function cancelTravel() {
  if (currentFlight || travelEngineState.phase === 'traveling') {
    currentFlight = null
    nav.flight = null
    // nav.pos / nav.quat are left exactly where the flight was: the next flight departs from here
    travelEngineState.phase = 'cancelled'
    travelEngineState.etaSec = 0
    travelEngineState.speedLySec = 0
    travelEngineState.speedC = 0
    audio.playUiClick('click')
    notify()

    setTimeout(() => {
      if (travelEngineState.phase === 'cancelled') {
        travelEngineState.phase = 'idle'
        notify()
      }
    }, 1200)
  }
}

// Automatically sync cancelation when navigation is interrupted
onInterrupt(() => {
  cancelTravel()
})

/**
 * Advances flight progression in the animation loop.
 */
export function stepTravel(dt: number, ms: number) {
  if (!currentFlight) {
    if (travelEngineState.phase === 'traveling') {
      travelEngineState.phase = 'idle'
      notify()
    }
    return
  }

  const f = currentFlight
  const prevPos = nav.pos
  f.t = Math.min(1, f.t + dt / f.dur)
  const o = BY_ID[f.targetId]
  const P = positionOf(o, ms)
  const pose = flightPose(f, P, f.t)
  nav.pos = pose.pos
  nav.quat.copy(pose.quat)

  // Telemetry from the actual motion this frame
  const step = len(sub(nav.pos, prevPos))
  travelEngineState.progress = f.t
  travelEngineState.etaSec = Math.max(0, f.dur * (1 - f.t))
  travelEngineState.distanceLy = pose.dist
  travelEngineState.speedLySec = dt > 0 ? step / dt : 0
  travelEngineState.speedC = travelEngineState.speedLySec * SEC_PER_YEAR
  travelEngineState.lightTimeSec = pose.dist * SEC_PER_YEAR

  if (f.t >= 1) {
    // Arrival
    currentFlight = null
    nav.flight = null
    nav.followId = f.targetId
    nav.lastFollowPos = P

    travelEngineState.phase = 'arriving'
    travelEngineState.progress = 1.0
    travelEngineState.etaSec = 0
    audio.playArrivalChime()
    notify()

    // Trigger arrival callback
    f.onArrive?.()

    // Select object and open inspection panel
    arrivalHandler?.(f.targetId)

    setTimeout(() => {
      travelEngineState.phase = 'inspecting'
      notify()
      setTimeout(() => {
        if (travelEngineState.phase === 'inspecting') {
          travelEngineState.phase = 'idle'
          notify()
        }
      }, 2500)
    }, 400)
  } else {
    notify()
  }
}
