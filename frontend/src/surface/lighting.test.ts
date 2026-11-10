import { describe, it, expect } from 'vitest'
import { sunDirectionAtLunarSite, meanEarthDirectionAtLunarSite, elevationDeg, azimuthDeg } from './lighting'
import { toLocal, toLatLon, bearingDeg } from './geo'

const A11 = { lat: 0.67416, lon: 23.47314 }

describe('lunar site lighting', () => {
  it('Apollo 11 landed in early lunar morning: low Sun in the east', () => {
    // landings were timed for a low morning Sun so shadows showed the terrain relief
    const d = sunDirectionAtLunarSite(Date.UTC(1969, 6, 20, 20, 17, 40), A11.lat, A11.lon)
    const el = elevationDeg(d)
    const az = azimuthDeg(d)
    expect(el).toBeGreaterThan(3)
    expect(el).toBeLessThan(20)
    expect(az).toBeGreaterThan(60)
    expect(az).toBeLessThan(120)
  })

  it('the Sun climbs through the lunar morning and sets ~14.8 days after sunrise', () => {
    const t0 = Date.UTC(1969, 6, 20, 20)
    const e0 = elevationDeg(sunDirectionAtLunarSite(t0, A11.lat, A11.lon))
    const e1 = elevationDeg(sunDirectionAtLunarSite(t0 + 2 * 86400e3, A11.lat, A11.lon))
    expect(e1).toBeGreaterThan(e0)
    // NSSDCA: EASEP stopped transmitting before local sunset on 3 Aug 1969 — the Sun must still be up on 2 Aug and down by 6 Aug
    expect(elevationDeg(sunDirectionAtLunarSite(Date.UTC(1969, 7, 2), A11.lat, A11.lon))).toBeGreaterThan(0)
    expect(elevationDeg(sunDirectionAtLunarSite(Date.UTC(1969, 7, 6), A11.lat, A11.lon))).toBeLessThan(0)
  })

  it('Earth hangs high in the western sky over Tranquility Base', () => {
    const d = meanEarthDirectionAtLunarSite(A11.lat, A11.lon)
    expect(elevationDeg(d)).toBeGreaterThan(60)
    expect(d[0]).toBeLessThan(0) // west
  })
})

describe('site geometry', () => {
  const o = { latDeg: 0.67416, lonEastDeg: 23.47314, radiusM: 1737.4e3 }
  it('LRO coordinates of the LRRR put it ~21.5 m south and ~2 m west of the LM', () => {
    const p = toLocal(o, 0.67345, 23.47307)
    expect(p.z).toBeCloseTo(21.5, 0)
    expect(p.x).toBeCloseTo(-2.1, 0)
    const back = toLatLon(o, p.x, p.z)
    expect(back.latDeg).toBeCloseTo(0.67345, 8)
    expect(back.lonEastDeg).toBeCloseTo(23.47307, 8)
  })
  it('bearing: north 0°, east 90°', () => {
    expect(bearingDeg(0, 0, 0, -10)).toBeCloseTo(0)
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(90)
  })
})
