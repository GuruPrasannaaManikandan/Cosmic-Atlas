/**
 * Story narrator: plays a story sentence by sentence, keeping the speech bubble, transcript highlight, word cursor and
 * camera focus in step.
 *
 * - Voice: the browser's synthetic text-to-speech (Web Speech API) when available and switched on. Word positions come
 *   from the utterance's boundary events where the browser provides them.
 * - Captions-only mode (voice off, or no speech engine): each sentence is shown for a reading time and the word cursor
 *   advances at reading speed. A watchdog also covers speech engines that never report the end of an utterance, so
 *   the story can never stall.
 * - Every sentence keeps the source ids of the story part it came from.
 */
import { create } from 'zustand'
import { storyFor, PART_FOCUS, StoryPart } from '../missions/stories'
import { useGuide, readMs } from './guide'
import { useSurface } from './surfaceState'

export interface NarrLine {
  text: string
  sources: string[]
  part?: StoryPart['part']
  heading?: string
}
export type StoryMode = 'short' | 'full'

/** split on sentence ends, keeping abbreviations like "U.S." and decimals intact */
export function splitSentences(text: string): string[] {
  const raw = text
    .split(/(?<=[.!?]["”]?)\s+(?=["“A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
  // re-join after initials ("Carroll O. Alley") and common abbreviations ("Dr. Alley")
  const out: string[] = []
  for (const f of raw) {
    const prev = out[out.length - 1]
    if (prev && /(?:^|\s)(?:[A-Z]|Dr|Mr|Mrs|Ms|St|No|vs|approx|ca)\.$/.test(prev)) out[out.length - 1] = prev + ' ' + f
    else out.push(f)
  }
  return out
}

export function buildLines(objectId: string, mode: StoryMode): NarrLine[] {
  const st = storyFor(objectId)
  if (!st) return []
  if (mode === 'short') return st.concise.map((l) => ({ text: l.text, sources: l.sources }))
  return st.expanded.flatMap((p) => splitSentences(p.text).map((t, i) => ({ text: t, sources: p.sources, part: p.part, heading: i === 0 ? p.heading : undefined })))
}

const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

interface NarratorState {
  objectId: string | null
  mode: StoryMode
  lines: NarrLine[]
  idx: number
  /** character index of the word being spoken in the current line (-1 = none) */
  charIdx: number
  state: 'idle' | 'playing' | 'paused'
  voice: boolean
  rate: number
  /** move the camera to the component that the current story part is about */
  autoFocus: boolean
  load: (objectId: string, mode: StoryMode) => void
  play: (from?: number) => void
  playPart: (objectId: string, part: StoryPart['part']) => void
  pause: () => void
  resume: () => void
  stop: () => void
  next: () => void
  prev: () => void
  set: (p: Partial<Pick<NarratorState, 'voice' | 'rate' | 'autoFocus'>>) => void
}

let token = 0
let lineTimer: ReturnType<typeof setTimeout> | null = null
let cursorTimer: ReturnType<typeof setInterval> | null = null
let watchdog: ReturnType<typeof setTimeout> | null = null
let remaining = 0
let lineStarted = 0

function clearTimers() {
  if (lineTimer) clearTimeout(lineTimer)
  if (cursorTimer) clearInterval(cursorTimer)
  if (watchdog) clearTimeout(watchdog)
  lineTimer = cursorTimer = watchdog = null
}

export const useNarrator = create<NarratorState>((set, get) => {
  const speakLine = (i: number) => {
    const t = ++token
    clearTimers()
    const { lines, voice, rate, objectId, autoFocus } = get()
    if (i >= lines.length || i < 0) {
      set({ state: 'idle', idx: -1, charIdx: -1 })
      useGuide.getState().clear('story')
      return
    }
    const line = lines[i]
    set({ idx: i, charIdx: 0, state: 'playing' })
    useGuide.getState().say({ kind: 'story', text: line.text, sources: line.sources, objectId: objectId ?? undefined }, 10 * 60e3)
    // camera follows the story: focus the component this part is about (only while that object's record is open)
    const focus = line.part && objectId ? PART_FOCUS[objectId]?.[line.part] : undefined
    const S = useSurface.getState()
    if (autoFocus && focus && S.panel?.objectId === objectId && S.component !== focus) S.set({ component: focus })
    const dur = readMs(line.text, rate)
    const advance = () => {
      if (t !== token) return
      lineTimer = setTimeout(() => t === token && speakLine(i + 1), 350)
    }
    lineStarted = Date.now()
    remaining = dur
    if (voice && canSpeak()) {
      const u = new SpeechSynthesisUtterance(line.text)
      u.rate = 0.95 * rate
      u.onboundary = (e) => t === token && set({ charIdx: e.charIndex })
      u.onend = () => {
        if (watchdog) clearTimeout(watchdog)
        advance()
      }
      u.onerror = () => {
        if (watchdog) clearTimeout(watchdog)
        advance()
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
      // engines without voices (or blocked autoplay) may never fire onend: fall back to reading time
      watchdog = setTimeout(() => t === token && advance(), dur * 1.8 + 2000)
    } else {
      // captions-only: a reading cursor and a timed advance
      cursorTimer = setInterval(() => {
        if (t !== token) return
        const frac = Math.min(1, (Date.now() - lineStarted) / dur)
        set({ charIdx: Math.floor(frac * line.text.length) })
      }, 120)
      lineTimer = setTimeout(() => t === token && advance(), dur)
    }
  }

  return {
    objectId: null,
    mode: 'short',
    lines: [],
    idx: -1,
    charIdx: -1,
    state: 'idle',
    voice: canSpeak(),
    rate: 1,
    autoFocus: true,
    load: (objectId, mode) => {
      if (get().objectId === objectId && get().mode === mode && get().lines.length) return
      get().stop()
      set({ objectId, mode, lines: buildLines(objectId, mode), idx: -1, charIdx: -1 })
    },
    play: (from = 0) => speakLine(from),
    playPart: (objectId, part) => {
      get().load(objectId, 'full')
      const i = get().lines.findIndex((l) => l.part === part)
      if (i >= 0) speakLine(i)
    },
    pause: () => {
      if (get().state !== 'playing') return
      token++
      clearTimers()
      remaining = Math.max(500, remaining - (Date.now() - lineStarted))
      if (canSpeak()) window.speechSynthesis.cancel()
      set({ state: 'paused' })
    },
    // resume restarts the current sentence (speech engines can't reliably resume mid-utterance)
    resume: () => get().state === 'paused' && speakLine(get().idx),
    stop: () => {
      token++
      clearTimers()
      if (canSpeak()) window.speechSynthesis.cancel()
      set({ state: 'idle', idx: -1, charIdx: -1 })
      useGuide.getState().clear('story')
    },
    next: () => speakLine(Math.min(get().lines.length - 1, get().idx + 1)),
    prev: () => speakLine(Math.max(0, get().idx - 1)),
    set: (p) => {
      const was = get().state
      set(p)
      // a voice / speed change takes effect from the current sentence
      if (was === 'playing' && ('voice' in p || 'rate' in p)) speakLine(get().idx)
    },
  }
})

if (typeof window !== 'undefined') (window as any).__narrator = { state: () => useNarrator.getState() }
