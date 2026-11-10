import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { OBJECT_BY_ID, MISSION_BY_ID } from '../missions'
import { SITE_BY_ID } from './sites'
import { planetFor, EARTH_G } from './planets'
import { hudEls } from './hudLayout'
import { useSurface } from './surfaceState'
import { SurfaceScene, DtmData } from './SurfaceScene'
import { loadDtm, loadHorizon } from './terrain'
import { TouchStick, TouchButtons, useTouchDevice } from './TouchControls'
import { GuideBubble } from './GuideBubble'
import { useGuide } from './guide'
import { useNarrator } from './narrator'
import { MiniMap, SurfaceMap } from './SurfaceMap'
import { DiscoveryPanel } from './DiscoveryPanel'
import { elevationDeg, azimuthDeg } from './lighting'
import { bearingDeg } from './geo'
import { preloadNasaModel } from './models/NasaModel'
import { ControlsPanel } from '../input/ControlsPanel'
import '../input/controls.css'
import { MoonReplay, beginMoonReplay } from './MoonReplay'
import { replayFor } from '../replay/replay'

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

/** registers a HUD region element for the safe-area measurement */
function useHudEl(key: keyof typeof hudEls) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    hudEls[key] = ref.current
    return () => {
      if (hudEls[key] === ref.current) hudEls[key] = null
    }
  })
  return ref
}

/**
 * Shared exploration HUD (any world): an in-flow grid inside the 3-D viewport —
 *   header · status (compass, waypoint, night) · centre (banner on top, prompt at the bottom) · bottom row.
 * Nothing is placed with fixed offsets, so a wrapping header or an open inspector never pushes things underneath.
 * While inspecting, only the header (with Return to orbit) stays; the inspector and the guide take over.
 */
function Hud({ touch }: { touch: boolean }) {
  const S = useSurface()
  const site = SITE_BY_ID[S.siteId!]
  const planet = planetFor(site.bodyId)
  const simMs = useStore((s) => s.simMs)
  const sun = useMemo(() => planet.sunDirection!(simMs, site.origin.latDeg, site.origin.lonEastDeg), [simMs, site, planet])
  const sunEl = elevationDeg(sun)
  const wp = site.objects.find((o) => o.objectId === S.waypointId)
  const wpDist = wp ? Math.hypot(wp.x - S.player.x, wp.z - S.player.z) : 0
  const near = S.nearbyId ? OBJECT_BY_ID[S.nearbyId] : null
  const inspecting = !!S.panel
  const headerRef = useHudEl('header')
  const statusRef = useHudEl('status')
  const bottomRef = useHudEl('bottom')
  const promptRef = useHudEl('prompt')
  const bannerRef = useHudEl('banner')

  return (
    <div className="surf-hud" data-inspecting={inspecting ? 'on' : undefined}>
      <header className="surf-top" ref={headerRef}>
        <div className="surf-top-info">
          <span className="eyebrow">{planet.name.toUpperCase()} SURFACE · {MISSION_BY_ID[site.missionIds[0]].name.toUpperCase()}</span>
          <b className="surf-top-title">{site.name}</b>
          <span className="surf-top-meta">
            g = {planet.gravity.value} m/s² · {new Date(simMs).toISOString().slice(0, 16).replace('T', ' ')} UTC · Sun {sunEl.toFixed(1)}° {sunEl > 0 ? `at ${azimuthDeg(sun).toFixed(0)}°` : '(below horizon)'}
          </span>
        </div>
        <nav className="surf-top-actions" aria-label="Surface actions">
          <button className="btn ghost" onClick={() => S.set({ mapOpen: true })}>🗺 Map <kbd>M</kbd></button>
          <button className="btn ghost" onClick={() => S.set({ camMode: S.camMode === 'third' ? 'first' : 'third' })}>
            {S.camMode === 'third' ? '👁 First person' : '🧑‍🚀 Third person'} <kbd>V</kbd>
          </button>
          <button className="btn ghost" onClick={() => S.set({ helpOpen: true })} aria-label="Controls help">? <kbd>H</kbd></button>
          <button className="btn" onClick={() => useStore.getState().exitSurface()}>⤴ Return to orbit</button>
        </nav>
      </header>
      <div className="surf-status" ref={statusRef}>
        {!inspecting && <Compass />}
        {sunEl <= 0 && (
          <div className="surf-chip surf-night" role="status">
            <span><b>{planet.words.night}</b> The Sun is {Math.abs(sunEl).toFixed(0)}° below the horizon; {planet.words.nightLight}.</span>
            <button className="btn small" onClick={() => useStore.getState().setSim(site.daylight.ms)}>☀ Go to {site.daylight.label} ({new Date(site.daylight.ms).toUTCString().slice(5, 16)})</button>
          </div>
        )}
        {wp && !inspecting && (
          <div className="surf-chip surf-waypoint">
            ◎ {OBJECT_BY_ID[wp.objectId].name.replace(/^Apollo \d+ /, '')} · <b>{wpDist.toFixed(0)} m</b> · bearing {bearingDeg(S.player.x, S.player.z, wp.x, wp.z).toFixed(0)}°
          </div>
        )}
      </div>
      <div className="surf-center">
        {S.banner && !inspecting && (
          <div className="surf-banner" role="status" aria-live="assertive" ref={bannerRef}>
            <span>DISCOVERED</span>
            <b>{OBJECT_BY_ID[S.banner].name}</b>
          </div>
        )}
        {near && !inspecting && !S.mapOpen && (
          <div className="surf-prompt" ref={promptRef}>
            {!touch && <kbd>E</kbd>} <span className="surf-prompt-text">Inspect <b>{near.name}</b></span>
            <button className="btn small" onClick={() => S.set({ panel: { objectId: near.id, tab: 'inspect' }, component: null, banner: null })}>Inspect</button>
          </div>
        )}
      </div>
      {!inspecting && (
        <div className="surf-bottom" ref={bottomRef}>
          <div className="surf-bottom-left">{touch ? <TouchStick /> : <MiniMap site={site} />}</div>
          {touch ? (
            <div className="surf-bottom-mid">
              <MiniMap site={site} />
            </div>
          ) : (
            <p className="surf-provenance">{site.terrainProvenance}</p>
          )}
          <div className="surf-bottom-right">
            {touch ? (
              <TouchButtons />
            ) : (
              <div className="surf-keys">
                <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> look · <kbd>Shift</kbd> lope · <kbd>Space</kbd> hop · <kbd>E</kbd> inspect · <kbd>M</kbd> map · <kbd>Esc</kbd> pause
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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
  const planet = planetFor(site.bodyId)
  const g = planet.gravity
  return (
    <div className="surf-overlay" role="dialog" aria-label="Controls">
      <div className="surf-pause glass surf-help">
        <h2>Controls</h2>
        {/* generated from the input manager's bindings: it can only list controls that work */}
        <ControlsPanel mode="PLANETARY_EXPLORATION" extra={[{ keys: 'Mouse', label: 'Look around: click the view to capture the mouse, or drag' }]} />
        <p className="muted small">Walking is relative to where the camera looks. The arrow keys only turn the camera; they never move you.</p>
        <p className="muted small">
          Gravity on the {planet.name} is {g.value} m/s² (NASA NSSDCA fact sheet): Earth's {EARTH_G} m/s² is about {(EARTH_G / (g.value ?? EARTH_G)).toFixed(1)} times stronger, so the same push carries you about that many times higher. Walking speeds are gameplay tuning, not measured astronaut data.
        </p>
        <button className="btn" onClick={() => set({ helpOpen: false })}>Close</button>
      </div>
    </div>
  )
}

export default function SurfaceExperience() {
  const siteId = useStore((s) => s.surfaceSiteId)
  const touch = useTouchDevice()
  const S = useSurface()
  // measured terrain must be ready before the scene (and the character controller) start
  const [dtm, setDtm] = useState<{ siteId: string; data: DtmData; error?: string } | null>(null)
  useEffect(() => {
    preloadNasaModel('apollo-lm')
    useSurface.getState().reset(siteId)
    useGuide.getState().reset()
    useNarrator.getState().stop()
    const site = siteId ? SITE_BY_ID[siteId] : null
    let live = true
    if (site?.terrain.kind === 'dtm') {
      setDtm(null)
      const file = site.terrain.file
      Promise.all([loadDtm(file), loadHorizon(file.replace(/\.json$/, '.horizon.json')).catch(() => null)])
        .then(([d, horizon]) => live && setDtm({ siteId: site.id, data: { ...d, horizon } }))
        .catch((e) => live && setDtm({ siteId: site.id, data: null, error: String(e?.message ?? e) }))
    } else if (site) setDtm({ siteId: site.id, data: null })
    return () => {
      live = false
      useSurface.getState().reset(null)
    }
  }, [siteId])
  const site = siteId ? SITE_BY_ID[siteId] : null
  if (!site || S.siteId !== siteId) return null
  if (!dtm || dtm.siteId !== site.id)
    return (
      <div className="surface-root" data-testid="surface-root">
        <div className="surf-intro" role="status">
          <span className="eyebrow">PREPARING THE SURFACE</span>
          <b>{site.name}</b>
          <span className="muted">Loading the LROC terrain model…</span>
        </div>
      </div>
    )
  return (
    <div
      className="surface-root"
      data-testid="surface-root"
      data-touch={touch ? 'on' : undefined}
      data-panel={S.panel ? (S.panelCollapsed ? 'collapsed' : 'on') : undefined}
    >
      <div className="surf-viewport">
        <div className="surf-canvas">
          <SurfaceScene site={site} dtm={dtm.data} />
        </div>
        {dtm.error && <p className="surf-terrain-error" role="status">Measured terrain could not be loaded ({dtm.error}); showing illustrative terrain instead.</p>}
        {S.intro ? (
          <div className="surf-intro" role="status">
            <span className="eyebrow">DESCENT</span>
            <b>{site.name}</b>
            <span className="muted">{planetFor(site.bodyId).name} · {Math.abs(site.origin.latDeg).toFixed(4)}°{site.origin.latDeg >= 0 ? 'N' : 'S'}, {site.origin.lonEastDeg.toFixed(4)}°E</span>
            <button className="btn ghost small" onClick={() => S.set({ intro: false })}>Skip</button>
          </div>
        ) : S.replay ? (
          <MoonReplay />
        ) : (
          <Hud touch={touch} />
        )}
        {!S.intro && !S.replay && <GuideBubble />}
      </div>
      {S.panel && !S.replay && <DiscoveryPanel onRelive={replayFor(S.panel.objectId) ? () => beginMoonReplay(S.panel!.objectId) : undefined} />}
      {S.mapOpen && <SurfaceMap site={site} />}
      {S.paused && !S.helpOpen && <PauseMenu />}
      {S.helpOpen && <Help />}
    </div>
  )
}
