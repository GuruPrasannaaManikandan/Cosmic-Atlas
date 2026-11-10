import { describe, it, expect } from 'vitest'
import { marsTime, lmstHours, ltstHours, sunPosition, ttMinusUtc, missionSol, hms } from './marsTime'

/** NASA GISS Mars24 "Algorithm and Worked Examples" (read 2026-11-10): values as printed on the page. */
describe('Mars24 worked example 1 — 2000-01-06 00:00:00 UTC at 0°N 0°W', () => {
  const t = marsTime(Date.parse('2000-01-06T00:00:00Z'))
  it('A: Earth time', () => {
    expect(t.jdUT).toBeCloseTo(2451549.5, 6)
    expect(ttMinusUtc(Date.parse('2000-01-06T00:00:00Z'))).toBeCloseTo(64.184, 6)
    expect(t.jdTT).toBeCloseTo(2451549.50074, 5)
    expect(t.dtJ2000).toBeCloseTo(4.50074, 5)
  })
  it('B: orbit', () => {
    expect(t.M).toBeCloseTo(21.74558, 4)
    expect(t.alphaFMS).toBeCloseTo(272.74566, 4)
    expect(t.PBS).toBeCloseTo(0.00142, 5)
    expect(t.nuMinusM).toBeCloseTo(4.44193, 4)
    expect(t.Ls).toBeCloseTo(277.18758, 4)
  })
  it('C: solar time', () => {
    expect(t.eotDeg).toBeCloseTo(-5.18774, 4)
    expect(t.mstH).toBeCloseTo(23.99425, 4)
    expect(hms(t.mstH)).toBe('23:59:39')
    expect(lmstHours(t, 0)).toBeCloseTo(23.99425, 4)
    expect(ltstHours(t, 0)).toBeCloseTo(23.6484, 4)
    expect(hms(ltstHours(t, 0))).toBe('23:38:54')
    expect(t.subsolarLonWest).toBeCloseTo(174.726, 3)
  })
  it('D: geometry', () => {
    expect(t.declination).toBeCloseTo(-25.22825, 4)
    expect(t.helioDistAU).toBeCloseTo(1.39358, 5)
    const s = sunPosition(t, 0, 0)
    expect(s.zenith).toBeCloseTo(154.26182, 3)
    expect(s.azimuth).toBeCloseTo(191.03905, 3)
  })
})

describe('Mars24 worked example 2 — Spirit (MER-A) landing target, 2004-01-03 13:46:31 UTC at 14.640°S 184.702°W', () => {
  const ms = Date.parse('2004-01-03T13:46:31Z')
  const t = marsTime(ms)
  const lonEast = -184.702 // 184.702°W
  it('A/B', () => {
    expect(t.jdUT).toBeCloseTo(2453008.07397, 5)
    expect(t.dtJ2000).toBeCloseTo(1463.07471, 5)
    expect(t.M).toBeCloseTo(66.06858, 4)
    expect(t.alphaFMS).toBeCloseTo(317.09457, 4)
    expect(t.PBS).toBeCloseTo(0.01614, 5)
    expect(t.nuMinusM).toBeCloseTo(10.22959, 4)
    expect(t.Ls).toBeCloseTo(327.32416, 4)
  })
  it('C: local true midnight, as the example expects', () => {
    expect(t.eotDeg).toBeCloseTo(-12.77553, 4)
    expect(t.mstH).toBeCloseTo(13.16537, 4)
    expect(lmstHours(t, lonEast)).toBeCloseTo(0.8519, 4)
    expect(ltstHours(t, lonEast)).toBeCloseTo(0.00025, 3)
    expect(t.subsolarLonWest).toBeCloseTo(4.705, 3)
  })
  it('D: Sun due south below the horizon', () => {
    // D-1 evaluated from the page's own Ls (327.32416°) gives −13.42040°; the page prints −13.42065°. The 0.00025°
    // (≈ 1″) difference is recorded in SCIENTIFIC_VERIFICATION_REPORT notes; example 1 matches to 1e-5°.
    expect(t.declination).toBeCloseTo(-13.42065, 3)
    expect(t.helioDistAU).toBeCloseTo(1.47767, 5)
    const s = sunPosition(t, -14.64, lonEast)
    expect(s.zenith).toBeCloseTo(151.93895, 2) // 0.00065° off, carried from the declination note above
    expect(s.azimuth).toBeCloseTo(179.99383, 2)
    expect(s.enu[2]).toBeLessThan(0)
    expect(Math.hypot(...s.enu)).toBeCloseTo(1, 12)
  })
})

describe('time scales and sol numbering', () => {
  it('TT − UTC follows the leap-second table (Mars24: 69.184 s from 2017)', () => {
    expect(ttMinusUtc(Date.parse('2016-12-31T23:59:59Z'))).toBeCloseTo(68.184, 6)
    expect(ttMinusUtc(Date.parse('2017-01-01T00:00:00Z'))).toBeCloseTo(69.184, 6)
    expect(ttMinusUtc(Date.parse('2026-11-10T00:00:00Z'))).toBeCloseTo(69.184, 6)
  })

  // Opportunity: landed 2004-01-25 04:54 UTC at 354.47417°E (NASA). MER counts the landing sol as Sol 1 (GISS notes).
  const landing = Date.parse('2004-01-25T04:54:00Z')
  const lon = 354.47417
  it('Opportunity landing is Sol 1', () => {
    expect(missionSol(landing, landing, lon, 1)).toBe(1)
  })
  it('NASA PIA22930: images taken on 10 June 2018 were sol 5111 — that sol overlaps that UTC date', () => {
    const day = Date.parse('2018-06-10T00:00:00Z')
    const sols = new Set<number>()
    for (let h = 0; h <= 24; h += 0.25) sols.add(missionSol(day + h * 3.6e6, landing, lon, 1))
    expect([...sols]).toContain(5111)
  })
})

describe('published sol at a published time', () => {
  it('PIA22930: ~9:33 a.m. PDT (16:33 UTC) on 10 June 2018 was sol 5111', () => {
    const landing = Date.parse('2004-01-25T04:54:00Z')
    expect(missionSol(Date.parse('2018-06-10T16:33:00Z'), landing, 354.47417, 1)).toBe(5111)
  })
})
