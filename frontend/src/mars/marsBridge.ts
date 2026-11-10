/**
 * React ⇄ Unity bridge for the embedded Mars player (Unity 6.3 URP, WebGL 2).
 *
 * Lifecycle: one player at a time. It is created when a Mars site opens and destroyed (Quit) when the user leaves, so
 * the app never runs two live WebGL renderers (the orbital R3F canvas is paused with frameloop "never" while a surface
 * is open). Renderer condition C4 (embedded cost) is measured with this exact path.
 *
 * Input: the app's single input manager owns the keyboard (Unity's keyboard capture is off). Unity polls
 * window.__marsInput every frame through MarsBridge.jslib; the manager's mode rules decide what reaches it (WASD only in
 * VEHICLE_EXPLORATION, arrows in every gameplay mode, nothing while a dialog is open).
 *
 * Unity → React: window.__marsEvent(kind, data) for 'ready', 'pose' (10 Hz), 'mode', 'discovered', 'arrived', 'restored'.
 * React → Unity: send(method, arg) = SendMessage('MarsPrototype', method, arg).
 */
import { input } from '../input/appInput'

export interface MarsObjectReport { id: string; x: number; z: number; noticeM: number; interactM: number; routeIndex: number; sol: number }
export interface MarsReady {
  device: string
  api: string
  profile: string
  utc: string
  sol: number
  ltst: number
  sunElevation: number
  sunAzimuth: number
  tau: number
  tauLabel: string
  terrainTriangles: number
  rover: string
  roverCalibration: string
  objects: MarsObjectReport[]
  start: { x: number; z: number; heading: number }
  route: { points: number; firstSol: number; lastSol: number }
  site: { latDeg: number; lonEastDeg: number; extentEastM: [number, number]; extentNorthM: [number, number] }
  mode: string
  embedded: boolean
  heightCheck: { samples: number; maxAbsErrorM: number; pass: boolean } | null
}
export interface MarsPose {
  mode: 'Flythrough' | 'Arrival' | 'Explore' | 'Inspect' | 'Replay' | 'Paused'
  x: number
  z: number
  y: number
  /** radians clockwise from north */
  heading: number
  speed: number
  pitchDeg: number
  rollDeg: number
  blocked: boolean
  camYaw: number
  camYawOffset: number
  camPitch: number
  camDist: number
  oppX: number
  oppZ: number
  oppDist: number
  near: string | null
  arrivalT: number
  sol: number
  replaySol: number
  utc: string
  sunElevation: number
  sunAzimuth: number
  camX: number
  camY: number
  camZ: number
  rebases: number
}

interface UnityInstance {
  SendMessage(obj: string, method: string, value?: string | number): void
  Quit(): Promise<void>
}
type Listener = (kind: string, data: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any

declare global {
  interface Window {
    createUnityInstance?: (canvas: HTMLCanvasElement, config: Record<string, unknown>, onProgress?: (p: number) => void) => Promise<UnityInstance>
    __marsEvent?: Listener
    __marsInput?: () => number[]
    __marsBridge?: unknown
  }
}

/** the player's file names follow its build folder (unity/CosmicAtlas/Builds/MarsExplorer) */
const PRODUCT = 'MarsExplorer'

let instance: UnityInstance | null = null
let starting: Promise<void> | null = null
const listeners = new Set<Listener>()
const pointer = { dx: 0, dy: 0, zoom: 0 }
export const marsLast: { ready: MarsReady | null; pose: MarsPose | null; loadMs: number | null } = { ready: null, pose: null, loadMs: null }

export function onMars(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** pointer drag (px) and wheel (notches) on the 3-D view: orbit / zoom, merged with the arrow keys in Unity */
export function addPointer(dx: number, dy: number, zoom = 0) {
  pointer.dx += dx
  pointer.dy += dy
  pointer.zoom += zoom
}

function loadScript(src: string): Promise<void> {
  if (window.createUnityInstance) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`could not load ${src} — is the Unity build present? (unity/CosmicAtlas/Builds/${PRODUCT})`))
    document.head.appendChild(s)
  })
}

export function startMars(canvas: HTMLCanvasElement, build: string, onProgress: (p: number) => void): Promise<void> {
  if (starting) return starting
  const t0 = performance.now()
  window.__marsEvent = (kind, data) => {
    if (kind === 'ready') marsLast.ready = data as MarsReady
    if (kind === 'pose') marsLast.pose = data as MarsPose
    listeners.forEach((f) => f(kind, data))
  }
  window.__marsInput = () => {
    const m = input.move()
    const l = input.look()
    const out = [m.x, m.y, l.x, l.y, input.isHeld('sprint') ? 1 : 0, pointer.dx, pointer.dy, pointer.zoom]
    pointer.dx = pointer.dy = pointer.zoom = 0
    return out
  }
  const base = `/unity/${build}/Build/`
  starting = (async () => {
    await loadScript(base + PRODUCT + '.loader.js')
    let bannerError: string | null = null
    instance = await window.createUnityInstance!(
      canvas,
      {
        dataUrl: base + PRODUCT + '.data',
        frameworkUrl: base + PRODUCT + '.framework.js',
        codeUrl: base + PRODUCT + '.wasm',
        streamingAssetsUrl: 'StreamingAssets',
        companyName: 'Cosmic Atlas',
        productName: 'Mars',
        productVersion: '3',
        // integrated GPU budget (renderer condition C1): never render the Mars view above 1.5 device pixels per CSS px
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        showBanner: (msg: string, type: string) => {
          if (type === 'error') bannerError = msg
          else console.warn('[Mars]', msg)
        },
      },
      onProgress,
    )
    if (bannerError) throw new Error(bannerError)
    marsLast.loadMs = performance.now() - t0
  })()
  starting.catch(() => {
    starting = null
  })
  return starting
}

export function send(method: string, arg: string | number = '') {
  instance?.SendMessage('MarsPrototype', method, typeof arg === 'number' ? String(arg) : arg)
}

export const marsRunning = () => !!instance

/** destroy the player (frees its WebGL context; the WASM heap is released when the page drops its last reference) */
export async function stopMars() {
  const i = instance
  const s = starting
  instance = null
  starting = null
  window.__marsInput = undefined
  window.__marsEvent = undefined
  marsLast.ready = marsLast.pose = null
  let target = i
  if (!target && s) {
    // still loading: wait for the instance the loader is about to hand back, then quit that one
    try {
      await s
    } catch {
      return
    }
    target = instance
    instance = null
  }
  try {
    await target?.Quit()
  } catch (e) {
    console.warn('[Mars] quit failed', e)
  }
}

if (typeof window !== 'undefined') window.__marsBridge = { send, last: marsLast, running: marsRunning }
