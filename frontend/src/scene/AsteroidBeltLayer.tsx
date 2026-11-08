import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store/store'
import { nav } from '../store/nav'
import { SUN_POS, toThree, sub, len, eclipticToGalactic } from '../astro/coords'
import { KM_PER_AU } from '../astro/kepler'
import { jdTdbFromUtcMs } from '../astro/time'
import { eventState } from '../events/eventState'

const KM_TO_LY = 1 / 9.4607304725808e12
const D2R = Math.PI / 180

interface AsteroidPayload {
  epochJdTdb: number
  rows: [number, number, number, number, number, number, number, number][]
}

export function AsteroidBeltLayer() {
  const pointsRef = useRef<THREE.Points>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const showOrbits = useStore((s) => s.showOrbits)
  const [data, setData] = useState<AsteroidPayload | null>(null)

  useEffect(() => {
    let active = true
    fetch('/assets/astronomy/data/main_belt_sbdb_h13.5.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`)
        return res.json()
      })
      .then((json: AsteroidPayload) => {
        if (active) setData(json)
      })
      .catch((err) => {
        console.warn('[AsteroidBeltLayer] Could not load main belt asteroid dataset:', err)
      })
    return () => {
      active = false
    }
  }, [])

  const matrixUniform = useMemo(() => {
    const c0 = toThree(eclipticToGalactic([1, 0, 0]))
    const c1 = toThree(eclipticToGalactic([0, 1, 0]))
    const c2 = toThree(eclipticToGalactic([0, 0, 1]))
    return new THREE.Matrix3().set(
      c0[0] * KM_TO_LY, c1[0] * KM_TO_LY, c2[0] * KM_TO_LY,
      c0[1] * KM_TO_LY, c1[1] * KM_TO_LY, c2[1] * KM_TO_LY,
      c0[2] * KM_TO_LY, c1[2] * KM_TO_LY, c2[2] * KM_TO_LY
    )
  }, [])

  const geometry = useMemo(() => {
    if (!data || !data.rows.length) return null
    const N = data.rows.length
    const geo = new THREE.BufferGeometry()

    const pos = new Float32Array(N * 3)
    const elem1 = new Float32Array(N * 4) // [a_km, e, i_rad, node_rad]
    const elem2 = new Float32Array(N * 4) // [argp_rad, M0_rad, n_rad_per_day, epochJd]
    const colors = new Float32Array(N * 3)
    const sizes = new Float32Array(N)

    const epochJd = data.epochJdTdb

    for (let k = 0; k < N; k++) {
      const row = data.rows[k]
      // row: [number, a_au, e, i_deg, node_deg, argperi_deg, M_deg, H]
      const aAu = row[1]
      const e = row[2]
      const iDeg = row[3]
      const nodeDeg = row[4]
      const argpDeg = row[5]
      const M0Deg = row[6]
      const H = row[7]

      const aKm = aAu * KM_PER_AU
      const iRad = iDeg * D2R
      const nodeRad = nodeDeg * D2R
      const argpRad = argpDeg * D2R
      const M0Rad = M0Deg * D2R

      // Mean motion n = 2pi / P(days)
      const periodDays = 365.2568983 * Math.pow(aAu, 1.5)
      const nRadPerDay = (2 * Math.PI) / periodDays

      elem1[k * 4 + 0] = aKm
      elem1[k * 4 + 1] = e
      elem1[k * 4 + 2] = iRad
      elem1[k * 4 + 3] = nodeRad

      elem2[k * 4 + 0] = argpRad
      elem2[k * 4 + 1] = M0Rad
      elem2[k * 4 + 2] = nRadPerDay
      elem2[k * 4 + 3] = epochJd

      // Spectral type classification by semi-major axis (S-type inner, C-type outer)
      // S-type: ~0.82, 0.74, 0.65 (warm tan/stony)
      // C-type: ~0.45, 0.43, 0.42 (carbonaceous dark grey)
      const t = Math.max(0, Math.min(1, (aAu - 2.5) / (2.8 - 2.5)))
      const r = THREE.MathUtils.lerp(0.82, 0.45, t)
      const g = THREE.MathUtils.lerp(0.74, 0.43, t)
      const b = THREE.MathUtils.lerp(0.65, 0.42, t)

      colors[k * 3 + 0] = r
      colors[k * 3 + 1] = g
      colors[k * 3 + 2] = b

      // Apparent visual point size from absolute magnitude H
      sizes[k] = Math.max(1.4, Math.min(3.8, (14.0 - H) * 0.42 + 1.6))
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aElem1', new THREE.BufferAttribute(elem1, 4))
    geo.setAttribute('aElem2', new THREE.BufferAttribute(elem2, 4))
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    return geo
  }, [data])

  useFrame(() => {
    const pts = pointsRef.current
    const mat = matRef.current
    if (!pts || !mat) return

    if (eventState.activeId) {
      pts.visible = false
      return
    }

    const rel = sub(SUN_POS, nav.pos)
    const dSun = len(rel)
    // Visible within ~0.035 ly (~2200 AU) of the Sun
    const inRange = dSun < 0.035
    pts.visible = showOrbits && inRange
    if (!pts.visible) return

    const S = nav.scale
    const t3 = toThree(rel)
    const sunPosThree = new THREE.Vector3(t3[0] / S, t3[1] / S, t3[2] / S)

    const st = useStore.getState()
    const jd = jdTdbFromUtcMs(st.simMs)
    const baseAlpha = THREE.MathUtils.clamp((0.035 - dSun) / 0.015, 0.0, 0.55)
    const closeDamp = nav.nearestSurface < 0.0001 ? THREE.MathUtils.clamp(nav.nearestSurface / 0.0001, 0.15, 1.0) : 1.0
    const alpha = baseAlpha * closeDamp

    mat.uniforms.uSunPosThree.value.copy(sunPosThree)
    mat.uniforms.uScale.value = 1 / S
    mat.uniforms.uJd.value = jd
    mat.uniforms.uAlpha.value = alpha
  })

  if (!geometry) return null

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false} raycast={() => null}>
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={{
          uSunPosThree: { value: new THREE.Vector3() },
          uMat: { value: matrixUniform },
          uScale: { value: 1.0 },
          uJd: { value: 2461200.5 },
          uAlpha: { value: 0.55 },
        }}
        vertexShader={`
          #include <common>
          #include <logdepthbuf_pars_vertex>

          attribute vec4 aElem1; // a_km, e, i_rad, node_rad
          attribute vec4 aElem2; // argp_rad, M0_rad, n_rad_per_day, epochJd
          attribute float aSize;
          attribute vec3 aColor;

          uniform vec3 uSunPosThree;
          uniform mat3 uMat;
          uniform float uScale;
          uniform float uJd;

          varying vec3 vColor;

          void main() {
            vColor = aColor;
            float a_km = aElem1.x;
            float e = aElem1.y;
            float i_rad = aElem1.z;
            float node_rad = aElem1.w;

            float argp_rad = aElem2.x;
            float M0_rad = aElem2.y;
            float n_rad_per_day = aElem2.z;
            float epochJd = aElem2.w;

            float dt = uJd - epochJd;
            float M = mod(M0_rad + n_rad_per_day * dt, 6.283185307179586);

            // 4 Newton-Raphson iterations for Kepler's equation
            float E = M;
            for (int k = 0; k < 4; k++) {
              E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
            }

            float x0 = a_km * (cos(E) - e);
            float y0 = a_km * sqrt(max(0.0, 1.0 - e * e)) * sin(E);

            float cw = cos(argp_rad), sw = sin(argp_rad);
            float cn = cos(node_rad), sn = sin(node_rad);
            float ci = cos(i_rad);

            vec3 rEcl;
            rEcl.x = (cw * cn - sw * sn * ci) * x0 + (-sw * cn - cw * sn * ci) * y0;
            rEcl.y = (cw * sn + sw * cn * ci) * x0 + (-sw * sn + cw * cn * ci) * y0;
            rEcl.z = (sw * sin(i_rad)) * x0 + (cw * sin(i_rad)) * y0;

            vec3 posThree = uSunPosThree + (uMat * rEcl) * uScale;
            vec4 mvPos = modelViewMatrix * vec4(posThree, 1.0);
            gl_Position = projectionMatrix * mvPos;
            float dCam = length(posThree);
            gl_PointSize = clamp(aSize * (150.0 / max(dCam, 40.0)), 1.0, 2.8);

            #include <logdepthbuf_vertex>
          }
        `}
        fragmentShader={`
          #include <common>
          #include <logdepthbuf_pars_fragment>

          uniform float uAlpha;
          varying vec3 vColor;

          void main() {
            #include <logdepthbuf_fragment>
            vec2 coord = gl_PointCoord - vec2(0.5);
            float distSq = dot(coord, coord);
            if (distSq > 0.25) discard;
            float edge = smoothstep(0.25, 0.10, distSq);
            gl_FragColor = vec4(vColor * 1.05, uAlpha * edge * 0.75);
          }
        `}
      />
    </points>
  )
}
