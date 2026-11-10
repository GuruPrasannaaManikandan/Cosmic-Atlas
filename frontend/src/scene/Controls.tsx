import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { nav, interrupt } from '../store/nav'
import { useStore } from '../store/store'
import { input as keyboard } from '../input/appInput'
import type { Action } from '../input/inputManager'

const input = { yaw: 0, pitch: 0, panX: 0, panY: 0, dolly: 0 }

/**
 * Mouse / touch controls for the orbital (free) view. The KEYBOARD is owned by the central input manager (mode
 * MAIN_MENU): W A S D fly, arrows turn the view, Space / C rise / sink, Shift faster. Any input interrupts an active
 * flight (free exploration always wins).
 */
function ControlsComponent() {
  const { gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const ptrs = new Map<number, { x: number; y: number; button: number }>()
    let pinch = 0
    let moved = 0
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button })
      moved = 0
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) }
      if (useStore.getState().phase === 'intro') useStore.getState().setPhase('explore')
    }
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      if (moved > 3) interrupt()
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        input.dolly += (d - pinch) * 0.05
        pinch = d
        input.panX += dx * 0.5; input.panY += dy * 0.5
      } else if (p.button === 2 || e.shiftKey && p.button === 0) {
        input.panX += dx; input.panY += dy
      } else {
        input.yaw += dx * 0.0035; input.pitch += dy * 0.0035
      }
    }
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId) }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      interrupt()
      input.dolly += -Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 + 0.4)
    }
    const ctx = (e: Event) => e.preventDefault()
    // a fresh key press (movement OR view) takes over from an automatic flight / the intro drift
    const takeOver = () => {
      interrupt()
      if (useStore.getState().phase === 'intro') useStore.getState().setPhase('explore')
    }
    const offs = (['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'ascend', 'descend'] as Action[])
      .map((a) => keyboard.on(a, takeOver, 'MAIN_MENU'))
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', ctx)
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctx)
      offs.forEach((off) => off())
    }
  }, [gl])
  return null
}

/**
 * Keyboard → orbital camera, once per frame. Arrow keys TURN the view (same sense as dragging: right = turn right,
 * up = look up) at the user's turn speed; they never move the camera. Returns the translation request for
 * stepNavigation: x right, y up, z forward (|xz| ≤ 1), plus the Shift boost.
 */
export function pollOrbitalKeys(dt: number): { x: number; y: number; z: number; boost: boolean } {
  if (keyboard.refresh() !== 'MAIN_MENU') return { x: 0, y: 0, z: 0, boost: false }
  const l = keyboard.look()
  const rate = keyboard.settings.lookSpeed * 0.6 // the orbital view turns gentler than a walking camera
  input.yaw += l.x * rate * dt
  input.pitch -= l.y * rate * dt // stepNavigation: +pitch = look down
  const m = keyboard.move()
  return { x: m.x, y: keyboard.axis('ascend', 'descend'), z: m.y, boost: keyboard.isHeld('sprint') }
}

export const Controls = { input, Component: ControlsComponent }
