import * as THREE from 'three'
import { Vec3 } from '../astro/coords'

export type FlightModel = 'assisted' | 'inertial'
export type CameraView = 'cockpit' | 'chase' | 'external'
export type ThrottleGear = 1 | 2 | 3 | 4 // 1: Sub-light (km/s), 2: Impulse (0.1c), 3: Cruise (10c), 4: Warp (1000c)

export interface AutopilotState {
  active: boolean
  destinationId: string | null
  destinationName: string | null
  targetPos: Vec3
  phase: 'align' | 'accelerate' | 'cruise' | 'decelerate' | 'arrive'
  progress: number // 0 to 1
  initialDistanceLy: number
  currentDistanceLy: number
  etaSec: number
  warpActive: boolean
}

export interface ShipState {
  pos: Vec3 // root-frame position in double-precision light-years
  vel: Vec3 // root-frame velocity in light-years per second
  acc: Vec3 // root-frame acceleration in ly/s^2
  quat: THREE.Quaternion // orientation in Three.js coordinate system
  angVel: THREE.Vector3 // pitch, yaw, roll rates (rad/s)
  
  thrust: number // 0 to 1
  boost: boolean // afterburner boost multiplier
  reverse: boolean // reverse thrust
  verticalThrust: number // -1 to 1
  lateralThrust: number // -1 to 1

  flightModel: FlightModel
  stabilization: boolean
  gear: ThrottleGear
  cameraView: CameraView
  orbitAngle: { yaw: number; pitch: number; dist: number } // for external view

  targetId: string | null
  autopilot: AutopilotState

  /**
   * Co-moving navigation frame. ship.pos is carried along with this body's motion every step, so ship.vel is the
   * velocity RELATIVE to it (the autopilot target while the autopilot is engaged, otherwise the nearest body).
   * Without this, a ship parked near a planet is left behind as soon as simulation time runs.
   */
  refBodyId: string | null
  /** Authoritative position: exact offset from the reference body, km, galactic axes (ship.pos is derived). */
  localKm: Vec3 | null
  /** Nearest compact body (planet, moon, dwarf planet, asteroid, star) and the distance to its surface. */
  nearestId: string
  nearestSurfaceLy: number
  /** Body the autopilot last arrived at (station keeping) or null. */
  arrivedId: string | null
  /** Chase-camera distance multiplier (mouse wheel). */
  chaseZoom: number
  /** Latest flight event for the HUD (e.g. "Autopilot disengaged — manual override"). */
  event: { text: string; at: number } | null

  // Derived telemetry metrics for HUD
  speedKmS: number
  speedC: number
  headingDeg: { yaw: number; pitch: number }
  gForce: number
  systemStatus: 'nominal' | 'autopilot' | 'warp' | 'proximity-alert'
}
