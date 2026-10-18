import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { ship, cycleCameraView, toggleStabilization, setFlightModel, setGear, cancelAutopilot } from './shipState'
import { useStore } from '../store/store'

export const travelInput = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  thrustDelta: 0,
  reverse: false,
  boost: false,
  strafeX: 0,
  strafeY: 0,
  brake: false,
}

const activeKeys = new Set<string>()

export function handleTravelKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  const k = e.key.toLowerCase()

  // Disengage autopilot if user takes manual flight action
  if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    if (ship.autopilot.active) {
      cancelAutopilot()
    }
  }

  if (k === 'w') {
    travelInput.thrustDelta = 1
    activeKeys.add('w')
  } else if (k === 's') {
    travelInput.thrustDelta = -1
    activeKeys.add('s')
  } else if (k === 'a') {
    travelInput.yaw = -1
    activeKeys.add('a')
  } else if (k === 'd') {
    travelInput.yaw = 1
    activeKeys.add('d')
  } else if (k === 'arrowup') {
    e.preventDefault()
    travelInput.pitch = -1
    activeKeys.add('arrowup')
  } else if (k === 'arrowdown') {
    e.preventDefault()
    travelInput.pitch = 1
    activeKeys.add('arrowdown')
  } else if (k === 'arrowleft') {
    e.preventDefault()
    travelInput.roll = -1
    activeKeys.add('arrowleft')
  } else if (k === 'arrowright') {
    e.preventDefault()
    travelInput.roll = 1
    activeKeys.add('arrowright')
  } else if (k === 'q') {
    travelInput.strafeX = -1
    activeKeys.add('q')
  } else if (k === 'e') {
    travelInput.strafeX = 1
    activeKeys.add('e')
  } else if (k === ' ') {
    e.preventDefault()
    travelInput.strafeY = 1
    activeKeys.add(' ')
  } else if (k === 'c' && !e.ctrlKey) {
    travelInput.strafeY = -1
    activeKeys.add('c')
  } else if (k === 'shift') {
    travelInput.boost = true
    activeKeys.add('shift')
  } else if (k === 'b') {
    travelInput.brake = true
  } else if (k === 'x') {
    toggleStabilization()
  } else if (k === 'f') {
    setFlightModel(ship.flightModel === 'assisted' ? 'inertial' : 'assisted')
  } else if (k === 'v') {
    cycleCameraView()
  } else if (k === '1') {
    setGear(1)
  } else if (k === '2') {
    setGear(2)
  } else if (k === '3') {
    setGear(3)
  } else if (k === '4') {
    setGear(4)
  } else if (k === 'm') {
    const st = useStore.getState()
    st.set({ navMapOpen: !st.navMapOpen })
  }
}

export function handleTravelKeyUp(e: KeyboardEvent) {
  const k = e.key.toLowerCase()
  activeKeys.delete(k)

  if (k === 'w' || k === 's') {
    travelInput.thrustDelta = 0
  }
  if (k === 'a' || k === 'd') {
    travelInput.yaw = 0
  }
  if (k === 'arrowup' || k === 'arrowdown') {
    travelInput.pitch = 0
  }
  if (k === 'arrowleft' || k === 'arrowright') {
    travelInput.roll = 0
  }
  if (k === 'q' || k === 'e') {
    travelInput.strafeX = 0
  }
  if (k === ' ' || k === 'c') {
    travelInput.strafeY = 0
  }
  if (k === 'shift') {
    travelInput.boost = false
  }
  if (k === 'b') {
    travelInput.brake = false
  }
}

export function TravelControlsComponent() {
  const { gl } = useThree()

  useEffect(() => {
    const el = gl.domElement
    let isDragging = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      if (ship.cameraView === 'external') {
        // Orbit around spacecraft in external view
        ship.orbitAngle.yaw -= dx * 0.006
        ship.orbitAngle.pitch = Math.max(-1.4, Math.min(1.4, ship.orbitAngle.pitch + dy * 0.006))
      } else if (ship.cameraView === 'chase') {
        // Subtle chase camera angle offset
        ship.orbitAngle.yaw = Math.max(-0.6, Math.min(0.6, ship.orbitAngle.yaw - dx * 0.002))
        ship.orbitAngle.pitch = Math.max(-0.4, Math.min(0.4, ship.orbitAngle.pitch + dy * 0.002))
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false
      if (ship.cameraView === 'chase') {
        // Ease chase camera angle back behind ship
        ship.orbitAngle.yaw = 0
        ship.orbitAngle.pitch = 0.2
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (ship.cameraView === 'external') {
        ship.orbitAngle.dist = Math.max(8, Math.min(80, ship.orbitAngle.dist + Math.sign(e.deltaY) * 2))
      } else {
        // Wheel adjusts thrust in cockpit/chase
        ship.thrust = Math.max(0, Math.min(1, ship.thrust - Math.sign(e.deltaY) * 0.05))
      }
    }

    window.addEventListener('keydown', handleTravelKeyDown)
    window.addEventListener('keyup', handleTravelKeyUp)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleTravelKeyDown)
      window.removeEventListener('keyup', handleTravelKeyUp)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      activeKeys.clear()
    }
  }, [gl])

  return null
}
