import { CosmicEventDefinition } from './types'
import { EVENT_BY_ID } from './eventsCatalog'
import { audio } from '../audio/CosmicAudioEngine'

export interface EventState {
  activeId: string | null
  definition: CosmicEventDefinition | null
  playing: boolean
  timeSec: number
  speed: number
  cameraAngle: { yaw: number; pitch: number; dist: number }
  audioEnabled: boolean
}

export const eventState: EventState = {
  activeId: null,
  definition: null,
  playing: false,
  timeSec: 0,
  speed: 1,
  cameraAngle: { yaw: 0.5, pitch: 0.25, dist: 45 },
  audioEnabled: true,
}

const listeners = new Set<() => void>()

export function subscribeEventState(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

export function startEvent(id: string) {
  const def = EVENT_BY_ID[id]
  if (!def) return false
  eventState.activeId = id
  eventState.definition = def
  eventState.playing = true
  eventState.timeSec = 0
  eventState.speed = 1
  eventState.cameraAngle = {
    yaw: def.defaultCamera.yaw,
    pitch: def.defaultCamera.pitch,
    dist: def.defaultCamera.dist,
  }

  // Trigger initial audio cue
  if (id === 'supernova-betelgeuse') {
    audio.playSupernovaSound('collapse')
  }

  notify()
  return true
}

export function stopEvent() {
  eventState.activeId = null
  eventState.definition = null
  eventState.playing = false
  eventState.timeSec = 0
  notify()
}

export function setEventPlaying(p: boolean) {
  eventState.playing = p
  notify()
}

export function toggleEventPlaying() {
  eventState.playing = !eventState.playing
  notify()
}

export function setEventTime(t: number) {
  if (!eventState.definition) return
  eventState.timeSec = Math.max(0, Math.min(eventState.definition.durationSec, t))
  notify()
}

export function resetEvent() {
  eventState.timeSec = 0
  eventState.playing = true
  if (eventState.activeId === 'supernova-betelgeuse') {
    audio.playSupernovaSound('collapse')
  }
  notify()
}

export function setEventSpeed(s: number) {
  eventState.speed = s
  notify()
}

export function setEventCameraAngle(yaw: number, pitch: number, dist: number) {
  eventState.cameraAngle = { yaw, pitch, dist }
  notify()
}

export function stepEventTime(dt: number) {
  if (!eventState.playing || !eventState.definition) return
  const prevT = eventState.timeSec
  const newT = Math.min(eventState.definition.durationSec, prevT + dt * eventState.speed)
  eventState.timeSec = newT

  // Check stage threshold transitions for audio cues
  if (eventState.activeId === 'supernova-betelgeuse') {
    if (prevT < 3.5 && newT >= 3.5) {
      audio.playSupernovaSound('shockwave')
    }
  } else if (eventState.activeId === 'pulsar-crab') {
    // Pulsar sweeps at ~15-30 Hz
    if (Math.floor(prevT * 12) !== Math.floor(newT * 12)) {
      audio.playPulsarPulse(20)
    }
  }

  if (newT >= eventState.definition.durationSec) {
    // Loop event or pause at end
    if (eventState.activeId === 'pulsar-crab' || eventState.activeId === 'black-hole-m87') {
      eventState.timeSec = 0 // continuous phenomena loop
    } else {
      eventState.playing = false
    }
  }
  notify()
}
