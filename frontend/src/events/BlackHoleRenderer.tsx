import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventState } from './eventState'

export function BlackHoleRenderer() {
  const diskMeshRef = useRef<THREE.Mesh>(null)
  const lensedDiskMeshRef = useRef<THREE.Mesh>(null)
  const lensedLowerMeshRef = useRef<THREE.Mesh>(null)
  const jet1Ref = useRef<THREE.Mesh>(null)
  const jet2Ref = useRef<THREE.Mesh>(null)
  const photonRingRef = useRef<THREE.Mesh>(null)
  const knotsRef = useRef<THREE.Points>(null)

  // Accretion disk geometry with custom vertex colors for Doppler beaming
  const { diskGeo, lensedGeo } = useMemo(() => {
    // Generate rings with radial segments and azimuthal segments
    const innerR = 4.2
    const outerR = 15.0
    const radSegs = 32
    const thetaSegs = 96

    const geo = new THREE.RingGeometry(innerR, outerR, thetaSegs, radSegs)
    const pos = geo.attributes.position
    const count = pos.count
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const r = Math.sqrt(x * x + y * y)
      // Angle relative to camera plane
      const angle = Math.atan2(y, x)

      // Doppler beaming factor: cos(angle) > 0 is approaching, < 0 is receding
      const doppler = Math.cos(angle) // -1 (receding) to +1 (approaching)

      // Radial temperature gradient: inner edge is hotter, outer edge is cooler
      const tNorm = 1.0 - (r - innerR) / (outerR - innerR)

      if (doppler > 0) {
        // Approaching: Blue-shifted, amplified brilliance
        const boost = 1.0 + doppler * 1.8
        colors[i * 3] = Math.min(1.0, (0.4 + tNorm * 0.4) * boost)
        colors[i * 3 + 1] = Math.min(1.0, (0.7 + tNorm * 0.3) * boost)
        colors[i * 3 + 2] = Math.min(1.0, 1.0 * boost)
      } else {
        // Receding: Red-shifted, dimmed
        const dim = Math.max(0.2, 1.0 + doppler * 0.7)
        colors[i * 3] = (0.9 + tNorm * 0.1) * dim
        colors[i * 3 + 1] = (0.2 + tNorm * 0.3) * dim
        colors[i * 3 + 2] = 0.05 * dim
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // Gravitational lensing halo geometry (Einstein ring warped over the pole)
    const lGeo = new THREE.TorusGeometry(5.2, 0.45, 16, 64)
    return { diskGeo: geo, lensedGeo: lGeo }
  }, [])

  // Relativistic jet plasma knots
  const { knotPositions, knotVelocities } = useMemo(() => {
    const count = 120
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const sign = i % 2 === 0 ? 1 : -1
      const y = sign * (4.0 + Math.random() * 22.0)
      const r = 0.2 + (Math.abs(y) / 26.0) * 0.8
      const th = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(th) * r
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = Math.sin(th) * r
      vel[i] = 12.0 + Math.random() * 8.0 // relativistic ejection speed
    }

    return { knotPositions: pos, knotVelocities: vel }
  }, [])

  useFrame((_, dt) => {
    const t = eventState.timeSec

    // Accretion disk rotation (Keplerian)
    if (diskMeshRef.current) {
      diskMeshRef.current.rotation.z += dt * 0.65
    }

    // Photon ring subtle pulsation
    if (photonRingRef.current) {
      const p = 1.0 + Math.sin(t * 8.0) * 0.03
      photonRingRef.current.scale.set(p, p, 1.0)
    }

    // Lensed disk halos breathing
    if (lensedDiskMeshRef.current && lensedLowerMeshRef.current) {
      lensedDiskMeshRef.current.rotation.z -= dt * 0.45
      lensedLowerMeshRef.current.rotation.z += dt * 0.45
    }

    // Relativistic jet flutter
    if (jet1Ref.current && jet2Ref.current) {
      const jetPulse = 1.0 + Math.sin(t * 22.0) * 0.08
      jet1Ref.current.scale.set(jetPulse, 1.0, jetPulse)
      jet2Ref.current.scale.set(jetPulse, 1.0, jetPulse)
    }

    // Plasma knots flying outward along jet axis
    if (knotsRef.current) {
      const geo = knotsRef.current.geometry
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
      const arr = posAttr.array as Float32Array

      for (let i = 0; i < knotPositions.length / 3; i++) {
        const idx = i * 3
        const sign = arr[idx + 1] >= 0 ? 1 : -1
        arr[idx + 1] += sign * dt * knotVelocities[i]
        if (Math.abs(arr[idx + 1]) > 26.0) {
          arr[idx + 1] = sign * 4.0
        }
      }
      posAttr.needsUpdate = true
    }
  })

  return (
    <group>
      {/* 1. Pitch-Black Event Horizon Sphere (Shadow) */}
      <mesh>
        <sphereGeometry args={[3.2, 48, 48]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* 2. Photon Sphere / Einstein Orbit Ring (r = 1.5 rs) */}
      <mesh ref={photonRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.3, 3.65, 64]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Gravitational Lensing Halo (Upper Einstein Arc) */}
      <mesh
        ref={lensedDiskMeshRef}
        geometry={lensedGeo}
        position={[0, 1.8, 0]}
        rotation={[0.3, 0, 0]}
      >
        <meshBasicMaterial
          color="#8ad3ff"
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 4. Gravitational Lensing Halo (Lower Einstein Arc) */}
      <mesh
        ref={lensedLowerMeshRef}
        geometry={lensedGeo}
        position={[0, -1.8, 0]}
        rotation={[-0.3, 0, 0]}
      >
        <meshBasicMaterial
          color="#ff7f50"
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 5. Main Accretion Disk with Relativistic Doppler Beaming */}
      <mesh
        ref={diskMeshRef}
        geometry={diskGeo}
        rotation={[Math.PI / 2.35, 0, 0]}
      >
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.88}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 6. North Relativistic Polar Jet */}
      <mesh
        ref={jet1Ref}
        position={[0, 13.5, 0]}
        rotation={[0, 0, 0]}
      >
        <cylinderGeometry args={[0.15, 0.9, 22.0, 24]} />
        <meshBasicMaterial
          color="#4cc3ff"
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 7. South Relativistic Polar Jet */}
      <mesh
        ref={jet2Ref}
        position={[0, -13.5, 0]}
        rotation={[Math.PI, 0, 0]}
      >
        <cylinderGeometry args={[0.15, 0.9, 22.0, 24]} />
        <meshBasicMaterial
          color="#4cc3ff"
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 8. Relativistic Jet Shock Knots */}
      <points ref={knotsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[knotPositions, 3]}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.85}
          color="#d6f4ff"
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}
