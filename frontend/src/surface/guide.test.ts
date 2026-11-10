import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OBJECTS, OBJECT_BY_ID, SOURCES } from '../missions'
import { storyFor } from '../missions/stories'
import { approachLine, discoverLine, componentLine, inspectHint, compassWord, useGuide, announceOnce, readMs } from './guide'
import { splitSentences, buildLines, useNarrator } from './narrator'
import { useSurface } from './surfaceState'

describe('guide dialogue', () => {
  beforeEach(() => useGuide.getState().reset())

  it('every factual guide line for every object and component carries real catalogue sources', () => {
    for (const o of OBJECTS) {
      const approach = approachLine(o.id, 87, 135)
      if (!o.location.value) expect(approach).toBeNull() // unlocated objects are never pointed out
      for (const l of [...(approach ? [approach] : []), discoverLine(o.id), ...o.components.map((c) => componentLine(o.id, c.id)!)]) {
        expect(l.sources.length, `${o.id} ${l.kind}: ${l.text}`).toBeGreaterThan(0)
        l.sources.forEach((s) => expect(SOURCES[s], s).toBeTruthy())
      }
    }
  })

  it('lines are assembled from catalogue data, not invented', () => {
    const a = approachLine('a11-lrrr', 87, 135)!
    expect(a.text).toBe('Over there: the Laser Ranging Retroreflector, about 85 m to the south-east.')
    expect(a.sources).toEqual(OBJECT_BY_ID['a11-lrrr'].location.sources)
    expect(discoverLine('a11-lm-descent').text).toBe(storyFor('a11-lm-descent')!.concise[0].text)
    const c = componentLine('a11-easep-pse', 'seismometer')!
    expect(c.text).toContain(OBJECT_BY_ID['a11-easep-pse'].components.find((x) => x.id === 'seismometer')!.description)
    // framing hints state no facts: no numbers, no sources
    const h = inspectHint('a11-lm-descent')
    expect(h.sources).toEqual([])
    expect(h.text).not.toMatch(/\d/)
    expect(compassWord(0)).toBe('north')
    expect(compassWord(271)).toBe('west')
  })

  it('approach / discovery lines are said once per visit and never talk over the story', () => {
    expect(announceOnce('a11-lrrr', 'approach', approachLine('a11-lrrr', 50, 0))).toBe(true)
    expect(announceOnce('a11-lrrr', 'approach', approachLine('a11-lrrr', 40, 0))).toBe(false)
    useGuide.getState().say({ kind: 'story', text: 'A story sentence.', sources: ['nssdca-a11-lm'] })
    expect(announceOnce('a11-lrrr', 'discover', discoverLine('a11-lrrr'))).toBe(false)
    expect(useGuide.getState().line!.kind).toBe('story')
  })
})

describe('narrator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGuide.getState().reset()
    useNarrator.getState().stop()
    useNarrator.setState({ objectId: null, lines: [], voice: false, rate: 1, autoFocus: true })
    useSurface.getState().reset('tranquility-base')
  })
  afterEach(() => vi.useRealTimers())

  it('splits sentences without breaking initials, titles or decimals', () => {
    expect(splitSentences('Its PI was Dr. Carroll O. Alley of the University of Maryland. It weighs 77 kg.')).toEqual([
      'Its PI was Dr. Carroll O. Alley of the University of Maryland.',
      'It weighs 77 kg.',
    ])
    expect(splitSentences('It drove 45.16 km. Then it stopped.')).toHaveLength(2)
    expect(splitSentences('Imaged by the LRO. The array is passive.')).toHaveLength(2)
  })

  it('full-story lines keep their story part and sources; short lines keep theirs', () => {
    const full = buildLines('a11-lm-descent', 'full')
    expect(full.length).toBeGreaterThan(storyFor('a11-lm-descent')!.expanded.length)
    full.forEach((l) => {
      expect(l.part).toBeTruthy()
      expect(l.sources.length).toBeGreaterThan(0)
    })
    expect(buildLines('a11-lm-descent', 'short').map((l) => l.text)).toEqual(storyFor('a11-lm-descent')!.concise.map((l) => l.text))
  })

  it('captions mode: advances by reading time, shows the line in the guide bubble, pause / resume / next / stop', () => {
    const n = useNarrator.getState()
    n.load('a11-lrrr', 'short')
    n.play(0)
    expect(useNarrator.getState().idx).toBe(0)
    expect(useGuide.getState().line!.text).toBe(storyFor('a11-lrrr')!.concise[0].text)
    vi.advanceTimersByTime(readMs(storyFor('a11-lrrr')!.concise[0].text) + 400)
    expect(useNarrator.getState().idx).toBe(1)
    expect(useNarrator.getState().charIdx).toBeGreaterThanOrEqual(0)
    useNarrator.getState().pause()
    vi.advanceTimersByTime(60000)
    expect(useNarrator.getState().idx).toBe(1)
    expect(useNarrator.getState().state).toBe('paused')
    useNarrator.getState().resume()
    expect(useNarrator.getState().state).toBe('playing')
    useNarrator.getState().next()
    expect(useNarrator.getState().idx).toBe(2)
    vi.advanceTimersByTime(60000)
    expect(useNarrator.getState().state).toBe('idle') // finished the last line
    expect(useGuide.getState().line).toBeNull()
  })

  it('the camera follows the story: a part about the ladder focuses the ladder while the LM record is open', () => {
    useSurface.getState().set({ panel: { objectId: 'a11-lm-descent', tab: 'story' }, component: null })
    useNarrator.getState().playPart('a11-lm-descent', 'events')
    expect(useNarrator.getState().lines[useNarrator.getState().idx].part).toBe('events')
    expect(useSurface.getState().component).toBe('ladder')
  })
})
