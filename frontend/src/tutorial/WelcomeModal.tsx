import { useState, useEffect } from 'react'
import {
  tutorialState,
  subscribeTutorialState,
  startTutorial,
  skipWelcomeAndExplore,
  closeWelcomeModal,
} from './tutorialState'
import { audio } from '../audio/CosmicAudioEngine'

interface Props {
  onOpenHelp?: () => void
}

export function WelcomeModal({ onOpenHelp }: Props) {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribeTutorialState(() => setTick((t) => t + 1))
  }, [])

  if (!tutorialState.isWelcomeOpen) return null

  const handleStartMission = () => {
    audio.playUiClick('navigate')
    startTutorial(true)
  }

  const handleExploreOnMyOwn = () => {
    skipWelcomeAndExplore()
  }

  const handleHowToPlay = () => {
    audio.playUiClick('select')
    closeWelcomeModal()
    if (onOpenHelp) onOpenHelp()
  }

  return (
    <div className="academy-modal-overlay" onClick={closeWelcomeModal}>
      <div className="academy-modal-content glass" onClick={(e) => e.stopPropagation()}>
        {/* Header & Badges */}
        <div className="academy-modal-header">
          <div className="academy-badge">
            <span className="badge-glow-dot" />
            <span>COSMIC ACADEMY · CADET INDUCTION</span>
          </div>
          <button
            className="academy-modal-close"
            onClick={closeWelcomeModal}
            aria-label="Close welcome modal"
          >
            ✕
          </button>
        </div>

        {/* Hero Title & Tagline */}
        <div className="academy-hero">
          <div className="academy-brand-emblem">✦</div>
          <h1 className="academy-title">COSMIC ATLAS</h1>
          <p className="academy-tagline">Your universe. Your mission. Your journey.</p>
        </div>

        {/* Narrative Welcome Body */}
        <div className="academy-body">
          <p className="academy-intro-text">
            Welcome, explorer. From the cosmic web filaments to the stars of our galaxy and our home planet,
            the universe is yours to discover. Complete your first mission to learn how to navigate, investigate
            celestial objects, and unlock the full exploration experience.
          </p>

          <div className="academy-feature-matrix">
            <div className="matrix-item">
              <span className="matrix-icon">🧭</span>
              <div className="matrix-meta">
                <b>Camera & Scale</b>
                <span>360° orbit, zoom & light-year navigation</span>
              </div>
            </div>

            <div className="matrix-item">
              <span className="matrix-icon">🔍</span>
              <div className="matrix-meta">
                <b>Object Intelligence</b>
                <span>Instant astronomical search & telemetry</span>
              </div>
            </div>

            <div className="matrix-item">
              <span className="matrix-icon">✦</span>
              <div className="matrix-meta">
                <b>FIND HOME Tour</b>
                <span>Guided descent across 15 orders of magnitude</span>
              </div>
            </div>

            <div className="matrix-item">
              <span className="matrix-icon">🚀</span>
              <div className="matrix-meta">
                <b>Travel Mode</b>
                <span>6-DoF spacecraft cockpit flight simulation</span>
              </div>
            </div>

            <div className="matrix-item">
              <span className="matrix-icon">🌌</span>
              <div className="matrix-meta">
                <b>Cosmic Events</b>
                <span>Core-collapse supernovae & black hole physics</span>
              </div>
            </div>

            <div className="matrix-item">
              <span className="matrix-icon">⌬</span>
              <div className="matrix-meta">
                <b>Data Lab</b>
                <span>Ingest & visualize custom astronomical surveys</span>
              </div>
            </div>
          </div>
        </div>

        {/* Three Primary Actions */}
        <div className="academy-actions-footer">
          <button
            className="academy-btn primary"
            onClick={handleStartMission}
          >
            ✦ BEGIN FIRST MISSION
          </button>

          <button
            className="academy-btn secondary"
            onClick={handleExploreOnMyOwn}
          >
            EXPLORE ON MY OWN
          </button>

          <button
            className="academy-btn ghost"
            onClick={handleHowToPlay}
          >
            ? HOW TO PLAY
          </button>
        </div>
      </div>
    </div>
  )
}
