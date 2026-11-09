import * as THREE from 'three'
import { mulberry32 } from '../terrain'

/** procedural textures generated once (no downloaded assets; nothing to license) */
const cache: Record<string, THREE.Texture> = {}

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1, srgb = true): THREE.Texture {
  if (cache[key]) return cache[key]
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  cache[key] = t
  return t
}

/** crinkled Kapton/aluminised-foil bump (the LM descent stage thermal blankets) */
export function foilBump(): THREE.Texture {
  return canvasTex('foil', 256, (g, s) => {
    const r = mulberry32(11)
    g.fillStyle = '#808080'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      const x = r() * s, y = r() * s, w = 6 + r() * 26, h = 3 + r() * 14
      const v = Math.floor(90 + r() * 90)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.globalAlpha = 0.5
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + w, y + r() * h)
      g.lineTo(x + w * r(), y + h)
      g.closePath()
      g.fill()
    }
    g.globalAlpha = 1
  }, 2, false)
}

/** regolith grain detail for the ground (albedo variation) */
export function regolithMap(): THREE.Texture {
  return canvasTex('regolith', 512, (g, s) => {
    const r = mulberry32(5)
    const img = g.createImageData(s, s)
    for (let i = 0; i < s * s; i++) {
      const n = 0.82 + r() * 0.18 - (r() < 0.02 ? 0.25 : 0)
      const v = Math.floor(170 * n)
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = Math.floor(v * 0.97)
      img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
    // soft blotches
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '40,40,40' : '230,230,225'},0.05)`
      g.beginPath()
      g.arc(r() * s, r() * s, 10 + r() * 60, 0, Math.PI * 2)
      g.fill()
    }
  }, 1)
}

export function regolithBump(): THREE.Texture {
  return canvasTex('regolith-bump', 256, (g, s) => {
    const r = mulberry32(9)
    g.fillStyle = '#7a7a7a'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(60 + r() * 140)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.beginPath()
      g.arc(r() * s, r() * s, 0.6 + r() * 2.2, 0, Math.PI * 2)
      g.fill()
    }
  }, 1, false)
}

export const MAT = {
  gold: () => new THREE.MeshStandardMaterial({ color: '#c99a3c', metalness: 0.92, roughness: 0.32, bumpMap: foilBump(), bumpScale: 0.6 }),
  silverFoil: () => new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.9, roughness: 0.3, bumpMap: foilBump(), bumpScale: 0.5 }),
  blackFoil: () => new THREE.MeshStandardMaterial({ color: '#1d1d20', metalness: 0.6, roughness: 0.45, bumpMap: foilBump(), bumpScale: 0.4 }),
  strut: () => new THREE.MeshStandardMaterial({ color: '#b9a46a', metalness: 0.85, roughness: 0.38 }),
  aluminium: () => new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.85, roughness: 0.35 }),
  darkMetal: () => new THREE.MeshStandardMaterial({ color: '#3a3c40', metalness: 0.7, roughness: 0.5 }),
  engine: () => new THREE.MeshStandardMaterial({ color: '#3b3632', metalness: 0.5, roughness: 0.7, side: THREE.DoubleSide }),
  solarCell: () => new THREE.MeshStandardMaterial({ color: '#1b2440', metalness: 0.55, roughness: 0.25, emissive: '#04060c' }),
  suit: () => new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.86, metalness: 0 }),
  suitJoint: () => new THREE.MeshStandardMaterial({ color: '#d5d3cc', roughness: 0.9 }),
  glove: () => new THREE.MeshStandardMaterial({ color: '#8f9aa8', roughness: 0.7 }),
  boot: () => new THREE.MeshStandardMaterial({ color: '#d9d8d2', roughness: 0.85 }),
  sole: () => new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.95 }),
  visor: () => new THREE.MeshPhysicalMaterial({ color: '#d9a640', metalness: 1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
  helmetShell: () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.22, clearcoat: 1 }),
}
