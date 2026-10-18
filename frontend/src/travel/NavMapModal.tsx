import { useEffect, useState } from 'react'
import { BY_ID, positionOf } from '../data/catalog'
import { useStore } from '../store/store'
import { ship, engageAutopilot, cancelAutopilot } from './shipState'
import { sub, len, toThree, formatDistance, LY_PER_AU } from '../astro/coords'
import * as THREE from 'three'

const BODIES = [
  { id: 'sun', name: 'The Sun', type: 'Star', color: '#ffcf8a' },
  { id: 'mercury', name: 'Mercury', type: 'Terrestrial Planet', color: '#b5b5b5' },
  { id: 'venus', name: 'Venus', type: 'Terrestrial Planet', color: '#ffd29a' },
  { id: 'earth', name: 'Earth', type: 'Terrestrial Planet', color: '#4f9bff' },
  { id: 'moon', name: 'The Moon', type: 'Natural Satellite', color: '#d1d5db' },
  { id: 'mars', name: 'Mars', type: 'Terrestrial Planet', color: '#d9704a' },
  { id: 'jupiter', name: 'Jupiter', type: 'Gas Giant', color: '#d8b48a' },
  { id: 'saturn', name: 'Saturn', type: 'Gas Giant', color: '#e6d29a' },
  { id: 'uranus', name: 'Uranus', type: 'Ice Giant', color: '#9fe3e8' },
  { id: 'neptune', name: 'Neptune', type: 'Ice Giant', color: '#5877ff' },
]

export function NavMapModal({ onClose }: { onClose: () => void }) {
  const ms = useStore((s) => s.simMs)
  const [selected, setSelected] = useState<string>(ship.targetId ?? 'earth')
  const [, setTick] = useState(0)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'm') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250)
    return () => clearInterval(t)
  }, [])

  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)

  const bodyData = BODIES.map((b) => {
    const o = BY_ID[b.id]
    if (!o) return null
    const P = positionOf(o, ms)
    const rel = sub(P, ship.pos)
    const distLy = len(rel)
    const distAu = distLy / LY_PER_AU
    const toB = new THREE.Vector3(...toThree(rel)).normalize()
    const bearingDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, fwd.dot(toB)))) * (180 / Math.PI))
    return {
      ...b,
      distLy,
      distAu,
      bearingDeg,
      distText: formatDistance(distLy),
    }
  }).filter(Boolean) as (typeof BODIES[0] & { distLy: number; distAu: number; bearingDeg: number; distText: string })[]

  const selObj = bodyData.find((b) => b.id === selected)

  const handleStartAutopilot = (warp: boolean = false) => {
    if (!selected) return
    engageAutopilot(selected, ms, warp)
    onClose()
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Solar System Navigation Map">
      <div className="card glass navmap-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <div className="eyebrow violet">TACTICAL ASTROGATION SYSTEM</div>
            <h2>Solar System Navigation Map</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close Navigation Map">
            ✕
          </button>
        </div>

        <p className="hint">
          Select a destination body to compute trajectory, inspect distances, or engage automated transfer.
        </p>

        <div className="navmap-layout">
          {/* List of Planetary Destinations */}
          <div className="navmap-list">
            {bodyData.map((b) => (
              <button
                key={b.id}
                className={'navmap-row' + (selected === b.id ? ' sel' : '') + (ship.targetId === b.id ? ' targeted' : '')}
                onClick={() => setSelected(b.id)}
              >
                <div className="nm-icon" style={{ color: b.color }}>
                  ●
                </div>
                <div className="nm-info">
                  <div className="nm-name">
                    <b>{b.name}</b>
                    {ship.targetId === b.id && <span className="pill flying">LOCKED</span>}
                  </div>
                  <div className="nm-sub">{b.type} · {b.distAu.toFixed(3)} AU</div>
                </div>
                <div className="nm-dist">
                  <b>{b.distText}</b>
                  <small>Bearing: {b.bearingDeg}°</small>
                </div>
              </button>
            ))}
          </div>

          {/* Destination Details & Actions Panel */}
          {selObj && (
            <div className="navmap-target-pane">
              <div className="eyebrow">DESTINATION TELEMETRY</div>
              <h3 style={{ margin: '4px 0 10px', color: selObj.color }}>{selObj.name}</h3>

              <div className="metrics" style={{ margin: '8px 0' }}>
                <div className="metric">
                  <label>Current Separation</label>
                  <b>{selObj.distText}</b>
                  <small>{selObj.distAu.toFixed(4)} Astronomical Units</small>
                </div>
                <div className="metric">
                  <label>Relative Bearing</label>
                  <b>{selObj.bearingDeg}°</b>
                  <small>{selObj.bearingDeg < 15 ? 'Forward alignment' : 'Requires orientation maneuver'}</small>
                </div>
              </div>

              <div className="actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <button
                  className="btn primary"
                  style={{ width: '100%', height: '36px' }}
                  onClick={() => handleStartAutopilot(false)}
                >
                  ✦ Engage Sub-light Autopilot
                </button>
                <button
                  className="btn find"
                  style={{ width: '100%', height: '36px' }}
                  onClick={() => handleStartAutopilot(true)}
                >
                  ⚡ Engage Warp Cruise Transfer
                </button>
                <button
                  className="btn"
                  style={{ width: '100%' }}
                  onClick={() => {
                    ship.targetId = selObj.id
                    onClose()
                  }}
                >
                  ◎ Lock Target Crosshair Only
                </button>
                {ship.autopilot.active && (
                  <button
                    className="btn ghost"
                    style={{ width: '100%', color: 'var(--err)' }}
                    onClick={() => {
                      cancelAutopilot()
                      onClose()
                    }}
                  >
                    ✕ Disengage Active Autopilot
                  </button>
                )}
              </div>

              <p className="note" style={{ marginTop: '14px', fontSize: '11px' }}>
                Planetary positions are calculated from approximate Keplerian orbital elements (NASA JPL 1800–2050).
                Autopilot aligns the vessel heading and computes a kinematic transfer curve, decelerating at destination orbit.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
