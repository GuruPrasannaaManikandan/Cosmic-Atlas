import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store/store'
import { OBJECT_BY_ID } from '../missions'
import { SurfaceSite, SURFACE_BODIES } from './sites'
import { Terrain, DtmTerrain, SiteTerrain, Collider, mulberry32, DtmMeta } from './terrain'
import { stepCharacter, newCharacter, paramsForGravity, gaitPose, CharacterState, forwardOf } from './controller'
import { sunDirectionAtLunarSite, meanEarthDirectionAtLunarSite, elevationDeg, azimuthDeg } from './lighting'
import { useSurface, surfaceDebug } from './surfaceState'
import { Astronaut, AstronautHandle } from './models/Astronaut'
import { HardwareModel, COLLIDERS, COMPONENT_ANCHORS, PositionMarker } from './models/Hardware'
import { regolithMap, regolithBump } from './models/materials'

const D2R = Math.PI / 180

/** shared with the 2-D map: the terrain height grid generated for the mesh */
export const terrainGrid: { size: number; extent: number; heights: Float32Array | null; terrain: SiteTerrain | null } = { size: 0, extent: 0, heights: null, terrain: null }

/** measured terrain handed in by SurfaceExperience (null = procedural) */
export type DtmData = { meta: DtmMeta; heights: Float32Array } | null

/** keyboard state, owned by the scene */
const keys = new Set<string>()
/** on-screen (touch) input, merged with the keyboard every frame */
export const virtualInput = { forward: 0, right: 0, run: false, jump: false }

export interface SceneEnv {
  site: SurfaceSite
  terrain: SiteTerrain
  colliders: Collider[]
  placed: { id: string; modelId: string | null; x: number; y: number; z: number; rotY: number; tilt?: number }[]
  sunDir: THREE.Vector3
  earthDir: THREE.Vector3
  sunUp: boolean
}

/** collider / anchor table key for an object, given the LM model variant in use */
export const modelKey = (modelId: string | null, lmModel: 'nasa' | 'reconstruction') => (modelId === 'lm-descent-stage' && lmModel === 'nasa' ? 'lm-descent-stage-nasa' : modelId ?? '')

function useEnv(site: SurfaceSite, simMs: number, lmModel: 'nasa' | 'reconstruction', dtm: DtmData): SceneEnv {
  const terrain = useMemo<SiteTerrain>(() => {
    const anchors = site.objects.map((o) => ({ x: o.x, z: o.z, dy: o.dy, flatR: o.objectId.includes('lm') ? 6 : o.objectId.includes('lrv') ? 3.5 : 2.5 }))
    if (dtm) return new DtmTerrain(dtm.meta, dtm.heights, { seed: site.terrain.seed, halfExtentM: site.halfExtentM, anchors })
    return new Terrain({ seed: site.terrain.seed, halfExtentM: Math.min(site.halfExtentM, 400), anchors })
  }, [site, dtm])
  const earthDir = useMemo(() => new THREE.Vector3(...meanEarthDirectionAtLunarSite(site.origin.latDeg, site.origin.lonEastDeg)), [site])
  const placed = useMemo(
    () =>
      site.objects.map((o) => {
        const obj = OBJECT_BY_ID[o.objectId]
        let rotY = -o.headingDeg * D2R
        let tilt: number | undefined
        if (obj.model.id === 'lrrr') {
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
    for (const p of placed) {
      for (const [cx, cz, r, h] of COLLIDERS[modelKey(p.modelId, lmModel)] ?? (p.modelId ? [[0, 0, 0.5, 1]] : [])) {
        const c = Math.cos(p.rotY), s = Math.sin(p.rotY)
        cs.push({ x: p.x + cx * c + cz * s, z: p.z - cx * s + cz * c, r, h, id: p.id })
      }
    }
    return cs
  }, [terrain, placed, lmModel])
  const sun = useMemo(() => sunDirectionAtLunarSite(simMs, site.origin.latDeg, site.origin.lonEastDeg), [simMs, site])
  return { site, terrain, colliders, placed, sunDir: new THREE.Vector3(...sun), earthDir, sunUp: sun[1] > 0 }
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
    const fg = new THREE.PlaneGeometry(9000, 9000, 180, 180)
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
    const m = new THREE.MeshStandardMaterial({ color: '#9b9993', roughness: 0.98, metalness: 0, map: regolithMap(), bumpMap: regolithBump(), bumpScale: 1.2 })
    m.map!.repeat.set(90, 90)
    m.bumpMap!.repeat.set(260, 260)
    withPatchCutout(m)
    return m
  }, [])
  const farMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8f8d88', roughness: 1, metalness: 0 }), [])
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

export function DetailPatch({ terrain, follow }: { terrain: SiteTerrain; follow: { current: { x: number; z: number } } }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(PATCH.half * 2, PATCH.half * 2, PATCH.seg, PATCH.seg)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#9b9993', roughness: 0.98, metalness: 0, map: regolithMap(), bumpMap: regolithBump(), bumpScale: 1.2 })
    return m
  }, [])
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

function Rocks({ terrain }: { terrain: SiteTerrain }) {
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
    const mat = new THREE.MeshStandardMaterial({ color: '#7b7974', roughness: 0.96, flatShading: true })
    const groups: SiteTerrain['rocks'][] = [[], [], []]
    terrain.rocks.forEach((rk) => groups[rk.seed % 3].push(rk))
    return { geos, mat, groups }
  }, [terrain])
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
      p.set([s * Math.cos(t) * 3500, u * 3500, s * Math.sin(t) * 3500], i * 3)
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
  const ep = env.earthDir.clone().multiplyScalar(3000)
  const sp = env.sunDir.clone().multiplyScalar(3200)
  // Earth's angular diameter from the Moon ≈ 2 × atan(6371 / 384400) ≈ 1.9°
  const earthR = 3000 * Math.tan(((6371 / 384400) as number))
  return (
    <group>
      {/* daylight on the surface overwhelms faint stars (as in the Apollo photographs); they appear at night */}
      <points geometry={stars}>
        <pointsMaterial color="#ffffff" size={1.6} sizeAttenuation={false} transparent opacity={env.sunUp ? 0.1 : 0.9} depthWrite={false} />
      </points>
      <mesh position={ep} rotation={[0.4, 2.2, 0]}>
        <sphereGeometry args={[earthR, 48, 32]} />
        <meshStandardMaterial map={earthTex} roughness={0.8} metalness={0} />
      </mesh>
      {env.sunUp && (
        <mesh position={sp}>
          <sphereGeometry args={[3200 * Math.tan(0.267 * D2R), 24, 16]} />
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

function Player({ env }: { env: SceneEnv }) {
  const { camera, gl } = useThree()
  const quality = useStore((s) => s.quality)
  const astro = useRef<AstronautHandle>(null)
  const g = SURFACE_BODIES[env.site.bodyId].gravity.value!
  const params = useMemo(() => paramsForGravity(g, env.site.halfExtentM), [g, env.site])
  const ground = env.terrain
  const lm = env.placed[0]
  const followRef = useRef({ x: 0, z: 0 })
  const start = useMemo(() => ({ x: lm.x - 14, z: lm.z + 10 }), [lm])
  const ch = useRef<CharacterState>(newCharacter(start.x, start.z, ground, Math.atan2(-(lm.x - start.x), -(lm.z - start.z))))
  const look = useRef({ yaw: ch.current.yaw, pitch: -0.22, dist: 4.4, inspYaw: 0.6, inspPitch: -0.35, inspDist: 7 })
  const camPos = useRef(new THREE.Vector3())
  const camTarget = useRef(new THREE.Vector3())
  const t0 = useRef(performance.now())
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
    surfaceDebug.teleport = (x, z) => {
      ch.current = { ...ch.current, pos: [x, ground.heightAt(x, z), z], vel: [0, 0, 0] }
    }
    surfaceDebug.character = () => ({ ...ch.current, camYaw: look.current.yaw, camPitch: look.current.pitch })
    surfaceDebug.camera = () => ({ pos: camera.position.toArray(), mode: useSurface.getState().camMode })
    surfaceDebug.terrain = () => ({ daylightMs: env.site.daylight.ms, kind: ground.kind, product: ground.kind === 'dtm' ? (ground as DtmTerrain).meta.source.product : null, objects: env.placed.map((p) => ({ id: p.id, x: p.x, z: p.z, y: p.y, model: p.modelId })) })
    return () => {
      surfaceDebug.teleport = undefined
      surfaceDebug.character = undefined
      surfaceDebug.camera = undefined
      surfaceDebug.terrain = undefined
    }
  }, [ground, camera, env.placed])

  // input: keyboard, pointer lock / drag look, wheel zoom
  useEffect(() => {
    const el = gl.domElement
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    }
    const kd = (e: KeyboardEvent) => {
      if (typing(e)) return
      const S = useSurface.getState()
      if (e.code === 'Escape') {
        if (S.panel) S.set({ panel: null, component: null })
        else if (S.mapOpen) S.set({ mapOpen: false })
        else if (S.helpOpen) S.set({ helpOpen: false })
        else S.set({ paused: !S.paused })
        return
      }
      if (S.intro || S.paused) return
      if (e.code === 'KeyM' && !S.panel) {
        S.set({ mapOpen: !S.mapOpen })
        if (document.pointerLockElement) document.exitPointerLock()
        return
      }
      if (S.panel || S.mapOpen) return
      if (e.code === 'KeyE' && S.nearbyId) {
        if (document.pointerLockElement) document.exitPointerLock()
        S.set({ panel: { objectId: S.nearbyId, tab: 'inspect' }, component: null, banner: null })
        return
      }
      if (e.code === 'KeyV') S.set({ camMode: S.camMode === 'third' ? 'first' : 'third' })
      if (e.code === 'KeyH') S.set({ helpOpen: !S.helpOpen })
      if (e.code === 'Space') e.preventDefault()
      keys.add(e.code)
    }
    const ku = (e: KeyboardEvent) => keys.delete(e.code)
    const blur = () => keys.clear()
    let drag: { x: number; y: number } | null = null
    const pd = (e: PointerEvent) => {
      const S = useSurface.getState()
      drag = { x: e.clientX, y: e.clientY }
      if (!S.panel && !S.mapOpen && !S.paused && !S.intro && e.pointerType === 'mouse' && !document.pointerLockElement) {
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
      } else {
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
      if (useSurface.getState().panel) L.inspDist = THREE.MathUtils.clamp(L.inspDist * (1 + Math.sign(e.deltaY) * 0.1), 2, 22)
      else L.dist = THREE.MathUtils.clamp(L.dist * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 12)
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    el.addEventListener('wheel', wh, { passive: false })
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      el.removeEventListener('wheel', wh)
      keys.clear()
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const S = useSurface.getState()
    const L = look.current
    const frozen = S.paused || S.mapOpen || !!S.panel || S.intro
    const inp = frozen
      ? { forward: 0, right: 0, run: false, jump: false, camYaw: L.yaw }
      : {
          forward: Math.max(-1, Math.min(1, (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + virtualInput.forward)),
          right: Math.max(-1, Math.min(1, (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + virtualInput.right)),
          run: keys.has('ShiftLeft') || keys.has('ShiftRight') || virtualInput.run,
          jump: keys.has('Space') || virtualInput.jump,
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
      lastPanel.current = pid
      const p = env.placed.find((x) => x.id === pid)
      if (p) {
        L.inspYaw = p.rotY + (p.modelId === 'lrrr' ? Math.PI : p.modelId === 'lm-descent-stage' ? 0.55 : 0.8)
        L.inspPitch = p.modelId === 'lrrr' ? -0.6 : -0.35
      }
    }

    // astronaut pose (hidden while the inspection camera orbits an object)
    const a = astro.current
    if (a) {
      a.root.visible = !S.panel
      a.root.position.set(c.pos[0], c.pos[1], c.pos[2])
      a.root.rotation.y = c.yaw
      a.pose(gaitPose(c.odometer, speed, g, !c.grounded), S.camMode === 'first' ? L.pitch * 0.6 : 0)
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
      const local = S.component && anchors[S.component] ? anchors[S.component] : [0, p.modelId === 'lm-descent-stage' ? 2 : 0.5, 0]
      const v = new THREE.Vector3(...local).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY)
      target.set(p.x + v.x, p.y + v.y, p.z + v.z)
      const big = p.modelId === 'lm-descent-stage' ? 1.5 : p.modelId === 'lrv' ? 0.95 : 0.45
      const dist = S.component ? Math.min(L.inspDist, p.modelId === 'lm-descent-stage' ? 5 : p.modelId === 'lrv' ? 3 : 2.2) : L.inspDist * big
      desired.set(target.x + Math.sin(L.inspYaw) * Math.cos(L.inspPitch) * dist, target.y - Math.sin(L.inspPitch) * dist, target.z + Math.cos(L.inspYaw) * Math.cos(L.inspPitch) * dist)
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
    if (S.intro) {
      const t = Math.min(1, (performance.now() - t0.current) / (reduced ? 1 : 4200))
      const e = 1 - Math.pow(1 - t, 3)
      const high = new THREE.Vector3(lm.x + 60, lm.y + 260, lm.z + 120)
      camPos.current.copy(high.lerp(desired, e))
      camTarget.current.copy(new THREE.Vector3(lm.x, lm.y, lm.z).lerp(target, e))
      if (t >= 1) S.set({ intro: false })
    } else {
      const k = S.camMode === 'first' && !S.panel ? 1 : 1 - Math.exp(-dt * 9)
      camPos.current.lerp(desired, k)
      camTarget.current.lerp(target, k)
    }
    camera.position.copy(camPos.current)
    camera.lookAt(camTarget.current)
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
        if (d < o.noticeM && !S.discovered.includes(o.objectId)) newly.push(o.objectId)
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
      <DetailPatch terrain={env.terrain} follow={followRef} />
      <Astronaut ref={astro} visibleBody={useSurface((s) => s.camMode) !== 'first'} />
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
        <group key={p.id} position={[p.x, p.y, p.z]} rotation={[0, p.rotY, 0]}>
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
      gl={{ antialias: quality !== 'performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, powerPreference: 'high-performance' }}
      dpr={quality === 'performance' ? 1 : quality === 'balanced' ? [1, 1.5] : [1, 2]}
      camera={{ fov: 62, near: 0.05, far: 12000, position: [0, 200, 200] }}
      data-testid="surface-canvas"
    >
      <color attach="background" args={['#000000']} />
      {/* no sky light on an airless body: only a faint bounce from the grey regolith fills the shadows */}
      <hemisphereLight args={['#000000', '#8d8a83', env.sunUp ? 0.95 : 0.03]} />
      {!env.sunUp && <directionalLight position={env.earthDir.clone().multiplyScalar(100)} intensity={0.22} color="#9fb4ff" />}
      <ambientLight intensity={0.03} />
      <Sky env={env} />
      <TerrainMesh env={env} segments={segments} />
      <Rocks terrain={env.terrain} />
      <Hardware env={env} />
      <Waypoint env={env} />
      <Player env={env} />
    </Canvas>
  )
}

export { elevationDeg, azimuthDeg }
