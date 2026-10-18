import * as THREE from 'three'
import { Vec3, add, sub, len, toThree, fromThree, SUN_POS, LY_PER_AU, C_KM_S } from '../astro/coords'
import { BY_ID, positionOf, radiusLyOf } from '../data/catalog'
import { ShipState, FlightModel, CameraView, ThrottleGear } from './types'

export const C_LY_S = 3.16887646e-8 // c in ly/s
export const KM_TO_LY = 1.057000834e-13

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

  speedKmS: 0,
  speedC: 0,
  headingDeg: { yaw: 0, pitch: 0 },
  gForce: 1,
  systemStatus: 'nominal',
}

/** Place the spacecraft near a specific celestial body */
export function initShipNear(targetId: string, simMs: number) {
  const o = BY_ID[targetId] ?? BY_ID['earth'] ?? BY_ID['sun']
  const P = positionOf(o, simMs)
  const r = radiusLyOf(o)
  const spawnDist = Math.max(r * 2.5, 0.0005 * LY_PER_AU, 1e-8)

  // Position ship slightly above and offset from the planet
  const offset: Vec3 = [spawnDist * 0.7, spawnDist * 0.4, spawnDist * 0.6]
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
  cancelAutopilot()
}

/** Engage automated navigation toward a destination */
export function engageAutopilot(targetId: string, simMs: number, useWarp: boolean = false) {
  const o = BY_ID[targetId]
  if (!o) return false
  const targetPos = positionOf(o, simMs)
  const dist = len(sub(targetPos, ship.pos))

  ship.targetId = targetId
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
  if (dist > 0.1 * LY_PER_AU) {
    ship.gear = 4 // Warp gear for interplanetary distances
  } else if (dist > 0.005 * LY_PER_AU) {
    ship.gear = 3
  } else {
    ship.gear = 2
  }

  ship.systemStatus = ship.autopilot.warpActive ? 'warp' : 'autopilot'
  return true
}

/** Cancel autopilot and return full manual control */
export function cancelAutopilot() {
  const had = ship.autopilot.active
  ship.autopilot.active = false
  ship.autopilot.destinationId = null
  ship.autopilot.destinationName = null
  ship.autopilot.warpActive = false
  ship.systemStatus = 'nominal'
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

/** Single-step numerical integration of spacecraft flight physics */
export function stepShipPhysics(
  dt: number,
  simMs: number,
  input: {
    yaw: number
    pitch: number
    roll: number
    thrustDelta: number
    reverse: boolean
    boost: boolean
    strafeX: number
    strafeY: number
    brake: boolean
  }
) {
  const safeDt = Math.min(dt, 0.1)

  // 1. Rotation handling
  const q = ship.quat
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)

  if (ship.autopilot.active && ship.autopilot.destinationId) {
    // Autopilot alignment
    const o = BY_ID[ship.autopilot.destinationId]
    if (o) {
      ship.autopilot.targetPos = positionOf(o, simMs)
      const toTarget = new THREE.Vector3(...toThree(sub(ship.autopilot.targetPos, ship.pos))).normalize()
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toTarget, up)
      )
      // Smooth slerp toward target heading
      ship.quat.slerp(targetQuat, Math.min(1, safeDt * 3.5))

      // Angle to target
      const dot = fwd.dot(toTarget)
      if (dot > 0.98) {
        ship.autopilot.phase = ship.autopilot.warpActive ? 'cruise' : 'accelerate'
        ship.thrust = 1.0
      } else {
        ship.autopilot.phase = 'align'
        ship.thrust = 0.25
      }
    }
  } else {
    // Manual rotation
    const rotSpeed = 1.8 // rad/s
    if (ship.flightModel === 'assisted') {
      // In assisted mode, input directly controls angular velocity, which dampens when released
      if (input.yaw || input.pitch || input.roll) {
        ship.angVel.x = input.pitch * rotSpeed
        ship.angVel.y = input.yaw * rotSpeed
        ship.angVel.z = input.roll * rotSpeed
      } else {
        ship.angVel.multiplyScalar(Math.pow(0.001, safeDt * 6))
      }
    } else {
      // In inertial mode, input applies torque/angular acceleration
      const torque = 3.2
      ship.angVel.x += input.pitch * torque * safeDt
      ship.angVel.y += input.yaw * torque * safeDt
      ship.angVel.z += input.roll * torque * safeDt
      if (ship.stabilization && !input.yaw && !input.pitch && !input.roll) {
        ship.angVel.multiplyScalar(Math.pow(0.02, safeDt * 3))
      }
    }

    // Apply angular velocity to quaternion
    if (ship.angVel.lengthSq() > 1e-8) {
      const rot = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          ship.angVel.x * safeDt,
          ship.angVel.y * safeDt,
          ship.angVel.z * safeDt,
          'YXZ'
        )
      )
      ship.quat.multiply(rot).normalize()
    }
  }

  // 2. Throttle & Thrust calculation
  if (!ship.autopilot.active) {
    if (input.thrustDelta !== 0) {
      ship.thrust = Math.max(0, Math.min(1, ship.thrust + input.thrustDelta * safeDt * 1.5))
    }
    ship.reverse = input.reverse
    ship.boost = input.boost
    ship.lateralThrust = input.strafeX
    ship.verticalThrust = input.strafeY
  }

  const gearConfig = GEAR_SPEEDS[ship.gear]
  const boostMult = ship.boost ? 3.0 : 1.0
  const effectiveMaxSpeed = gearConfig.maxLyS * boostMult
  const effectiveAccel = gearConfig.accelLyS2 * boostMult

  // Calculate forward acceleration in Three.js coords
  let accelVector = new THREE.Vector3()
  if (ship.thrust > 0) {
    const dir = ship.reverse ? fwd.clone().negate() : fwd.clone()
    accelVector.add(dir.multiplyScalar(effectiveAccel * ship.thrust))
  }

  // Lateral and vertical strafe thrust
  if (ship.lateralThrust !== 0) {
    accelVector.add(right.clone().multiplyScalar(ship.lateralThrust * effectiveAccel * 0.4))
  }
  if (ship.verticalThrust !== 0) {
    accelVector.add(up.clone().multiplyScalar(ship.verticalThrust * effectiveAccel * 0.4))
  }

  // Convert acceleration to root frame
  const accRoot = fromThree([accelVector.x, accelVector.y, accelVector.z])
  ship.acc = accRoot

  // 3. Update velocity
  let curVelThree = new THREE.Vector3(...toThree(ship.vel))
  curVelThree.add(accelVector.multiplyScalar(safeDt))

  // Damping / stabilization
  if (input.brake) {
    curVelThree.multiplyScalar(Math.pow(0.01, safeDt * 4))
  } else if (ship.flightModel === 'assisted' && ship.thrust === 0 && !ship.autopilot.active) {
    // In assisted mode with no throttle, gently dampen velocity toward stop
    curVelThree.multiplyScalar(Math.pow(0.05, safeDt * 1.5))
  } else if (ship.stabilization && ship.thrust === 0 && !ship.autopilot.active) {
    curVelThree.multiplyScalar(Math.pow(0.2, safeDt))
  }

  // Speed clamping to gear max
  const curSpeed = curVelThree.length()
  if (curSpeed > effectiveMaxSpeed) {
    curVelThree.normalize().multiplyScalar(effectiveMaxSpeed)
  }

  ship.vel = fromThree([curVelThree.x, curVelThree.y, curVelThree.z])

  // 4. Update position
  const deltaPos = curVelThree.clone().multiplyScalar(safeDt)
  ship.pos = add(ship.pos, fromThree([deltaPos.x, deltaPos.y, deltaPos.z]))

  // 5. Update Autopilot progress and arrival logic
  if (ship.autopilot.active && ship.autopilot.destinationId) {
    const dist = len(sub(ship.autopilot.targetPos, ship.pos))
    ship.autopilot.currentDistanceLy = dist
    const destObj = BY_ID[ship.autopilot.destinationId]
    const destRadius = destObj ? radiusLyOf(destObj) : 1e-7
    const safeArrivalDist = Math.max(destRadius * 3, 0.0001 * LY_PER_AU, 1e-8)

    // Progress percentage
    const initial = Math.max(ship.autopilot.initialDistanceLy, safeArrivalDist * 2)
    ship.autopilot.progress = Math.max(0, Math.min(1, 1 - (dist - safeArrivalDist) / (initial - safeArrivalDist)))

    // Estimated time of arrival
    const speedLyS = Math.max(curSpeed, 1e-12)
    ship.autopilot.etaSec = (dist - safeArrivalDist) / speedLyS

    // Deceleration & arrival
    if (dist <= safeArrivalDist * 1.8) {
      ship.autopilot.phase = 'decelerate'
      ship.thrust = Math.max(0.1, (dist - safeArrivalDist) / safeArrivalDist)
      curVelThree.multiplyScalar(Math.pow(0.05, safeDt * 3))
      ship.vel = fromThree([curVelThree.x, curVelThree.y, curVelThree.z])
    }

    if (dist <= safeArrivalDist * 1.05) {
      // Arrived!
      ship.autopilot.phase = 'arrive'
      ship.autopilot.active = false
      ship.autopilot.warpActive = false
      ship.thrust = 0
      ship.systemStatus = 'nominal'
      ship.gear = 1 // Return to sublight maneuvering gear
    }
  }

  // 6. Safe minimum distance clamping around nearest celestial surface (planets, moons, stars)
  let nearestSurface = Infinity
  let nearestObjId = 'earth'
  for (const o of Object.values(BY_ID)) {
    // Only physical compact bodies have solid/stellar surfaces that require collision avoidance
    if (o.category !== 'planet' && o.category !== 'moon' && o.category !== 'star' && o.category !== 'star-system') {
      continue
    }
    const targetP = positionOf(o, simMs)
    const d = len(sub(targetP, ship.pos))
    const r = radiusLyOf(o)
    const surf = d - r
    if (surf < nearestSurface) {
      nearestSurface = surf
      nearestObjId = o.id
    }
  }

  // Proximity alert when within 1.5 visual radii of a surface
  const nearestObj = BY_ID[nearestObjId]
  const nearestRadius = nearestObj ? radiusLyOf(nearestObj) : 0
  if (nearestSurface < nearestRadius * 0.5 && nearestRadius > 0) {
    if (!ship.autopilot.active) ship.systemStatus = 'proximity-alert'
    // Prevent physical penetration into planetary core
    if (nearestSurface <= 0) {
      const p = positionOf(nearestObj, simMs)
      const outDir = new THREE.Vector3(...toThree(sub(ship.pos, p))).normalize()
      const safeP = outDir.multiplyScalar(nearestRadius * 1.15)
      ship.pos = add(p, fromThree([safeP.x, safeP.y, safeP.z]))
      // Deflect velocity away from surface
      curVelThree.reflect(outDir).multiplyScalar(0.3)
      ship.vel = fromThree([curVelThree.x, curVelThree.y, curVelThree.z])
    }
  } else if (!ship.autopilot.active && ship.systemStatus === 'proximity-alert') {
    ship.systemStatus = 'nominal'
  }

  // 7. Update HUD Telemetry readouts
  const speedLyS = len(ship.vel)
  ship.speedKmS = speedLyS / KM_TO_LY
  ship.speedC = speedLyS / C_LY_S
  ship.gForce = Math.max(1, (accelVector.length() / (9.81 * KM_TO_LY)) + 1)

  // Heading angles in degrees
  ship.headingDeg = {
    yaw: ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360,
    pitch: (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI,
  }
}
