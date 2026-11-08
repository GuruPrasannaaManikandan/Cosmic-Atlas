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
  ss_phobos: {
    id: 'ss_phobos',
    name: 'Phobos Viking Surface Map',
    path: '/assets/astronomy/textures/phobos_1k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Viking Orbiter',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Viking-based shaded relief global surface map of Phobos showing Stickney crater.',
  },
  ss_deimos: {
    id: 'ss_deimos',
    name: 'Deimos Viking Surface Map',
    path: '/assets/astronomy/textures/deimos_1k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Viking Orbiter',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Viking-based global surface mosaic of Deimos showing smooth regolith blankets.',
  },
  ss_io: {
    id: 'ss_io',
    name: 'Io Galileo/Voyager Surface Map',
    path: '/assets/astronomy/textures/io_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Galileo SSI & Voyager',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Galileo SSI and Voyager color mosaic of volcanic moon Io featuring sulfur calderas and plume deposits.',
  },
  ss_europa: {
    id: 'ss_europa',
    name: 'Europa Galileo/Voyager Surface Map',
    path: '/assets/astronomy/textures/europa_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Galileo SSI & Voyager',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Galileo and Voyager global surface mosaic of icy moon Europa displaying lineament fracturation.',
  },
  ss_ganymede: {
    id: 'ss_ganymede',
    name: 'Ganymede Galileo/Voyager Surface Map',
    path: '/assets/astronomy/textures/ganymede_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Galileo SSI & Voyager',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Global mosaic of Ganymede detailing grooved terrain and ancient dark cratered regions.',
  },
  ss_callisto: {
    id: 'ss_callisto',
    name: 'Callisto Galileo/Voyager Surface Map',
    path: '/assets/astronomy/textures/callisto_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Galileo SSI & Voyager',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Heavily cratered global mosaic of Callisto featuring Valhalla multi-ring impact basin.',
  },
  ss_mimas: {
    id: 'ss_mimas',
    name: 'Mimas Cassini Surface Map',
    path: '/assets/astronomy/textures/mimas_1k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Cassini ISS',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Cassini ISS global mosaic of Mimas featuring the enormous Herschel impact crater.',
  },
  ss_enceladus: {
    id: 'ss_enceladus',
    name: 'Enceladus Cassini Surface Map',
    path: '/assets/astronomy/textures/enceladus_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Cassini ISS',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'High-albedo Cassini ISS mosaic of Enceladus showing icy fractures and tiger stripe rifts.',
  },
  ss_tethys: {
    id: 'ss_tethys',
    name: 'Tethys Cassini Surface Map',
    path: '/assets/astronomy/textures/tethys_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Cassini ISS',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Cassini ISS mosaic of Saturnian moon Tethys showing Ithaca Chasma and Odysseus crater.',
  },
  ss_dione: {
    id: 'ss_dione',
    name: 'Dione Cassini/Voyager Surface Map',
    path: '/assets/astronomy/textures/dione_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Cassini & Voyager',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Global mosaic of Dione detailing wispy chasmata and cratered trailing hemisphere.',
  },
  ss_rhea: {
    id: 'ss_rhea',
    name: 'Rhea Cassini/Voyager Surface Map',
    path: '/assets/astronomy/textures/rhea_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Cassini & Voyager',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Cassini and Voyager mosaic of heavily cratered icy satellite Rhea.',
  },
  ss_iapetus: {
    id: 'ss_iapetus',
    name: 'Iapetus Cassini/Voyager Surface Map',
    path: '/assets/astronomy/textures/iapetus_1k.jpg',
    type: 'texture',
    source: 'NASA 3D Resources / Cassini & Voyager',
    license: 'Public Domain (NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Dual-albedo map of Iapetus illustrating dark Cassini Regio and bright trailing terrain.',
  },
  ss_phoebe: {
    id: 'ss_phoebe',
    name: 'Phoebe Cassini Surface Map',
    path: '/assets/astronomy/textures/phoebe_1k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Cassini ISS',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Cassini ISS mosaic of captured retrograde irregular satellite Phoebe.',
  },
  ss_miranda: {
    id: 'ss_miranda',
    name: 'Miranda Voyager 2 Surface Map',
    path: '/assets/astronomy/textures/miranda_1k.jpg',
    type: 'texture',
    source: 'NASA 3D Resources / Voyager 2',
    license: 'Public Domain (NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Voyager 2 mosaic of Miranda featuring ovoid coronae, Verona Rupes fault scarps, and reconstructed north.',
  },
  ss_ariel: {
    id: 'ss_ariel',
    name: 'Ariel Voyager 2 Surface Map',
    path: '/assets/astronomy/textures/ariel_1k.jpg',
    type: 'texture',
    source: 'NASA 3D Resources / Voyager 2',
    license: 'Public Domain (NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Voyager 2 mosaic of brightest Uranian satellite Ariel with extensional fault grabens.',
  },
  ss_umbriel: {
    id: 'ss_umbriel',
    name: 'Umbriel Voyager 2 Surface Map',
    path: '/assets/astronomy/textures/umbriel_1k.jpg',
    type: 'texture',
    source: 'NASA 3D Resources / Voyager 2',
    license: 'Public Domain (NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Voyager 2 mosaic of dark, ancient Uranian satellite Umbriel showing bright ring crater Wunda.',
  },
  ss_titania: {
    id: 'ss_titania',
    name: 'Titania Voyager 2 Surface Map',
    path: '/assets/astronomy/textures/titania_1k.jpg',
    type: 'texture',
    source: 'NASA 3D Resources / Voyager 2',
    license: 'Public Domain (NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Voyager 2 mosaic of largest Uranian moon Titania showing Messina Chasma canyon system.',
  },
  ss_oberon: {
    id: 'ss_oberon',
    name: 'Oberon Voyager 2 Surface Map',
    path: '/assets/astronomy/textures/oberon_1k.jpg',
    type: 'texture',
    source: 'NASA 3D Resources / Voyager 2',
    license: 'Public Domain (NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Voyager 2 mosaic of outermost major Uranian moon Oberon showing cratered terrain and dark floor deposits.',
  },
  ss_triton: {
    id: 'ss_triton',
    name: 'Triton Voyager 2 Surface Map',
    path: '/assets/astronomy/textures/triton_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / Voyager 2',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'Voyager 2 color mosaic of retrograde moon Triton showing nitrogen ice cantaloupe terrain.',
  },
  ss_charon: {
    id: 'ss_charon',
    name: 'Charon New Horizons Surface Map',
    path: '/assets/astronomy/textures/charon_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / New Horizons',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'moon',
    description: 'New Horizons encounter mosaic of Charon showing Mordor Macula reddish polar cap and chasmata.',
  },
  ss_pluto: {
    id: 'ss_pluto',
    name: 'Pluto New Horizons Surface Map',
    path: '/assets/astronomy/textures/pluto_2k.jpg',
    type: 'texture',
    source: 'USGS Astrogeology / New Horizons',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [2048, 1024],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'dwarf-planet',
    description: 'New Horizons global mosaic of dwarf planet Pluto featuring nitrogen-ice glacier Sputnik Planitia.',
  },
  ss_ceres: {
    id: 'ss_ceres',
    name: 'Ceres Dawn FC Surface Map',
    path: '/assets/astronomy/textures/ceres_1k.jpg',
    type: 'texture',
    source: 'USGS Astropedia / NASA Dawn FC',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'dwarf-planet',
    description: 'Dawn Framing Camera global mosaic of asteroid-belt dwarf planet Ceres showing Occator crater bright spots.',
  },
  ss_vesta: {
    id: 'ss_vesta',
    name: 'Vesta Dawn FC Surface Map',
    path: '/assets/astronomy/textures/vesta_1k.jpg',
    type: 'texture',
    source: 'USGS Astropedia / NASA Dawn FC',
    license: 'Public Domain (USGS / NASA)',
    dimensions: [1024, 512],
    colorSpace: 'sRGB',
    transparent: false,
    category: 'asteroid',
    description: 'Dawn Framing Camera global mosaic of differentiated protoplanet Vesta and Rheasilvia south-polar impact basin.',
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
