import { useState, useEffect } from 'react'
import {
  eventState,
  subscribeEventState,
  toggleEventPlaying,
  setEventTime,
  resetEvent,
  setEventSpeed,
  stopEvent,
} from './eventState'
import { audio } from '../audio/CosmicAudioEngine'

export function EventPlayerHUD() {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribeEventState(() => {
      setTick((t) => t + 1)
    })
  }, [])

  if (!eventState.activeId || !eventState.definition) return null

  const def = eventState.definition
  const t = eventState.timeSec
  const dur = def.durationSec
  const playing = eventState.playing
  const speed = eventState.speed

  // Determine current active stage
  let activeStageIdx = 0
  for (let i = def.stages.length - 1; i >= 0; i--) {
    if (t >= def.stages[i].timeSec) {
      activeStageIdx = i
      break
    }
  }
  const currentStage = def.stages[activeStageIdx]

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setEventTime(val)
  }

  const handleStageJump = (stageTime: number) => {
    audio.playUiClick('select')
    setEventTime(stageTime)
  }

  const handleExit = () => {
    audio.playUiClick('click')
    stopEvent()
  }

  return (
    <div className="event-player-overlay">
      {/* Top Banner: Title, Provenance, Exit */}
      <div className="event-player-topbar">
        <div className="event-player-meta">
          <div className="event-provenance-tag">
            <span className="provenance-dot" />
            {def.provenance === 'hypothetical-simulation'
              ? 'SIMULATION MODEL (EDUCATIONAL) — CATALOG OBJECT UNMODIFIED'
              : 'RELATIVISTIC ASTROPHYSICAL MODEL'}
          </div>
          <h1 className="event-player-title">{def.name}</h1>
          <div className="event-player-subtitle">{def.title}</div>
        </div>

        <button className="event-exit-btn" onClick={handleExit} title="Exit simulation">
          ✕ Exit Simulation
        </button>
      </div>

      {/* Center Camera Orbit Hint */}
      <div className="event-orbit-hint">
        <span>🖱️ Drag to orbit 360° • 📜 Scroll to zoom</span>
      </div>

      {/* Bottom Floating Control Deck & Scientific Card */}
      <div className="event-player-bottom">
        {/* Scientific Information Card */}
        <div className="event-stage-card">
          <div className="event-stage-header">
            <span className="stage-step-badge">Stage {activeStageIdx + 1} of {def.stages.length}</span>
            <h3 className="stage-card-name">{currentStage.name}</h3>
            <span className="stage-card-subtitle">{currentStage.subtitle}</span>
          </div>

          <p className="stage-card-desc">{currentStage.description}</p>

          <div className="stage-physics-box">
            <span className="physics-icon">🔬</span>
            <div className="physics-text">
              <strong>Astrophysics: </strong>
              {currentStage.physicsNotes}
            </div>
          </div>
        </div>

        {/* Playback Controls & Timeline Scrubber */}
        <div className="event-controls-deck">
          {/* Stage Quick Jump Tabs */}
          <div className="event-stage-tabs">
            {def.stages.map((stg, idx) => (
              <button
                key={idx}
                className={`event-stage-tab ${idx === activeStageIdx ? 'active' : ''}`}
                onClick={() => handleStageJump(stg.timeSec)}
              >
                <span className="tab-idx">{idx + 1}</span>
                <span className="tab-title">{stg.name.split(':')[1]?.trim() || stg.name}</span>
              </button>
            ))}
          </div>

          {/* Timeline slider and duration */}
          <div className="event-scrubber-row">
            <span className="scrubber-time">{t.toFixed(1)}s</span>
            <input
              type="range"
              min={0}
              max={dur}
              step={0.05}
              value={t}
              onChange={handleSeek}
              className="event-timeline-slider"
              aria-label="Simulation timeline scrubber"
            />
            <span className="scrubber-duration">{dur.toFixed(1)}s</span>
          </div>

          {/* Transport buttons & Speed selector */}
          <div className="event-transport-bar">
            <div className="transport-left">
              <button
                className="transport-btn"
                onClick={() => {
                  audio.playUiClick('click')
                  resetEvent()
                }}
                title="Restart simulation"
              >
                ⏮ Restart
              </button>

              <button
                className={`transport-btn play-pause-btn ${playing ? 'playing' : ''}`}
                onClick={() => {
                  audio.playUiClick('click')
                  toggleEventPlaying()
                }}
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
            </div>

            {/* Playback Speed Multipliers */}
            <div className="transport-speeds">
              <span className="speed-label">Speed:</span>
              {[0.5, 1, 2, 5].map((s) => (
                <button
                  key={s}
                  className={`speed-btn ${speed === s ? 'active' : ''}`}
                  onClick={() => {
                    audio.playUiClick('click')
                    setEventSpeed(s)
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>

            <div className="transport-right">
              <span className="source-citation" title={def.source.note}>
                📖 {def.source.name}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
