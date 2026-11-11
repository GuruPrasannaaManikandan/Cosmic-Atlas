import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store/store'
import { OBJECT_BY_ID } from '../missions'
import { SurfaceSite, SURFACE_BODIES } from './sites'
import { Terrain, DtmTerrain, SiteTerrain, Collider, mulberry32, DtmMeta, HorizonGrid } from './terrain'
import { stepCharacter, newCharacter, paramsForGravity, gaitPose, CharacterState, forwardOf } from './controller'
import { elevationDeg, azimuthDeg } from './lighting'
import { planetFor, PlanetEnvironment } from './planets'
import { measureSafeArea, placeBubble, SafeArea } from './hudLayout'
import { useSurface, surfaceDebug, surfaceControl } from './surfaceState'
import { useGuide, announceOnce, approachLine, discoverLine, inspectHint } from './guide'
import { useNarrator } from './narrator'
import { bearingDeg } from './geo'
import { Astronaut, AstronautHandle } from './models/Astronaut'
import { HardwareModel, COLLIDERS, COMPONENT_ANCHORS, PositionMarker } from './models/Hardware'
import { ExpLander } from '../relive/scene/expeditionModels'
import { LANDER_T, landerHooks } from './surfaceState'
import type { Obj } from '../relive/flight'
import { input } from '../input/appInput'
import type { InputMode } from '../input/inputManager'
import { regolithMap, regolithBump } from './models/materials'

const D2R = Math.PI / 180

/** shared with the 2-D map: the terrain height grid generated for the mesh */
export const terrainGrid: { size: number; extent: number; heights: Float32Array | null; terrain: SiteTerrain | null } = { size: 0, extent: 0, heights: null, terrain: null }

/** measured terrain handed in by SurfaceExperience (null = procedural) */
export type DtmData = { meta: DtmMeta; heights: Float32Array; horizon?: HorizonGrid | null } | null

/** distance (m) at which the sky (stars, Earth, Sun) is drawn: beyond the farthest horizon terrain */
const SKY_R = 52000

/** the guide's speech bubble element (GuideBubble registers it); the scene pins it above the helmet every frame */
export const bubbleAnchor: { el: HTMLElement | null } = { el: null }
/** state of the guide's body language, for tests */
export const guidePose = { pointing: false, headYaw: 0, lookTarget: null as string | null, facingObject: false, visibleWhileInspecting: false }

/** rendered hardware groups by object id: the inspection camera frames their real bounds */
export const hardwareGroups = new Map<string, THREE.Group>()

/** arrow-key camera pitch limits (rad), the same range the mouse uses */
const PITCH_MIN = -1.25
const PITCH_MAX = 0.75
/** on-screen (touch) input, merged with the keyboard (central input manager) every frame */
export const virtualInput = { forward: 0, right: 0, run: false, jump: false }

export interface SceneEnv {
  site: SurfaceSite
  terrain: SiteTerrain
  colliders: Collider[]
  placed: { id: string; modelId: string | null; x: number; y: number; z: number; rotY: number; tilt?: number }[]
  sunDir: THREE.Vector3
  /** Earth's direction in the sky (worlds that show it), else null */
  earthDir: THREE.Vector3 | null
  planet: PlanetEnvironment
  sunUp: boolean
}

/** collider / anchor table key for an object, given the LM model variant in use */
export const modelKey = (modelId: string | null, lmModel: 'nasa' | 'reconstruction') => (modelId === 'lm-descent-stage' && lmModel === 'nasa' ? 'lm-descent-stage-nasa' : modelId ?? '')

function useEnv(site: SurfaceSite, simMs: number, lmModel: 'nasa' | 'reconstruction', dtm: DtmData): SceneEnv {
  const terrain = useMemo<SiteTerrain>(() => {
    const anchors = site.objects.map((o) => ({ x: o.x, z: o.z, dy: o.dy, flatR: o.objectId.includes('lm') ? 6 : o.objectId.includes('lrv') ? 3.5 : 2.5 }))
    if (dtm) {
      const t = new DtmTerrain(dtm.meta, dtm.heights, { seed: site.terrain.seed, halfExtentM: site.halfExtentM, anchors })
      t.horizon = dtm.horizon ?? null
      return t
    }
    return new Terrain({ seed: site.terrain.seed, halfExtentM: Math.min(site.halfExtentM, 400), anchors })
  }, [site, dtm])
  const planet = planetFor(site.bodyId)
  const earthDir = useMemo(() => {
    const e = planet.skyBodies.find((b) => b.id === 'earth')
    return e ? new THREE.Vector3(...e.direction(site.origin.latDeg, site.origin.lonEastDeg)) : null
  }, [site, planet])
  const placed = useMemo(
    () =>
      site.objects.map((o) => {
        const obj = OBJECT_BY_ID[o.objectId]
        let rotY = -o.headingDeg * D2R
        let tilt: number | undefined
        if (obj.model.id === 'lrrr' && earthDir) {
          // aimed at Earth (its purpose) — Earth's mean azimuth/elevation here; not a measured heading
          rotY = -azimuthDeg([earthDir.x, earthDir.y, earthDir.z]) * D2R
          tilt = (90 - elevationDeg([earthDir.x, earthDir.y, earthDir.z])) * D2R
        }
        return { id: o.objectId, modelId: obj.model.id, x: o.x, y: terrain.heightAt(o.x, o.z), z: o.z, rotY, tilt }
      }),
    [site, terrain, earthDir],
  )
  const colliders = useMemo(() => {
    const cs: Collider[] = terrain.rockColliders()
    if (placed[0]) { const L = landerSpot(placed[0]); cs.push({ x: L.x, z: L.z, r: 2.1, h: 4.6, id: 'expedition-lander' }) }
    for (const p of placed) {
      for (const [cx, cz, r, h] of COLLIDERS[modelKey(p.modelId, lmModel)] ?? (p.modelId ? [[0, 0, 0.5, 1]] : [])) {
        const c = Math.cos(p.rotY), s = Math.sin(p.rotY)
        cs.push({ x: p.x + cx * c + cz * s, z: p.z - cx * s + cz * c, r, h, id: p.id })
      }
    }
    return cs
  }, [terrain, placed, lmModel])
  const sun = useMemo(() => planet.sunDirection!(simMs, site.origin.latDeg, site.origin.lonEastDeg), [simMs, site, planet])
  return { site, terrain, colliders, placed, sunDir: new THREE.Vector3(...sun), earthDir, sunUp: sun[1] > 0, planet }
}

function TerrainMesh({ env, segments }: { env: SceneEnv; segments: number }) {
  const { geo, far } = useMemo(() => {
    const ext = env.site.halfExtentM * 1.2
    const g = new THREE.PlaneGeometry(ext * 2, ext * 2, segments, segments)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const n = segments + 1
    const heights = new Float32Array(n * n)
    for (let i = 0; i < pos.count; i++) {
      const h = env.terrain.heightAt(pos.getX(i), pos.getZ(i))
      pos.setY(i, h)
      heights[i] = h
    }
    g.computeVertexNormals()
    Object.assign(terrainGrid, { size: n, extent: ext, heights, terrain: env.terrain })
    // horizon ring: low-detail terrain that drops with the Moon's curvature (h = −d²/2R): the horizon is ~2.4 km away
    const R = SURFACE_BODIES[env.site.bodyId].radiusM
    const hz = env.terrain.kind === 'dtm' ? (env.terrain as DtmTerrain).horizon : null
    const farSize = hz ? 2 * hz.halfExtent : 9000
    const fg = new THREE.PlaneGeometry(farSize, farSize, hz ? 288 : 180, hz ? 288 : 180)
    fg.rotateX(-Math.PI / 2)
    const fp = fg.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), z = fp.getZ(i)
      const inside = Math.abs(x) < ext - 30 && Math.abs(z) < ext - 30
      const d2 = x * x + z * z
      fp.setY(i, (inside ? env.terrain.farHeightAt(x, z) - 3 : env.terrain.farHeightAt(x, z)) - d2 / (2 * R))
    }
    fg.computeVertexNormals()
    return { geo: g, far: fg }
  }, [env.terrain, env.site, segments])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: env.planet.ground.color, roughness: 0.98, metalness: 0, map: regolithMap(), bumpMap: regolithBump(), bumpScale: 1.2 })
    m.map!.repeat.set(90, 90)
    m.bumpMap!.repeat.set(260, 260)
    withPatchCutout(m)
    return m
  }, [env.planet])
  // matched to the near ground's effective albedo (base colour x average regolith texture) so there is no bright seam
  const farMat = useMemo(() => new THREE.MeshStandardMaterial({ color: env.planet.ground.farColor, roughness: 1, metalness: 0 }), [env.planet])
  return (
    <>
      <mesh geometry={geo} material={mat} receiveShadow />
      <mesh geometry={far} material={farMat} receiveShadow />
    </>
  )
}

/** fine terrain patch (1.5 m spacing) that follows the astronaut; the base mesh is cut out underneath it */
const PATCH = { half: 150, seg: 200, cx: 0, cz: 0 }
const patchUniforms = { uPatchC: { value: new THREE.Vector2(1e9, 1e9) }, uPatchHalf: { value: PATCH.half - 2 } }

function withPatchCutout(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, patchUniforms)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;\nuniform vec2 uPatchC;\nuniform float uPatchHalf;')
      .replace('void main() {', 'void main() {\n  if (abs(vWXZ.x - uPatchC.x) < uPatchHalf && abs(vWXZ.y - uPatchC.y) < uPatchHalf) discard;')
  }
  m.customProgramCacheKey = () => 'patch-cutout'
}

export function DetailPatch({ terrain, follow, color }: { terrain: SiteTerrain; follow: { current: { x: number; z: number } }; color: string }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(PATCH.half * 2, PATCH.half * 2, PATCH.seg, PATCH.seg)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0, map: regolithMap(), bumpMap: regolithBump(), bumpScale: 1.2 })
    return m
  }, [color])
  const rebuild = (cx: number, cz: number) => {
    const pos = geo.attributes.position as THREE.BufferAttribute
    const n = PATCH.seg + 1
    const step = (PATCH.half * 2) / PATCH.seg
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i
        const x = cx - PATCH.half + i * step, z = cz - PATCH.half + j * step
        pos.setXYZ(k, x - cx, terrain.heightAt(x, z), z - cz)
      }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    // world-aligned texture coordinates so the regolith texture doesn't swim when the patch moves
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + cx) / 8, (pos.getZ(k) + cz) / 8)
    uv.needsUpdate = true
    mesh.current?.position.set(cx, 0, cz)
    PATCH.cx = cx
    PATCH.cz = cz
    patchUniforms.uPatchC.value.set(cx, cz)
  }
  useEffect(() => {
    PATCH.cx = 1e9
    return () => {
      patchUniforms.uPatchC.value.set(1e9, 1e9)
    }
  }, [terrain])
  useFrame(() => {
    const p = follow.current
    if (Math.hypot(p.x - PATCH.cx, p.z - PATCH.cz) > 40) rebuild(Math.round(p.x / 10) * 10, Math.round(p.z / 10) * 10)
  })
  return <mesh ref={mesh} geometry={geo} material={mat} receiveShadow />
}

function Rocks({ terrain, color }: { terrain: SiteTerrain; color: string }) {
  const { geos, mat, groups } = useMemo(() => {
    const geos = [0, 1, 2].map((v) => {
      const g = new THREE.IcosahedronGeometry(1, 2)
      const r = mulberry32(100 + v)
      const p = g.attributes.position as THREE.BufferAttribute
      const offs = new Map<string, number>()
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
        if (!offs.has(key)) offs.set(key, 0.72 + r() * 0.5)
        const k = offs.get(key)!
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
      }
      g.computeVertexNormals()
      return g
    })
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.96, flatShading: true })
    const groups: SiteTerrain['rocks'][] = [[], [], []]
    terrain.rocks.forEach((rk) => groups[rk.seed % 3].push(rk))
    return { geos, mat, groups }
  }, [terrain, color])
  return (
    <>
      {groups.map((list, gi) => (
        <instancedMesh
          key={gi}
          args={[geos[gi], mat, list.length]}
          castShadow
          receiveShadow
          ref={(im) => {
            if (!im) return
            const o = new THREE.Object3D()
            list.forEach((rk, i) => {
              o.position.set(rk.x, terrain.heightAt(rk.x, rk.z) + rk.r * rk.squash * 0.35, rk.z)
              o.rotation.set(0, rk.rotY, 0)
              o.scale.set(rk.r, rk.r * rk.squash, rk.r * (0.8 + (rk.seed % 7) / 20))
              o.updateMatrix()
              im.setMatrixAt(i, o.matrix)
            })
            im.instanceMatrix.needsUpdate = true
          }}
        />
      ))}
    </>
  )
}

function Sky({ env }: { env: SceneEnv }) {
  const stars = useMemo(() => {
    const r = mulberry32(42)
    const n = 2600
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, t = r() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      p.set([s * Math.cos(t) * SKY_R, u * SKY_R, s * Math.sin(t) * SKY_R], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [])
  const earthTex = useMemo(() => {
    const t = new THREE.TextureLoader().load('/assets/astronomy/textures/earth_day_2k.jpg')
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const ep = env.earthDir ? env.earthDir.clone().multiplyScalar(SKY_R * 0.96) : null
  const sp = env.sunDir.clone().multiplyScalar(SKY_R * 0.98)
  // Earth's angular diameter from the Moon ≈ 2 × atan(6371 / 384400) ≈ 1.9°
  const earthR = SKY_R * 0.96 * Math.tan(((6371 / 384400) as number))
  return (
    <group>
      {/* daylight on the surface overwhelms faint stars (as in the Apollo photographs); they appear at night */}
      <points geometry={stars}>
        <pointsMaterial color="#ffffff" size={1.6} sizeAttenuation={false} transparent opacity={env.sunUp ? env.planet.sky.starOpacityDay : env.planet.sky.starOpacityNight} depthWrite={false} />
      </points>
      {ep && (
        <mesh position={ep} rotation={[0.4, 2.2, 0]}>
          <sphereGeometry args={[earthR, 48, 32]} />
          <meshStandardMaterial map={earthTex} roughness={0.8} metalness={0} />
        </mesh>
      )}
      {env.sunUp && (
        <mesh position={sp}>
          <sphereGeometry args={[SKY_R * 0.98 * Math.tan(0.267 * D2R), 24, 16]} />
          <meshBasicMaterial color="#fffaf0" toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** dust kicked up by the boots: ballistic, no air drag (the Moon has no atmosphere), falls back under local gravity */
class DustSystem {
  n = 400
  pos = new Float32Array(this.n * 3)
  vel = new Float32Array(this.n * 3)
  life = new Float32Array(this.n)
  next = 0
  geo = new THREE.BufferGeometry()
  constructor() {
    this.pos.fill(-9999)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
  }
  emit(x: number, y: number, z: number, dirX: number, dirZ: number, speed: number, rnd: () => number) {
    for (let k = 0; k < 7; k++) {
      const i = this.next++ % this.n
      this.pos.set([x + (rnd() - 0.5) * 0.15, y + 0.03, z + (rnd() - 0.5) * 0.15], i * 3)
      const s = 0.25 + rnd() * 0.5 + speed * 0.25
      this.vel.set([dirX * s + (rnd() - 0.5) * 0.5, 0.35 + rnd() * 0.7, dirZ * s + (rnd() - 0.5) * 0.5], i * 3)
      this.life[i] = 1
    }
  }
  step(dt: number, g: number, ground: (x: number, z: number) => number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue
      const j = i * 3
      this.vel[j + 1] -= g * dt
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt
      if (this.pos[j + 1] < ground(this.pos[j], this.pos[j + 2])) {
        this.life[i] = 0
        this.pos[j + 1] = -9999
      }
    }
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }
}

/** where the explorer's expedition lander stands: beside the spawn point (clear of the third-person camera behind the
 *  astronaut), its ramp ending at the spawn point */
export function landerSpot(lm: { x: number; z: number }) {
  const sx = lm.x - 14, sz = lm.z + 10
  const dx = lm.x - sx, dz = lm.z - sz, d = Math.hypot(dx, dz)
  const ux = dx / d, uz = dz / d
  // to the astronaut's left (looking at the LM), 5.6 m away; the ramp (+Z of the model) points back at the spawn
  const lx = -uz, lz = ux
  const x = sx + lx * 5.6, z = sz + lz * 5.6
  return { x, z, rotY: Math.atan2(-lx, -lz), ux, uz, lx, lz }
}

/** the parked / landing / lifting expedition lander (conceptual) on the measured terrain */
function SurfaceLander({ env, state }: { env: SceneEnv; state: { current: { h: number; thrust: number; ramp: number } } }) {
  const spot = useMemo(() => landerSpot(env.placed[0]), [env])
  const g = useRef<THREE.Group>(null!)
  const obj = useRef<Obj>({ key: 'lander', model: 'exp-lander', pos: [0, 0, 0], fwd: [0, 1, 0], p: { legs: 1, ramp: 1 } })
  useFrame(() => {
    const s = state.current
    obj.current.thrust = s.thrust
    obj.current.p = { legs: 1, ramp: s.ramp }
    if (g.current) g.current.position.set(spot.x, env.terrain.heightAt(spot.x, spot.z) - 0.05 + s.h, spot.z)
  })
  return <group ref={g} rotation={[0, spot.rotY, 0]}><ExpLander get={() => obj.current} /></group>
}

function Player({ env }: { env: SceneEnv }) {
  const { camera, gl } = useThree()
  const gl_ = gl
  const quality = useStore((s) => s.quality)
  const astro = useRef<AstronautHandle>(null)
  const g = SURFACE_BODIES[env.site.bodyId].gravity.value!
  const params = useMemo(() => paramsForGravity(g, env.site.halfExtentM), [g, env.site])
  const ground = env.terrain
  const lm = env.placed[0]
  const followRef = useRef({ x: 0, z: 0 })
  const start = useMemo(() => ({ x: lm.x - 14, z: lm.z + 10 }), [lm])
  const ch = useRef<CharacterState>(newCharacter(start.x, start.z, ground, Math.atan2(-(lm.x - start.x), -(lm.z - start.z))))
  const c0x = () => ch.current.pos[0]
  const c0z = () => ch.current.pos[2]
  const frame = useRef({ id: '', t: 0, sphere: new THREE.Sphere(), box: new THREE.Box3() })
  const safe = useRef<SafeArea>({ top: 0, bottom: 0 })
  const safeT = useRef(0)
  const look = useRef({ inspZoom: 1, yaw: ch.current.yaw, pitch: -0.22, dist: 4.4, inspYaw: 0.6, inspPitch: -0.35, inspDist: 7 })
  const camPos = useRef(new THREE.Vector3())
  const camTarget = useRef(new THREE.Vector3())
  const t0 = useRef(performance.now())
  const spot = useMemo(() => landerSpot(lm), [lm])
  const landerState = useRef({ h: 0, thrust: 0, ramp: 1 })
  const ascentFired = useRef(false)
  /** historical replay: descent camera start time (null = not replaying the descent) */
  const replayT0 = useRef<number | null>(null)
  /** snap the camera on the next frame (exact restore, no glide) */
  const snapCam = useRef(false)
  const lastHud = useRef(0)
  const lastPhase = useRef(0)
  const dust = useMemo(() => new DustSystem(), [])
  const prints = useRef<THREE.InstancedMesh>(null)
  const printIdx = useRef(0)
  const rnd = useMemo(() => mulberry32(77), [])
  const sunLight = useRef<THREE.DirectionalLight>(null)
  const bannerTimer = useRef<number | null>(null)
  const lastPanel = useRef<string | null>(null)
  /** soft flood light from the inspection camera (a presentation aid while inspecting, like a photographer's fill) */
  const inspectLight = useRef<THREE.PointLight>(null)
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  // debug/test hooks
  useEffect(() => {
    surfaceControl.snapshot = () => ({ pos: [...ch.current.pos] as [number, number, number], yaw: ch.current.yaw, camYaw: look.current.yaw, camPitch: look.current.pitch, camDist: look.current.dist, camMode: useSurface.getState().camMode })
    surfaceControl.restore = (p) => {
      ch.current = { ...ch.current, pos: [...p.pos] as [number, number, number], vel: [0, 0, 0], yaw: p.yaw }
      look.current.yaw = p.camYaw
      look.current.pitch = p.camPitch
      look.current.dist = p.camDist
      replayT0.current = null
      snapCam.current = true
      if (useSurface.getState().camMode !== p.camMode) useSurface.getState().set({ camMode: p.camMode })
    }
    surfaceControl.replayDescent = () => {
      replayT0.current = performance.now()
    }
    surfaceDebug.teleport = (x, z) => {
      ch.current = { ...ch.current, pos: [x, ground.heightAt(x, z), z], vel: [0, 0, 0] }
    }
    surfaceDebug.character = () => ({ ...ch.current, camYaw: look.current.yaw, camPitch: look.current.pitch })
    surfaceDebug.camera = () => ({ pos: camera.position.toArray(), mode: useSurface.getState().camMode })
    // third-person framing check: the astronaut's projected bounds (NDC) and their share of the screen height
    surfaceDebug.astronautScreen = () => {
      const a = astro.current
      if (!a || !a.root.visible) return { visible: false, heightFrac: 0 }
      const b = new THREE.Box3().setFromObject(a.root)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const v = new THREE.Vector3(x, y, z).project(camera)
        if (v.z > 1) behind = true
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
      }
      const r = (n: number) => Math.round(n * 1000) / 1000
      const visible = !behind && x1 > -1 && x0 < 1 && y1 > -1 && y0 < 1
      return { visible, heightFrac: r((Math.min(y1, 1) - Math.max(y0, -1)) / 2), ndc: [r(x0), r(y0), r(x1), r(y1)] }
    }
    surfaceDebug.guide = () => ({ ...guidePose, bubbleDocked: bubbleAnchor.el?.dataset.docked ?? null })
    surfaceDebug.inspectFrame = () => {
      const S = useSurface.getState()
      if (!S.panel || S.component || frame.current.id !== S.panel.objectId) return null
      const b = frame.current.box
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const v = new THREE.Vector3(x, y, z).project(camera)
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
      }
      const r = (n: number) => Math.round(n * 100) / 100
      return { inside: x0 >= -1.02 && x1 <= 1.02 && y0 >= -1.02 && y1 <= 1.02, ndc: [r(x0), r(y0), r(x1), r(y1)], widthFraction: r((x1 - x0) / 2), heightFraction: r((y1 - y0) / 2) }
    }
    surfaceDebug.terrain = () => ({ daylightMs: env.site.daylight.ms, kind: ground.kind, product: ground.kind === 'dtm' ? (ground as DtmTerrain).meta.source.product : null, horizonReliefM: ground.kind === 'dtm' ? (ground as DtmTerrain).horizon?.meta.reliefM ?? null : null, objects: env.placed.map((p) => ({ id: p.id, x: p.x, z: p.z, y: p.y, model: p.modelId })) })
    return () => {
      surfaceControl.snapshot = surfaceControl.restore = surfaceControl.replayDescent = undefined
      surfaceDebug.teleport = undefined
      surfaceDebug.character = undefined
      surfaceDebug.camera = undefined
      surfaceDebug.astronautScreen = undefined
      surfaceDebug.guide = undefined
      surfaceDebug.inspectFrame = undefined
      surfaceDebug.terrain = undefined
    }
  }, [ground, camera, env.placed])

  // input: keyboard actions come from the central input manager (modes PLANETARY_EXPLORATION / HARDWARE_INSPECTION /
  // UI_INTERACTION); pointer lock / drag look and wheel zoom stay here because they belong to this canvas
  useEffect(() => {
    const el = gl.domElement
    const releaseLock = () => { if (document.pointerLockElement) document.exitPointerLock() }
    const back = () => {
      const S = useSurface.getState()
      if (S.panel) S.set({ panel: null, component: null, panelCollapsed: false })
      else if (S.mapOpen) S.set({ mapOpen: false })
      else if (S.helpOpen) S.set({ helpOpen: false })
      else {
        S.set({ paused: !S.paused })
        releaseLock()
      }
    }
    const WALK: InputMode = 'PLANETARY_EXPLORATION'
    const offs = [
      input.on('back', back, WALK),
      input.on('back', back, 'HARDWARE_INSPECTION'),
      input.on('back', back, 'UI_INTERACTION'),
      input.on('map', () => {
        useSurface.getState().set({ mapOpen: true })
        releaseLock()
      }, WALK),
      input.on('interact', () => {
        const S = useSurface.getState()
        if (!S.nearbyId) return
        releaseLock()
        S.set({ panel: { objectId: S.nearbyId, tab: 'inspect' }, component: null, banner: null })
      }, WALK),
      input.on('camera', () => {
        const S = useSurface.getState()
        S.set({ camMode: S.camMode === 'third' ? 'first' : 'third' }) // the astronaut does not move: only the view
      }, WALK),
      input.on('help', () => {
        useSurface.getState().set({ helpOpen: true })
        releaseLock()
      }, WALK),
    ]
    let drag: { x: number; y: number } | null = null
    const pd = (e: PointerEvent) => {
      const S = useSurface.getState()
      drag = { x: e.clientX, y: e.clientY }
      if (input.settings.mouseLook && !S.panel && !S.mapOpen && !S.paused && !S.intro && e.pointerType === 'mouse' && !document.pointerLockElement) {
        try {
          const p = el.requestPointerLock() as unknown as Promise<void> | undefined
          p?.catch?.(() => {})
        } catch {
          /* pointer lock unavailable (embedded / automation): drag-to-look still works */
        }
      }
    }
    const turn = (dx: number, dy: number) => {
      const S = useSurface.getState()
      const L = look.current
      if (S.panel) {
        L.inspYaw -= dx * 0.005
        L.inspPitch = THREE.MathUtils.clamp(L.inspPitch - dy * 0.004, -1.2, 0.35)
      } else if (input.settings.mouseLook) {
        L.yaw -= dx * 0.0024
        L.pitch = THREE.MathUtils.clamp(L.pitch - dy * 0.0022, -1.25, 0.75)
      }
    }
    const pm = (e: PointerEvent) => {
      if (document.pointerLockElement === el) return turn(e.movementX, e.movementY)
      if (drag && e.buttons) {
        turn(e.clientX - drag.x, e.clientY - drag.y)
        drag = { x: e.clientX, y: e.clientY }
      }
    }
    const pu = () => (drag = null)
    const wh = (e: WheelEvent) => {
      e.preventDefault()
      const L = look.current
      if (useSurface.getState().panel) L.inspZoom = THREE.MathUtils.clamp(L.inspZoom * (1 + Math.sign(e.deltaY) * 0.1), 0.45, 2.5)
      else L.dist = THREE.MathUtils.clamp(L.dist * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 12)
    }
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    el.addEventListener('wheel', wh, { passive: false })
    return () => {
      offs.forEach((off) => off())
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      el.removeEventListener('wheel', wh)
      input.releaseAll()
      releaseLock()
    }
  }, [gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const S = useSurface.getState()
    const L = look.current
    const frozen = S.paused || S.mapOpen || !!S.panel || S.intro || !!S.replay
    // arrow keys TURN THE CAMERA (never move the astronaut): right = turn right, up = look up, at the user's speed.
    // While inspecting they orbit the inspection view instead. Mouse look uses the same yaw / pitch and limits.
    const lk = input.look()
    const turn = input.settings.lookSpeed * dt
    if (S.panel) {
      L.inspYaw -= lk.x * turn
      L.inspPitch = THREE.MathUtils.clamp(L.inspPitch + lk.y * turn, -1.2, 0.35)
    } else if (!frozen || (S.replay && replayT0.current === null)) {
      L.yaw -= lk.x * turn
      L.pitch = THREE.MathUtils.clamp(L.pitch + lk.y * turn, PITCH_MIN, PITCH_MAX)
    }
    // W A S D move relative to the camera's horizontal heading (camYaw); the manager normalises diagonals
    const mv = input.move()
    const inp = frozen
      ? { forward: 0, right: 0, run: false, jump: false, camYaw: L.yaw }
      : {
          forward: THREE.MathUtils.clamp(mv.y + virtualInput.forward, -1, 1),
          right: THREE.MathUtils.clamp(mv.x + virtualInput.right, -1, 1),
          run: input.isHeld('sprint') || virtualInput.run,
          jump: input.isHeld('jump') || virtualInput.jump,
          camYaw: L.yaw,
        }
    if (!S.paused) ch.current = stepCharacter(ch.current, inp, params, ground, env.colliders, dt)
    const c = ch.current
    followRef.current.x = c.pos[0]
    followRef.current.z = c.pos[2]
    const speed = Math.hypot(c.vel[0], c.vel[2])

    // inspection opens on the object's front (LRRR: its Earth-facing array; LM: the ladder side)
    const pid = S.panel?.objectId ?? null
    if (pid !== lastPanel.current) {
      const was = lastPanel.current
      lastPanel.current = pid
      const p = env.placed.find((x) => x.id === pid)
      if (p) {
        // camera behind and beside the astronaut, looking past them at the object: the astronaut is the guide
        L.inspYaw = Math.atan2(c0x() - p.x, c0z() - p.z) + 0.5
        L.inspPitch = p.modelId === 'lrrr' ? -0.55 : -0.32
        L.inspZoom = 1
        frame.current.id = ''
        if (S.panelCollapsed) S.set({ panelCollapsed: false })
        useGuide.getState().say(inspectHint(p.id))
        useNarrator.getState().load(p.id, 'short')
      } else if (was) useNarrator.getState().stop()
    }

    // astronaut pose: during inspection the astronaut stays in view, faces the object and points at the focused part
    const a = astro.current
    const gl = useGuide.getState().line
    const talking = gl && gl.kind !== 'hint' ? 1 : 0
    let headYaw = 0
    let pointPitch: number | null = null
    if (S.panel) {
      const p = env.placed.find((x) => x.id === S.panel!.objectId)
      if (p) {
        const want = Math.atan2(-(p.x - c.pos[0]), -(p.z - c.pos[2]))
        const dyaw = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw))
        ch.current = { ...ch.current, yaw: c.yaw + Math.sign(dyaw) * Math.min(Math.abs(dyaw), 4 * dt) }
        const anchors = COMPONENT_ANCHORS[modelKey(p.modelId, S.lmModel)] ?? {}
        const local = S.component && anchors[S.component] ? anchors[S.component] : [0, p.modelId === 'lm-descent-stage' ? 1.6 : 0.5, 0]
        const v = new THREE.Vector3(...(local as [number, number, number])).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY)
        const tx = p.x + v.x, ty = p.y + v.y, tz = p.z + v.z
        pointPitch = Math.atan2(ty - (c.pos[1] + 1.45), Math.hypot(tx - c.pos[0], tz - c.pos[2]))
      }
    } else if (S.nearbyId) {
      // walking past hardware: the helmet turns toward it
      const o = env.placed.find((x) => x.id === S.nearbyId)
      if (o) {
        const want = Math.atan2(-(o.x - c.pos[0]), -(o.z - c.pos[2]))
        const rel = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw))
        // only glance at things roughly in front (a suited astronaut can't look over the shoulder)
        if (Math.abs(rel) < 1.7) {
          headYaw = THREE.MathUtils.clamp(rel, -1.1, 1.1)
          guidePose.lookTarget = o.id
        } else guidePose.lookTarget = null
      }
    } else guidePose.lookTarget = null
    if (S.panel) guidePose.lookTarget = S.panel.objectId
    guidePose.pointing = pointPitch !== null
    guidePose.headYaw = headYaw
    guidePose.facingObject = !!S.panel
    if (a) {
      a.root.visible = true
      guidePose.visibleWhileInspecting = !!S.panel && a.root.visible
      a.root.position.set(c.pos[0], c.pos[1], c.pos[2])
      a.root.rotation.y = c.yaw
      a.pose(gaitPose(c.odometer, speed, g, !c.grounded), S.camMode === 'first' ? L.pitch * 0.6 : pointPitch !== null ? pointPitch * 0.6 : 0, { headYaw, pointPitch, talk: talking })
    }

    // footprints + dust at each foot plant (gait half-cycle)
    const step = 0.42 + 0.3 * Math.min(speed, 2.5)
    const ph = Math.floor(c.odometer / step)
    if (ph !== lastPhase.current && c.grounded && speed > 0.2) {
      lastPhase.current = ph
      const side = ph % 2 ? 1 : -1
      const f = forwardOf(c.yaw)
      const fx = c.pos[0] + f[1] * -0.115 * side, fz = c.pos[2] - f[0] * -0.115 * side
      const pm = prints.current
      if (pm) {
        const o = new THREE.Object3D()
        o.position.set(fx, ground.heightAt(fx, fz) + 0.012, fz)
        o.rotation.set(-Math.PI / 2, 0, c.yaw)
        o.updateMatrix()
        pm.setMatrixAt(printIdx.current++ % pm.count, o.matrix)
        pm.instanceMatrix.needsUpdate = true
        pm.count = Math.max(pm.count, 1)
      }
      if (quality !== 'performance' && !reduced) dust.emit(fx, ground.heightAt(fx, fz), fz, -f[0], -f[1], speed, rnd)
    }
    dust.step(dt, g, (x, z) => ground.heightAt(x, z))

    // sun shadow camera follows the astronaut
    if (sunLight.current) {
      sunLight.current.position.set(c.pos[0] + env.sunDir.x * 80, c.pos[1] + env.sunDir.y * 80, c.pos[2] + env.sunDir.z * 80)
      sunLight.current.target.position.set(c.pos[0], c.pos[1], c.pos[2])
      sunLight.current.target.updateMatrixWorld()
    }

    // camera
    const target = new THREE.Vector3()
    const desired = new THREE.Vector3()
    if (S.panel) {
      const p = env.placed.find((x) => x.id === S.panel!.objectId)!
      const anchors = COMPONENT_ANCHORS[modelKey(p.modelId, S.lmModel)] ?? {}
      // real bounds of the rendered object (re-measured ~3x/s: the NASA model may still be loading)
      const grp = hardwareGroups.get(p.id)
      const tnow = performance.now()
      if (grp && (frame.current.id !== p.id || tnow - frame.current.t > 300)) {
        const box = new THREE.Box3().setFromObject(grp)
        if (!box.isEmpty()) {
          frame.current.box.copy(box)
          box.getBoundingSphere(frame.current.sphere)
          frame.current.id = p.id
          frame.current.t = tnow
        }
      }
      const pc = camera as THREE.PerspectiveCamera
      let dist: number
      if (S.component && anchors[S.component]) {
        const v = new THREE.Vector3(...anchors[S.component]).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY)
        target.set(p.x + v.x, p.y + v.y, p.z + v.z)
        // part close-ups keep their established distances, scaled by the zoom factor
        dist = (p.modelId === 'lm-descent-stage' ? 5 : p.modelId === 'lrv' ? 3 : 2.2) * L.inspZoom
      } else {
        const sph = frame.current.id === p.id ? frame.current.sphere : new THREE.Sphere(new THREE.Vector3(p.x, p.y + 1, p.z), 2)
        target.copy(sph.center)
        // whole object: fit the bounding sphere into the narrower of the vertical / horizontal FOV of the VISIBLE viewport
        const vfov = pc.fov * D2R
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * pc.aspect)
        const fit = (sph.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08
        // stay behind the guide when that keeps the object a sensible size
        const guideDist = Math.hypot(c.pos[0] - p.x, c.pos[2] - p.z) + 2.6
        dist = Math.max(fit, Math.min(guideDist, fit * 1.3)) * L.inspZoom
      }
      desired.set(target.x + Math.sin(L.inspYaw) * Math.cos(L.inspPitch) * dist, target.y - Math.sin(L.inspPitch) * dist, target.z + Math.cos(L.inspYaw) * Math.cos(L.inspPitch) * dist)
      const gyi = ground.heightAt(desired.x, desired.z) + 0.4
      if (desired.y < gyi) desired.y = gyi
    } else if (S.camMode === 'first') {
      const fwd = forwardOf(L.yaw)
      target.set(c.pos[0] + fwd[0] * 10 * Math.cos(L.pitch), c.pos[1] + 1.65 + Math.sin(L.pitch) * 10, c.pos[2] + fwd[1] * 10 * Math.cos(L.pitch))
      desired.set(c.pos[0] + fwd[0] * 0.12, c.pos[1] + 1.65 + (a ? a.root.children[0].position.y - 0.98 : 0), c.pos[2] + fwd[1] * 0.12)
    } else {
      target.set(c.pos[0], c.pos[1] + 1.5, c.pos[2])
      const fwd = forwardOf(L.yaw)
      desired.set(target.x - fwd[0] * Math.cos(L.pitch) * L.dist, target.y - Math.sin(L.pitch) * L.dist, target.z - fwd[1] * Math.cos(L.pitch) * L.dist)
      const gy = ground.heightAt(desired.x, desired.z) + 0.35
      if (desired.y < gy) desired.y = gy
    }
    // the expedition lander: landing on arrival, liftoff on "Return to orbit" (conceptual vehicle, measured terrain)
    const LS = S.lander
    const nowL = performance.now()
    const lg = env.terrain.heightAt(spot.x, spot.z)
    const lst = landerState.current
    let astroHidden = false
    if (LS.phase === 'descent') {
      const el = nowL - LS.t0
      const tau = Math.min(1, el / LANDER_T.descent)
      lst.h = tau < 1 ? 420 * Math.pow(1 - tau, 1.8) : 0
      lst.thrust = tau < 1 ? 1 : 0
      lst.ramp = Math.min(1, Math.max(0, (el - LANDER_T.descent - 400) / LANDER_T.ramp))
      astroHidden = el < LANDER_T.descent + LANDER_T.egress
      if (el > LANDER_T.descent + LANDER_T.settle) S.set({ intro: false, lander: { phase: 'parked', t0: 0 } })
    } else if (LS.phase === 'ascent') {
      const el = (nowL - LS.t0) / 1000
      lst.ramp = Math.max(0, 1 - el / 1.5)
      lst.h = el > 2 ? 0.5 * 3 * (el - 2) * (el - 2) : 0
      lst.thrust = el > 1.6 ? 1 : 0
      astroHidden = true
      if (el > 2 + LANDER_T.ascentClimb / 1000 && !ascentFired.current) { ascentFired.current = true; landerHooks.onAscentDone?.() }
    } else { lst.h = 0; lst.thrust = 0; lst.ramp = 1; ascentFired.current = false }
    if (astro.current) astro.current.root.visible = !astroHidden
    const landerTarget = new THREE.Vector3(spot.x, lg + lst.h + 2.4, spot.z)
    // an observer back from the landing point, framing the lander against the ground (the LM in view behind it)
    const groundSpot = new THREE.Vector3(spot.x, lg + 1.5, spot.z)
    const obsAt = (hgt: number) => new THREE.Vector3(spot.x - spot.ux * 70 - spot.lx * 40, lg + 14 + hgt * 0.35, spot.z - spot.uz * 70 - spot.lz * 40)
    const lookAtLander = () => groundSpot.clone().lerp(landerTarget, Math.min(1, 0.35 + lst.h / 900))
    if (LS.phase === 'descent') {
      // ... then a glide into the normal third-person view at the foot of the ramp
      const w = Math.min(1, Math.max(0, (nowL - LS.t0 - LANDER_T.descent - 600) / 3200))
      const e = w * w * (3 - 2 * w)
      camPos.current.copy(obsAt(lst.h).lerp(desired, e))
      camTarget.current.copy(lookAtLander().lerp(target, e))
    } else if (LS.phase === 'ascent') {
      const k = 1 - Math.exp(-dt * 1.6)
      camPos.current.lerp(obsAt(lst.h), k)
      camTarget.current.lerp(lookAtLander(), k)
    } else if (S.intro) {
      const t = Math.min(1, (performance.now() - t0.current) / (reduced ? 1 : 4200))
      const e = 1 - Math.pow(1 - t, 3)
      const high = new THREE.Vector3(lm.x + 60, lm.y + 260, lm.z + 120)
      camPos.current.copy(high.lerp(desired, e))
      camTarget.current.copy(new THREE.Vector3(lm.x, lm.y, lm.z).lerp(target, e))
      if (t >= 1) S.set({ intro: false })
    } else if (replayT0.current !== null) {
      // historical replay of the descent: the same illustrative camera move onto the measured LM position
      const t = Math.min(1, (performance.now() - replayT0.current) / (reduced ? 1 : 6000))
      const e = 1 - Math.pow(1 - t, 3)
      const high = new THREE.Vector3(lm.x + 60, lm.y + 260, lm.z + 120)
      camPos.current.copy(high.lerp(desired, e))
      camTarget.current.copy(new THREE.Vector3(lm.x, lm.y, lm.z).lerp(target, e))
      if (t >= 1) replayT0.current = null
    } else {
      const k = snapCam.current || (S.camMode === 'first' && !S.panel) ? 1 : 1 - Math.exp(-dt * 9)
      snapCam.current = false
      camPos.current.lerp(desired, k)
      camTarget.current.lerp(target, k)
    }
    camera.position.copy(camPos.current)
    camera.lookAt(camTarget.current)
    const bub = bubbleAnchor.el
    if (bub) {
      camera.updateMatrixWorld()
      const r = gl_.domElement.getBoundingClientRect()
      const tb = performance.now()
      if (tb - safeT.current > 200) {
        safe.current = measureSafeArea(r)
        safeT.current = tb
      }
      const hp = new THREE.Vector3(c.pos[0], c.pos[1] + 2.1, c.pos[2]).project(camera)
      const pinned = S.camMode !== 'first' && hp.z < 1 && Math.abs(hp.x) <= 1 && Math.abs(hp.y) <= 1
      const pl = placeBubble(((hp.x + 1) / 2) * r.width, ((1 - hp.y) / 2) * r.height, bub.offsetWidth, bub.offsetHeight, r.width, r.height, safe.current, pinned)
      bub.style.transform = `translate(${Math.round(pl.x)}px, ${Math.round(pl.y)}px)`
      bub.dataset.docked = pl.docked ? 'true' : 'false'
    }
    if (inspectLight.current) {
      inspectLight.current.position.copy(camPos.current)
      inspectLight.current.intensity = S.panel ? 6 : 0
    }

    // discovery + interaction (5 Hz)
    const now = performance.now()
    if (now - lastHud.current > 200) {
      lastHud.current = now
      let nearby: string | null = null, best = Infinity
      const newly: string[] = []
      for (const o of env.site.objects) {
        const d = Math.hypot(o.x - c.pos[0], o.z - c.pos[2])
        if (!S.panel && d < Math.max(45, o.noticeM * 2.5) && d >= o.noticeM) announceOnce(o.objectId, 'approach', approachLine(o.objectId, d, bearingDeg(c.pos[0], c.pos[2], o.x, o.z)))
        if (d < o.noticeM && !S.discovered.includes(o.objectId)) {
          newly.push(o.objectId)
          announceOnce(o.objectId, 'discover', discoverLine(o.objectId))
        }
        if (d < o.interactM + 2.5 && d < best) {
          best = d
          nearby = o.objectId
        }
      }
      const patch: Partial<typeof S> = {
        player: { x: c.pos[0], z: c.pos[2], yaw: c.yaw, speed, grounded: c.grounded, camYaw: L.yaw },
      }
      if (nearby !== S.nearbyId) patch.nearbyId = nearby
      if (newly.length) {
        patch.discovered = [...S.discovered, ...newly]
        patch.banner = newly[0]
        if (bannerTimer.current) clearTimeout(bannerTimer.current)
        bannerTimer.current = window.setTimeout(() => useSurface.getState().set({ banner: null }), 5000)
      }
      S.set(patch)
    }
  })

  const printGeo = useMemo(() => new THREE.PlaneGeometry(0.15, 0.32), [])
  const printMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4d4b47', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), [])

  return (
    <>
      <directionalLight
        ref={sunLight}
        intensity={env.sunUp ? 3.4 : 0}
        color="#fff6ea"
        castShadow={env.sunUp}
        shadow-mapSize={[quality === 'performance' ? 1024 : 2048, quality === 'performance' ? 1024 : 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <pointLight ref={inspectLight} intensity={0} distance={30} decay={1.2} color="#e8eeff" />
      <DetailPatch terrain={env.terrain} follow={followRef} color={env.planet.ground.color} />
      <Astronaut ref={astro} visibleBody={useSurface((s) => s.camMode) !== 'first'} />
      <SurfaceLander env={env} state={landerState} />
      <instancedMesh ref={prints} args={[printGeo, printMat, 500]} receiveShadow frustumCulled={false} />
      <points geometry={dust.geo} frustumCulled={false}>
        <pointsMaterial color="#b7b4ad" size={0.035} transparent opacity={0.8} depthWrite={false} />
      </points>
    </>
  )
}

function Hardware({ env }: { env: SceneEnv }) {
  const panel = useSurface((s) => s.panel)
  const comp = useSurface((s) => s.component)
  const lmModel = useSurface((s) => s.lmModel)
  return (
    <>
      {env.placed.map((p) => (
        <group
          key={p.id}
          position={[p.x, p.y, p.z]}
          rotation={[0, p.rotY, 0]}
          ref={(g) => {
            if (g) hardwareGroups.set(p.id, g)
            else hardwareGroups.delete(p.id)
          }}
        >
          {p.modelId ? <HardwareModel modelId={p.modelId} highlight={panel?.objectId === p.id ? comp : null} tilt={p.tilt} variant={lmModel} /> : <PositionMarker />}
        </group>
      ))}
    </>
  )
}

function Waypoint({ env }: { env: SceneEnv }) {
  const id = useSurface((s) => s.waypointId)
  const o = env.site.objects.find((x) => x.objectId === id)
  if (!o) return null
  const y = env.terrain.heightAt(o.x, o.z)
  return (
    <mesh position={[o.x, y + 40, o.z]}>
      <cylinderGeometry args={[0.35, 0.35, 80, 12, 1, true]} />
      <meshBasicMaterial color="#58b6ff" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function SurfaceScene({ site, dtm }: { site: SurfaceSite; dtm: DtmData }) {
  const simMs = useStore((s) => s.simMs)
  const quality = useStore((s) => s.quality)
  const lmModel = useSurface((s) => s.lmModel)
  const env = useEnv(site, simMs, lmModel, dtm)
  const segments = quality === 'performance' ? 260 : quality === 'balanced' ? 400 : 520
  return (
    <Canvas
      shadows="soft"
      gl={{ antialias: quality !== 'performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, powerPreference: 'high-performance', logarithmicDepthBuffer: true }}
      dpr={quality === 'performance' ? 1 : quality === 'balanced' ? [1, 1.5] : [1, 2]}
      camera={{ fov: 62, near: 0.05, far: 60000, position: [0, 200, 200] }}
      data-testid="surface-canvas"
    >
      <color attach="background" args={[env.planet.sky.background]} />
      {/* no sky light on an airless body: only a faint bounce from the grey regolith fills the shadows */}
      <hemisphereLight args={['#000000', env.planet.ground.bounce, env.sunUp ? 0.95 : 0.03]} />
      {!env.sunUp && env.planet.nightFill.kind === 'earthshine' && env.earthDir && (
        <directionalLight position={env.earthDir.clone().multiplyScalar(100)} intensity={env.planet.nightFill.intensity} color={env.planet.nightFill.color} />
      )}
      <ambientLight intensity={0.03} />
      <Sky env={env} />
      <TerrainMesh env={env} segments={segments} />
      <Rocks terrain={env.terrain} color={env.planet.ground.rockColor} />
      <Hardware env={env} />
      <Waypoint env={env} />
      <Player env={env} />
    </Canvas>
  )
}

export { elevationDeg, azimuthDeg }
