import { describe, it, expect, beforeEach } from 'vitest'
import { replayFor } from './replay'
import { MISSION_BY_ID, OBJECT_BY_ID, SOURCES, validateCatalog } from '../missions'
import { DEFAULT_BINDINGS, createInputManager } from '../input/inputManager'
import { resolveMode } from '../input/appInput'
import { useStore } from '../store/store'
import { useSurface } from '../surface/surfaceState'
import { useExpedition, realCruise, STAGE_TEXT } from '../expedition/expedition'
import { UNITY_SITES, defaultSiteFor } from '../surface/sites'

const VICTORIA: [number, number] = [951, 1686] // the sols the scene's recorded traverse covers (reported by Unity)

describe('historical replay definitions (Relive the mission)', () => {
  it('Opportunity: every event is a sourced catalogue milestone; nothing is added for the replay', () => {
    const d = replayFor('opportunity-rover', { solRange: VICTORIA })!
    const m = MISSION_BY_ID['mer-opportunity']
    expect(d.events.map((e) => e.title)).toEqual(m.milestones.map((e) => e.title))
    for (const e of d.events) {
      expect(e.sources.length).toBeGreaterThan(0)
      e.sources.forEach((s) => expect(SOURCES[s], s).toBeTruthy())
    }
  })
  it('Opportunity: only the Victoria events are SHOWN; launch, landing, Endeavour and the end are TOLD', () => {
    const d = replayFor('opportunity-rover', { solRange: VICTORIA })!
    const shown = d.events.filter((e) => e.shown).map((e) => e.title)
    expect(shown).toEqual(['Arrival at Victoria crater', 'Into Victoria crater'])
    const launch = d.events.find((e) => e.kind === 'launch')!
    expect(launch.shown).toBe(false)
    expect(launch.how).toMatch(/Cape Canaveral/)
    expect(d.events.find((e) => e.title === 'Arrival at Endeavour crater')!.how).toMatch(/after the Victoria campaign/)
  })
  it('Opportunity: date-only and month-only dates are flagged; "Into Victoria crater" falls on the scene sol (≈1291)', () => {
    const d = replayFor('opportunity-rover', { solRange: VICTORIA })!
    const into = d.events.find((e) => e.title === 'Into Victoria crater')!
    expect(into.approxDate).toBe(true)
    expect(Math.abs(into.sol! - 1291)).toBeLessThanOrEqual(1)
    const landing = d.events.find((e) => e.kind === 'landing')!
    expect(landing.sol).toBe(1) // MER convention: landing sol = Sol 1
    expect(d.events.find((e) => e.title === 'Arrival at Victoria crater')!.approxDate).toBe(true)
  })
  it('without the scene sol range (Unity not ready) there is no Opportunity replay', () => {
    expect(replayFor('opportunity-rover')).toBeNull()
  })
  it('Apollo hardware: the descent is the only SHOWN event and is labelled illustrative', () => {
    const d = replayFor('a11-lm-descent')!
    expect(d.renderer).toBe('r3f-descent')
    expect(d.events.filter((e) => e.shown).map((e) => e.kind)).toEqual(['landing'])
    expect(d.events.find((e) => e.shown)!.how).toMatch(/illustrative/i)
  })
  it('no replay is offered where nothing can be shown (orbiters, unplaced hardware)', () => {
    expect(replayFor('perseverance-rover')).toBeNull()
    expect(replayFor('no-such-object')).toBeNull()
  })
})

describe('Opportunity record (enriched from mission-data, still validated)', () => {
  it('the catalogue validator still passes', () => {
    expect(validateCatalog()).toEqual([])
  })
  it('dimensions are sourced (PDS); mass keeps both published values', () => {
    const o = OBJECT_BY_ID['opportunity-rover']
    expect(o.dimensions.status).toBe('verified')
    expect(o.dimensions.sources).toContain('pds-mer-insthost')
    expect(o.massKg.status).toBe('conflicting')
    expect(o.massKg.alternatives?.[0].value).toBe(180)
    expect(o.components.length).toBeGreaterThanOrEqual(10)
    o.components.forEach((c) => expect(c.sources.length, c.id).toBeGreaterThan(0))
  })
})

describe('input modes for the new experiences', () => {
  it('driving: WASD drive, arrows look, E inspects, Shift raises the speed limit; no unimplemented R binding', () => {
    const v = DEFAULT_BINDINGS.VEHICLE_EXPLORATION.map((b) => b.action)
    expect(v).toEqual(expect.arrayContaining(['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'interact', 'sprint']))
    expect(v).not.toContain('board')
  })
  it('replay and inspection never move anything: no WASD bindings', () => {
    for (const m of ['HISTORICAL_REPLAY', 'HARDWARE_INSPECTION'] as const) {
      expect(DEFAULT_BINDINGS[m].some((b) => b.action.startsWith('move')), m).toBe(false)
      const im = createInputManager(() => m)
      im.handleKeyDown({ code: 'KeyW', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {} } as unknown as KeyboardEvent)
      expect(im.move()).toEqual({ x: 0, y: 0 })
    }
  })

  beforeEach(() => {
    useStore.setState({ surfaceSiteId: null, phase: 'explore' })
    useSurface.getState().reset(null)
    useExpedition.setState({ stage: 'idle', dest: null })
  })
  it('an expedition flight owns the keyboard (autonomous: keys cannot steer or cancel it)', () => {
    expect(resolveMode()).toBe('MAIN_MENU')
    useExpedition.setState({ stage: 'cruise', dest: 'mars' })
    expect(resolveMode()).toBe('UI_INTERACTION')
  })
  it('surface modes: driving, inspection, replay (replay wins over a stale panel)', () => {
    useStore.setState({ surfaceSiteId: 'victoria-crater' })
    useSurface.setState({ siteId: 'victoria-crater', intro: false, driving: true })
    expect(resolveMode()).toBe('VEHICLE_EXPLORATION')
    useSurface.setState({ panel: { objectId: 'opportunity-rover', tab: 'overview' } })
    expect(resolveMode()).toBe('HARDWARE_INSPECTION')
    useSurface.setState({ replay: { objectId: 'opportunity-rover' } })
    expect(resolveMode()).toBe('HISTORICAL_REPLAY')
    useSurface.setState({ mapOpen: true })
    expect(resolveMode()).toBe('UI_INTERACTION')
  })
})

describe('expeditions', () => {
  it('each destination lands at a real site; Mars lands at Victoria (Unity), the Moon at Tranquility Base', () => {
    expect(defaultSiteFor('mars')).toBe(UNITY_SITES[0].id)
    expect(defaultSiteFor('moon')).toBe('tranquility-base')
  })
  it('the real cruise time is DERIVED from the catalogue dates (Opportunity ~201 d, Apollo 11 ~4.3 d)', () => {
    const o = realCruise('victoria-crater')!
    expect(Math.round(o.days)).toBe(201)
    const a = realCruise('tranquility-base')!
    expect(a.days).toBeGreaterThan(4)
    expect(a.days).toBeLessThan(4.5)
  })
  it('arrival wording is mission-specific (Moon: powered descent; Mars: entry, descent and landing)', () => {
    expect(STAGE_TEXT.moon.arrival.title).toMatch(/Powered descent/)
    expect(STAGE_TEXT.mars.arrival.title).toMatch(/Entry, descent and landing/)
  })
})
