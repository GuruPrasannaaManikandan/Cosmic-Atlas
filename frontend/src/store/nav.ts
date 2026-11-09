/**
 * Mutable navigation state (camera position in double-precision root-frame light-years).
 * Kept outside React so the render loop and tests can drive it without re-renders.
 */
import * as THREE from 'three'
import { Vec3, add, fromThree, len, scale, sub, toThree, SUN_POS } from '../astro/coords'
import { BY_ID, positionOf, radiusLyOf, OBJECTS, CosmicObject } from '../data/catalog'
import { ease, logLerp, travelDuration } from '../astro/scale'
import { flightPose } from '../travel/flightPath'

export interface Flight {
  targetId: string
  dir0: THREE.Vector3 // unit, three axes, from target to camera at start
  dir1: THREE.Vector3
  d0: number
  d1: number
  /** camera orientation at departure (heading turns smoothly from here) */
  q0?: THREE.Quaternion
  t: number
  dur: number
  onArrive?: () => void
}

export const nav = {
  pos: [0, 0, 0] as Vec3,
  quat: new THREE.Quaternion(),
  flight: null as Flight | null,
  followId: null as string | null,
  lastFollowPos: null as Vec3 | null,
  orbit: false,
  speedMult: 1,
  keys: new Set<string>(),
  nearestSurface: 1,
  nearestId: 'sun',
  scale: 1,
  listeners: new Set<() => void>(),
}

if (typeof window !== 'undefined') (window as any).__nav = nav
// Dev-only hook for deterministic browser checks (scripts/e2e/planet_audit.py); not present in production builds.
if (typeof window !== 'undefined' && import.meta.env?.DEV)
  (window as any).__navApi = {
    setCameraAt: (pos: Vec3, look: Vec3) => { interrupt(); nav.followId = null; setCameraAt(pos, look) },
    positionOf: (id: string, ms: number) => positionOf(BY_ID[id], ms),
    radiusLy: (id: string) => radiusLyOf(BY_ID[id]),
  }

export function onInterrupt(fn: () => void) { nav.listeners.add(fn); return () => nav.listeners.delete(fn) }

export function interrupt() {
  const had = nav.flight !== null
  nav.flight = null
  if (had) nav.listeners.forEach((f) => f())
}

export function targetObject(id: string): CosmicObject { return BY_ID[id] }

function lookAtQuat(from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(to, from, new THREE.Vector3(0, 1, 0))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

export function setCameraAt(pos: Vec3, lookAtPos: Vec3) {
  nav.pos = pos
  const rel = toThree(sub(lookAtPos, pos))
  // lookAtQuat(origin, X) faces -X (same convention as the flight code, which passes -dir): negate to face the target
  nav.quat.copy(lookAtQuat(new THREE.Vector3(0, 0, 0), new THREE.Vector3(...rel).multiplyScalar(-1)))
}

export function distanceTo(id: string, ms: number): number {
  return len(sub(positionOf(BY_ID[id], ms), nav.pos))
}

/** Start a fly-to. Never blocks input; any user input interrupts it. */
export function flyTo(id: string, ms: number, opts: { onArrive?: () => void; viewDistanceLy?: number } = {}) {
  const o = BY_ID[id]
  if (!o) throw new Error(`Unknown object ${id}`)
  const P = positionOf(o, ms)
  const rel = toThree(sub(nav.pos, P))
  const d0 = Math.max(len(rel), 1e-15)
  const dir0 = new THREE.Vector3(...rel).normalize()
  if (!Number.isFinite(dir0.x) || d0 < 1e-14) dir0.set(0, 0.3, 1).normalize()
  const d1 = opts.viewDistanceLy ?? o.viewDistanceLy
  const dir1 = dir0.clone()
  if (o.category === 'planet' || o.category === 'moon') {
    const toSun = new THREE.Vector3(...toThree(sub(SUN_POS, P))).normalize()
    dir1.copy(toSun.multiplyScalar(0.85).add(new THREE.Vector3(0.1, 0.35, 0.1))).normalize()
  } else if (o.id === 'sun') {
    dir1.set(0.3, 0.35, 0.9).normalize()
  } else if (o.id === 'milky-way') {
    dir1.set(0.25, 0.75, 0.6).normalize() // above the disk
  } else if (o.category === 'star') {
    dir1.set(0.15, 0.25, 0.95).normalize() // tilted stellar perspective
  }
  nav.followId = null
  nav.lastFollowPos = null
  nav.flight = { targetId: id, dir0, dir1, d0, d1, q0: nav.quat.clone(), t: 0, dur: travelDuration(d0, d1), onArrive: opts.onArrive }
}

/** Advance navigation; returns nothing. dt in seconds. */
export function stepNavigation(dt: number, ms: number, input: { yaw: number; pitch: number; panX: number; panY: number; dolly: number; roll?: number }) {
  const f = nav.flight
  if (f) {
    f.t = Math.min(1, f.t + dt / f.dur)
    const o = BY_ID[f.targetId]
    const P = positionOf(o, ms)
    const pose = flightPose(f, P, f.t) // shared path: slerped direction, smooth heading turn
    nav.pos = pose.pos
    nav.quat.copy(pose.quat)
    if (f.t >= 1) {
      nav.flight = null
      nav.followId = f.targetId
      nav.lastFollowPos = P
      f.onArrive?.()
    }
    return
  }

  // follow a moving target
  if (nav.followId) {
    const P = positionOf(BY_ID[nav.followId], ms)
    if (nav.lastFollowPos) nav.pos = add(nav.pos, sub(P, nav.lastFollowPos))
    nav.lastFollowPos = P
  }

  const s = nav.nearestSurface
  const q = nav.quat
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)

  // rotation
  if (input.yaw || input.pitch) {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -input.yaw)
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(right, -input.pitch)
    if (nav.orbit && nav.followId) {
      const P = positionOf(BY_ID[nav.followId], ms)
      const off = new THREE.Vector3(...toThree(sub(nav.pos, P)))
      const dq = pitchQ.clone().premultiply(yawQ).multiply(new THREE.Quaternion())
      off.applyQuaternion(dq)
      nav.pos = add(P, fromThree([off.x, off.y, off.z]))
      q.premultiply(dq)
    } else {
      q.premultiply(yawQ)
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -input.pitch))
    }
    q.normalize()
  }

  // translation: keyboard (ly/s scaled by nearest surface) + pan + dolly
  let mv = new THREE.Vector3()
  const k = nav.keys
  if (k.has('w') || k.has('arrowup')) mv.add(fwd)
  if (k.has('s') || k.has('arrowdown')) mv.sub(fwd)
  if (k.has('d') || k.has('arrowright')) mv.add(right)
  if (k.has('a') || k.has('arrowleft')) mv.sub(right)
  if (k.has(' ') || k.has('e')) mv.add(new THREE.Vector3(0, 1, 0))
  if (k.has('c') || k.has('q')) mv.sub(new THREE.Vector3(0, 1, 0))
  const boost = k.has('shift') ? 6 : 1
  const speed = Math.max(1e-13, s) * 1.2 * nav.speedMult * boost
  if (mv.lengthSq() > 0) {
    mv.normalize().multiplyScalar(speed * dt)
    nav.pos = add(nav.pos, fromThree([mv.x, mv.y, mv.z]))
  }
  if (input.dolly) {
    // dolly toward what we are looking at; never pass through the nearest surface
    const step = Math.min(s * 0.9, s * 0.2 * Math.abs(input.dolly)) * Math.sign(input.dolly)
    const d = fwd.clone().multiplyScalar(step)
    nav.pos = add(nav.pos, fromThree([d.x, d.y, d.z]))
  }
  if (input.panX || input.panY) {
    const d = right.clone().multiplyScalar(-input.panX * s * 0.004).add(up.clone().multiplyScalar(input.panY * s * 0.004))
    nav.pos = add(nav.pos, fromThree([d.x, d.y, d.z]))
  }
}

/** Compute nearest-surface distance for adaptive scaling. Ignores extended objects containing the camera. */
const EXTENDED = new Set(['galaxy', 'cluster', 'supercluster', 'group', 'sheet', 'galactic-structure', 'nebula', 'star-cluster'])
export function updateNearest(ms: number) {
  let best = Infinity
  let bestId = 'sun'
  const dSun = len(sub(SUN_POS, nav.pos))
  const farFromSolar = dSun > 0.05
  for (const o of OBJECTS) {
    if (farFromSolar && o.category === 'moon') continue
    const d = len(sub(positionOf(o, ms), nav.pos))
    const r = radiusLyOf(o)
    let surf = d - r
    if (EXTENDED.has(o.category)) {
      if (d < r) continue
      surf = Math.max(d - r * 0.5, r * 0.05)
    } else surf = Math.max(surf, r * 0.02, 1e-14)
    if (surf < best) { best = surf; bestId = o.id }
  }
  nav.nearestSurface = Number.isFinite(best) ? best : 1
  nav.nearestId = bestId
}

export function referenceFrameLabel(): string {
  const dSun = len(sub(nav.pos, SUN_POS))
  if (dSun < 0.003) return 'Solar System (heliocentric)'
  const dGc = len(nav.pos)
  if (dGc < 60000) return 'Milky Way (galactocentric)'
  const lg = positionOf(BY_ID['local-group'], 0)
  if (len(sub(nav.pos, lg)) < 6e6) return 'Local Group'
  return 'Extragalactic (Galactic-Centre origin)'
}

export function exampleScaleLabel(): string {
  const s = nav.nearestSurface
  if (s < 1e-6) return 'planetary scale'
  if (s < 1e-3) return 'Solar System scale'
  if (s < 1e4) return 'stellar neighbourhood scale'
  if (s < 3e6) return 'galactic scale'
  if (s < 3e8) return 'intergalactic scale'
  return 'cosmic-web scale'
}
