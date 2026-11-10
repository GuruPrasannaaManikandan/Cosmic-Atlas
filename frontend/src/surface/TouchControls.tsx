import { useEffect, useRef, useState } from 'react'
import { virtualInput } from './SurfaceScene'

/** true on phones / tablets (coarse PRIMARY pointer) */
export function useTouchDevice() {
  const [touch, setTouch] = useState(false)
  useEffect(() => {
    const q = typeof matchMedia !== 'undefined' ? matchMedia('(pointer: coarse)') : null
    // primary pointer only: a Windows laptop with a touchscreen still has a mouse (pointer: fine) and keeps the keyboard UI
    const upd = () => setTouch(!!q?.matches)
    upd()
    q?.addEventListener?.('change', upd)
    return () => q?.removeEventListener?.('change', upd)
  }, [])
  return touch
}

/**
 * On-screen walk joystick for touch devices (rendered in the HUD's bottom row, left slot). Looking around is a
 * one-finger drag on the view (handled by the scene).
 */
export function TouchStick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const pid = useRef<number | null>(null)
  const R = 52
  useEffect(
    () => () => {
      virtualInput.forward = 0
      virtualInput.right = 0
    },
    [],
  )
  const move = (e: React.PointerEvent) => {
    const b = base.current!.getBoundingClientRect()
    let dx = e.clientX - (b.left + b.width / 2)
    let dy = e.clientY - (b.top + b.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > R) {
      dx = (dx / d) * R
      dy = (dy / d) * R
    }
    setKnob({ x: dx, y: dy })
    virtualInput.right = dx / R
    virtualInput.forward = -dy / R
  }
  const end = () => {
    pid.current = null
    setKnob({ x: 0, y: 0 })
    virtualInput.forward = 0
    virtualInput.right = 0
  }
  return (
    <div
      ref={base}
      className="touch-stick"
      data-testid="touch-controls"
      role="slider"
      aria-label="Walk joystick"
      aria-valuenow={Math.round(-knob.y)}
      onPointerDown={(e) => {
        e.stopPropagation()
        pid.current = e.pointerId
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => pid.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

/** Lope toggle and Hop button (HUD bottom row, right slot) */
export function TouchButtons() {
  const [run, setRun] = useState(false)
  useEffect(() => {
    virtualInput.run = run
  }, [run])
  useEffect(
    () => () => {
      virtualInput.run = false
      virtualInput.jump = false
    },
    [],
  )
  return (
    <div className="touch-buttons">
      <button className={'touch-btn' + (run ? ' on' : '')} aria-pressed={run} onClick={() => setRun((r) => !r)}>
        Lope
      </button>
      <button
        className="touch-btn"
        onPointerDown={() => (virtualInput.jump = true)}
        onPointerUp={() => (virtualInput.jump = false)}
        onPointerLeave={() => (virtualInput.jump = false)}
      >
        Hop
      </button>
    </div>
  )
}
