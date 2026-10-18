import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { eventState, setEventCameraAngle } from './eventState'

export function EventControls() {
  const { gl } = useThree()
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const lastPinchDist = useRef<number | null>(null)

  useEffect(() => {
    const el = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return
      isDragging.current = true
      lastPos.current = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }

      const { yaw, pitch, dist } = eventState.cameraAngle
      const newYaw = yaw + dx * 0.006
      const newPitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, pitch - dy * 0.006))
      setEventCameraAngle(newYaw, newPitch, dist)
    }

    const onPointerUp = (e: PointerEvent) => {
      isDragging.current = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {}
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { yaw, pitch, dist } = eventState.cameraAngle
      const factor = 1 + Math.sign(e.deltaY) * 0.08
      const newDist = Math.max(5.0, Math.min(180.0, dist * factor))
      setEventCameraAngle(yaw, pitch, newDist)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const pinchDist = Math.sqrt(dx * dx + dy * dy)
        if (lastPinchDist.current !== null) {
          const delta = lastPinchDist.current - pinchDist
          const { yaw, pitch, dist } = eventState.cameraAngle
          const newDist = Math.max(5.0, Math.min(180.0, dist * (1 + delta * 0.005)))
          setEventCameraAngle(yaw, pitch, newDist)
        }
        lastPinchDist.current = pinchDist
      }
    }

    const onTouchEnd = () => {
      lastPinchDist.current = null
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl])

  return null
}
