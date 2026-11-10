import * as THREE from 'three'
import { ship, cycleCameraView, toggleStabilization, setFlightModel, setGear, cancelAutopilot, engageAutopilot, flightEvent, FlightInput } from './shipState'
import { useStore } from '../store/store'
import { input } from '../input/appInput'
import type { Action } from '../input/inputManager'

/**
 * Travel Mode input, read from the central input manager (mode SPACECRAFT_FLIGHT, see input/inputManager.ts).
 *
 * THE RULE: W A S D translate the spacecraft, the ARROW KEYS AIM THE CAMERA. Never the other way round.
 *   W / S        thrust forward / reverse thrust (S at zero throttle thrusts backward)
 *   A / D        thrust left / right          Space / Z   thrust up / down          Q / E   roll
 *   ↑ ↓ ← →      turn the camera / view ONLY. In MANUAL piloting, while thrusting, the ship turns toward where the
 *                camera looks (assisted flight), so "W goes where you look", exactly like walking on a surface.
 *   Shift boost · B brake · P automatic / manual piloting · C / V camera · F flight model · X stabilisation
 *   1–4 speed range · M navigation map · Esc leave Travel Mode
 *
 * The AUTOPILOT IS NEVER CANCELLED BY A FLIGHT KEY OR A MOUSE DRAG. While it flies, movement keys do nothing except
 * remind the pilot that P takes manual control; the arrows still look around. Only P (or the HUD button) disengages it.
 */
export const travelInput: Required<FlightInput> = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  thrustDelta: 0,
  reverse: false,
  boost: false,
  strafeX: 0,
  strafeY: 0,
  brake: false,
  lookYaw: 0,
  lookPitch: 0,
}

/** UI state the key handler must respect (set by TravelHUD). One shared object, in its own module (no import cycle). */
export { travelUi } from './travelUi'

/**
 * Camera view direction RELATIVE TO THE SHIP for the cockpit and chase cameras (rad): yaw > 0 looks right, pitch > 0
 * looks up. The external camera keeps its own orbit angles (ship.orbitAngle).
 */
export const travelView = { yaw: 0, pitch: 0 }
if (typeof window !== 'undefined') (window as unknown as { __travelView?: typeof travelView }).__travelView = travelView
const VIEW_PITCH_LIMIT = 1.2
/** proportional steering gain: offset (rad) → turn command (−1..1) in manual piloting */
const STEER_GAIN = 2.5
const STEER_DEADZONE = 0.004

function zeroAxes() {
  travelInput.thrustDelta = 0
  travelInput.reverse = false
  travelInput.strafeX = 0
  travelInput.strafeY = 0
  travelInput.roll = 0
  travelInput.boost = false
  travelInput.brake = false
  travelInput.yaw = 0
  travelInput.pitch = 0
}

/** Release everything (focus loss, tab hidden, leaving Travel Mode). */
export function releaseAllTravelInput() {
  input.releaseAll()
  travelInput.lookYaw = 0
  travelInput.lookPitch = 0
  zeroAxes()
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
let lastAutoHintAt = -Infinity

/**
 * Read the keyboard once per frame (before stepShipPhysics). Fills travelInput from the held keys and turns the camera
 * from the arrow keys. Exported for tests.
 */
export function pollTravelInput(dt: number, now: number = performance.now()) {
  zeroAxes()
  if (input.refresh() !== 'SPACECRAFT_FLIGHT') return
  const auto = ship.autopilot.active

  // arrows → camera only
  const l = input.look()
  const rate = input.settings.lookSpeed * dt
  if (l.x || l.y) {
    if (ship.cameraView === 'external') {
      ship.orbitAngle.yaw -= l.x * rate
      ship.orbitAngle.pitch = Math.max(-1.4, Math.min(1.4, ship.orbitAngle.pitch - l.y * rate))
    } else {
      travelView.yaw = wrapPi(travelView.yaw + l.x * rate)
      travelView.pitch = Math.max(-VIEW_PITCH_LIMIT, Math.min(VIEW_PITCH_LIMIT, travelView.pitch + l.y * rate))
    }
  }

  const fwd = input.axis('moveForward', 'moveBack')
  const side = input.axis('moveRight', 'moveLeft')
  const vert = input.axis('ascend', 'descend')
  const roll = input.axis('rollRight', 'rollLeft')
  if (auto) {
    // the autopilot keeps flying: a translation key only explains how to take over (at most every 4 s)
    if ((fwd || side || vert || roll || input.isHeld('brake')) && now - lastAutoHintAt > 4000) {
      lastAutoHintAt = now
      flightEvent('Autopilot is flying — press P for manual piloting')
    }
    return
  }
  travelInput.thrustDelta = fwd
  travelInput.reverse = input.isHeld('moveBack') && !input.isHeld('moveForward')
  travelInput.strafeX = side
  travelInput.strafeY = vert
  travelInput.roll = roll
  travelInput.boost = input.isHeld('sprint')
  travelInput.brake = input.isHeld('brake')

  // manual piloting: WHILE THRUSTING the ship turns its nose toward the camera's view (cockpit / chase), the way the
  // astronaut turns to face where it walks. The arrows alone never rotate the ship. Physics: yaw +1 = right, +1 pitch = nose down
  if (ship.cameraView !== 'external' && (fwd || side || vert)) {
    if (Math.abs(travelView.yaw) > STEER_DEADZONE) travelInput.yaw = Math.max(-1, Math.min(1, travelView.yaw * STEER_GAIN))
    if (Math.abs(travelView.pitch) > STEER_DEADZONE) travelInput.pitch = Math.max(-1, Math.min(1, -travelView.pitch * STEER_GAIN))
  }
}

/** unit view direction in the ship frame for a (yaw, pitch) offset */
export function viewDirLocal(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
}

/**
 * After the physics step: keep the camera's WORLD view direction where the pilot aimed it while the ship turns
 * toward it (manual piloting only), so the offset shrinks to zero as the ship lines up. Under the autopilot the
 * camera simply rides with the ship.
 */
export function settleTravelView(before: THREE.Quaternion, after: THREE.Quaternion) {
  if (ship.autopilot.active || ship.cameraView === 'external') return
  const world = viewDirLocal(travelView.yaw, travelView.pitch).applyQuaternion(before)
  const local = world.applyQuaternion(after.clone().invert())
  travelView.pitch = Math.asin(Math.max(-1, Math.min(1, local.y)))
  travelView.yaw = Math.atan2(local.x, -local.z)
}

/** P (and the HUD switch): automatic ↔ manual piloting. Automatic needs a locked destination. */
export function togglePilotMode(simMs: number = useStore.getState().simMs) {
  if (ship.autopilot.active) {
    cancelAutopilot('Manual piloting — W A S D thrust, arrows aim the camera')
    return 'manual' as const
  }
  const target = ship.targetId && ship.targetId !== ship.arrivedId ? ship.targetId : null
  if (target && engageAutopilot(target, simMs)) return 'automatic' as const
  flightEvent('Choose a destination on the navigation map (M) to engage the autopilot')
  return 'manual' as const
}

/** Discrete flight actions (one per key press). Returns an uninstaller. */
export function installTravelActions(): () => void {
  const M = 'SPACECRAFT_FLIGHT' as const
  const on = (a: Action, fn: () => void) => input.on(a, fn, M)
  const offs = [
    on('back', () => {
      releaseAllTravelInput()
      useStore.getState().exitTravelMode()
    }),
    on('pilotMode', () => { togglePilotMode() }),
    on('camera', () => {
      cycleCameraView()
      travelView.yaw = 0
      travelView.pitch = 0
    }),
    on('stabilisation', () => toggleStabilization()),
    on('flightModel', () => setFlightModel(ship.flightModel === 'assisted' ? 'inertial' : 'assisted')),
    on('gear1', () => setGear(1)),
    on('gear2', () => setGear(2)),
    on('gear3', () => setGear(3)),
    on('gear4', () => setGear(4)),
    on('map', () => {
      useStore.getState().set({ navMapOpen: true })
      releaseAllTravelInput()
    }),
  ]
  return () => offs.forEach((off) => off())
}
