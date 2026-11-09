/**
 * Astronaut character controller — pure functions, no rendering, unit-tested.
 *
 * Gravity comes from the body record (Moon 1.62 m/s², NSSDCA). Speeds, acceleration and the jump impulse are
 * GAMEPLAY TUNING, not measured astronaut performance: the same leg push (jump take-off speed) is used on every
 * body so the difference you feel comes only from gravity (apex = v²/2g: ~0.69 m on the Moon vs ~0.30 m on Mars).
 */
import type { Collider } from './terrain'

export interface CharacterParams {
  gravity: number
  walkSpeed: number
  runSpeed: number
  /** horizontal acceleration / braking on the ground (m/s²); lower gravity = less traction */
  accel: number
  brake: number
  jumpSpeed: number
  radius: number
  turnRate: number
  airControl: number
  halfExtent: number
}

export function paramsForGravity(g: number, halfExtent: number): CharacterParams {
  const traction = Math.min(1, 0.45 + g / 9.81)
  return {
    gravity: g,
    walkSpeed: 1.1,
    runSpeed: g < 2 ? 2.2 : 2.6,
    accel: 3.4 * traction,
    brake: 4.6 * traction,
    jumpSpeed: 1.5,
    radius: 0.42,
    turnRate: 5.5,
    airControl: 0.12,
    halfExtent,
  }
}

export interface CharacterState {
  pos: [number, number, number]
  vel: [number, number, number]
  /** facing yaw (rad); 0 = facing north (−z), positive = turning left (three.js rotation.y) */
  yaw: number
  grounded: boolean
  /** accumulated horizontal distance (drives the gait so feet don't slide) */
  odometer: number
}

export interface CharacterInput {
  /** −1..1: forward (+) / back (−) */
  forward: number
  /** −1..1: right (+) / left (−) */
  right: number
  run: boolean
  jump: boolean
  /** camera yaw (rad): movement is relative to where the camera looks */
  camYaw: number
}

export interface Ground {
  heightAt(x: number, z: number): number
}

export const forwardOf = (yaw: number): [number, number] => [-Math.sin(yaw), -Math.cos(yaw)]
export const rightOf = (yaw: number): [number, number] => [Math.cos(yaw), -Math.sin(yaw)]
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function newCharacter(x: number, z: number, ground: Ground, yaw = 0): CharacterState {
  return { pos: [x, ground.heightAt(x, z), z], vel: [0, 0, 0], yaw, grounded: true, odometer: 0 }
}

export function stepCharacter(s: CharacterState, inp: CharacterInput, p: CharacterParams, ground: Ground, colliders: Collider[], dt: number): CharacterState {
  dt = Math.min(dt, 1 / 20)
  const pos: [number, number, number] = [...s.pos]
  const vel: [number, number, number] = [...s.vel]
  let { yaw, grounded, odometer } = s

  // desired horizontal velocity, relative to the camera
  const f = forwardOf(inp.camYaw), r = rightOf(inp.camYaw)
  let dx = f[0] * inp.forward + r[0] * inp.right
  let dz = f[1] * inp.forward + r[1] * inp.right
  const mag = Math.hypot(dx, dz)
  const speed = inp.run ? p.runSpeed : p.walkSpeed
  if (mag > 1e-6) {
    dx = (dx / Math.max(1, mag)) * speed
    dz = (dz / Math.max(1, mag)) * speed
  }

  // approach the desired velocity with limited acceleration (no instant starts or stops = no sliding feel)
  const ctl = grounded ? 1 : p.airControl
  const ex = dx - vel[0], ez = dz - vel[2]
  const err = Math.hypot(ex, ez)
  if (err > 0) {
    const a = (mag > 1e-6 ? p.accel : p.brake) * ctl * dt
    const k = Math.min(1, a / err)
    vel[0] += ex * k
    vel[2] += ez * k
  }
  if (grounded && mag < 1e-6 && Math.hypot(vel[0], vel[2]) < 0.02) {
    vel[0] = 0
    vel[2] = 0
  }

  // face the direction of travel, turning smoothly
  const hs = Math.hypot(vel[0], vel[2])
  if (hs > 0.15 && mag > 1e-6) {
    const target = Math.atan2(-vel[0], -vel[2])
    const d = wrapPi(target - yaw)
    yaw = wrapPi(yaw + Math.sign(d) * Math.min(Math.abs(d), p.turnRate * dt))
  }

  // jump / gravity
  if (grounded && inp.jump) {
    vel[1] = p.jumpSpeed
    grounded = false
  }
  vel[1] -= p.gravity * dt

  const ox = pos[0], oz = pos[2]
  pos[0] += vel[0] * dt
  pos[1] += vel[1] * dt
  pos[2] += vel[2] * dt

  // world bounds
  const H = p.halfExtent
  if (Math.abs(pos[0]) > H) { pos[0] = Math.sign(pos[0]) * H; vel[0] = 0 }
  if (Math.abs(pos[2]) > H) { pos[2] = Math.sign(pos[2]) * H; vel[2] = 0 }

  // obstacles: push out horizontally and cancel the velocity into them
  for (const c of colliders) {
    const cx = pos[0] - c.x, cz = pos[2] - c.z
    const min = c.r + p.radius
    const d2 = cx * cx + cz * cz
    if (d2 >= min * min) continue
    const top = ground.heightAt(c.x, c.z) + c.h
    if (pos[1] > top - 0.05) continue // above it (jumped over)
    const d = Math.sqrt(d2) || 1e-6
    const nx = cx / d, nz = cz / d
    pos[0] = c.x + nx * min
    pos[2] = c.z + nz * min
    const vn = vel[0] * nx + vel[2] * nz
    if (vn < 0) {
      vel[0] -= vn * nx
      vel[2] -= vn * nz
    }
  }

  // ground: land, or stay glued while walking down gentle slopes
  const gy = ground.heightAt(pos[0], pos[2])
  if (pos[1] <= gy) {
    pos[1] = gy
    if (vel[1] < 0) vel[1] = 0
    grounded = true
  } else if (grounded && vel[1] <= 0 && pos[1] - gy < 0.3) {
    pos[1] = gy
    vel[1] = 0
  } else {
    grounded = false
  }

  odometer += Math.hypot(pos[0] - ox, pos[2] - oz)
  return { pos, vel, yaw, grounded, odometer }
}

// ------------------------------------------------------------------ procedural gait

export interface GaitPose {
  hipL: number
  hipR: number
  kneeL: number
  kneeR: number
  shoulderL: number
  shoulderR: number
  elbow: number
  bob: number
  lean: number
}

/** leg length (hip to sole, m) of the rig in models/Astronaut */
export const LEG_LENGTH = 0.92

/**
 * Gait from the odometer: one full cycle = two steps, and the leg swing is sized so the planted foot travels
 * exactly one step length per half cycle, i.e. the feet do not slide. Faster = longer steps and, in low gravity,
 * the bouncing "lope" the Apollo crews used (more airborne bob, less knee flexion).
 */
export function gaitPose(odometer: number, speed: number, gravity: number, airborne: boolean): GaitPose {
  const s = Math.max(0, speed)
  const lowG = gravity < 2.5
  const step = 0.42 + 0.3 * Math.min(s, 2.5) // m per step
  const phase = (odometer / (2 * step)) * Math.PI * 2
  const amp = Math.min(0.62, Math.asin(Math.min(0.95, step / 2 / LEG_LENGTH))) * Math.min(1, s / 0.25)
  const sw = Math.sin(phase)
  const lope = lowG ? Math.min(1, Math.max(0, (s - 1.2) / 0.8)) : 0
  const hipL = amp * sw
  const hipR = -amp * (lope > 0 ? sw * (1 - 0.7 * lope) + 0.25 * lope : sw)
  const knee = (a: number) => Math.max(0, -Math.cos(a)) * amp * (1.3 - 0.5 * lope)
  const bobAmp = (lowG ? 0.05 + 0.1 * lope : 0.035) * Math.min(1, s / 0.4)
  return {
    hipL: airborne ? 0.25 : hipL,
    hipR: airborne ? -0.1 : hipR,
    kneeL: airborne ? 0.5 : knee(phase),
    kneeR: airborne ? 0.3 : knee(phase + Math.PI),
    shoulderL: -hipL * 0.55,
    shoulderR: hipL * 0.55,
    elbow: 0.35 + 0.15 * Math.min(1, s),
    bob: airborne ? 0 : Math.abs(Math.sin(phase)) * bobAmp,
    lean: 0.06 * Math.min(s, 2.5),
  }
}
