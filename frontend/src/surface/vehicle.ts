/**
 * Lunar Roving Vehicle driving model (Gameplay Controls directive, Part 20). Pure functions, unit-tested.
 *
 * SOURCED (NSSDCA "The Apollo Lunar Roving Vehicle", source id nssdca-lrv):
 *   wheelbase 2.3 m; tyres 81.8 cm diameter; front AND rear steering turning in opposite directions → steering
 *   radius 3.1 m; each wheel driven by a 10,000 rpm motor through an 80:1 harmonic drive.
 * DERIVED from those: wheel speed ≤ 10,000 / 80 = 125 rpm → ground speed ≤ 125/60 · π · 0.818 ≈ 5.35 m/s. That is a
 *   mechanical CEILING, not the LRV's operational top speed (not sourced yet); the UI says so.
 * SIMULATION VALUES (not sourced, labelled in the UI): acceleration, braking, reverse speed limit, suspension travel and
 *   the track width (taken from the procedural model, which itself marks the track as approximate).
 *
 * Gravity enters through the along-slope term g·sin(slope), with g from the planet configuration (Moon 1.62 m/s²).
 * Frame: x east, y up, z south (the surface engine's local frame); yaw 0 faces north (−z), like the astronaut.
 */
import type { Ground } from './controller'

export const LRV = {
  wheelbaseM: 2.3, // sourced
  wheelDiameterM: 0.818, // sourced
  steeringRadiusM: 3.1, // sourced (front and rear steering, opposite directions)
  maxSpeedMs: (10000 / 80 / 60) * Math.PI * 0.818, // derived mechanical ceiling ≈ 5.35 m/s
  trackM: 1.83, // procedural model (approximate)
  accelMs2: 0.6, // simulation
  brakeMs2: 1.5, // simulation
  reverseMaxMs: 1.0, // simulation
  steerRate: 1.6, // simulation: steering input slew (1/s)
  suspensionTravelM: 0.15, // simulation
}

export interface VehicleState {
  x: number
  z: number
  y: number
  yaw: number
  speed: number
  /** −1..1 steering (positive = left), slewed toward the input */
  steer: number
  /** accumulated wheel rotation (rad) */
  wheelAngle: number
  pitch: number
  roll: number
  /** per-wheel suspension offsets (m), order FL, FR, RL, RR */
  susp: [number, number, number, number]
  odometer: number
}

export interface VehicleInput {
  /** −1..1: W = +1 (drive), S = −1 (brake, then reverse when stopped) */
  throttle: number
  /** −1..1: A = +1 (left), D = −1 (right) */
  steer: number
}

const fwdOf = (yaw: number): [number, number] => [-Math.sin(yaw), -Math.cos(yaw)]

/** wheel contact points (FL, FR, RL, RR) in the local frame */
export function wheelPoints(x: number, z: number, yaw: number): [number, number][] {
  const [fx, fz] = fwdOf(yaw)
  const rx = Math.cos(yaw), rz = -Math.sin(yaw)
  const b = LRV.wheelbaseM / 2, t = LRV.trackM / 2
  return [[-t, b], [t, b], [-t, -b], [t, -b]].map(([s, f]) => [x + fx * f + rx * s, z + fz * f + rz * s])
}

export function newVehicle(x: number, z: number, yaw: number, ground: Ground): VehicleState {
  const v: VehicleState = { x, z, y: ground.heightAt(x, z), yaw, speed: 0, steer: 0, wheelAngle: 0, pitch: 0, roll: 0, susp: [0, 0, 0, 0], odometer: 0 }
  return settle(v, ground)
}

/** chassis attitude and suspension from the four wheel contact heights */
export function settle(v: VehicleState, ground: Ground): VehicleState {
  const h = wheelPoints(v.x, v.z, v.yaw).map(([px, pz]) => ground.heightAt(px, pz))
  const front = (h[0] + h[1]) / 2, rear = (h[2] + h[3]) / 2, left = (h[0] + h[2]) / 2, right = (h[1] + h[3]) / 2
  const pitch = Math.atan2(front - rear, LRV.wheelbaseM)
  const roll = Math.atan2(left - right, LRV.trackM)
  const y = (h[0] + h[1] + h[2] + h[3]) / 4
  // a rigid plane through the mean height with that pitch/roll; each wheel's residual is its suspension travel
  const plane = [front - y + (left - y), front - y + (right - y), rear - y + (left - y), rear - y + (right - y)].map((d) => y + d / 1)
  const t = LRV.suspensionTravelM
  const susp = h.map((hw, i) => Math.max(-t, Math.min(t, hw - plane[i]))) as VehicleState['susp']
  return { ...v, y, pitch, roll, susp }
}

export function stepVehicle(v: VehicleState, inp: VehicleInput, ground: Ground, gravity: number, dt: number,
  blocked?: (x: number, z: number) => boolean): VehicleState {
  // steering slews toward the input (no instant wheel snaps)
  const ds = Math.max(-LRV.steerRate * dt, Math.min(LRV.steerRate * dt, inp.steer - v.steer))
  const steer = v.steer + ds
  // longitudinal: drive, brake, reverse when stopped
  let speed = v.speed
  if (inp.throttle > 0) speed = Math.min(LRV.maxSpeedMs, speed + LRV.accelMs2 * inp.throttle * dt)
  else if (inp.throttle < 0) {
    if (speed > 0.05) speed = Math.max(0, speed - LRV.brakeMs2 * dt)
    else speed = Math.max(-LRV.reverseMaxMs, speed - LRV.accelMs2 * dt)
  } else {
    // coasting: rolling resistance (simulation) brings it to rest
    const roll = 0.25 * dt
    speed = Math.abs(speed) <= roll ? 0 : speed - Math.sign(speed) * roll
  }
  // gravity along the slope (sourced g): positive pitch (nose up) slows a forward-moving rover
  speed -= gravity * Math.sin(v.pitch) * dt
  speed = Math.max(-LRV.reverseMaxMs, Math.min(LRV.maxSpeedMs, speed))
  // four-wheel steering: full lock gives the sourced 3.1 m radius → curvature = steer / R
  const yawRate = speed * (steer / LRV.steeringRadiusM)
  const yaw = v.yaw + yawRate * dt
  const [fx, fz] = fwdOf(yaw)
  let x = v.x + fx * speed * dt, z = v.z + fz * speed * dt
  if (blocked && blocked(x, z)) {
    x = v.x
    z = v.z
    speed = 0
  }
  const dist = Math.hypot(x - v.x, z - v.z)
  const next: VehicleState = {
    ...v, x, z, yaw, speed, steer,
    wheelAngle: v.wheelAngle + (speed >= 0 ? 1 : -1) * dist / (LRV.wheelDiameterM / 2),
    odometer: v.odometer + dist,
  }
  return settle(next, ground)
}
