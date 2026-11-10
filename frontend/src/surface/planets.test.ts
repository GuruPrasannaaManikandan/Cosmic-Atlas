import { describe, it, expect } from 'vitest'
import { PLANETS, isExplorable, planetFor } from './planets'
import { SURFACE_SITES, sitesForBody, SURFACE_BODIES, unitySitesForBody, defaultSiteFor, UNITY_SITES } from './sites'
import { SOURCES } from '../missions'

describe('planetary environments', () => {
  it('the Moon is a complete, implemented environment with sourced gravity', () => {
    const m = PLANETS.moon
    expect(m.status).toBe('implemented')
    expect(isExplorable('moon')).toBe(true)
    expect(m.gravity.value).toBe(1.62)
    m.gravity.sources.forEach((s) => expect(SOURCES[s]).toBeTruthy())
    expect(m.atmosphere.kind).toBe('vacuum')
    expect(m.sunDirection).not.toBeNull()
    expect(m.dust.drag).toBe(false)
    expect(m.skyBodies.map((b) => b.id)).toContain('earth')
  })

  it('Mars is explorable only through the embedded Unity renderer (Victoria crater); the R3F surface never opens it', () => {
    const mars = PLANETS.mars
    expect(mars.status).toBe('implemented')
    expect(mars.renderer).toBe('unity')
    expect(isExplorable('mars')).toBe(true)
    expect(sitesForBody('mars')).toEqual([])
    expect(SURFACE_SITES.some((s) => s.bodyId === 'mars')).toBe(false)
    expect(unitySitesForBody('mars').map((s) => s.id)).toEqual(['victoria-crater'])
    expect(defaultSiteFor('mars')).toBe('victoria-crater')
    expect(defaultSiteFor('moon')).toBe('tranquility-base')
    // the Sun on Mars is computed in Unity (Mars24 port); the web app does not pretend to have a Mars lighting model
    expect(mars.sunDirection).toBeNull()
    expect(mars.requirements!.length).toBeGreaterThanOrEqual(5)
    // its own physics, from its own source — never the lunar values
    expect(mars.gravity.value).toBe(3.73)
    expect(mars.gravity.sources).toEqual(['nssdca-mars-fact'])
    expect(mars.gravity.value).not.toBe(PLANETS.moon.gravity.value)
    expect(mars.atmosphere.kind).toBe('thin-co2')
    if (mars.atmosphere.kind === 'thin-co2') expect(mars.atmosphere.surfacePressurePa.value).toBeNull() // not sourced yet
    expect(mars.skyBodies).toEqual([])
    expect(mars.dust.drag).toBe(true)
  })

  it('every explorable site belongs to an implemented world; the body table is the planet table', () => {
    for (const s of SURFACE_SITES) expect(isExplorable(s.bodyId), s.id).toBe(true)
    for (const s of UNITY_SITES) {
      expect(isExplorable(s.bodyId), s.id).toBe(true)
      expect(PLANETS[s.bodyId].renderer).toBe('unity')
    }
    expect(SURFACE_BODIES).toBe(PLANETS)
    expect(() => planetFor('venus')).toThrow()
  })
})
