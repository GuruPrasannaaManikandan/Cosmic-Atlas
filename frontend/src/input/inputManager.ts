/**
 * Central, context-aware keyboard input for Cosmic Atlas (Gameplay Controls directive, Parts 16 and 21).
 *
 * THE RULE: W A S D move the player / vehicle / spacecraft. Arrow keys turn the camera / view. Never the other way.
 *
 * One set of window listeners serves the whole app. The app supplies a resolver that returns the CURRENT mode from its
 * stores. Each mode owns its own bindings, so a key only does what the active mode says. When the mode changes, every
 * held key is released, which stops a held W from carrying into the next mode. Typing in a form field, and any open
 * dialog (mode UI_INTERACTION), never reaches gameplay. keyup is always processed, so a key can never stay stuck.
 *
 * Pure TypeScript (no React / three.js): unit-tested in Node (inputManager.test.ts). Bindings are data, so remapping
 * only means replacing the code lists (persisted per browser, see settings).
 */

export type InputMode =
  | 'MAIN_MENU' // orbital / free-navigation view
  | 'SPACECRAFT_FLIGHT'
  | 'PLANETARY_EXPLORATION'
  | 'VEHICLE_EXPLORATION'
  | 'HISTORICAL_REPLAY'
  | 'HARDWARE_INSPECTION'
  | 'UI_INTERACTION'

export type Action =
  | 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight'
  | 'lookUp' | 'lookDown' | 'lookLeft' | 'lookRight'
  | 'ascend' | 'descend' | 'rollLeft' | 'rollRight'
  | 'sprint' | 'jump' | 'interact' | 'board' | 'camera' | 'back' | 'map' | 'help' | 'catalogue'
  | 'brake' | 'pilotMode' | 'stabilisation' | 'flightModel' | 'gear1' | 'gear2' | 'gear3' | 'gear4'
  | 'playPause' | 'prevEvent' | 'nextEvent'

export interface Binding {
  action: Action
  codes: string[]
  /** text for the Controls panel */
  label: string
  /** held actions feed axes; others fire once per press */
  held?: boolean
}

const MOVE = (fwd: string, back: string, left: string, right: string): Binding[] => [
  { action: 'moveForward', codes: ['KeyW'], label: fwd, held: true },
  { action: 'moveBack', codes: ['KeyS'], label: back, held: true },
  { action: 'moveLeft', codes: ['KeyA'], label: left, held: true },
  { action: 'moveRight', codes: ['KeyD'], label: right, held: true },
]
const LOOK: Binding[] = [
  { action: 'lookUp', codes: ['ArrowUp'], label: 'Look up', held: true },
  { action: 'lookDown', codes: ['ArrowDown'], label: 'Look down', held: true },
  { action: 'lookLeft', codes: ['ArrowLeft'], label: 'Look left', held: true },
  { action: 'lookRight', codes: ['ArrowRight'], label: 'Look right', held: true },
]

/** Default bindings per mode. Only bindings listed here are implemented; the Controls panel shows exactly these. */
export const DEFAULT_BINDINGS: Record<InputMode, Binding[]> = {
  MAIN_MENU: [
    ...MOVE('Fly forward', 'Fly backward', 'Fly left', 'Fly right'),
    ...LOOK,
    { action: 'ascend', codes: ['Space'], label: 'Rise', held: true },
    { action: 'descend', codes: ['KeyC'], label: 'Sink', held: true },
    { action: 'sprint', codes: ['ShiftLeft', 'ShiftRight'], label: 'Faster while held', held: true },
  ],
  PLANETARY_EXPLORATION: [
    ...MOVE('Walk forward', 'Walk backward', 'Walk left', 'Walk right'),
    ...LOOK,
    { action: 'sprint', codes: ['ShiftLeft', 'ShiftRight'], label: 'Lope (run) while held', held: true },
    { action: 'jump', codes: ['Space'], label: 'Hop', held: true },
    { action: 'interact', codes: ['KeyE'], label: 'Inspect nearby hardware' },
    // (no 'board' binding yet: rover driving is not implemented, and the panel must only list working controls)
    { action: 'camera', codes: ['KeyC', 'KeyV'], label: 'First / third person' },
    { action: 'map', codes: ['KeyM'], label: 'Site map' },
    { action: 'catalogue', codes: ['KeyJ'], label: 'Discovery catalogue' },
    { action: 'help', codes: ['KeyH'], label: 'Controls' },
    { action: 'back', codes: ['Escape'], label: 'Pause' },
  ],
  VEHICLE_EXPLORATION: [
    ...MOVE('Drive forward', 'Brake, then reverse', 'Steer left', 'Steer right'),
    ...LOOK,
    { action: 'sprint', codes: ['ShiftLeft', 'ShiftRight'], label: 'Higher speed limit while held', held: true },
    { action: 'interact', codes: ['KeyE'], label: 'Inspect nearby hardware' },
    { action: 'map', codes: ['KeyM'], label: 'Site map' },
    { action: 'catalogue', codes: ['KeyJ'], label: 'Discovery catalogue' },
    { action: 'help', codes: ['KeyH'], label: 'Controls' },
    { action: 'back', codes: ['Escape'], label: 'Pause' },
  ],
  SPACECRAFT_FLIGHT: [
    ...MOVE('Thrust forward (manual)', 'Reverse thrust / slow down (manual)', 'Strafe left (manual)', 'Strafe right (manual)'),
    ...LOOK,
    { action: 'ascend', codes: ['Space'], label: 'Thrust up (manual)', held: true },
    { action: 'descend', codes: ['KeyZ'], label: 'Thrust down (manual)', held: true },
    { action: 'rollLeft', codes: ['KeyQ'], label: 'Roll left (manual)', held: true },
    { action: 'rollRight', codes: ['KeyE'], label: 'Roll right (manual)', held: true },
    { action: 'sprint', codes: ['ShiftLeft', 'ShiftRight'], label: 'Boost while held (manual)', held: true },
    { action: 'brake', codes: ['KeyB'], label: 'Brake (manual)', held: true },
    { action: 'pilotMode', codes: ['KeyP'], label: 'Switch automatic / manual piloting' },
    { action: 'camera', codes: ['KeyC', 'KeyV'], label: 'Change camera' },
    { action: 'stabilisation', codes: ['KeyX'], label: 'Stabilisation on / off' },
    { action: 'flightModel', codes: ['KeyF'], label: 'Assisted / inertial flight' },
    { action: 'gear1', codes: ['Digit1'], label: 'Gear 1' },
    { action: 'gear2', codes: ['Digit2'], label: 'Gear 2' },
    { action: 'gear3', codes: ['Digit3'], label: 'Gear 3' },
    { action: 'gear4', codes: ['Digit4'], label: 'Gear 4' },
    { action: 'map', codes: ['KeyM'], label: 'Navigation map' },
    { action: 'back', codes: ['Escape'], label: 'Leave Travel Mode' },
  ],
  HARDWARE_INSPECTION: [
    ...LOOK.map((b) => ({ ...b, label: b.label.replace('Look', 'Orbit view') })),
    { action: 'back', codes: ['Escape'], label: 'Close the record' },
  ],
  HISTORICAL_REPLAY: [
    ...LOOK,
    { action: 'playPause', codes: ['Space'], label: 'Play / pause' },
    { action: 'prevEvent', codes: ['BracketLeft'], label: 'Previous event' },
    { action: 'nextEvent', codes: ['BracketRight'], label: 'Next event' },
    { action: 'back', codes: ['Escape'], label: 'Return to the present' },
  ],
  // menus, maps, pause: only Esc reaches the app (to close / resume); dialogs handle everything else themselves
  UI_INTERACTION: [{ action: 'back', codes: ['Escape'], label: 'Close / resume' }],
}

export interface InputSettings {
  /** camera turn rate from the arrow keys (rad/s at full deflection) */
  lookSpeed: number
  invertY: boolean
  mouseLook: boolean
}
export const DEFAULT_SETTINGS: InputSettings = { lookSpeed: 1.8, invertY: false, mouseLook: true }

type Handler = (action: Action, e?: KeyboardEvent) => void

export interface InputManager {
  readonly mode: InputMode
  /** recompute the mode now (also done on every key event and every poll) */
  refresh(): InputMode
  isHeld(action: Action): boolean
  /** WASD as a vector, length ≤ 1 (diagonals are never faster) — x right, y forward */
  move(): { x: number; y: number }
  /** arrows as a vector in −1..1 — x right, y up (invertY applied) */
  look(): { x: number; y: number }
  /** vertical / roll axes for flight and free navigation */
  axis(pos: Action, neg: Action): number
  on(action: Action, fn: Handler, mode?: InputMode): () => void
  onModeChange(fn: (mode: InputMode, prev: InputMode) => void): () => void
  bindings(mode?: InputMode): Binding[]
  setBindings(mode: InputMode, b: Binding[]): void
  settings: InputSettings
  setSettings(p: Partial<InputSettings>): void
  releaseAll(): void
  handleKeyDown(e: KeyboardEvent): void
  handleKeyUp(e: KeyboardEvent): void
  /** for tests and the debug hook */
  heldCodes(): string[]
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable
}

export function createInputManager(resolveMode: () => InputMode, storage?: { get(k: string): string | null; set(k: string, v: string): void }): InputManager {
  let mode: InputMode = resolveMode()
  const held = new Set<string>()
  const handlers: { action: Action; fn: Handler; mode?: InputMode }[] = []
  const modeHandlers: ((m: InputMode, p: InputMode) => void)[] = []
  const bindings: Record<InputMode, Binding[]> = JSON.parse(JSON.stringify(DEFAULT_BINDINGS))
  let settings: InputSettings = { ...DEFAULT_SETTINGS }
  try {
    const s = storage?.get('cosmic-atlas.input.settings')
    if (s) settings = { ...settings, ...JSON.parse(s) }
  } catch {
    /* storage unavailable or corrupt: defaults */
  }

  const releaseAll = () => held.clear()
  const refresh = () => {
    const m = resolveMode()
    if (m !== mode) {
      const prev = mode
      mode = m
      releaseAll() // no stale input across modes
      for (const h of modeHandlers) h(m, prev)
    }
    return mode
  }
  const find = (code: string) => bindings[mode].filter((b) => b.codes.includes(code))
  const isHeld = (a: Action) => {
    const b = bindings[mode].find((x) => x.action === a)
    return !!b && b.codes.some((c) => held.has(c))
  }
  const ax = (p: Action, n: Action) => (isHeld(p) ? 1 : 0) - (isHeld(n) ? 1 : 0)

  return {
    get mode() { return mode },
    refresh,
    isHeld: (a) => { refresh(); return isHeld(a) },
    move() {
      refresh()
      const x = ax('moveRight', 'moveLeft'), y = ax('moveForward', 'moveBack')
      const l = Math.hypot(x, y)
      return l > 1 ? { x: x / l, y: y / l } : { x, y }
    },
    look() {
      refresh()
      const y = ax('lookUp', 'lookDown')
      return { x: ax('lookRight', 'lookLeft'), y: settings.invertY ? -y : y }
    },
    axis(p, n) { refresh(); return ax(p, n) },
    on(action, fn, m) {
      const h = { action, fn, mode: m }
      handlers.push(h)
      return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1) }
    },
    onModeChange(fn) {
      modeHandlers.push(fn)
      return () => { const i = modeHandlers.indexOf(fn); if (i >= 0) modeHandlers.splice(i, 1) }
    },
    bindings: (m) => bindings[m ?? mode],
    setBindings(m, b) { bindings[m] = b },
    get settings() { return settings },
    setSettings(p) {
      settings = { ...settings, ...p }
      try { storage?.set('cosmic-atlas.input.settings', JSON.stringify(settings)) } catch { /* ignore */ }
    },
    releaseAll,
    handleKeyDown(e) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const m = refresh()
      // UI_INTERACTION has only Esc bound (dialogs own the rest of the keyboard)
      const bs = find(e.code)
      if (!bs.length) return
      // gameplay keys must not scroll the page or move focus
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      for (const b of bs) {
        if (b.held) held.add(e.code)
        // a handler fires once per physical press: auto-repeat must not re-toggle the map, the camera, the pilot mode…
        if (!e.repeat) {
          for (const h of handlers) if (h.action === b.action && (!h.mode || h.mode === m)) h.fn(b.action, e)
        }
      }
    },
    handleKeyUp(e) {
      held.delete(e.code) // always, so a key can never stay held
    },
    heldCodes: () => [...held],
  }
}
