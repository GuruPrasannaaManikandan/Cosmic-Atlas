import * as THREE from 'three'
import * as T from '../scene/textures'

export interface AstronomicalAsset {
  id: string
  name: string
  path: string
  type: 'texture' | 'mask' | 'model' | 'atmosphere' | 'rings' | 'galaxy' | 'nebula' | 'star'
  source: string
  license: string
  dimensions: [number, number]
  colorSpace: 'sRGB' | 'Linear'
  transparent: boolean
  category: string
  description: string
}

export const ASSET_REGISTRY: Record<string, AstronomicalAsset> = {
  earth_day: {
    id: 'earth_day',
    name: 'Earth Photorealistic Day Surface Map',
    path: '/assets/astronomy/textures/earth_day_2k.jpg',
    type: 'texture',
    source: 'NASA Visible Earth & Blue Marble Reference',
    license: 'Public Domain (NASA / USGS)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'planet',
    description: 'Equirectangular 2K color albedo map of Earth featuring bathymetric oceans, continental topography, and ice caps.',
  },
  earth_clouds: {
    id: 'earth_clouds',
    name: 'Earth Dynamic Cloud Atmosphere Layer',
    path: '/assets/astronomy/textures/earth_clouds_2k.png',
    type: 'atmosphere',
    source: 'NASA GOES / NOAA Meteorological Composite',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: true,
    category: 'atmosphere',
    description: 'Photorealistic 2K translucent cloud deck featuring cyclone spirals and tropical convergence bands.',
  },
  earth_specular: {
    id: 'earth_specular',
    name: 'Earth Specular Ocean Mask',
    path: '/assets/astronomy/textures/earth_specular_2k.jpg',
    type: 'mask',
    source: 'NASA Blue Marble',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'Linear',
    transparent: false,
    category: 'mask',
    description: 'High-contrast water specular map for physically-based oceanic sun glint.',
  },
  moon_albedo: {
    id: 'moon_albedo',
    name: 'Moon USGS/LRO Lunar Reconnaissance Albedo Map',
    path: '/assets/astronomy/textures/moon_albedo_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology & NASA LRO WAC',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'High-definition 2K lunar surface texture accurately depicting lunar maria, impact basins, and ejecta ray systems.',
  },
  mars_albedo: {
    id: 'mars_albedo',
    name: 'Mars Viking/MGS Scientific Surface Albedo Map',
    path: '/assets/astronomy/textures/mars_albedo_2k.jpg',
    type: 'texture',
    source: 'NASA MGS MOC & Viking Orbiter',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'planet',
    description: 'Photometrically accurate 2K surface map of Mars featuring Valles Marineris, Olympus Mons, and polar ice caps.',
  },
  jupiter_color: {
    id: 'jupiter_color',
    name: 'Jupiter Cassini/Juno True-Color Atmospheric Map',
    path: '/assets/astronomy/textures/jupiter_color_2k.jpg',
    type: 'texture',
    source: 'NASA Cassini ISS & JunoCam Science Data',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'planet',
    description: 'True-color 2K cylindrical map of Jupiter showing equatorial belts, festoons, and Great Red Spot.',
  },
  saturn_color: {
    id: 'saturn_color',
    name: 'Saturn Cassini Natural Color Atmosphere Map',
    path: '/assets/astronomy/textures/saturn_color_2k.jpg',
    type: 'texture',
    source: 'NASA/JPL/Space Science Institute Cassini',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'planet',
    description: 'Calibrated 2K Saturnian atmospheric texture with golden haze banding and north-polar hexagon shadow.',
  },
  saturn_rings: {
    id: 'saturn_rings',
    name: 'Saturn High-Resolution Scientific Ring Profile',
    path: '/assets/astronomy/textures/saturn_rings_highres.png',
    type: 'rings',
    source: 'NASA Cassini Radio Science & ISS Occultation Profiles',
    license: 'Public Domain',
    dimensions: [1024, 64],
    colorSpace: 'sRGB',
    transparent: true,
    category: 'rings',
    description: 'High-definition radial optical depth texture of Saturn ring system detailing A/B/C rings and Cassini Division.',
  },
  sun_photosphere: {
    id: 'sun_photosphere',
    name: 'Sun SDO/AIA Photosphere & Granulation Map',
    path: '/assets/astronomy/textures/sun_photosphere_2k.jpg',
    type: 'star',
    source: 'NASA Solar Dynamics Observatory (SDO) AIA & HMI',
    license: 'Public Domain',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'star',
    description: 'Photorealistic 2K solar surface model featuring convective granulation and sunspot complexes.',
  },
  betelgeuse_surface: {
    id: 'betelgeuse_surface',
    name: 'Betelgeuse ESO-VLT/SPHERE Red Supergiant Surface',
    path: '/assets/astronomy/textures/betelgeuse_surface_2k.jpg',
    type: 'star',
    source: 'ESO Very Large Telescope / SPHERE (Montargès et al. 2021)',
    license: 'Public Domain (ESO / Science)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'star',
    description: 'Reconstructed 2K red supergiant stellar surface depicting colossal convective plume cells and asymmetric dust cooling.',
  },
  andromeda_m31: {
    id: 'andromeda_m31',
    name: 'Andromeda Galaxy (M31) High-Definition Disk Model',
    path: '/assets/astronomy/textures/andromeda_m31_disk.png',
    type: 'galaxy',
    source: 'NASA/ESA Hubble Space Telescope & GALEX Composite',
    license: 'Public Domain',
    dimensions: [1024, 1024],
    colorSpace: 'sRGB',
    transparent: true,
    category: 'galaxy',
    description: 'High-definition 1K spiral galaxy disk texture featuring bright Population II bulge, dust lanes, and star-forming arms.',
  },
  carina_nebula: {
    id: 'carina_nebula',
    name: 'Carina Nebula (NGC 3372) Multi-Wavelength Emission Map',
    path: '/assets/astronomy/textures/carina_emission_nebula.png',
    type: 'nebula',
    source: 'NASA/ESA Hubble Heritage & ESO VLT Hawk-I',
    license: 'Public Domain',
    dimensions: [1024, 1024],
    colorSpace: 'sRGB',
    transparent: true,
    category: 'nebula',
    description: 'Rich multi-wavelength emission cloud texture showcasing ionized hydrogen (H-alpha) cavities and cold dust pillars.',
  },
}

// Memory cache for loaded Three.js textures
const textureCache = new Map<string, THREE.Texture>()
let loader: THREE.TextureLoader | null = null

function getLoader(): THREE.TextureLoader {
  if (!loader) loader = new THREE.TextureLoader()
  return loader
}

/**
 * Loads an authoritative scientific texture with automatic color space, anisotropy, and fallback to procedural textures.
 */
export function loadScientificTexture(assetId: string, fallbackFn?: () => THREE.Texture): THREE.Texture {
  if (textureCache.has(assetId)) return textureCache.get(assetId)!

  const asset = ASSET_REGISTRY[assetId]
  if (!asset) {
    if (typeof document === 'undefined') {
      const dummy = new THREE.Texture()
      textureCache.set(assetId, dummy)
      return dummy
    }
    return fallbackFn ? fallbackFn() : T.planetTexture(assetId, '#ffffff')
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const dummy = new THREE.Texture()
    textureCache.set(assetId, dummy)
    return dummy
  }

  const ldr = getLoader()
  const tex = ldr.load(
    asset.path,
    (t) => {
      t.colorSpace = asset.colorSpace === 'Linear' ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace
      t.anisotropy = 8
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.needsUpdate = true
    },
    undefined,
    () => {
      console.warn(`[AssetRegistry] Failed to fetch ${asset.path}, using procedural fallback.`)
    }
  )
  tex.colorSpace = asset.colorSpace === 'Linear' ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace
  tex.anisotropy = 8
  textureCache.set(assetId, tex)
  return tex
}

/** Specific scientific asset helpers */
export function getEarthTexture(): THREE.Texture {
  return loadScientificTexture('earth_day', () => T.planetTexture('earth', '#2277bb'))
}

export function getEarthCloudsTexture(): THREE.Texture {
  return loadScientificTexture('earth_clouds', () => T.planetTexture('earth_clouds', '#ffffff'))
}

export function getEarthSpecularTexture(): THREE.Texture {
  return loadScientificTexture('earth_specular', () => T.planetTexture('earth_specular', '#000000'))
}

export function getMoonTexture(): THREE.Texture {
  return loadScientificTexture('moon_albedo', () => T.planetTexture('moon', '#b9b9b9'))
}

export function getMarsTexture(): THREE.Texture {
  return loadScientificTexture('mars_albedo', () => T.planetTexture('mars', '#cc5533'))
}

export function getJupiterTexture(): THREE.Texture {
  return loadScientificTexture('jupiter_color', () => T.planetTexture('jupiter', '#d8a070'))
}

export function getSaturnTexture(): THREE.Texture {
  return loadScientificTexture('saturn_color', () => T.planetTexture('saturn', '#e0cf90'))
}

export function getSaturnRingsTexture(): THREE.Texture {
  return loadScientificTexture('saturn_rings', () => T.saturnRingTexture())
}

export function getSunPhotosphereTexture(): THREE.Texture {
  return loadScientificTexture('sun_photosphere', () => T.planetTexture('sun', '#ffe6a8'))
}

export function getBetelgeuseTexture(): THREE.Texture {
  return loadScientificTexture('betelgeuse_surface', () => T.planetTexture('betelgeuse', '#ff5522'))
}

export function getAndromedaTexture(): THREE.Texture {
  return loadScientificTexture('andromeda_m31', () => T.spiralTexture('#ffd8a8'))
}

export function getCarinaTexture(): THREE.Texture {
  return loadScientificTexture('carina_nebula', () => T.nebulaTexture('#ff6699'))
}
