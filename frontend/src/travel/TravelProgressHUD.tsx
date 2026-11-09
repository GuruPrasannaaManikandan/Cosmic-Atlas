import { useState, useEffect } from 'react'
import { travelEngineState, subscribeTravelEngine, cancelTravel } from './travelEngine'

const KM_PER_LY = 9.4607304725808e12
const LY_PER_AU = 1.581250740982e-5

/** Human-readable distance for a value in light-years. */
export function fmtDistance(ly: number): string {
  if (ly < 0.2 * LY_PER_AU) return `${Math.round(ly * KM_PER_LY).toLocaleString('en-US')} km`
  if (ly < 0.05) return `${(ly / LY_PER_AU).toFixed(ly / LY_PER_AU < 10 ? 2 : 1)} AU`
  if (ly < 1e5) return `${ly.toFixed(ly < 10 ? 2 : 0)} ly`
  return `${(ly / 1e6).toFixed(2)} Mly`
}

/** Real light-travel time, compactly. */
export function fmtLightTime(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)} s`
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} h`
  const yr = sec / (365.25 * 86400)
  if (yr < 1) return `${(sec / 86400).toFixed(1)} d`
  return yr < 1e4 ? `${yr.toFixed(yr < 10 ? 1 : 0)} yr` : `${(yr / 1e6).toFixed(2)} Myr`
}

/**
 * Compact warp-flight instrument (Explore-mode camera flights). A slim strip near the top edge - never over the
 * centre of the view: route, mode, thin progress bar, ETA of the (time-compressed) flight, the REAL light time for
 * the remaining distance, and an icon-only cancel control with an accessible label.
 */
export function TravelProgressHUD() {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribeTravelEngine(() => setTick((t) => t + 1))
  }, [])

  const { phase, targetName, fromName, progress, etaSec, distanceLy, lightTimeSec, errorMsg } = travelEngineState

  if (phase === 'idle' || phase === 'inspecting' || phase === 'resolving_destination' || phase === 'preparing_scene') return null

  const pct = Math.min(100, Math.round(progress * 100))
  const mode = phase === 'traveling' ? (progress < 0.25 ? 'Departing' : progress > 0.75 ? 'Approach' : 'Warp') : null

  return (
    <div className={`flight-hud flight-hud--${phase}`} role="status" aria-live="polite" aria-label="Flight status">
      {phase === 'traveling' && (
        <>
          <div className="flight-hud-row">
            <span className="flight-hud-mode">{mode}</span>
            <span className="flight-hud-route" title={`${fromName ? fromName + ' → ' : ''}${targetName}`}>
              {fromName && <span className="flight-hud-from">{fromName} </span>}
              <span aria-hidden>→</span> <b>{targetName}</b>
            </span>
            <span className="flight-hud-eta" title="Time to arrival (compressed flight)">{etaSec.toFixed(1)} s</span>
            <button className="flight-hud-cancel" onClick={cancelTravel} aria-label="Cancel flight" title="Cancel flight (stay here)">
              <span aria-hidden>✕</span>
            </button>
          </div>
          <div className="flight-hud-bar" aria-hidden>
            <div className="flight-hud-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="flight-hud-sub" title="Real distance remaining and the time light needs to cross it; the flight itself is time-compressed">
            {fmtDistance(distanceLy)} · light {fmtLightTime(lightTimeSec)}
          </div>
        </>
      )}
      {phase === 'arriving' && <div className="flight-hud-row"><span className="flight-hud-mode ok">Arrived</span><b>{targetName}</b></div>}
      {phase === 'cancelled' && <div className="flight-hud-row"><span className="flight-hud-mode">Flight cancelled</span><span className="flight-hud-sub">holding position</span></div>}
      {phase === 'error' && <div className="flight-hud-row"><span className="flight-hud-mode err">Navigation error</span><span className="flight-hud-sub">{errorMsg}</span></div>}
    </div>
  )
}
