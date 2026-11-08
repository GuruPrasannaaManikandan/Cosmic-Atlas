import { ship, cycleCameraView, toggleStabilization, setFlightModel, setGear, cancelAutopilot, FlightInput } from './shipState'
import { useStore } from '../store/store'

/**
 * Travel Mode input.
 *
 * Control scheme (physical key positions via KeyboardEvent.code, so it works with Shift held and on any layout):
 *   W / S        throttle up / down; holding S at zero throttle thrusts backward
 *   A / D        thrust left / right            Space / C   thrust up / down
 *   ← / →        yaw left / right               ↑ / ↓       pitch up / down          Q / E   roll left / right
 *   Shift        boost (×3) while held          B           brake
 *   Mouse drag   look (cockpit & chase) / orbit the camera (external)
 *   Mouse wheel  throttle (cockpit) / camera distance (chase & external)
 *   V camera · M nav map · F flight model · X stabilisation · 1–4 gear · Esc close map / exit Travel Mode
 *
 * Axes are recomputed from the set of HELD keys on every key event, so releasing one key of an opposing pair never
 * cancels the other, and every key is released when the window loses focus (no stuck throttle after Alt-Tab).
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

/** UI state the key handler must respect (set by TravelHUD). */
export const travelUi = { helpOpen: false }

const held = new Set<string>()

const CODE_ALIASES: Record<string, string> = { ShiftLeft: 'Shift', ShiftRight: 'Shift' }
const FLIGHT_CODES = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space', 'KeyB', 'Shift',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])
/** Inputs that take the ship out of autopilot (manual override). */
const OVERRIDE_CODES = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space', 'KeyB', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

const axis = (pos: string, neg: string) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0)

/** Recompute every axis from the held-key set. Exported for unit tests. */
export function recomputeAxes() {
  travelInput.thrustDelta = axis('KeyW', 'KeyS')
  travelInput.reverse = held.has('KeyS') && !held.has('KeyW')
  travelInput.strafeX = axis('KeyD', 'KeyA')
  travelInput.strafeY = axis('Space', 'KeyC')
  travelInput.yaw = axis('ArrowRight', 'ArrowLeft')
  travelInput.pitch = axis('ArrowDown', 'ArrowUp') // physics: +1 = nose down (same sense as dragging the mouse down)
  travelInput.roll = axis('KeyE', 'KeyQ')
  travelInput.boost = held.has('Shift')
  travelInput.brake = held.has('KeyB')
}

/** Release everything (focus loss, tab hidden, leaving Travel Mode). */
export function releaseAllTravelInput() {
  held.clear()
  travelInput.lookYaw = 0
  travelInput.lookPitch = 0
  recomputeAxes()
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

const codeOf = (e: KeyboardEvent) => CODE_ALIASES[e.code] ?? e.code

export function handleTravelKeyDown(e: KeyboardEvent) {
  if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
  const st = useStore.getState()
  const code = codeOf(e)

  if (code === 'Escape') {
    if (travelUi.helpOpen) return // the help dialog closes itself
    if (st.navMapOpen) return // the nav map closes itself
    e.preventDefault()
    releaseAllTravelInput()
    st.exitTravelMode()
    return
  }
  if (st.navMapOpen || travelUi.helpOpen) return // dialogs own the keyboard

  if (FLIGHT_CODES.has(code)) {
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault()
    if (OVERRIDE_CODES.has(code) && ship.autopilot.active) cancelAutopilot('Autopilot disengaged — manual override')
    held.add(code)
    recomputeAxes()
    return
  }
  if (e.repeat) return
  switch (code) {
    case 'KeyX': toggleStabilization(); break
    case 'KeyF': setFlightModel(ship.flightModel === 'assisted' ? 'inertial' : 'assisted'); break
    case 'KeyV': cycleCameraView(); break
    case 'Digit1': setGear(1); break
    case 'Digit2': setGear(2); break
    case 'Digit3': setGear(3); break
    case 'Digit4': setGear(4); break
    case 'KeyM': st.set({ navMapOpen: true }); releaseAllTravelInput(); break
  }
}

export function handleTravelKeyUp(e: KeyboardEvent) {
  // always processed, even inside inputs, so a key can never stay "held"
  const code = codeOf(e)
  if (code === 'Shift') {
    held.delete('Shift')
  } else {
    held.delete(code)
  }
  recomputeAxes()
}

