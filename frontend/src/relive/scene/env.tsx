/**
 * Relive environments: textured globes (the app's Earth, Moon and Mars maps), the local ground patches under the
 * action (launch site, Tranquility Base, the Pacific recovery area, Meridiani Planum around Eagle crater), the Sun,
 * and the light. Local patches are spherical caps built in float64 relative to the site so they sit exactly on the
 * globe; their texture/relief is ILLUSTRATIVE (the measured terrain lives in the Explore views).
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { R_EARTH, R_MARS, R_MOON, type V3, helioEcliptic, v3 } from '../geo'
import { live } from './live'
import { AtmosphereRim, SkyDome, Stars } from './effects'

const TEX = '/assets/astronomy/textures/'

/** the scene is drawn relative to the subject (floating origin): every env-frame point p is placed at p − focus */
export const rel = (p: V3): [number, number, number] => {
  const f = live.frame!.focus
  return [p[0] - f[0], p[1] - f[1], p[2] - f[2]]
}

function Globe({ id, radius, map, rough = 0.95, rotY = 0, emissive }: { id: string; radius: number; map: string; rough?: number; rotY?: number; emissive?: string }) {
  const tex = useLoader(THREE.TextureLoader, TEX + map)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const f = live.frame
    if (!f) return
    const b = f.bodies.find((x) => x.id === id)
    if (!b) return
    ref.current.position.set(...rel(b.pos))
    ref.current.rotation.y = b.rotY ?? rotY
  })
  return (
    <mesh ref={ref} scale={radius} receiveShadow>
      <sphereGeometry args={[1, 512, 256]} />
      <meshStandardMaterial map={tex} roughness={rough} metalness={0} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 1 : 0} />
    </mesh>
  )
}

function Clouds() {
  const tex = useLoader(THREE.TextureLoader, TEX + 'earth_clouds_2k.png')
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const b = live.frame?.bodies.find((x) => x.id === 'earth')
    if (!b) return
    ref.current.position.set(...rel(b.pos))
    ref.current.rotation.y = (b.rotY ?? 0) + 0.3
    const camAlt = live.frame!.alt
    ;(ref.current.material as THREE.MeshStandardMaterial).opacity = Math.min(1, Math.max(0, (camAlt - 6000) / 30000)) * 0.5
  })
  return (
    <mesh ref={ref} scale={R_EARTH + 9000}>
      <sphereGeometry args={[1, 128, 64]} />
      <meshStandardMaterial map={tex} color="#ffffff" transparent depthWrite={false} roughness={1} opacity={0.5} />
    </mesh>
  )
}

/** a spherical cap of radius `rad` (m) around a site, vertices relative to the site point (float64 → float32) */
function capGeometry(up: V3, R: number, rad: number, n: number, height?: (x: number, z: number) => number) {
  const e = v3.norm(v3.cross([0, 1, 0], up).some((x) => Math.abs(x) > 1e-9) ? v3.cross([0, 1, 0], up) : [1, 0, 0])
  const nn = v3.cross(up, e)
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = (i / n - 0.5) * 2 * rad, z = (j / n - 0.5) * 2 * rad
      const d = Math.hypot(x, z)
      const ang = d / R
      const dir: V3 = d < 1e-9 ? up : v3.norm(v3.add(v3.mul(up, Math.cos(ang)), v3.mul(v3.norm(v3.add(v3.mul(e, x), v3.mul(nn, -z))), Math.sin(ang))))
      const h = height ? height(x, z) : 0
      const p = v3.sub(v3.mul(dir, R + h), v3.mul(up, R))
      pos.push(p[0], p[1], p[2])
      uv.push(i / n, j / n)
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return { g, e, n: nn }
}

/** procedural ground texture (canvas) */
function groundTexture(kind: 'pad' | 'moon' | 'mars' | 'ocean', size = 1024) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  if (kind === 'pad') {
    g.fillStyle = '#5d6b43'; g.fillRect(0, 0, size, size)
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() > 0.5 ? 'rgba(120,128,80,0.35)' : 'rgba(60,72,44,0.35)'; g.beginPath(); g.arc(r() * size, r() * size, 2 + r() * 14, 0, 7); g.fill() }
    // the ocean to the east (illustrative coastline)
    const grd = g.createLinearGradient(size * 0.58, 0, size * 0.62, 0)
    grd.addColorStop(0, 'rgba(215,205,170,1)'); grd.addColorStop(0.4, 'rgba(40,86,120,1)'); grd.addColorStop(1, 'rgba(22,60,96,1)')
    g.fillStyle = grd; g.fillRect(size * 0.58, 0, size * 0.42, size)
  } else if (kind === 'moon') {
    g.fillStyle = '#8c8984'; g.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i++) { const v = 110 + r() * 60; g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.25)`; g.fillRect(r() * size, r() * size, 1 + r() * 3, 1 + r() * 3) }
  } else if (kind === 'mars') {
    g.fillStyle = '#9a5a36'; g.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i++) { const v = r(); g.fillStyle = v > 0.6 ? 'rgba(170,104,66,0.25)' : v > 0.3 ? 'rgba(110,62,38,0.25)' : 'rgba(60,40,32,0.3)'; g.fillRect(r() * size, r() * size, 1 + r() * 4, 1 + r() * 2) }
    // ripples (illustrative)
    g.strokeStyle = 'rgba(80,46,30,0.18)'; g.lineWidth = 2
    for (let y = 0; y < size; y += 9) { g.beginPath(); for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3); g.stroke() }
  } else {
    g.fillStyle = '#0f3d5c'; g.fillRect(0, 0, size, size)
    for (let i = 0; i < 6000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,20,40,0.12)'; g.fillRect(r() * size, r() * size, 4 + r() * 18, 1 + r() * 2) }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** craters: deterministic small bowls (illustrative regolith relief) */
function craterField(seed: number, count: number, span: number, rMin: number, rMax: number, keepClear: number) {
  let s = seed
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const cs: { x: number; z: number; r: number }[] = []
  for (let i = 0; i < count; i++) {
    const cr = rMin + Math.pow(r(), 2.4) * (rMax - rMin)
    const x = (r() - 0.5) * span, z = (r() - 0.5) * span
    if (Math.hypot(x, z) < keepClear + cr) continue
    cs.push({ x, z, r: cr })
  }
  return (x: number, z: number) => {
    let h = 0
    for (const c of cs) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r
      if (d < 1) h -= c.r * 0.18 * (1 - d * d)
      else if (d < 1.35) h += c.r * 0.05 * (1 - (d - 1) / 0.35)
    }
    return h + Math.sin(x * 0.013) * Math.cos(z * 0.011) * 1.4
  }
}

function SitePatch({ kind, R, rad, n, height, repeat, fadeAlt }: { kind: 'pad' | 'moon' | 'mars' | 'ocean'; R: number; rad: number; n: number; height?: (x: number, z: number) => number; repeat: number; fadeAlt: number }) {
  const site = live.frame?.site
  const up = site?.up ?? [0, 1, 0]
  const key = up.map((x) => x.toFixed(6)).join(',')
  const geo = useMemo(() => capGeometry(up, R, rad, n, height), [key, R, rad, n]) // eslint-disable-line react-hooks/exhaustive-deps
  const tex = useMemo(() => { const t = groundTexture(kind); t.repeat.set(repeat, repeat); return t }, [kind, repeat])
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    map: tex, roughness: kind === 'ocean' ? 0.3 : 0.97, metalness: kind === 'ocean' ? 0.15 : 0, transparent: true, polygonOffset: true, polygonOffsetFactor: -2,
    // the sea picks up a little of the sky (it would otherwise go black before dawn)
    emissive: kind === 'ocean' ? '#0b2336' : '#000000', emissiveIntensity: kind === 'ocean' ? 0.55 : 0,
  }), [tex, kind])
  useFrame(() => {
    const f = live.frame
    if (!f?.site) return
    ref.current.position.set(...rel(f.site.pos))
    const op = Math.max(0, Math.min(1, 1 - (f.alt - fadeAlt) / fadeAlt))
    mat.opacity = op
    ref.current.visible = op > 0.01
    if (kind === 'ocean') tex.offset.x = (live.wall * 0.002) % 1
  })
  return <mesh ref={ref} geometry={geo.g} material={mat} receiveShadow renderOrder={1} />
}

/** the pad apron (illustrative size) */
function PadApron() {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => {
    const f = live.frame
    if (!f?.site) return
    ref.current.position.set(...rel(f.site.pos))
    ref.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...f.site.up))
    ref.current.visible = f.alt < 60000
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 0.3, 0]} receiveShadow><cylinderGeometry args={[95, 110, 0.6, 8]} /><meshStandardMaterial color="#a9a69c" roughness={0.95} /></mesh>
      <mesh position={[0, 0.65, 0]} receiveShadow><boxGeometry args={[14, 0.2, 60]} /><meshStandardMaterial color="#5e5b55" roughness={0.9} /></mesh>
    </group>
  )
}

/** the Moon around Tranquility Base: illustrative craters, cleared around the LM */
const moonHeight = craterField(11, 700, 1400, 1.2, 28, 40)
const moonFar = craterField(12, 260, 28000, 60, 900, 900)
const marsHeight = (() => {
  const f = craterField(23, 260, 5000, 1, 40, 30)
  return (x: number, z: number) => {
    const r = Math.hypot(x, z)
    const eagle = r < 10 ? -2 * (1 - (r * r) / 100) : r < 13 ? 0.4 * (1 - (r - 10) / 3) : 0 // Eagle ~20 m across (PDS); depth illustrative
    return f(x, z) * 0.35 + eagle
  }
})()

function Sun() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.12, 'rgba(255,248,220,0.95)'); gr.addColorStop(0.35, 'rgba(255,220,160,0.25)'); gr.addColorStop(1, 'rgba(255,200,120,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  const ref = useRef<THREE.Sprite>(null!)
  const { camera } = useThree()
  useFrame(() => {
    const f = live.frame
    if (!f) return
    const b = f.bodies.find((x) => x.id === 'sun')
    if (b) { ref.current.position.set(...rel(b.pos)); ref.current.scale.setScalar(0.07) }
    else { ref.current.position.copy(camera.position).add(new THREE.Vector3(...f.sun).multiplyScalar(8e4)); ref.current.scale.setScalar(0.045) }
  })
  return <sprite ref={ref} renderOrder={-8}><spriteMaterial map={tex} sizeAttenuation={false} depthWrite={false} transparent blending={THREE.AdditiveBlending} /></sprite>
}

function Light({ shadowSpan, intensity = 3.1, horizon = false }: { shadowSpan: number; intensity?: number; horizon?: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null!)
  useFrame(() => {
    const f = live.frame
    if (!f) return
    // in an atmosphere the sunlight fades through the horizon (twilight); in space it is always on
    if (horizon) ref.current.intensity = intensity * live.day
    ref.current.position.set(f.sun[0] * 400, f.sun[1] * 400, f.sun[2] * 400)
    ref.current.target.position.set(0, 0, 0)
    ref.current.target.updateMatrixWorld()
  })
  return (
    <>
      <directionalLight ref={ref} intensity={intensity} color="#fff6ea" castShadow={shadowSpan > 0} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04}
        shadow-camera-left={-shadowSpan} shadow-camera-right={shadowSpan} shadow-camera-top={shadowSpan} shadow-camera-bottom={-shadowSpan} shadow-camera-near={1} shadow-camera-far={1200} />
    </>
  )
}

export function Environment({ env }: { env: string }) {
  if (env === 'earth')
    return (
      <>
        <Stars />
        <SkyDome zenith="#2f69c8" horizon="#a9c8ea" scaleH={8500} />
        <Globe id="earth" radius={R_EARTH} map="earth_day_2k.jpg" rough={0.85} />
        <Clouds />
        <AtmosphereRim radius={R_EARTH} color="#6fa8ff" />
        <PlumeLight />
        {live.frame?.site?.kind === 'pad' && <><SitePatch kind="pad" R={R_EARTH} rad={30000} n={96} repeat={6} fadeAlt={45000} /><PadApron /></>}
        {live.frame?.site?.kind === 'ocean' && <SitePatch kind="ocean" R={R_EARTH} rad={40000} n={64} repeat={30} fadeAlt={60000} />}
        <Sun />
        <Light shadowSpan={90} intensity={2.3} horizon />
        <Hemi sky="#9fc3ff" ground="#3a3a30" k={0.35} />
      </>
    )
  if (env === 'cislunar')
    return (
      <>
        <Stars />
        <Globe id="earth" radius={R_EARTH} map="earth_day_2k.jpg" rough={0.85} />
        <AtmosphereRim radius={R_EARTH} color="#6fa8ff" />
        <Globe id="moon" radius={R_MOON} map="moon_albedo_2k.jpg" />
        <Sun />
        <Light shadowSpan={0} />
        <ambientLight intensity={0.03} />
      </>
    )
  if (env === 'moon')
    return (
      <>
        <Stars />
        <Globe id="moon" radius={R_MOON} map="moon_albedo_2k.jpg" />
        <SitePatch kind="moon" R={R_MOON + 0.5} rad={14000} n={180} height={moonFar} repeat={60} fadeAlt={40000} />
        <SitePatch kind="moon" R={R_MOON + 0.6} rad={700} n={260} height={moonHeight} repeat={14} fadeAlt={9000} />
        <Sun />
        <Light shadowSpan={45} />
        <ambientLight intensity={0.05} />
      </>
    )
  if (env === 'mars')
    return (
      <>
        <Stars />
        <SkyDome zenith="#b98a62" horizon="#d9b48c" scaleH={11000} />
        <Globe id="mars" radius={R_MARS} map="mars_albedo_2k.jpg" />
        <AtmosphereRim radius={R_MARS} color="#e8a66c" />
        <Sun />
        <Light shadowSpan={0} />
        <ambientLight intensity={0.08} />
      </>
    )
  if (env === 'mars-local')
    return (
      <>
        <Stars />
        <SkyDome zenith="#c9a07a" horizon="#e3c3a0" scaleH={11000} />
        <MarsLocal />
        <Sun />
        <Light shadowSpan={40} intensity={2.6} horizon />
        <Hemi sky="#e6c39e" ground="#5a3524" k={0.55} />
        <PlumeLight />
      </>
    )
  // interplanetary
  return (
    <>
      <Stars />
      <Planets />
      <Sun />
      <ambientLight intensity={0.15} />
      <pointLight intensity={2.5} decay={0} position={[0, 0, 0]} />
    </>
  )
}

/** sky light that dims with the Sun's elevation (night launch, pre-dawn splashdown) */
function Hemi({ sky, ground, k }: { sky: string; ground: string; k: number }) {
  const ref = useRef<THREE.HemisphereLight>(null!)
  useFrame(() => { if (ref.current) ref.current.intensity = k * (0.45 + 0.55 * live.day) })
  return <hemisphereLight ref={ref} args={[sky, ground, k]} />
}

/** the glow of the engines lighting the pad and the vehicle (matters most for the night launch) */
function PlumeLight() {
  const ref = useRef<THREE.PointLight>(null!)
  useFrame(() => {
    const f = live.frame
    const L = ref.current
    if (!f || !L) return
    let best: (typeof f.objects)[number] | null = null
    for (const o of f.objects) if ((o.thrust ?? 0) > 0 && (!best || o.model === 'sic' || o.model === 'delta-core')) best = o
    if (!best) { L.intensity = 0; return }
    const p = rel(best.pos)
    L.position.set(p[0] - best.fwd[0] * 12, p[1] - best.fwd[1] * 12, p[2] - best.fwd[2] * 12)
    L.intensity = (best.thrust ?? 0) * (900 + 5200 * (1 - live.day)) * (0.9 + 0.1 * Math.sin(live.wall * 50))
  })
  return <pointLight ref={ref} color="#ffb060" decay={1.2} distance={3000} intensity={0} />
}

/** flat local terrain around Eagle crater (the frame is local East-Up-South; the curvature over 5 km is ~4 m) */
function MarsLocal() {
  const geo = useMemo(() => {
    const n = 300, span = 5000
    const g = new THREE.PlaneGeometry(span, span, n, n)
    g.rotateX(-Math.PI / 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      // finer near the crater: a second, denser patch would be nicer; this keeps one mesh
      p.setY(i, marsHeight(x, z))
    }
    g.computeVertexNormals()
    return g
  }, [])
  const near = useMemo(() => {
    const n = 200, span = 120
    const g = new THREE.PlaneGeometry(span, span, n, n)
    g.rotateX(-Math.PI / 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, marsHeight(p.getX(i), p.getZ(i)) + 0.02)
    g.computeVertexNormals()
    return g
  }, [])
  const tex = useMemo(() => { const t = groundTexture('mars'); t.repeat.set(60, 60); return t }, [])
  const tex2 = useMemo(() => { const t = groundTexture('mars'); t.repeat.set(10, 10); return t }, [])
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => { if (live.frame) ref.current.position.set(...rel([0, 0, 0])) })
  return (
    <group ref={ref}>
      <mesh geometry={geo} receiveShadow><meshStandardMaterial map={tex} roughness={0.98} /></mesh>
      <mesh geometry={near} receiveShadow castShadow><meshStandardMaterial map={tex2} roughness={0.98} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}><ringGeometry args={[2400, 60000, 64]} /><meshStandardMaterial color="#8d5634" roughness={1} /></mesh>
    </group>
  )
}

/** Sun, Earth and Mars with their orbits (sizes exaggerated so they can be seen) */
function Planets() {
  const earth = useLoader(THREE.TextureLoader, TEX + 'earth_day_2k.jpg')
  const mars = useLoader(THREE.TextureLoader, TEX + 'mars_albedo_2k.jpg')
  const e = useRef<THREE.Mesh>(null!), m = useRef<THREE.Mesh>(null!), s = useRef<THREE.Mesh>(null!)
  const orbits = useRef<THREE.Group>(null!)
  const lineGeo = useMemo(() => new THREE.BufferGeometry(), [])
  const pathLine = useMemo(() => new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0.8 })), [lineGeo])
  useFrame(() => {
    const f = live.frame
    if (!f) return
    for (const b of f.bodies) {
      const ref = b.id === 'earth' ? e : b.id === 'mars' ? m : s
      if (ref.current) ref.current.position.set(...rel(b.pos))
    }
    if (orbits.current) orbits.current.position.set(...rel([0, 0, 0]))
    if (f.path) {
      const pts = f.path.map((p) => new THREE.Vector3(...rel(p)))
      lineGeo.setFromPoints(pts)
    }
  })
  return (
    <>
      <mesh ref={s} scale={6.957e8 * 8}><sphereGeometry args={[1, 32, 16]} /><meshBasicMaterial color="#fff2c8" /></mesh>
      <mesh ref={e} scale={6.371e6 * 900}><sphereGeometry args={[1, 48, 24]} /><meshStandardMaterial map={earth} emissive="#0a1830" /></mesh>
      <mesh ref={m} scale={R_MARS * 1300}><sphereGeometry args={[1, 48, 24]} /><meshStandardMaterial map={mars} emissive="#200c04" /></mesh>
      <group ref={orbits}>
        <OrbitRing name="earth" days={365.25} color="#4f7fd0" />
        <OrbitRing name="mars" days={687} color="#c0704a" />
      </group>
      <primitive object={pathLine} />
    </>
  )
}
/** one orbit sampled from the app's ephemeris around 2003 */
function OrbitRing({ name, days, color }: { name: 'earth' | 'mars'; days: number; color: string }) {
  const obj = useMemo(() => {
    const t0 = Date.UTC(2003, 6, 8)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 256; i++) pts.push(new THREE.Vector3(...helioEcliptic(name, t0 + (i / 256) * days * 86400e3)))
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }))
  }, [name, days, color])
  return <primitive object={obj} />
}

/** the Earth–Moon path drawn in the cislunar view */
export function PathLine() {
  const obj = useMemo(() => new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0.6 })), [])
  useFrame(() => {
    const f = live.frame
    obj.visible = !!f?.path
    if (!f?.path) return
    obj.geometry.setFromPoints(f.path.map((p) => new THREE.Vector3(...rel(p))))
  })
  return <primitive object={obj} />
}
