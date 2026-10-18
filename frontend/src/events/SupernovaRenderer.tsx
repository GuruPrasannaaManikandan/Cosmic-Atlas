import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventState } from './eventState'

export function SupernovaRenderer() {
  const groupRef = useRef<THREE.Group>(null)
  const starMeshRef = useRef<THREE.Mesh>(null)
  const shockwaveMeshRef = useRef<THREE.Mesh>(null)
  const flashMeshRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)
  const remnantMeshRef = useRef<THREE.Mesh>(null)
  const pulsarJet1Ref = useRef<THREE.Mesh>(null)
  const pulsarJet2Ref = useRef<THREE.Mesh>(null)

  // Generate 1800 ejecta particle vectors
  const { positions, velocities, colors } = useMemo(() => {
    const count = 1800
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const idx = i * 3
      // Random direction on sphere with slight equatorial clumping
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      const speed = 4.0 + Math.random() * 8.5 // expansion speed

      const vx = Math.sin(phi) * Math.cos(theta) * speed
      const vy = Math.cos(phi) * speed * 0.85 // slight asymmetry
      const vz = Math.sin(phi) * Math.sin(theta) * speed

      vel[idx] = vx
      vel[idx + 1] = vy
      vel[idx + 2] = vz

      // Initial positions inside the progenitor envelope
      const r = Math.random() * 3.5
      pos[idx] = Math.sin(phi) * Math.cos(theta) * r
      pos[idx + 1] = Math.cos(phi) * r
      pos[idx + 2] = Math.sin(phi) * Math.sin(theta) * r

      // Initial color: hot golden orange
      col[idx] = 1.0
      col[idx + 1] = 0.5 + Math.random() * 0.4
      col[idx + 2] = 0.1
    }

    return { positions: pos, velocities: vel, colors: col }
  }, [])

  // Create particle texture
  const particleTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
    grad.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)')
    grad.addColorStop(0.7, 'rgba(255, 80, 20, 0.3)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  useFrame((_, dt) => {
    const t = eventState.timeSec

    // Stage 1: Pre-collapse progenitor star (0s -> 3.5s)
    if (t < 3.5) {
      const prog = t / 3.5
      if (starMeshRef.current) {
        starMeshRef.current.visible = true
        // Convective boiling pulsation
        const pulse = 1 + Math.sin(t * 5.0) * 0.04 + Math.sin(t * 11.0) * 0.02
        starMeshRef.current.scale.setScalar(5.5 * pulse)
        const mat = starMeshRef.current.material as THREE.MeshBasicMaterial
        // Star slightly dims right before collapse as core falls in
        const dim = prog > 0.85 ? 1.0 - (prog - 0.85) * 4.0 : 1.0
        mat.color.setRGB(1.0 * dim, 0.28 * dim, 0.08 * dim)
      }
      if (shockwaveMeshRef.current) shockwaveMeshRef.current.visible = false
      if (flashMeshRef.current) flashMeshRef.current.visible = false
      if (particlesRef.current) particlesRef.current.visible = false
      if (remnantMeshRef.current) remnantMeshRef.current.visible = false
      return
    }

    // Hide progenitor star once exploded
    if (starMeshRef.current) {
      starMeshRef.current.visible = false
    }

    // Stage 2: Core Collapse & Shock Breakout (3.5s -> 7.0s)
    const explodeT = t - 3.5

    // Blinding neutrino/shock breakout flash (3.5s to 5.0s)
    if (flashMeshRef.current) {
      if (explodeT < 1.8) {
        flashMeshRef.current.visible = true
        const flashProg = explodeT / 1.8
        const flashRadius = Math.pow(flashProg, 0.4) * 35.0
        flashMeshRef.current.scale.setScalar(flashRadius)
        const mat = flashMeshRef.current.material as THREE.MeshBasicMaterial
        mat.opacity = Math.max(0, 1.0 - flashProg * 0.9)
      } else {
        flashMeshRef.current.visible = false
      }
    }

    // Expanding shockwave shell (3.5s -> 16s)
    if (shockwaveMeshRef.current) {
      shockwaveMeshRef.current.visible = true
      const shockRadius = 3.0 + explodeT * 2.8
      shockwaveMeshRef.current.scale.setScalar(shockRadius)
      shockwaveMeshRef.current.rotation.y += dt * 0.15
      shockwaveMeshRef.current.rotation.x += dt * 0.08
      const mat = shockwaveMeshRef.current.material as THREE.MeshBasicMaterial

      // Color temperature cooling: 100,000K (blue-white) -> 10,000K (white) -> 5,000K (orange) -> 3,000K (red)
      if (explodeT < 2.0) {
        mat.color.setRGB(0.85, 0.95, 1.0)
        mat.opacity = 0.85
      } else if (explodeT < 5.0) {
        const factor = (explodeT - 2.0) / 3.0
        mat.color.setRGB(1.0, 0.9 - factor * 0.35, 0.5 - factor * 0.4)
        mat.opacity = 0.75 - factor * 0.25
      } else {
        const factor = Math.min(1.0, (explodeT - 5.0) / 7.5)
        mat.color.setRGB(1.0 - factor * 0.2, 0.4 - factor * 0.25, 0.1)
        mat.opacity = Math.max(0.12, 0.5 - factor * 0.35)
      }
    }

    // Particles: Expanding radioactive ejecta cloud (3.5s -> 16s)
    if (particlesRef.current) {
      particlesRef.current.visible = true
      const geo = particlesRef.current.geometry
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
      const colAttr = geo.getAttribute('color') as THREE.BufferAttribute
      const posArr = posAttr.array as Float32Array
      const colArr = colAttr.array as Float32Array

      for (let i = 0; i < positions.length / 3; i++) {
        const idx = i * 3
        const vx = velocities[idx]
        const vy = velocities[idx + 1]
        const vz = velocities[idx + 2]

        // Radioactive 56Ni decay expansion
        const currentR = explodeT * 1.65
        posArr[idx] = positions[idx] + vx * currentR * 0.18
        posArr[idx + 1] = positions[idx + 1] + vy * currentR * 0.18
        posArr[idx + 2] = positions[idx + 2] + vz * currentR * 0.18

        // Color cooling with distance and time
        if (explodeT < 3.0) {
          colArr[idx] = 1.0
          colArr[idx + 1] = 0.9
          colArr[idx + 2] = 0.7
        } else if (explodeT < 7.0) {
          colArr[idx] = 1.0
          colArr[idx + 1] = 0.55
          colArr[idx + 2] = 0.15
        } else {
          // Late-stage filamentary cooling (oxygen/calcium/iron emission lines: cyan + crimson)
          colArr[idx] = (i % 2 === 0) ? 0.95 : 0.15
          colArr[idx + 1] = (i % 2 === 0) ? 0.25 : 0.85
          colArr[idx + 2] = (i % 2 === 0) ? 0.2 : 0.9
        }
      }
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    }

    // Stage 4: Central Remnant & Newborn Pulsar (8.5s -> 16s)
    if (remnantMeshRef.current && pulsarJet1Ref.current && pulsarJet2Ref.current) {
      if (t >= 8.5) {
        remnantMeshRef.current.visible = true
        pulsarJet1Ref.current.visible = true
        pulsarJet2Ref.current.visible = true

        const remProg = Math.min(1.0, (t - 8.5) / 3.0)
        remnantMeshRef.current.scale.setScalar(0.7 * remProg)

        // Rapid pulsar rotation
        const spin = t * 18.0
        pulsarJet1Ref.current.rotation.z = spin
        pulsarJet2Ref.current.rotation.z = spin

        // Jet pulsing
        const jetScale = (1.0 + Math.sin(t * 35.0) * 0.3) * remProg
        pulsarJet1Ref.current.scale.set(1.0, jetScale, 1.0)
        pulsarJet2Ref.current.scale.set(1.0, jetScale, 1.0)
      } else {
        remnantMeshRef.current.visible = false
        pulsarJet1Ref.current.visible = false
        pulsarJet2Ref.current.visible = false
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* 1. Progenitor Red Supergiant Star */}
      <mesh ref={starMeshRef}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color="#ff4500" />
      </mesh>

      {/* 2. Blinding Breakout Flash Sphere */}
      <mesh ref={flashMeshRef} visible={false}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={1.0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Outer Shockwave Shell */}
      <mesh ref={shockwaveMeshRef} visible={false}>
        <sphereGeometry args={[1, 36, 36]} />
        <meshBasicMaterial
          color="#ffd700"
          transparent
          opacity={0.65}
          wireframe={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 4. Radioactive Ejecta Particle Cloud */}
      <points ref={particlesRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            usage={THREE.DynamicDrawUsage}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>
        <pointsMaterial
          size={1.6}
          vertexColors
          transparent
          opacity={0.88}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          map={particleTex}
        />
      </points>

      {/* 5. Newborn Central Compact Remnant (Neutron Star / Pulsar) */}
      <mesh ref={remnantMeshRef} visible={false}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#b0e0ff" />
      </mesh>

      {/* North Relativistic Jet */}
      <mesh
        ref={pulsarJet1Ref}
        visible={false}
        position={[0, 4.5, 0]}
        rotation={[0, 0, 0]}
      >
        <cylinderGeometry args={[0.05, 0.45, 8.0, 16]} />
        <meshBasicMaterial
          color="#a0d8ef"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* South Relativistic Jet */}
      <mesh
        ref={pulsarJet2Ref}
        visible={false}
        position={[0, -4.5, 0]}
        rotation={[Math.PI, 0, 0]}
      >
        <cylinderGeometry args={[0.05, 0.45, 8.0, 16]} />
        <meshBasicMaterial
          color="#a0d8ef"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ambient glowing dust ring */}
      <mesh rotation={[Math.PI / 2.3, 0, 0]}>
        <ringGeometry args={[12, 19, 48]} />
        <meshBasicMaterial
          color="#ff6633"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
