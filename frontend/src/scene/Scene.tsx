import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OBJECTS, CosmicObject, positionOf, radiusLyOf, isDynamic } from '../data/catalog'
import { nav, stepNavigation, updateNearest, interrupt, setCameraAt } from '../store/nav'
import { useStore, advanceSim } from '../store/store'
import { Vec3, len, sub, add, toThree, fromThree, SUN_POS, LY_PER_AU } from '../astro/coords'
import { adaptiveScale, compressDistance } from '../astro/scale'
import { orbitPolylineLy, PLANET_ELEMENTS, planetRootPos } from '../astro/ephemeris'
import * as T from './textures'
import { buildGalaxy, buildCosmicWeb, buildBackdrop } from './procedural'
import { labelState } from './labelState'
import { Controls } from './Controls'
import { ship, stepShipPhysics } from '../travel/shipState'
import { travelInput, TravelControlsComponent } from '../travel/travelControls'
import { SpacecraftModel } from '../travel/SpacecraftModel'
import { WarpEffect } from '../travel/WarpEffect'
import { eventState, stepEventTime, subscribeEventState } from '../events/eventState'
import { CosmicEventLayer } from '../events/CosmicEventLayer'
import { EventControls } from '../events/EventControls'
import * as A from '../data/assetRegistry'
import { stepTravel, travelEngineState } from '../travel/travelEngine'
import { SOLAR_BODY_BY_ID, PLUTO_BODY, CHARON_PLUTO_MASS_RATIO, PLANET_RADIUS_KM } from '../data/solarSystem'
import { orbitPathKm, positionAtMs, periodDays } from '../astro/kepler'
import { AsteroidBeltLayer } from './AsteroidBeltLayer'

const KM_TO_LY = 1 / 9.4607304725808e12
const scaleVec = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]

const irregularGeoCache = new Map<string, THREE.BufferGeometry>()

export function getIrregularGeometry(
  id: string,
  triaxialKm: [number, number, number],
  meanRadiusKm: number,
  relief = 0
): THREE.BufferGeometry {
  const cached = irregularGeoCache.get(id)
  if (cached) return cached

  const g = new THREE.SphereGeometry(1, 40, 24)
  const pos = g.attributes.position
  const sx = triaxialKm[0] / meanRadiusKm
  const sy = triaxialKm[1] / meanRadiusKm
  const sz = triaxialKm[2] / meanRadiusKm

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)
    const r = Math.hypot(x, y, z) || 1
    const nx = x / r, ny = y / r, nz = z / r

    x = nx * sx
    y = ny * sy
    z = nz * sz

    if (relief > 0) {
      // Deterministic relief modulation for irregular small bodies
      const d =
        1.0 +
        relief *
          (0.42 * Math.sin(nx * 3.2 + 1.2) * Math.cos(ny * 3.4) +
            0.35 * Math.sin(nz * 5.1 - 0.7) * Math.cos(nx * 4.3) +
            0.23 * Math.cos(ny * 6.5 + nz * 2.8))
      x *= d
      y *= d
      z *= d
    }
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  irregularGeoCache.set(id, g)
  return g
}

let saturnRingGeo: THREE.BufferGeometry | null = null

export function getSaturnRingGeometry(): THREE.BufferGeometry {
  if (saturnRingGeo) return saturnRingGeo
  const innerRadius = 1.24
  const outerRadius = 2.35
  const geo = new THREE.RingGeometry(innerRadius, outerRadius, 256, 4)
  geo.rotateX(-Math.PI / 2) // Orient ring into the equatorial X-Z plane
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const r = Math.sqrt(x * x + z * z)
    const u = Math.max(0, Math.min(1, (r - innerRadius) / (outerRadius - innerRadius)))
    uv.setXY(i, u, 0.5)
  }
  uv.needsUpdate = true
  saturnRingGeo = geo
  return saturnRingGeo
}

export const planetaryUniforms = {
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uEarthSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uSaturnSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uSaturnSunDirLocal: { value: new THREE.Vector3(1, 0, 0) },
  uMarsSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uVenusSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uUranusSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uNeptuneSunDir: { value: new THREE.Vector3(1, 0, 0) },
}

function AtmosphereMesh({
  scale,
  color,
  sunDir,
  power = 3.2,
  intensity = 2.2,
}: {
  scale: number
  color: THREE.ColorRepresentation
  sunDir: { value: THREE.Vector3 }
  power?: number
  intensity?: number
}) {
  const c = useMemo(() => new THREE.Color(color), [color])
  return (
    <mesh scale={scale}>
      <SphereGeo />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        uniforms={{
          uSunDir: sunDir,
          uColor: { value: c },
          uPower: { value: power },
          uIntensity: { value: intensity },
        }}
        vertexShader={`
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec3 vWorldNormal;
          varying vec3 vWorldPosition;
          void main() {
            vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
            #include <logdepthbuf_vertex>
          }
        `}
        fragmentShader={`
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform vec3 uSunDir;
          uniform vec3 uColor;
          uniform float uPower;
          uniform float uIntensity;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPosition;
          void main() {
            #include <logdepthbuf_fragment>
            vec3 V = normalize(cameraPosition - vWorldPosition);
            vec3 N = normalize(vWorldNormal);
            vec3 L = normalize(uSunDir);
            float rim = 1.0 - max(0.0, dot(N, V));
            float limb = pow(rim, uPower);
            float sunDot = dot(N, L);
            float sunFactor = smoothstep(-0.25, 0.25, sunDot);
            float vDotL = max(0.0, dot(V, L));
            float phase = 1.0 + 0.6 * vDotL;
            float total = limb * sunFactor * phase * uIntensity;
            gl_FragColor = vec4(uColor * total, total);
          }
        `}
      />
    </mesh>
  )
}

const PLANET_IDS = Object.keys(PLANET_ELEMENTS)
const EXTENDED = new Set(['galaxy', 'cluster', 'supercluster', 'group', 'sheet', 'galactic-structure', 'nebula', 'star-cluster'])

function SphereGeo() {
  return <sphereGeometry args={[1, 64, 48]} />
}

function ObjectVisual({ o }: { o: CosmicObject }) {
  const col = new THREE.Color(o.color)
  switch (o.visual) {
    case 'cluster':
      return (
        <sprite scale={[3.2, 3.2, 1]}>
          <spriteMaterial map={T.clusterTexture(o.color)} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )
    case 'galaxy':
      if (o.id === 'andromeda') {
        return (
          <group name="fade">
            <mesh rotation={[-1.15, 0.4, -0.6]} scale={[3.8, 3.8, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={A.getAndromedaTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} opacity={0.92} />
            </mesh>
            <sprite scale={[1.8, 1.8, 1]}>
              <spriteMaterial map={T.glowTexture('#ffd8a8')} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.8} />
            </sprite>
          </group>
        )
      }
      return (
        <sprite scale={[3, 3, 1]} name="fade">
          <spriteMaterial map={T.spiralTexture(o.color)} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )
    case 'milkyway':
      return (
        <sprite scale={[3, 3, 1]} name="fade">
          <spriteMaterial map={T.glowTexture('#bcd4ff')} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )
    case 'nebula':
      if (o.id === 'carina-nebula') {
        return (
          <group name="fade">
            <mesh scale={[3.5, 3.5, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={A.getCarinaTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} opacity={0.9} />
            </mesh>
            <mesh rotation={[0.4, 0.6, 0.2]} scale={[3.1, 3.1, 1]}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={A.getCarinaTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} opacity={0.65} />
            </mesh>
          </group>
        )
      }
      return (
        <sprite scale={[3, 3, 1]} name="fade">
          <spriteMaterial map={T.nebulaTexture(o.color)} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )
    case 'starcluster':
      return (
        <sprite scale={[3, 3, 1]}>
          <spriteMaterial map={T.clusterTexture('#8fb8ff')} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )
    case 'marker':
      return (
        <sprite scale={[2, 2, 1]}>
          <spriteMaterial map={T.ringMarkerTexture(o.color)} transparent depthWrite={false} opacity={0.7} />
        </sprite>
      )
    case 'star':
      if (o.id === 'betelgeuse') {
        return (
          <>
            <mesh name="star-core">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getBetelgeuseTexture()}
                emissiveMap={A.getBetelgeuseTexture()}
                emissive="#ff4411"
                emissiveIntensity={1.8}
                roughness={0.95}
                metalness={0}
              />
            </mesh>
            <mesh scale={1.06}>
              <SphereGeo />
              <shaderMaterial
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.BackSide}
                vertexShader={
                  '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}'
                }
                fragmentShader={`
                  #include <common>
                  #include <logdepthbuf_pars_fragment>
                  varying vec3 vN;
                  void main(){
                    #include <logdepthbuf_fragment>
                    float i = pow(max(0.0, 0.88 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.2);
                    gl_FragColor = vec4(1.0, 0.28, 0.08, 1.0) * i * 3.0;
                  }
                `}
              />
            </mesh>
            <sprite scale={[6.0, 6.0, 1]} name="star-corona">
              <spriteMaterial map={T.glowTexture('#ff3300')} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.95} />
            </sprite>
          </>
        )
      }
      return (
        <>
          <mesh name="star-core">
            <SphereGeo />
            <meshBasicMaterial color={o.color} />
          </mesh>
          <mesh scale={1.08}>
            <SphereGeo />
            <shaderMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.BackSide}
              vertexShader={
                '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}'
              }
              fragmentShader={`
                #include <common>
                #include <logdepthbuf_pars_fragment>
                varying vec3 vN;
                void main(){
                  #include <logdepthbuf_fragment>
                  float i = pow(max(0.0, 0.88 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.2);
                  gl_FragColor = vec4(${col.r.toFixed(3)}, ${col.g.toFixed(3)}, ${col.b.toFixed(3)}, 1.0) * i * 2.5;
                }
              `}
            />
          </mesh>
          <sprite scale={[5.5, 5.5, 1]} name="star-corona">
            <spriteMaterial map={T.glowTexture(o.color)} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.9} />
          </sprite>
        </>
      )
    case 'sun':
      return (
        <>
          <mesh>
            <SphereGeo />
            <meshStandardMaterial
              map={A.getSunPhotosphereTexture()}
              emissiveMap={A.getSunPhotosphereTexture()}
              emissive="#ffcc66"
              emissiveIntensity={1.3}
              roughness={0.9}
              metalness={0}
            />
          </mesh>
          <mesh scale={1.035}>
            <SphereGeo />
            <shaderMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.BackSide}
              vertexShader={
                '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}'
              }
              fragmentShader={`
                #include <common>
                #include <logdepthbuf_pars_fragment>
                varying vec3 vN;
                void main(){
                  #include <logdepthbuf_fragment>
                  float i = pow(max(0.0, 0.82 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.5);
                  gl_FragColor = vec4(1.0, 0.75, 0.3, 1.0) * i * 2.8;
                }
              `}
            />
          </mesh>
          <sprite scale={[6.4, 6.4, 1]}>
            <spriteMaterial map={T.glowTexture('#ffa834')} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.88} />
          </sprite>
        </>
      )
    case 'planet':
      if (o.id === 'mercury') {
        return (
          <mesh rotation={[0, 0, 0.03]} name="spin">
            <SphereGeo />
            <meshStandardMaterial
              map={A.getMercuryTexture()}
              roughness={0.95}
              metalness={0.02}
            />
          </mesh>
        )
      }
      if (o.id === 'venus') {
        return (
          <>
            <mesh rotation={[0, 0, 3.09]} name="spin">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getVenusTexture()}
                roughness={0.72}
                metalness={0}
              />
            </mesh>
            <AtmosphereMesh scale={1.025} color="#e8d5ab" sunDir={planetaryUniforms.uVenusSunDir} power={3.5} intensity={1.8} />
          </>
        )
      }
      if (o.id === 'earth') {
        return (
          <>
            <mesh rotation={[0, 0, 0.409]} name="spin">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getEarthTexture()}
                normalMap={A.getEarthNormalTexture()}
                normalScale={new THREE.Vector2(0.85, 0.85)}
                roughnessMap={A.getEarthSpecularTexture()}
                roughness={0.7}
                metalness={0.02}
              />
            </mesh>
            {/* Night-side city lights */}
            <mesh rotation={[0, 0, 0.409]} scale={1.001} name="spin">
              <SphereGeo />
              <shaderMaterial
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                uniforms={{
                  uNightMap: { value: A.getEarthNightTexture() },
                  uSunDir: planetaryUniforms.uEarthSunDir,
                }}
                vertexShader={`
                  #include <common>
                  #include <logdepthbuf_pars_vertex>
                  varying vec2 vUv;
                  varying vec3 vWorldNormal;
                  void main() {
                    vUv = uv;
                    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    #include <logdepthbuf_vertex>
                  }
                `}
                fragmentShader={`
                  #include <common>
                  #include <logdepthbuf_pars_fragment>
                  uniform sampler2D uNightMap;
                  uniform vec3 uSunDir;
                  varying vec2 vUv;
                  varying vec3 vWorldNormal;
                  void main() {
                    #include <logdepthbuf_fragment>
                    vec3 N = normalize(vWorldNormal);
                    vec3 L = normalize(uSunDir);
                    float nDotL = dot(N, L);
                    float night = smoothstep(0.12, -0.15, nDotL);
                    if (night <= 0.001) discard;
                    vec4 lights = texture2D(uNightMap, vUv);
                    gl_FragColor = vec4(lights.rgb * night * 1.8, night);
                  }
                `}
              />
            </mesh>
            {/* Dynamic rotating cloud layer */}
            <mesh rotation={[0, 0, 0.409]} scale={1.015} name="earth-clouds">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getEarthCloudsTexture()}
                transparent
                opacity={0.92}
                depthWrite={false}
                roughness={0.9}
              />
            </mesh>
            {/* Atmospheric Rayleigh limb glow */}
            <AtmosphereMesh scale={1.035} color="#3d94ff" sunDir={planetaryUniforms.uEarthSunDir} power={3.2} intensity={2.2} />
          </>
        )
      }
      if (o.id === 'moon') {
        return (
          <mesh rotation={[0, 0, 0.11]} name="spin">
            <SphereGeo />
            <meshStandardMaterial
              map={A.getMoonTexture()}
              roughness={0.94}
              metalness={0}
            />
          </mesh>
        )
      }
      if (o.id === 'mars') {
        return (
          <>
            <mesh rotation={[0, 0, 0.44]} name="spin">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getMarsTexture()}
                roughness={0.88}
                metalness={0.02}
              />
            </mesh>
            <AtmosphereMesh scale={1.02} color="#d98555" sunDir={planetaryUniforms.uMarsSunDir} power={3.8} intensity={1.2} />
          </>
        )
      }
      if (o.id === 'jupiter') {
        return (
          <mesh rotation={[0, 0, 0.05]} name="spin">
            <SphereGeo />
            <meshStandardMaterial
              map={A.getJupiterTexture()}
              roughness={0.78}
              metalness={0}
            />
          </mesh>
        )
      }
      if (o.id === 'saturn') {
        return (
          <>
            <mesh rotation={[0.466, 0, 0.1]} name="spin">
              <SphereGeo />
              <shaderMaterial
                uniforms={{
                  uSaturnTexture: { value: A.getSaturnTexture() },
                  uRingAlpha: { value: A.getSaturnRingsTexture() },
                  uSunDir: planetaryUniforms.uSaturnSunDir,
                  uSunDirLocal: planetaryUniforms.uSaturnSunDirLocal,
                }}
                vertexShader={`
                  #include <common>
                  #include <logdepthbuf_pars_vertex>
                  varying vec3 vLocalPos;
                  varying vec3 vWorldNormal;
                  varying vec2 vUv;
                  void main() {
                    vLocalPos = position;
                    vUv = uv;
                    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    #include <logdepthbuf_vertex>
                  }
                `}
                fragmentShader={`
                  #include <common>
                  #include <logdepthbuf_pars_fragment>
                  uniform sampler2D uSaturnTexture;
                  uniform sampler2D uRingAlpha;
                  uniform vec3 uSunDir;
                  uniform vec3 uSunDirLocal;
                  varying vec3 vLocalPos;
                  varying vec3 vWorldNormal;
                  varying vec2 vUv;
                  void main() {
                    #include <logdepthbuf_fragment>
                    vec4 albedo = texture2D(uSaturnTexture, vUv);
                    vec3 N = normalize(vWorldNormal);
                    vec3 L = normalize(uSunDir);
                    float nDotL = dot(N, L);
                    float diffuse = smoothstep(-0.05, 0.25, nDotL);
                    
                    vec3 Lloc = normalize(uSunDirLocal);
                    float ringShadow = 0.0;
                    if (abs(Lloc.y) > 0.001) {
                      float t = -vLocalPos.y / Lloc.y;
                      if (t > 0.0) {
                        vec3 I = vLocalPos + t * Lloc;
                        float rRing = length(vec2(I.x, I.z));
                        if (rRing >= 1.24 && rRing <= 2.35) {
                          float u = (rRing - 1.24) / (2.35 - 1.24);
                          vec4 ringSample = texture2D(uRingAlpha, vec2(u, 0.5));
                          ringShadow = ringSample.a * 0.92;
                        }
                      }
                    }
                    
                    float light = mix(diffuse, 0.04, ringShadow);
                    float ambient = 0.035;
                    vec3 finalColor = albedo.rgb * (ambient + light * 1.35);
                    gl_FragColor = vec4(finalColor, 1.0);
                  }
                `}
              />
            </mesh>
            <mesh rotation={[0.466, 0, 0.1]} geometry={getSaturnRingGeometry()}>
              <shaderMaterial
                transparent
                depthWrite={false}
                side={THREE.DoubleSide}
                uniforms={{
                  uRingTexture: { value: A.getSaturnRingsTexture() },
                  uSunDir: planetaryUniforms.uSaturnSunDir,
                  uSunDirLocal: planetaryUniforms.uSaturnSunDirLocal,
                }}
                vertexShader={`
                  #include <common>
                  #include <logdepthbuf_pars_vertex>
                  varying vec3 vLocalPos;
                  varying vec3 vWorldNormal;
                  varying vec2 vUv;
                  void main() {
                    vLocalPos = position;
                    vUv = uv;
                    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    #include <logdepthbuf_vertex>
                  }
                `}
                fragmentShader={`
                  #include <common>
                  #include <logdepthbuf_pars_fragment>
                  uniform sampler2D uRingTexture;
                  uniform vec3 uSunDir;
                  uniform vec3 uSunDirLocal;
                  varying vec3 vLocalPos;
                  varying vec3 vWorldNormal;
                  varying vec2 vUv;
                  void main() {
                    #include <logdepthbuf_fragment>
                    vec4 ring = texture2D(uRingTexture, vUv);
                    if (ring.a < 0.01) discard;
                    
                    float nDotL = abs(dot(vWorldNormal, normalize(uSunDir)));
                    float diffuse = max(0.18, nDotL);
                    
                    vec3 L = normalize(uSunDirLocal);
                    float eps = 0.9;
                    float A = L.x * L.x + (L.y / eps) * (L.y / eps) + L.z * L.z;
                    float B = 2.0 * (vLocalPos.x * L.x + vLocalPos.z * L.z);
                    float C = vLocalPos.x * vLocalPos.x + vLocalPos.z * vLocalPos.z - 1.0;
                    float Delta = B * B - 4.0 * A * C;
                    
                    float inShadow = 0.0;
                    if (B < 0.0 && Delta > 0.0) {
                      inShadow = smoothstep(-0.02, 0.08, Delta);
                    }
                    
                    float finalLight = mix(diffuse * 1.45, 0.025, inShadow);
                    gl_FragColor = vec4(ring.rgb * finalLight, ring.a);
                  }
                `}
              />
            </mesh>
          </>
        )
      }
      if (o.id === 'uranus') {
        return (
          <>
            <mesh rotation={[1.706, 0, 0]} name="spin">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getUranusTexture()}
                roughness={0.82}
                metalness={0}
              />
            </mesh>
            <AtmosphereMesh scale={1.025} color="#6bd3e8" sunDir={planetaryUniforms.uUranusSunDir} power={3.4} intensity={1.5} />
          </>
        )
      }
      if (o.id === 'neptune') {
        return (
          <>
            <mesh rotation={[0.494, 0, 0]} name="spin">
              <SphereGeo />
              <meshStandardMaterial
                map={A.getNeptuneTexture()}
                roughness={0.82}
                metalness={0}
              />
            </mesh>
            <AtmosphereMesh scale={1.025} color="#3f78ff" sunDir={planetaryUniforms.uNeptuneSunDir} power={3.4} intensity={1.8} />
          </>
        )
      }

      // Check scientific Solar System catalogue
      const sb = SOLAR_BODY_BY_ID[o.id]
      if (sb) {
        const geo = sb.physical.triaxialKm
          ? getIrregularGeometry(sb.id, sb.physical.triaxialKm, sb.physical.meanRadiusKm, sb.appearance.relief ?? 0)
          : null

        const tex = sb.appearance.texture
          ? A.loadScientificTexture(sb.appearance.texture)
          : T.planetTexture(sb.id, sb.appearance.color)

        if (sb.id === 'titan') {
          return (
            <group>
              <mesh name="spin">
                <SphereGeo />
                <meshStandardMaterial color="#c98f45" roughness={0.92} metalness={0} />
              </mesh>
              {/* Dense photochemical nitrogen-methane haze deck */}
              <mesh scale={1.035}>
                <SphereGeo />
                <meshStandardMaterial color="#d9a05a" transparent opacity={0.88} roughness={0.9} depthWrite={false} />
              </mesh>
              {/* Atmospheric limb Rayleigh glow */}
              <mesh scale={1.065}>
                <SphereGeo />
                <shaderMaterial
                  transparent
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.BackSide}
                  vertexShader={
                    '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}'
                  }
                  fragmentShader={
                    '#include <common>\n#include <logdepthbuf_pars_fragment>\nvarying vec3 vN; void main(){\n#include <logdepthbuf_fragment>\n float i = pow(max(0.0, 0.72 - dot(vN, vec3(0,0,1.0))), 3.0); gl_FragColor = vec4(0.95,0.62,0.22,1.0)*i*2.2; }'
                  }
                />
              </mesh>
            </group>
          )
        }

        if (sb.id === 'europa') {
          return (
            <mesh name="spin">
              <SphereGeo />
              <meshStandardMaterial map={tex} roughness={0.38} metalness={0.06} />
            </mesh>
          )
        }

        if (sb.id === 'io') {
          return (
            <mesh name="spin">
              <SphereGeo />
              <meshStandardMaterial map={tex} roughness={0.82} metalness={0.04} />
            </mesh>
          )
        }

        if (sb.id === 'enceladus') {
          return (
            <group>
              <mesh name="spin">
                <SphereGeo />
                <meshStandardMaterial map={tex} roughness={0.28} metalness={0.02} />
              </mesh>
              {/* Illustrative south-polar cryovolcanic plume */}
              <sprite position={[0, -1.18, 0]} scale={[0.9, 0.9, 1]}>
                <spriteMaterial map={T.glowTexture('#a0d8ff')} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
              </sprite>
            </group>
          )
        }

        if (sb.id === 'pluto') {
          return (
            <group>
              <mesh name="spin">
                <SphereGeo />
                <meshStandardMaterial map={tex} roughness={0.82} metalness={0} />
              </mesh>
              {/* Blue atmospheric limb haze */}
              <mesh scale={1.03}>
                <SphereGeo />
                <shaderMaterial
                  transparent
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.BackSide}
                  vertexShader={
                    '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}'
                  }
                  fragmentShader={
                    '#include <common>\n#include <logdepthbuf_pars_fragment>\nvarying vec3 vN; void main(){\n#include <logdepthbuf_fragment>\n float i = pow(max(0.0, 0.75 - dot(vN, vec3(0,0,1.0))), 3.5); gl_FragColor = vec4(0.35,0.65,1.0,1.0)*i*1.8; }'
                  }
                />
              </mesh>
            </group>
          )
        }

        const roughness = sb.id === 'callisto' ? 0.94 : sb.id === 'triton' ? 0.52 : geo ? 0.92 : 0.85
        return (
          <mesh name="spin">
            {geo ? <primitive object={geo} attach="geometry" /> : <SphereGeo />}
            <meshStandardMaterial map={tex} roughness={roughness} metalness={0} />
          </mesh>
        )
      }

      return (
        <mesh rotation={[0, 0, o.id === 'uranus' ? Math.PI / 2 : 0.2]} name="spin">
          <SphereGeo />
          <meshStandardMaterial
            map={T.planetTexture(o.id, o.color)}
            color="#ffffff"
            roughness={0.85}
            metalness={0}
          />
        </mesh>
      )
  }
  return null
}

/** Mounts one group per catalogue object; positions are updated imperatively each frame. */
function Objects() {
  const objects = useStore((s) => s.objectsVersion)
  const refs = useRef<Record<string, THREE.Group | null>>({})
  const hit = useRef<Record<string, THREE.Mesh | null>>({})
  const ring = useRef<Record<string, THREE.Sprite | null>>({})
  const sunLight = useRef<THREE.PointLight>(null)
  const { camera, size } = useThree()
  const list = useMemo(() => [...OBJECTS], [objects])

  useFrame(() => {
    const st = useStore.getState()
    const ms = st.simMs
    const S = nav.scale
    const angPx = (14 / size.height) * (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
    const cam = nav.pos
    labelState.items.length = 0

    if (eventState.activeId) {
      list.forEach((o) => {
        const g = refs.current[o.id]
        if (g) g.visible = false
      })
      return
    }

    for (const o of list) {
      const g = refs.current[o.id]
      if (!g) continue
      const P = positionOf(o, ms)
      const rel = sub(P, cam)
      const dLy = len(rel)
      const u = dLy / S
      const du = compressDistance(u)
      const k = u > 0 ? du / u : 1
      const t3 = toThree(rel)
      g.position.set((t3[0] / S) * k, (t3[1] / S) * k, (t3[2] / S) * k)
      const rTrue = radiusLyOf(o)
      const isStar = o.visual === 'star'
      const rReal = (rTrue / S) * k
      const rMin = du * (isStar ? 0.006 : angPx * 0.5)
      let r = Math.max(rReal, rMin)
      if (o.visual === 'marker' && rTrue === 0) r = rMin
      g.scale.setScalar(Math.max(r, 1e-9))

      // fade big sprites when the camera is inside / very close, or when observer is at stellar scale
      const inside = EXTENDED.has(o.category) && dLy < rTrue * 1.05
      const isExtragalactic = (o.category === 'galaxy' || o.category === 'cluster' || o.category === 'supercluster') && o.id !== 'milky-way'
      g.children.forEach((c) => {
        if (c.name === 'fade') {
          let op = THREE.MathUtils.clamp((dLy / Math.max(rTrue, 1) - 0.25) / 1.0, 0, 1)
          if (isExtragalactic && S < 5 && dLy > 50000) {
            op *= THREE.MathUtils.clamp((S - 0.005) / 2.0, 0, 1)
          }
          if ((c as any).material) {
            ;(c as any).material.opacity = op
          } else {
            c.traverse((child: any) => {
              if (child.material) child.material.opacity = op
            })
          }
        }
        if (c.name === 'spin') {
          const sb = SOLAR_BODY_BY_ID[o.id]
          if (sb) {
            if (sb.rotation.kind === 'synchronous') {
              const Pdays = periodDays(sb.orbit.elements) ?? 1
              c.rotation.y = ((ms / 86400000) * Math.PI * 2) / Pdays
            } else if (sb.rotation.kind === 'spin') {
              c.rotation.y = ((ms / 3600000) * Math.PI * 2) / sb.rotation.periodHours
            } else if (sb.rotation.kind === 'synchronous-binary') {
              c.rotation.y = ((ms / 86400000) * Math.PI * 2) / 6.38723
            } else if (sb.rotation.kind === 'chaotic') {
              c.rotation.y = (ms / 86400000) * 1.5
              c.rotation.x = (ms / 86400000) * 0.7
            } else {
              c.rotation.y = (ms / 86400000) * 0.1
            }
          } else {
            c.rotation.y = ((ms / 86400000) * Math.PI * 2) * (o.id === 'earth' ? 1 : o.id === 'jupiter' ? 2.4 : 0.1)
          }
        }
        if (c.name === 'earth-clouds')
          c.rotation.y = ((ms / 86400000) * Math.PI * 2) * 1.06 + 0.1
      })

      // Also traverse for nested spin meshes (e.g. Titan, Enceladus, Pluto)
      g.traverse((c) => {
        if (c.name === 'spin') {
          const sb = SOLAR_BODY_BY_ID[o.id]
          if (sb) {
            if (sb.rotation.kind === 'synchronous') {
              const Pdays = periodDays(sb.orbit.elements) ?? 1
              c.rotation.y = ((ms / 86400000) * Math.PI * 2) / Pdays
            } else if (sb.rotation.kind === 'spin') {
              c.rotation.y = ((ms / 3600000) * Math.PI * 2) / sb.rotation.periodHours
            } else if (sb.rotation.kind === 'synchronous-binary') {
              c.rotation.y = ((ms / 86400000) * Math.PI * 2) / 6.38723
            } else if (sb.rotation.kind === 'chaotic') {
              c.rotation.y = (ms / 86400000) * 1.5
              c.rotation.x = (ms / 86400000) * 0.7
            }
          }
        }
      })

      g.visible = !(isExtragalactic && S < 0.05 && dLy > 50000) && (o.visual !== 'milkyway' || dLy > rTrue * 0.9 || true)
      const h = hit.current[o.id]
      if (h) {
        h.visible = !inside
        h.scale.setScalar(EXTENDED.has(o.category) && rReal > rMin ? 0.4 : 1)
      }
      const rg = ring.current[o.id]
      if (rg) {
        const isClose = dLy < rTrue * 8
        rg.visible = st.selectedId === o.id && !isClose
        rg.scale.setScalar(EXTENDED.has(o.category) && rReal > rMin ? 1.15 : 2.85)
        ;(rg.material as THREE.SpriteMaterial).opacity = 0.75
      }
      if (o.id === 'sun' && sunLight.current) sunLight.current.position.copy(g.position)
      labelState.items.push({ id: o.id, pos: g.position.clone(), dLy, rTrue, rVisual: Math.max(r, 1e-9), o })
    }

    // Update solar directions for planetary materials and shaders
    const sunPosScene = refs.current['sun'] ? refs.current['sun']!.position : new THREE.Vector3(0, 0, 0)
    if (refs.current['earth']) {
      planetaryUniforms.uEarthSunDir.value.subVectors(sunPosScene, refs.current['earth']!.position).normalize()
    }
    if (refs.current['saturn']) {
      const satSun = new THREE.Vector3().subVectors(sunPosScene, refs.current['saturn']!.position).normalize()
      planetaryUniforms.uSaturnSunDir.value.copy(satSun)
      const satQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.466, 0, 0.1))
      satSun.applyQuaternion(satQuat.clone().invert()).normalize()
      planetaryUniforms.uSaturnSunDirLocal.value.copy(satSun)
    }
    if (refs.current['mars']) {
      planetaryUniforms.uMarsSunDir.value.subVectors(sunPosScene, refs.current['mars']!.position).normalize()
    }
    if (refs.current['venus']) {
      planetaryUniforms.uVenusSunDir.value.subVectors(sunPosScene, refs.current['venus']!.position).normalize()
    }
    if (refs.current['uranus']) {
      planetaryUniforms.uUranusSunDir.value.subVectors(sunPosScene, refs.current['uranus']!.position).normalize()
    }
    if (refs.current['neptune']) {
      planetaryUniforms.uNeptuneSunDir.value.subVectors(sunPosScene, refs.current['neptune']!.position).normalize()
    }
  })

  return (
    <>
      <pointLight ref={sunLight} intensity={4.5} distance={0} decay={0} color="#fff6ea" />
      <ambientLight intensity={0.035} />
      {list.map((o) => (
        <group key={o.id} ref={(el) => { refs.current[o.id] = el }}>
          <mesh
            ref={(el) => { hit.current[o.id] = el }}
            onClick={(e) => {
              e.stopPropagation()
              useStore.getState().select(o.id)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              useStore.getState().travel(o.id)
            }}
          >
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
          <ObjectVisual o={o} />
          <sprite ref={(el) => { ring.current[o.id] = el }} visible={false}>
            <spriteMaterial map={T.selectRingTexture()} transparent depthTest={false} />
          </sprite>
        </group>
      ))}
    </>
  )
}

const HELIO_BODIES = [
  { id: 'mercury', color: '#888078' },
  { id: 'venus', color: '#c8a870' },
  { id: 'earth', color: '#6fb0ff' },
  { id: 'mars', color: '#ff7050' },
  { id: 'jupiter', color: '#e0a060' },
  { id: 'saturn', color: '#eedd88' },
  { id: 'uranus', color: '#70d0d0' },
  { id: 'neptune', color: '#5080ff' },
  { id: 'ceres', color: '#90a0b0' },
  { id: 'vesta', color: '#a0a8b8' },
  { id: 'pallas', color: '#9098a8' },
  { id: 'hygiea', color: '#8890a0' },
  { id: 'pluto', color: '#d8b090' },
  { id: 'haumea', color: '#a0b0c0' },
  { id: 'makemake', color: '#b09888' },
  { id: 'eris', color: '#c0c8d8' },
]

interface SatelliteSystemSpec {
  parentKey: string
  maxDistLy: number
  moons: { id: string; color: string }[]
}

const SATELLITE_SYSTEMS: SatelliteSystemSpec[] = [
  {
    parentKey: 'earth',
    maxDistLy: 0.0001,
    moons: [{ id: 'moon', color: '#8899aa' }],
  },
  {
    parentKey: 'mars',
    maxDistLy: 0.00005,
    moons: [
      { id: 'phobos', color: '#c07060' },
      { id: 'deimos', color: '#b08070' },
    ],
  },
  {
    parentKey: 'jupiter',
    maxDistLy: 0.0006,
    moons: [
      { id: 'io', color: '#e0c030' },
      { id: 'europa', color: '#90d0f0' },
      { id: 'ganymede', color: '#c0b098' },
      { id: 'callisto', color: '#888078' },
      { id: 'amalthea', color: '#a06050' },
      { id: 'thebe', color: '#707880' },
      { id: 'metis', color: '#687078' },
      { id: 'adrastea', color: '#687078' },
      { id: 'himalia', color: '#607080' },
      { id: 'elara', color: '#607080' },
    ],
  },
  {
    parentKey: 'saturn',
    maxDistLy: 0.0006,
    moons: [
      { id: 'mimas', color: '#9098a8' },
      { id: 'enceladus', color: '#b0e0ff' },
      { id: 'tethys', color: '#98a8c0' },
      { id: 'dione', color: '#98a8c0' },
      { id: 'rhea', color: '#a0a8b8' },
      { id: 'titan', color: '#e89530' },
      { id: 'hyperion', color: '#a89880' },
      { id: 'iapetus', color: '#888070' },
      { id: 'phoebe', color: '#606870' },
      { id: 'janus', color: '#788088' },
      { id: 'epimetheus', color: '#788088' },
      { id: 'pan', color: '#788088' },
      { id: 'atlas', color: '#788088' },
      { id: 'prometheus', color: '#788088' },
      { id: 'pandora', color: '#788088' },
      { id: 'helene', color: '#788088' },
    ],
  },
  {
    parentKey: 'uranus',
    maxDistLy: 0.0003,
    moons: [
      { id: 'miranda', color: '#a0b0c0' },
      { id: 'ariel', color: '#b8c8d8' },
      { id: 'umbriel', color: '#707880' },
      { id: 'titania', color: '#98a8b8' },
      { id: 'oberon', color: '#8890a0' },
      { id: 'puck', color: '#687078' },
    ],
  },
  {
    parentKey: 'neptune',
    maxDistLy: 0.0004,
    moons: [
      { id: 'triton', color: '#40c0d8' },
      { id: 'proteus', color: '#707880' },
      { id: 'nereid', color: '#607080' },
      { id: 'larissa', color: '#687078' },
      { id: 'galatea', color: '#687078' },
      { id: 'despina', color: '#687078' },
    ],
  },
  {
    parentKey: 'pluto',
    maxDistLy: 0.00005,
    moons: [
      { id: 'charon', color: '#c0a090' },
      { id: 'styx', color: '#788088' },
      { id: 'nix', color: '#889098' },
      { id: 'kerberos', color: '#788088' },
      { id: 'hydra', color: '#9098a0' },
    ],
  },
]

function OrbitLines() {
  const helioRef = useRef<THREE.Group>(null)
  const satRefs = useRef<Record<string, THREE.Group | null>>({})
  const showOrbits = useStore((s) => s.showOrbits)

  // Heliocentric orbit lines
  const helioLines = useMemo(() => {
    return HELIO_BODIES.map(({ id, color }) => {
      let ptsLy: Vec3[]
      if (PLANET_IDS.includes(id)) {
        ptsLy = orbitPolylineLy(id, Date.now(), 200)
      } else {
        const sb = SOLAR_BODY_BY_ID[id]
        if (!sb) return null
        const ptsKm = orbitPathKm(sb.orbit.elements, Date.now(), 200)
        ptsLy = ptsKm.map((p) => scaleVec(p, KM_TO_LY))
      }
      const g = new THREE.BufferGeometry().setFromPoints(ptsLy.map((p) => new THREE.Vector3(...toThree(p))))
      const isMinor = !PLANET_IDS.includes(id)
      return new THREE.Line(
        g,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: isMinor ? 0.22 : 0.45, depthTest: true, depthWrite: false })
      )
    }).filter(Boolean) as THREE.Line[]
  }, [])

  // Satellite system orbit lines
  const satLines = useMemo(() => {
    const map: Record<string, THREE.Line[]> = {}
    SATELLITE_SYSTEMS.forEach((sys) => {
      const lines: THREE.Line[] = []
      sys.moons.forEach(({ id, color }) => {
        const sb = SOLAR_BODY_BY_ID[id]
        if (!sb) return
        const ptsKm = orbitPathKm(sb.orbit.elements, Date.now(), 140)
        let ptsLy: Vec3[]
        if (sys.parentKey === 'pluto' && sb.id === 'charon') {
          ptsLy = ptsKm.map((p) => scaleVec(p, (1 / (1 + CHARON_PLUTO_MASS_RATIO)) * KM_TO_LY))
        } else {
          ptsLy = ptsKm.map((p) => scaleVec(p, KM_TO_LY))
        }
        const g = new THREE.BufferGeometry().setFromPoints(ptsLy.map((p) => new THREE.Vector3(...toThree(p))))
        lines.push(
          new THREE.Line(
            g,
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, depthTest: true, depthWrite: false })
          )
        )
      })

      // For Pluto, add Pluto's mutual orbit around the barycenter
      if (sys.parentKey === 'pluto' && SOLAR_BODY_BY_ID.charon) {
        const charonKm = orbitPathKm(SOLAR_BODY_BY_ID.charon.orbit.elements, Date.now(), 140)
        const plutoLy = charonKm.map((p) => scaleVec(p, (-CHARON_PLUTO_MASS_RATIO / (1 + CHARON_PLUTO_MASS_RATIO)) * KM_TO_LY))
        const g = new THREE.BufferGeometry().setFromPoints(plutoLy.map((p) => new THREE.Vector3(...toThree(p))))
        lines.push(
          new THREE.Line(
            g,
            new THREE.LineBasicMaterial({ color: '#d8b090', transparent: true, opacity: 0.6, depthTest: true, depthWrite: false })
          )
        )
      }

      map[sys.parentKey] = lines
    })
    return map
  }, [])

  useFrame(() => {
    const hg = helioRef.current
    if (!hg) return
    if (eventState.activeId) {
      hg.visible = false
      SATELLITE_SYSTEMS.forEach((s) => {
        const g = satRefs.current[s.parentKey]
        if (g) g.visible = false
      })
      return
    }

    const st = useStore.getState()
    const ms = st.simMs
    const S = nav.scale

    // Update heliocentric orbits
    const relSun = sub(SUN_POS, nav.pos)
    const dSun = len(relSun)
    hg.visible = showOrbits && dSun < 0.045
    if (hg.visible) {
      const t3 = toThree(relSun)
      hg.position.set(t3[0] / S, t3[1] / S, t3[2] / S)
      hg.scale.setScalar(1 / S)

      // Contextually fade orbit line if camera is closely inspecting that planet
      const activeId = st.selectedId || nav.followId
      HELIO_BODIES.forEach(({ id }, idx) => {
        const line = helioLines[idx]
        if (!line) return
        const isMinor = !PLANET_IDS.includes(id)
        let baseOp = isMinor ? 0.22 : 0.45
        if (activeId === id) {
          baseOp = 0.0
        } else if (!isMinor) {
          const pPos = planetRootPos(id, ms)
          const distToPlanet = len(sub(pPos, nav.pos))
          const pRadLy = (PLANET_RADIUS_KM[id] || 6000) * KM_TO_LY
          if (distToPlanet < pRadLy * 150) {
            baseOp = 0.0
          }
        }
        ;(line.material as THREE.LineBasicMaterial).opacity = baseOp
      })
    }

    // Update satellite system orbits
    SATELLITE_SYSTEMS.forEach((sys) => {
      const g = satRefs.current[sys.parentKey]
      if (!g) return

      let parentPos: Vec3
      if (sys.parentKey === 'pluto') {
        parentPos = add(SUN_POS, scaleVec(positionAtMs(PLUTO_BODY.orbit.elements, ms), KM_TO_LY))
      } else {
        parentPos = planetRootPos(sys.parentKey, ms)
      }

      const rel = sub(parentPos, nav.pos)
      const d = len(rel)
      const fade = THREE.MathUtils.clamp((sys.maxDistLy - d) / (sys.maxDistLy * 0.35), 0, 1)
      const visible = showOrbits && fade > 0.01
      g.visible = visible
      if (visible) {
        const t3 = toThree(rel)
        g.position.set(t3[0] / S, t3[1] / S, t3[2] / S)
        g.scale.setScalar(1 / S)
        const lines = satLines[sys.parentKey]
        if (lines) {
          lines.forEach((l) => {
            ;(l.material as THREE.LineBasicMaterial).opacity = 0.55 * fade
          })
        }
      }
    })
  })

  return (
    <>
      <group ref={helioRef}>
        {helioLines.map((l, i) => (
          <primitive key={i} object={l} />
        ))}
      </group>
      {SATELLITE_SYSTEMS.map((sys) => (
        <group key={sys.parentKey} ref={(el) => { satRefs.current[sys.parentKey] = el }}>
          {satLines[sys.parentKey]?.map((l, i) => (
            <primitive key={i} object={l} />
          ))}
        </group>
      ))}
    </>
  )
}

function Backdrop() {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => buildBackdrop(), [])
  useFrame(() => {
    if (ref.current) ref.current.position.set(0, 0, 0)
  })
  return (
    <points ref={ref} geometry={geo} frustumCulled={false} renderOrder={-100} raycast={() => null}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors transparent opacity={0.9} depthWrite={false} depthTest={false} />
    </points>
  )
}

function GalaxyAndWeb() {
  const gal = useRef<THREE.Group>(null)
  const web = useRef<THREE.Group>(null)
  const grid = useRef<THREE.Group>(null)
  const quality = useStore((s) => s.quality)
  const showGrid = useStore((s) => s.showGrid)
  const galGeo = useMemo(() => buildGalaxy(quality === 'performance' ? 25000 : quality === 'high' ? 110000 : 60000), [quality])
  const webGeo = useMemo(() => buildCosmicWeb(quality === 'performance' ? 8000 : 22000), [quality])

  const gridObj = useMemo(() => {
    const g = new THREE.Group()
    for (let r = 10000; r <= 50000; r += 10000) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 128; i++) pts.push(new THREE.Vector3(Math.cos((i / 128) * 6.2832) * r, 0, Math.sin((i / 128) * 6.2832) * r))
      g.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: '#2a5a7a', transparent: true, opacity: 0.5 })
        )
      )
    }
    return g
  }, [])

  useFrame(() => {
    const S = nav.scale
    const rel = toThree(sub([0, 0, 0], nav.pos))
    const dGc = len(nav.pos)
    if (gal.current) {
      gal.current.visible = dGc < 8e6 && S > 1e-4
      gal.current.position.set(rel[0] / S, rel[1] / S, rel[2] / S)
      gal.current.scale.setScalar(1 / S)
      const mat = (gal.current.children[0] as THREE.Points).material as THREE.ShaderMaterial
      mat.uniforms.uFade.value = THREE.MathUtils.clamp(1.4 - Math.log10(Math.max(dGc, 1)) / 6.5, 0.15, 1)
    }
    if (grid.current) {
      grid.current.visible = showGrid && dGc < 3e6
      grid.current.position.set(rel[0] / S, rel[1] / S, rel[2] / S)
      grid.current.scale.setScalar(1 / S)
    }
    if (web.current) {
      web.current.visible = S > 500
      web.current.position.set(rel[0] / S, rel[1] / S, rel[2] / S)
      web.current.scale.setScalar(1 / S)
    }
  })

  return (
    <>
      <group ref={gal}>
        <points geometry={galGeo} frustumCulled={false} raycast={() => null}>
          <shaderMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uniforms={{ uFade: { value: 1 } }}
            vertexShader={
              '#include <common>\n#include <logdepthbuf_pars_vertex>\nattribute float aSize; attribute vec3 aColor; varying vec3 vC; void main(){ vC = aColor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize; gl_Position = projectionMatrix*mv;\n#include <logdepthbuf_vertex>\n}'
            }
            fragmentShader={
              '#include <common>\n#include <logdepthbuf_pars_fragment>\nuniform float uFade; varying vec3 vC; void main(){\n#include <logdepthbuf_fragment>\n vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(d)); gl_FragColor = vec4(vC*a*0.55*uFade, a*0.55*uFade); }'
            }
          />
        </points>
      </group>
      <group ref={grid}>
        <primitive object={gridObj} />
      </group>
      <group ref={web}>
        <points geometry={webGeo} frustumCulled={false} raycast={() => null}>
          <pointsMaterial size={1.3} sizeAttenuation={false} vertexColors transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>
    </>
  )
}

function DatasetLayer() {
  const pts = useStore((s) => s.datasetPoints)
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const arr = new Float32Array(pts.length * 3)
    pts.forEach((p, i) => {
      const t = toThree(p.pos as Vec3)
      arr[i * 3] = t[0]
      arr[i * 3 + 1] = t[1]
      arr[i * 3 + 2] = t[2]
    })
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [pts])

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const rel = toThree(sub([0, 0, 0], nav.pos))
    g.position.set(rel[0] / nav.scale, rel[1] / nav.scale, rel[2] / nav.scale)
    g.scale.setScalar(1 / nav.scale)
  })

  if (!pts.length) return null
  return (
    <points ref={ref} geometry={geo} frustumCulled={false} raycast={() => null}>
      <pointsMaterial size={6} sizeAttenuation={false} color="#ffe14d" depthTest={false} transparent opacity={0.95} />
    </points>
  )
}

/** Renders Spacecraft model in Chase and External camera views during Travel Mode */
function SpacecraftLayer() {
  const phase = useStore((s) => s.phase)
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const grp = groupRef.current
    if (!grp) return
    grp.visible = phase === 'travel' && ship.cameraView !== 'cockpit'
    if (!grp.visible) return

    const rel = toThree(sub(ship.pos, nav.pos))
    const S = nav.scale
    grp.position.set(rel[0] / S, rel[1] / S, rel[2] / S)
    grp.quaternion.copy(ship.quat)
  })

  if (phase !== 'travel') return null

  return (
    <group ref={groupRef}>
      <SpacecraftModel />
    </group>
  )
}

const rigInit = { done: false }

/** Drives navigation + time + camera each frame across Explore and Travel modes. */
function Rig() {
  const { camera, scene } = useThree()
  if (typeof window !== 'undefined') {
    ;(window as any).__scene = scene
    ;(window as any).__camera = camera
  }
  const inputRef = Controls.input

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const st = useStore.getState()

    if (!rigInit.done) {
      rigInit.done = true
      const sunDir = new THREE.Vector3(0.55, 0.28, 0.78).normalize()
      setCameraAt([SUN_POS[0] + 1e9 * sunDir.x, SUN_POS[1] - 1e9 * sunDir.z, SUN_POS[2] + 1e9 * sunDir.y], [-3e8, 1e8, 0])
    }

    advanceSim(dt)

    if (eventState.activeId) {
      stepEventTime(dt)
      const { yaw, pitch, dist } = eventState.cameraAngle
      const cx = Math.sin(yaw) * Math.cos(pitch) * dist
      const cy = Math.sin(pitch) * dist
      const cz = Math.cos(yaw) * Math.cos(pitch) * dist
      camera.position.set(cx, cy, cz)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      labelState.camera = camera
      return
    }

    if (st.phase === 'travel') {
      // TRAVEL MODE: Spacecraft simulation drives flight physics and camera
      stepShipPhysics(dt, st.simMs, travelInput)
      updateNearest(st.simMs)
      const S = Math.max(1e-12, adaptiveScale(nav.nearestSurface))
      nav.scale = S

      const q = ship.quat
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)

      if (ship.cameraView === 'cockpit') {
        // Cockpit first-person: camera is positioned at the cockpit
        nav.pos = [...ship.pos]
        nav.quat.copy(ship.quat)
      } else if (ship.cameraView === 'chase') {
        // Chase view: camera follows 14 units behind and 3.5 units above
        const chaseDistUnits = 14
        const chaseHeightUnits = 3.5
        const camOffsetThree = fwd
          .clone()
          .multiplyScalar(-chaseDistUnits * S)
          .add(up.clone().multiplyScalar(chaseHeightUnits * S))
        nav.pos = add(ship.pos, fromThree([camOffsetThree.x, camOffsetThree.y, camOffsetThree.z]))

        // Look toward target point ahead of spacecraft
        const lookTargetThree = fwd.clone().multiplyScalar(25 * S)
        const lookTarget = add(ship.pos, fromThree([lookTargetThree.x, lookTargetThree.y, lookTargetThree.z]))
        const relToCam = toThree(sub(lookTarget, nav.pos))
        const m = new THREE.Matrix4().lookAt(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(...relToCam).normalize(),
          up
        )
        nav.quat.setFromRotationMatrix(m)
      } else {
        // External orbit view: camera rotates around spacecraft
        const orbitDist = ship.orbitAngle.dist * S
        const orbitPitch = ship.orbitAngle.pitch
        const orbitYaw = ship.orbitAngle.yaw

        const camOffset = new THREE.Vector3(
          Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist,
          Math.sin(orbitPitch) * orbitDist,
          Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist
        ).applyQuaternion(q)

        nav.pos = add(ship.pos, fromThree([camOffset.x, camOffset.y, camOffset.z]))
        const relToShip = toThree(sub(ship.pos, nav.pos))
        const m = new THREE.Matrix4().lookAt(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(...relToShip).normalize(),
          up
        )
        nav.quat.setFromRotationMatrix(m)
      }

      camera.position.set(0, 0, 0)
      camera.quaternion.copy(nav.quat)
      camera.updateMatrixWorld()
      labelState.camera = camera
      return
    }

    // EXPLORE / TOUR / INTRO MODE: Standard camera navigation
    const inp = inputRef
    if (st.phase === 'intro') {
      inp.yaw += dt * 0.025
    }
    if (travelEngineState.phase === 'traveling') {
      stepTravel(dt, st.simMs)
    } else {
      stepNavigation(dt, useStore.getState().simMs, inp)
    }
    inp.yaw = 0
    inp.pitch = 0
    inp.panX = 0
    inp.panY = 0
    inp.dolly = 0
    updateNearest(useStore.getState().simMs)
    nav.scale = adaptiveScale(nav.nearestSurface)
    camera.position.set(0, 0, 0)
    camera.quaternion.copy(nav.quat)
    camera.updateMatrixWorld()
    labelState.camera = camera
  })

  return null
}

function GLWatch() {
  const { gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault()
      useStore.getState().set({ error: 'WebGL context lost. Click "Recover" to reload the scene.' })
    }
    const restored = () => useStore.getState().set({ error: null })
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl])

  useEffect(() => {
    const q = useStore.getState().quality
    gl.setPixelRatio(Math.min(window.devicePixelRatio, q === 'performance' ? 1 : q === 'balanced' ? 1.5 : 2))
  }, [gl])

  return null
}

function ActiveControls() {
  const phase = useStore((s) => s.phase)
  const [eventActive, setEventActive] = useState(eventState.activeId !== null)

  useEffect(() => {
    return subscribeEventState(() => {
      setEventActive(eventState.activeId !== null)
    })
  }, [])

  if (eventActive) {
    return <EventControls />
  }
  return phase === 'travel' ? <TravelControlsComponent /> : <Controls.Component />
}

export function CosmicCanvas() {
  const quality = useStore((s) => s.quality)

  return (
    <Canvas
      key={quality}
      gl={{
        antialias: quality !== 'performance',
        logarithmicDepthBuffer: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      dpr={quality === 'performance' ? 1 : quality === 'balanced' ? [1, 1.5] : [1, 2]}
      camera={{ fov: 55, near: 0.001, far: 1e13, position: [0, 0, 0] }}
      onPointerMissed={() => {}}
    >
      <color attach="background" args={['#000004']} />
      <GLWatch />
      <Rig />
      <Backdrop />
      <GalaxyAndWeb />
      <OrbitLines />
      <AsteroidBeltLayer />
      <DatasetLayer />
      <Objects />
      <CosmicEventLayer />
      <SpacecraftLayer />
      <WarpEffect />
      <ActiveControls />
    </Canvas>
  )
}

export { isDynamic, LY_PER_AU, interrupt }
