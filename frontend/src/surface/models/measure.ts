import * as THREE from 'three'
import type { DimCheck, NasaModelSpec } from './nasaModels'

/** world-space vertices of every mesh under root (sampled when very large) */
export function worldVertices(root: THREE.Object3D, maxPerMesh = 60000): THREE.Vector3[] {
  root.updateMatrixWorld(true)
  const out: THREE.Vector3[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    const step = Math.max(1, Math.floor(pos.count / maxPerMesh))
    for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
  })
  return out
}

export interface Measured {
  width: number
  length: number
  height: number
  /** 2 × the largest horizontal distance from the centre (rotor tip-to-tip, shield diameter) */
  maxHorizontal: number
  /** 2 × the largest horizontal radius of the lowest 15 cm of geometry (footpad span for symmetric landers) */
  lowSpan: number
  /** mean side of the triangle formed by the 3 lowest vertex clusters (three-legged landers) */
  footTriangleSide: number
  minY: number
}

export function measure(root: THREE.Object3D): Measured {
  const v = worldVertices(root)
  const box = new THREE.Box3().setFromPoints(v)
  const size = box.getSize(new THREE.Vector3())
  const c = box.getCenter(new THREE.Vector3())
  let maxH = 0
  for (const p of v) maxH = Math.max(maxH, Math.hypot(p.x - c.x, p.z - c.z))
  const low = v.filter((p) => p.y < box.min.y + 0.15 * Math.max(1, size.y / 3))
  let lowR = 0
  for (const p of low) lowR = Math.max(lowR, Math.hypot(p.x - c.x, p.z - c.z))
  // three lowest clusters: farthest-point seeding on the low vertices
  let tri = 0
  if (low.length >= 3) {
    const seeds = [low[0]]
    while (seeds.length < 3) {
      let best = low[0], bd = -1
      for (const p of low) {
        const d = Math.min(...seeds.map((s) => Math.hypot(p.x - s.x, p.z - s.z)))
        if (d > bd) { bd = d; best = p }
      }
      seeds.push(best)
    }
    const groups = seeds.map(() => [] as THREE.Vector3[])
    for (const p of low) {
      let k = 0, kd = Infinity
      seeds.forEach((s, i) => { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < kd) { kd = d; k = i } })
      groups[k].push(p)
    }
    const cen = groups.map((g) => g.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, g.length)))
    tri = (Math.hypot(cen[0].x - cen[1].x, cen[0].z - cen[1].z) + Math.hypot(cen[1].x - cen[2].x, cen[1].z - cen[2].z) + Math.hypot(cen[2].x - cen[0].x, cen[2].z - cen[0].z)) / 3
  }
  return { width: size.x, length: size.z, height: size.y, maxHorizontal: 2 * maxH, lowSpan: 2 * lowR, footTriangleSide: tri, minY: box.min.y }
}

/** scale factor that applies the model's calibration (1 for native metric models) */
export function calibrationScale(spec: NasaModelSpec, m: Measured): number {
  const c = spec.calibration
  if (c.kind === 'height') return c.valueM / m.height
  if (c.kind === 'footTriangleSide') return m.footTriangleSide > 0 ? c.valueM / m.footTriangleSide : 1
  return 1
}

export interface CheckResult extends DimCheck {
  measuredM: number
  deviation: number
  pass: boolean
}

export function runChecks(spec: NasaModelSpec, m: Measured): CheckResult[] {
  return spec.checks.map((ck) => {
    const measuredM = m[ck.measure]
    const deviation = (measuredM - ck.expectedM) / ck.expectedM
    return { ...ck, measuredM, deviation, pass: Math.abs(deviation) <= ck.tol }
  })
}
