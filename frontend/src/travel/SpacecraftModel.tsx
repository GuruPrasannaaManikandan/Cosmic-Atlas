import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ship } from './shipState'

export function SpacecraftModel() {
  const shipGroup = useRef<THREE.Group>(null)
  const leftExhaust = useRef<THREE.Mesh>(null)
  const rightExhaust = useRef<THREE.Mesh>(null)
  const strobeLight = useRef<THREE.PointLight>(null)

  useFrame((state) => {
    const grp = shipGroup.current
    if (!grp) return

    // Visible in chase and external views
    grp.visible = ship.cameraView !== 'cockpit'
    if (!grp.visible) return

    // Animated exhaust plume scaling with thrust
    const t = Math.max(0.1, ship.thrust) * (ship.boost ? 2.5 : 1.0)
    const flicker = 1 + Math.sin(state.clock.elapsedTime * 45) * 0.08
    const exhaustScale = t * flicker

    if (leftExhaust.current) {
      leftExhaust.current.scale.set(0.6 * flicker, 0.6 * flicker, 2.8 * exhaustScale)
      const mat = leftExhaust.current.material as THREE.MeshBasicMaterial
      mat.color.set(ship.boost ? '#a855f7' : '#38bdf8')
    }
    if (rightExhaust.current) {
      rightExhaust.current.scale.set(0.6 * flicker, 0.6 * flicker, 2.8 * exhaustScale)
      const mat = rightExhaust.current.material as THREE.MeshBasicMaterial
      mat.color.set(ship.boost ? '#a855f7' : '#38bdf8')
    }

    // Strobe navigation light
    if (strobeLight.current) {
      const flash = Math.sin(state.clock.elapsedTime * 6) > 0.8 ? 1.5 : 0
      strobeLight.current.intensity = flash
    }
  })

  return (
    <group ref={shipGroup}>
      {/* Central Fuselage */}
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[1.1, 7.2, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Nose cone tip */}
      <mesh position={[0, 0, -3.8]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.55, 1.6, 8]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Cockpit Canopy / Viewport */}
      <mesh position={[0, 0.55, -1.2]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.75, 0.45, 1.8]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.3} metalness={0.9} roughness={0.05} transparent opacity={0.8} />
      </mesh>

      {/* Main Delta Wings */}
      <mesh position={[0, -0.1, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[6.8, 2.4, 0.12]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Wingtip Vertical Stabilizers */}
      <mesh position={[-3.35, 0.5, 0.9]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.1, 1.2, 1.6]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[3.35, 0.5, 0.9]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.1, 1.2, 1.6]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Forward Delta Canards */}
      <mesh position={[0, 0.1, -2.1]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[2.8, 0.9, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.75} roughness={0.35} />
      </mesh>

      {/* Twin Engine Nacelles */}
      <group position={[-1.1, 0, 2.4]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.65, 2.4, 16]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Engine glow ring */}
        <mesh position={[0, 0, 1.25]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, 0.52, 24]} />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} />
        </mesh>
        {/* Plasma exhaust plume */}
        <mesh ref={leftExhaust} position={[0, 0, 2.5]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.45, 1.8, 16]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      <group position={[1.1, 0, 2.4]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.65, 2.4, 16]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Engine glow ring */}
        <mesh position={[0, 0, 1.25]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, 0.52, 24]} />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} />
        </mesh>
        {/* Plasma exhaust plume */}
        <mesh ref={rightExhaust} position={[0, 0, 2.5]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.45, 1.8, 16]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      {/* Navigation Lights */}
      {/* Port wingtip (Red) */}
      <mesh position={[-3.4, 0.5, 0.4]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* Starboard wingtip (Green) */}
      <mesh position={[3.4, 0.5, 0.4]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Tail strobe (White) */}
      <pointLight ref={strobeLight} position={[0, 0.9, 3.2]} color="#ffffff" distance={15} decay={2} intensity={1} />
    </group>
  )
}
