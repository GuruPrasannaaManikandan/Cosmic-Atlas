export interface TutorialMission {
  id: string
  number: number
  title: string
  subtitle: string
  narrative: string
  objective: string
  instruction: string
  hint?: string
  highlightSelector?: string
  highlightPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  targetActionName: string
  completionText: string
  canSkip?: boolean
}

export interface TutorialProgress {
  currentMissionIndex: number
  completedMissionIds: string[]
  skippedMissionIds: string[]
  isCompleted: boolean
}
