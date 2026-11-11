import { describe, expect, it } from 'vitest'
import { APOLLO_11, get } from './scripts/apollo11'
import { OPPORTUNITY, MER_LANDING, MER_ENTRY } from './scripts/opportunity'
import { SOURCES } from '../missions/sources'
import { eventIndexAt, eventsCrossed, formatMet, metAt, phaseAt, playAt, playLength, rateAt, sampleTrack, shotAt, validateScript } from './timeline'
import { frameAt, merTransferAngleDeg, _test } from './flight'
import { R_EARTH, R_MOON, v3 } from './geo'
import { RELIVE_SCRIPTS } from './player'

const SCRIPTS = [APOLLO_11, OPPORTUNITY]
const NMI = 1852

describe('Relive Mission scripts: honesty contract', () => {
  for (const s of SCRIPTS) {
    it(`${s.id}: structurally valid (contiguous pacing and phases, sorted events, notes on every non-sourced time)`, () => {
      expect(validateScript(s)).toEqual([])
    })
    it(`${s.id}: every event, telemetry track and the conclusion cite sources that exist`, () => {
      for (const e of s.events) {
        expect(e.sources.length, e.id).toBeGreaterThan(0)
        for (const id of e.sources) expect(SOURCES[id], `${e.id} → ${id}`).toBeTruthy()
      }
      for (const tr of s.telemetry) for (const id of tr.sources) expect(SOURCES[id], id).toBeTruthy()
      for (const id of s.conclusion.sources) expect(SOURCES[id], id).toBeTruthy()
    })
    it(`${s.id}: lists what is illustrative`, () => {
      expect(s.illustrative.length).toBeGreaterThan(3)
      expect(s.illustrative.join(' ')).toMatch(/[Ss]ound is synthesised/)
    })
    it(`${s.id}: event ids are unique`, () => {
      expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length)
    })
  }

  it('Apollo 11 times are SP-4029 GETs (spot checks against the published table)', () => {
    const t = (id: string) => APOLLO_11.events.find((e) => e.id === id)!.t
    expect(t('liftoff')).toBeCloseTo(0.63, 2)
    expect(t('sic-oeco')).toBeCloseTo(161.63, 2)
    expect(t('tli-ign')).toBeCloseTo(get('002:44:16.20'), 2)
    expect(t('pdi')).toBeCloseTo(102 * 3600 + 33 * 60 + 5.01, 2)
    expect(t('landing')).toBeCloseTo(102 * 3600 + 45 * 60 + 39.9, 2)
    expect(t('splashdown')).toBe(195 * 3600 + 18 * 60 + 35)
    // GET 0 = 13:32:00 GMT: landing at 20:17:39 GMT on 20 July
    expect(new Date(APOLLO_11.epochMs + t('landing') * 1000).toISOString()).toBe('1969-07-20T20:17:39.900Z')
    expect(new Date(APOLLO_11.epochMs + t('splashdown') * 1000).toISOString()).toBe('1969-07-24T16:50:35.000Z')
  })

  it('Apollo 11: the only non-sourced time is the main-parachute deployment, and it is flagged', () => {
    const odd = APOLLO_11.events.filter((e) => e.basis !== 'sourced')
    expect(odd.map((e) => e.id)).toEqual(['mains'])
  })

  it('Opportunity: first impact 04:55 UTC 25 Jan 2004 and egress 11:01 UTC 31 Jan 2004 (PDS); entry six minutes earlier', () => {
    expect(new Date(OPPORTUNITY.epochMs + MER_LANDING * 1000).toISOString()).toBe('2004-01-25T04:55:00.000Z')
    expect(MER_LANDING - MER_ENTRY).toBe(360)
    const eg = OPPORTUNITY.events.find((e) => e.id === 'egress')!
    expect(new Date(OPPORTUNITY.epochMs + eg.t * 1000).toISOString()).toBe('2004-01-31T11:01:00.000Z')
    const hs = OPPORTUNITY.events.find((e) => e.id === 'heatshield')!, ch = OPPORTUNITY.events.find((e) => e.id === 'chute')!
    expect(hs.t - ch.t).toBe(20) // PDS: ~20 s after the parachute
    expect(OPPORTUNITY.events.find((e) => e.id === 'lander-sep')!.t - hs.t).toBe(10)
  })

  it('the registry exposes both scripts', () => {
    expect(Object.keys(RELIVE_SCRIPTS).sort()).toEqual(['apollo-11', 'mer-opportunity'])
  })
})

describe('timeline maths', () => {
  const segs = APOLLO_11.segments
  it('metAt and playAt invert each other', () => {
    const L = playLength(segs)
    expect(L).toBeGreaterThan(300)
    expect(L).toBeLessThan(900)
    for (let u = 0; u <= L; u += L / 97) expect(playAt(segs, metAt(segs, u))).toBeCloseTo(u, 6)
  })
  it('launch near real time, coasts compressed', () => {
    expect(rateAt(segs, 2)).toBeCloseTo(1, 1)
    const coast = playAt(segs, get('040:00:00'))
    expect(rateAt(segs, coast)).toBeGreaterThan(10000)
  })
  it('phase and event lookup', () => {
    expect(phaseAt(APOLLO_11.phases, 30).id).toBe('sic')
    expect(phaseAt(APOLLO_11.phases, get('110:00:00')).id).toBe('surface')
    const i = eventIndexAt(APOLLO_11.events, get('102:45:40'))
    expect(APOLLO_11.events[i].id).toBe('landing')
    expect(eventsCrossed(APOLLO_11.events, 160, 163).map((e) => e.id)).toEqual(['sic-oeco', 'sic-sep'])
  })
  it('published telemetry: exact at a sample, interpolated between, absent outside', () => {
    const alt = APOLLO_11.telemetry[0]
    expect(sampleTrack(alt, 161.63)!.exact).toBe(true)
    expect(sampleTrack(alt, 161.63)!.v).toBeCloseTo(35.701 * NMI, 0)
    const mid = sampleTrack(alt, 300)!
    expect(mid.exact).toBe(false)
    expect(sampleTrack(alt, 5000)).toBeNull()
  })
  it('camera director blends between shots', () => {
    const s = shotAt(APOLLO_11.shots, 40.5, 4)
    expect(s.w).toBeGreaterThan(0)
    expect(s.w).toBeLessThan(1)
    expect(shotAt(APOLLO_11.shots, 1e7, 4).w).toBe(1)
  })
  it('formats GET like NASA tables', () => {
    expect(formatMet(get('102:45:39.90'))).toBe('T+102:45:39')
    expect(formatMet(-6.4)).toBe('T−000:00:06')
  })
})

describe('flight model: built from the published values', () => {
  it('Saturn V stack adds up to the published 363.013 ft', () => {
    const S = _test.SAT
    expect(S.sic + S.sii + S.sivb + S.iu + S.sla + S.smStruct + S.cm + S.les - _test.LES_OVERLAP).toBeCloseTo(363.013 * 0.3048, 6)
    expect(_test.LES_OVERLAP).toBeGreaterThan(0)
    expect(_test.LES_OVERLAP).toBeLessThan(3)
  })

  it('the conic from the published TLI state reproduces the published coast distances (within 6 %)', () => {
    const check = (getStr: string, nmi: number) => {
      const r = v3.len(_test.tliState(get(getStr))) - R_EARTH
      expect(Math.abs(r - nmi * NMI) / (nmi * NMI), getStr).toBeLessThan(0.06)
    }
    check('003:15:23.00', 3815.19)
    check('003:24:03.70', 5317.6)
    check('004:40:01.72', 16620.8)
    check('026:44:58.64', 109475.3)
  })

  it('the coast passes through the published distances exactly', () => {
    const r = v3.len(_test.cislunarOut(get('026:44:58.64'))) - R_EARTH
    expect(r / NMI).toBeCloseTo(109475.3, 0)
  })

  it('the powered descent ends at Tranquility Base, on the surface', () => {
    const p = _test.lmDescent(get('102:45:39.90'))
    expect(v3.len(p) - R_MOON).toBeLessThan(1)
    expect(_test.PD_RANGE).toBeGreaterThan(300e3)
    expect(_test.PD_RANGE).toBeLessThan(800e3)
  })

  it('every frame is finite across both missions', () => {
    for (const s of SCRIPTS) {
      const L = playLength(s.segments)
      for (let u = 0; u <= L; u += 0.37) {
        const t = metAt(s.segments, u)
        const f = frameAt(s.id, t)
        const nums = [...f.focus, ...f.axis, ...f.up, ...f.sun, f.alt]
        for (const o of f.objects) nums.push(...o.pos, ...o.fwd)
        for (const n of nums) expect(Number.isFinite(n), `${s.id} t=${t} ${f.env}`).toBe(true)
      }
    }
  })

  it('Apollo ascent follows the table: altitude at staging is the published 36.0 n mi', () => {
    const f = frameAt('apollo-11', 162.3)
    expect(f.env).toBe('earth')
    expect(f.alt / NMI).toBeGreaterThan(35)
    expect(f.alt / NMI).toBeLessThan(37.5)
    expect(f.objects.find((o) => o.key === 'sic')).toBeUndefined() // separated
  })

  it('Opportunity: a Type I path (transfer angle under 180°), landing in Eagle crater, rover off the lander at egress', () => {
    expect(merTransferAngleDeg()).toBeLessThan(180)
    expect(merTransferAngleDeg()).toBeGreaterThan(90)
    const rest = frameAt('mer-opportunity', MER_LANDING + 3600)
    expect(rest.env).toBe('mars-local')
    expect(Math.hypot(rest.focus[0], rest.focus[2])).toBeLessThan(2)
    const eg = OPPORTUNITY.events.find((e) => e.id === 'egress')!.t
    const f = frameAt('mer-opportunity', eg)
    expect(f.objects.some((o) => o.model === 'mer-rover')).toBe(true)
  })
})
