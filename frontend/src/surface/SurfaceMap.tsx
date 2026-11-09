import { useEffect, useMemo, useRef, useState } from 'react'
import { OBJECT_BY_ID } from '../missions'
import { useSurface } from './surfaceState'
import { terrainGrid } from './SurfaceScene'
import type { SurfaceSite } from './sites'
import { bearingDeg, toLatLon } from './geo'

/** hill-shaded image of the generated terrain grid (north up), built once per terrain */
let shadeCache: { heights: Float32Array; canvas: HTMLCanvasElement } | null = null
function hillshade(): HTMLCanvasElement | null {
  const { heights, size: n, extent } = terrainGrid
  if (!heights) return null
  if (shadeCache?.heights === heights) return shadeCache.canvas
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  const cell = (extent * 2) / (n - 1)
  let lo = Infinity, hi = -Infinity
  for (const h of heights) {
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
  }
  // cartographic convention: light from the north-west, 45° up
  const L = [-0.5, 0.7071, -0.5]
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const h = (a: number, b: number) => heights[Math.min(n - 1, Math.max(0, b)) * n + Math.min(n - 1, Math.max(0, a))]
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * cell)
      const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * cell)
      const nl = Math.hypot(dx, 1, dz)
      const shade = Math.max(0, (-dx * L[0] + L[1] - dz * L[2]) / nl)
      const t = (h(i, j) - lo) / (hi - lo || 1)
      const v = 38 + 150 * shade + 40 * t
      const k = (j * n + i) * 4
      img.data[k] = v * 0.86
      img.data[k + 1] = v * 0.9
      img.data[k + 2] = v
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  shadeCache = { heights, canvas: c }
  return c
}

export interface MapView {
  cx: number
  cz: number
  /** metres per CSS pixel */
  mpp: number
}

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]

export function drawSurfaceMap(ctx: CanvasRenderingContext2D, w: number, h: number, view: MapView, site: SurfaceSite, opts: { compact?: boolean; hover?: string | null }) {
  const S = useSurface.getState()
  const toS = (x: number, z: number): [number, number] => [w / 2 + (x - view.cx) / view.mpp, h / 2 + (z - view.cz) / view.mpp]
  ctx.fillStyle = '#05070b'
  ctx.fillRect(0, 0, w, h)
  const shade = hillshade()
  if (shade) {
    const ext = terrainGrid.extent
    const [x0, y0] = toS(-ext, -ext)
    const [x1, y1] = toS(ext, ext)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(shade, x0, y0, x1 - x0, y1 - y0)
  }
  // grid every 50 m (25 m when zoomed in)
  const step = view.mpp < 0.3 ? 10 : view.mpp < 0.8 ? 25 : 50
  ctx.strokeStyle = 'rgba(120,170,255,0.12)'
  ctx.lineWidth = 1
  const ext = site.halfExtentM
  for (let g = -ext; g <= ext; g += step) {
    const [ax, ay] = toS(g, -ext), [bx, by] = toS(g, ext)
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
    const [cx, cy] = toS(-ext, g), [dx, dy] = toS(ext, g)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx, dy); ctx.stroke()
  }
  // walkable boundary
  ctx.strokeStyle = 'rgba(255,180,80,0.5)'
  ctx.setLineDash([6, 5])
  const [bx0, by0] = toS(-ext, -ext), [bx1, by1] = toS(ext, ext)
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0)
  ctx.setLineDash([])

  const me = S.player
  // waypoint guidance line
  const wp = site.objects.find((o) => o.objectId === S.waypointId)
  if (wp) {
    const [ax, ay] = toS(me.x, me.z), [bx, by] = toS(wp.x, wp.z)
    ctx.strokeStyle = '#58b6ff'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
    ctx.setLineDash([])
  }
  // hardware markers
  for (const o of site.objects) {
    const [sx, sy] = toS(o.x, o.z)
    const found = S.discovered.includes(o.objectId)
    const sel = S.waypointId === o.objectId
    ctx.beginPath()
    ctx.arc(sx, sy, opts.compact ? 4 : sel || opts.hover === o.objectId ? 8 : 6, 0, Math.PI * 2)
    ctx.fillStyle = found ? '#ffcf5a' : '#c9d6ea'
    ctx.fill()
    ctx.lineWidth = sel ? 3 : 1.5
    ctx.strokeStyle = sel ? '#58b6ff' : '#0b1220'
    ctx.stroke()
    if (!opts.compact) {
      const name = OBJECT_BY_ID[o.objectId].name.replace(/^Apollo 11 /, '')
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(5,8,14,0.75)'
      const tw = ctx.measureText(name).width
      ctx.fillRect(sx + 10, sy - 9, tw + 8, 18)
      ctx.fillStyle = found ? '#ffe39a' : '#e6edf7'
      ctx.fillText(name, sx + 14, sy + 4)
    }
  }
  // astronaut arrow (heading)
  {
    const [sx, sy] = toS(me.x, me.z)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(-me.yaw)
    ctx.beginPath()
    const k = opts.compact ? 0.8 : 1
    ctx.moveTo(0, -11 * k); ctx.lineTo(7 * k, 8 * k); ctx.lineTo(0, 4 * k); ctx.lineTo(-7 * k, 8 * k); ctx.closePath()
    ctx.fillStyle = '#ff5d5d'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
  if (opts.compact) return
  // north arrow
  ctx.save()
  ctx.translate(w - 34, 40)
  ctx.fillStyle = 'rgba(5,8,14,0.7)'
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(7, 6); ctx.lineTo(0, 2); ctx.lineTo(-7, 6); ctx.closePath()
  ctx.fillStyle = '#ffffff'; ctx.fill()
  ctx.font = '700 11px system-ui'; ctx.fillStyle = '#ffcf5a'; ctx.textAlign = 'center'; ctx.fillText('N', 0, 17)
  ctx.restore()
  // scale bar
  const target = 110 * view.mpp
  const len = NICE.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), 1)
  const px = len / view.mpp
  ctx.fillStyle = 'rgba(5,8,14,0.7)'
  ctx.fillRect(14, h - 40, px + 60, 28)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(22, h - 22); ctx.lineTo(22 + px, h - 22); ctx.moveTo(22, h - 28); ctx.lineTo(22, h - 16); ctx.moveTo(22 + px, h - 28); ctx.lineTo(22 + px, h - 16); ctx.stroke()
  ctx.font = '600 12px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'
  ctx.fillText(`${len} m`, 30 + px, h - 18)
}

export function MiniMap({ site }: { site: SurfaceSite }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const c = ref.current
      if (c) {
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth, h = c.clientHeight
        if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
        const ctx = c.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const p = useSurface.getState().player
        drawSurfaceMap(ctx, w, h, { cx: p.x, cz: p.z, mpp: 0.55 }, site, { compact: true })
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [site])
  return (
    <button className="surf-minimap" onClick={() => useSurface.getState().set({ mapOpen: true })} aria-label="Open surface map (M)" title="Surface map (M)">
      <canvas ref={ref} />
      <span className="surf-minimap-n">N</span>
    </button>
  )
}

export function SurfaceMap({ site }: { site: SurfaceSite }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const player = useSurface((s) => s.player)
  const waypointId = useSurface((s) => s.waypointId)
  const discovered = useSurface((s) => s.discovered)
  const [view, setView] = useState<MapView>(() => ({ cx: player.x, cz: player.z, mpp: 0.6 }))
  const [hover, setHover] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawSurfaceMap(ctx, w, h, view, site, { hover })
  }, [view, site, hover, player, waypointId, discovered])

  const pick = (e: React.PointerEvent | React.MouseEvent): string | null => {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    let best: string | null = null, bd = 16
    for (const o of site.objects) {
      const sx = r.width / 2 + (o.x - view.cx) / view.mpp, sy = r.height / 2 + (o.z - view.cz) / view.mpp
      const d = Math.hypot(sx - mx, sy - my)
      if (d < bd) { bd = d; best = o.objectId }
    }
    return best
  }
  const setWaypoint = (id: string | null) => useSurface.getState().set({ waypointId: useSurface.getState().waypointId === id ? null : id })
  const ll = toLatLon(site.origin, player.x, player.z)
  const rows = useMemo(
    () =>
      site.objects
        .map((o) => ({ o, d: Math.hypot(o.x - player.x, o.z - player.z), b: bearingDeg(player.x, player.z, o.x, o.z) }))
        .sort((a, b) => a.d - b.d),
    [site, player],
  )

  return (
    <div className="surf-map-overlay" role="dialog" aria-label="Surface map">
      <div className="surf-map glass">
        <header>
          <div>
            <span className="eyebrow">SURFACE MAP</span>
            <h2>{site.name}</h2>
            <p className="surf-map-coords">
              You: {Math.abs(ll.latDeg).toFixed(5)}°{ll.latDeg >= 0 ? 'N' : 'S'} {ll.lonEastDeg.toFixed(5)}°E · Mean Earth/Polar Axis frame
            </p>
          </div>
          <div className="surf-map-tools">
            <button className="btn ghost" onClick={() => setView((v) => ({ ...v, mpp: Math.max(0.08, v.mpp / 1.4) }))} aria-label="Zoom in">＋</button>
            <button className="btn ghost" onClick={() => setView((v) => ({ ...v, mpp: Math.min(3, v.mpp * 1.4) }))} aria-label="Zoom out">－</button>
            <button className="btn ghost" onClick={() => setView((v) => ({ ...v, cx: player.x, cz: player.z }))}>Center on me</button>
            <button className="btn" onClick={() => useSurface.getState().set({ mapOpen: false })} aria-label="Close map">Close (M)</button>
          </div>
        </header>
        <div className="surf-map-body">
          <canvas
            ref={ref}
            className="surf-map-canvas"
            data-testid="surface-map-canvas"
            onWheel={(e) => {
              const f = e.deltaY > 0 ? 1.15 : 1 / 1.15
              setView((v) => ({ ...v, mpp: Math.min(3, Math.max(0.08, v.mpp * f)) }))
            }}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, moved: false }
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (d && e.buttons) {
                const dx = e.clientX - d.x, dy = e.clientY - d.y
                if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
                drag.current = { ...d, x: e.clientX, y: e.clientY }
                setView((v) => ({ ...v, cx: v.cx - dx * v.mpp, cz: v.cz - dy * v.mpp }))
              } else setHover(pick(e))
            }}
            onPointerUp={(e) => {
              if (drag.current && !drag.current.moved) {
                const id = pick(e)
                if (id) setWaypoint(id)
              }
              drag.current = null
            }}
          />
          <aside className="surf-map-list">
            <h3>Historical hardware</h3>
            <ul>
              {rows.map(({ o, d, b }) => {
                const obj = OBJECT_BY_ID[o.objectId]
                return (
                  <li key={o.objectId}>
                    <button className={waypointId === o.objectId ? 'on' : ''} onClick={() => setWaypoint(o.objectId)} aria-pressed={waypointId === o.objectId}>
                      <b>{obj.name.replace(/^Apollo 11 /, '')}</b>
                      <span>
                        {d.toFixed(0)} m · {b.toFixed(0)}° {discovered.includes(o.objectId) ? '· discovered' : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="surf-map-note">
              Click a marker or a row to set a waypoint. Positions: LRO measurements (NSSDCA / LROC, ±0.3–0.4 m). <b>Terrain shading is procedural and illustrative</b> — not LOLA or LROC NAC
              elevation data.
            </p>
          </aside>
        </div>
      </div>
    </div>
  )
}
