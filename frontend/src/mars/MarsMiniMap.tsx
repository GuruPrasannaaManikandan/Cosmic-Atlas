import { useEffect, useRef, useState } from 'react'
import { marsLast } from './marsBridge'

const KEY = 'cosmic-atlas.mars.minimap'
const readPref = () => { try { return window.localStorage.getItem(KEY) !== 'hidden' } catch { return true } }
const writePref = (shown: boolean) => { try { window.localStorage.setItem(KEY, shown ? 'shown' : 'hidden') } catch { /* private mode */ } }

/**
 * Persistent Mars minimap (parity with the Moon's): north up, centred on the rover, drawn every animation frame from
 * the latest bridge pose (outside React state, so it costs no re-renders). Shows the measured terrain tile's edge,
 * a guide to Victoria's ~800 m rim (NASA diameter; centre fitted to the DTM rim crest), Opportunity, the rover and the
 * camera's view direction. Click (or M) opens the full site map; the collapse choice is remembered per browser.
 */
export function MarsMiniMap({ onOpen }: { onOpen: () => void }) {
  const [shown, setShown] = useState(readPref)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!shown) return
    let raf = 0
    const draw = () => {
      const c = ref.current
      const pose = marsLast.pose
      const ready = marsLast.ready
      if (c && pose && ready) {
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth, h = c.clientHeight
        if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
        const ctx = c.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const mpp = 2.4 // metres per CSS pixel: ~420 m across at 176 px
        const sx = (x: number) => w / 2 + (x - pose.x) / mpp
        const sy = (z: number) => h / 2 - (z - pose.z) / mpp
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = '#0a0705'; ctx.fillRect(0, 0, w, h)
        // the measured terrain tile (outside it: no data)
        const [e0, e1] = ready.site.extentEastM, [n0, n1] = ready.site.extentNorthM
        ctx.fillStyle = 'rgba(176, 116, 78, 0.38)'
        ctx.fillRect(sx(e0), sy(n1), (e1 - e0) / mpp, (n1 - n0) / mpp)
        // Victoria rim guide (the Victoria scene only; M4 landing sites report a siteId)
        if (!ready.siteId) {
          ctx.strokeStyle = 'rgba(253, 186, 116, 0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
          ctx.beginPath(); ctx.arc(sx(0), sy(0), 400 / mpp, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
        }
        // camera view wedge
        ctx.fillStyle = 'rgba(103, 232, 249, 0.16)'
        ctx.beginPath(); ctx.moveTo(w / 2, h / 2)
        const a0 = pose.camYaw - 0.45, a1 = pose.camYaw + 0.45, R = Math.min(w, h) * 0.48
        ctx.arc(w / 2, h / 2, R, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.closePath(); ctx.fill()
        // historical hardware (clamped to the edge with a pointer when out of range): Opportunity, or a site's landers / rovers
        const objs = ready.siteId ? ready.objects : [{ x: pose.oppX, z: pose.oppZ }]
        for (const o of objs) {
          let ox = sx(o.x), oy = sy(o.z)
          const dx = ox - w / 2, dy = oy - h / 2, d = Math.hypot(dx, dy), lim = Math.min(w, h) / 2 - 9
          const off = d > lim
          if (off) { ox = w / 2 + (dx / d) * lim; oy = h / 2 + (dy / d) * lim }
          ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(ox, oy, off ? 4 : 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        }
        // the rover: an arrow along its heading
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(pose.heading)
        ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.restore()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [shown])

  const toggle = () => { setShown(!shown); writePref(!shown) }
  return (
    <div className="mars-minimap-wrap" data-testid="mars-minimap" data-shown={shown ? 'on' : 'off'}>
      {shown && (
        <button className="surf-minimap mars-minimap" onClick={onOpen} aria-label="Open the site map (M)" title="Site map (M) · historical hardware in amber">
          <canvas ref={ref} />
          <span className="surf-minimap-n">N</span>
        </button>
      )}
      <button className="mars-minimap-toggle" onClick={toggle} aria-pressed={shown} aria-label={shown ? 'Hide the minimap' : 'Show the minimap'} title={shown ? 'Hide the minimap' : 'Show the minimap'}>
        {shown ? '▾ map' : '▸ map'}
      </button>
    </div>
  )
}
