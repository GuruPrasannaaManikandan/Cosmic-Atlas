import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { nav, interrupt } from '../store/nav'
import { useStore } from '../store/store'

const input = { yaw: 0, pitch: 0, panX: 0, panY: 0, dolly: 0 }

/** Mouse/touch/keyboard controls. Any input interrupts an active flight (free exploration always wins). */
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
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if ('wasdqe cshift arrowup arrowdown arrowleft arrowright'.split(' ').includes(k) || k === ' ') {
        if (k === ' ') e.preventDefault()
        nav.keys.add(k)
        interrupt()
        if (useStore.getState().phase === 'intro') useStore.getState().setPhase('explore')
      }
    }
    const ku = (e: KeyboardEvent) => { nav.keys.delete(e.key.toLowerCase()) }
    const blur = () => nav.keys.clear()
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', ctx)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctx)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }, [gl])
  return null
}

export const Controls = { input, Component: ControlsComponent }
