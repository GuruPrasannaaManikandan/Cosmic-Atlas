import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { ship, cancelAutopilot } from './shipState'
import { travelInput, releaseAllTravelInput, handleTravelKeyDown, handleTravelKeyUp } from './travelKeys'

// Keyboard state and handlers live in travelKeys.ts (no React / WebGL dependencies, unit-testable in Node).
export { travelInput, travelUi, recomputeAxes, releaseAllTravelInput, handleTravelKeyDown, handleTravelKeyUp } from './travelKeys'

const onBlur = () => releaseAllTravelInput()
const onVisibility = () => {
  if (document.visibilityState === 'hidden') releaseAllTravelInput()
}

export function TravelControlsComponent() {
  const { gl } = useThree()

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      try { el.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (ship.cameraView === 'external') {
        ship.orbitAngle.yaw -= dx * 0.006
        ship.orbitAngle.pitch = Math.max(-1.4, Math.min(1.4, ship.orbitAngle.pitch + dy * 0.006))
      } else {
        // cockpit & chase: mouse look steers the ship
        if (ship.autopilot.active && (dx || dy)) cancelAutopilot('Autopilot disengaged — manual override')
        travelInput.lookYaw += dx * 0.004
        travelInput.lookPitch += dy * 0.004
      }
    }
    const onPointerUp = () => { dragging = false }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = Math.sign(e.deltaY)
      if (ship.cameraView === 'external') {
        ship.orbitAngle.dist = Math.max(8, Math.min(80, ship.orbitAngle.dist + s * 2))
      } else if (ship.cameraView === 'chase') {
        ship.chaseZoom = Math.max(0.5, Math.min(4, ship.chaseZoom * (s > 0 ? 1.12 : 1 / 1.12)))
      } else if (!ship.autopilot.active) {
        ship.thrust = Math.max(0, Math.min(1, ship.thrust - s * 0.05))
      }
    }

    releaseAllTravelInput()
    window.addEventListener('keydown', handleTravelKeyDown)
    window.addEventListener('keyup', handleTravelKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('lostpointercapture', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleTravelKeyDown)
      window.removeEventListener('keyup', handleTravelKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('lostpointercapture', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      releaseAllTravelInput()
    }
  }, [gl])

  return null
}
