import { useState, useEffect } from 'react'
import { travelEngineState, subscribeTravelEngine, cancelTravel } from './travelEngine'

export function TravelProgressHUD() {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribeTravelEngine(() => setTick((t) => t + 1))
  }, [])

  const { phase, targetName, targetCategory, progress, etaSec, distanceLy, errorMsg } = travelEngineState

  if (phase === 'idle' || phase === 'inspecting') return null

  const pct = Math.min(100, Math.round(progress * 100))

  return (
    <div className="travel-progress-hud glass" role="status" aria-live="polite">
      <div className="travel-hud-content">
        <div className="travel-hud-icon-wrap">
          {phase === 'traveling' && <span className="travel-hud-pulse-dot" />}
          {phase === 'arriving' && <span className="travel-hud-done-icon">✓</span>}
          {phase === 'cancelled' && <span className="travel-hud-cancel-icon">✕</span>}
          {phase === 'error' && <span className="travel-hud-error-icon">⚠</span>}
        </div>

        <div className="travel-hud-meta">
          <div className="travel-hud-title-row">
            <span className="travel-hud-phase">
              {phase === 'resolving_destination' && 'RESOLVING COORDINATES…'}
              {phase === 'preparing_scene' && 'CALIBRATING APPROACH VECTOR…'}
              {phase === 'traveling' && `WARP FLIGHT TO ${targetName?.toUpperCase()}`}
              {phase === 'arriving' && `ARRIVED AT ${targetName?.toUpperCase()}`}
              {phase === 'cancelled' && 'TRAVEL CANCELLED'}
              {phase === 'error' && 'NAVIGATION ERROR'}
            </span>
            {phase === 'traveling' && (
              <span className="travel-hud-eta">ETA: {etaSec.toFixed(1)}s</span>
            )}
          </div>

          {phase === 'traveling' && (
            <div className="travel-progress-bar-track">
              <div className="travel-progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          )}

          {errorMsg && <div className="travel-hud-error-msg">{errorMsg}</div>}
        </div>

        {phase === 'traveling' && (
          <button
            className="travel-hud-cancel-btn"
            onClick={cancelTravel}
            title="Cancel flight and resume manual control"
          >
            ✕ Cancel
          </button>
        )}
      </div>
    </div>
  )
}
