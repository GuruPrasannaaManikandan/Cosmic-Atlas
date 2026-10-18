import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventState } from './eventState'

export function PulsarRenderer() {
  const groupRef = useRef<THREE.Group>(null)
  const magneticAxisGroupRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const beamCone1Ref = useRef<THREE.Mesh>(null)
  const beamCone2Ref = useRef<THREE.Mesh>(null)
  const torusRef = useRef<THREE.Mesh>(null)
  const rippleRef = useRef<THREE.Mesh>(null)
  const windPointsRef = useRef<THREE.Points>(null)

  // Pre-generate magnetic dipole field line points
  const fieldLines = useMemo(() => {
    const loops: THREE.Vector3[][] = []
    const numLoops = 8
    const numPointsPerLoop = 40

    for (let l = 0; l < numLoops; l++) {
      const az = (l / numLoops) * Math.PI * 2
      const maxR = 8.0 // max dipole extent
      const points: THREE.Vector3[] = []

      for (let p = 0; p <= numPointsPerLoop; p++) {
        // Parametric dipole: r = r0 * sin^2(theta)
        const theta = (p / numPointsPerLoop) * Math.PI
        if (theta <= 0.05 || theta >= Math.PI - 0.05) continue
        const r = maxR * Math.sin(theta) * Math.sin(theta)
        const x = r * Math.sin(theta) * Math.cos(az)
        const y = r * Math.cos(theta)
        const z = r * Math.sin(theta) * Math.sin(az)
        points.push(new THREE.Vector3(x, y, z))
      }
      loops.push(points)
    }
    return loops
  }, [])

  // Pulsar wind particles (magnetized particles streaming outward along equator)
  const { windPositions, windAngles } = useMemo(() => {
    const count = 600
    const pos = new Float32Array(count * 3)
    const angles = new Float32Array(count * 2) // [azimuth, speed]

    for (let i = 0; i < count; i++) {
      const az = Math.random() * Math.PI * 2
      const dist = 3.5 + Math.random() * 12.0
      const h = (Math.random() - 0.5) * 1.5
      pos[i * 3] = Math.cos(az) * dist
      pos[i * 3 + 1] = h
      pos[i * 3 + 2] = Math.sin(az) * dist
      angles[i * 2] = az
      angles[i * 2 + 1] = 1.5 + Math.random() * 3.0
    }
    return { windPositions: pos, windAngles: angles }
  }, [])

  useFrame((_, dt) => {
    const t = eventState.timeSec

    // Pulsar spin frequency (Crab rotates ~30 times/sec; visualized at ~2.5 rev/sec)
    const spinRate = 16.0
    const rot = t * spinRate

    if (groupRef.current) {
      groupRef.current.rotation.y = rot
    }

    // Core high-energy pulse
    if (coreRef.current) {
      const pulse = 1.0 + Math.sin(t * 32.0) * 0.08
      coreRef.current.scale.setScalar(0.9 * pulse)
    }

    // Beam emission cone flutter & intensity
    if (beamCone1Ref.current && beamCone2Ref.current) {
      const beamPulse = 0.8 + Math.sin(t * 40.0) * 0.2
      const mat1 = beamCone1Ref.current.material as THREE.MeshBasicMaterial
      const mat2 = beamCone2Ref.current.material as THREE.MeshBasicMaterial
      mat1.opacity = 0.7 * beamPulse
      mat2.opacity = 0.7 * beamPulse
    }

    // Equatorial wind torus expansion & pulsation
    if (torusRef.current && rippleRef.current) {
      torusRef.current.rotation.z += dt * 0.4
      const rippleScale = 1.0 + ((t * 1.5) % 3.0) * 0.7
      rippleRef.current.scale.set(rippleScale, rippleScale, rippleScale)
      const rippleMat = rippleRef.current.material as THREE.MeshBasicMaterial
      rippleMat.opacity = Math.max(0, 0.45 - (rippleScale - 1.0) * 0.2)
    }

    // Wind particles dynamic update
    if (windPointsRef.current) {
      const geo = windPointsRef.current.geometry
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
      const arr = posAttr.array as Float32Array

      for (let i = 0; i < windPositions.length / 3; i++) {
        const idx = i * 3
        const speed = windAngles[i * 2 + 1]
        let currentR = Math.sqrt(arr[idx] * arr[idx] + arr[idx + 2] * arr[idx + 2])
        currentR += dt * speed

        if (currentR > 18.0) {
          currentR = 3.2 + Math.random() * 1.5
        }

        const az = Math.atan2(arr[idx + 2], arr[idx]) + dt * 0.8
        arr[idx] = Math.cos(az) * currentR
        arr[idx + 2] = Math.sin(az) * currentR
      }
      posAttr.needsUpdate = true
    }
  })

  // Tilted magnetic dipole axis (30 degrees from spin axis)
  const dipoleTilt = 0.52

  const lineObjects = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: '#4fa3ff',
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return fieldLines.map((pts) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      return new THREE.Line(geo, mat)
    })
  }, [fieldLines])

  return (
    <group>
      {/* 1. Main Pulsar Rotating Group */}
      <group ref={groupRef}>
        {/* Neutron Star Core */}
        <mesh ref={coreRef}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color="#d4f0ff" />
        </mesh>

        {/* Tilted Magnetic Axis Group */}
        <group ref={magneticAxisGroupRef} rotation={[dipoleTilt, 0, 0]}>
          {/* North Synchrotron Radiation Beam Cone */}
          <mesh
            ref={beamCone1Ref}
            position={[0, 9.5, 0]}
            rotation={[0, 0, 0]}
          >
            <coneGeometry args={[3.2, 18, 32, 1, true]} />
            <meshBasicMaterial
              color="#00ffff"
              transparent
              opacity={0.65}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* South Synchrotron Radiation Beam Cone */}
          <mesh
            ref={beamCone2Ref}
            position={[0, -9.5, 0]}
            rotation={[Math.PI, 0, 0]}
          >
            <coneGeometry args={[3.2, 18, 32, 1, true]} />
            <meshBasicMaterial
              color="#00ffff"
              transparent
              opacity={0.65}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Magnetic Dipole Field Lines */}
          {lineObjects.map((line, idx) => (
            <primitive key={idx} object={line} />
          ))}
        </group>
      </group>

      {/* 2. Equatorial Pulsar Wind Nebula Torus */}
      <mesh ref={torusRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[7.5, 1.2, 16, 48]} />
        <meshBasicMaterial
          color="#8a2be2"
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Expanding relativistic wind ripple ring */}
      <mesh ref={rippleRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.5, 7.8, 48]} />
        <meshBasicMaterial
          color="#00d4ff"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Relativistic Wind Particle Stream */}
      <points ref={windPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[windPositions, 3]}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.6}
          color="#80e5ff"
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}
