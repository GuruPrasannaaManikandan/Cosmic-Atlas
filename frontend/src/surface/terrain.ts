/**
 * Procedural site terrain (deterministic from a seed). This is an artistic stand-in for real topography and is
 * labelled as such everywhere it is shown: it is NOT LOLA / LROC NAC DTM data (that is the Phase 3b upgrade path —
 * see docs/space-exploration/surface-exploration). What IS real: where the hardware stands and its elevation
 * differences (LRO-measured), which the terrain is flattened to match.
 */
export interface Crater {
  x: number
  z: number
  r: number
}
export interface Rock {
  x: number
  z: number
  /** radius (m) */
  r: number
  rotY: number
  squash: number
  seed: number
}
export interface Collider {
  x: number
  z: number
  r: number
  /** collider top (m above local ground); the astronaut can step onto anything lower than STEP_HEIGHT */
  h: number
  id?: string
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(ix: number, iz: number, seed: number) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed)
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1
}

export interface TerrainSpec {
  seed: number
  halfExtentM: number
  /** points that must sit at a given local elevation (hardware), with a flat radius */
  anchors: { x: number; z: number; dy: number; flatR: number }[]
}

/** what the controller, renderer and map need from any site terrain (procedural or measured) */
export interface SiteTerrain {
  readonly kind: 'procedural' | 'dtm'
  readonly rocks: Rock[]
  heightAt(x: number, z: number): number
  /** height for the distant horizon ring (beyond the data / walkable area) */
  farHeightAt(x: number, z: number): number
  normalAt(x: number, z: number, e?: number): [number, number, number]
  rockColliders(minR?: number): Collider[]
}

export class Terrain implements SiteTerrain {
  readonly kind = 'procedural' as const
  readonly craters: Crater[] = []
  readonly rocks: Rock[] = []
  readonly spec: TerrainSpec
  /** craters bucketed by CELL so heightAt only tests nearby ones */
  private grid = new Map<string, Crater[]>()
  private static CELL = 24

  constructor(spec: TerrainSpec) {
    this.spec = spec
    const rnd = mulberry32(spec.seed)
    const H = spec.halfExtentM * 1.6
    const clear = (x: number, z: number, pad: number) => spec.anchors.every((a) => Math.hypot(x - a.x, z - a.z) > a.flatR + pad)
    // crater size distribution: many small, few large (power law)
    for (let i = 0; i < 2400 && this.craters.length < 900; i++) {
      const r = 0.7 * Math.pow(1 - rnd(), -0.62)
      if (r > 34) continue
      const x = (rnd() * 2 - 1) * H, z = (rnd() * 2 - 1) * H
      if (clear(x, z, r * 1.7 + 4)) this.craters.push({ x, z, r })
    }
    const C = Terrain.CELL
    for (const c of this.craters) {
      const R = c.r * 1.8
      for (let gx = Math.floor((c.x - R) / C); gx <= Math.floor((c.x + R) / C); gx++)
        for (let gz = Math.floor((c.z - R) / C); gz <= Math.floor((c.z + R) / C); gz++) {
          const k = gx + ',' + gz
          const list = this.grid.get(k)
          if (list) list.push(c)
          else this.grid.set(k, [c])
        }
    }
    for (let i = 0; i < 2600 && this.rocks.length < 650; i++) {
      const r = 0.06 + 0.9 * Math.pow(rnd(), 3.2)
      const x = (rnd() * 2 - 1) * spec.halfExtentM * 1.2, z = (rnd() * 2 - 1) * spec.halfExtentM * 1.2
      // rocks gather near crater rims (ejecta)
      const nearRim = this.craters.some((c) => Math.abs(Math.hypot(x - c.x, z - c.z) - c.r * 1.1) < c.r * 0.35)
      if (!nearRim && rnd() < 0.55) continue
      if (clear(x, z, 2.5)) this.rocks.push({ x, z, r, rotY: rnd() * Math.PI * 2, squash: 0.45 + rnd() * 0.4, seed: Math.floor(rnd() * 1e9) })
    }
  }

  /** ground height (m) relative to the site origin */
  heightAt(x: number, z: number): number {
    const s = this.spec.seed
    let h = 1.6 * valueNoise(x / 90, z / 90, s) + 0.55 * valueNoise(x / 31, z / 31, s + 1) + 0.12 * valueNoise(x / 7, z / 7, s + 2) + 0.035 * valueNoise(x / 1.7, z / 1.7, s + 3)
    for (const c of this.grid.get(Math.floor(x / Terrain.CELL) + ',' + Math.floor(z / Terrain.CELL)) ?? []) {
      const dx = x - c.x, dz = z - c.z
      const d2 = dx * dx + dz * dz
      const R = c.r * 1.8
      if (d2 > R * R) continue
      const q = Math.sqrt(d2) / c.r
      // bowl (depth ~0.2 r), raised rim (~0.045 r), ejecta falloff
      h += q < 1 ? c.r * (0.2 * (q * q - 1) + 0.045) : c.r * 0.045 * Math.pow(Math.max(0, (1.8 - q) / 0.8), 2)
    }
    // hardware anchors: blend to the measured relative elevation inside the flat radius
    for (const a of this.spec.anchors) {
      const d = Math.hypot(x - a.x, z - a.z)
      if (d < a.flatR * 2.2) {
        const t = Math.min(1, Math.max(0, (a.flatR * 2.2 - d) / (a.flatR * 1.2)))
        const k = t * t * (3 - 2 * t)
        h = h * (1 - k) + a.dy * k
      }
    }
    return h
  }

  farHeightAt(x: number, z: number): number {
    return this.heightAt(x, z)
  }

  normalAt(x: number, z: number, e = 0.25): [number, number, number] {
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z)
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e)
    const n: [number, number, number] = [-hx, 2 * e, -hz]
    const l = Math.hypot(...n)
    return [n[0] / l, n[1] / l, n[2] / l]
  }

  rockColliders(minR = 0.28): Collider[] {
    return this.rocks.filter((r) => r.r >= minR).map((r) => ({ x: r.x, z: r.z, r: r.r * 0.9, h: r.r * r.squash * 1.6 }))
  }
}

// ------------------------------------------------------------------ measured terrain (LROC NAC DTM)

export interface DtmMeta {
  site: string
  apollo: number
  width: number
  height: number
  cellM: number
  x0: number
  z0: number
  hMin: number
  hMax: number
  lmHeightDtm: number
  lmElevationLroc: number
  lmDeltaM: number | null
  validFraction: number
  source: { product: string; productPage: string; file: string; crs: string; postSpacingM: number; bytesRead: number; accuracy: string }
}

/** decode the uint16 heightmap (0 = no data) to metres relative to the LM, filling gaps from their neighbours */
export function decodeDtm(meta: DtmMeta, buf: ArrayBuffer): Float32Array {
  const q = new Uint16Array(buf)
  const W = meta.width, H = meta.height
  if (q.length !== W * H) throw new Error(`terrain ${meta.site}: ${q.length} samples, expected ${W * H}`)
  const span = meta.hMax - meta.hMin
  const h = new Float32Array(W * H)
  let sum = 0, n = 0
  for (let i = 0; i < q.length; i++) {
    if (q[i] === 0) h[i] = NaN
    else {
      h[i] = meta.hMin + ((q[i] - 1) / 65534) * span - meta.lmHeightDtm
      sum += h[i]
      n++
    }
  }
  const mean = n ? sum / n : 0
  // gap fill: repeated neighbour averaging, then the mean for anything still empty
  for (let pass = 0; pass < 200; pass++) {
    let left = 0
    const next = h.slice()
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i
        if (!Number.isNaN(h[k])) continue
        let s = 0, c = 0
        if (i > 0 && !Number.isNaN(h[k - 1])) { s += h[k - 1]; c++ }
        if (i < W - 1 && !Number.isNaN(h[k + 1])) { s += h[k + 1]; c++ }
        if (j > 0 && !Number.isNaN(h[k - W])) { s += h[k - W]; c++ }
        if (j < H - 1 && !Number.isNaN(h[k + W])) { s += h[k + W]; c++ }
        if (c) next[k] = s / c
        else left++
      }
    h.set(next)
    if (!left) break
  }
  for (let i = 0; i < h.length; i++) if (Number.isNaN(h[i])) h[i] = mean
  return h
}

export class DtmTerrain implements SiteTerrain {
  readonly kind = 'dtm' as const
  readonly rocks: Rock[] = []
  readonly meta: DtmMeta
  private h: Float32Array
  private anchors: { x: number; z: number; y: number; flatR: number }[]
  readonly mean: number
  /** LOLA horizon beyond the DTM (optional) */
  horizon: HorizonGrid | null = null

  constructor(meta: DtmMeta, heights: Float32Array, spec: { seed: number; halfExtentM: number; anchors: { x: number; z: number; flatR: number }[] }) {
    this.meta = meta
    this.h = heights
    let s = 0
    for (const v of heights) s += v
    this.mean = s / heights.length
    // hardware sits on the measured surface: a small flat pad at the DTM height of each object
    this.anchors = spec.anchors.map((a) => ({ ...a, y: this.raw(a.x, a.z) }))
    const rnd = mulberry32(spec.seed)
    const clear = (x: number, z: number, pad: number) => this.anchors.every((a) => Math.hypot(x - a.x, z - a.z) > a.flatR + pad)
    // boulders are below the DTM's 2 m post spacing, so these are illustrative (labelled in the UI)
    for (let i = 0; i < 1500 && this.rocks.length < 380; i++) {
      const r = 0.06 + 0.8 * Math.pow(rnd(), 3.4)
      const x = (rnd() * 2 - 1) * spec.halfExtentM, z = (rnd() * 2 - 1) * spec.halfExtentM
      if (clear(x, z, 2.5)) this.rocks.push({ x, z, r, rotY: rnd() * Math.PI * 2, squash: 0.45 + rnd() * 0.4, seed: Math.floor(rnd() * 1e9) })
    }
  }

  /** bilinear sample of the DTM (clamped at the data edge) */
  raw(x: number, z: number): number {
    const m = this.meta
    const fx = Math.min(Math.max((x - m.x0) / m.cellM, 0), m.width - 1.001)
    const fz = Math.min(Math.max((z - m.z0) / m.cellM, 0), m.height - 1.001)
    const i = Math.floor(fx), j = Math.floor(fz)
    const tx = fx - i, tz = fz - j
    const W = m.width, h = this.h
    const k = j * W + i
    return h[k] * (1 - tx) * (1 - tz) + h[k + 1] * tx * (1 - tz) + h[k + W] * (1 - tx) * tz + h[k + W + 1] * tx * tz
  }

  heightAt(x: number, z: number): number {
    let y = this.raw(x, z)
    for (const a of this.anchors) {
      const d = Math.hypot(x - a.x, z - a.z)
      if (d < a.flatR * 1.6) {
        const t = Math.min(1, Math.max(0, (a.flatR * 1.6 - d) / (a.flatR * 0.6)))
        const k = t * t * (3 - 2 * t)
        y = y * (1 - k) + a.y * k
      }
    }
    return y
  }

  farHeightAt(x: number, z: number): number {
    const m = this.meta
    const x1 = m.x0 + (m.width - 1) * m.cellM, z1 = m.z0 + (m.height - 1) * m.cellM
    // distance inside the DTM rectangle (negative = outside)
    const inset = Math.min(x - m.x0, x1 - x, z - m.z0, z1 - z)
    if (!this.horizon) return inset >= 0 ? this.raw(x, z) : this.mean
    const far = this.horizon.sample(x, z)
    if (inset <= 0) return far
    // blend from the coarse LOLA surface to the DTM over 300 m inside the DTM edge (no step at the seam)
    const t = Math.min(1, inset / 300)
    return far * (1 - t) + this.raw(x, z) * t
  }

  normalAt(x: number, z: number, e = 0.5): [number, number, number] {
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z)
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e)
    const n: [number, number, number] = [-hx, 2 * e, -hz]
    const l = Math.hypot(...n)
    return [n[0] / l, n[1] / l, n[2] / l]
  }

  rockColliders(minR = 0.28): Collider[] {
    return this.rocks.filter((r) => r.r >= minR).map((r) => ({ x: r.x, z: r.z, r: r.r * 0.9, h: r.r * r.squash * 1.6 }))
  }
}

export async function loadDtm(url: string): Promise<{ meta: DtmMeta; heights: Float32Array }> {
  const meta = (await (await fetch(url)).json()) as DtmMeta
  const res = await fetch(url.replace(/\.json$/, '.bin'))
  if (!res.ok) throw new Error(`terrain ${meta.site}: HTTP ${res.status}`)
  return { meta, heights: decodeDtm(meta, await res.arrayBuffer()) }
}

// ------------------------------------------------------------------ LOLA horizon (LDEM_64)

export interface HorizonMeta {
  site: string
  width: number
  height: number
  cellM: number
  x0: number
  z0: number
  hMin: number
  hMax: number
  lmHeightLola: number
  lmHeightDtm: number
  lolaMinusDtmAtLmM: number
  reliefM: number
  source: { product: string; file: string; label: string; rowsRead: number[]; bytesRead: number }
}

/** coarse (250 m) LOLA terrain around a site, metres relative to the LM, for the distant horizon */
export class HorizonGrid {
  readonly meta: HorizonMeta
  private h: Float32Array
  constructor(meta: HorizonMeta, buf: ArrayBuffer) {
    const q = new Uint16Array(buf)
    if (q.length !== meta.width * meta.height) throw new Error(`horizon ${meta.site}: ${q.length} samples, expected ${meta.width * meta.height}`)
    this.meta = meta
    this.h = new Float32Array(q.length)
    const span = meta.hMax - meta.hMin
    for (let i = 0; i < q.length; i++) this.h[i] = meta.hMin + (q[i] / 65535) * span
  }
  sample(x: number, z: number): number {
    const m = this.meta
    const fx = Math.min(Math.max((x - m.x0) / m.cellM, 0), m.width - 1.001)
    const fz = Math.min(Math.max((z - m.z0) / m.cellM, 0), m.height - 1.001)
    const i = Math.floor(fx), j = Math.floor(fz)
    const tx = fx - i, tz = fz - j
    const W = m.width, h = this.h
    const k = j * W + i
    return h[k] * (1 - tx) * (1 - tz) + h[k + 1] * tx * (1 - tz) + h[k + W] * (1 - tx) * tz + h[k + W + 1] * tx * tz
  }
  /** horizontal half-size of the grid (m) */
  get halfExtent() {
    return Math.min(-this.meta.x0, -this.meta.z0)
  }
}

export async function loadHorizon(url: string): Promise<HorizonGrid> {
  const meta = (await (await fetch(url)).json()) as HorizonMeta
  const res = await fetch(url.replace(/\.json$/, '.bin'))
  if (!res.ok) throw new Error(`horizon ${meta.site}: HTTP ${res.status}`)
  return new HorizonGrid(meta, await res.arrayBuffer())
}
