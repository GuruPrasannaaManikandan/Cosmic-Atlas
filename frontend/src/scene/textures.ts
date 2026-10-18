import * as THREE from 'three'

/** All textures are generated procedurally (no network assets) -- illustrative, not imagery. */
const cache = new Map<string, THREE.Texture>()

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}
function finish(c: HTMLCanvasElement, key: string, srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(key, t)
  return t
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

export function glowTexture(color = '#ffffff'): THREE.Texture {
  const k = 'glow' + color
  if (cache.has(k)) return cache.get(k)!
  const [c, g] = canvas(128, 128)
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, '#ffffff')
  gr.addColorStop(0.12, color)
  gr.addColorStop(0.4, color + '55')
  gr.addColorStop(1, color + '00')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  return finish(c, k)
}

export function clusterTexture(color: string): THREE.Texture {
  const k = 'cluster' + color
  if (cache.has(k)) return cache.get(k)!
  const [c, g] = canvas(256, 256)
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, color + 'cc')
  gr.addColorStop(0.3, color + '44')
  gr.addColorStop(1, color + '00')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  const r = rng(7)
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2
    const d = Math.pow(r(), 1.7) * 120
    g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`
    g.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1.5, 1.5)
  }
  return finish(c, k)
}

export function spiralTexture(color: string): THREE.Texture {
  const k = 'spiral' + color
  if (cache.has(k)) return cache.get(k)!
  const [c, g] = canvas(256, 256)
  g.translate(128, 128)
  g.rotate(-0.5)
  g.scale(1, 0.45) // inclined disk
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120)
  gr.addColorStop(0, '#fff6dd')
  gr.addColorStop(0.15, color + 'cc')
  gr.addColorStop(1, color + '00')
  g.fillStyle = gr
  g.fillRect(-128, -128, 256, 256)
  const r = rng(3)
  for (let i = 0; i < 1800; i++) {
    const arm = i % 2
    const t = r() * 3.2
    const rad = 14 + t * 33
    const a = t * 2.2 + arm * Math.PI + (r() - 0.5) * 0.5
    g.fillStyle = `rgba(190,215,255,${0.15 + r() * 0.5})`
    g.fillRect(Math.cos(a) * rad, Math.sin(a) * rad, 1.4, 1.4)
  }
  return finish(c, k)
}

export function nebulaTexture(color: string): THREE.Texture {
  const k = 'neb' + color
  if (cache.has(k)) return cache.get(k)!
  const [c, g] = canvas(256, 256)
  const r = rng(11)
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 40; i++) {
    const x = 128 + (r() - 0.5) * 120
    const y = 128 + (r() - 0.5) * 120
    const rad = 25 + r() * 55
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, color + '33')
    gr.addColorStop(1, color + '00')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 256)
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.9})`; g.fillRect(128 + (r() - 0.5) * 200, 128 + (r() - 0.5) * 200, 1.5, 1.5) }
  return finish(c, k)
}

export function ringMarkerTexture(color: string): THREE.Texture {
  const k = 'ringm' + color
  if (cache.has(k)) return cache.get(k)!
  const [c, g] = canvas(256, 256)
  g.strokeStyle = color
  g.lineWidth = 3
  g.setLineDash([10, 8])
  g.beginPath()
  g.arc(128, 128, 118, 0, Math.PI * 2)
  g.stroke()
  return finish(c, k)
}

export function selectRingTexture(): THREE.Texture {
  if (cache.has('sel')) return cache.get('sel')!
  const [c, g] = canvas(128, 128)
  g.strokeStyle = '#7fe8ff'
  g.lineWidth = 3
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 6
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.arc(64, 64, 58, i * Math.PI / 2 - 0.2, i * Math.PI / 2 + 0.2)
    g.stroke()
  }
  return finish(c, 'sel')
}

// ----- Planet surfaces (procedural) -----
function valueNoise(seed: number) {
  const r = rng(seed)
  const N = 256
  const grid = new Float32Array(N * N)
  for (let i = 0; i < grid.length; i++) grid[i] = r()
  const at = (x: number, y: number) => grid[((y & 255) << 8) | (x & 255)]
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v
  }
}
function fbm(n: (x: number, y: number) => number, x: number, y: number) {
  let a = 0.5, f = 1, s = 0
  for (let i = 0; i < 5; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2 }
  return s
}
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

export function planetTexture(id: string, base: string): THREE.Texture {
  const k = 'planet' + id
  if (cache.has(k)) return cache.get(k)!
  const W = 512, H = 256
  const [c, g] = canvas(W, H)
  const img = g.createImageData(W, H)
  const n = valueNoise(id.length * 97 + id.charCodeAt(0))
  const gas = ['jupiter', 'saturn', 'uranus', 'neptune'].includes(id)
  const b = hex(base)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = b[0], gg = b[1], bb = b[2]
      const lat = y / H
      if (id === 'earth') {
        const h = fbm(n, x / 60, y / 60)
        const land = h > 0.52
        const polar = lat < 0.08 || lat > 0.92
        if (polar) { r = 240; gg = 245; bb = 250 }
        else if (land) { const t = Math.min(1, (h - 0.52) * 6); r = 60 + t * 90; gg = 120 - t * 20; bb = 50 + t * 20 }
        else { const d = 0.7 + (h) * 0.5; r = 15 * d; gg = 70 * d; bb = 150 * d }
        const cl = fbm(n, x / 25 + 40, y / 40 + 9)
        if (cl > 0.58) { const a = Math.min(1, (cl - 0.58) * 5) * 0.75; r = r * (1 - a) + 255 * a; gg = gg * (1 - a) + 255 * a; bb = bb * (1 - a) + 255 * a }
      } else if (gas) {
        const band = Math.sin(lat * (id === 'jupiter' ? 38 : id === 'saturn' ? 30 : 8) + fbm(n, x / 90, y / 14) * 3)
        const t = 0.8 + 0.2 * band + (fbm(n, x / 30, y / 8) - 0.5) * (id === 'uranus' || id === 'neptune' ? 0.1 : 0.35)
        r *= t; gg *= t; bb *= t
      } else {
        const t = 0.55 + fbm(n, x / 20, y / 20) * 0.9
        r *= t; gg *= t; bb *= t
        if (id === 'mars' && (lat < 0.07 || lat > 0.93)) { r = 240; gg = 240; bb = 245 }
      }
      const i = (y * W + x) * 4
      img.data[i] = Math.min(255, r); img.data[i + 1] = Math.min(255, gg); img.data[i + 2] = Math.min(255, bb); img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return finish(c, k)
}

export function saturnRingTexture(): THREE.Texture {
  if (cache.has('srings')) return cache.get('srings')!
  const [c, g] = canvas(512, 8)
  const gr = g.createLinearGradient(0, 0, 512, 0)
  const stops: [number, string][] = [[0, '#00000000'], [0.1, '#8a7a5a88'], [0.25, '#c8b68aee'], [0.45, '#e6d6aaff'], [0.5, '#00000030'], [0.55, '#d8c89acc'], [0.8, '#b8a880aa'], [1, '#00000000']]
  stops.forEach(([p, col]) => gr.addColorStop(p, col))
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 8)
  return finish(c, 'srings')
}
