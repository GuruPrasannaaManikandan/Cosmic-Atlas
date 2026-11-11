import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { useSurface } from '../surface/surfaceState'
import { UNITY_SITE_BY_ID } from '../surface/sites'
import { planetFor } from '../surface/planets'
import { OBJECT_BY_ID, MISSION_BY_ID } from '../missions'
import { DiscoveryPanel } from '../surface/DiscoveryPanel'
import { DiscoveryCatalogue } from '../discovery/DiscoveryCatalogue'
import { useDiscoveryTracking } from '../discovery/tracking'
import { ControlsPanel } from '../input/ControlsPanel'
import { input } from '../input/appInput'
import { startMars, stopMars, onMars, send, addPointer, marsLast, type MarsPose, type MarsReady } from './marsBridge'
import { MarsReplay, beginMarsReplay } from './MarsReplay'
import { MarsMiniMap } from './MarsMiniMap'
import { expedition } from '../expedition/expedition'
import '../input/controls.css'
import './mars.css'

/** component → what the Unity inspection camera frames (solar array and mobility also highlight the model's own part) */
const ANCHOR: Record<string, string> = {
  'merb-solar-array': 'solar',
  'merb-mobility': 'mobility',
  'merb-pma': 'mast',
  'merb-pancam': 'mast',
  'merb-navcam': 'mast',
  'merb-minites': 'mast',
  'merb-idd': 'arm',
  'merb-telecom': 'hga',
  'merb-web': 'body',
  'merb-avionics': 'body',
  'merb-batteries': 'body',
}

const deg = (r: number) => (r * 180) / Math.PI
/** bearing (° clockwise from north) in the Unity site frame: x east, z north */
const bearing = (x0: number, z0: number, x1: number, z1: number) => (deg(Math.atan2(x1 - x0, z1 - z0)) + 360) % 360

function Compass({ pose }: { pose: MarsPose }) {
  const heading = (deg(pose.camYaw) + 360) % 360
  const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((t, i) => ({ t, b: i * 45 }))
  const pos = (b: number) => {
    const d = ((b - heading + 540) % 360) - 180
    return Math.abs(d) > 75 ? null : 50 + (d / 75) * 50
  }
  const ob = pos(bearing(pose.x, pose.z, pose.oppX, pose.oppZ))
  return (
    <div className="surf-compass" aria-label={`Camera heading ${heading.toFixed(0)}°`}>
      {marks.map((m) => {
        const x = pos(m.b)
        return x === null ? null : (
          <span key={m.t} className={m.t.length === 1 ? 'major' : ''} style={{ left: `${x}%` }}>
            {m.t}
          </span>
        )
      })}
      {ob !== null && <i className="obj wp" style={{ left: `${ob}%` }} title="Opportunity" />}
      <b className="needle">{heading.toFixed(0)}°</b>
    </div>
  )
}

/** site map from the bridge reports: DTM extent, Victoria's fitted centre, the expedition rover and Opportunity */
function MarsMap({ ready, pose, onClose }: { ready: MarsReady; pose: MarsPose; onClose: () => void }) {
  const [e0, e1] = ready.site.extentEastM
  const [n0, n1] = ready.site.extentNorthM
  const W = e1 - e0, H = n1 - n0
  const X = (x: number) => x - e0
  const Y = (z: number) => n1 - z
  const hd = deg(pose.heading)
  return (
    <div className="surf-overlay" role="dialog" aria-modal="true" aria-label="Site map" onClick={onClose}>
      <div className="surf-pause glass mars-map" onClick={(e) => e.stopPropagation()}>
        <h2>Victoria crater — site map</h2>
        <svg viewBox={`0 0 ${W} ${H}`} className="mars-map-svg" role="img" aria-label="Map of the explorable terrain">
          <rect x={0} y={0} width={W} height={H} className="mm-extent" />
          {/* the centre fitted to the DTM rim crest; the circle is only a guide to the ~800 m crater (NASA) */}
          <circle cx={X(0)} cy={Y(0)} r={400} className="mm-rim" />
          <text x={X(0)} y={Y(0)} className="mm-label" textAnchor="middle">Victoria crater</text>
          <circle cx={X(ready.start.x)} cy={Y(ready.start.z)} r={10} className="mm-start" />
          <g transform={`translate(${X(pose.oppX)} ${Y(pose.oppZ)})`}>
            <circle r={14} className="mm-opp" />
            <text y={-22} className="mm-label" textAnchor="middle">Opportunity</text>
          </g>
          <g transform={`translate(${X(pose.x)} ${Y(pose.z)}) rotate(${hd})`}>
            <path d="M0,-26 L15,16 L0,8 L-15,16 Z" className="mm-you" />
          </g>
        </svg>
        <p className="muted small">
          Grey: the HiRISE terrain tile you can drive on (holes are no-data cells, never filled with invented relief). The circle is a guide to Victoria's ~800 m diameter (NASA); its centre is fitted to the DTM rim. North is up.
        </p>
        <button className="btn" onClick={onClose}>Close <kbd>Esc</kbd></button>
      </div>
    </div>
  )
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="surf-overlay" role="dialog" aria-modal="true" aria-label="Controls">
      <div className="surf-pause glass surf-help">
        <h2>Controls</h2>
        <ControlsPanel mode="VEHICLE_EXPLORATION" extra={[{ keys: 'Mouse', label: 'Drag the view to orbit the camera; wheel to zoom' }]} />
        <p className="muted small">
          The arrow keys only turn the camera; they never steer or move the rover. The rover you drive is an illustrative expedition vehicle, not a NASA design: its speeds and its 32° slope limit are gameplay tuning (Opportunity's top speed was 5 cm/s). Slopes slow it using Mars' measured gravity, 3.73 m/s² (NASA NSSDCA), scaled by half for playability.
        </p>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export default function MarsExperience() {
  const siteId = useStore((s) => s.surfaceSiteId)!
  const site = UNITY_SITE_BY_ID[siteId]
  const planet = planetFor(site.bodyId)
  const S = useSurface()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [load, setLoad] = useState<{ state: 'loading' | 'error' | 'running'; progress: number; error?: string }>({ state: 'loading', progress: 0 })
  const [ready, setReady] = useState<MarsReady | null>(null)
  const [pose, setPose] = useState<MarsPose | null>(null)
  const embedded = useRef(false)
  const bannerTimer = useRef<number | null>(null)

  // player lifecycle: created on entry, destroyed on exit (never two live renderers)
  useEffect(() => {
    const arrival = expedition.peekArrival(siteId)
    useSurface.getState().reset(siteId)
    useSurface.getState().set({ driving: true, intro: arrival, panel: null })
    embedded.current = false
    const off = onMars((kind, data) => {
      if (kind === 'ready') {
        setReady(data)
        if (!embedded.current) {
          embedded.current = true
          send('Embed', JSON.stringify({ arrival }))
        }
      } else if (kind === 'pose') {
        setPose(data)
        const S = useSurface.getState()
        // only real changes go to the shared store (the minimap and HUD read the pose directly, not 10x/s store writes)
        if ((data.near ?? null) !== S.nearbyId) S.set({ nearbyId: data.near ?? null })
      } else if (kind === 'discovered') {
        const S = useSurface.getState()
        if (!S.discovered.includes(data.id)) {
          S.set({ discovered: [...S.discovered, data.id], banner: data.id })
          if (bannerTimer.current) clearTimeout(bannerTimer.current)
          bannerTimer.current = window.setTimeout(() => useSurface.getState().set({ banner: null }), 5000)
        }
      } else if (kind === 'arrived') {
        expedition.clearArrival()
        useSurface.getState().set({ intro: false })
      }
    })
    // started one tick later: React StrictMode (development) mounts, unmounts and re-mounts immediately, and the
    // first, discarded mount must not begin a ~90 MB download or a second player on the same canvas
    const startTimer = window.setTimeout(() => {
      startMars(canvasRef.current!, site.build, (p) => setLoad((l) => (l.state === 'loading' ? { ...l, progress: p } : l)))
        .then(() => setLoad({ state: 'running', progress: 1 }))
        .catch((e) => setLoad({ state: 'error', progress: 0, error: String(e?.message ?? e) }))
    }, 0)
    return () => {
      window.clearTimeout(startTimer)
      off()
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      stopMars()
      useSurface.getState().reset(null)
      // a real exit (not a StrictMode re-mount) forgets a pending arrival
      window.setTimeout(() => {
        if (useStore.getState().surfaceSiteId !== siteId) expedition.clearArrival()
      }, 0)
    }
  }, [siteId, site.build])

  // React state → Unity mode (the input manager mode follows the same state, so keys and camera always agree)
  const panelId = S.panel?.objectId ?? null
  useEffect(() => {
    if (load.state !== 'running' || !embedded.current || S.replay) return
    if (panelId) {
      // the catalogue component says which inspection anchor frames it (the in-situ tools frame the arm they ride on)
      const comp = OBJECT_BY_ID['opportunity-rover']?.components.find((c) => c.id === S.component)
      send('Inspect', comp?.part ?? ANCHOR[S.component ?? ''] ?? 'whole')
    } else if (S.paused || S.mapOpen || S.helpOpen || S.catalogueOpen) send('SetExplorerMode', 'paused')
    else send('SetExplorerMode', S.intro ? 'resume' : 'explore')
  }, [load.state, panelId, S.component, S.paused, S.mapOpen, S.helpOpen, S.catalogueOpen, S.replay, S.intro])

  useDiscoveryTracking(siteId, pose)

  // keys (only in the modes that bind them)
  useEffect(() => {
    const offs = [
      input.on('interact', () => {
        const S = useSurface.getState()
        if (S.nearbyId && !S.panel) S.set({ panel: { objectId: S.nearbyId, tab: 'overview' }, component: null, banner: null })
      }, 'VEHICLE_EXPLORATION'),
      input.on('map', () => useSurface.getState().set({ mapOpen: !useSurface.getState().mapOpen })),
      input.on('help', () => useSurface.getState().set({ helpOpen: true })),
      input.on('catalogue', () => useSurface.getState().set({ catalogueOpen: !useSurface.getState().catalogueOpen })),
      input.on('back', () => {
        const S = useSurface.getState()
        if (S.replay) return // the replay owns Esc (Go back to present)
        if (S.catalogueOpen) S.set({ catalogueOpen: false })
        else if (S.helpOpen) S.set({ helpOpen: false })
        else if (S.mapOpen) S.set({ mapOpen: false })
        else if (S.panel) S.set({ panel: null, component: null })
        else if (S.intro) send('SkipArrival')
        else S.set({ paused: !S.paused })
      }),
    ]
    return () => offs.forEach((f) => f())
  }, [])

  // pointer: drag orbits the camera, wheel zooms (merged with the arrow keys in Unity)
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

  const opp = ready?.objects.find((o) => o.id === 'opportunity-rover')
  const near = S.nearbyId ? OBJECT_BY_ID[S.nearbyId] : null
  const inspecting = !!S.panel
  const sceneMeta = pose ? `g = ${planet.gravity.value} m/s² · ${pose.utc.slice(0, 16).replace('T', ' ')} UTC · sol ${pose.sol} · Sun ${pose.sunElevation.toFixed(1)}° at ${pose.sunAzimuth.toFixed(0)}°` : `g = ${planet.gravity.value} m/s²`
  const arrivalStage = !pose || pose.arrivalT < 0.35 ? 'Entry' : pose.arrivalT < 0.7 ? 'Descent' : pose.arrivalT < 0.95 ? 'Touchdown' : 'Surface'

  return (
    <div className="surface-root mars-root" data-testid="mars-root" data-panel={S.panel ? (S.panelCollapsed ? 'collapsed' : 'on') : undefined} data-replay={S.replay ? 'on' : undefined}>
      <div className="surf-viewport">
        <div className="surf-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          <canvas ref={canvasRef} id="mars-canvas" className="mars-canvas" tabIndex={-1} aria-label="Mars surface, Victoria crater (3-D view)" />
        </div>

        {load.state === 'loading' && (
          <div className="surf-intro" role="status">
            <span className="eyebrow">PREPARING MARS</span>
            <b>{site.name}</b>
            <span className="muted">Loading the Unity terrain renderer… {Math.round(load.progress * 100)}%</span>
            <div className="mars-progress" aria-hidden><i style={{ width: `${Math.round(load.progress * 100)}%` }} /></div>
          </div>
        )}
        {load.state === 'error' && (
          <div className="surf-intro mars-error" role="alert">
            <span className="eyebrow">MARS RENDERER UNAVAILABLE</span>
            <b>The Mars surface could not start</b>
            <span className="muted small">{load.error}</span>
            <button className="btn" onClick={() => expedition.returnToOrbit()} data-testid="return-to-orbit">⤴ Return to orbit</button>
          </div>
        )}

        {load.state === 'running' && S.intro && !S.replay && (
          <div className="surf-intro mars-arrival" role="status" aria-live="polite">
            <span className="eyebrow">ARRIVAL · {arrivalStage.toUpperCase()}</span>
            <b>{site.name}</b>
            <span className="muted small">{Math.abs(site.origin.latDeg).toFixed(4)}°S, {site.origin.lonEastDeg.toFixed(4)}°E · Mars</span>
            <span className="muted small mars-honest">Illustrative arrival: a camera descent to the expedition's landing point — not a reconstruction of any real entry, descent and landing.</span>
            <button className="btn ghost small" onClick={() => send('SkipArrival')}>Skip <kbd>Esc</kbd></button>
          </div>
        )}

        {load.state === 'running' && !S.intro && !S.replay && pose && (
          <div className="surf-hud" data-inspecting={inspecting ? 'on' : undefined}>
            <header className="surf-top">
              <div className="surf-top-info">
                <span className="eyebrow">MARS SURFACE · {MISSION_BY_ID[site.missionIds[0]].name.toUpperCase()}</span>
                <b className="surf-top-title">{site.name}</b>
                <span className="surf-top-meta">{sceneMeta}</span>
              </div>
              <nav className="surf-top-actions" aria-label="Surface actions">
                <button className="btn ghost" onClick={() => S.set({ catalogueOpen: true })} data-testid="open-catalogue">◈ Discoveries <kbd>J</kbd></button>
                <button className="btn ghost" onClick={() => S.set({ mapOpen: true })}>🗺 Map <kbd>M</kbd></button>
                <button className="btn ghost" onClick={() => S.set({ helpOpen: true })} aria-label="Controls help">? <kbd>H</kbd></button>
                <button className="btn" onClick={() => expedition.returnToOrbit()} data-testid="return-to-orbit">⤴ Return to orbit</button>
              </nav>
            </header>
            <div className="surf-status">
              {!inspecting && <Compass pose={pose} />}
              {!inspecting && (
                <div className="surf-chip surf-waypoint" data-testid="mars-waypoint">
                  ◎ Opportunity · <b>{pose.oppDist.toFixed(0)} m</b> · bearing {bearing(pose.x, pose.z, pose.oppX, pose.oppZ).toFixed(0)}°
                </div>
              )}
              {!inspecting && (
                <div className="surf-chip mars-scene-note" title={site.scene.note}>
                  🕰 Scene: {site.scene.label}
                </div>
              )}
            </div>
            <div className="surf-center">
              {S.banner && !inspecting && (
                <div className="surf-banner" role="status" aria-live="assertive">
                  <span>DISCOVERED</span>
                  <b>{OBJECT_BY_ID[S.banner].name}</b>
                </div>
              )}
              {near && !inspecting && !S.mapOpen && (
                <div className="surf-prompt">
                  <kbd>E</kbd> <span className="surf-prompt-text">Inspect <b>{near.name}</b></span>
                  <button className="btn small" onClick={() => S.set({ panel: { objectId: near.id, tab: 'overview' }, component: null, banner: null })}>Inspect</button>
                </div>
              )}
            </div>
            {!inspecting && (
              <div className="surf-bottom">
                <div className="surf-bottom-left mars-bottom-left">
                <MarsMiniMap onOpen={() => S.set({ mapOpen: true })} />
                <div className="mars-telemetry" data-testid="mars-telemetry">
                  <span className="eyebrow">EXPEDITION ROVER · ILLUSTRATIVE</span>
                  <b>{Math.abs(pose.speed).toFixed(1)} m/s{pose.speed < -0.05 ? ' reverse' : ''}</b>
                  <span className="muted small">pitch {pose.pitchDeg.toFixed(0)}° · roll {pose.rollDeg.toFixed(0)}° · {pose.x.toFixed(0)} m E, {pose.z.toFixed(0)} m N of the crater centre</span>
                  {pose.blocked && <span className="mars-blocked">Too steep or blocked — back up or turn</span>}
                </div>
                </div>
                <p className="surf-provenance">
                  {site.terrainProvenance}
                  {marsLast.build && <span className="mars-build" data-testid="mars-build"> · Unity player {marsLast.build.id}, built {new Date(marsLast.build.built).toLocaleString()}</span>}
                </p>
                <div className="surf-bottom-right">
                  <div className="surf-keys">
                    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> look · <kbd>Shift</kbd> faster · <kbd>E</kbd> inspect · <kbd>M</kbd> map · <kbd>Esc</kbd> pause
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {S.replay && ready && <MarsReplay ready={ready} pose={pose} />}
      </div>
      {S.panel && !S.replay && (
        <DiscoveryPanel
          inspectNote="Each part is highlighted on NASA's articulated MER model (NASA 3D Resources): solar panel sections, wheels and rocker-bogie, the instrument arm with its turret, the Pancam mast, the high-gain antenna and the body. Pancam, Navcam and Mini-TES sit in the mast head, so they share its highlight; batteries and the flight computer are inside the body. Drag the view or use the arrow keys to orbit; wheel to zoom."
          clockButtons={false}
          onRelive={opp && ready ? () => beginMarsReplay(S.panel!.objectId, ready, marsLast.pose) : undefined}
        />
      )}
      {S.mapOpen && ready && pose && <MarsMap ready={ready} pose={pose} onClose={() => S.set({ mapOpen: false })} />}
      {S.catalogueOpen && ready && (
        <DiscoveryCatalogue
          siteId={siteId}
          siteName={site.name}
          missionId="mer-opportunity"
          pose={pose}
          hardware={ready.objects.map((o) => ({ id: o.id, x: o.x, z: o.z, parts: ['mast', 'solar', 'mobility', 'arm', 'hga', 'body'] }))}
          onOpenRecord={(hw) => S.set({ catalogueOpen: false, panel: { objectId: hw, tab: 'overview' }, component: null, banner: null })}
          onClose={() => S.set({ catalogueOpen: false })}
        />
      )}
      {S.helpOpen && <Help onClose={() => S.set({ helpOpen: false })} />}
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
