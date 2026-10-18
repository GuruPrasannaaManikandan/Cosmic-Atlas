import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventState } from './eventState'

export function NebulaRenderer() {
  const groupRef = useRef<THREE.Group>(null)
  const cloudsRef = useRef<THREE.Points>(null)
  const jet1Ref = useRef<THREE.Mesh>(null)
  const jet2Ref = useRef<THREE.Mesh>(null)
  const protostar1Ref = useRef<THREE.Mesh>(null)
  const protostar2Ref = useRef<THREE.Mesh>(null)

  // Generate 1200 nebula gas cloud particles
  const { positions, colors, sizes } = useMemo(() => {
    const count = 1200
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const sz = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const idx = i * 3

      // Shape into 3 towering vertical pillar structures with surrounding diffuse gas
      const pillarChoice = i % 4
      let x = 0, y = 0, z = 0

      if (pillarChoice === 0) {
        // Main Central Pillar
        const h = Math.random() * 16.0 - 8.0
        const taper = 1.0 - (h + 8.0) / 20.0
        const r = (Math.random() * 2.8 + 0.4) * taper
        const th = Math.random() * Math.PI * 2
        x = Math.cos(th) * r
        y = h
        z = Math.sin(th) * r
      } else if (pillarChoice === 1) {
        // Secondary East Pillar
        const h = Math.random() * 12.0 - 6.0
        const taper = 1.0 - (h + 6.0) / 16.0
        const r = (Math.random() * 2.2 + 0.3) * taper
        const th = Math.random() * Math.PI * 2
        x = 5.5 + Math.cos(th) * r
        y = h - 2.0
        z = 1.5 + Math.sin(th) * r
      } else if (pillarChoice === 2) {
        // West Pillar
        const h = Math.random() * 10.0 - 5.0
        const taper = 1.0 - (h + 5.0) / 14.0
        const r = (Math.random() * 2.0 + 0.3) * taper
        const th = Math.random() * Math.PI * 2
        x = -6.0 + Math.cos(th) * r
        y = h - 3.0
        z = -2.0 + Math.sin(th) * r
      } else {
        // Ambient Diffuse Ionization Cavity
        const th = Math.random() * Math.PI * 2
        const r = 4.0 + Math.random() * 18.0
        x = Math.cos(th) * r
        y = (Math.random() - 0.5) * 14.0
        z = Math.sin(th) * r
      }

      pos[idx] = x
      pos[idx + 1] = y
      pos[idx + 2] = z

      // Multi-wavelength emission color:
      // Crimson H-alpha (656 nm), Teal [O III] (501 nm), and Amber [S II] (672 nm)
      const colorType = i % 3
      if (colorType === 0) {
        // H-alpha: Glowing Deep Crimson
        col[idx] = 1.0
        col[idx + 1] = 0.15 + Math.random() * 0.15
        col[idx + 2] = 0.3 + Math.random() * 0.2
      } else if (colorType === 1) {
        // [O III]: Ionized Teal / Cyan
        col[idx] = 0.05
        col[idx + 1] = 0.85 + Math.random() * 0.15
        col[idx + 2] = 0.75 + Math.random() * 0.2
      } else {
        // [S II]: Warm Amber / Gold
        col[idx] = 0.95
        col[idx + 1] = 0.55 + Math.random() * 0.2
        col[idx + 2] = 0.1
      }

      sz[i] = 1.8 + Math.random() * 3.5
    }

    return { positions: pos, colors: col, sizes: sz }
  }, [])

  // Create smooth puff texture
  const cloudTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    grad.addColorStop(0.35, 'rgba(255, 220, 200, 0.6)')
    grad.addColorStop(0.7, 'rgba(200, 100, 150, 0.2)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  useFrame((_, dt) => {
    const t = eventState.timeSec

    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.03
    }

    // Protostellar accretion pulsation
    if (protostar1Ref.current && protostar2Ref.current) {
      const p1 = 1.0 + Math.sin(t * 6.0) * 0.18
      const p2 = 1.0 + Math.sin(t * 8.5 + 1.2) * 0.15
      protostar1Ref.current.scale.setScalar(0.7 * p1)
      protostar2Ref.current.scale.setScalar(0.55 * p2)
    }

    // Herbig-Haro jet pulsation and outflow
    if (jet1Ref.current && jet2Ref.current) {
      const jPulse = 1.0 + Math.sin(t * 14.0) * 0.15
      jet1Ref.current.scale.set(jPulse, 1.0 + Math.sin(t * 4.0) * 0.2, jPulse)
      jet2Ref.current.scale.set(jPulse, 1.0 + Math.sin(t * 4.0 + 1.5) * 0.2, jPulse)
    }
  })

  return (
    <group ref={groupRef}>
      {/* 1. Volumetric Ionized Gas Cloud Particles */}
      <points ref={cloudsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={2.8}
          vertexColors
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          map={cloudTex}
        />
      </points>

      {/* 2. Embedded Protostar 1 at Central Pillar Tip */}
      <mesh ref={protostar1Ref} position={[0, 8.2, 0]}>
        <sphereGeometry args={[0.7, 32, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Herbig-Haro 666 Bipolar Jet (Tip of Central Pillar) */}
      <mesh
        ref={jet1Ref}
        position={[0, 13.5, 0]}
        rotation={[0.15, 0, 0.1]}
      >
        <cylinderGeometry args={[0.08, 0.45, 11.0, 16]} />
        <meshBasicMaterial
          color="#ff3366"
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Embedded Protostar 2 at Secondary Pillar Tip */}
      <mesh ref={protostar2Ref} position={[5.5, 4.2, 1.5]}>
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshBasicMaterial color="#ffea75" />
      </mesh>

      {/* Secondary Bipolar Outflow */}
      <mesh
        ref={jet2Ref}
        position={[5.5, 8.5, 1.5]}
        rotation={[-0.2, 0, 0.25]}
      >
        <cylinderGeometry args={[0.06, 0.35, 8.5, 16]} />
        <meshBasicMaterial
          color="#00e5c0"
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ionizing Massive O-Star Cluster (Illuminating the cavity) */}
      <mesh position={[-14, 10, -8]}>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial color="#70d6ff" />
      </mesh>
    </group>
  )
}
