import * as THREE from 'three'
import { toThree } from '../astro/coords'

/** Seeded PRNG so illustrative structures are deterministic between sessions. */
export function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r())

/** Background starfield on a sphere (direction only; no parallax). Illustrative. */
export function buildBackdrop(n = 6000): THREE.BufferGeometry {
  const r = mulberry(42)
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1
    const a = r() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    // concentrate toward the galactic plane for a faint Milky-Way band
    const band = r() < 0.45 ? 0.25 : 1
    const y = u * band
    const sc = Math.sqrt(Math.max(0, 1 - y * y))
    pos[i * 3] = Math.cos(a) * sc * 2000 * (band === 1 ? s / Math.max(s, 1e-6) : 1)
    pos[i * 3 + 1] = y * 2000
    pos[i * 3 + 2] = Math.sin(a) * sc * 2000
    const t = r()
    const b = 0.35 + Math.pow(r(), 3) * 0.65
    col[i * 3] = b * (t < 0.2 ? 1 : 0.85)
    col[i * 3 + 1] = b * 0.9
    col[i * 3 + 2] = b * (t > 0.7 ? 1 : 0.8)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/**
 * ILLUSTRATIVE Milky Way: bulge + disk + 4 logarithmic spiral arms. Units: ly, galactic axes mapped to three.
 * Not a measured map; the Sun marker position comes from the catalogue, not from this model.
 */
export function buildGalaxy(n: number): THREE.BufferGeometry {
  const r = mulberry(2024)
  const pos = new Float32Array(n * 3)
  const color = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const pitch = 0.22
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number
    const c = new THREE.Color()
    let sz = 1.2 + r() * 1.2
    const k = r()
    if (k < 0.2) { // bulge / bar
      const rad = Math.abs(gauss(r)) * 3500
      const a = r() * Math.PI * 2
      x = Math.cos(a) * rad * 1.5; y = Math.sin(a) * rad * 0.7; z = gauss(r) * rad * 0.35
      c.setRGB(1, 0.82 + r() * 0.1, 0.55 + r() * 0.2)
      sz *= 1.1
    } else if (k < 0.7) { // spiral arms
      const arm = Math.floor(r() * 4)
      const t = Math.pow(r(), 0.8) * 3.6 + 0.35
      const rad = 3500 * Math.exp(pitch * t * 1.55)
      const a = t * 1.35 + arm * (Math.PI / 2)
      const sp = 0.045 * rad + 220
      x = Math.cos(a) * rad + gauss(r) * sp
      y = Math.sin(a) * rad + gauss(r) * sp
      z = gauss(r) * (120 + rad * 0.006)
      const blue = r() < 0.55
      c.setRGB(blue ? 0.6 : 0.85, blue ? 0.78 : 0.82, blue ? 1 : 0.9)
    } else { // diffuse disk
      const rad = -Math.log(1 - r() * 0.98) * 14000
      const a = r() * Math.PI * 2
      x = Math.cos(a) * rad; y = Math.sin(a) * rad; z = gauss(r) * 300
      c.setRGB(0.95, 0.9, 0.8)
    }
    if (Math.hypot(x, y) > 55000) { x *= 0.5; y *= 0.5 }
    const t3 = toThree([x, y, z])
    pos[i * 3] = t3[0]; pos[i * 3 + 1] = t3[1]; pos[i * 3 + 2] = t3[2]
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
    size[i] = sz
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  return g
}

/**
 * ILLUSTRATIVE cosmic web: nodes joined by noisy filaments inside ~1.3 Gly. Not a map of real structure.
 */
export function buildCosmicWeb(n: number): THREE.BufferGeometry {
  const r = mulberry(99)
  const R = 1.3e9
  const nodes: [number, number, number][] = []
  for (let i = 0; i < 70; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rad = Math.cbrt(r()) * R
    const s = Math.sqrt(1 - u * u)
    nodes.push([Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad])
  }
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    let p: [number, number, number]
    const k = r()
    if (k < 0.12) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, rad = Math.cbrt(r()) * R
      const s = Math.sqrt(1 - u * u)
      p = [Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad]
    } else if (k < 0.55) {
      const nd = nodes[Math.floor(r() * nodes.length)]
      const sp = 2.5e7 * Math.abs(gauss(r))
      p = [nd[0] + gauss(r) * sp, nd[1] + gauss(r) * sp, nd[2] + gauss(r) * sp]
    } else {
      const a = nodes[Math.floor(r() * nodes.length)]
      // connect to one of its nearest nodes
      let best = nodes[0], bd = 1e30
      for (let tries = 0; tries < 6; tries++) {
        const b = nodes[Math.floor(r() * nodes.length)]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        if (d > 1 && d < bd) { bd = d; best = b }
      }
      const t = r()
      const sp = 1.2e7
      p = [a[0] + (best[0] - a[0]) * t + gauss(r) * sp, a[1] + (best[1] - a[1]) * t + gauss(r) * sp, a[2] + (best[2] - a[2]) * t + gauss(r) * sp]
    }
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]
    const b = 0.35 + r() * 0.6
    col[i * 3] = b * 0.7; col[i * 3 + 1] = b * 0.75; col[i * 3 + 2] = b
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
