/**
 * Planet-specific exploration environments.
 *
 * Everything that differs between worlds lives here: physics (gravity), atmosphere, sky, lighting model, night-time
 * fill light, ground appearance, dust behaviour and which sky bodies are drawn. The HUD, inspection panel, guide,
 * narrator, map, minimap, character controller and camera are shared and read only from this interface — none of them
 * may assume a particular world.
 *
 * Only environments with status 'implemented' can be explored. The Moon is rendered by the web app (React Three Fiber).
 * Mars is rendered by the Unity 6.3 URP player embedded in the app (renderer decision, Stage 2 GRAPHICS_PERFORMANCE_REPORT
 * §3): its terrain (HiRISE DTM), Sun (Mars24 port, unit-tested) and sky live there, so `sunDirection` stays null here and
 * the R3F surface never opens a Mars site. `requirements` lists what is still missing on Mars.
 */
import type { Fact } from '../missions'
import { v, u } from '../missions/catalog/facts'
import { sunDirectionAtLunarSite, meanEarthDirectionAtLunarSite } from './lighting'

type V3 = [number, number, number]

export interface PlanetEnvironment {
  bodyId: string
  name: string
  status: 'implemented' | 'planned'
  /** which renderer draws the surface: the web app's own (R3F) or the embedded Unity player */
  renderer: 'r3f' | 'unity'
  /** volumetric mean radius (m) — terrain curvature, horizon distance, map scale */
  radiusM: number
  /** surface gravity used by the character controller and the dust particles */
  gravity: Fact<number>
  rotationHours: number
  atmosphere: { kind: 'vacuum' } | { kind: 'thin-co2'; surfacePressurePa: Fact<number> }
  /** Sun direction in a site's local frame (+x east, +y up, +z south) at a time; null = lighting model not implemented */
  sunDirection: ((ms: number, latDeg: number, lonEastDeg: number) => V3) | null
  /** other sky bodies drawn with their (mean) direction from the site */
  skyBodies: { id: 'earth'; direction: (latDeg: number, lonEastDeg: number) => V3 }[]
  sky: { background: string; starOpacityDay: number; starOpacityNight: number }
  /** light on the ground when the Sun is down */
  nightFill: { kind: 'earthshine'; color: string; intensity: number } | { kind: 'none' }
  ground: { color: string; farColor: string; rockColor: string; bounce: string }
  /** dust kicked up by boots: ballistic in vacuum; an atmosphere would add drag (not implemented) */
  dust: { drag: boolean }
  /** wording used by the shared HUD */
  words: { night: string; nightLight: string }
  /** datasets / work still required before the environment can be opened ('planned' only) */
  requirements?: string[]
}

export const EARTH_G = 9.81

export const PLANETS: Record<string, PlanetEnvironment> = {
  moon: {
    bodyId: 'moon',
    name: 'Moon',
    status: 'implemented',
    renderer: 'r3f',
    radiusM: 1737.4e3,
    gravity: v(1.62, ['nssdca-moon-fact']),
    rotationHours: 655.72,
    atmosphere: { kind: 'vacuum' },
    sunDirection: sunDirectionAtLunarSite,
    skyBodies: [{ id: 'earth', direction: meanEarthDirectionAtLunarSite }],
    // no air: a black sky; bright daylight surfaces wash faint stars out of view (as in Apollo photographs)
    sky: { background: '#000000', starOpacityDay: 0.1, starOpacityNight: 0.9 },
    nightFill: { kind: 'earthshine', color: '#9fb4ff', intensity: 0.22 },
    ground: { color: '#9b9993', farColor: '#5c5a55', rockColor: '#7b7974', bounce: '#8d8a83' },
    dust: { drag: false },
    words: { night: 'Lunar night at this date.', nightLight: 'only earthshine lights the ground' },
  },
  mars: {
    bodyId: 'mars',
    name: 'Mars',
    status: 'implemented',
    renderer: 'unity',
    radiusM: 3389.5e3,
    // NSSDCA fact sheet: 3.73 m/s² (mean); the brief's "≈3.71" is not used because it is not the sourced value
    gravity: v(3.73, ['nssdca-mars-fact'], 'mean surface gravity (equator 3.69, pole 3.73)'),
    rotationHours: 24.6229,
    atmosphere: { kind: 'thin-co2', surfacePressurePa: u('surface pressure not yet sourced') },
    sunDirection: null,
    skyBodies: [],
    sky: { background: '#000000', starOpacityDay: 0, starOpacityNight: 0.8 },
    nightFill: { kind: 'none' },
    ground: { color: '#000000', farColor: '#000000', rockColor: '#000000', bounce: '#000000' },
    dust: { drag: true },
    words: { night: 'Night at this date.', nightLight: 'the ground is unlit' },
    // what is still missing (Victoria crater is open; everything below is NOT done)
    requirements: [
      'Daytime sky: the Unity sky and dust are ILLUSTRATIVE (tau 0.9 assumed); a sourced scattering model and the PDS Pancam tau record are needed',
      'Surface colour: the Victoria terrain uses the grayscale HiRISE RED band with an illustrative tint; calibrated colour (HiRISE IRB or CTX) is not applied',
      'Terrain for the other sites: Endeavour (Opportunity\'s final site), Gusev (Spirit), Gale (Curiosity), Jezero (Perseverance), Chryse / Utopia (Viking), Ares Vallis (Pathfinder); a MOLA horizon around each',
      'Site records: sourced coordinates for Perseverance (Jezero) and InSight (have only "about"), final positions for Spirit and Opportunity',
      'Hardware placement beyond Opportunity at Victoria, with models validated in the Spacecraft Archive (several already are)',
      'Opportunity model detail: the NASA MER .blend (63 named parts) needs Blender to convert; the low-poly MER-B model is 17% short in height',
    ],
  },
}

/** only implemented environments can be explored */
export const isExplorable = (bodyId: string) => {
  const p = PLANETS[bodyId]
  return !!p && p.status === 'implemented' && (p.renderer === 'unity' || p.sunDirection !== null)
}

export function planetFor(bodyId: string): PlanetEnvironment {
  const p = PLANETS[bodyId]
  if (!p) throw new Error(`no exploration environment for "${bodyId}"`)
  return p
}
