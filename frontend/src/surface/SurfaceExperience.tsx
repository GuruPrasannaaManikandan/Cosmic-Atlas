import { useEffect, useMemo } from 'react'
import { useStore } from '../store/store'
import { OBJECT_BY_ID, MISSION_BY_ID, dateMs } from '../missions'
import { SITE_BY_ID, SURFACE_BODIES } from './sites'
import { useSurface } from './surfaceState'
import { SurfaceScene } from './SurfaceScene'
import { MiniMap, SurfaceMap } from './SurfaceMap'
import { DiscoveryPanel } from './DiscoveryPanel'
import { sunDirectionAtLunarSite, elevationDeg, azimuthDeg } from './lighting'
import { bearingDeg } from './geo'

const MOONWALK_MS = dateMs('1969-07-21T03:30:00Z')

function Compass() {
  const site = SITE_BY_ID[useSurface((s) => s.siteId)!]
  const p = useSurface((s) => s.player)
  const wp = useSurface((s) => s.waypointId)
  const heading = ((-p.camYaw * 180) / Math.PI + 360) % 360
  const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((t, i) => ({ t, b: i * 45 }))
  const pos = (b: number) => {
    const d = ((b - heading + 540) % 360) - 180
    return Math.abs(d) > 75 ? null : 50 + (d / 75) * 50
  }
  return (
    <div className="surf-compass" aria-label={`Heading ${heading.toFixed(0)}°`}>
      {marks.map((m) => {
        const x = pos(m.b)
        return x === null ? null : (
          <span key={m.t} className={m.t.length === 1 ? 'major' : ''} style={{ left: `${x}%` }}>
            {m.t}
          </span>
        )
      })}
      {site.objects.map((o) => {
        const x = pos(bearingDeg(p.x, p.z, o.x, o.z))
        return x === null ? null : <i key={o.objectId} className={'obj' + (wp === o.objectId ? ' wp' : '')} style={{ left: `${x}%` }} title={OBJECT_BY_ID[o.objectId].name} />
      })}
      <b className="needle">{heading.toFixed(0)}°</b>
    </div>
  )
}

function Hud() {
  const S = useSurface()
  const site = SITE_BY_ID[S.siteId!]
  const body = SURFACE_BODIES[site.bodyId]
  const simMs = useStore((s) => s.simMs)
  const sun = useMemo(() => sunDirectionAtLunarSite(simMs, site.origin.latDeg, site.origin.lonEastDeg), [simMs, site])
  const sunEl = elevationDeg(sun)
  const wp = site.objects.find((o) => o.objectId === S.waypointId)
  const wpDist = wp ? Math.hypot(wp.x - S.player.x, wp.z - S.player.z) : 0
  const near = S.nearbyId ? OBJECT_BY_ID[S.nearbyId] : null

  return (
    <>
      <div className="surf-top glass">
        <div>
          <span className="eyebrow">{body.name.toUpperCase()} SURFACE · {MISSION_BY_ID[site.missionIds[0]].name.toUpperCase()}</span>
          <b>{site.name}</b>
          <span className="muted small">
            g = {body.gravity.value} m/s² · {new Date(simMs).toISOString().slice(0, 16).replace('T', ' ')} UTC · Sun {sunEl.toFixed(1)}° {sunEl > 0 ? `at ${azimuthDeg(sun).toFixed(0)}°` : '(below horizon)'}
          </span>
        </div>
        <div className="surf-top-actions">
          <button className="btn ghost" onClick={() => S.set({ mapOpen: true })}>🗺 Map (M)</button>
          <button className="btn ghost" onClick={() => S.set({ camMode: S.camMode === 'third' ? 'first' : 'third' })}>{S.camMode === 'third' ? '👁 First person (V)' : '🧑‍🚀 Third person (V)'}</button>
          <button className="btn ghost" onClick={() => S.set({ helpOpen: true })} aria-label="Controls help">? (H)</button>
          <button className="btn" onClick={() => useStore.getState().exitSurface()}>⤴ Return to orbit</button>
        </div>
      </div>
      <Compass />
      {sunEl <= 0 && (
        <div className="surf-night glass" role="status">
          <b>Lunar night at this date.</b> The Sun is {Math.abs(sunEl).toFixed(0)}° below the horizon; only earthshine lights the ground.
          <button className="btn small" onClick={() => useStore.getState().setSim(MOONWALK_MS)}>☀ Go to the Apollo 11 moonwalk (21 Jul 1969)</button>
        </div>
      )}
      {S.banner && (
        <div className="surf-banner" role="status" aria-live="assertive">
          <span>DISCOVERED</span>
          <b>{OBJECT_BY_ID[S.banner].name}</b>
        </div>
      )}
      {near && !S.panel && !S.mapOpen && (
        <div className="surf-prompt">
          <kbd>E</kbd> Inspect <b>{near.name}</b>
          <button className="btn small" onClick={() => S.set({ panel: { objectId: near.id, tab: 'inspect' }, component: null, banner: null })}>Inspect</button>
        </div>
      )}
      {wp && !S.panel && (
        <div className="surf-waypoint glass">
          ◎ {OBJECT_BY_ID[wp.objectId].name.replace(/^Apollo 11 /, '')} · <b>{wpDist.toFixed(0)} m</b> · bearing {bearingDeg(S.player.x, S.player.z, wp.x, wp.z).toFixed(0)}°
        </div>
      )}
      {!S.panel && <MiniMap site={site} />}
      {!S.panel && (
        <div className="surf-keys muted small">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> lope · <kbd>Space</kbd> hop · mouse look (click to capture) · <kbd>E</kbd> inspect · <kbd>M</kbd> map · <kbd>Esc</kbd> pause
        </div>
      )}
      <p className="surf-provenance muted small">{site.terrainProvenance}</p>
    </>
  )
}

function PauseMenu() {
  const set = useSurface((s) => s.set)
  return (
    <div className="surf-overlay" role="dialog" aria-label="Paused">
      <div className="surf-pause glass">
        <h2>Paused</h2>
        <button className="btn big" onClick={() => set({ paused: false })}>Resume exploration</button>
        <button className="btn ghost" onClick={() => set({ helpOpen: true })}>Controls</button>
        <button className="btn ghost" onClick={() => set({ mapOpen: true, paused: false })}>Surface map</button>
        <button className="btn" onClick={() => useStore.getState().exitSurface()}>⤴ Return to orbit</button>
      </div>
    </div>
  )
}

function Help() {
  const set = useSurface((s) => s.set)
  const site = SITE_BY_ID[useSurface((s) => s.siteId)!]
  const g = SURFACE_BODIES[site.bodyId].gravity
  return (
    <div className="surf-overlay" role="dialog" aria-label="Controls">
      <div className="surf-pause glass surf-help">
        <h2>Controls</h2>
        <ul>
          <li><kbd>W</kbd>/<kbd>S</kbd> forward / back, <kbd>A</kbd>/<kbd>D</kbd> left / right (relative to where you look)</li>
          <li>Mouse: look around — click the view to capture the mouse, or drag</li>
          <li><kbd>Shift</kbd> lope (the bounding run used in low gravity) · <kbd>Space</kbd> hop</li>
          <li><kbd>E</kbd> inspect nearby hardware · <kbd>M</kbd> surface map · <kbd>V</kbd> first / third person · <kbd>Esc</kbd> pause / close</li>
        </ul>
        <p className="muted small">
          Gravity here is {g.value} m/s² (NASA NSSDCA fact sheet), about one sixth of Earth's: the same push carries you about six times higher than on Earth. Walking speeds are gameplay tuning, not measured astronaut data.
        </p>
        <button className="btn" onClick={() => set({ helpOpen: false })}>Close</button>
      </div>
    </div>
  )
}

export default function SurfaceExperience() {
  const siteId = useStore((s) => s.surfaceSiteId)
  const S = useSurface()
  useEffect(() => {
    useSurface.getState().reset(siteId)
    return () => useSurface.getState().reset(null)
  }, [siteId])
  const site = siteId ? SITE_BY_ID[siteId] : null
  if (!site || S.siteId !== siteId) return null
  return (
    <div className="surface-root" data-testid="surface-root">
      <SurfaceScene site={site} />
      {S.intro ? (
        <div className="surf-intro" role="status">
          <span className="eyebrow">DESCENT</span>
          <b>{site.name}</b>
          <span className="muted">{SURFACE_BODIES[site.bodyId].name} · {Math.abs(site.origin.latDeg).toFixed(4)}°{site.origin.latDeg >= 0 ? 'N' : 'S'}, {site.origin.lonEastDeg.toFixed(4)}°E</span>
          <button className="btn ghost small" onClick={() => S.set({ intro: false })}>Skip</button>
        </div>
      ) : (
        <Hud />
      )}
      {S.mapOpen && <SurfaceMap site={site} />}
      {S.panel && <DiscoveryPanel />}
      {S.paused && !S.helpOpen && <PauseMenu />}
      {S.helpOpen && <Help />}
    </div>
  )
}
