import type { Mission, MissionClass, PhysicalObject } from '../schema'
import { v, u, c, marsPos } from './facts'
import type { Milestone } from '../schema'

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
  {
    ...mars('viking-1', 'Viking 1', '1975-08-20', ['orbiter', 'lander'], [22.269, 312.049], 'Folkner et al. 1997 (via PDS ODE); NSSDCA gives 22.27°N 312.05°E planetocentric', 'Mars orbiter and lander. The lander touched down in western Chryse Planitia and operated until contact was lost in November 1982.', ['viking-1-lander']),
    landing: v('1976-07-20T11:53:06Z', ['nssdca-viking1-lander'], 'NSSDCA gives the touchdown time 11:53:06 UT after separation on 20 July 1976'),
    end: v('1982-11-13', ['nssdca-viking1-lander'], 'contact with the lander was lost'),
    status: v('ended', ['nssdca-viking1-lander']),
    milestones: [
      { date: '1975-08-20', title: 'Launch', description: 'Viking 1 launched.', sources: [MC], kind: 'launch' },
      { date: '1976-07-20T11:53:06Z', title: 'Landing in Chryse Planitia', description: 'The Viking 1 lander touched down in western Chryse Planitia.', sources: ['nssdca-viking1-lander'], kind: 'landing' },
      { date: '1982-11-13', title: 'Contact lost', description: 'The lander operated until contact was lost.', sources: ['nssdca-viking1-lander'], kind: 'last-contact' },
    ] as Milestone[],
  },
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
  {
    ...mars('insight', 'InSight', '2018-05-05', ['lander'], null, '', 'Mars lander that studied the deep interior of Mars from Elysium Planitia.', ['insight-lander']),
    landing: v('2018-11-26T19:52:59Z', ['nasa-insight'], '11:52:59 a.m. PT (PST, UTC-8)'),
    end: v('2022-12-15', ['nasa-insight']),
    status: v('ended', ['nasa-insight']),
    landingSite: v(marsPos(4.5, 135.9, 'NASA: "centered at about 4.5 N, 135.9 E" (approximate)'), ['nasa-insight']),
    milestones: [
      { date: '2018-05-05', title: 'Launch', description: 'InSight launched.', sources: ['nasa-insight', MC], kind: 'launch' },
      { date: '2018-11-26T19:52:59Z', title: 'Landing at Elysium Planitia', description: 'InSight landed on Elysium Planitia.', sources: ['nasa-insight'], kind: 'landing' },
      { date: '2022-12-15', title: 'End of mission', description: 'NASA ended the InSight mission.', sources: ['nasa-insight'], kind: 'end' },
    ] as Milestone[],
  },
  {
    ...mars('mars-2020', 'Mars 2020 (Perseverance and Ingenuity)', '2020-07-30', ['rover', 'helicopter'], null, '', 'Perseverance rover and the Ingenuity helicopter, landed in Jezero crater.', ['perseverance-rover', 'ingenuity-helicopter']),
    landing: v('2021-02-18', ['nasa-perseverance'], 'date only'),
    status: v('operating', ['nasa-perseverance'], "Perseverance; Ingenuity's mission was completed on 25 Jan 2024"),
    milestones: [
      { date: '2020-07-30', title: 'Launch', description: 'Mars 2020 launched with Perseverance and Ingenuity.', sources: ['nasa-perseverance', MC], kind: 'launch' },
      { date: '2021-02-18', title: 'Landing in Jezero crater', description: 'Perseverance landed in Jezero crater.', sources: ['nasa-perseverance'], kind: 'landing' },
      { date: '2021-04-19', title: 'First powered flight on another planet', description: 'Ingenuity made its first flight.', sources: ['nasa-ingenuity'], kind: 'surface-op' },
      { date: '2024-01-18', title: "Ingenuity's last flight", description: 'Ingenuity flew for the 72nd and last time.', sources: ['nasa-ingenuity'], kind: 'surface-op' },
      { date: '2024-01-25', title: 'Ingenuity mission completed', description: 'NASA completed the Ingenuity mission.', sources: ['nasa-ingenuity'], kind: 'end' },
    ] as Milestone[],
  },
]

export const MARS_OBJECTS: PhysicalObject[] = [
  {
    id: 'opportunity-rover',
    missionId: 'mer-opportunity',
    name: 'Opportunity rover',
    category: 'rover',
    builtBy: 'NASA JPL',
    nasaHardware: true,
    dimensions: u('NASA describes it as "about the size of a golf cart" with mast cameras about 1.5 m off the ground; length and width not yet sourced'),
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
    model: { id: 'nasa:mer-b', provenance: 'Official NASA 3D Resources model (low-poly), scaled so the mast cameras sit ~1.5 m above the ground (NASA). See the Spacecraft Archive for validation.' },
    sources: ['nasa-opportunity'],
  },
]

const rover = (id: string, missionId: string, name: string, category: PhysicalObject['category'], dims: PhysicalObject['dimensions'], mass: PhysicalObject['massKg'], design: string, modelId: string, provenance: string, status: PhysicalObject['currentStatus'], location: PhysicalObject['location'], sources: string[]): PhysicalObject => ({
  id, missionId, name, category, builtBy: 'NASA JPL', nasaHardware: true, dimensions: dims, massKg: mass, design, components: [], location, currentStatus: status, model: { id: modelId, provenance }, sources,
})

MARS_OBJECTS.push(
  rover('perseverance-rover', 'mars-2020', 'Perseverance rover', 'rover', v('3 m long, 2.7 m wide, 2.2 m tall; wheels 52.5 cm; 2.1 m robotic arm', ['nasa-perseverance-components']), v(1025, ['nasa-perseverance-components']), 'Car-sized six-wheeled rover powered by an MMRTG (about 110 W at launch).', 'nasa:perseverance', "Official NASA 3D Resources model (metric), validated against NASA's length, width and height in the Spacecraft Archive.", v('operating', ['nasa-perseverance']), u('current position not sourced'), ['nasa-perseverance-components', 'nasa-perseverance']),
  rover('ingenuity-helicopter', 'mars-2020', 'Ingenuity Mars Helicopter', 'helicopter', v('rotors about 1.2 m tip to tip', ['nasa-ingenuity']), v(1.8, ['nasa-ingenuity']), 'Solar-powered coaxial-rotor helicopter; the first powered flight on another planet (72 flights).', 'nasa:ingenuity', 'Official NASA 3D Resources model (metric), rotor span validated in the Spacecraft Archive.', v('mission completed 25 Jan 2024', ['nasa-ingenuity']), u('final position not sourced'), ['nasa-ingenuity']),
  { ...rover('viking-1-lander', 'viking-1', 'Viking 1 lander', 'lander', v('six-sided base with alternate 1.09 m and 0.56 m sides on three legs; footpads 2.21 m apart (equilateral triangle)', ['nssdca-viking1-lander']), v(572, ['nssdca-viking1-lander']), 'Three-legged lander with RTG power, a high-gain antenna and a surface sampler arm.', 'nasa:viking-lander', 'Official NASA 3D Resources model, scaled to the NSSDCA footpad triangle (2.21 m sides).', v('silent since 13 Nov 1982', ['nssdca-viking1-lander']), v(marsPos(22.27, 312.05, 'planetocentric (NSSDCA)'), ['nssdca-viking1-lander']), ['nssdca-viking1-lander']), builtBy: 'NASA' },
  rover('insight-lander', 'insight', 'InSight lander', 'lander', u('overall dimensions not on the NASA page read'), u('not on the NASA page read'), 'Stationary lander with two round solar arrays, a 1.8 m robotic arm, a seismometer and a heat probe.', 'nasa:insight', 'Official NASA 3D Resources model (metric); not yet validated - no sourced overall dimension.', v('mission ended 15 Dec 2022', ['nasa-insight']), v(marsPos(4.5, 135.9, 'approximate (NASA: "centered at about")'), ['nasa-insight']), ['nasa-insight']),
)
