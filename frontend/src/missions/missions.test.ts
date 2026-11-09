import { describe, it, expect } from 'vitest'
import { MISSIONS, OBJECTS, MISSION_BY_ID, OBJECT_BY_ID, SOURCES, validateCatalog, dateMs, timelineEvents, missionsActiveAt } from './index'
import { STORIES } from './stories'

describe('mission catalogue', () => {
  it('passes validation (sources resolve, dates ordered, non-NASA labelled, facts consistent)', () => {
    expect(validateCatalog()).toEqual([])
  })

  it('validation catches fabricated or broken records', () => {
    const bad = structuredClone(MISSION_BY_ID['apollo-11'])
    bad.id = 'bad'
    bad.objectIds = []
    bad.launch = { value: '1969-07-16', status: 'verified', sources: [] }
    bad.milestones = [...bad.milestones].reverse()
    bad.landing = { value: '1969-07-20', status: 'unverified', sources: [], note: 'x' }
    const errs = validateCatalog([bad], [])
    expect(errs.some((e) => e.includes('verified fact without value or source'))).toBe(true)
    expect(errs.some((e) => e.includes('out of order'))).toBe(true)
    expect(errs.some((e) => e.includes('unverified fact must not carry a value'))).toBe(true)
    const ch3 = structuredClone(MISSION_BY_ID['chandrayaan-3'])
    delete ch3.nonNasaNote
    expect(validateCatalog([ch3], OBJECTS.filter((o) => o.missionId === 'chandrayaan-3')).some((e) => e.includes('nonNasaNote'))).toBe(true)
  })

  it('Chandrayaan-3 and Huygens are never classified as NASA hardware', () => {
    for (const id of ['chandrayaan-3', 'huygens']) {
      const m = MISSION_BY_ID[id]
      expect(m.nasaMission).toBe(false)
      expect(m.nonNasaNote).toMatch(/not NASA/)
      for (const oid of m.objectIds) expect(OBJECT_BY_ID[oid].nasaHardware).toBe(false)
    }
    expect(MISSION_BY_ID['chandrayaan-3'].agency).toBe('ISRO')
    expect(MISSION_BY_ID['huygens'].agency).toBe('ESA')
    expect(MISSION_BY_ID['cassini'].partners.map((p) => p.agency)).toEqual(['ESA', 'ASI'])
  })

  it('Apollo 11 hardware uses the LRO-measured coordinates (NSSDCA / LROC)', () => {
    const lm = OBJECT_BY_ID['a11-lm-descent'].location.value!
    expect([lm.latDeg, lm.lonEastDeg]).toEqual([0.67416, 23.47314])
    expect(OBJECT_BY_ID['a11-lrrr'].location.value!.latDeg).toBe(0.67345)
    expect(OBJECT_BY_ID['a11-easep-pse'].location.value!.latDeg).toBe(0.67322)
  })

  it('missing values stay missing instead of being guessed', () => {
    expect(MISSION_BY_ID['chandrayaan-3'].landingSite!.value).toBeNull()
    expect(OBJECT_BY_ID['opportunity-rover'].location.value).toBeNull()
    expect(MISSION_BY_ID['mars-2020'].landingSite!.status).toBe('unverified') // Jezero coordinates not sourced yet
    expect(MISSION_BY_ID['huygens'].landingSite!.status).toBe('conflicting')
  })

  it('mission dates are in order and milestones sit inside the timeline', () => {
    const ev = timelineEvents()
    for (let i = 1; i < ev.length; i++) expect(ev[i].ms).toBeGreaterThanOrEqual(ev[i - 1].ms)
    expect(timelineEvents('moon').every((e) => MISSION_BY_ID[e.missionId].target === 'moon')).toBe(true)
    expect(dateMs('1969-07-20T20:17:40Z')).toBe(Date.UTC(1969, 6, 20, 20, 17, 40))
    expect(dateMs('2005-01')).toBe(Date.UTC(2005, 0, 1))
    expect(missionsActiveAt(Date.UTC(1969, 6, 21)).map((m) => m.id)).toContain('apollo-11')
    expect(missionsActiveAt(Date.UTC(2010, 0, 1)).map((m) => m.id)).toContain('mer-opportunity')
    expect(missionsActiveAt(Date.UTC(2020, 0, 1)).map((m) => m.id)).not.toContain('mer-opportunity')
  })

  it('every story paragraph cites catalogue sources and belongs to a catalogued object', () => {
    for (const s of Object.values(STORIES)) {
      expect(OBJECT_BY_ID[s.objectId]).toBeTruthy()
      expect(s.concise.length).toBeGreaterThan(0)
      for (const p of s.expanded) {
        expect(p.sources.length).toBeGreaterThan(0)
        p.sources.forEach((id) => expect(SOURCES[id], id).toBeTruthy())
      }
    }
  })

  it('has a broad multi-destination catalogue', () => {
    const targets = new Set(MISSIONS.map((m) => m.target))
    for (const t of ['moon', 'mars', 'venus', 'mercury', 'jupiter', 'saturn', 'titan', 'neptune', 'pluto']) expect(targets.has(t), t).toBe(true)
    expect(MISSIONS.length).toBeGreaterThanOrEqual(35)
  })
})
