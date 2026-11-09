import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ship } from './shipState'
import { travelEngineState, travelSettings } from './travelEngine'

/**
 * Warp streaks. They live in CAMERA space (the group copies the camera orientation every frame) so they always
 * stream along the line of flight; previously they were fixed to world axes and crossed the view sideways when
 * the camera looked anywhere but world -Z. Shown for Travel-Mode warp and, softly, during the middle of Explore
 * warp flights; never with reduced motion.
 */
export function WarpEffect() {
  const pointsRef = useRef<THREE.Points>(null)
  const { camera } = useThree()

  const count = 600
  const [geo, initialZ] = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const zArray = new Float32Array(count)

    const color1 = new THREE.Color('#38bdf8')
    const color2 = new THREE.Color('#a855f7')

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 8 + Math.random() * 45
      const z = (Math.random() - 0.5) * 160

      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius
      positions[i * 3 + 2] = z
      zArray[i] = z

      const c = Math.random() > 0.4 ? color1 : color2
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return [geometry, zArray]
  }, [])

  useFrame((_, dt) => {
    const pts = pointsRef.current
    if (!pts) return

    const shipWarp = ship.autopilot.warpActive || (ship.gear === 4 && ship.thrust > 0)
    const p = travelEngineState.progress
    const camWarp = travelEngineState.phase === 'traveling' && p > 0.12 && p < 0.88
    const isWarping = !travelSettings.reduceMotion && (shipWarp || camWarp)
    pts.visible = isWarping
    if (!isWarping) return
    pts.quaternion.copy(camera.quaternion)
    ;(pts.material as THREE.PointsMaterial).opacity = shipWarp ? 0.85 : 0.55 * Math.sin(Math.PI * (p - 0.12) / 0.76)

    const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    const warpSpeed = 350 * dt

    for (let i = 0; i < count; i++) {
      let z = arr[i * 3 + 2] + warpSpeed
      if (z > 80) z = -80
      arr[i * 3 + 2] = z
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geo} frustumCulled={false} renderOrder={99}>
      <pointsMaterial
        size={2.5}
        sizeAttenuation={false}
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
