import type { Mission, MissionClass, PhysicalObject } from '../schema'
import { v, u, c, marsPos } from './facts'

const ODE = 'pds-ode-mars-sites'
const MC = 'nssdca-mars-chronology'
const ODE_DATUM = 'as published by PDS ODE (°N, °E); convention not stated on the page — treated as planetocentric east-positive pending confirmation'

function mars(id: string, name: string, launch: string, classes: MissionClass[], site: [number, number] | null, siteRef: string, summary: string, objectIds: string[] = []): Mission {
  return {
    id,
    name,
    agency: 'NASA',
    partners: [],
    nasaMission: true,
    classes,
    target: 'mars',
    launch: v(launch, [MC, 'nssdca-chronology']),
    landing: u('landing date not yet sourced (the NSSDCA Mars chronology lists launch dates only)'),
    status: u('current status not yet sourced'),
    landingSite: site ? v(marsPos(site[0], site[1], ODE_DATUM), [ODE], siteRef) : u('landing coordinates not yet sourced'),
    summary,
    milestones: [{ date: launch, title: 'Launch', description: `${name} launched.`, sources: [MC], kind: 'launch' }],
    objectIds,
    trajectory: { kind: 'none', note: 'Earth–Mars cruise not reconstructed yet (Phase 6).' },
    lastResearchUpdate: '2026-11-09',
  }
}

export const MARS_MISSIONS: Mission[] = [
  mars('viking-1', 'Viking 1', '1975-08-20', ['orbiter', 'lander'], [22.269, 312.049], 'Folkner et al. 1997 (via PDS ODE)', 'Mars orbiter and lander.'),
  mars('viking-2', 'Viking 2', '1975-09-09', ['orbiter', 'lander'], [47.668, 134.28], 'Folkner et al. 1997 (via PDS ODE)', 'Mars orbiter and lander.'),
  mars('mars-pathfinder', 'Mars Pathfinder (with Sojourner)', '1996-12-04', ['lander', 'rover'], [19.095, 326.747], 'Folkner et al. 1997 (via PDS ODE)', 'Mars lander and rover; the rover was Sojourner.'),
  mars('mer-spirit', 'Spirit (MER-A)', '2003-06-10', ['rover'], [-14.5692, 175.4729], 'cartographic triangulation, Arvidson et al. 2004 (Doppler solution 14.571892°S 175.47848°E)', 'Mars Exploration Rover at Gusev crater.'),
  {
    id: 'mer-opportunity',
    name: 'Opportunity (MER-B)',
    agency: 'NASA',
    partners: [],
    nasaMission: true,
    classes: ['rover'],
    target: 'mars',
    launch: v('2003-07-08T03:18:15Z', ['nasa-opportunity', MC], 'July 7, 2003, 20:18:15 PDT from SLC-17B, Cape Canaveral, on a Delta 7925H (NSSDCA lists 8 July, the UTC date)'),
    landing: c('2004-01-25T04:54:00Z', ['nasa-opportunity'], [{ value: '2004-01-24', sources: ['nasa-opportunity'] }], 'NASA\'s in-depth text gives 25 Jan 2004 04:54 UTC; its key-dates list gives 24 Jan (US Pacific date)'),
    end: v('2019-02-13', ['nasa-opportunity'], 'NASA declared the end of the mission'),
    status: v('ended', ['nasa-opportunity']),
    landingSite: v(marsPos(-1.9483, 354.47417, ODE_DATUM), ['nasa-opportunity', ODE], 'Eagle crater, Meridiani Planum (Doppler/radiometric solution; cartographic 1.9462°S 354.4734°E)'),
    plannedDuration: v('90 sols', ['nasa-opportunity']),
    actualDuration: v('almost 15 years (last contact 10 June 2018)', ['nasa-opportunity']),
    summary: 'Mars Exploration Rover sent to look for clues of past water activity at Meridiani Planum. Planned for 90 sols, it operated for almost 15 years and drove 45.16 km before a planet-wide dust storm in June 2018 ended contact.',
    milestones: [
      { date: '2003-07-08T03:18:15Z', title: 'Launch', description: 'Delta II 7925H launch from Cape Canaveral SLC-17B (7 July 2003, 20:18:15 PDT).', sources: ['nasa-opportunity'], kind: 'launch' },
      { date: '2004-01-25T04:54:00Z', title: 'Landing at Meridiani Planum', description: 'Opportunity landed inside Eagle crater, about 14.9 km from its target point.', sources: ['nasa-opportunity'], kind: 'landing' },
      { date: '2011-08-09', title: 'Arrival at Endeavour crater', description: 'Opportunity reached the rim of Endeavour crater, about 22 km across.', sources: ['nasa-opportunity'], kind: 'surface-op' },
      { date: '2018-06-10', title: 'Last communication', description: 'A severe Mars-wide dust storm blanketed the rover\'s location; Opportunity stopped communicating with Earth.', sources: ['nasa-opportunity'], kind: 'last-contact' },
      { date: '2019-02-13', title: 'End of mission', description: 'NASA declared the end of the Opportunity mission.', sources: ['nasa-opportunity'], kind: 'end' },
    ],
    objectIds: ['opportunity-rover'],
    trajectory: { kind: 'none', note: 'Earth–Mars cruise not reconstructed yet (Phase 6).' },
    lastResearchUpdate: '2026-11-09',
  },
  mars('phoenix', 'Phoenix', '2007-08-04', ['lander'], [68.22, 234.25], 'Smith et al. 2009 (via PDS ODE)', 'Mars Scout lander in the northern plains.'),
  mars('msl-curiosity', 'Mars Science Laboratory (Curiosity)', '2011-11-26', ['rover'], [-4.59, 137.44], 'Seelos et al. 2014 (via PDS ODE), MSL Gale landing site', 'Mars rover in Gale crater.'),
  mars('insight', 'InSight', '2018-05-05', ['lander'], null, '', 'Mars lander.'),
  mars('mars-2020', 'Mars 2020 (Perseverance and Ingenuity)', '2020-07-30', ['rover', 'helicopter'], null, '', 'Mars rover and rotorcraft (NSSDCA: "Mars Rover and Rotorcraft").'),
]

export const MARS_OBJECTS: PhysicalObject[] = [
  {
    id: 'opportunity-rover',
    missionId: 'mer-opportunity',
    name: 'Opportunity rover',
    category: 'rover',
    builtBy: 'NASA JPL',
    nasaHardware: true,
    dimensions: u('NASA describes it as "about the size of a golf cart"; numeric dimensions not yet sourced'),
    massKg: v(185, ['nasa-opportunity'], 'rover only; whole spacecraft 1,062 kg'),
    design: 'Solar-powered six-wheeled Mars Exploration Rover (twin of Spirit) with a camera mast and a robotic arm.',
    components: [
      { id: 'pancam', name: 'Pancam', description: 'Panoramic camera on the mast.', sources: ['nasa-opportunity'] },
      { id: 'navcam', name: 'Navcam', description: 'Navigation cameras.', sources: ['nasa-opportunity'] },
      { id: 'minites', name: 'Mini-TES', description: 'Miniature thermal emission spectrometer.', sources: ['nasa-opportunity'] },
      { id: 'arm', name: 'Arm instruments', description: 'Mössbauer spectrometer, APXS, Microscopic Imager and the Rock Abrasion Tool (RAT).', sources: ['nasa-opportunity'] },
    ],
    location: u('final resting place is Perseverance Valley on the rim of Endeavour crater (NASA); coordinates not yet sourced'),
    currentStatus: v('silent since 10 June 2018; mission ended 13 Feb 2019', ['nasa-opportunity']),
    model: { id: null, provenance: 'Model planned for Phase 4 (MER rover family reconstruction from NASA/JPL engineering references).' },
    sources: ['nasa-opportunity'],
  },
]
