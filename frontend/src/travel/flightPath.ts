/**
 * Shared flight path for camera warp flights (Explore mode) and legacy fly-tos.
 *
 * A flight is defined relative to the TARGET body (which keeps moving with simulation time):
 *   position(t) = P_target(t) + dir(e) * logLerp(d0, d1, e)          e = ease(t)
 * dir0/d0 come from the camera's ACTUAL position when the flight starts, so every flight departs from where the
 * observer currently is (never from a common reference point) and position(0) == the departure position exactly.
 *
 * Fixes over the former inline versions:
 *  - dir is SLERPED on the unit sphere. The old linear lerp + normalize collapsed to a zero vector (NaN / flip)
 *    when the departure and framing directions were nearly opposite.
 *  - the camera ORIENTATION turns smoothly from the departure orientation q0 to "look at the target" during the
 *    first ORIENT_FRACTION of the flight instead of snapping on the first frame.
 */
import * as THREE from 'three'
import { Vec3, add, fromThree } from '../astro/coords'
import { ease, logLerp } from '../astro/scale'

export const ORIENT_FRACTION = 0.22

export interface FlightSpec {
  dir0: THREE.Vector3
  dir1: THREE.Vector3
  d0: number
  d1: number
  /** camera orientation at departure (optional for legacy callers) */
  q0?: THREE.Quaternion
}

/** Spherical interpolation between two unit vectors; stable for (anti)parallel inputs. */
export function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  if (dot > 0.9995) return out.copy(a).lerp(b, t).normalize()
  let axis: THREE.Vector3
  if (dot < -0.9995) {
    // antiparallel: rotate about any axis perpendicular to a (prefer the scene's up axis)
    axis = new THREE.Vector3(0, 1, 0).cross(a)
    if (axis.lengthSq() < 1e-8) axis = new THREE.Vector3(1, 0, 0).cross(a)
    axis.normalize()
  } else {
    axis = new THREE.Vector3().crossVectors(a, b).normalize()
  }
  const angle = Math.acos(dot) * t
  return out.copy(a).applyAxisAngle(axis, angle).normalize()
}

const LOOK_UP = new THREE.Vector3(0, 1, 0)
/** Orientation that looks from the camera toward the target when the camera sits at P + dir * d. */
export function lookAtTargetQuat(dir: THREE.Vector3): THREE.Quaternion {
  // Matrix4.lookAt(eye, target) builds a basis whose +Z points from target to eye: +Z = dir, so the camera's
  // forward (-Z) is -dir, i.e. toward the target.
  const m = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(0, 0, 0), LOOK_UP)
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Camera pose at normalised flight time t in [0, 1] for a target currently at P. */
export function flightPose(f: FlightSpec, P: Vec3, t: number): { pos: Vec3; quat: THREE.Quaternion; dist: number; dir: THREE.Vector3 } {
  const e = ease(t)
  const dir = slerpUnit(f.dir0, f.dir1, e)
  const dist = logLerp(f.d0, f.d1, e)
  const pos = add(P, fromThree([dir.x * dist, dir.y * dist, dir.z * dist]))
  const look = lookAtTargetQuat(dir)
  const quat = f.q0 && t < ORIENT_FRACTION ? f.q0.clone().slerp(look, smooth(t / ORIENT_FRACTION)) : look
  return { pos, quat, dist, dir }
}
