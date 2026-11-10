/**
 * The astronaut guide's dialogue.
 *
 * Rules (enforced by guide.test.ts):
 *  - Every line that states a fact carries the catalogue source ids of that fact.
 *  - Lines are assembled from catalogue data (names, measured positions, component descriptions, story sentences);
 *    the only words added are plain framing ("over there", "let's look closer"), never new facts, dates or quotes.
 *  - Nothing is presented as something a real astronaut said. The guide is labelled as the app's narrator, and the
 *    voice, when on, is the browser's synthetic text-to-speech.
 */
import { create } from 'zustand'
import { OBJECT_BY_ID } from '../missions'
import { storyFor } from '../missions/stories'

export type GuideKind = 'approach' | 'discover' | 'inspect' | 'story' | 'hint'

export interface GuideLine {
  id: number
  kind: GuideKind
  text: string
  /** catalogue source ids; empty only for 'hint' lines that state no facts */
  sources: string[]
  objectId?: string
  /** ms timestamp when it should disappear (story lines are controlled by the narrator instead) */
  until: number
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
export const compassWord = (bearingDeg: number) => COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]

/** reading time for a line: ~15 characters per second, at least 3.5 s */
export const readMs = (text: string, rate = 1) => Math.max(3500, (text.length / (15 * rate)) * 1000)

type Draft = Omit<GuideLine, 'id' | 'until'>

/** "Apollo 11 Laser Ranging Retroreflector — about 45 m to the south." (position from the LRO-measured coordinates) */
export function approachLine(objectId: string, distM: number, bearingDeg: number): Draft | null {
  const o = OBJECT_BY_ID[objectId]
  // only objects with a sourced position can be pointed out
  if (!o.location.value || !o.location.sources.length) return null
  return {
    kind: 'approach',
    objectId,
    text: `Over there: the ${o.name}, about ${Math.max(5, Math.round(distM / 5) * 5)} m to the ${compassWord(bearingDeg)}.`,
    sources: o.location.sources,
  }
}

/** the first sentence of the object's short story, when it comes into view */
export function discoverLine(objectId: string): Draft {
  const st = storyFor(objectId)
  const first = st?.concise[0]
  const o = OBJECT_BY_ID[objectId]
  return first ? { kind: 'discover', objectId, text: first.text, sources: first.sources } : { kind: 'discover', objectId, text: `This is the ${o.name}.`, sources: o.sources }
}

/** a component's catalogue description, when the explorer focuses it */
export function componentLine(objectId: string, componentId: string): Draft | null {
  const c = OBJECT_BY_ID[objectId]?.components.find((x) => x.id === componentId)
  if (!c) return null
  return { kind: 'inspect', objectId, text: `${c.name}: ${c.description}`, sources: c.sources }
}

/** framing only (no facts) */
export function inspectHint(objectId: string): Draft {
  const o = OBJECT_BY_ID[objectId]
  return { kind: 'hint', objectId, text: o.components.length ? 'Let\'s take a closer look. Pick a part and I\'ll tell you what it did.' : 'Let\'s take a closer look.', sources: [] }
}

interface GuideState {
  line: GuideLine | null
  history: GuideLine[]
  /** objects already announced on approach / discovery this visit */
  announced: Record<string, ('approach' | 'discover')[]>
  say: (d: Draft, durationMs?: number) => GuideLine
  clear: (kind?: GuideKind) => void
  reset: () => void
}

let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null

export const useGuide = create<GuideState>((set, get) => ({
  line: null,
  history: [],
  announced: {},
  say: (d, durationMs) => {
    const line: GuideLine = { ...d, id: nextId++, until: Date.now() + (durationMs ?? readMs(d.text)) }
    if (timer) clearTimeout(timer)
    if (d.kind !== 'story') timer = setTimeout(() => get().line?.id === line.id && set({ line: null }), line.until - Date.now())
    set({ line, history: [...get().history.slice(-49), line] })
    return line
  },
  clear: (kind) => {
    const l = get().line
    if (!l || (kind && l.kind !== kind)) return
    set({ line: null })
  },
  reset: () => {
    if (timer) clearTimeout(timer)
    set({ line: null, history: [], announced: {} })
  },
}))

/** say an approach/discovery line once per object per visit; returns whether it was said */
export function announceOnce(objectId: string, what: 'approach' | 'discover', d: Draft | null): boolean {
  const g = useGuide.getState()
  if (!d) return false
  const done = g.announced[objectId] ?? []
  if (done.includes(what)) return false
  // a discovery line supersedes the approach line for the same object
  useGuide.setState({ announced: { ...g.announced, [objectId]: [...done, what] } })
  // don't talk over the story
  if (g.line?.kind === 'story') return false
  g.say(d)
  return true
}

if (typeof window !== 'undefined') (window as any).__guide = { state: () => useGuide.getState() }
