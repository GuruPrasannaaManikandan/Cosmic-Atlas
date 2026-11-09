import { useEffect, useState } from 'react'
import { ship, setFlightModel, setCameraView, cycleCameraView, toggleStabilization, setGear, cancelAutopilot, GEAR_SPEEDS } from './shipState'
import { travelUi } from './travelControls'
import { BY_ID, positionOf } from '../data/catalog'
import { useStore } from '../store/store'
import { sub, len, toThree, formatDistance, LY_PER_AU } from '../astro/coords'
import * as THREE from 'three'

export function TravelHUD() {
  const [, setTick] = useState(0)
  const ms = useStore((s) => s.simMs)
  const set = useStore((s) => s.set)
  const navMapOpen = useStore((s) => s.navMapOpen)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [])

  // The flight-controls dialog owns the keyboard while open (Escape closes it, not Travel Mode).
  useEffect(() => {
    travelUi.helpOpen = showHelp
    if (!showHelp) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHelp(false)
    }
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('keydown', k)
      travelUi.helpOpen = false
    }
  }, [showHelp])

  const refObj = ship.refBodyId ? BY_ID[ship.refBodyId] : null
  const nearestObj = BY_ID[ship.nearestId]
  const altitudeText = Number.isFinite(ship.nearestSurfaceLy) ? formatDistance(Math.max(0, ship.nearestSurfaceLy)) : '—'
  const eventText = ship.event && performance.now() - ship.event.at < 6000 ? ship.event.text : null
  const arrivedObj = ship.arrivedId ? BY_ID[ship.arrivedId] : null

  const targetObj = ship.targetId ? BY_ID[ship.targetId] : null
  let targetDistText = '—'
  let targetBearingDeg = 0
  if (targetObj) {
    const targetP = positionOf(targetObj, ms)
    const rel = sub(targetP, ship.pos)
    const dist = len(rel)
    targetDistText = formatDistance(dist)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)
    const toTarget = new THREE.Vector3(...toThree(rel)).normalize()
    targetBearingDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, fwd.dot(toTarget)))) * (180 / Math.PI))
  }

  const speedDisplay =
    ship.speedC >= 0.05
      ? `${ship.speedC.toFixed(2)} c`
      : `${Math.round(ship.speedKmS).toLocaleString()} km/s`

  const statusClass = {
    nominal: 'dwelling',
    autopilot: 'flying',
    warp: 'flying',
    'proximity-alert': 'bad',
  }[ship.systemStatus]

  return (
    <div className="travel-hud">
      {/* Top Telemetry & Mode Bar */}
      <div className="travel-top-bar glass">
        <div className="travel-title">
          <span className="logo" aria-hidden>🚀</span>
          <div>
            <b>SPACECRAFT FLIGHT CONTROLLER</b>
            <div className="sub">ATLAS-I INTERPLANETARY SCOUT</div>
          </div>
        </div>

        <div className="travel-modes-group">
          {/* Status Badge */}
          <span className={'pill ' + statusClass}>
            ● {ship.systemStatus.toUpperCase().replace('-', ' ')}
          </span>

          {/* Flight Model Toggle */}
          <button
            className={'btn' + (ship.flightModel === 'assisted' ? ' on' : '')}
            onClick={() => setFlightModel(ship.flightModel === 'assisted' ? 'inertial' : 'assisted')}
            title="Toggle Flight Model (F key): Assisted (auto-stabilized) vs Inertial (Newtonian coasting)"
          >
            {ship.flightModel === 'assisted' ? '⚡ Assisted Flight' : '⟲ Inertial Flight'}
          </button>

          {/* Stabilization Toggle */}
          <button
            className={'btn' + (ship.stabilization ? ' on' : '')}
            onClick={toggleStabilization}
            title="Toggle Velocity Damping / RCS Retro-Thrust (X key)"
          >
            {ship.stabilization ? '◎ Damping ON' : '○ Damping OFF'}
          </button>

          {/* Throttle Gear Selector */}
          <div className="gear-selector" title="Throttle Range (1-4 keys)">
            {[1, 2, 3, 4].map((g) => (
              <button
                key={g}
                className={'gear-btn' + (ship.gear === g ? ' active' : '')}
                onClick={() => setGear(g as 1 | 2 | 3 | 4)}
              >
                G{g}
              </button>
            ))}
          </div>

          {/* Camera View Switcher */}
          <button
            className="btn ghost"
            onClick={cycleCameraView}
            title="Cycle Camera View (V key): Cockpit / Chase / External"
          >
            🎥 {ship.cameraView.toUpperCase()}
          </button>

          {/* Navigation Map Button */}
          <button
            className={'btn' + (navMapOpen ? ' on' : '')}
            onClick={() => set({ navMapOpen: !navMapOpen })}
            title="Open Solar System Astrogation Map (M key)"
          >
            🗺 Nav Map (M)
          </button>

          {/* Quick Help */}
          <button
            className="icon-btn"
            onClick={() => setShowHelp(!showHelp)}
            title="Flight Controls Help"
          >
            ?
          </button>

          <span className="divider" />

          {/* Return to Explore Mode */}
          <button
            className="btn primary"
            onClick={() => useStore.getState().exitTravelMode()}
            title="Exit spacecraft and return to Observatory Explorer (Esc)"
          >
            ↩ Exit to Explore
          </button>
        </div>
      </div>

      {/* Bottom Left Primary Flight Telemetry */}
      <div className="travel-flight-panel glass">
        <div className="eyebrow cy">FLIGHT TELEMETRY</div>
        <div className="tf-metrics">
          <div className="tf-metric">
            <label>LINEAR VELOCITY</label>
            <b className="val-hi">{speedDisplay}</b>
            <small>
              {refObj ? `relative to ${refObj.name} · ` : ''}
              {GEAR_SPEEDS[ship.gear].label}
            </small>
          </div>

          <div className="tf-metric">
            <label>THROTTLE</label>
            <b>{Math.round(ship.thrust * 100)}% {ship.boost ? '⚡ BOOST' : ship.reverse ? '⏪ REV' : ''}</b>
            <div className="mini-progress">
              <i
                style={{
                  width: `${Math.round(ship.thrust * 100)}%`,
                  background: ship.boost ? 'var(--vi)' : 'var(--cy)',
                }}
              />
            </div>
          </div>

          <div className="tf-metric">
            <label>ATTITUDE HEADING</label>
            <b>Y {Math.round(ship.headingDeg.yaw)}° · P {Math.round(ship.headingDeg.pitch)}°</b>
            <small>Accel: {ship.gForce < 1000 ? `${ship.gForce.toFixed(1)} g` : `${ship.gForce.toExponential(1)} g (drive)`}</small>
          </div>

          <div className="tf-metric" data-testid="hud-altitude">
            <label>ALTITUDE</label>
            <b className={ship.systemStatus === 'proximity-alert' ? 'warn' : ''}>{altitudeText}</b>
            <small>above {nearestObj ? nearestObj.name : '—'}{ship.systemStatus === 'proximity-alert' ? ' · ⚠ PROXIMITY' : ''}</small>
          </div>
        </div>
        {eventText && (
          <div className="travel-event" role="status" aria-live="polite">
            {eventText}
          </div>
        )}
      </div>

      {/* Bottom Right Target Navigation / Autopilot Card */}
      {targetObj && (
        <div className="travel-target-card glass">
          <div className="tc-head">
            <span className="eyebrow warm">LOCKED DESTINATION</span>
            <span className="pill">{targetBearingDeg}° bearing</span>
          </div>

          <h3 style={{ margin: '4px 0 2px', fontSize: '18px' }}>{targetObj.name}</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--txt-dim)' }}>
            <span>Separation: <b>{targetDistText}</b></span>
            <span>Bearing: <b>{targetBearingDeg < 10 ? 'Ahead' : `${targetBearingDeg}° offset`}</b></span>
          </div>

          {/* Autopilot active state */}
          {ship.autopilot.active && (
            <div className="autopilot-banner" style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--cy)' }}>
                <b>AUTOPILOT: {ship.autopilot.phase.toUpperCase()}</b>
                <span>ETA: {Math.max(0, Math.round(ship.autopilot.etaSec))}s</span>
              </div>
              <div className="progress" style={{ margin: '4px 0 6px' }}>
                <i style={{ width: `${Math.round(ship.autopilot.progress * 100)}%` }} />
              </div>
              <button
                className="btn sm"
                style={{ width: '100%', height: '26px', fontSize: '11px', borderColor: 'var(--warm)' }}
                onClick={() => cancelAutopilot('Autopilot disengaged')}
              >
                Disengage Autopilot (Manual Takeover)
              </button>
            </div>
          )}

          {!ship.autopilot.active && arrivedObj && (
            <div className="autopilot-banner" style={{ marginTop: '8px', fontSize: '11px', color: 'var(--ok)' }}>
              <b>ARRIVED · HOLDING STATION AT {arrivedObj.name.toUpperCase()}</b>
              <div style={{ color: 'var(--txt-dim)' }}>Position is held relative to {arrivedObj.name} as time runs. Any thrust input resumes manual flight.</div>
            </div>
          )}

          {!ship.autopilot.active && (
            <div className="actions" style={{ marginTop: '8px' }}>
              <button
                className="btn primary sm"
                style={{ flex: 1, height: '28px', fontSize: '11.5px' }}
                onClick={() => set({ navMapOpen: true })}
              >
                Open Nav Map
              </button>
            </div>
          )}
        </div>
      )}

      {/* Flight Controls Help Modal */}
      {showHelp && (
        <div className="modal" onClick={() => setShowHelp(false)} role="dialog" aria-modal="true">
          <div className="card glass" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Flight Operations Manual</div>
            <h2>Spacecraft Flight Controls</h2>

            <div className="help-grid">
              <div className="help-box">
                <h4>Propulsion & Velocity</h4>
                <table className="help-table">
                  <tbody>
                    <tr><td><kbd>W</kbd></td><td>Throttle up (forward thrust)</td></tr>
                    <tr><td><kbd>S</kbd></td><td>Throttle down; hold at 0% to thrust backward</td></tr>
                    <tr><td><kbd>A</kbd> / <kbd>D</kbd></td><td>Thrust left / right</td></tr>
                    <tr><td><kbd>Space</kbd> / <kbd>C</kbd></td><td>Thrust up / down</td></tr>
                    <tr><td><kbd>Shift</kbd></td><td>Boost ×3 while held</td></tr>
                    <tr><td><kbd>B</kbd></td><td>Brake</td></tr>
                    <tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Speed range (sub-light → warp)</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="help-box">
                <h4>Attitude & Orientation</h4>
                <table className="help-table">
                  <tbody>
                    <tr><td><kbd>Mouse drag</kbd></td><td>Look / steer (cockpit &amp; chase)</td></tr>
                    <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Yaw left / right</td></tr>
                    <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Pitch up / down</td></tr>
                    <tr><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>Roll left / right</td></tr>
                    <tr><td><kbd>F</kbd></td><td>Assisted vs inertial flight</td></tr>
                    <tr><td><kbd>X</kbd></td><td>Toggle stabilisation (damping)</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="help-box">
              <h4>Astrogation & Camera</h4>
              <table className="help-table">
                <tbody>
                  <tr><td><kbd>V</kbd></td><td>Cycle camera: cockpit / chase / external</td></tr>
                  <tr><td><kbd>Mouse drag</kbd></td><td>Orbit the camera (external view)</td></tr>
                  <tr><td><kbd>Mouse wheel</kbd></td><td>Camera distance (chase, external) · throttle (cockpit)</td></tr>
                  <tr><td><kbd>M</kbd></td><td>Navigation map &amp; autopilot</td></tr>
                  <tr><td><kbd>Esc</kbd></td><td>Close dialog / exit Travel Mode</td></tr>
                  <tr><td colSpan={2} style={{ color: 'var(--txt-dim)' }}>Any flight input disengages the autopilot. Speed is limited near bodies so you cannot skip into a planet.</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={() => setShowHelp(false)}>
                Resume Flight
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
