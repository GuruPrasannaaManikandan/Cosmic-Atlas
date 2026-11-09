import { MISSION_BY_ID, OBJECT_BY_ID, Fact } from '../missions'
import { v } from '../missions/catalog/facts'
import { GeoOrigin, toLocal } from './geo'

export interface SurfaceBody {
  id: string
  name: string
  /** volumetric mean radius (m) */
  radiusM: number
  gravity: Fact<number>
  /** sidereal rotation period (h) */
  rotationHours: number
}

export const SURFACE_BODIES: Record<string, SurfaceBody> = {
  moon: { id: 'moon', name: 'Moon', radiusM: 1737.4e3, gravity: v(1.62, ['nssdca-moon-fact']), rotationHours: 655.72 },
  mars: { id: 'mars', name: 'Mars', radiusM: 3389.5e3, gravity: v(3.73, ['nssdca-mars-fact'], 'mean surface gravity'), rotationHours: 24.6229 },
}

export interface PlacedObject {
  objectId: string
  x: number
  z: number
  /** elevation relative to the site origin (m), from the source when it gives one */
  dy: number
  /** heading of the model's +z axis, degrees clockwise from north — never sourced, always marked approximate */
  headingDeg: number
  /** discovery / interaction radii (m) */
  noticeM: number
  interactM: number
}

export interface SurfaceSite {
  id: string
  bodyId: string
  name: string
  missionIds: string[]
  origin: GeoOrigin & { elevationM: number }
  /** half-size of the walkable square (m) */
  halfExtentM: number
  terrainSeed: number
  terrainProvenance: string
  objects: PlacedObject[]
  /** environment implemented and explorable now */
  available: boolean
}

function place(site: Omit<SurfaceSite, 'objects'>, specs: { id: string; heading: number; notice: number; interact: number }[]): SurfaceSite {
  const objects = specs.map((s) => {
    const loc = OBJECT_BY_ID[s.id].location.value
    if (!loc) throw new Error(`object ${s.id} has no sourced location — it cannot be placed`)
    const p = toLocal(site.origin, loc.latDeg, loc.lonEastDeg)
    return { objectId: s.id, x: p.x, z: p.z, dy: loc.elevationM !== undefined ? loc.elevationM - site.origin.elevationM : 0, headingDeg: s.heading, noticeM: s.notice, interactM: s.interact }
  })
  return { ...site, objects }
}

const a11lm = OBJECT_BY_ID['a11-lm-descent'].location.value!

export const SURFACE_SITES: SurfaceSite[] = [
  place(
    {
      id: 'tranquility-base',
      bodyId: 'moon',
      name: 'Tranquility Base — Apollo 11',
      missionIds: ['apollo-11'],
      origin: { latDeg: a11lm.latDeg, lonEastDeg: a11lm.lonEastDeg, radiusM: SURFACE_BODIES.moon.radiusM, elevationM: a11lm.elevationM ?? 0 },
      halfExtentM: 300,
      terrainSeed: 1969,
      terrainProvenance:
        'Terrain is PROCEDURAL (seeded noise and craters shaped like mare regolith), not a LOLA or LROC NAC elevation model. Hardware positions are the LRO-measured coordinates (NSSDCA 2017 / LROC 2016, ±0.3–0.4 m).',
      available: true,
    },
    [
      // LM heading is NOT sourced: approximate, with the ladder (model +z) facing west as in the crew photographs
      { id: 'a11-lm-descent', heading: 90, notice: 40, interact: 7 },
      { id: 'a11-easep-pse', heading: 0, notice: 18, interact: 3.5 },
      { id: 'a11-lrrr', heading: 90, notice: 18, interact: 3 },
    ],
  ),
]

/** other catalogued landing sites, listed (not yet explorable) so the picker shows the full map of what exists */
export function catalogueSitesFor(bodyId: string) {
  return Object.values(MISSION_BY_ID)
    .filter((m) => m.target === bodyId && m.landingSite?.value)
    .map((m) => ({ missionId: m.id, name: m.name, nasa: m.nasaMission, site: m.landingSite!.value!, explorable: SURFACE_SITES.some((s) => s.missionIds.includes(m.id) && s.available) }))
}

export const SITE_BY_ID: Record<string, SurfaceSite> = Object.fromEntries(SURFACE_SITES.map((s) => [s.id, s]))
export const sitesForBody = (bodyId: string) => SURFACE_SITES.filter((s) => s.bodyId === bodyId)
