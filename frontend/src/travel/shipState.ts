import * as THREE from 'three'
import { Vec3, add, sub, len, scale, toThree, fromThree, SUN_POS, LY_PER_AU, C_KM_S } from '../astro/coords'
import { BY_ID, positionOf, radiusLyOf } from '../data/catalog'
import { relativeKm } from '../astro/heliocentric'
import { ShipState, FlightModel, CameraView, ThrottleGear } from './types'

/** km → ly, the same exact constant as catalog.ts (LY_PER_AU / KM_PER_AU). The old literal 1.057000834e-13 is kept
 *  in NavMapModal only for display; the previous C_LY_S literal (3.16887646e-8) was 21 ppm too large. */
export const KM_TO_LY = LY_PER_AU / 149597870.7
/** c in ly/s */
export const C_LY_S = C_KM_S * KM_TO_LY

// Maximum speeds per gear in ly/s
export const GEAR_SPEEDS: Record<ThrottleGear, { maxLyS: number; label: string; accelLyS2: number }> = {
  1: { maxLyS: 1000 * KM_TO_LY, label: 'SUB-LIGHT (0–1,000 km/s)', accelLyS2: 250 * KM_TO_LY },
  2: { maxLyS: 0.2 * C_LY_S, label: 'IMPULSE (0.2c)', accelLyS2: 0.05 * C_LY_S },
  3: { maxLyS: 25 * C_LY_S, label: 'INTERPLANETARY CRUISE (25c)', accelLyS2: 8 * C_LY_S },
  4: { maxLyS: 800 * C_LY_S, label: 'WARP CRUISE (800c)', accelLyS2: 300 * C_LY_S },
}

export const ship: ShipState = {
  pos: [...SUN_POS] as Vec3,
  vel: [0, 0, 0] as Vec3,
  acc: [0, 0, 0] as Vec3,
  quat: new THREE.Quaternion(),
  angVel: new THREE.Vector3(0, 0, 0),

  thrust: 0,
  boost: false,
  reverse: false,
  verticalThrust: 0,
  lateralThrust: 0,

  flightModel: 'assisted',
  stabilization: true,
  gear: 1,
  cameraView: 'chase',
  orbitAngle: { yaw: 0, pitch: 0.2, dist: 18 },

  targetId: 'earth',
  autopilot: {
    active: false,
    destinationId: null,
    destinationName: null,
    targetPos: [0, 0, 0],
    phase: 'align',
    progress: 0,
    initialDistanceLy: 0,
    currentDistanceLy: 0,
    etaSec: 0,
    warpActive: false,
  },

  refBodyId: null,
  localKm: null,
  nearestId: 'earth',
  nearestSurfaceLy: Infinity,
  arrivedId: null,
  chaseZoom: 1,
  event: null,

  speedKmS: 0,
  speedC: 0,
  headingDeg: { yaw: 0, pitch: 0 },
  gForce: 1,
  systemStatus: 'nominal',
}

/** Bodies with a surface the ship can collide with / navigate relative to. */
const COMPACT = new Set(['planet', 'moon', 'dwarf-planet', 'asteroid', 'star', 'star-system'])

export function flightEvent(text: string) {
  ship.event = { text, at: typeof performance !== 'undefined' ? performance.now() : Date.now() }
}

// ----------------------------------------------------------------------------------------------------------------
// Precise ship position. The authoritative state is ship.localKm: the offset (km, galactic axes) from the reference
// body. ship.pos (root-frame light-years, quantised at ~34 km near the Sun — blueprint finding D1) is DERIVED from it
// after every step, for the renderer and the rest of the app. If other code assigns ship.pos directly, the next step
// re-derives localKm from it (detected by array identity).
// ----------------------------------------------------------------------------------------------------------------
let lastWrittenPos: Vec3 | null = null
const KM_TO_LY_EXACT = KM_TO_LY

function writePos(simMs: number) {
  if (ship.refBodyId && ship.localKm && BY_ID[ship.refBodyId]) {
    ship.pos = add(positionOf(BY_ID[ship.refBodyId], simMs), scale(ship.localKm, KM_TO_LY_EXACT))
  }
  lastWrittenPos = ship.pos
}

function syncFromExternalPos(simMs: number) {
  if (!ship.refBodyId || !BY_ID[ship.refBodyId]) {
    ship.localKm = null
    return
  }
  if (!ship.localKm || ship.pos !== lastWrittenPos) {
    ship.localKm = scale(sub(ship.pos, positionOf(BY_ID[ship.refBodyId], simMs)), 1 / KM_TO_LY_EXACT)
    lastWrittenPos = ship.pos
  }
}

/** Make `id` the co-moving reference body without moving the ship (re-expresses localKm exactly in km). */
function setReferenceBody(id: string | null, simMs: number) {
  if (id === ship.refBodyId) return
  syncFromExternalPos(simMs)
  if (id && ship.refBodyId && ship.localKm && BY_ID[id]) {
    ship.localKm = add(ship.localKm, relativeKm(ship.refBodyId, id, simMs))
  } else if (id && BY_ID[id]) {
    ship.localKm = scale(sub(ship.pos, positionOf(BY_ID[id], simMs)), 1 / KM_TO_LY_EXACT)
  } else {
    ship.localKm = null
  }
  ship.refBodyId = id
  writePos(simMs)
}

/** Nearest compact body to `pos` and the distance to its (display) surface. */
export function nearestCompactBody(pos: Vec3, simMs: number): { id: string; surfaceLy: number; radiusLy: number } {
  let best = Infinity
  let bestId = 'sun'
  let bestR = 0
  for (const o of Object.values(BY_ID)) {
    if (!COMPACT.has(o.category)) continue
    const r = radiusLyOf(o)
    // the reference body's distance comes from the exact local offset, not the quantised root-frame difference
    const d = o.id === ship.refBodyId && ship.localKm && pos === ship.pos ? len(ship.localKm) * KM_TO_LY_EXACT : len(sub(positionOf(o, simMs), pos))
    const surf = d - r
    if (surf < best) {
      best = surf
      bestId = o.id
      bestR = r
    }
  }
  return { id: bestId, surfaceLy: best, radiusLy: bestR }
}

/** Place the spacecraft near a specific celestial body */
export function initShipNear(targetId: string, simMs: number) {
  const o = BY_ID[targetId] ?? BY_ID['earth'] ?? BY_ID['sun']
  const P = positionOf(o, simMs)
  const r = radiusLyOf(o)
  const mult = o.id === 'saturn' ? 4.5 : o.category === 'star' ? 3.0 : 2.5
  const spawnDist = Math.max(r * mult, 1e-12)

  // Position ship slightly above and offset from the target body.
  // We keep the offset in Y/Z to maintain full float64 precision away from the large galactic X offset (SUN_POS.x = -26673 ly).
  const offset: Vec3 = [0, spawnDist * 0.7, spawnDist * 0.7]
  ship.pos = add(P, offset)

  // Face toward the target
  const toTarget = new THREE.Vector3(...toThree(sub(P, ship.pos))).normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toTarget, up)
  ship.quat.setFromRotationMatrix(m)

  // Initial orbital velocity (circular velocity approx in sublight)
  const right = new THREE.Vector3().crossVectors(toTarget, up).normalize()
  const initSpeed = 30 * KM_TO_LY // 30 km/s orbital speed
  const vThree = right.multiplyScalar(initSpeed)
  ship.vel = fromThree([vThree.x, vThree.y, vThree.z])
  ship.acc = [0, 0, 0]
  ship.angVel.set(0, 0, 0)
  ship.thrust = 0
  ship.boost = false
  ship.reverse = false
  ship.gear = 1
  ship.targetId = o.id
  ship.arrivedId = null
  ship.event = null
  ship.refBodyId = COMPACT.has(o.category) ? o.id : null
  ship.localKm = ship.refBodyId ? scale(offset, 1 / KM_TO_LY_EXACT) : null
  writePos(simMs)
  const n = nearestCompactBody(ship.pos, simMs)
  ship.nearestId = n.id
  ship.nearestSurfaceLy = n.surfaceLy
  cancelAutopilot()
}

/**
 * Continuity entry: put the spacecraft EXACTLY where the observer camera is (position and orientation), at rest
 * in the co-moving frame of the nearest compact body - instead of re-spawning at a fixed offset next to a target
 * (which teleported the view and started the ship with an arbitrary 30 km/s sideways velocity).
 */
export function initShipAt(pos: Vec3, quat: THREE.Quaternion, simMs: number, preferRefId?: string | null) {
  ship.refBodyId = null
  ship.localKm = null
  ship.pos = [pos[0], pos[1], pos[2]]
  ship.quat.copy(quat)
  ship.vel = [0, 0, 0]
  ship.acc = [0, 0, 0]
  ship.angVel.set(0, 0, 0)
  ship.thrust = 0
  ship.boost = false
  ship.reverse = false
  ship.gear = 1
  ship.arrivedId = null
  ship.event = null
  const n = nearestCompactBody(ship.pos, simMs)
  // co-move with the body being viewed (e.g. Saturn, not its nearer moon Tethys); fall back to the nearest body
  const pref = preferRefId && BY_ID[preferRefId] && COMPACT.has(BY_ID[preferRefId].category) ? preferRefId : null
  const refId = pref ?? n.id
  ship.targetId = refId
  setReferenceBody(refId, simMs) // exact km offset from that body; the ship then co-moves with it
  ship.nearestId = n.id
  ship.nearestSurfaceLy = n.surfaceLy
  cancelAutopilot()
}

/** Engage automated navigation toward a destination */
export function engageAutopilot(targetId: string, simMs: number, useWarp: boolean = false) {
  const o = BY_ID[targetId]
  if (!o) return false
  const targetPos = positionOf(o, simMs)
  const dist = len(sub(targetPos, ship.pos))

  ship.targetId = targetId
  ship.arrivedId = null
  ship.autopilot = {
    active: true,
    destinationId: targetId,
    destinationName: o.name,
    targetPos,
    phase: 'align',
    progress: 0,
    initialDistanceLy: dist,
    currentDistanceLy: dist,
    etaSec: 0,
    warpActive: useWarp || dist > 0.05 * LY_PER_AU,
  }

  // Switch to suitable gear for distance
  if (dist > 0.08 * LY_PER_AU) {
    ship.gear = 4 // Warp gear for interplanetary distances
  } else if (dist > 0.005 * LY_PER_AU) {
    ship.gear = 3
  } else if (dist > 0.0005 * LY_PER_AU) {
    ship.gear = 2
  } else {
    ship.gear = 1
  }

  // Navigate in the destination's co-moving frame: the target is then stationary for the guidance law.
  if (COMPACT.has(o.category)) setReferenceBody(targetId, simMs)
  ship.systemStatus = ship.autopilot.warpActive ? 'warp' : 'autopilot'
  flightEvent(`Autopilot engaged → ${o.name}`)
  return true
}

/** Cancel autopilot and return full manual control */
export function cancelAutopilot(reason?: string) {
  const had = ship.autopilot.active
  ship.autopilot.active = false
  ship.autopilot.destinationId = null
  ship.autopilot.destinationName = null
  ship.autopilot.warpActive = false
  ship.systemStatus = 'nominal'
  if (had) {
    ship.thrust = 0
    if (reason) flightEvent(reason)
  }
  return had
}

export function setFlightModel(m: FlightModel) {
  ship.flightModel = m
}

export function setCameraView(v: CameraView) {
  ship.cameraView = v
}

export function cycleCameraView() {
  const views: CameraView[] = ['cockpit', 'chase', 'external']
  const idx = views.indexOf(ship.cameraView)
  ship.cameraView = views[(idx + 1) % views.length]
}

export function setGear(g: ThrottleGear) {
  ship.gear = g
}

export function toggleStabilization() {
  ship.stabilization = !ship.stabilization
}

export interface FlightInput {
  /** rotation-rate commands, −1..1 (keyboard) */
  yaw: number
  pitch: number
  roll: number
  /** throttle lever change rate (+1 = W held, −1 = S held) */
  thrustDelta: number
  /** S held: once the throttle reaches zero the ship thrusts backward */
  reverse: boolean
  boost: boolean
  /** lateral (A/D) and vertical (Space/C) thrust, −1..1 */
  strafeX: number
  strafeY: number
  brake: boolean
  /** mouse-look rotation accumulated since the last step (radians); consumed by the step */
  lookYaw?: number
  lookPitch?: number
}

/** Fraction of the gear acceleration used for reverse, lateral and vertical thrusters. */
const RCS_FRACTION = 0.5
/** Manual speed is capped at this many surface-distances per second near bodies (no frame-skips into planets). */
const PROXIMITY_SPEED_PER_S = 1.5
const MIN_PROXIMITY_SPEED_LYS = 2 * KM_TO_LY
/** Below the gear maximum the autopilot follows a braking curve v = BRAKE_MARGIN·sqrt(2·a·d), capped at d / APPROACH_TAU. */
const BRAKE_MARGIN = 0.8
const APPROACH_TAU = 1.5

/** Single-step numerical integration of spacecraft flight physics */
export function stepShipPhysics(dt: number, simMs: number, input: FlightInput) {
  const safeDt = Math.min(Math.max(dt, 0), 0.1)

  // 0. Co-moving reference frame: the ship's state is an exact km offset from its reference body, so it moves with
  //    that body as simulation time runs (autopilot target while engaged, otherwise the nearest body).
  syncFromExternalPos(simMs)
  const wantRef =
    ship.autopilot.active && ship.autopilot.destinationId ? ship.autopilot.destinationId
      : ship.arrivedId ? ship.arrivedId // station keeping stays with the body we arrived at
        : ship.refBodyId ?? ship.nearestId
  if (wantRef && BY_ID[wantRef] && COMPACT.has(BY_ID[wantRef].category)) setReferenceBody(wantRef, simMs)
  writePos(simMs)

  const q = ship.quat
  let fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  let up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
  let right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)

  const gearConfig = GEAR_SPEEDS[ship.gear]
  ship.boost = !!input.boost && !ship.autopilot.active
  const boostMult = ship.boost ? 3.0 : 1.0
  let effectiveMaxSpeed = gearConfig.maxLyS * boostMult
  let effectiveAccel = gearConfig.accelLyS2 * boostMult

  let vel = new THREE.Vector3(...toThree(ship.vel))
  const accelVector = new THREE.Vector3()

  if (ship.autopilot.active && ship.autopilot.destinationId && BY_ID[ship.autopilot.destinationId]) {
    // ------------------------------------------------------------------ AUTOPILOT (velocity-vector guidance)
    const dest = BY_ID[ship.autopilot.destinationId]
    ship.autopilot.targetPos = positionOf(dest, simMs)
    const rel: Vec3 = ship.refBodyId === dest.id && ship.localKm ? scale(ship.localKm, -KM_TO_LY_EXACT) : sub(ship.autopilot.targetPos, ship.pos)
    const dist = len(rel)
    const toTarget = new THREE.Vector3(...toThree(rel)).normalize()
    const destRadius = radiusLyOf(dest) || 1e-7
    const safeArrivalDist = Math.max(destRadius * (dest.id === 'saturn' ? 4.2 : 2.6), 1e-12)
    const rem = Math.max(0, dist - safeArrivalDist)

    // gear management (downshift on approach so warp never overshoots)
    if (rem <= 0.05 * LY_PER_AU && ship.gear === 4) {
      ship.gear = 3
      ship.autopilot.warpActive = false
    }
    if (rem <= 0.003 * LY_PER_AU && ship.gear === 3) ship.gear = 2
    if (rem <= Math.max(destRadius * 15, 0.0001 * LY_PER_AU) && ship.gear === 2) ship.gear = 1
    const g = GEAR_SPEEDS[ship.gear]
    effectiveMaxSpeed = g.maxLyS
    // Downshifting reduces the speed ceiling, not the braking authority: the autopilot may always decelerate as hard
    // as needed to stop on the arrival shell (otherwise speed carried in from a higher gear overshoots the target).
    const vNow = vel.length()
    effectiveAccel = Math.max(g.accelLyS2, rem > 0 ? (1.25 * vNow * vNow) / (2 * rem) : 0)
    ship.systemStatus = ship.autopilot.warpActive ? 'warp' : 'autopilot'

    // attitude: turn the nose toward the target
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toTarget, up))
    ship.quat.slerp(targetQuat, Math.min(1, safeDt * 3.5))
    const aligned = fwd.dot(toTarget) > 0.95

    // desired velocity along the line of sight; lateral drift is cancelled by the same correction
    const vBrake = BRAKE_MARGIN * Math.sqrt(2 * effectiveAccel * rem)
    const vDesired = Math.min(effectiveMaxSpeed, vBrake, Math.max(rem / APPROACH_TAU, MIN_PROXIMITY_SPEED_LYS))
    const desired = toTarget.clone().multiplyScalar(aligned ? vDesired : Math.min(vDesired, vel.length()))
    const dv = desired.clone().sub(vel)
    const maxDv = effectiveAccel * safeDt * (aligned ? 1.5 : 0.5)
    if (dv.length() > maxDv) dv.setLength(maxDv)
    accelVector.copy(dv).multiplyScalar(1 / Math.max(safeDt, 1e-9))
    vel.add(dv)
    ship.thrust = Math.min(1, dv.length() / Math.max(effectiveAccel * safeDt, 1e-30))

    const speed = vel.length()
    ship.autopilot.phase = !aligned ? 'align' : vBrake < effectiveMaxSpeed && speed > 0.5 * vBrake ? 'decelerate' : speed >= 0.95 * effectiveMaxSpeed ? 'cruise' : 'accelerate'
    const initial = Math.max(ship.autopilot.initialDistanceLy, safeArrivalDist * 2)
    ship.autopilot.currentDistanceLy = dist
    ship.autopilot.progress = Math.max(0, Math.min(1, 1 - rem / Math.max(initial - safeArrivalDist, 1e-30)))
    ship.autopilot.etaSec = speed > 0 ? rem / speed : 0

    if (rem <= safeArrivalDist * 0.05) {
      // ARRIVAL: stop relative to the destination and hold station in its co-moving frame.
      ship.autopilot.phase = 'arrive'
      ship.autopilot.active = false
      ship.autopilot.warpActive = false
      ship.autopilot.progress = 1
      ship.autopilot.etaSec = 0
      ship.thrust = 0
      ship.gear = 1
      ship.systemStatus = 'nominal'
      ship.arrivedId = dest.id
      vel.set(0, 0, 0)
      ship.angVel.set(0, 0, 0)
      flightEvent(`Arrived at ${dest.name} — holding station`)
    }
  } else {
    // ------------------------------------------------------------------ MANUAL FLIGHT
    // attitude from keys
    const rotSpeed = 1.8 // rad/s
    if (ship.flightModel === 'assisted') {
      if (input.yaw || input.pitch || input.roll) {
        ship.angVel.set(input.pitch * rotSpeed, input.yaw * rotSpeed, input.roll * rotSpeed)
      } else {
        ship.angVel.multiplyScalar(Math.pow(0.001, safeDt * 6))
      }
    } else {
      const torque = 3.2
      ship.angVel.x += input.pitch * torque * safeDt
      ship.angVel.y += input.yaw * torque * safeDt
      ship.angVel.z += input.roll * torque * safeDt
      if (ship.stabilization && !input.yaw && !input.pitch && !input.roll) ship.angVel.multiplyScalar(Math.pow(0.02, safeDt * 3))
    }
    if (ship.angVel.lengthSq() > 1e-8) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ship.angVel.x * safeDt, -ship.angVel.y * safeDt, -ship.angVel.z * safeDt, 'YXZ'))
      ship.quat.multiply(rot).normalize()
    }
    // mouse look: direct rotation (yaw about the ship's up axis, pitch about its right axis)
    if (input.lookYaw || input.lookPitch) {
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(input.lookYaw ?? 0))
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(input.lookPitch ?? 0))
      ship.quat.multiply(yawQ).multiply(pitchQ).normalize()
    }
    fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)
    up = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quat)
    right = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quat)

    // throttle lever
    if (input.thrustDelta !== 0) ship.thrust = Math.max(0, Math.min(1, ship.thrust + input.thrustDelta * safeDt * 1.5))
    ship.reverse = !!input.reverse && ship.thrust === 0
    ship.lateralThrust = input.strafeX
    ship.verticalThrust = input.strafeY

    if (ship.thrust > 0) accelVector.add(fwd.clone().multiplyScalar(effectiveAccel * ship.thrust))
    if (ship.reverse) accelVector.add(fwd.clone().multiplyScalar(-effectiveAccel * RCS_FRACTION))
    if (ship.lateralThrust) accelVector.add(right.clone().multiplyScalar(ship.lateralThrust * effectiveAccel * RCS_FRACTION))
    if (ship.verticalThrust) accelVector.add(up.clone().multiplyScalar(ship.verticalThrust * effectiveAccel * RCS_FRACTION))
    vel.add(accelVector.clone().multiplyScalar(safeDt))

    const thrusting = ship.thrust > 0 || ship.reverse || !!ship.lateralThrust || !!ship.verticalThrust
    if (input.brake) {
      vel.multiplyScalar(Math.pow(0.01, safeDt * 4))
    } else if (!thrusting && ship.flightModel === 'assisted') {
      vel.multiplyScalar(Math.pow(0.05, safeDt * 1.5)) // assisted: coast to a stop
    } else if (!thrusting && ship.stabilization) {
      // inertial + RCS stabilisation: slow bleed; inertial without stabilisation: pure coast
      vel.multiplyScalar(Math.pow(0.2, safeDt))
    }

    // speed limits: gear maximum, then a proximity governor so warp can never skip into or past a body
    const proximityCap = Math.max(ship.nearestSurfaceLy * PROXIMITY_SPEED_PER_S, MIN_PROXIMITY_SPEED_LYS)
    const cap = Math.min(effectiveMaxSpeed, Number.isFinite(proximityCap) ? proximityCap : effectiveMaxSpeed)
    if (vel.length() > cap) vel.setLength(cap)
  }

  ship.acc = fromThree([accelVector.x, accelVector.y, accelVector.z])

  // 2. Integrate position
  const step = vel.clone().multiplyScalar(safeDt)
  const stepRoot = fromThree([step.x, step.y, step.z])
  if (ship.localKm && ship.refBodyId) {
    ship.localKm = add(ship.localKm, scale(stepRoot, 1 / KM_TO_LY_EXACT))
    writePos(simMs)
  } else {
    ship.pos = add(ship.pos, stepRoot)
    lastWrittenPos = ship.pos
  }

  // 3. Nearest body, collision and proximity
  const n = nearestCompactBody(ship.pos, simMs)
  ship.nearestId = n.id
  ship.nearestSurfaceLy = n.surfaceLy
  if (n.radiusLy > 0 && n.surfaceLy < n.radiusLy * 0.5) {
    if (!ship.autopilot.active) ship.systemStatus = 'proximity-alert'
    if (n.surfaceLy <= 0) {
      // never inside a body: put the ship back on a safe shell and remove the inward velocity component
      if (n.id !== ship.refBodyId) setReferenceBody(n.id, simMs)
      const offKm = ship.localKm ?? [0, 0, 0]
      let outDir = new THREE.Vector3(...toThree(offKm))
      if (outDir.lengthSq() === 0) outDir = up.clone()
      outDir.normalize()
      const safeKm = fromThree([outDir.x, outDir.y, outDir.z])
      ship.localKm = scale(safeKm, (n.radiusLy * 1.15) / KM_TO_LY_EXACT)
      writePos(simMs)
      const inward = vel.dot(outDir)
      if (inward < 0) vel.sub(outDir.multiplyScalar(inward))
      ship.nearestSurfaceLy = n.radiusLy * 0.15
      flightEvent(`Collision avoided — ${BY_ID[n.id].name} surface`)
    }
  } else if (!ship.autopilot.active && ship.systemStatus === 'proximity-alert') {
    ship.systemStatus = 'nominal'
  }

  ship.vel = fromThree([vel.x, vel.y, vel.z])

  // When nothing else is chosen, navigate relative to the nearest body from the next step on.
  // Manual flight: adopt the nearest body as reference, with hysteresis so a passing small moon does not flip it.
  if (!ship.autopilot.active && !ship.arrivedId && ship.refBodyId !== ship.nearestId) {
    const ref = ship.refBodyId ? BY_ID[ship.refBodyId] : null
    const refSurf = ref ? len(ship.localKm ?? sub(ship.pos, positionOf(ref, simMs))) * (ship.localKm ? KM_TO_LY_EXACT : 1) - radiusLyOf(ref) : Infinity
    if (!ref || ship.nearestSurfaceLy < 0.7 * refSurf) setReferenceBody(ship.nearestId, simMs)
  }
  if (ship.arrivedId && !ship.autopilot.active && (input.thrustDelta || input.reverse || input.strafeX || input.strafeY)) ship.arrivedId = null

  // 4. HUD telemetry
  const speedLyS = len(ship.vel)
  ship.speedKmS = speedLyS / KM_TO_LY
  ship.speedC = speedLyS / C_LY_S
  ship.gForce = accelVector.length() / (9.80665e-3 * KM_TO_LY) // proper acceleration in standard g
  fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)
  ship.headingDeg = {
    yaw: ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360,
    pitch: (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI,
  }
}

/** Debug / browser-test handles (same convention as window.__nav and window.__store). */
if (typeof window !== 'undefined') {
  ;(window as any).__ship = ship
  ;(window as any).__shipApi = {
    engageAutopilot,
    cancelAutopilot,
    setCameraView,
    initShipNear,
    positionOf: (id: string, ms: number) => positionOf(BY_ID[id], ms),
  }
}
