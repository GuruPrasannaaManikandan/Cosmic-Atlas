/**
 * Ice-giant planet material and physically based ring systems (Uranus, Neptune).
 *
 * Rings: every catalogued ring (planetFrames.ts, NASA NSSDCA fact sheets) is drawn at its true radius and width with
 * transmission T = exp(-tau / mu) along the line of sight (mu = |cos| of the angle to the ring normal). A pixel covers
 * the radial interval [r - dr/2, r + dr/2] (dr = fwidth(r)); each ring contributes its overlap fraction of that
 * interval, so km-wide rings stay correct at every distance (no aliasing, no artificial widening).
 * Shadows: the planet shadows the rings (sphere test along the sun direction), the rings shadow the planet (same
 * coverage-weighted transmission at the point where the sunward ray crosses the ring plane).
 * Display brightness: real main-ring albedo is ~1.5 % (NSSDCA) and most rings are 1-10 km wide, i.e. far below a
 * pixel - like Voyager, they are only seen in long exposures. Reflected light therefore goes through an exposure
 * response L = 1 - exp(-G * b), b = coverage x (1 - T) x albedo (dust: coverage x tau x forward-scatter phase), with
 * exposure G = RING_EXPOSURE / DUST_EXPOSURE. Opacity (what the rings hide or shadow) is NOT exaggerated.
 *
 * Planet: Minnaert limb darkening on the observation-derived map, ring shadows, plus per-planet terms:
 *   Uranus  - faint zonal banding and north polar haze brightening (RECONSTRUCTION of the banding and the polar "hood"
 *             seen by Voyager 2 / Hubble / Keck; amplitudes are illustrative);
 *   Neptune - the map's Voyager-era dark spots appear only for sim dates 1989-1994 (NEPTUNE_MAP_SPOTS).
 * All geometry is evaluated in world space from the mesh's own matrices, so it is independent of frame conventions.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store/store'
import {
  RingBand, ringUniforms, ADAMS_ARCS, ADAMS_ARC_MEAN_MOTION_DEG_PER_DAY, arcTau, decimalYear,
  NEPTUNE_MAP_SPOTS, spotVisibility, NEPTUNE_RINGS,
} from '../astro/planetFrames'

export const RING_EXPOSURE = 3000
export const DUST_EXPOSURE = 300 // dusty rings: near-invisible at low phase, visible in forward scatter (as for Voyager)
const MAX_RINGS = 16

const RING_GLSL = /* glsl */ `
  uniform vec4 uRings[${MAX_RINGS}];   // inner, outer (planet radii), tau, kind (0 main / 1 dust)
  uniform vec3 uRingCol[${MAX_RINGS}];
  uniform int uRingCount;
  float overlapFrac(float a0, float a1, float b0, float b1, float dr) { return max(0.0, min(a1, b1) - max(a0, b0)) / dr; }
  // coverage-weighted opacity of the ring system at radius r for slant mu; also returns the brightness-weighted colour
  float ringOpacity(float r, float dr, float mu, out vec3 colMain, out vec3 colDust) {
    float r0 = r - 0.5 * dr, r1 = r + 0.5 * dr, a = 0.0;
    colMain = vec3(0.0); colDust = vec3(0.0);
    for (int i = 0; i < ${MAX_RINGS}; i++) {
      if (i >= uRingCount) break;
      vec4 b = uRings[i];
      float c = overlapFrac(r0, r1, b.x, b.y, dr);
      if (c <= 0.0) continue;
      float ai = c * (1.0 - exp(-b.z / mu));
      a += ai;
      if (b.w > 0.5) colDust += uRingCol[i] * ai; else colMain += uRingCol[i] * ai;
    }
    return clamp(a, 0.0, 1.0);
  }
`

function ringUniformValues(rings: RingBand[], radiusKm: number, colors: string[]) {
  const cols = rings.map((_, i) => new THREE.Color(colors[i] ?? colors[colors.length - 1]))
  while (cols.length < MAX_RINGS) cols.push(new THREE.Color(0, 0, 0))
  return { uRings: { value: ringUniforms(rings, radiusKm, MAX_RINGS) }, uRingCol: { value: cols.slice(0, MAX_RINGS) }, uRingCount: { value: Math.min(rings.length, MAX_RINGS) } }
}

/** Arc uniforms (Neptune only): start, end (rad), tau, ring index of Adams. */
function arcState(ms: number) {
  const year = decimalYear(ms)
  const days = ms / 86400000 - 10957.5 // since J2000 (UTC, adequate for a co-rotating pattern)
  const phase = (((ADAMS_ARC_MEAN_MOTION_DEG_PER_DAY * days) % 360) * Math.PI) / 180
  return { phase, arcs: ADAMS_ARCS.map((a) => new THREE.Vector4((a.startDeg * Math.PI) / 180, (a.endDeg * Math.PI) / 180, arcTau(a, year), 0)) }
}

export function RingSystem({ rings, radiusKm, colors, sunDir, arcs = false }: {
  rings: RingBand[]; radiusKm: number; colors: string[]; sunDir: { value: THREE.Vector3 }; arcs?: boolean
}) {
  const geo = useMemo(() => {
    const inner = Math.min(...rings.map((r) => r.radiusKm - r.widthKm / 2)) / radiusKm
    const outer = Math.max(...rings.map((r) => r.radiusKm + r.widthKm / 2)) / radiusKm
    const g = new THREE.RingGeometry(inner * 0.995, outer * 1.005, 512, 1)
    g.rotateX(-Math.PI / 2) // ring plane = planet equator (local XZ, pole = +Y)
    return g
  }, [rings, radiusKm])
  const adams = rings.findIndex((r) => r.name === 'Adams')
  const uniforms = useMemo(() => ({
    ...ringUniformValues(rings, radiusKm, colors),
    uSunDirW: sunDir,
    uMainGain: { value: RING_EXPOSURE },
    uDustGain: { value: DUST_EXPOSURE },
    uArcs: { value: arcState(0).arcs },
    uArcPhase: { value: 0 },
    uArcRing: { value: arcs && adams >= 0 ? new THREE.Vector2((rings[adams].radiusKm - rings[adams].widthKm / 2) / radiusKm, (rings[adams].radiusKm + rings[adams].widthKm / 2) / radiusKm) : new THREE.Vector2(-1, -1) },
  }), [rings, radiusKm, colors, sunDir, arcs, adams])
  useFrame(() => {
    if (!arcs) return
    const s = arcState(useStore.getState().simMs)
    uniforms.uArcPhase.value = s.phase
    uniforms.uArcs.value = s.arcs
  })
  return (
    <mesh geometry={geo} name="ring-system" renderOrder={2}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.CustomBlending}
        blendSrc={THREE.OneFactor}
        blendDst={THREE.OneMinusSrcAlphaFactor}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          uniform vec3 uSunDirW;
          varying vec3 vLocal;
          varying vec3 vSunL;
          varying vec3 vCamL;
          void main() {
            vLocal = position;
            mat3 R = mat3(modelMatrix);
            float s2 = dot(R[0], R[0]);                      // uniform scale squared
            vSunL = transpose(R) * normalize(uSunDirW);      // sun direction, ring-local (unnormalised)
            vCamL = transpose(R) * (cameraPosition - modelMatrix[3].xyz) / s2;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #include <logdepthbuf_vertex>
          }`}
        fragmentShader={/* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          ${RING_GLSL}
          uniform vec3 uSunDirW;
          uniform float uMainGain, uDustGain, uArcPhase;
          uniform vec4 uArcs[5];
          uniform vec2 uArcRing;
          varying vec3 vLocal;
          varying vec3 vSunL;
          varying vec3 vCamL;
          void main() {
            #include <logdepthbuf_fragment>
            vec3 L = normalize(vSunL);
            vec3 V = normalize(vCamL - vLocal);
            float r = length(vLocal.xz);
            float dr = max(fwidth(r), 1e-6);
            float muV = max(abs(V.y), 0.02);
            vec3 cMain, cDust;
            float alpha = ringOpacity(r, dr, muV, cMain, cDust);
            // Adams-ring arcs (co-rotating; tau 0.12 where present, replaces the 0.01 continuous ring)
            if (uArcRing.y > 0.0) {
              float c = overlapFrac(r - 0.5 * dr, r + 0.5 * dr, uArcRing.x, uArcRing.y, dr);
              if (c > 0.0) {
                float lon = mod(atan(-vLocal.z, vLocal.x) - uArcPhase, 6.2831853);
                for (int i = 0; i < 5; i++) {
                  float inArc = step(uArcs[i].x, lon) * step(lon, uArcs[i].y);
                  float extra = c * inArc * ((1.0 - exp(-uArcs[i].z / muV)) - (1.0 - exp(-0.01 / muV)));
                  alpha += max(extra, 0.0);
                  cMain += vec3(0.62, 0.58, 0.55) * max(extra, 0.0);
                }
              }
            }
            if (alpha <= 1e-5) discard;
            // planet shadow on the rings (unit sphere in ring-local units)
            float t = -dot(vLocal, L);
            vec3 q = vLocal + t * L;
            float lit = (t > 0.0 && dot(q, q) < 1.0) ? 0.0 : 1.0;
            // sunlit face vs. the unlit face (light diffusely transmitted through the thin rings)
            float sameSide = (L.y * V.y > 0.0) ? 1.0 : 0.3;
            float muL = max(abs(L.y), 0.02);
            float illum = lit * clamp(muL * 4.0, 0.25, 1.0) * sameSide;
            // dusty rings scatter strongly forward (small grains): Henyey-Greenstein-like boost toward the sun
            float fwd = 1.0 + 12.0 * pow(max(0.0, dot(-V, L)), 6.0);
            // exposure response per family (cMain / cDust carry colour x coverage x (1 - T))
            float bMain = dot(cMain, vec3(0.3333)) * 0.015 * illum;
            float bDust = dot(cDust, vec3(0.3333)) * fwd * illum;
            vec3 tintMain = cMain / max(dot(cMain, vec3(0.3333)), 1e-6);
            vec3 tintDust = cDust / max(dot(cDust, vec3(0.3333)), 1e-6);
            vec3 col = tintMain * 0.85 * (1.0 - exp(-uMainGain * bMain)) + tintDust * 0.5 * (1.0 - exp(-uDustGain * bDust));
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`}
      />
    </mesh>
  )
}

export function IceGiantSurface({ planet, map, rings, radiusKm, sunDir }: {
  planet: 'uranus' | 'neptune'; map: THREE.Texture; rings: RingBand[]; radiusKm: number; sunDir: { value: THREE.Vector3 }
}) {
  const uniforms = useMemo(() => ({
    ...ringUniformValues(rings, radiusKm, ['#ffffff']),
    uMap: { value: map },
    uSunDirW: sunDir,
    uMode: { value: planet === 'uranus' ? 0 : 1 },
    // Minnaert k > 1 = limb darkening, as in true-colour Voyager 2 / Hubble images of both planets (approximate)
    uMinnaert: { value: planet === 'uranus' ? 1.15 : 1.1 },
    uAlbedoScale: { value: planet === 'uranus' ? 0.6 : 1.0 },
    uSpots: { value: NEPTUNE_MAP_SPOTS.map((s) => new THREE.Vector4(...s.uv)) },
    uSpotVis: { value: NEPTUNE_MAP_SPOTS.map(() => 0) },
  }), [planet, map, rings, radiusKm, sunDir])
  const last = useRef(-1)
  useFrame(() => {
    if (planet !== 'neptune') return
    const year = decimalYear(useStore.getState().simMs)
    if (Math.abs(year - last.current) < 0.01) return
    last.current = year
    uniforms.uSpotVis.value = NEPTUNE_MAP_SPOTS.map((s) => spotVisibility(s, year))
  })
  return (
    <shaderMaterial
      uniforms={uniforms}
      vertexShader={/* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec3 vCenter;
        varying vec3 vPole;
        varying float vRadius;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          vCenter = modelMatrix[3].xyz;
          vRadius = length(modelMatrix[0].xyz);
          vPole = normalize(modelMatrix[1].xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`}
      fragmentShader={/* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${RING_GLSL}
        uniform sampler2D uMap;
        uniform vec3 uSunDirW;
        uniform int uMode;
        uniform float uMinnaert;
        uniform float uAlbedoScale;
        uniform vec4 uSpots[3];
        uniform float uSpotVis[3];
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vN;
        varying vec3 vCenter;
        varying vec3 vPole;
        varying float vRadius;
        vec3 albedoAt(vec2 uv) {
          vec3 a = texture2D(uMap, uv).rgb;
          if (uMode == 1) {
            // transient Neptune storms: blend toward the same latitude half a turn away unless the epoch shows them
            for (int i = 0; i < 3; i++) {
              vec4 s = uSpots[i];
              vec2 d = (uv - s.xy) / s.zw;
              float m = (1.0 - smoothstep(0.7, 1.0, length(d))) * (1.0 - uSpotVis[i]);
              if (m > 0.0) a = mix(a, texture2D(uMap, vec2(fract(uv.x + 0.5), uv.y)).rgb, m);
            }
          }
          return a;
        }
        void main() {
          #include <logdepthbuf_fragment>
          vec3 C = vCenter;
          float R = vRadius;
          vec3 pole = normalize(vPole);
          vec3 N = normalize(vN);
          vec3 L = normalize(uSunDirW);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 albedo = albedoAt(vUv) * uAlbedoScale;
          float lat = (vUv.y - 0.5) * 3.14159265;            // planetocentric latitude (IAU north +)
          if (uMode == 0) {
            // Uranus: faint zonal banding + north polar haze brightening (reconstruction, low amplitude)
            albedo *= 1.0 + 0.025 * sin(lat * 9.0) * cos(lat);
            albedo = mix(albedo, vec3(0.86, 0.95, 0.96), 0.18 * smoothstep(0.95, 1.35, lat));
          }
          float mu0 = max(dot(N, L), 0.0);
          float mu = max(dot(N, V), 1e-3);
          // Minnaert law I ~ mu0^k mu^(k-1); thin haze softens the terminator
          float diffuse = pow(mu0, uMinnaert) * pow(mu, uMinnaert - 1.0);
          diffuse = min(diffuse, 1.2) * smoothstep(-0.04, 0.12, dot(N, L));
          // ring shadow: where the sunward ray from this point crosses the equatorial (ring) plane
          float trans = 1.0;
          vec3 p = (vWorld - C) / R;
          float ly = dot(L, pole);
          if (abs(ly) > 1e-4) {
            float t = -dot(p, pole) / ly;
            if (t > 0.0) {
              vec3 q = p + t * L;
              float r = length(q);
              float dr = max(fwidth(r), 1e-6);
              vec3 c1, c2;
              trans = 1.0 - ringOpacity(r, dr, max(abs(ly), 0.02), c1, c2);
            }
          }
          vec3 col = albedo * (0.02 + 1.43 * diffuse * trans);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}
    />
  )
}

export { NEPTUNE_RINGS }
