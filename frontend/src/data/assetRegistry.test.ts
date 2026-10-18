import { describe, it, expect } from 'vitest'
import {
  ASSET_REGISTRY,
  loadScientificTexture,
  getEarthTexture,
  getEarthCloudsTexture,
  getEarthSpecularTexture,
  getMoonTexture,
  getMarsTexture,
  getJupiterTexture,
  getSaturnTexture,
  getSaturnRingsTexture,
  getSunPhotosphereTexture,
  getBetelgeuseTexture,
  getAndromedaTexture,
  getCarinaTexture,
} from './assetRegistry'

describe('Astronomical Asset Registry & Scientific Provenance', () => {
  it('registers all key celestial targets with scientific provenance and public domain licensing', () => {
    const requiredAssets = [
      'earth_day',
      'earth_clouds',
      'earth_specular',
      'moon_albedo',
      'mars_albedo',
      'jupiter_color',
      'saturn_color',
      'saturn_rings',
      'sun_photosphere',
      'betelgeuse_surface',
      'andromeda_m31',
      'carina_nebula',
    ]

    for (const key of requiredAssets) {
      const asset = ASSET_REGISTRY[key]
      expect(asset).toBeDefined()
      expect(asset.id).toBe(key)
      expect(asset.path).toMatch(/^\/assets\/astronomy\/textures\//)
      expect(asset.source).toBeDefined()
      expect(asset.license).toContain('Public Domain')
      expect(asset.dimensions[0]).toBeGreaterThanOrEqual(1024)
      expect(asset.dimensions[1]).toBeGreaterThanOrEqual(64)
    }
  })

  it('specifies sRGB color space for color maps and Linear for specular masks', () => {
    expect(ASSET_REGISTRY.earth_day.colorSpace).toBe('sRGB')
    expect(ASSET_REGISTRY.earth_specular.colorSpace).toBe('Linear')
    expect(ASSET_REGISTRY.saturn_rings.colorSpace).toBe('sRGB')
  })

  it('safely falls back to procedural textures in non-browser/SSR environments', () => {
    const earthTex = getEarthTexture()
    expect(earthTex).toBeDefined()

    const cloudsTex = getEarthCloudsTexture()
    expect(cloudsTex).toBeDefined()

    const specularTex = getEarthSpecularTexture()
    expect(specularTex).toBeDefined()

    const moonTex = getMoonTexture()
    expect(moonTex).toBeDefined()

    const marsTex = getMarsTexture()
    expect(marsTex).toBeDefined()

    const jupiterTex = getJupiterTexture()
    expect(jupiterTex).toBeDefined()

    const saturnTex = getSaturnTexture()
    expect(saturnTex).toBeDefined()

    const ringsTex = getSaturnRingsTexture()
    expect(ringsTex).toBeDefined()

    const sunTex = getSunPhotosphereTexture()
    expect(sunTex).toBeDefined()

    const betelgeuseTex = getBetelgeuseTexture()
    expect(betelgeuseTex).toBeDefined()

    const andromedaTex = getAndromedaTexture()
    expect(andromedaTex).toBeDefined()

    const carinaTex = getCarinaTexture()
    expect(carinaTex).toBeDefined()
  })

  it('handles unknown asset identifiers with safe fallback', () => {
    const unknownTex = loadScientificTexture('non_existent_quasar_surface')
    expect(unknownTex).toBeDefined()
  })
})
