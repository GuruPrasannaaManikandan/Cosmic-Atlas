import { describe, expect, it, beforeEach } from 'vitest'
import { marsOutbound, marsReturn, moonOutbound, moonReturn, MOON_HANDOFF_ALT } from './expeditionFlight'
import { metAt, playLength, validateScript } from './timeline'
import { R_MOON, llUnit, v3 } from './geo'
import { SOURCES } from '../missions/sources'
import { targetFor, expedition, useExpedition } from '../expedition/expedition'
import { useRelive, relive } from './player'
import { SITE_BY_ID, UNITY_SITE_BY_ID } from '../surface/sites'
import { useStore } from '../store/store'

const moonT = targetFor('tranquility-base')!
const marsT = targetFor('victoria-crater')!
const LAND_MOON = SITE_BY_ID['tranquility-base'].daylight.ms
const LAND_MARS = Date.parse(UNITY_SITE_BY_ID['victoria-crater'].scene.date + 'T16:48:00Z')
const SCRIPTS = [moonOutbound(moonT, LAND_MOON), moonReturn(moonT, LAND_MOON + 86400e3), marsOutbound(marsT, LAND_MARS), marsReturn(marsT, LAND_MARS + 3600e3)]

describe('Explore expeditions (M3): conceptual flights on the Relive engine', () => {
  it('targets come from the site catalogue, the coast from the real mission (derived)', () => {
    expect(moonT.dest).toBe('moon')
    expect(moonT.cruiseDays).toBeGreaterThan(4)
    expect(moonT.cruiseDays).toBeLessThan(4.5)
    expect(Math.round(marsT.cruiseDays)).toBe(201)
    for (const id of [...moonT.cruiseSources, ...marsT.cruiseSources]) expect(SOURCES[id], id).toBeTruthy()
  })

  for (const s of SCRIPTS) {
    it(`${s.id}: structurally valid, labelled conceptual, never claims a historical time`, () => {
      expect(s.kind).toBe('expedition')
      expect(validateScript(s)).toEqual([])
      expect(s.events.some((e) => e.basis === 'sourced')).toBe(false)
      for (const e of s.events) {
        if (e.basis === 'derived') { expect(e.sources.length).toBeGreaterThan(0); for (const id of e.sources) expect(SOURCES[id]).toBeTruthy() }
        else expect(e.basis).toBe('conceptual')
      }
      expect(s.illustrative.join(' ')).toMatch(/CONCEPTUAL|camera move/)
      expect(playLength(s.segments)).toBeLessThan(120) // an expedition is a ~1-minute flight
    })
    it(`${s.id}: every frame is finite`, () => {
      const L = playLength(s.segments)
      for (let u = 0; u <= L; u += 0.25) {
        const f = s.frame!(metAt(s.segments, u))
        for (const n of [...f.focus, ...f.up, ...f.sun, ...f.vel, f.alt]) expect(Number.isFinite(n), `${s.id} u=${u} ${f.env}`).toBe(true)
        for (const o of f.objects) for (const n of [...o.pos, ...o.fwd]) expect(Number.isFinite(n), `${s.id} ${o.key}`).toBe(true)
      }
    })
  }

  it('the Moon flight lasts as long as the real mission and ends hovering over the site, where the surface takes over', () => {
    const s = SCRIPTS[0]
    const end = s.segments[s.segments.length - 1].t1
    expect(end / 86400).toBeCloseTo(moonT.cruiseDays, 6)
    expect(s.epochMs + end * 1000).toBe(LAND_MOON) // lands at the site's sourced daylight moment
    const f = s.frame!(end)
    expect(f.env).toBe('moon')
    expect(f.alt).toBeCloseTo(MOON_HANDOFF_ALT, 0)
    const ground = v3.mul(llUnit(moonT.latDeg, moonT.lonEastDeg), R_MOON)
    const horiz = v3.len(v3.sub(f.focus, v3.mul(v3.norm(f.focus), v3.len(ground))))
    expect(v3.len(v3.sub(v3.mul(v3.norm(f.focus), R_MOON), ground))).toBeLessThan(5) // directly above the site
    expect(horiz).toBeGreaterThan(0)
  })

  it('the Mars flight descends to the hand-off; the landing and deployment happen on the measured terrain (Unity)', () => {
    const s = SCRIPTS[2]
    const end = s.segments[s.segments.length - 1].t1
    const f = s.frame!(end)
    expect(f.env).toBe('mars-local')
    const lander = f.objects.find((o) => o.model === 'exp-mlander')!
    expect(lander).toBeDefined()
    expect(lander.pos[1]).toBeGreaterThan(200) // in powered descent ~300 m above the site
    expect(lander.pos[1]).toBeLessThan(400)
    expect(lander.thrust).toBe(1)
    expect(s.events.map((e) => e.id)).toEqual(expect.arrayContaining(['entry', 'chute', 'powered', 'handoff']))
    expect(s.events.map((e) => e.id)).not.toContain('touchdown')
  })

  it('the Moon return climbs from the surface hand-off and ends back near Earth', () => {
    const s = SCRIPTS[1]
    const f0 = s.frame!(0)
    expect(f0.env).toBe('moon')
    expect(f0.alt).toBeLessThan(MOON_HANDOFF_ALT)
    const fe = s.frame!(s.segments[s.segments.length - 1].t1)
    expect(fe.env).toBe('cislunar')
    expect(v3.len(fe.focus)).toBeLessThan(1e7) // within Earth orbit distance
  })
})

describe('expedition state machine', () => {
  beforeEach(() => {
    if (useRelive.getState().id) relive.close()
    useStore.setState({ surfaceSiteId: null, phase: 'explore' })
    useExpedition.setState({ stage: 'idle', dest: null, direction: null })
  })
  it('starting opens the conceptual flight at Earth departure; cancel restores the explorer', () => {
    useStore.setState({ selectedId: 'jupiter' })
    expedition.start('moon')
    expect(useRelive.getState().id).toBe('expedition-moon-tranquility-base')
    expect(useRelive.getState().status).toBe('playing')
    expect(useExpedition.getState().stage).toBe('departure')
    expedition.cancel()
    expect(useRelive.getState().id).toBeNull()
    expect(useExpedition.getState().stage).toBe('idle')
    expect(useStore.getState().selectedId).toBe('jupiter')
  })
})
