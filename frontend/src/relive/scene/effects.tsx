/**
 * Effects for Relive Mission: engine plumes (expanding with altitude), stars, sky dome, atmosphere rims, entry plasma
 * and the far-away subject marker. All illustrative rendering; nothing here encodes a mission fact.
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Obj } from '../flight'
import { live } from './live'

type PlumeKind = 'rp1' | 'lh2' | 'hypergol' | 'solid'
const PLUME: Record<PlumeKind, { core: string; edge: string; alpha: number }> = {
  rp1: { core: '#fff6d8', edge: '#ff8a2a', alpha: 1.0 },
  lh2: { core: '#eef4ff', edge: '#8fb0ff', alpha: 0.7 },
  hypergol: { core: '#fff3da', edge: '#e0b27a', alpha: 0.6 },
  solid: { core: '#ffffff', edge: '#ffd27a', alpha: 1.0 },
}

const plumeVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`
const plumeFrag = /* glsl */ `
  uniform vec3 uCore; uniform vec3 uEdge; uniform float uI; uniform float uT; uniform float uA;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  #include <logdepthbuf_pars_fragment>
  float h(float n){ return fract(sin(n)*43758.5453); }
  void main(){
    #include <logdepthbuf_fragment>
    float along = 1.0 - vUv.y;              // 0 at the nozzle, 1 at the tail
    float rim = pow(abs(dot(vN, vV)), 1.5);  // brighter through the core
    float flick = 0.85 + 0.15*sin(uT*41.0 + along*30.0) * h(floor(uT*24.0));
    float fall = pow(1.0 - along, 1.6);
    vec3 c = mix(uEdge, uCore, rim * fall);
    float a = uI * uA * fall * (0.38 + 0.62 * rim) * flick;
    gl_FragColor = vec4(c * a, a);
  }`

/** a cone of additive light behind each nozzle position; scaled by the object's thrust and the ambient pressure */
export function Plume({ get, at, radius, length, kind, centreIdx }: { get: () => Obj | undefined; at: [number, number, number][]; radius: number; length: number; kind: PlumeKind; centreIdx?: number }) {
  const refs = useRef<THREE.Mesh[]>([])
  const mat = useMemo(() => {
    const p = PLUME[kind]
    return new THREE.ShaderMaterial({
      vertexShader: plumeVert, fragmentShader: plumeFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCore: { value: new THREE.Color(p.core) }, uEdge: { value: new THREE.Color(p.edge) }, uI: { value: 0 }, uT: { value: 0 }, uA: { value: p.alpha } },
    })
  }, [kind])
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 0.35, 1, 24, 6, true)
    g.translate(0, -0.5, 0)
    return g
  }, [])
  useFrame((_, dt) => {
    const o = get()
    const th = o?.thrust ?? 0
    mat.uniforms.uT.value += dt
    mat.uniforms.uI.value = th > 0 ? 0.6 + 0.4 * Math.min(1, th) : 0
    const vac = 1 - live.pressure
    const w = radius * (1 + 2.6 * vac)
    const L = length * (0.55 + 0.9 * vac) * (0.6 + 0.4 * Math.min(1, th))
    refs.current.forEach((m, i) => {
      if (!m) return
      const off = centreIdx === i && th > 0 && th < 0.95
      m.visible = th > 0 && !off
      m.scale.set(w, L, w)
    })
  })
  return (
    <group>
      {at.map((p, i) => <mesh key={i} ref={(m) => { if (m) refs.current[i] = m }} position={p} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />)}
    </group>
  )
}

/** a fixed star field that follows the camera */
export function Stars({ opacity = 1 }: { opacity?: number }) {
  const ref = useRef<THREE.Points>(null!)
  const { camera } = useThree()
  const geo = useMemo(() => {
    const n = 5200
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
    let s = 12345
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u)
      pos.set([q * Math.cos(a) * 1e5, u * 1e5, q * Math.sin(a) * 1e5], i * 3)
      const b = Math.pow(r(), 3) * 0.9 + 0.1, t = r()
      col.set([b * (0.85 + 0.15 * t), b * 0.9, b * (1.05 - 0.2 * t)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }), [])
  useFrame(() => {
    ref.current.position.copy(camera.position)
    const inAir = live.frame?.env === 'earth' || live.frame?.env === 'mars-local'
    mat.opacity = opacity * (inAir ? Math.max(0, 1 - live.pressure * 8 * live.day) : 1)
  })
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={-10} />
}

const skyFrag = /* glsl */ `
  uniform vec3 uUp; uniform vec3 uSun; uniform vec3 uZen; uniform vec3 uHor; uniform float uK; uniform float uDay;
  varying vec3 vDir;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    float e = dot(d, uUp);
    float hz = pow(1.0 - max(e, 0.0), 3.0);
    float se = dot(uSun, uUp);
    vec3 zen = mix(vec3(0.004, 0.008, 0.025), uZen, uDay);
    vec3 hor = mix(vec3(0.01, 0.015, 0.04), uHor, uDay);
    // twilight: a warm band on the horizon toward the Sun when it is just below or above it
    float tw = smoothstep(-0.24, -0.02, se) * (1.0 - smoothstep(0.05, 0.25, se));
    vec3 dh = d - uUp * e; vec3 sh = uSun - uUp * se;
    float toward = pow(max(dot(normalize(dh + vec3(1e-5)), normalize(sh + vec3(1e-5))), 0.0), 2.0);
    hor += vec3(1.0, 0.5, 0.22) * tw * (0.3 + 0.7 * toward);
    hor += vec3(0.1, 0.16, 0.32) * tw;
    zen += vec3(0.08, 0.13, 0.3) * tw;
    vec3 c = mix(zen, hor, hz);
    float s = max(dot(d, uSun), 0.0) * step(-0.05, se);
    c += vec3(1.0, 0.85, 0.6) * pow(s, 12.0) * 0.35 + vec3(1.0,0.95,0.85) * pow(s, 400.0) * 2.0;
    float below = smoothstep(0.02, -0.25, e);
    c = mix(c, uHor * 0.55, below);
    gl_FragColor = vec4(c, uK * (0.3 + 0.7 * uDay));
  }`
const skyVert = /* glsl */ `
  varying vec3 vDir;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    #include <logdepthbuf_vertex>
  }`

/** atmosphere seen from inside: fades out with altitude (k = exp(−alt / H)) */
export function SkyDome({ zenith, horizon, scaleH }: { zenith: string; horizon: string; scaleH: number }) {
  const ref = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, transparent: true, depthWrite: false,
    uniforms: { uUp: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uZen: { value: new THREE.Color(zenith) }, uHor: { value: new THREE.Color(horizon) }, uK: { value: 1 }, uDay: { value: 1 } },
  }), [zenith, horizon])
  useFrame(() => {
    const f = live.frame
    if (!f) return
    ref.current.position.copy(camera.position)
    const camAlt = f.alt + (camera.position.dot(new THREE.Vector3(...f.up)))
    const k = Math.exp(-Math.max(0, camAlt) / scaleH)
    mat.uniforms.uK.value = Math.min(1, k * 1.15)
    mat.uniforms.uUp.value.set(...f.up)
    mat.uniforms.uSun.value.set(...f.sun)
    mat.uniforms.uDay.value = live.day
    ref.current.visible = k > 0.01
  })
  return (
    <mesh ref={ref} material={mat} frustumCulled={false} renderOrder={-9}>
      <sphereGeometry args={[9e4, 32, 16]} />
    </mesh>
  )
}

const rimFrag = /* glsl */ `
  uniform vec3 uC; uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  #include <logdepthbuf_pars_fragment>
  void main(){
    #include <logdepthbuf_fragment>
    float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
    float lit = smoothstep(-0.25, 0.4, dot(normalize(vW), uSun));
    gl_FragColor = vec4(uC * f * lit, f * lit);
  }`
const rimVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vW = normalize(position);
    gl_Position = projectionMatrix*mv;
    #include <logdepthbuf_vertex>
  }`
/** thin glowing limb of an atmosphere seen from space */
export function AtmosphereRim({ radius, color }: { radius: number; color: string }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: rimVert, fragmentShader: rimFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uC: { value: new THREE.Color(color) }, uSun: { value: new THREE.Vector3(1, 0, 0) } },
  }), [color])
  useFrame(() => { if (live.frame) mat.uniforms.uSun.value.set(...live.frame.sun) })
  return <mesh material={mat} scale={radius * 1.018}><sphereGeometry args={[1, 96, 48]} /></mesh>
}

/** entry plasma: an additive glow ahead of and behind the heat shield */
export function Plasma({ size }: { size: number }) {
  const ref = useRef<THREE.Group>(null!)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff9a4a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }), [])
  const mat2 = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide }), [])
  useFrame(() => {
    const f = live.frame
    const k = f?.plasma ?? 0
    ref.current.visible = k > 0.01
    if (!f || k <= 0.01) return
    mat.opacity = 0.55 * k
    mat2.opacity = 0.35 * k * (0.85 + 0.15 * Math.sin(live.wall * 37))
    const v = new THREE.Vector3(...f.vel).normalize()
    ref.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().negate())
  })
  return (
    <group ref={ref}>
      <mesh material={mat} scale={[size * 1.25, size * 0.55, size * 1.25]} position={[0, -size * 0.2, 0]}><sphereGeometry args={[1, 24, 12]} /></mesh>
      <mesh material={mat2} position={[0, size * 4, 0]}><coneGeometry args={[size * 1.1, size * 8, 24, 1, true]} /></mesh>
    </group>
  )
}

/** a constant-size glow where the subject is, for views in which it is far smaller than a pixel */
export function Marker({ color = '#9ff3ff', visible }: { color?: string; visible: boolean }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(160,240,255,0.9)'); gr.addColorStop(1, 'rgba(160,240,255,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <sprite visible={visible} scale={[0.022, 0.022, 1]} renderOrder={20}>
      <spriteMaterial map={tex} color={color} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  )
}
