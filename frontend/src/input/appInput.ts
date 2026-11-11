/**
 * The app's single input manager instance: the mode comes from the app's own state, so whatever is on screen owns
 * the keyboard. Installed once (App.tsx). See inputManager.ts for the rules.
 */
import { createInputManager, type InputMode } from './inputManager'
import { useStore } from '../store/store'
import { useSurface } from '../surface/surfaceState'
import { travelUi } from '../travel/travelUi'
import { useExpedition } from '../expedition/expedition'
import { useRelive } from '../relive/player'

/** any open modal dialog (About, Help, Spacecraft Archive, site picker, nav map, …) owns the keyboard */
function modalOpen(): boolean {
  if (typeof document === 'undefined') return false
  return !!document.querySelector('[aria-modal="true"]')
}

export function resolveMode(): InputMode {
  const st = useStore.getState()
  // Relive Mission owns the keyboard (its own capture handler drives the player)
  if (useRelive.getState().id) return 'UI_INTERACTION'
  if (st.surfaceSiteId) {
    const S = useSurface.getState()
    if (S.paused || S.mapOpen || S.helpOpen || S.intro) return 'UI_INTERACTION'
    if (S.replay) return 'HISTORICAL_REPLAY'
    if (S.panel) return 'HARDWARE_INSPECTION'
    if (S.driving) return 'VEHICLE_EXPLORATION'
    return 'PLANETARY_EXPLORATION'
  }
  if (modalOpen()) return 'UI_INTERACTION'
  // an expedition flight is automatic: no movement or look keys reach the camera until it lands (Esc skips)
  if (useExpedition.getState().stage !== 'idle') return 'UI_INTERACTION'
  if (st.phase === 'travel') return st.navMapOpen || travelUi.helpOpen ? 'UI_INTERACTION' : 'SPACECRAFT_FLIGHT'
  return 'MAIN_MENU'
}

const storage = {
  get: (k: string) => { try { return window.localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v) } catch { /* private mode */ } },
}

export const input = createInputManager(resolveMode, typeof window === 'undefined' ? undefined : storage)

let installed = 0
/** attach the window listeners once; returns an uninstaller */
export function installInput(): () => void {
  installed++
  if (installed > 1) return () => { installed-- }
  const kd = (e: KeyboardEvent) => input.handleKeyDown(e)
  const ku = (e: KeyboardEvent) => input.handleKeyUp(e)
  const release = () => input.releaseAll()
  const vis = () => { if (document.visibilityState === 'hidden') input.releaseAll() }
  window.addEventListener('keydown', kd)
  window.addEventListener('keyup', ku)
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', vis)
  ;(window as unknown as { __input?: unknown }).__input = {
    mode: () => input.refresh(),
    held: () => input.heldCodes(),
    move: () => input.move(),
    look: () => input.look(),
    settings: () => input.settings,
  }
  return () => {
    installed--
    if (installed > 0) return
    window.removeEventListener('keydown', kd)
    window.removeEventListener('keyup', ku)
    window.removeEventListener('blur', release)
    document.removeEventListener('visibilitychange', vis)
  }
}
