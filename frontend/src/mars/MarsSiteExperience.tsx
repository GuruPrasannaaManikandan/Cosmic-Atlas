import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { useSurface } from '../surface/surfaceState'
import { UNITY_SITE_BY_ID } from '../surface/sites'
import { planetFor } from '../surface/planets'
import { MISSION_BY_ID, SOURCES, dateMs } from '../missions'
import { ControlsPanel } from '../input/ControlsPanel'
import { input } from '../input/appInput'
import { startMars, stopMars, onMars, send, addPointer, marsLast, type MarsPose, type MarsReady } from './marsBridge'
import { MarsMiniMap } from './MarsMiniMap'
import { expedition } from '../expedition/expedition'
import '../input/controls.css'
import './mars.css'

/**
 * M4 landing sites rendered by the Unity player's SITE MODE (one package per site: frontend/public/mars-sites/<id>/,
 * built from USGS controlled HiRISE products by scripts/mars/build_site.py + site_defs.py).
 *
 * The same player and bridge as the Victoria scene; this component is the site-generic HUD: header, compass, nearest
 * hardware, minimap, map, inspection of the hardware and of the component groups the model really has, the mission
 * timeline from the sourced catalogue, and every provenance label from site.json shown where it applies.
 * Rover missions: drive the ILLUSTRATIVE expedition vehicle (VEHICLE_EXPLORATION). Stationary landers: on foot, first
 * person (PLANETARY_EXPLORATION). The historical vehicles themselves never move.
 */

export interface SiteComponentDef { id: string; label: string; parts: string[] }
export interface SiteHardwareDef { id: string; label: string; model: string; kind: string; x: number; z: number; yawDeg: number; radius: number; provenance: string; components: SiteComponentDef[] }
export interface SiteDef {
  id: string
  name: string
  missionId: string
  mode: 'rover' | 'lander'
  landing: { utc: string; landingSol: number; source: string; solNote: string }
  scene: { date: string; ltst: number; label: string; tau: number; tauLabel: string }
  hardware: SiteHardwareDef[]
  start: { x: number; z: number; headingDeg: number }
  origin: { latDeg: number; lonEastDeg: number; source: string; registration: string }
  terrain: { dtm: string; spacingM: number; sizeM: number; validFraction: number; albedo: string; horizon: string }
}

const deg = (r: number) => (r * 180) / Math.PI
const bearing = (x0: number, z0: number, x1: number, z1: number) => (deg(Math.atan2(x1 - x0, z1 - z0)) + 360) % 360
const latLon = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`

function Compass({ pose, objects }: { pose: MarsPose; objects: MarsReady['objects'] }) {
  const heading = (deg(pose.camYaw) + 360) % 360
  const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((t, i) => ({ t, b: i * 45 }))
  const pos = (b: number) => {
    const d = ((b - heading + 540) % 360) - 180
    return Math.abs(d) > 75 ? null : 50 + (d / 75) * 50
  }
  return (
    <div className="surf-compass" aria-label={`Camera heading ${heading.toFixed(0)}°`}>
      {marks.map((m) => {
        const x = pos(m.b)
        return x === null ? null : <span key={m.t} className={m.t.length === 1 ? 'major' : ''} style={{ left: `${x}%` }}>{m.t}</span>
      })}
      {objects.map((o) => {
        const x = pos(bearing(pose.x, pose.z, o.x, o.z))
        return x === null ? null : <i key={o.id} className="obj wp" style={{ left: `${x}%` }} title={o.label} />
      })}
      <b className="needle">{heading.toFixed(0)}°</b>
    </div>
  )
}

function SiteMap({ ready, pose, def, onClose }: { ready: MarsReady; pose: MarsPose; def: SiteDef; onClose: () => void }) {
  const [e0, e1] = ready.site.extentEastM
  const [n0, n1] = ready.site.extentNorthM
  const W = e1 - e0, H = n1 - n0
  const X = (x: number) => x - e0
  const Y = (z: number) => n1 - z
  return (
    <div className="surf-overlay" role="dialog" aria-modal="true" aria-label="Site map" onClick={onClose}>
      <div className="surf-pause glass mars-map" onClick={(e) => e.stopPropagation()}>
        <h2>{def.name} — site map</h2>
        <svg viewBox={`0 0 ${W} ${H}`} className="mars-map-svg" role="img" aria-label="Map of the explorable terrain">
          <rect x={0} y={0} width={W} height={H} className="mm-extent" />
          {ready.objects.map((o) => (
            <g key={o.id} transform={`translate(${X(o.x)} ${Y(o.z)})`}>
              <circle r={10} className="mm-opp" />
              <text y={-18} className="mm-label" textAnchor="middle">{o.label}</text>
            </g>
          ))}
          <g transform={`translate(${X(pose.x)} ${Y(pose.z)}) rotate(${deg(pose.heading)})`}>
            <path d="M0,-16 L10,12 L0,6 L-10,12 Z" className="mm-rover" />
          </g>
        </svg>
        <p className="muted small">
          North up · {Math.round(W)} × {Math.round(H)} m of measured terrain ({def.terrain.dtm}) · origin {latLon(def.origin.latDeg, def.origin.lonEastDeg)}.
          {def.terrain.validFraction < 0.99 && ` ${Math.round((1 - def.terrain.validFraction) * 100)} % of this square lies outside the DTM and is left empty.`}
        </p>
        <p className="muted small mars-honest">{def.origin.registration}</p>
        <button className="btn" onClick={onClose}>Close <kbd>Esc</kbd></button>
      </div>
    </div>
  )
}

function Inspector({ def, ready, hwId, component, onComponent, onClose }: { def: SiteDef; ready: MarsReady; hwId: string; component: string | null; onComponent: (c: string | null) => void; onClose: () => void }) {
  const hw = def.hardware.find((h) => h.id === hwId) ?? def.hardware[0]
  const rep = ready.objects.find((o) => o.id === hw.id)
  const mission = MISSION_BY_ID[def.missionId]
  const [tab, setTab] = useState<'overview' | 'parts' | 'timeline' | 'sources'>('overview')
  const present = new Set((rep?.components ?? []).filter((c) => c.renderers > 0).map((c) => c.id))
  const srcIds = useMemo(() => [...new Set([...(mission?.milestones.flatMap((m) => m.sources) ?? []), ...(mission?.landing?.sources ?? []), ...(mission?.end?.sources ?? [])])].filter((s) => SOURCES[s]), [mission])
  return (
    <aside className="discovery-panel glass site-inspector" role="dialog" aria-label={`${hw.label} record`} data-testid="site-inspector">
      <header className="discovery-head">
        <div>
          <span className="eyebrow">{hw.kind === 'rover' ? 'ROVER' : 'LANDER'} · {mission?.name.toUpperCase()}</span>
          <h2>{hw.label}</h2>
        </div>
        <button className="discovery-close" onClick={onClose} aria-label="Close the record (Esc)" title="Close (Esc)">✕</button>
      </header>
      <div className="discovery-tabs" role="tablist">
        {(['overview', 'parts', 'timeline', 'sources'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'parts' ? 'Inspect' : t === 'timeline' ? 'Timeline' : 'Sources'}
          </button>
        ))}
      </div>
      <div className="discovery-body">
        {tab === 'overview' && (
          <>
            {mission?.summary && <p>{mission.summary}</p>}
            <dl className="site-facts">
              <dt>Status</dt><dd>{mission?.status.value ?? 'unknown'}{mission?.end?.value ? ` · ended ${mission.end.value}` : ''}</dd>
              <dt>Landed</dt><dd>{mission?.landing?.value ?? '—'}</dd>
              <dt>Position</dt><dd>{latLon(def.origin.latDeg, def.origin.lonEastDeg)} ({def.origin.source})</dd>
              <dt>Scene</dt><dd>{def.scene.label}</dd>
            </dl>
            <p className="muted small"><b>Model:</b> {hw.provenance}</p>
            <p className="muted small"><b>Position:</b> {def.origin.registration}</p>
          </>
        )}
        {tab === 'parts' && (
          <>
            <p className="muted small">Drag the view or use the arrow keys to orbit; wheel to zoom. A part lights up only where the model has it as a separate piece — nothing is drawn on top of the model.</p>
            <ul className="site-parts">
              <li><button className={component === null ? 'on' : ''} onClick={() => onComponent(null)}>Whole {hw.kind === 'rover' ? 'rover' : 'lander'}</button></li>
              {hw.components.map((c) => (
                <li key={c.id}>
                  <button className={component === c.id ? 'on' : ''} disabled={!present.has(c.id)} onClick={() => onComponent(c.id)} title={present.has(c.id) ? '' : 'not a separate part in this model'}>
                    {c.label}{!present.has(c.id) && ' (not a separate part)'}
                  </button>
                </li>
              ))}
            </ul>
            {hw.components.length === 0 && <p className="muted small">This NASA model has no separately named parts, so the view frames the whole vehicle.</p>}
            {rep?.note && <p className="muted small">{rep.note}</p>}
          </>
        )}
        {tab === 'timeline' && (
          <ol className="site-timeline">
            {[...(mission?.milestones ?? [])].sort((a, b) => dateMs(a.date) - dateMs(b.date)).map((m) => (
              <li key={m.date + m.title}><b>{m.date.slice(0, 10)}</b> {m.title}{m.description ? <span className="muted small"> — {m.description}</span> : null}</li>
            ))}
          </ol>
        )}
        {tab === 'sources' && (
          <ul className="site-sources">
            {srcIds.map((s) => <li key={s}><a href={SOURCES[s].url} target="_blank" rel="noreferrer">{SOURCES[s].title}</a> <span className="muted small">— {SOURCES[s].organisation}</span></li>)}
            <li className="muted small">Terrain: {def.terrain.dtm} (USGS Astrogeology controlled HiRISE products). Ground shade: {def.terrain.albedo}.</li>
          </ul>
        )}
      </div>
    </aside>
  )
}

export default function MarsSiteExperience() {
  const siteId = useStore((s) => s.surfaceSiteId)!
  const site = UNITY_SITE_BY_ID[siteId]
  const planet = planetFor(site.bodyId)
  const S = useSurface()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [def, setDef] = useState<SiteDef | null>(null)
  const [load, setLoad] = useState<{ state: 'loading' | 'error' | 'running'; progress: number; error?: string }>({ state: 'loading', progress: 0 })
  const [ready, setReady] = useState<MarsReady | null>(null)
  const [pose, setPose] = useState<MarsPose | null>(null)
  const [component, setComponent] = useState<string | null>(null)
  const embedded = useRef(false)
  const bannerTimer = useRef<number | null>(null)
  const rover = def?.mode === 'rover'

  useEffect(() => {
    let alive = true
    fetch(`/mars-sites/${site.site}/site.json`).then((r) => r.json()).then((d) => alive && setDef(d)).catch((e) => alive && setLoad({ state: 'error', progress: 0, error: `site description: ${e}` }))
    return () => { alive = false }
  }, [site.site])

  // player lifecycle: one player per site visit, quit on exit (never two live renderers, never two sites resident)
  useEffect(() => {
    const arrival = expedition.peekArrival(siteId)
    useSurface.getState().reset(siteId)
    useSurface.getState().set({ driving: site.mode === 'rover', intro: arrival, panel: null })
    embedded.current = false
    const off = onMars((kind, data) => {
      if (kind === 'ready') {
        setReady(data)
        if (!embedded.current) { embedded.current = true; send('Embed', JSON.stringify({ arrival })) }
      } else if (kind === 'pose') {
        setPose(data)
        const st = useSurface.getState()
        if ((data.near ?? null) !== st.nearbyId) st.set({ nearbyId: data.near ?? null })
      } else if (kind === 'discovered') {
        const st = useSurface.getState()
        if (!st.discovered.includes(data.id)) {
          st.set({ discovered: [...st.discovered, data.id], banner: data.id })
          if (bannerTimer.current) clearTimeout(bannerTimer.current)
          bannerTimer.current = window.setTimeout(() => useSurface.getState().set({ banner: null }), 5000)
        }
      } else if (kind === 'arrived') {
        expedition.clearArrival()
        useSurface.getState().set({ intro: false })
      } else if (kind === 'error') {
        setLoad({ state: 'error', progress: 0, error: data?.message ?? 'site package could not be loaded' })
      }
    })
    const startTimer = window.setTimeout(() => {
      startMars(canvasRef.current!, site.build, (p) => setLoad((l) => (l.state === 'loading' ? { ...l, progress: p } : l)), site.site)
        .then(() => setLoad((l) => (l.state === 'error' ? l : { state: 'running', progress: 1 })))
        .catch((e) => setLoad({ state: 'error', progress: 0, error: String(e?.message ?? e) }))
    }, 0)
    return () => {
      window.clearTimeout(startTimer)
      off()
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      stopMars()
      useSurface.getState().reset(null)
      window.setTimeout(() => { if (useStore.getState().surfaceSiteId !== siteId) expedition.clearArrival() }, 0)
    }
  }, [siteId, site.build, site.site, site.mode])

  // React state → Unity mode
  const panelId = S.panel?.objectId ?? null
  useEffect(() => {
    if (load.state !== 'running' || !embedded.current || !ready) return
    if (panelId) send('Inspect', component ? `${panelId}/${component}` : panelId)
    else if (S.paused || S.mapOpen || S.helpOpen) send('SetExplorerMode', 'paused')
    else send('SetExplorerMode', S.intro ? 'resume' : 'explore')
  }, [load.state, ready, panelId, component, S.paused, S.mapOpen, S.helpOpen, S.intro])

  useEffect(() => {
    const open = () => {
      const st = useSurface.getState()
      if (st.nearbyId && !st.panel) { setComponent(null); st.set({ panel: { objectId: st.nearbyId, tab: 'overview' }, banner: null }) }
    }
    const offs = [
      input.on('interact', open, 'VEHICLE_EXPLORATION'),
      input.on('interact', open, 'PLANETARY_EXPLORATION'),
      input.on('map', () => useSurface.getState().set({ mapOpen: !useSurface.getState().mapOpen })),
      input.on('help', () => useSurface.getState().set({ helpOpen: true })),
      input.on('back', () => {
        const st = useSurface.getState()
        if (st.helpOpen) st.set({ helpOpen: false })
        else if (st.mapOpen) st.set({ mapOpen: false })
        else if (st.panel) st.set({ panel: null })
        else if (st.intro) send('SkipArrival')
        else st.set({ paused: !st.paused })
      }),
    ]
    return () => offs.forEach((f) => f())
  }, [])

  const drag = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    addPointer(e.clientX - drag.current.x, e.clientY - drag.current.y)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => (drag.current = null)
  const onWheel = (e: React.WheelEvent) => addPointer(0, 0, Math.sign(e.deltaY))

  const mission = MISSION_BY_ID[site.missionIds[0]]
  const labelOf = (id: string | null | undefined) => def?.hardware.find((h) => h.id === id)?.label ?? id ?? ''
  const near = S.nearbyId
  const inspecting = !!S.panel
  const nearest = pose && ready ? ready.objects.find((o) => o.id === pose.nearestId) : null
  const sceneMeta = pose ? `g = ${planet.gravity.value} m/s² · ${pose.utc.slice(0, 16).replace('T', ' ')} UTC · sol ${pose.sol} (computed) · Sun ${pose.sunElevation.toFixed(1)}° at ${pose.sunAzimuth.toFixed(0)}°` : `g = ${planet.gravity.value} m/s²`

  return (
    <div className="surface-root mars-root" data-testid="mars-root" data-site={site.site} data-panel={S.panel ? 'on' : undefined}>
      <div className="surf-viewport">
        <div className="surf-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          <canvas ref={canvasRef} id="mars-canvas" className="mars-canvas" tabIndex={-1} aria-label={`Mars surface, ${site.name} (3-D view)`} />
        </div>

        {load.state === 'loading' || (load.state === 'running' && !ready) ? (
          <div className="surf-intro" role="status" data-testid="mars-loading">
            <span className="eyebrow">PREPARING MARS</span>
            <b>{site.name}</b>
            <span className="muted">{load.state === 'loading' ? `Loading the Unity terrain renderer… ${Math.round(load.progress * 100)}%` : 'Loading the site: HiRISE terrain, ground image and hardware…'}</span>
            <div className="mars-progress" aria-hidden><i style={{ width: `${Math.round((load.state === 'loading' ? load.progress : 1) * 100)}%` }} /></div>
          </div>
        ) : null}
        {load.state === 'error' && (
          <div className="surf-intro mars-error" role="alert">
            <span className="eyebrow">MARS RENDERER UNAVAILABLE</span>
            <b>{site.name} could not start</b>
            <span className="muted small">{load.error}</span>
            <button className="btn" onClick={() => expedition.returnToOrbit()} data-testid="return-to-orbit">⤴ Return to orbit</button>
          </div>
        )}

        {load.state === 'running' && ready && S.intro && (
          <div className="surf-intro mars-arrival" role="status" aria-live="polite">
            <span className="eyebrow">ARRIVAL</span>
            <b>{site.name}</b>
            <span className="muted small">{latLon(site.origin.latDeg, site.origin.lonEastDeg)} · Mars</span>
            <span className="muted small mars-honest">Illustrative arrival: a camera descent to the site — not a reconstruction of {mission?.name}'s entry, descent and landing.</span>
            <button className="btn ghost small" onClick={() => send('SkipArrival')}>Skip <kbd>Esc</kbd></button>
          </div>
        )}

        {load.state === 'running' && ready && def && !S.intro && pose && (
          <div className="surf-hud" data-inspecting={inspecting ? 'on' : undefined}>
            <header className="surf-top">
              <div className="surf-top-info">
                <span className="eyebrow">MARS SURFACE · {mission?.name.toUpperCase()} · {rover ? 'ROVER MISSION' : 'STATIONARY LANDER'}</span>
                <b className="surf-top-title">{site.name}</b>
                <span className="surf-top-meta">{sceneMeta}</span>
              </div>
              <nav className="surf-top-actions" aria-label="Surface actions">
                <button className="btn ghost" onClick={() => S.set({ mapOpen: true })}>🗺 Map <kbd>M</kbd></button>
                <button className="btn ghost" onClick={() => S.set({ helpOpen: true })} aria-label="Controls help">? <kbd>H</kbd></button>
                <button className="btn" onClick={() => expedition.returnToOrbit()} data-testid="return-to-orbit">⤴ Return to orbit</button>
              </nav>
            </header>
            <div className="surf-status">
              {!inspecting && <Compass pose={pose} objects={ready.objects} />}
              {!inspecting && nearest && (
                <div className="surf-chip surf-waypoint" data-testid="mars-waypoint">
                  ◎ {nearest.label} · <b>{pose.oppDist.toFixed(0)} m</b> · bearing {bearing(pose.x, pose.z, nearest.x, nearest.z).toFixed(0)}°
                </div>
              )}
              {!inspecting && <div className="surf-chip mars-scene-note" title={def.origin.registration}>🕰 Scene: {def.scene.label}</div>}
            </div>
            <div className="surf-center">
              {S.banner && !inspecting && (
                <div className="surf-banner" role="status" aria-live="assertive"><span>DISCOVERED</span><b>{labelOf(S.banner)}</b></div>
              )}
              {near && !inspecting && !S.mapOpen && (
                <div className="surf-prompt">
                  <kbd>E</kbd> <span className="surf-prompt-text">Inspect <b>{labelOf(near)}</b></span>
                  <button className="btn small" onClick={() => { setComponent(null); S.set({ panel: { objectId: near, tab: 'overview' }, banner: null }) }}>Inspect</button>
                </div>
              )}
            </div>
            {!inspecting && (
              <div className="surf-bottom">
                <div className="surf-bottom-left mars-bottom-left">
                  <MarsMiniMap onOpen={() => S.set({ mapOpen: true })} />
                  <div className="mars-telemetry" data-testid="mars-telemetry">
                    <span className="eyebrow">{rover ? 'EXPEDITION ROVER · ILLUSTRATIVE' : 'ON FOOT · FIRST PERSON'}</span>
                    <b>{Math.abs(pose.speed).toFixed(1)} m/s{rover && pose.speed < -0.05 ? ' reverse' : ''}</b>
                    <span className="muted small" data-testid="mars-coords">
                      {pose.x.toFixed(0)} m E, {pose.z.toFixed(0)} m N of the site origin · {latLon(def.origin.latDeg + (pose.z / 3396190) * (180 / Math.PI), def.origin.lonEastDeg + (pose.x / (3396190 * Math.cos((def.origin.latDeg * Math.PI) / 180))) * (180 / Math.PI))}
                      {rover && ` · pitch ${pose.pitchDeg.toFixed(0)}° roll ${pose.rollDeg.toFixed(0)}°`}
                    </span>
                    {pose.blocked && <span className="mars-blocked">{rover ? 'Too steep or blocked — back up or turn' : 'Blocked — hardware or the edge of the measured terrain'}</span>}
                  </div>
                </div>
                <p className="surf-provenance">
                  Terrain: {def.terrain.dtm} ({def.terrain.spacingM} m, USGS controlled HiRISE). Ground shade: {def.terrain.albedo}. Sun: Mars24 at an ILLUSTRATIVE {def.scene.ltst}:00 local solar time. {def.scene.tauLabel}. Hardware: see each record (NASA model / documented reconstruction / simplified).
                  {marsLast.build && <span className="mars-build" data-testid="mars-build"> · Unity player {marsLast.build.id}</span>}
                </p>
                <div className="surf-bottom-right">
                  <div className="surf-keys">
                    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {rover ? 'drive' : 'walk'} · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> look · <kbd>Shift</kbd> faster · <kbd>E</kbd> inspect · <kbd>M</kbd> map · <kbd>Esc</kbd> pause
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {S.panel && def && ready && (
        <Inspector def={def} ready={ready} hwId={S.panel.objectId} component={component} onComponent={setComponent} onClose={() => S.set({ panel: null })} />
      )}
      {S.mapOpen && ready && pose && def && <SiteMap ready={ready} pose={pose} def={def} onClose={() => S.set({ mapOpen: false })} />}
      {S.helpOpen && (
        <div className="surf-overlay" role="dialog" aria-modal="true" aria-label="Controls">
          <div className="surf-pause glass surf-help">
            <h2>Controls</h2>
            <ControlsPanel mode={rover ? 'VEHICLE_EXPLORATION' : 'PLANETARY_EXPLORATION'} extra={[{ keys: 'Mouse drag', label: 'Turn the view' }, { keys: 'Wheel', label: rover ? 'Camera distance' : 'Zoom (field of view)' }]} />
            <p className="muted small">{rover ? `You drive an ILLUSTRATIVE expedition rover (not a NASA design). ${mission?.name}'s own rover stays where the scene places it.` : 'You explore on foot in first person; the lander stays where it landed. Walking speeds are gameplay values.'}</p>
            <button className="btn" onClick={() => S.set({ helpOpen: false })}>Close</button>
          </div>
        </div>
      )}
      {S.paused && !S.helpOpen && (
        <div className="surf-overlay" role="dialog" aria-modal="true" aria-label="Paused">
          <div className="surf-pause glass">
            <h2>Paused</h2>
            <button className="btn big" onClick={() => S.set({ paused: false })}>Resume exploration</button>
            <button className="btn ghost" onClick={() => S.set({ helpOpen: true })}>Controls</button>
            <button className="btn ghost" onClick={() => S.set({ mapOpen: true, paused: false })}>Site map</button>
            <button className="btn" onClick={() => expedition.returnToOrbit()} data-testid="return-to-orbit">⤴ Return to orbit</button>
          </div>
        </div>
      )}
    </div>
  )
}
