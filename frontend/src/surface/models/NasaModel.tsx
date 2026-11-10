import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { NASA_MODEL_BY_ID, NasaModelSpec } from './nasaModels'
import { measure, calibrationScale, runChecks, Measured, CheckResult } from './measure'

/** Draco decoder is self-hosted (public/draco/) — no third-party CDN at runtime */
export const DRACO_PATH = '/draco/'

export interface ProcessedModel {
  spec: NasaModelSpec
  object: THREE.Group
  scale: number
  measured: Measured
  checks: CheckResult[]
  triangles: number
  removedMeshes: number
  /** world-space boxes of the kept meshes (metres, after scaling) — used to place colliders and inspection anchors */
  parts: { name: string; min: number[]; max: number[] }[]
}

/** results of every processed model, for the archive UI and automated tests */
export const modelResults: Record<string, Omit<ProcessedModel, 'object' | 'spec'>> = {}
if (typeof window !== 'undefined')
  (window as any).__models = {
    results: modelResults,
    /** debug: list clips, and measure a model posed with given clips at a time (used to find deployment poses) */
    clips: (id: string) => loadedModels[id]?.animations.map((c) => ({ name: c.name, duration: c.duration })),
    tryPose: (id: string, names: string[] | 'all', at: 'end' | number) => {
      const r = loadedModels[id]
      if (!r) return null
      const root = r.scene.clone(true)
      applyPose(root, r.animations, names, at)
      return measure(root)
    },
  }

/** apply animation clips at a given time (e.g. Perseverance's mast deployment) to a clone */
function applyPose(root: THREE.Object3D, clips: THREE.AnimationClip[], names: string[] | 'all', at: 'end' | number) {
  const use = names === 'all' ? clips : clips.filter((c) => names.includes(c.name))
  if (!use.length) return
  const mixer = new THREE.AnimationMixer(root)
  for (const c of use) {
    const a = mixer.clipAction(c)
    a.clampWhenFinished = true
    a.setLoop(THREE.LoopOnce, 1)
    a.play()
  }
  mixer.setTime(at === 'end' ? Math.max(...use.map((c) => c.duration)) : at)
  root.updateMatrixWorld(true)
}

const loadedModels: Record<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }> = {}

function process(spec: NasaModelSpec, scene: THREE.Object3D, animations: THREE.AnimationClip[] = []): ProcessedModel {
  loadedModels[spec.id] = { scene, animations }
  const root = scene.clone(true)
  if (spec.pose) applyPose(root, animations, spec.pose.clips, spec.pose.at)
  root.updateMatrixWorld(true)
  let removed = 0
  if (spec.remove) {
    const { minYAbove, maxYAbove } = spec.remove
    const drop: THREE.Object3D[] = []
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      const b = new THREE.Box3().setFromObject(o)
      if (b.min.y > minYAbove || b.max.y > maxYAbove) drop.push(o)
    })
    drop.forEach((o) => o.parent?.remove(o))
    removed = drop.length
  }
  let triangles = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    const g = m.geometry
    triangles += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3
  })
  const raw = measure(root)
  const scale = calibrationScale(spec, raw)
  // centre on the footprint and stand on y = 0
  const box = new THREE.Box3().setFromObject(root)
  const c = box.getCenter(new THREE.Vector3())
  const inner = new THREE.Group()
  root.position.set(-c.x, -box.min.y, -c.z)
  inner.add(root)
  const outer = new THREE.Group()
  outer.scale.setScalar(scale)
  outer.add(inner)
  outer.updateMatrixWorld(true)
  const measured = measure(outer)
  const checks = runChecks(spec, measured)
  const parts: ProcessedModel['parts'] = []
  outer.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    const b = new THREE.Box3().setFromObject(o)
    parts.push({ name: o.name, min: b.min.toArray().map((x) => +x.toFixed(3)), max: b.max.toArray().map((x) => +x.toFixed(3)) })
  })
  const res = { scale, measured, checks, triangles: Math.round(triangles), removedMeshes: removed, parts }
  modelResults[spec.id] = res
  return { spec, object: outer, ...res }
}

export function useNasaModel(id: string): ProcessedModel {
  const spec = NASA_MODEL_BY_ID[id]
  const gltf = useGLTF(spec.file, DRACO_PATH) as unknown as { scene: THREE.Object3D; animations: THREE.AnimationClip[] }
  return useMemo(() => process(spec, gltf.scene, gltf.animations), [spec, gltf.scene, gltf.animations])
}

/** renders a processed NASA model (suspends while loading — wrap in <Suspense> with a fallback) */
export function NasaModel({ id, onReady }: { id: string; onReady?: (m: ProcessedModel) => void }) {
  const m = useNasaModel(id)
  useEffect(() => onReady?.(m), [m]) // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={m.object} />
}

export const preloadNasaModel = (id: string) => useGLTF.preload(NASA_MODEL_BY_ID[id].file, DRACO_PATH)
