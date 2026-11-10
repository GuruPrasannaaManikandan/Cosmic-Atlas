import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { ship } from './shipState'
import { travelView, releaseAllTravelInput, installTravelActions } from './travelKeys'

// Keyboard state lives in the central input manager; travelKeys.ts turns it into flight input every frame.
export { travelInput, travelUi, travelView, releaseAllTravelInput, pollTravelInput, settleTravelView, togglePilotMode } from './travelKeys'

/**
 * Mouse / touch for Travel Mode. Dragging AIMS THE CAMERA, exactly like the arrow keys: it never steers the ship
 * directly and never cancels the autopilot (in manual piloting the ship then turns toward the view).
 */
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
        travelView.yaw = Math.atan2(Math.sin(travelView.yaw + dx * 0.004), Math.cos(travelView.yaw + dx * 0.004))
        travelView.pitch = Math.max(-1.2, Math.min(1.2, travelView.pitch - dy * 0.004))
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
    travelView.yaw = 0
    travelView.pitch = 0
    const uninstall = installTravelActions()
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('lostpointercapture', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      uninstall()
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
