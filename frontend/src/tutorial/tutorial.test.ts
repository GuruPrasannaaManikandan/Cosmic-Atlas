import { describe, it, expect, beforeEach } from 'vitest'
import { TUTORIAL_MISSIONS, MISSION_BY_ID } from './missions'
import {
  tutorialState,
  startTutorial,
  getCurrentMission,
  completeCurrentTask,
  nextMission,
  prevMission,
  jumpToMission,
  skipCurrentMission,
  exitTutorial,
  resetTutorial,
  finishAcademy,
  checkFirstTimeUser,
  openWelcomeModal,
  closeWelcomeModal,
  closeCompleteModal,
  skipWelcomeAndExplore,
  subscribeTutorialState,
} from './tutorialState'

if (typeof globalThis.localStorage === 'undefined') {
  let store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

describe('Cosmic Academy — Story Mode & Interactive Tutorial System', () => {
  beforeEach(() => {
    localStorage.clear()
    tutorialState.isActive = false
    tutorialState.isWelcomeOpen = false
    tutorialState.isCompleteOpen = false
    tutorialState.currentMissionIndex = 0
    tutorialState.completedMissionIds = []
    tutorialState.skippedMissionIds = []
    tutorialState.taskCompleted = false
  })

  describe('Academy Missions Specification', () => {
    it('defines all 8 consecutive educational missions', () => {
      expect(TUTORIAL_MISSIONS.length).toBe(8)
      for (let i = 0; i < TUTORIAL_MISSIONS.length; i++) {
        const m = TUTORIAL_MISSIONS[i]
        expect(m.number).toBe(i + 1)
        expect(m.id).toBeTruthy()
        expect(m.title).toBeTruthy()
        expect(m.subtitle).toBeTruthy()
        expect(m.narrative).toBeTruthy()
        expect(m.objective).toBeTruthy()
        expect(m.instruction).toBeTruthy()
        expect(m.hint).toBeTruthy()
        expect(m.targetActionName).toBeTruthy()
        expect(m.completionText).toBeTruthy()
      }
    })

    it('indexes all missions in MISSION_BY_ID correctly', () => {
      expect(Object.keys(MISSION_BY_ID).length).toBe(8)
      expect(MISSION_BY_ID['mission-1-take-command'].title).toBe('TAKE COMMAND')
      expect(MISSION_BY_ID['mission-2-find-first-world'].title).toBe('FIND YOUR FIRST WORLD')
      expect(MISSION_BY_ID['mission-3-investigate-star'].title).toBe('INVESTIGATE A STAR')
      expect(MISSION_BY_ID['mission-4-cosmic-scales'].title).toBe('TRAVEL THROUGH COSMIC SCALES')
      expect(MISSION_BY_ID['mission-5-find-home'].title).toBe('BEGIN THE FIND HOME JOURNEY')
      expect(MISSION_BY_ID['mission-6-data-lab'].title).toBe('UNLOCK THE DATA LAB')
      expect(MISSION_BY_ID['mission-7-cosmic-events'].title).toBe('DISCOVER THE COSMIC EVENTS LAB')
      expect(MISSION_BY_ID['mission-8-your-mission'].title).toBe('YOUR MISSION, YOUR WAY')
    })

    it('verifies real target action identifiers match app systems', () => {
      const actions = TUTORIAL_MISSIONS.map((m) => m.targetActionName)
      expect(actions).toEqual([
        'Rotate or zoom the 3D viewport',
        'Search and select Earth',
        'Select and inspect Betelgeuse',
        'Jump between astronomical scales',
        'Activate FIND HOME tour',
        'Load sample dataset in Data Intelligence',
        'Launch a Cosmic Event simulation',
        'Complete academy training and enter universe',
      ])
    })
  })

  describe('Tutorial State Machine & Navigation', () => {
    it('starts tutorial from beginning with correct initial values', () => {
      startTutorial(true)
      expect(tutorialState.isActive).toBe(true)
      expect(tutorialState.currentMissionIndex).toBe(0)
      expect(tutorialState.isWelcomeOpen).toBe(false)
      expect(tutorialState.taskCompleted).toBe(false)

      const cur = getCurrentMission()
      expect(cur.id).toBe('mission-1-take-command')
      expect(cur.number).toBe(1)
    })

    it('advances through missions sequentially via nextMission and completeCurrentTask', () => {
      startTutorial(true)
      expect(tutorialState.currentMissionIndex).toBe(0)

      completeCurrentTask()
      expect(tutorialState.taskCompleted).toBe(true)

      nextMission()
      expect(tutorialState.currentMissionIndex).toBe(1)
      expect(tutorialState.taskCompleted).toBe(false)
      expect(getCurrentMission().id).toBe('mission-2-find-first-world')

      completeCurrentTask()
      nextMission()
      expect(tutorialState.currentMissionIndex).toBe(2)
      expect(getCurrentMission().id).toBe('mission-3-investigate-star')
    })

    it('supports stepping back to previous mission via prevMission without falling below 0', () => {
      startTutorial(true)
      jumpToMission(3)
      expect(tutorialState.currentMissionIndex).toBe(3)

      prevMission()
      expect(tutorialState.currentMissionIndex).toBe(2)

      prevMission()
      expect(tutorialState.currentMissionIndex).toBe(1)

      prevMission()
      expect(tutorialState.currentMissionIndex).toBe(0)

      // Clamped at 0
      prevMission()
      expect(tutorialState.currentMissionIndex).toBe(0)
    })

    it('allows jumping directly to any valid mission index', () => {
      startTutorial(true)
      jumpToMission(5)
      expect(tutorialState.currentMissionIndex).toBe(5)
      expect(getCurrentMission().id).toBe('mission-6-data-lab')

      // Ignore out of bound index
      jumpToMission(99)
      expect(tutorialState.currentMissionIndex).toBe(5)
    })

    it('allows skipping current mission if permitted', () => {
      startTutorial(true)
      expect(tutorialState.currentMissionIndex).toBe(0)
      skipCurrentMission()
      expect(tutorialState.currentMissionIndex).toBe(1)
    })

    it('completes the entire academy on final mission and opens graduation modal', () => {
      startTutorial(true)
      jumpToMission(7) // Last mission (Mission 8)
      expect(tutorialState.currentMissionIndex).toBe(7)

      nextMission()
      expect(tutorialState.isActive).toBe(false)
      expect(tutorialState.isCompleteOpen).toBe(true)
      expect(localStorage.getItem('cosmic_academy_completed')).toBe('true')
    })

    it('supports manually invoking finishAcademy()', () => {
      startTutorial(true)
      finishAcademy()
      expect(tutorialState.isActive).toBe(false)
      expect(tutorialState.isCompleteOpen).toBe(true)
      expect(localStorage.getItem('cosmic_academy_completed')).toBe('true')
    })

    it('supports exitTutorial() and marks dismissed flag', () => {
      startTutorial(true)
      expect(tutorialState.isActive).toBe(true)
      exitTutorial()
      expect(tutorialState.isActive).toBe(false)
      expect(localStorage.getItem('cosmic_academy_dismissed')).toBe('true')
    })

    it('supports resetTutorial() to clear saved progress and start fresh', () => {
      localStorage.setItem('cosmic_academy_completed', 'true')
      resetTutorial()
      expect(localStorage.getItem('cosmic_academy_completed')).toBeNull()
      expect(tutorialState.isActive).toBe(true)
      expect(tutorialState.currentMissionIndex).toBe(0)
    })

    it('notifies subscribers on state updates', () => {
      let notified = false
      const unsub = subscribeTutorialState(() => {
        notified = true
      })
      openWelcomeModal()
      expect(notified).toBe(true)
      expect(tutorialState.isWelcomeOpen).toBe(true)
      unsub()
    })
  })

  describe('First-Time User Detection and Onboarding Logic', () => {
    it('detects a first-time visitor when localStorage is empty', () => {
      expect(checkFirstTimeUser()).toBe(true)
    })

    it('detects returning users when completed flag is set', () => {
      localStorage.setItem('cosmic_academy_completed', 'true')
      expect(checkFirstTimeUser()).toBe(false)
    })

    it('detects returning users when dismissed flag is set', () => {
      localStorage.setItem('cosmic_academy_dismissed', 'true')
      expect(checkFirstTimeUser()).toBe(false)
    })

    it('skipWelcomeAndExplore dismisses welcome modal and sets dismissed flag', () => {
      openWelcomeModal()
      expect(tutorialState.isWelcomeOpen).toBe(true)
      skipWelcomeAndExplore()
      expect(tutorialState.isWelcomeOpen).toBe(false)
      expect(localStorage.getItem('cosmic_academy_dismissed')).toBe('true')
    })
  })
})
