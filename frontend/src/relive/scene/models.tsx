/**
 * Relive Mission hardware. Origin = the base of the part, +Y along its long axis (see flight.ts `Obj`).
 *
 * Saturn V / CSM / LES lengths and diameters: SP-4029 key facts. Engine counts: SP-4029 (5 F-1, 5 J-2, 1 J-2).
 * Delta II: only the 2.9 m fairing and the 1168 mm strap-on motors are sourced (JPL); nine motors, three air-lit with
 * extended nozzles. MER: cruise stage 2.65 m × 1.6 m with the aeroshell, white backshell, brownish heat shield, three
 * RAD and three TIRS rockets, triple bridle, 48 suspension lines, four airbags of six lobes, a base and three petals
 * (JPL). Every other dimension is an illustrative proportion. The LM and the rover are the NASA 3D Resources models.
 */
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { MAT } from '../../surface/models/materials'
import { DRACO_PATH, NasaModel } from '../../surface/models/NasaModel'
import { Astronaut } from '../../surface/models/Astronaut'
import { EasepStation, Retroreflector } from '../../surface/models/Hardware'
import { SAT, DELTA, type ModelKind, type Obj } from '../flight'
import { live } from './live'
import { Plume } from './effects'
import { ExpCapsule, ExpHeatshield, ExpLander, ExpMarsLander, ExpRover, ExpStage } from './expeditionModels'

const FT = 0.3048
const R5 = (33 * FT) / 2
const R_IVB = (21.667 * FT) / 2
const R_SM = (12.833 * FT) / 2

let mats: ReturnType<typeof makeMats> | null = null
function makeMats() {
  return {
    white: new THREE.MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.55, metalness: 0.05 }),
    black: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6 }),
    grey: new THREE.MeshStandardMaterial({ color: '#8d9094', roughness: 0.5, metalness: 0.4 }),
    engine: new THREE.MeshStandardMaterial({ color: '#2e2b29', roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
    bellHot: new THREE.MeshStandardMaterial({ color: '#4a3a32', roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide, emissive: '#000' }),
    sm: new THREE.MeshStandardMaterial({ color: '#d9dadc', roughness: 0.32, metalness: 0.75 }),
    cm: new THREE.MeshStandardMaterial({ color: '#e4e5e8', roughness: 0.2, metalness: 0.9 }),
    cmBurnt: new THREE.MeshStandardMaterial({ color: '#5b4633', roughness: 0.8, metalness: 0.2 }),
    les: new THREE.MeshStandardMaterial({ color: '#c6c8cb', roughness: 0.45, metalness: 0.5 }),
    truss: new THREE.MeshStandardMaterial({ color: '#7c7f84', roughness: 0.5, metalness: 0.6 }),
    canopyO: new THREE.MeshStandardMaterial({ color: '#f07a2e', roughness: 0.9, side: THREE.DoubleSide }),
    canopyW: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9, side: THREE.DoubleSide }),
    collar: new THREE.MeshStandardMaterial({ color: '#e3893a', roughness: 0.8 }),
    flag: new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.8, side: THREE.DoubleSide }),
    pole: new THREE.MeshStandardMaterial({ color: '#c9c9c9', roughness: 0.4, metalness: 0.8 }),
    backshell: new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.6, side: THREE.DoubleSide }),
    heatshield: new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.9 }),
    solar: MAT.solarCell(),
    alu: MAT.aluminium(),
    gold: MAT.gold(),
    petal: new THREE.MeshStandardMaterial({ color: '#c8c1b2', roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
    airbag: new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.95 }),
    line: new THREE.LineBasicMaterial({ color: '#d8d2c6', transparent: true, opacity: 0.55 }),
  }
}
export const M = () => (mats ??= makeMats())

// ─────────────────────────────────────────────────────────── geometry helpers
const Cyl = ({ r0, r1 = r0, y0, y1, m, seg = 40, open = false, theta = [0, Math.PI * 2] as [number, number] }: { r0: number; r1?: number; y0: number; y1: number; m: THREE.Material; seg?: number; open?: boolean; theta?: [number, number] }) => (
  <mesh position={[0, (y0 + y1) / 2, 0]} material={m} castShadow receiveShadow>
    <cylinderGeometry args={[r1, r0, y1 - y0, seg, 1, open, theta[0], theta[1]]} />
  </mesh>
)
/** engine bell: throat at y1 (top), exit at y0 */
const Bell = ({ x = 0, z = 0, y0, y1, re, rt, m }: { x?: number; z?: number; y0: number; y1: number; re: number; rt: number; m: THREE.Material }) => {
  const g = useMemo(() => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 12; i++) {
      const f = i / 12
      pts.push(new THREE.Vector2(rt + (re - rt) * Math.pow(f, 0.6), y1 - (y1 - y0) * f))
    }
    return new THREE.LatheGeometry(pts, 28)
  }, [y0, y1, re, rt])
  return <mesh geometry={g} material={m} position={[x, 0, z]} castShadow />
}

/** a getter for the live state of object `key` (read every frame by plumes) */
const useObj = (key: string) => (): Obj | undefined => live.objs.get(key)

// ─────────────────────────────────────────────────────────── Saturn V
const OUTER4 = [0, 1, 2, 3].map((i) => [Math.cos(Math.PI / 4 + (i * Math.PI) / 2), Math.sin(Math.PI / 4 + (i * Math.PI) / 2)] as [number, number])

function SIC({ k }: { k: string }) {
  const m = M()
  const L = SAT.sic
  const get = useObj(k)
  return (
    <group>
      <Cyl r0={R5} y0={5.8} y1={L} m={m.white} />
      {/* roll-pattern style markings: simplified */}
      {[0, 1, 2, 3].map((i) => <Cyl key={i} r0={R5 + 0.02} y0={7} y1={17} m={m.black} theta={[(i * Math.PI) / 2, Math.PI / 4]} />)}
      <Cyl r0={R5 + 0.02} y0={L - 9} y1={L - 7.2} m={m.black} />
      <Cyl r0={R5 * 0.98} r1={R5} y0={4.6} y1={5.8} m={m.grey} />
      <Bell y0={0} y1={4.8} re={1.75} rt={0.55} m={m.engine} />
      {OUTER4.map(([x, z], i) => <Bell key={i} x={x * 3.1} z={z * 3.1} y0={0} y1={4.8} re={1.75} rt={0.55} m={m.engine} />)}
      <Plume get={get} at={[[0, 0, 0], ...OUTER4.map(([x, z]) => [x * 3.1, 0, z * 3.1] as [number, number, number])]} radius={1.75} length={60} kind="rp1" centreIdx={0} />
    </group>
  )
}
function SII({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  return (
    <group>
      <Cyl r0={R5} y0={3.4} y1={SAT.sii} m={m.white} />
      <Cyl r0={R5 + 0.01} y0={SAT.sii - 1.2} y1={SAT.sii - 0.6} m={m.black} />
      <Bell y0={0} y1={3.4} re={1.0} rt={0.3} m={m.engine} />
      {OUTER4.map(([x, z], i) => <Bell key={i} x={x * 2.6} z={z * 2.6} y0={0} y1={3.4} re={1.0} rt={0.3} m={m.engine} />)}
      <Plume get={get} at={[[0, 0, 0], ...OUTER4.map(([x, z]) => [x * 2.6, 0, z * 2.6] as [number, number, number])]} radius={1.0} length={40} kind="lh2" centreIdx={0} />
    </group>
  )
}
const Interstage = () => <Cyl r0={R5 + 0.06} y0={0} y1={SAT.interstage} m={M().white} open />
function SIVB({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  const top = SAT.sivb
  return (
    <group>
      <Cyl r0={R5} r1={R_IVB} y0={0.6} y1={5.4} m={m.white} open />
      <Cyl r0={R_IVB} y0={5.4} y1={top} m={m.white} />
      <Cyl r0={R_IVB + 0.01} y0={top - 3.2} y1={top - 2.4} m={m.black} />
      <Cyl r0={R_IVB} y0={top} y1={top + SAT.iu} m={m.grey} />
      {/* fixed lower part of the spacecraft/LM adapter (6.791 ft, SP-4029) */}
      <Cyl r0={R_IVB} r1={R_IVB - ((R_IVB - R_SM) * 6.791) / 28} y0={top + SAT.iu} y1={top + SAT.iu + 6.791 * FT} m={m.white} open />
      <Bell y0={-0.6} y1={2.8} re={1.0} rt={0.3} m={m.engine} />
      <Plume get={get} at={[[0, -0.6, 0]]} radius={1.0} length={45} kind="lh2" />
    </group>
  )
}
function SlaUpper({ k }: { k: string }) {
  const m = M()
  const o = live.objs.get(k)
  const r0 = R_IVB - ((R_IVB - R_SM) * 6.791) / 28
  const panel = !!o?.p?.panel
  return <Cyl r0={r0} r1={R_SM} y0={0} y1={SAT.slaUpper} m={m.white} open theta={panel ? [Math.PI / 4, Math.PI / 2] : [0, Math.PI * 2]} />
}
function SM({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  return (
    <group>
      <Cyl r0={R_SM} y0={0} y1={SAT.smStruct} m={m.sm} />
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos(i * Math.PI / 2) * (R_SM + 0.01), SAT.smStruct * 0.55, Math.sin(i * Math.PI / 2) * (R_SM + 0.01)]} rotation={[0, -i * Math.PI / 2, 0]} material={m.grey}><boxGeometry args={[0.02, 1.6, 0.9]} /></mesh>)}
      <Bell y0={-SAT.smBell} y1={0} re={1.25} rt={0.38} m={m.engine} />
      <Plume get={get} at={[[0, -SAT.smBell, 0]]} radius={1.2} length={22} kind="hypergol" />
    </group>
  )
}
function CM({ k }: { k: string }) {
  const m = M()
  const o = live.objs.get(k)
  const ref = useRef<THREE.Group>(null!)
  const burnt = useRef<THREE.Mesh>(null!)
  const collar = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const ob = live.objs.get(k)
    if (burnt.current) burnt.current.visible = !!ob?.p?.scorched
    if (collar.current) collar.current.visible = !!ob?.p?.collar
  })
  return (
    <group ref={ref}>
      <Cyl r0={R_SM} r1={0.42} y0={0.25} y1={SAT.cm - 0.25} m={o?.p?.scorched ? m.cmBurnt : m.cm} />
      <Cyl r0={0.42} y0={SAT.cm - 0.25} y1={SAT.cm} m={m.grey} />
      <mesh position={[0, 0.25, 0]} scale={[1, 0.13, 1]} material={m.heatshield}><sphereGeometry args={[R_SM, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
      <mesh ref={burnt} position={[0, SAT.cm / 2, 0]} visible={false} material={m.cmBurnt}><cylinderGeometry args={[0.44, R_SM + 0.01, SAT.cm - 0.5, 32, 1, true]} /></mesh>
      <mesh ref={collar} position={[0, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false} material={m.collar}><torusGeometry args={[R_SM + 0.35, 0.35, 10, 32]} /></mesh>
    </group>
  )
}
function LES({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  const towerH = 4.4
  return (
    <group>
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4
        const x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62
        return <mesh key={i} position={[x * 0.75, towerH / 2, z * 0.75]} rotation={[z * 0.12, 0, -x * 0.12]} material={m.truss}><cylinderGeometry args={[0.05, 0.05, towerH, 6]} /></mesh>
      })}
      <Cyl r0={SAT.lesDia / 2} y0={towerH} y1={SAT.les - 1.6} m={m.les} />
      <Cyl r0={SAT.lesDia / 2} r1={0.08} y0={SAT.les - 1.6} y1={SAT.les} m={m.les} />
      <Plume get={get} at={[[0.45, towerH + 0.3, 0], [-0.45, towerH + 0.3, 0]]} radius={0.3} length={8} kind="solid" />
    </group>
  )
}

// ─────────────────────────────────────────────────────────── Lunar Module (NASA 3D Resources), split at the deck
function useLmParts() {
  const gltf = useGLTF('/assets/models/nasa/apollo-lm.glb', DRACO_PATH) as unknown as { scene: THREE.Object3D }
  return useMemo(() => {
    const mk = (keep: 'all' | 'descent' | 'ascent') => {
      const root = gltf.scene.clone(true)
      root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(root)
      const c = box.getCenter(new THREE.Vector3())
      const drop: THREE.Object3D[] = []
      root.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return
        ;(o as THREE.Mesh).castShadow = true
        ;(o as THREE.Mesh).receiveShadow = true
        if (keep === 'all') return
        const b = new THREE.Box3().setFromObject(o)
        const ascentMesh = b.min.y - box.min.y > 2.33 || b.max.y - box.min.y > 3.0 // the same split the surface view uses
        if ((keep === 'descent' && ascentMesh) || (keep === 'ascent' && !ascentMesh)) drop.push(o)
      })
      drop.forEach((o) => o.parent?.remove(o))
      const g = new THREE.Group()
      root.position.set(-c.x, -box.min.y, -c.z)
      g.add(root)
      return g
    }
    return { all: mk('all'), descent: mk('descent'), ascent: mk('ascent') }
  }, [gltf.scene])
}
function LM({ k, part }: { k: string; part: 'all' | 'descent' | 'ascent' }) {
  const p = useLmParts()
  const get = useObj(k)
  const obj = part === 'all' ? p.all : part === 'descent' ? p.descent : p.ascent
  const clone = useMemo(() => obj.clone(true), [obj])
  return (
    <group>
      <primitive object={clone} />
      {part !== 'descent' && <Plume get={get} at={[part === 'ascent' ? [0, 2.3, 0] : [0, 0.45, 0]]} radius={part === 'ascent' ? 0.45 : 0.9} length={part === 'ascent' ? 10 : 14} kind="hypergol" />}
    </group>
  )
}

// ─────────────────────────────────────────────────────────── surface items
function Flag() {
  const m = M()
  return (
    <group>
      <mesh position={[0, 1.2, 0]} material={m.pole}><cylinderGeometry args={[0.02, 0.02, 2.4, 8]} /></mesh>
      <mesh position={[0.5, 1.95, 0]} material={m.flag}><planeGeometry args={[1.0, 0.62]} /></mesh>
    </group>
  )
}
function Walker({ k }: { k: string }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => {
    const o = live.objs.get(k)
    if (!ref.current || !o) return
    ref.current.position.y = Math.abs(Math.sin((o.p?.walk ?? 0) * 0.08)) * 0.25 // a low-gravity lope (illustrative)
  })
  return <group ref={ref}><Astronaut /></group>
}
function Canopies({ k, n, r, h }: { k: string; n: number; r: number; h: number }) {
  const m = M()
  const ref = useRef<THREE.Group>(null!)
  const lines = useMemo(() => {
    const pts: number[] = []
    for (let c = 0; c < n; c++) {
      const a = n === 1 ? 0 : (c / n) * Math.PI * 2
      const cx = n === 1 ? 0 : Math.cos(a) * r * 0.9, cz = n === 1 ? 0 : Math.sin(a) * r * 0.9
      for (let i = 0; i < 12; i++) {
        const b = (i / 12) * Math.PI * 2
        pts.push(0, 0, 0, cx + Math.cos(b) * r, h, cz + Math.sin(b) * r)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [n, r, h])
  useFrame(() => {
    const o = live.objs.get(k)
    if (!ref.current || !o) return
    const open = o.p?.open ?? 1, col = o.p?.collapse ?? 0
    ref.current.scale.set(0.15 + 0.85 * open * (1 - col * 0.8), open * (1 - col * 0.9) + 0.05, 0.15 + 0.85 * open * (1 - col * 0.8))
  })
  return (
    <group ref={ref}>
      {Array.from({ length: n }, (_, c) => {
        const a = n === 1 ? 0 : (c / n) * Math.PI * 2
        return (
          <mesh key={c} position={[n === 1 ? 0 : Math.cos(a) * r * 0.9, h, n === 1 ? 0 : Math.sin(a) * r * 0.9]} material={c % 2 ? m.canopyW : m.canopyO} castShadow>
            <sphereGeometry args={[r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
          </mesh>
        )
      })}
      <lineSegments geometry={lines} material={m.line} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────── Delta II 7925H
function DeltaCore({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  return (
    <group>
      <Cyl r0={DELTA.core / 2} y0={2.8} y1={DELTA.coreLen} m={m.white} />
      <Cyl r0={DELTA.core / 2 + 0.01} y0={DELTA.coreLen * 0.55} y1={DELTA.coreLen * 0.6} m={m.grey} />
      <Bell y0={0} y1={2.8} re={0.85} rt={0.3} m={m.engine} />
      <Plume get={get} at={[[0, 0, 0]]} radius={0.85} length={40} kind="rp1" />
    </group>
  )
}
function Gem({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  const o = live.objs.get(k)
  const air = !!o?.p?.air
  const r = DELTA.gemDia / 2
  return (
    <group>
      <Cyl r0={r} y0={2} y1={DELTA.gemLen} m={m.white} seg={20} />
      <Cyl r0={r} r1={0.05} y0={DELTA.gemLen} y1={DELTA.gemLen + 1.6} m={m.white} seg={20} />
      <Bell y0={air ? -0.9 : 0.6} y1={2} re={air ? 0.55 : 0.42} rt={0.2} m={m.engine} />
      <Plume get={get} at={[[0, air ? -0.9 : 0.6, 0]]} radius={0.5} length={26} kind="solid" />
    </group>
  )
}
function DeltaStage2({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  return (
    <group>
      <Cyl r0={DELTA.core / 2} y0={0.6} y1={DELTA.s2Len} m={m.grey} />
      <Bell y0={-0.9} y1={0.6} re={0.55} rt={0.18} m={m.engine} />
      <Plume get={get} at={[[0, -0.9, 0]]} radius={0.5} length={14} kind="hypergol" />
    </group>
  )
}
function Star48({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  const ref = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    const o = live.objs.get(k)
    if (ref.current && o) ref.current.rotation.y += ((o.p?.spin ?? 0) * Math.PI * 2 / 60) * dt * Math.min(1, live.rate / 60 + 0.02)
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 1.0, 0]} material={m.black} castShadow><sphereGeometry args={[0.62, 24, 16]} /></mesh>
      <Bell y0={0} y1={0.5} re={0.38} rt={0.12} m={m.engine} />
      <Cyl r0={0.5} r1={0.35} y0={1.55} y1={2.0} m={m.alu} />
      <Plume get={get} at={[[0, 0, 0]]} radius={0.4} length={10} kind="solid" />
    </group>
  )
}
function FairingHalf() {
  const m = M()
  const r = DELTA.fairDia / 2
  return (
    <group>
      <Cyl r0={r} y0={0} y1={5.6} m={m.white} open theta={[0, Math.PI]} />
      <Cyl r0={r} r1={0.15} y0={5.6} y1={DELTA.fairLen} m={m.white} open theta={[0, Math.PI]} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────── MER
const MER_R = 2.65 / 2 // JPL: cruise stage ~2.65 m across
function MerCruise({ k }: { k: string }) {
  const m = M()
  const ref = useRef<THREE.Group>(null!)
  const o = live.objs.get(k)
  const stageOnly = !!o?.p?.stageOnly
  useFrame((_, dt) => {
    const ob = live.objs.get(k)
    if (ref.current && ob) ref.current.rotation.y += ((ob.p?.spin ?? 0) * Math.PI * 2 / 60) * dt * Math.min(1, live.rate / 60 + 0.02)
  })
  // total height with the aeroshell 1.6 m (JPL): heat shield 0.3, backshell 0.85, cruise stage 0.45
  return (
    <group ref={ref}>
      {!stageOnly && <AeroshellParts />}
      <group position={[0, stageOnly ? 0 : 1.15, 0]}>
        <Cyl r0={MER_R} y0={0} y1={0.3} m={m.alu} />
        <mesh position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.solar}><ringGeometry args={[0.55, MER_R - 0.03, 40, 1]} /></mesh>
        <Cyl r0={0.45} y0={0.3} y1={0.45} m={m.grey} />
      </group>
    </group>
  )
}
function AeroshellParts({ noHeat = false }: { noHeat?: boolean }) {
  const m = M()
  return (
    <group>
      {!noHeat && <Cyl r0={MER_R} r1={0.35} y0={-0.3} y1={0} m={m.heatshield} />}
      <Cyl r0={MER_R} r1={0.55} y0={0} y1={0.85} m={m.backshell} open />
      <Cyl r0={0.55} y0={0.85} y1={1.15} m={m.backshell} />
    </group>
  )
}
function MerBackshell({ k }: { k: string }) {
  const m = M()
  const get = useObj(k)
  const rad = [0, 1, 2].map((i) => [Math.cos((i * 2 * Math.PI) / 3) * 0.95, 0.15, Math.sin((i * 2 * Math.PI) / 3) * 0.95] as [number, number, number])
  return (
    <group>
      <AeroshellParts noHeat />
      {rad.map((p, i) => <mesh key={i} position={[p[0], 0.35, p[2]]} material={m.grey}><cylinderGeometry args={[0.1, 0.13, 0.5, 10]} /></mesh>)}
      <Plume get={get} at={rad} radius={0.22} length={9} kind="solid" />
    </group>
  )
}
function MerChute({ k }: { k: string }) {
  const m = M()
  const ref = useRef<THREE.Group>(null!)
  const lines = useMemo(() => {
    // 48 suspension lines to the riser, then the triple bridle to the backshell (JPL)
    const pts: number[] = []
    const R = 7.5, H = 24
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      pts.push(0, 6, 0, Math.cos(a) * R, H, Math.sin(a) * R)
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      pts.push(0, 6, 0, Math.cos(a) * 0.5, -1.0, Math.sin(a) * 0.5)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  useFrame(() => {
    const o = live.objs.get(k)
    if (!ref.current || !o) return
    const s = 0.1 + 0.9 * (o.p?.open ?? 1)
    ref.current.scale.set(s, 0.4 + 0.6 * s, s)
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 24, 0]} material={m.canopyW} castShadow><sphereGeometry args={[7.5, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2.4]} /></mesh>
      <mesh position={[0, 24.2, 0]} material={m.canopyO}><sphereGeometry args={[7.6, 32, 4, 0, Math.PI * 2, Math.PI / 3.3, Math.PI / 14]} /></mesh>
      <lineSegments geometry={lines} material={m.line} />
    </group>
  )
}
const MerHeatshield = () => <Cyl r0={MER_R} r1={0.35} y0={-0.3} y1={0} m={M().heatshield} />

const LANDER_EDGE = 2.0 // illustrative
function MerLander({ k }: { k: string }) {
  const m = M()
  const petals = useRef<THREE.Group[]>([])
  const bags = useRef<THREE.Group>(null!)
  const bridle = useRef<THREE.Mesh>(null!)
  const geo = useMemo(() => {
    const tri = new THREE.BufferGeometry()
    const s = LANDER_EDGE, h = (Math.sqrt(3) / 2) * s
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-s / 2, 0, 0, s / 2, 0, 0, 0, 0, -h], 3))
    tri.computeVertexNormals()
    return { tri, h, s }
  }, [])
  const inR = geo.h / 3 // inradius of the base triangle
  const closed = Math.acos(1 / 3) // tetrahedron dihedral angle (70.53°)
  useFrame(() => {
    const o = live.objs.get(k)
    if (!o) return
    const open = o.p?.petals ?? 0
    petals.current.forEach((g) => { if (g) g.rotation.x = -(Math.PI - closed) * (1 - open) })
    const b = o.p?.bags ?? 0
    if (bags.current) { bags.current.visible = b > 0.02; bags.current.scale.setScalar(0.25 + 0.75 * b) }
    const L = o.p?.bridle ?? 0
    if (bridle.current) { bridle.current.visible = L > 0.1; bridle.current.scale.set(1, L, 1); bridle.current.position.y = 1.6 + L / 2 }
  })
  const lobes = useMemo(() => {
    // four bags (one per face) of six lobes each (JPL)
    const faces: THREE.Vector3[] = [new THREE.Vector3(0, -1, 0)]
    for (let i = 0; i < 3; i++) faces.push(new THREE.Vector3(Math.cos((i * 2 * Math.PI) / 3 + Math.PI / 6) * 0.94, 0.33, Math.sin((i * 2 * Math.PI) / 3 + Math.PI / 6) * 0.94))
    const out: [number, number, number][] = []
    for (const n of faces) {
      const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize()
      const t2 = new THREE.Vector3().crossVectors(n, t1)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const p = n.clone().multiplyScalar(1.35).add(t1.clone().multiplyScalar(Math.cos(a) * 0.75)).add(t2.clone().multiplyScalar(Math.sin(a) * 0.75))
        out.push([p.x, p.y + 0.6, p.z])
      }
    }
    return out
  }, [])
  return (
    <group>
      {/* base petal (on the ground) and three side petals hinged on its edges */}
      <mesh geometry={geo.tri} material={m.petal} position={[0, 0.02, inR]} castShadow receiveShadow />
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, (i * 2 * Math.PI) / 3, 0]}>
          <group position={[0, 0.02, inR]} ref={(g) => { if (g) petals.current[i] = g }}>
            <mesh geometry={geo.tri} material={m.petal} castShadow receiveShadow rotation={[0, Math.PI, 0]} position={[0, 0, 0]} />
          </group>
        </group>
      ))}
      <group ref={bags}>
        {lobes.map((p, i) => <mesh key={i} position={p} material={m.airbag} castShadow><sphereGeometry args={[0.62, 14, 10]} /></mesh>)}
      </group>
      <mesh ref={bridle} material={m.line}><cylinderGeometry args={[0.015, 0.015, 1, 4]} /></mesh>
    </group>
  )
}
function MerRover({ k }: { k: string }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => {
    const o = live.objs.get(k)
    if (ref.current && o) ref.current.scale.setScalar(Math.max(0.001, o.p?.appear ?? 1))
  })
  return <group ref={ref}><Suspense fallback={null}><NasaModel id="mer-b" /></Suspense></group>
}

export function ModelFor({ kind, k }: { kind: ModelKind; k: string }) {
  switch (kind) {
    case 'sic': return <SIC k={k} />
    case 'sii': return <SII k={k} />
    case 'interstage': return <Interstage />
    case 'sivb': return <SIVB k={k} />
    case 'sla-upper': return <SlaUpper k={k} />
    case 'sm': return <SM k={k} />
    case 'cm': return <CM k={k} />
    case 'les': return <LES k={k} />
    case 'lm': return <Suspense fallback={null}><LM k={k} part="all" /></Suspense>
    case 'lm-descent': return <Suspense fallback={null}><LM k={k} part="descent" /></Suspense>
    case 'lm-ascent': return <Suspense fallback={null}><LM k={k} part="ascent" /></Suspense>
    case 'astronaut': return <Walker k={k} />
    case 'flag': return <Flag />
    case 'easep': return <EasepStation />
    case 'lrrr': return <Retroreflector />
    case 'drogue': return <Canopies k={k} n={1} r={2.6} h={14} />
    case 'mains': return <Canopies k={k} n={3} r={7} h={26} />
    case 'delta-core': return <DeltaCore k={k} />
    case 'gem': return <Gem k={k} />
    case 'delta-stage2': return <DeltaStage2 k={k} />
    case 'star48': return <Star48 k={k} />
    case 'fairing': return <FairingHalf />
    case 'mer-cruise': return <MerCruise k={k} />
    case 'mer-aeroshell': return <AeroshellParts />
    case 'mer-heatshield': return <MerHeatshield />
    case 'mer-backshell': return <MerBackshell k={k} />
    case 'mer-chute': return <MerChute k={k} />
    case 'mer-lander': return <MerLander k={k} />
    case 'mer-rover': return <MerRover k={k} />
    case 'exp-stage': return <ExpStage get={useObj(k)} />
    case 'exp-lander': return <ExpLander get={useObj(k)} />
    case 'exp-capsule': return <ExpCapsule get={useObj(k)} />
    case 'exp-heatshield': return <ExpHeatshield />
    case 'exp-mlander': return <ExpMarsLander get={useObj(k)} />
    case 'exp-rover': return <ExpRover get={useObj(k)} />
  }
}

/** approximate size of each part (m), for camera framing and the far-away marker */
export const SIZE: Partial<Record<ModelKind, number>> = {
  sic: 42, sii: 25, sivb: 21, 'sla-upper': 6.5, sm: 4.5, cm: 3.5, les: 10, lm: 7, 'lm-ascent': 7, 'lm-descent': 4, drogue: 16, mains: 34, astronaut: 1.8,
  'delta-core': 26, gem: 16, 'delta-stage2': 6, star48: 2, fairing: 8.5, 'mer-cruise': 2.7, 'mer-aeroshell': 1.5, 'mer-backshell': 1.2, 'mer-chute': 30, 'mer-lander': 4, 'mer-rover': 1.6,
  'exp-stage': 9, 'exp-lander': 5, 'exp-capsule': 2.2, 'exp-mlander': 3.4, 'exp-rover': 2,
}

useGLTF.preload('/assets/models/nasa/apollo-lm.glb', DRACO_PATH)
