import { useState, useEffect } from 'react'
import {
  tutorialState,
  subscribeTutorialState,
  closeCompleteModal,
  resetTutorial,
} from './tutorialState'
import { useStore } from '../store/store'
import { audio } from '../audio/CosmicAudioEngine'

interface Props {
  onOpenEvents?: () => void
}

export function AcademyCompleteModal({ onOpenEvents }: Props) {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribeTutorialState(() => setTick((t) => t + 1))
  }, [])

  if (!tutorialState.isCompleteOpen) return null

  const st = useStore.getState()

  const handleEnterUniverse = () => {
    audio.playUiClick('navigate')
    closeCompleteModal()
    st.setPhase('explore')
  }

  const handleStartTravelMode = () => {
    audio.playUiClick('navigate')
    closeCompleteModal()
    st.enterTravelMode('earth')
  }

  const handleResumeFindHome = () => {
    audio.playUiClick('navigate')
    closeCompleteModal()
    st.startTour()
  }

  const handleOpenCosmicEvents = () => {
    audio.playUiClick('select')
    closeCompleteModal()
    if (onOpenEvents) onOpenEvents()
  }

  const handleOpenDataLab = () => {
    audio.playUiClick('select')
    closeCompleteModal()
    st.set({ dataOpen: true })
  }

  const handleRestartTutorial = () => {
    audio.playUiClick('click')
    resetTutorial()
  }

  return (
    <div className="academy-modal-overlay" onClick={closeCompleteModal}>
      <div className="academy-modal-content complete glass" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="academy-modal-header">
          <div className="academy-badge commissioned">
            <span className="badge-glow-dot green" />
            <span>COMMISSIONED · CADET CLASS I</span>
          </div>
          <button className="academy-modal-close" onClick={closeCompleteModal} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Hero Banner */}
        <div className="academy-hero">
          <div className="academy-commission-wreath">🌟</div>
          <h1 className="academy-title">MISSION COMPLETE</h1>
          <p className="academy-tagline">
            "Mission complete, explorer. You now have the tools to discover the universe on your own terms."
          </p>
        </div>

        {/* Achievement Meta */}
        <div className="academy-stats-row">
          <div className="stat-card">
            <span className="stat-val">8 / 8</span>
            <span className="stat-lbl">Missions Completed</span>
          </div>
          <div className="stat-card">
            <span className="stat-val">100%</span>
            <span className="stat-lbl">Systems Calibrated</span>
          </div>
          <div className="stat-card">
            <span className="stat-val">15 Orders</span>
            <span className="stat-lbl">Of Magnitude Mastered</span>
          </div>
        </div>

        {/* Next Activities Grid */}
        <div className="academy-next-grid">
          <button className="next-action-card" onClick={handleEnterUniverse}>
            <div className="action-icon">🌌</div>
            <div className="action-info">
              <b>Free Universe Exploration</b>
              <span>Freely fly, rotate, and inspect any of the thousands of catalogued landmarks.</span>
            </div>
          </button>

          <button className="next-action-card" onClick={handleStartTravelMode}>
            <div className="action-icon">🚀</div>
            <div className="action-info">
              <b>Enter Travel Mode</b>
              <span>Step into the cockpit of a 6-DoF spacecraft and personally pilot through the planets.</span>
            </div>
          </button>

          <button className="next-action-card" onClick={handleResumeFindHome}>
            <div className="action-icon">✦</div>
            <div className="action-info">
              <b>Begin FIND HOME Tour</b>
              <span>Experience the complete 20-stage guided descent from 1 billion light-years to Earth.</span>
            </div>
          </button>

          <button className="next-action-card" onClick={handleOpenCosmicEvents}>
            <div className="action-icon">💥</div>
            <div className="action-info">
              <b>Cosmic Events Observatory</b>
              <span>Simulate core-collapse supernovae, relativistic pulsars, and black hole shadows.</span>
            </div>
          </button>

          <button className="next-action-card" onClick={handleOpenDataLab}>
            <div className="action-icon">⌬</div>
            <div className="action-info">
              <b>Astro Data Intelligence</b>
              <span>Ingest and validate custom CSV, JSON, and VOTable astronomical surveys in 3D.</span>
            </div>
          </button>
        </div>

        {/* Primary Graduation Action */}
        <div className="academy-actions-footer">
          <button className="academy-btn primary big" onClick={handleEnterUniverse}>
            🌟 ENTER THE UNIVERSE
          </button>

          <button className="academy-btn ghost" onClick={handleRestartTutorial}>
            ↺ Restart Academy Tutorial
          </button>
        </div>
      </div>
    </div>
  )
}
