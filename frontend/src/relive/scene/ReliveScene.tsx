/**
 * The Relive Mission 3-D view: one R3F canvas (the orbital canvas and the Unity player are paused while it runs).
 * Every frame: mission time from the player clock → flight frame → objects placed relative to the subject
 * (floating origin, float64 maths) → camera director (blend + ease) → environment.
 */
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { clock, useRelive } from '../player'
import { frameAt, type ModelKind } from '../flight'
import { rateAt } from '../timeline'
import { live } from './live'
import { Environment, PathLine, rel } from './env'
import { ModelFor, SIZE } from './models'
import { Marker, Plasma } from './effects'
import { lerpPose, shotPose, type Pose } from './director'
import { v3, type V3 } from '../geo'

function basis(fwd: V3, side?: V3): THREE.Quaternion {
  const y = new THREE.Vector3(...fwd).normalize()
  let z = new THREE.Vector3(...(side ?? [1, 0, 0]))
  z.sub(y.clone().multiplyScalar(z.dot(y)))
  if (z.lengthSq() < 1e-8) { z = new THREE.Vector3(1, 0, 0).sub(y.clone().multiplyScalar(y.x)); if (z.lengthSq() < 1e-8) z.set(0, 0, 1) }
  z.normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

function pressureOf(env: string, alt: number): number {
  if (env === 'earth') return Math.exp(-Math.max(0, alt) / 8500)
  if (env === 'mars' || env === 'mars-local') return 0.15 * Math.exp(-Math.max(0, alt) / 11100)
  return 0
}

function World({ scriptId }: { scriptId: string }) {
  const [env, setEnv] = useState<string | null>(null)
  const [keys, setKeys] = useState<{ key: string; model: ModelKind }[]>([])
  const sig = useRef('')
  const groups = useRef(new Map<string, THREE.Group>())
  const cam = useRef<{ eye: THREE.Vector3; target: THREE.Vector3; fov: number; env: string } | null>(null)
  const markerOn = useRef(false)
  const cue = useRef({ idx: -1, wall: -1e9, env: '', lastU: -1 })
  const [marker, setMarker] = useState(false)
  const { camera, scene } = useThree()
  if (typeof window !== 'undefined') (window as unknown as { __reliveScene?: unknown }).__reliveScene = { scene, camera, live }

  useFrame((_, dtRaw) => {
    const sc = clock.script
    if (!sc) return
    const dt = Math.min(0.1, dtRaw)
    const t = clock.t
    const f = sc.frame ? sc.frame(t) : frameAt(scriptId, t)
    live.frame = f
    live.t = t
    live.wall = clock.wall
    live.rate = rateAt(sc.segments, clock.u)
    live.objs = new Map(f.objects.map((o) => [o.key, o]))
    live.pressure = pressureOf(f.env, f.alt)
    // daylight factor from the Sun's elevation at the subject (only meaningful inside an atmosphere)
    const se = f.sun[0] * f.up[0] + f.sun[1] * f.up[1] + f.sun[2] * f.up[2]
    const inAir = f.env === 'earth' || f.env === 'mars-local'
    live.day = inAir ? Math.min(1, Math.max(0, (se + 0.12) / 0.3)) : 1
    const s = f.env + '|' + f.objects.map((o) => o.key + ':' + o.model).join(',')
    const envKey = f.env + ':' + (f.site?.kind ?? '')
    if (s !== sig.current || envKey !== env) {
      sig.current = s
      if (envKey !== env) setEnv(envKey)
      setKeys(f.objects.map((o) => ({ key: o.key, model: o.model })))
    }
    // place the hardware (relative to the subject)
    for (const o of f.objects) {
      const g = groups.current.get(o.key)
      if (!g) continue
      g.position.set(...rel(o.pos))
      g.quaternion.copy(basis(o.fwd, o.side))
      g.visible = (o.fade ?? 1) > 0.15
    }
    // camera director: frame the parts within 400 m of the subject (the whole stack, the canopies, ...)
    let size = 3
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const o of f.objects) {
      if ((o.fade ?? 1) < 0.5) continue
      const r = rel(o.pos), L = SIZE[o.model] ?? 2
      if (Math.hypot(...r) > 400) continue
      const tip = [r[0] + o.fwd[0] * L, r[1] + o.fwd[1] * L, r[2] + o.fwd[2] * L]
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], r[i], tip[i]); hi[i] = Math.max(hi[i], r[i], tip[i]) }
    }
    let center: V3 = [0, 0, 0]
    if (lo[0] < Infinity) {
      center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
      size = Math.max(3, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]))
    }
    live.subject = size
    // the active shot; blends run on wall-clock time (so they finish while paused), a seek or a new environment cuts
    const cues = sc.shots
    let idx = 0
    for (let k = 0; k < cues.length; k++) if (cues[k].t <= t) idx = k
    const speed = useRelive.getState().speed
    const jumped = cue.current.lastU >= 0 && Math.abs(clock.u - cue.current.lastU) > Math.max(0.6, dt * speed * 4)
    cue.current.lastU = clock.u
    if (idx !== cue.current.idx) { cue.current.idx = idx; cue.current.wall = jumped ? -1e9 : clock.wall; cue.current.env = f.env }
    if (f.env !== cue.current.env) { cue.current.env = f.env; cue.current.wall = -1e9 }
    const wl = Math.min(1, Math.max(0, (clock.wall - cue.current.wall) / 1.8))
    const w = wl * wl * (3 - 2 * wl)
    const a: Pose = shotPose(cues[Math.max(0, idx - 1)].shot, f, clock.wall, size, center)
    const b: Pose = shotPose(cues[idx].shot, f, clock.wall, size, center)
    const p = lerpPose(a, b, w)
    const want = { eye: new THREE.Vector3(...p.eye), target: new THREE.Vector3(...p.target) }
    const c = cam.current
    const cut = !c || jumped || c.env !== f.env || c.eye.distanceTo(want.eye) > 50 * Math.max(10, want.eye.length())
    if (cut) cam.current = { eye: want.eye.clone(), target: want.target.clone(), fov: p.fov, env: f.env }
    else {
      const k = 1 - Math.exp(-dt * 3.5)
      // ease in log-distance so the camera does not crawl through huge range changes
      const L0 = c!.eye.length(), L1 = want.eye.length()
      const dir = c!.eye.clone().normalize().lerp(want.eye.clone().normalize(), k).normalize()
      c!.eye.copy(dir.multiplyScalar(Math.exp(Math.log(Math.max(1e-3, L0)) + (Math.log(Math.max(1e-3, L1)) - Math.log(Math.max(1e-3, L0))) * k)))
      c!.target.lerp(want.target, k)
      c!.fov += (p.fov - c!.fov) * k
    }
    const C = cam.current!
    camera.position.copy(C.eye)
    camera.up.set(...f.up)
    camera.lookAt(C.target)
    const pc = camera as THREE.PerspectiveCamera
    if (Math.abs(pc.fov - C.fov) > 0.01) { pc.fov = C.fov; pc.updateProjectionMatrix() }
    const dist = C.eye.length()
    const on = size / dist < 0.0035 * (C.fov / 45)
    if (on !== markerOn.current) { markerOn.current = on; setMarker(on) }
  })

  const objs = useMemo(() => keys.map((k) => (
    <group key={k.key} ref={(g) => { if (g) groups.current.set(k.key, g); else groups.current.delete(k.key) }}>
      <ModelFor kind={k.model} k={k.key} />
    </group>
  )), [keys])

  return (
    <>
      {env && <Suspense fallback={null}><Environment key={env} env={env.split(':')[0]} /></Suspense>}
      {env?.startsWith('cislunar') && <PathLine />}
      {objs}
      <Plasma size={env?.startsWith('mars') ? 2.2 : 3.2} />
      <Marker visible={marker} />
    </>
  )
}

export function ReliveScene({ scriptId }: { scriptId: string }) {
  // the first frame is computed before the environment mounts, so its local patches know their site
  useMemo(() => { const sc = clock.script; live.frame = sc ? (sc.frame ? sc.frame(clock.t) : frameAt(scriptId, clock.t)) : null }, [scriptId])
  return (
    <Canvas
      className="relive-canvas"
      shadows
      dpr={[1, 1.75]}
      gl={{ logarithmicDepthBuffer: true, antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
      camera={{ fov: 45, near: 0.05, far: 1e13, position: [0, 2, 10] }}
      onCreated={({ gl }) => { gl.setClearColor('#000002') }}
    >
      <World scriptId={scriptId} />
    </Canvas>
  )
}

export const _sceneTest = { basis, v3 }
