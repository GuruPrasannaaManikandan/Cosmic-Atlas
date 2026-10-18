import { TUTORIAL_MISSIONS, MISSION_BY_ID } from './missions'
import { TutorialMission } from './types'
import { audio } from '../audio/CosmicAudioEngine'
import { useStore } from '../store/store'

export interface TutorialState {
  isActive: boolean
  isWelcomeOpen: boolean
  isCompleteOpen: boolean
  currentMissionIndex: number
  completedMissionIds: string[]
  skippedMissionIds: string[]
  taskCompleted: boolean
}

export const tutorialState: TutorialState = {
  isActive: false,
  isWelcomeOpen: false,
  isCompleteOpen: false,
  currentMissionIndex: 0,
  completedMissionIds: [],
  skippedMissionIds: [],
  taskCompleted: false,
}

const listeners = new Set<() => void>()

export function subscribeTutorialState(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage
  return null
}

// Initial check for first-time visitors
export function checkFirstTimeUser(): boolean {
  try {
    const storage = getStorage()
    if (!storage) return false
    const completed = storage.getItem('cosmic_academy_completed')
    const dismissed = storage.getItem('cosmic_academy_dismissed')
    return !completed && !dismissed
  } catch {
    return false
  }
}

export function openWelcomeModal() {
  tutorialState.isWelcomeOpen = true
  tutorialState.isActive = false
  tutorialState.isCompleteOpen = false
  notify()
}

export function closeWelcomeModal() {
  tutorialState.isWelcomeOpen = false
  notify()
}

export function startTutorial(fromBeginning = false) {
  tutorialState.isWelcomeOpen = false
  tutorialState.isCompleteOpen = false
  tutorialState.isActive = true

  if (fromBeginning) {
    tutorialState.currentMissionIndex = 0
    tutorialState.completedMissionIds = []
    tutorialState.skippedMissionIds = []
  }

  tutorialState.taskCompleted = false

  // Transition app to explore mode if in intro
  if (useStore.getState().phase === 'intro') {
    useStore.getState().setPhase('explore')
  }

  audio.playUiClick('navigate')
  notify()
}

export function skipWelcomeAndExplore() {
  try {
    getStorage()?.setItem('cosmic_academy_dismissed', 'true')
  } catch {}
  tutorialState.isWelcomeOpen = false
  tutorialState.isActive = false
  if (useStore.getState().phase === 'intro') {
    useStore.getState().setPhase('explore')
  }
  audio.playUiClick('click')
  notify()
}

export function getCurrentMission(): TutorialMission {
  return TUTORIAL_MISSIONS[tutorialState.currentMissionIndex] || TUTORIAL_MISSIONS[0]
}

export function completeCurrentTask() {
  if (tutorialState.taskCompleted) return
  tutorialState.taskCompleted = true
  const cur = getCurrentMission()
  if (!tutorialState.completedMissionIds.includes(cur.id)) {
    tutorialState.completedMissionIds = [...tutorialState.completedMissionIds, cur.id]
  }
  audio.playArrivalChime()
  notify()
}

export function nextMission() {
  const cur = getCurrentMission()
  if (!tutorialState.completedMissionIds.includes(cur.id) && !tutorialState.skippedMissionIds.includes(cur.id)) {
    tutorialState.completedMissionIds = [...tutorialState.completedMissionIds, cur.id]
  }

  if (tutorialState.currentMissionIndex >= TUTORIAL_MISSIONS.length - 1) {
    // Reached final mission -> Show academy graduation modal
    finishAcademy()
    return
  }

  tutorialState.currentMissionIndex += 1
  tutorialState.taskCompleted = false
  audio.playUiClick('select')
  notify()
}

export function prevMission() {
  if (tutorialState.currentMissionIndex > 0) {
    tutorialState.currentMissionIndex -= 1
    tutorialState.taskCompleted = false
    audio.playUiClick('click')
    notify()
  }
}

export function jumpToMission(index: number) {
  if (index >= 0 && index < TUTORIAL_MISSIONS.length) {
    tutorialState.currentMissionIndex = index
    tutorialState.taskCompleted = false
    audio.playUiClick('select')
    notify()
  }
}

export function skipCurrentMission() {
  const cur = getCurrentMission()
  if (!tutorialState.skippedMissionIds.includes(cur.id)) {
    tutorialState.skippedMissionIds = [...tutorialState.skippedMissionIds, cur.id]
  }
  nextMission()
}

export function exitTutorial() {
  tutorialState.isActive = false
  tutorialState.isWelcomeOpen = false
  tutorialState.isCompleteOpen = false
  try {
    getStorage()?.setItem('cosmic_academy_dismissed', 'true')
  } catch {}
  audio.playUiClick('click')
  notify()
}

export function resetTutorial() {
  try {
    const s = getStorage()
    s?.removeItem('cosmic_academy_completed')
    s?.removeItem('cosmic_academy_dismissed')
  } catch {}
  tutorialState.currentMissionIndex = 0
  tutorialState.completedMissionIds = []
  tutorialState.skippedMissionIds = []
  tutorialState.taskCompleted = false
  tutorialState.isActive = true
  tutorialState.isWelcomeOpen = false
  tutorialState.isCompleteOpen = false
  audio.playUiClick('navigate')
  notify()
}

export function finishAcademy() {
  tutorialState.isActive = false
  tutorialState.isCompleteOpen = true
  try {
    getStorage()?.setItem('cosmic_academy_completed', 'true')
  } catch {}
  audio.playArrivalChime()
  notify()
}

export function closeCompleteModal() {
  tutorialState.isCompleteOpen = false
  notify()
}
