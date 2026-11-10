import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAT } from './materials'
import type { GaitPose } from '../controller'

/**
 * Articulated astronaut (procedural rig — hierarchy of joints, animated by the gait solver in controller.ts).
 * Look: a stylised Apollo-era white EVA suit with a life-support backpack (PLSS) and gold sun visor. It is a generic
 * explorer, not a specific crew member. Forward = −z, feet at y = 0, height ≈ 1.9 m with the helmet.
 * Segment lengths: thigh 0.44 + shin 0.42 + boot 0.06 = LEG_LENGTH 0.92 m (used for no-slide gait).
 */
export interface AstronautHandle {
  root: THREE.Group
  head: THREE.Group
  /**
   * extra (optional): headYaw (rad, + = left) turns the helmet toward something; pointPitch (rad above horizontal)
   * raises the right arm straight out to point; talk (0..1) adds a small speaking nod
   */
  pose: (p: GaitPose, headPitch: number, extra?: { headYaw?: number; pointPitch?: number | null; talk?: number }) => void
}

function Capsule({ r, len, mat, y = 0 }: { r: number; len: number; mat: THREE.Material; y?: number }) {
  return (
    <mesh position={[0, y, 0]} material={mat} castShadow receiveShadow>
      <capsuleGeometry args={[r, len, 6, 14]} />
    </mesh>
  )
}

function Rings({ r, y, n = 3, mat }: { r: number; y: number; n?: number; mat: THREE.Material }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[0, y - i * 0.035, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat} castShadow>
          <torusGeometry args={[r, 0.016, 6, 18]} />
        </mesh>
      ))}
    </>
  )
}

export const Astronaut = forwardRef<AstronautHandle, { visibleBody?: boolean }>(function Astronaut({ visibleBody = true }, ref) {
  const m = useMemo(() => ({ suit: MAT.suit(), joint: MAT.suitJoint(), glove: MAT.glove(), boot: MAT.boot(), sole: MAT.sole(), visor: MAT.visor(), shell: MAT.helmetShell(), pack: MAT.suit(), metal: MAT.aluminium(), dark: MAT.darkMetal() }), [])
  const root = useRef<THREE.Group>(null!)
  const hips = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const hipL = useRef<THREE.Group>(null!), hipR = useRef<THREE.Group>(null!)
  const kneeL = useRef<THREE.Group>(null!), kneeR = useRef<THREE.Group>(null!)
  const shL = useRef<THREE.Group>(null!), shR = useRef<THREE.Group>(null!)
  const elL = useRef<THREE.Group>(null!), elR = useRef<THREE.Group>(null!)

  useImperativeHandle(ref, () => ({
    get root() { return root.current },
    get head() { return head.current },
    pose(p, headPitch, extra) {
      hips.current.position.y = 0.98 + p.bob
      torso.current.rotation.x = -p.lean
      hipL.current.rotation.x = p.hipL
      hipR.current.rotation.x = p.hipR
      kneeL.current.rotation.x = -p.kneeL
      kneeR.current.rotation.x = -p.kneeR
      shL.current.rotation.x = p.shoulderL
      shR.current.rotation.x = p.shoulderR
      elL.current.rotation.x = p.elbow
      elR.current.rotation.x = p.elbow
      const nod = extra?.talk ? Math.sin(performance.now() / 160) * 0.035 * extra.talk : 0
      head.current.rotation.x = THREE.MathUtils.clamp(headPitch + nod, -0.5, 0.45)
      head.current.rotation.y = THREE.MathUtils.clamp(extra?.headYaw ?? 0, -1.1, 1.1)
      if (extra?.pointPitch !== undefined && extra.pointPitch !== null) {
        // arm straight out toward the target: 0 = hanging, +π/2 = horizontal forward
        shR.current.rotation.x = Math.PI / 2 + THREE.MathUtils.clamp(extra.pointPitch, -0.9, 1.0)
        elR.current.rotation.x = 0.05
      }
    },
  }))

  const leg = (side: 1 | -1, hipRef: typeof hipL, kneeRef: typeof kneeL) => (
    <group ref={hipRef} position={[0.115 * side, -0.02, 0]}>
      <Rings r={0.1} y={-0.02} n={2} mat={m.joint} />
      <Capsule r={0.095} len={0.3} mat={m.suit} y={-0.22} />
      <group ref={kneeRef} position={[0, -0.44, 0]}>
        <Rings r={0.088} y={0.03} n={3} mat={m.joint} />
        <Capsule r={0.085} len={0.28} mat={m.suit} y={-0.21} />
        {/* lunar overshoe */}
        <group position={[0, -0.42, 0]}>
          <mesh position={[0, 0.045, -0.04]} material={m.boot} castShadow>
            <boxGeometry args={[0.15, 0.11, 0.3]} />
          </mesh>
          <mesh position={[0, -0.005, -0.04]} material={m.sole} castShadow>
            <boxGeometry args={[0.16, 0.025, 0.31]} />
          </mesh>
        </group>
      </group>
    </group>
  )

  const arm = (side: 1 | -1, shRef: typeof shL, elRef: typeof elL) => (
    <group ref={shRef} position={[0.29 * side, 0.2, 0]} rotation={[0, 0, 0.12 * side]}>
      <mesh material={m.joint} castShadow>
        <sphereGeometry args={[0.1, 14, 10]} />
      </mesh>
      <Capsule r={0.075} len={0.2} mat={m.suit} y={-0.16} />
      <group ref={elRef} position={[0, -0.31, 0]}>
        <Rings r={0.072} y={0.03} n={2} mat={m.joint} />
        <Capsule r={0.066} len={0.18} mat={m.suit} y={-0.14} />
        <mesh position={[0, -0.28, 0]} material={m.dark} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.04, 14]} />
        </mesh>
        <mesh position={[0, -0.36, -0.01]} material={m.glove} castShadow>
          <boxGeometry args={[0.09, 0.13, 0.06]} />
        </mesh>
      </group>
    </group>
  )

  return (
    <group ref={root}>
      <group ref={hips} position={[0, 0.98, 0]}>
        <mesh material={m.suit} castShadow visible={visibleBody}>
          <cylinderGeometry args={[0.19, 0.2, 0.18, 16]} />
        </mesh>
        <group visible={visibleBody}>
          {leg(-1, hipL, kneeL)}
          {leg(1, hipR, kneeR)}
        </group>
        <group ref={torso} position={[0, 0.1, 0]}>
          <group visible={visibleBody}>
            <mesh position={[0, 0.22, 0]} material={m.suit} castShadow>
              <capsuleGeometry args={[0.22, 0.24, 6, 16]} />
            </mesh>
            {/* chest display and control unit */}
            <mesh position={[0, 0.3, -0.24]} material={m.metal} castShadow>
              <boxGeometry args={[0.24, 0.12, 0.07]} />
            </mesh>
            {/* PLSS backpack + OPS on top */}
            <mesh position={[0, 0.26, 0.28]} material={m.pack} castShadow>
              <boxGeometry args={[0.46, 0.62, 0.22]} />
            </mesh>
            <mesh position={[0, 0.65, 0.27]} material={m.pack} castShadow>
              <boxGeometry args={[0.4, 0.16, 0.18]} />
            </mesh>
            <mesh position={[0.17, 0.78, 0.3]} material={m.dark}>
              <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
            </mesh>
            {arm(-1, shL, elL)}
            {arm(1, shR, elR)}
          </group>
          {/* helmet: neck ring, bubble, gold visor */}
          <group ref={head} position={[0, 0.56, -0.02]}>
            <mesh position={[0, -0.08, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.metal} visible={visibleBody}>
              <torusGeometry args={[0.15, 0.025, 8, 24]} />
            </mesh>
            <mesh position={[0, 0.1, 0]} material={m.shell} visible={visibleBody}>
              <sphereGeometry args={[0.2, 24, 18]} />
            </mesh>
            <mesh position={[0, 0.1, 0]} rotation={[-0.1, 0, 0]} material={m.visor} castShadow visible={visibleBody}>
              <sphereGeometry args={[0.205, 24, 18, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.18, Math.PI * 0.5]} />
            </mesh>
            <mesh position={[0, 0.1, 0.02]} material={m.suit} castShadow visible={visibleBody}>
              <sphereGeometry args={[0.212, 20, 14, Math.PI * 1.42, Math.PI * 1.16, 0, Math.PI * 0.62]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
})
