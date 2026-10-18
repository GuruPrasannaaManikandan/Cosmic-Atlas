import { useEffect, useState } from 'react'
import { ship } from './shipState'
import { BY_ID, positionOf } from '../data/catalog'
import { useStore } from '../store/store'
import { sub, len, toThree, formatDistance } from '../astro/coords'
import * as THREE from 'three'

export function CockpitOverlay() {
  const [, setTick] = useState(0)
  const ms = useStore((s) => s.simMs)

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60)
    return () => clearInterval(t)
  }, [])

  if (ship.cameraView !== 'cockpit') return null

  // Calculate target screen position and distance
  let targetDistText = ''
  let targetAngle = 0
  const targetObj = ship.targetId ? BY_ID[ship.targetId] : null
  if (targetObj) {
    const targetP = positionOf(targetObj, ms)
    const dist = len(sub(targetP, ship.pos))
    targetDistText = formatDistance(dist)

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat)
    const toTarget = new THREE.Vector3(...toThree(sub(targetP, ship.pos))).normalize()
    targetAngle = Math.acos(Math.max(-1, Math.min(1, fwd.dot(toTarget)))) * (180 / Math.PI)
  }

  const pitchDeg = Math.round(ship.headingDeg.pitch)
  const yawDeg = Math.round(ship.headingDeg.yaw)

  return (
    <div className="cockpit-overlay" aria-hidden="true">
      {/* Cockpit Canopy Struts */}
      <div className="cockpit-frame-left" />
      <div className="cockpit-frame-right" />
      <div className="cockpit-frame-top" />

      {/* Holographic HUD */}
      <div className="hud-center">
        {/* Pitch Ladder / Horizon */}
        <div className="hud-pitch-ladder" style={{ transform: `translateY(${pitchDeg * 2}px)` }}>
          <div className="pitch-bar">+20</div>
          <div className="pitch-bar">+10</div>
          <div className="pitch-center-line" />
          <div className="pitch-bar">-10</div>
          <div className="pitch-bar">-20</div>
        </div>

        {/* Center Crosshair */}
        <div className="hud-crosshair">
          <div className="crosshair-dot" />
          <div className="crosshair-circle" />
        </div>

        {/* Target Reticle if within forward cone */}
        {targetObj && targetAngle < 45 && (
          <div className="hud-target-reticle">
            <div className="target-box" />
            <div className="target-label">
              <span>{targetObj.name}</span>
              <b>{targetDistText}</b>
            </div>
          </div>
        )}
      </div>

      {/* Top Heading Tape */}
      <div className="hud-heading-tape">
        <span className="heading-val">{yawDeg}°</span>
        <div className="compass-ticks">
          <span>{((yawDeg - 20 + 360) % 360)}</span>
          <span>{((yawDeg - 10 + 360) % 360)}</span>
          <b className="compass-cur">{yawDeg}°</b>
          <span>{((yawDeg + 10) % 360)}</span>
          <span>{((yawDeg + 20) % 360)}</span>
        </div>
      </div>

      {/* Left Throttle Bar */}
      <div className="hud-throttle-bar">
        <div className="throttle-label">THRUST</div>
        <div className="throttle-track">
          <div
            className="throttle-fill"
            style={{
              height: `${Math.round(ship.thrust * 100)}%`,
              background: ship.boost
                ? 'linear-gradient(0deg, #38bdf8, #a855f7)'
                : 'linear-gradient(0deg, #0284c7, #38bdf8)',
            }}
          />
        </div>
        <div className="throttle-pct">{Math.round(ship.thrust * 100)}%</div>
      </div>

      {/* Right Pitch Gauge */}
      <div className="hud-pitch-gauge">
        <div className="pitch-label">PITCH</div>
        <div className="pitch-val">{pitchDeg > 0 ? `+${pitchDeg}°` : `${pitchDeg}°`}</div>
      </div>
    </div>
  )
}
