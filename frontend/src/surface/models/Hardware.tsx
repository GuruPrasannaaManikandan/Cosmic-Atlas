import { useMemo } from 'react'
import * as THREE from 'three'
import { MAT } from './materials'

/**
 * Procedural reconstructions of the Apollo 11 hardware left at Tranquility Base.
 *
 * Sourced dimensions (NSSDCA 1969-059C): descent stage = octagonal prism 4.2 m across and 1.7 m thick, its bottom
 * 1.5 m above the surface, 9.4 m between the ends of opposite footpads, ~1 m conical engine skirt, four legs with
 * round footpads, ladder + egress platform on one leg. EASEP: square base, two canted rectangular solar panels,
 * antenna mast. LRRR: fused-silica corner-cube array on a folding, tilted support.
 * Everything else (footpad diameter, strut layout, panel sizes, foil colours, cube count) is an APPROXIMATION from
 * public photographs and is documented as such in docs/space-exploration/3d-asset-provenance.
 *
 * Each model exposes COMPONENT_ANCHORS (local positions) so the inspection camera can focus on a part.
 */

export const COMPONENT_ANCHORS: Record<string, Record<string, [number, number, number]>> = {
  'lm-descent-stage': { body: [0, 2.4, 0], legs: [0, 0.8, 4.0], ladder: [0, 1.6, 3.2], engine: [0, 1.1, 0] },
  'easep-pse': { seismometer: [0, 0.35, 0], 'solar-panels': [0.9, 0.45, 0], antenna: [0.15, 0.9, 0.2], 'dust-detector': [-0.2, 0.45, -0.25] },
  lrrr: { array: [0, 0.55, 0], support: [0, 0.2, 0.15] },
}
/** obstacle footprint for the controller: [x, z, radius, height] in model space */
export const COLLIDERS: Record<string, [number, number, number, number][]> = {
  'lm-descent-stage': [
    [0, 0, 2.3, 3.2], // the stage underside is 1.5 m up — too low for a suited astronaut to walk under
    [0, 4.23, 0.5, 0.4],
    [0, -4.23, 0.5, 0.4],
    [4.23, 0, 0.5, 0.4],
    [-4.23, 0, 0.5, 0.4],
  ],
  'easep-pse': [[0, 0, 0.75, 0.9]],
  lrrr: [[0, 0, 0.45, 0.8]],
}

const glow = (mat: THREE.MeshStandardMaterial, on: boolean) => {
  const m = mat.clone()
  if (on) {
    m.emissive = new THREE.Color('#2f7dd6')
    m.emissiveIntensity = 0.55
  }
  return m
}

function Strut({ from, to, r, mat }: { from: [number, number, number]; to: [number, number, number]; r: number; mat: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const d = b.clone().sub(a)
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    }
  }, [from, to])
  return (
    <mesh position={pos} quaternion={quat} material={mat} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  )
}

export function LunarModuleDescentStage({ highlight }: { highlight?: string | null }) {
  const m = useMemo(() => {
    const gold = MAT.gold(), silver = MAT.silverFoil(), black = MAT.blackFoil(), strut = MAT.strut(), alu = MAT.aluminium(), engine = MAT.engine()
    return { gold, silver, black, strut, alu, engine }
  }, [])
  const body = glow(m.gold, highlight === 'body')
  const legMat = glow(m.strut, highlight === 'legs')
  const ladderMat = glow(m.alu, highlight === 'ladder')
  const engMat = glow(m.engine, highlight === 'engine')
  const BOTTOM = 1.5, THICK = 1.7, ACROSS = 4.2
  const circR = ACROSS / 2 / Math.cos(Math.PI / 8)
  const PAD = 4.23 // footpad centre: 9.4 m between outer edges of opposite pads, ~0.94 m pads (approx.)
  const legs = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2
    const dx = Math.sin(a), dz = Math.cos(a)
    return { i, dx, dz }
  })

  return (
    <group>
      {/* octagonal stage: flats face the legs (±x, ±z) */}
      <mesh position={[0, BOTTOM + THICK / 2, 0]} rotation={[0, Math.PI / 8, 0]} material={body} castShadow receiveShadow>
        <cylinderGeometry args={[circR, circR, THICK, 8, 1]} />
      </mesh>
      {/* black / silver blanket panels on alternate faces */}
      {[1, 3, 5, 7].map((k) => {
        const a = (k * Math.PI) / 4
        return (
          <mesh key={k} position={[Math.sin(a) * (ACROSS / 2 + 0.012), BOTTOM + THICK / 2, Math.cos(a) * (ACROSS / 2 + 0.012)]} rotation={[0, a, 0]} material={k % 4 === 1 ? m.black : m.silver} castShadow>
            <boxGeometry args={[1.6, THICK * 0.92, 0.02]} />
          </mesh>
        )
      })}
      {/* top deck where the ascent stage sat */}
      <mesh position={[0, BOTTOM + THICK + 0.02, 0]} rotation={[0, Math.PI / 8, 0]} material={m.silver} receiveShadow castShadow>
        <cylinderGeometry args={[circR * 0.98, circR * 0.98, 0.04, 8]} />
      </mesh>
      {/* descent engine skirt (~1 m, conical) */}
      <mesh position={[0, BOTTOM - 0.5, 0]} material={engMat} castShadow>
        <cylinderGeometry args={[0.38, 0.75, 1.0, 24, 1, true]} />
      </mesh>
      {legs.map(({ i, dx, dz }) => {
        const top: [number, number, number] = [dx * 2.15, BOTTOM + 1.25, dz * 2.15]
        const knee: [number, number, number] = [dx * 3.7, 0.95, dz * 3.7]
        const pad: [number, number, number] = [dx * PAD, 0.12, dz * PAD]
        const side = new THREE.Vector3(dz, 0, -dx)
        const lowA: [number, number, number] = [dx * 2.1 + side.x * 1.4, BOTTOM + 0.05, dz * 2.1 + side.z * 1.4]
        const lowB: [number, number, number] = [dx * 2.1 - side.x * 1.4, BOTTOM + 0.05, dz * 2.1 - side.z * 1.4]
        return (
          <group key={i}>
            <Strut from={top} to={knee} r={0.085} mat={legMat} />
            <Strut from={knee} to={pad} r={0.07} mat={legMat} />
            <Strut from={lowA} to={knee} r={0.04} mat={legMat} />
            <Strut from={lowB} to={knee} r={0.04} mat={legMat} />
            <mesh position={pad} material={legMat} castShadow receiveShadow>
              <cylinderGeometry args={[0.47, 0.4, 0.16, 24]} />
            </mesh>
            {/* lunar-surface sensing probe (not on the ladder leg — approximate) */}
            {i !== 0 && <Strut from={[pad[0], 0.06, pad[2]]} to={[pad[0] + dx * 0.25, 0.02, pad[2] + dz * 0.25]} r={0.012} mat={m.alu} />}
          </group>
        )
      })}
      {/* ladder + egress platform on the +z leg */}
      <group>
        <mesh position={[0, BOTTOM + 0.15, 2.45]} material={ladderMat} castShadow>
          <boxGeometry args={[0.9, 0.05, 0.6]} />
        </mesh>
        {[-0.3, 0.3].map((x) => (
          <Strut key={x} from={[x, BOTTOM + 0.1, 2.55]} to={[x, 0.75, 3.62]} r={0.025} mat={ladderMat} />
        ))}
        {Array.from({ length: 9 }, (_, k) => {
          const t = (k + 0.5) / 9
          return <Strut key={k} from={[-0.3, BOTTOM + 0.1 - t * (BOTTOM - 0.65), 2.55 + t * 1.07]} to={[0.3, BOTTOM + 0.1 - t * (BOTTOM - 0.65), 2.55 + t * 1.07]} r={0.015} mat={ladderMat} />
        })}
      </group>
    </group>
  )
}

export function EasepStation({ highlight }: { highlight?: string | null }) {
  const alu = useMemo(() => MAT.aluminium(), [])
  const cell = useMemo(() => MAT.solarCell(), [])
  const gold = useMemo(() => MAT.gold(), [])
  const dark = useMemo(() => MAT.darkMetal(), [])
  const panel = glow(cell, highlight === 'solar-panels')
  const seis = glow(gold, highlight === 'seismometer')
  const ant = glow(alu, highlight === 'antenna')
  const dust = glow(dark, highlight === 'dust-detector')
  return (
    <group>
      <mesh position={[0, 0.08, 0]} material={alu} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.1, 0.62]} />
      </mesh>
      {/* seismometer under its thermal shroud */}
      <mesh position={[0, 0.3, 0]} material={seis} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.34, 20]} />
      </mesh>
      <mesh position={[-0.2, 0.36, -0.25]} material={dust} castShadow>
        <boxGeometry args={[0.1, 0.06, 0.06]} />
      </mesh>
      {/* two canted rectangular solar panels */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.33, 0.2, 0]} rotation={[0, 0, s * -0.28]}>
          <mesh position={[s * 0.58, 0.2, 0]} material={panel} castShadow>
            <boxGeometry args={[1.1, 0.025, 0.78]} />
          </mesh>
          <mesh position={[s * 0.58, 0.18, 0]} material={alu}>
            <boxGeometry args={[1.14, 0.015, 0.82]} />
          </mesh>
        </group>
      ))}
      {/* antenna mast */}
      <mesh position={[0.15, 0.62, 0.2]} material={ant} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 8]} />
      </mesh>
      <mesh position={[0.15, 0.95, 0.2]} rotation={[0.6, 0, 0]} material={ant} castShadow>
        <coneGeometry args={[0.08, 0.12, 12, 1, true]} />
      </mesh>
    </group>
  )
}

/** LRRR: corner-cube panel on a folding stand, tilted to face Earth (aim given in model space by the caller) */
export function Retroreflector({ highlight, tiltRad = 0.9 }: { highlight?: string | null; tiltRad?: number }) {
  const alu = useMemo(() => MAT.aluminium(), [])
  const cubeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a3140', metalness: 0.6, roughness: 0.15 }), [])
  const frame = glow(alu, highlight === 'array')
  const legs = glow(alu, highlight === 'support')
  const N = 10 // cube grid drawn for appearance — the real count is not yet sourced
  const S = 0.46
  return (
    <group>
      {[[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.2], [0.22, 0.2]].map(([x, z], i) => (
        <Strut key={i} from={[x, 0, z]} to={[x * 0.6, 0.42, z * 0.3]} r={0.015} mat={legs} />
      ))}
      <group position={[0, 0.5, 0]} rotation={[-tiltRad, 0, 0]}>
        <mesh material={frame} castShadow receiveShadow>
          <boxGeometry args={[S + 0.06, 0.05, S + 0.06]} />
        </mesh>
        {Array.from({ length: N * N }, (_, k) => {
          const i = k % N, j = Math.floor(k / N)
          return (
            <mesh key={k} position={[(i + 0.5) / N * S - S / 2, 0.027, (j + 0.5) / N * S - S / 2]} rotation={[-Math.PI / 2, 0, 0]} material={cubeMat}>
              <circleGeometry args={[S / N / 2.3, 10]} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function HardwareModel({ modelId, highlight, tilt }: { modelId: string; highlight?: string | null; tilt?: number }) {
  if (modelId === 'lm-descent-stage') return <LunarModuleDescentStage highlight={highlight} />
  if (modelId === 'easep-pse') return <EasepStation highlight={highlight} />
  if (modelId === 'lrrr') return <Retroreflector highlight={highlight} tiltRad={tilt ?? 0.4} />
  return null
}
