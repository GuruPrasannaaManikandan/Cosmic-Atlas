/**
 * Universal discovery (E1): what can be discovered at each Mars landing site.
 *
 * The scientific records live in the mission catalogue (missions/catalog/*.ts); this file only says, per site, which
 * catalogue object each piece of scene hardware is, and which measured landmarks lie in the terrain. A new mission is
 * added here (plus its catalogue records) — the discovery, tracking and catalogue code does not change.
 */
import type { DiscoveryCategory, SourcedText } from '../missions'

export interface SiteLandmark {
  id: string
  name: string
  category: DiscoveryCategory
  /** site frame (metres east / north of the site origin, which is the main hardware) */
  x: number
  z: number
  /** within this distance it counts as approached */
  radius: number
  description: SourcedText
  /** how the position was obtained */
  placement: SourcedText
  /** the scene has no 3-D model of it (only the measured ground image shows it) */
  noModel?: boolean
}

export interface SiteDiscoveryConfig {
  /** scene hardware id (Unity) -> catalogue object id */
  objects: Record<string, string>
  landmarks: SiteLandmark[]
}

/** keyed by the app's surface-site id (UNITY_SITE_BY_ID) */
export const SITE_DISCOVERIES: Record<string, SiteDiscoveryConfig> = {
  'victoria-crater': { objects: { 'opportunity-rover': 'opportunity-rover' }, landmarks: [] },
  'mars-viking-1': { objects: { 'viking-1-lander': 'viking-1-lander' }, landmarks: [] },
  'mars-viking-2': { objects: { 'viking-2-lander': 'viking-2-lander' }, landmarks: [] },
  'mars-pathfinder': {
    objects: { 'pathfinder-lander': 'pathfinder-lander', sojourner: 'sojourner-rover' },
    landmarks: [
      {
        id: 'mpf-backshell', name: 'Backshell and parachute', category: 'historical-spacecraft', x: 83, z: -247, radius: 12, noModel: true,
        description: { text: 'Pathfinder\'s backshell and parachute lie south of the lander, as the HiRISE team identified them.', sources: ['hirise-psp-001890-1995'] },
        placement: { text: 'MEASURED: the bright object identified by this project in the controlled orthoimage PSP_001890_1995, 260 m south-south-east of the lander. No 3-D model: the ground image shows it.', sources: ['hirise-psp-001890-1995'] },
      },
    ],
  },
  'mars-spirit': {
    objects: { 'spirit-rover': 'spirit-rover', 'spirit-lander': 'mer-a-lander' },
    landmarks: [
      {
        id: 'bonneville', name: 'Bonneville crater', category: 'landmark', x: 295, z: 272, radius: 125,
        description: { text: 'The crater the HiRISE team labels "Bonneville Crater", north-east of Spirit\'s lander.', sources: ['hirise-psp-001513-1655'] },
        placement: { text: 'MEASURED: centre and size (about 210 m across) measured by this project in the controlled orthoimage PSP_001513_1655; the terrain here is the controlled HiRISE DTM.', sources: ['hirise-psp-001513-1655'] },
      },
    ],
  },
  'mars-phoenix': {
    objects: { 'phoenix-lander': 'phoenix-lander' },
    landmarks: [
      {
        id: 'phx-heatshield', name: 'Heat-shield impact (candidate)', category: 'historical-spacecraft', x: 177, z: -90, radius: 12, noModel: true,
        description: { text: 'In the image taken 22 hours after landing, the HiRISE team identified a dark spot as the heat shield, probably where it first hit the surface.', sources: ['hirise-psp-008591-2485'] },
        placement: { text: 'CANDIDATE: a dark spot with a streak about 200 m east-south-east of the lander in the controlled orthoimage PSP_008591_2485, identified by this project; not yet matched to the HiRISE team\'s annotation. No 3-D model.', sources: ['hirise-psp-008591-2485'] },
      },
    ],
  },
  'mars-curiosity': { objects: { 'curiosity-rover': 'curiosity-rover' }, landmarks: [] },
  'mars-insight': { objects: { 'insight-lander': 'insight-lander' }, landmarks: [] },
}

export const objectIdFor = (siteId: string | null, hardwareId: string | null): string | null =>
  siteId && hardwareId ? SITE_DISCOVERIES[siteId]?.objects[hardwareId] ?? null : null
