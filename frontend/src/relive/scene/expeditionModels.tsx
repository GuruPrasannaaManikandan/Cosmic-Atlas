/**
 * CONCEPTUAL expedition vehicles (Explore). Deliberately unlike any NASA spacecraft (white and blue, simple forms) so
 * they are never mistaken for historical hardware; every view that shows them labels them conceptual.
 * Origin = base of the part, +Y up/along its axis. Each takes a getter for its live state (thrust, legs, ramp, …),
 * so the same models run inside Relive and inside the Moon surface view.
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Obj } from '../flight'
import { Plume } from './effects'

let mats: ReturnType<typeof make> | null = null
function make() {
  return {
    hull: new THREE.MeshStandardMaterial({ color: '#eef1f5', roughness: 0.45, metalness: 0.25 }),
    blue: new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.5, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.6, metalness: 0.5 }),
    engine: new THREE.MeshStandardMaterial({ color: '#3a3633', roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }),
    leg: new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.4, metalness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: '#0e2236', roughness: 0.1, metalness: 0.9, emissive: '#0a1a2a' }),
    shield: new THREE.MeshStandardMaterial({ color: '#4b3a2c', roughness: 0.85 }),
    deck: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.6, metalness: 0.4 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.9 }),
    solar: new THREE.MeshStandardMaterial({ color: '#16264a', roughness: 0.3, metalness: 0.6, emissive: '#030612' }),
  }
}
const M = () => (mats ??= make())

type Get = () => Obj | undefined

const Bell = ({ y0, y1, re, rt, m, x = 0, z = 0 }: { y0: number; y1: number; re: number; rt: number; m: THREE.Material; x?: number; z?: number }) => {
  const g = useMemo(() => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 10; i++) { const f = i / 10; pts.push(new THREE.Vector2(rt + (re - rt) * Math.pow(f, 0.6), y1 - (y1 - y0) * f)) }
    return new THREE.LatheGeometry(pts, 24)
  }, [y0, y1, re, rt])
  return <mesh geometry={g} material={m} position={[x, 0, z]} castShadow />
}

/** departure stage: a plain cylinder with one engine */
export function ExpStage({ get }: { get: Get }) {
  const m = M()
  return (
    <group>
      <mesh position={[0, 4.6, 0]} material={m.hull} castShadow><cylinderGeometry args={[1.5, 1.5, 7.2, 32]} /></mesh>
      <mesh position={[0, 8.3, 0]} material={m.blue}><cylinderGeometry args={[1.5, 1.5, 0.3, 32]} /></mesh>
      <Bell y0={-0.6} y1={1.0} re={0.9} rt={0.3} m={m.engine} />
      <Plume get={get} at={[[0, -0.6, 0]]} radius={0.9} length={24} kind="lh2" />
    </group>
  )
}

/** Moon lander (conceptual): crew cabin on an octagonal service deck, four legs, one main engine and a ramp */
export function ExpLander({ get, ramp = 0 }: { get: Get; ramp?: number }) {
  const m = M()
  const legs = useRef<THREE.Group[]>([])
  const rampRef = useRef<THREE.Group>(null!)
  useFrame(() => {
    const o = get()
    const L = o?.p?.legs ?? (o?.p?.stowed ? 0 : 1)
    legs.current.forEach((g) => { if (g) g.rotation.z = -0.9 * (1 - L) })
    if (rampRef.current) rampRef.current.rotation.x = -1.45 * (1 - (o?.p?.ramp ?? ramp))
  })
  return (
    <group>
      {/* service deck and tanks */}
      <mesh position={[0, 1.55, 0]} material={m.hull} castShadow receiveShadow><cylinderGeometry args={[1.75, 1.75, 1.1, 8]} /></mesh>
      <mesh position={[0, 2.12, 0]} material={m.blue} castShadow><cylinderGeometry args={[1.78, 1.78, 0.08, 8]} /></mesh>
      {/* crew cabin */}
      <mesh position={[0, 2.95, 0]} material={m.hull} castShadow><cylinderGeometry args={[1.05, 1.3, 1.6, 24]} /></mesh>
      <mesh position={[0, 3.85, 0]} material={m.hull} castShadow><sphereGeometry args={[1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin(i * 0.5 - 0.5) * 1.12, 3.15, Math.cos(i * 0.5 - 0.5) * 1.12]} rotation={[0, i * 0.5 - 0.5, 0]} material={m.glass}><boxGeometry args={[0.42, 0.32, 0.05]} /></mesh>
      ))}
      <mesh position={[0, 4.95, 0]} material={m.dark}><cylinderGeometry args={[0.04, 0.04, 0.5, 6]} /></mesh>
      {/* hatch on +Z, ramp below it */}
      <mesh position={[0, 2.75, 1.27]} material={m.dark}><boxGeometry args={[0.7, 1.1, 0.06]} /></mesh>
      <group ref={rampRef} position={[0, 2.05, 1.75]}>
        <mesh position={[0, 0, 1.25]} rotation={[0.02, 0, 0]} material={m.deck} castShadow receiveShadow><boxGeometry args={[0.9, 0.06, 2.5]} /></mesh>
      </group>
      {/* legs */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]}>
          <group position={[1.55, 1.3, 0]} ref={(g) => { if (g) legs.current[i] = g }}>
            <mesh position={[0.65, -0.62, 0]} rotation={[0, 0, 0.85]} material={m.leg} castShadow><cylinderGeometry args={[0.06, 0.06, 1.85, 8]} /></mesh>
            <mesh position={[1.3, -1.24, 0]} material={m.leg} castShadow><cylinderGeometry args={[0.32, 0.36, 0.08, 16]} /></mesh>
          </group>
        </group>
      ))}
      <Bell y0={0.2} y1={1.0} re={0.55} rt={0.2} m={m.engine} />
      <Plume get={get} at={[[0, 0.2, 0]]} radius={0.55} length={12} kind="hypergol" />
    </group>
  )
}

/** Mars entry capsule (conceptual): blunt heat shield + backshell */
export function ExpCapsule({ get }: { get: Get }) {
  const m = M()
  const heat = useRef<THREE.Mesh>(null!)
  useFrame(() => { if (heat.current) heat.current.visible = !get()?.p?.backOnly })
  return (
    <group>
      <mesh ref={heat} position={[0, -0.25, 0]} material={m.shield} castShadow><cylinderGeometry args={[2.2, 0.6, 0.5, 40]} /></mesh>
      <mesh position={[0, 0.85, 0]} material={m.hull} castShadow><cylinderGeometry args={[0.9, 2.2, 1.7, 40, 1, true]} /></mesh>
      <mesh position={[0, 1.8, 0]} material={m.blue} castShadow><cylinderGeometry args={[0.9, 0.9, 0.2, 32]} /></mesh>
    </group>
  )
}
export const ExpHeatshield = () => <mesh position={[0, -0.25, 0]} material={M().shield}><cylinderGeometry args={[2.2, 0.6, 0.5, 40]} /></mesh>

/** Mars landing platform (conceptual): deck on four legs, four throttled engines, a rear ramp */
export function ExpMarsLander({ get }: { get: Get }) {
  const m = M()
  const rampRef = useRef<THREE.Group>(null!)
  const legs = useRef<THREE.Group[]>([])
  useFrame(() => {
    const o = get()
    if (rampRef.current) rampRef.current.rotation.x = -1.35 * (1 - (o?.p?.ramp ?? 0)) + 0.5 * (o?.p?.ramp ?? 0)
    const L = o?.p?.legs ?? 1
    legs.current.forEach((g) => { if (g) g.scale.y = 0.35 + 0.65 * L })
  })
  const corners: [number, number][] = [[1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]
  return (
    <group>
      <mesh position={[0, 1.15, 0]} material={m.deck} castShadow receiveShadow><boxGeometry args={[3.2, 0.2, 3.2]} /></mesh>
      <mesh position={[0, 0.9, -0.9]} material={m.hull} castShadow><boxGeometry args={[2.6, 0.5, 1.2]} /></mesh>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 1.05, z]}>
          <group ref={(g) => { if (g) legs.current[i] = g }}>
            <mesh position={[0, -0.52, 0]} material={m.leg} castShadow><cylinderGeometry args={[0.06, 0.06, 1.05, 8]} /></mesh>
            <mesh position={[0, -1.04, 0]} material={m.leg}><cylinderGeometry args={[0.22, 0.25, 0.06, 12]} /></mesh>
          </group>
          <Bell y0={-0.25} y1={0.1} re={0.18} rt={0.07} m={m.engine} x={-x * 0.18} z={-z * 0.18} />
        </group>
      ))}
      <Plume get={get} at={corners.map(([x, z]) => [x * 0.82, 0.8, z * 0.82] as [number, number, number])} radius={0.2} length={7} kind="hypergol" />
      <group ref={rampRef} position={[0, 1.2, 1.6]}>
        <mesh position={[0, 0, 1.05]} material={m.deck} castShadow receiveShadow><boxGeometry args={[1.5, 0.05, 2.1]} /></mesh>
      </group>
    </group>
  )
}

/** the expedition rover (conceptual camera rover, as in the Mars view): six wheels, a body, a mast camera */
export function ExpRover({ get }: { get: Get }) {
  const m = M()
  const wheels = useRef<THREE.Mesh[]>([])
  useFrame(() => {
    const d = get()?.p?.drive ?? 0
    wheels.current.forEach((w) => { if (w) w.rotation.x = d * 22 })
  })
  const W: [number, number][] = [[0.75, 0.75], [-0.75, 0.75], [0.75, 0], [-0.75, 0], [0.75, -0.75], [-0.75, -0.75]]
  return (
    <group>
      <mesh position={[0, 0.72, 0]} material={m.hull} castShadow><boxGeometry args={[1.2, 0.36, 1.7]} /></mesh>
      <mesh position={[0, 0.92, -0.1]} material={m.solar} castShadow><boxGeometry args={[1.5, 0.04, 1.5]} /></mesh>
      <mesh position={[0.35, 1.4, 0.6]} material={m.leg}><cylinderGeometry args={[0.04, 0.05, 1.0, 8]} /></mesh>
      <mesh position={[0.35, 1.92, 0.62]} material={m.dark} castShadow><boxGeometry args={[0.32, 0.14, 0.16]} /></mesh>
      <mesh position={[0.35, 1.92, 0.71]} material={m.glass}><boxGeometry args={[0.22, 0.07, 0.02]} /></mesh>
      {W.map(([x, z], i) => (
        <mesh key={i} ref={(w) => { if (w) wheels.current[i] = w }} position={[x, 0.25, z]} rotation={[0, 0, Math.PI / 2]} material={m.tyre} castShadow>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 0.48, 0]} material={m.leg}><boxGeometry args={[1.5, 0.06, 1.6]} /></mesh>
    </group>
  )
}
