import { useEffect, useState, useRef } from 'react'
import {
  tutorialState,
  subscribeTutorialState,
  getCurrentMission,
  completeCurrentTask,
  nextMission,
  prevMission,
  skipCurrentMission,
  exitTutorial,
  jumpToMission,
} from './tutorialState'
import { TUTORIAL_MISSIONS } from './missions'
import { useStore } from '../store/store'
import { nav } from '../store/nav'
import { eventState, subscribeEventState, startEvent } from '../events/eventState'
import { audio } from '../audio/CosmicAudioEngine'
import { sub, len, SUN_POS } from '../astro/coords'

export function TutorialOverlay() {
  const [, setTick] = useState(0)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)
  const isInteracting = useRef(false)

  useEffect(() => {
    return subscribeTutorialState(() => setTick((t) => t + 1))
  }, [])

  const curMission = getCurrentMission()
  const missionIdx = tutorialState.currentMissionIndex
  const taskDone = tutorialState.taskCompleted

  // 1. Real Interaction Tracking per Mission
  useEffect(() => {
    if (!tutorialState.isActive) return

    // MISSION 1: Detect 3D canvas interaction (drag or scroll or keyboard navigation)
    if (missionIdx === 0) {
      const handlePointerMove = (e: PointerEvent) => {
        if (e.buttons > 0) {
          completeCurrentTask()
        }
      }
      const handleWheel = () => {
        completeCurrentTask()
      }
      const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase()
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
          completeCurrentTask()
        }
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('wheel', handleWheel)
      window.addEventListener('keydown', handleKeyDown)

      return () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('wheel', handleWheel)
        window.removeEventListener('keydown', handleKeyDown)
      }
    }

    // MISSION 2: Detect Earth selection
    if (missionIdx === 1) {
      const unsub = useStore.subscribe((state) => {
        if (state.selectedId === 'earth') {
          completeCurrentTask()
        }
      })
      if (useStore.getState().selectedId === 'earth') {
        completeCurrentTask()
      }
      return unsub
    }

    // MISSION 3: Detect Betelgeuse inspection
    if (missionIdx === 2) {
      const unsub = useStore.subscribe((state) => {
        if (state.selectedId === 'betelgeuse' && state.rightOpen) {
          completeCurrentTask()
        }
      })
      if (useStore.getState().selectedId === 'betelgeuse' && useStore.getState().rightOpen) {
        completeCurrentTask()
      }
      return unsub
    }

    // MISSION 4: Detect scale transition to Solar System or Milky Way
    if (missionIdx === 3) {
      const checkScale = () => {
        const dSun = len(sub(nav.pos, SUN_POS))
        if (dSun < 0.05 || nav.followId === 'sun' || nav.followId === 'milky-way') {
          completeCurrentTask()
        }
      }
      const timer = setInterval(checkScale, 400)
      checkScale()
      return () => clearInterval(timer)
    }

    // MISSION 5: Detect FIND HOME activation
    if (missionIdx === 4) {
      const unsub = useStore.subscribe((state) => {
        if (state.phase === 'tour') {
          completeCurrentTask()
        }
      })
      if (useStore.getState().phase === 'tour') {
        completeCurrentTask()
      }
      return unsub
    }

    // MISSION 6: Detect Data Intelligence opening
    if (missionIdx === 5) {
      const unsub = useStore.subscribe((state) => {
        if (state.dataOpen) {
          completeCurrentTask()
        }
      })
      if (useStore.getState().dataOpen) {
        completeCurrentTask()
      }
      return unsub
    }

    // MISSION 7: Detect Cosmic Events simulation launch
    if (missionIdx === 6) {
      const unsub = subscribeEventState(() => {
        if (eventState.activeId !== null) {
          completeCurrentTask()
        }
      })
      if (eventState.activeId !== null) {
        completeCurrentTask()
      }
      return unsub
    }
  }, [missionIdx, tutorialState.isActive])

  // 2. Real Element Contextual Highlighting
  useEffect(() => {
    if (!tutorialState.isActive || !curMission.highlightSelector) {
      setHighlightRect(null)
      return
    }

    const updateRect = () => {
      try {
        const el = document.querySelector(curMission.highlightSelector!)
        if (el) {
          const r = el.getBoundingClientRect()
          setHighlightRect(r)
        } else {
          setHighlightRect(null)
        }
      } catch {
        setHighlightRect(null)
      }
    }

    updateRect()
    const interval = setInterval(updateRect, 500)
    window.addEventListener('resize', updateRect)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', updateRect)
    }
  }, [curMission.highlightSelector, tutorialState.isActive])

  if (!tutorialState.isActive) return null

  // Helper trigger action for current mission if user wants a direct assist
  const handleDirectAssist = () => {
    const st = useStore.getState()
    audio.playUiClick('navigate')

    if (missionIdx === 1) {
      st.select('earth')
      st.travel('earth')
    } else if (missionIdx === 2) {
      st.select('betelgeuse')
      st.set({ rightOpen: true })
      st.travel('betelgeuse')
    } else if (missionIdx === 3) {
      st.travel('sun')
    } else if (missionIdx === 4) {
      st.startTour()
    } else if (missionIdx === 5) {
      st.set({ dataOpen: true })
    } else if (missionIdx === 6) {
      startEvent('supernova-betelgeuse')
    }
  }

  return (
    <div className="tutorial-viewport-layer" aria-label="Cosmic Academy Mission Guide">
      {/* Target Element Spotlight / Glow Outline */}
      {highlightRect && (
        <div
          className="tutorial-spotlight-ring"
          style={{
            top: `${Math.max(4, highlightRect.top - 6)}px`,
            left: `${Math.max(4, highlightRect.left - 6)}px`,
            width: `${highlightRect.width + 12}px`,
            height: `${highlightRect.height + 12}px`,
          }}
        />
      )}

      {/* Floating Mission HUD Card */}
      <div className="tutorial-card glass" role="region" aria-label="Tutorial Mission Card">
        {/* Card Header */}
        <div className="tutorial-card-header">
          <div className="tutorial-mission-badge">
            <span className="pulse-dot" />
            <span>MISSION {curMission.number} OF {TUTORIAL_MISSIONS.length}</span>
          </div>

          <button
            className="tutorial-exit-btn"
            onClick={exitTutorial}
            title="Exit tutorial (your progress will be preserved)"
            aria-label="Exit tutorial"
          >
            ✕ Exit
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="tutorial-steps-bar" role="progressbar" aria-valuenow={missionIdx + 1} aria-valuemax={8}>
          {TUTORIAL_MISSIONS.map((m, idx) => {
            const isCompleted = tutorialState.completedMissionIds.includes(m.id)
            const isCurrent = idx === missionIdx
            return (
              <button
                key={m.id}
                className={`step-dot ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => jumpToMission(idx)}
                title={`Jump to Mission ${m.number}: ${m.title}`}
                aria-label={`Mission ${m.number}: ${m.title}`}
              >
                <span>{m.number}</span>
              </button>
            )
          })}
        </div>

        {/* Mission Titles & Narrative */}
        <div className="tutorial-mission-meta">
          <h2 className="tutorial-mission-title">{curMission.title}</h2>
          <div className="tutorial-mission-subtitle">{curMission.subtitle}</div>
          <p className="tutorial-narrative">{curMission.narrative}</p>
        </div>

        {/* Objective & Instruction Box */}
        <div className="tutorial-task-box">
          <div className="task-objective">
            <span className="task-icon">🎯</span>
            <div>
              <strong>Objective:</strong> {curMission.objective}
            </div>
          </div>

          <div className="task-instruction">
            <span className="task-icon">👉</span>
            <div>
              <strong>Action:</strong> {curMission.instruction}
            </div>
          </div>

          {curMission.hint && (
            <div className="task-hint">
              <span className="task-icon">💡</span>
              <div>{curMission.hint}</div>
            </div>
          )}
        </div>

        {/* Real-time Task Status Banner */}
        {taskDone ? (
          <div className="tutorial-success-banner">
            <span className="success-icon">✓</span>
            <div className="success-text">
              <strong>TASK COMPLETED!</strong>
              <div>{curMission.completionText}</div>
            </div>
          </div>
        ) : (
          <div className="tutorial-waiting-banner">
            <span className="waiting-spinner" />
            <span>Waiting for action: <em>{curMission.targetActionName}</em></span>
          </div>
        )}

        {/* Card Actions Footer */}
        <div className="tutorial-card-footer">
          <div className="footer-left">
            {missionIdx > 0 && (
              <button className="tutorial-btn ghost" onClick={prevMission}>
                ← Back
              </button>
            )}

            {curMission.canSkip && !taskDone && (
              <button className="tutorial-btn ghost" onClick={skipCurrentMission}>
                Skip Mission
              </button>
            )}
          </div>

          <div className="footer-right">
            {/* Contextual Assist Button */}
            {!taskDone && missionIdx >= 1 && missionIdx <= 6 && (
              <button className="tutorial-btn assist" onClick={handleDirectAssist}>
                ⚡ Assist Me
              </button>
            )}

            <button
              className={`tutorial-btn primary ${taskDone ? 'celebrate' : ''}`}
              onClick={nextMission}
            >
              {missionIdx === TUTORIAL_MISSIONS.length - 1 ? 'Finish Mission ➔' : 'Continue ➔'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
