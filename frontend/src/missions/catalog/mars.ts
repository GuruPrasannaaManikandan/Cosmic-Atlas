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
  {
    ...mars('viking-2', 'Viking 2', '1975-09-09', ['orbiter', 'lander'], [47.668, 134.28], 'Folkner et al. 1997 (via PDS ODE)', 'Mars orbiter and lander. The lander set down at Utopia Planitia, a different site from Viking 1, and returned data until 1980.'),
    arrival: v('1976-08-07', ['nasa-viking-2'], 'Mars orbit'),
    landing: v('1976-09-03', ['nasa-viking-2']),
    end: v('1980-04-12', ['nasa-viking-2'], 'lander last contact; the orbiter ended on 24 July 1978'),
    status: v('completed', ['nasa-viking-2'], 'NASA lists the mission as "Successful"'),
    milestones: [
      { date: '1975-09-09', title: 'Launch', description: 'Viking 2 launched.', sources: ['nasa-viking-2', MC], kind: 'launch' },
      { date: '1976-08-07', title: 'Mars orbit', description: 'Viking 2 reached Mars orbit.', sources: ['nasa-viking-2'], kind: 'orbit-insertion' },
      { date: '1976-09-03', title: 'Landing at Utopia Planitia', description: 'The Viking 2 lander touched down at Utopia Planitia.', sources: ['nasa-viking-2'], kind: 'landing' },
      { date: '1978-07-24', title: 'Orbiter mission ends', description: 'The Viking 2 orbiter ended its mission.', sources: ['nasa-viking-2'], kind: 'end' },
      { date: '1980-04-12', title: 'Lander last contact', description: 'Last contact with the Viking 2 lander.', sources: ['nasa-viking-2'], kind: 'last-contact' },
    ] as Milestone[],
  },
  {
    ...mars('mars-pathfinder', 'Mars Pathfinder (with Sojourner)', '1996-12-04', ['lander', 'rover'], [19.095, 326.747], 'Folkner et al. 1997 (via PDS ODE)', 'Mars lander and rover. Pathfinder delivered Sojourner, the first robotic rover on Mars, to Ares Vallis; the lander was named the Carl Sagan Memorial Station.'),
    landing: v('1997-07-04', ['nasa-mars-pathfinder']),
    end: v('1997-09-27', ['nasa-mars-pathfinder'], 'final data transmission'),
    status: v('completed', ['nasa-mars-pathfinder']),
    milestones: [
      { date: '1996-12-04', title: 'Launch', description: 'Mars Pathfinder launched with the Sojourner rover.', sources: ['nasa-mars-pathfinder', MC], kind: 'launch' },
      { date: '1997-07-04', title: 'Landing at Ares Vallis', description: 'Mars Pathfinder landed at Ares Vallis.', sources: ['nasa-mars-pathfinder'], kind: 'landing' },
      { date: '1997-07-05', title: 'Sojourner rolls onto Mars', description: 'On the night of July 5, Sojourner stood up to its full 30 cm height and rolled down the lander\'s rear ramp: the first robotic rover on Mars.', sources: ['nasa-mars-pathfinder'], kind: 'surface-op' },
      { date: '1997-09-27', title: 'Final data transmission', description: 'The last data transmission from Mars Pathfinder.', sources: ['nasa-mars-pathfinder'], kind: 'last-contact' },
    ] as Milestone[],
  },
  {
    ...mars('mer-spirit', 'Spirit (MER-A)', '2003-06-10', ['rover'], [-14.5692, 175.4729], 'cartographic triangulation, Arvidson et al. 2004 (Doppler solution 14.571892°S 175.47848°E)', 'Mars Exploration Rover, twin of Opportunity, sent to Gusev crater to look for evidence of past water.'),
    landing: v('2004-01-03', ['nasa-mer-spirit'], 'date as given on the NASA mission page (time zone not stated)'),
    end: v('2011-05-25', ['nasa-mer-spirit'], 'NASA concluded its recovery efforts and declared the mission complete'),
    status: v('ended', ['nasa-mer-spirit'], 'silent since March 2010'),
    milestones: [
      { date: '2003-06-10', title: 'Launch', description: 'Spirit launched.', sources: ['nasa-mer-spirit', MC], kind: 'launch' },
      { date: '2004-01-03', title: 'Landing in Gusev crater', description: 'Spirit landed inside Gusev crater.', sources: ['nasa-mer-spirit'], kind: 'landing' },
      { date: '2010-03-22', title: 'Last communication', description: 'After March 22, 2010, controllers could not regain contact with Spirit.', sources: ['nasa-mer-spirit'], kind: 'last-contact' },
      { date: '2011-05-25', title: 'End of mission', description: 'NASA concluded its recovery efforts and declared the mission complete.', sources: ['nasa-mer-spirit'], kind: 'end' },
    ] as Milestone[],
  },
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
      { date: '2004-01-25T04:54:00Z', title: 'Landing at Meridiani Planum', description: 'Opportunity bounced at least 26 times on its airbags and came to rest inside a small impact crater later named Eagle, about 14.9 km from its target point.', sources: ['nasa-opportunity'], kind: 'landing' },
      { date: '2004-03-22', title: 'Out of Eagle crater', description: 'Opportunity drove out of Eagle crater.', sources: ['nasa-opportunity'], kind: 'surface-op' },
      { date: '2005-01', title: 'Heat Shield Rock', description: 'Opportunity found a basketball-sized rock, named Heat Shield Rock, that turned out to be an iron-nickel meteorite.', sources: ['nasa-opportunity'], kind: 'surface-op' },
      { date: '2006-09', title: 'Arrival at Victoria crater', description: 'Opportunity reached Victoria crater, about 800 m across.', sources: ['nasa-opportunity'], kind: 'surface-op' },
      { date: '2007-09-11', title: 'Into Victoria crater', description: 'Opportunity drove into Victoria crater.', sources: ['nasa-opportunity'], kind: 'surface-op' },
      { date: '2011-08-09', title: 'Arrival at Endeavour crater', description: 'Opportunity reached the rim of Endeavour crater, about 22 km across.', sources: ['nasa-opportunity'], kind: 'surface-op' },
      { date: '2018-06-10', title: 'Last communication', description: 'A severe Mars-wide dust storm blanketed the rover\'s location; Opportunity stopped communicating with Earth.', sources: ['nasa-opportunity'], kind: 'last-contact' },
      { date: '2019-02-13', title: 'End of mission', description: 'NASA declared the end of the Opportunity mission.', sources: ['nasa-opportunity'], kind: 'end' },
    ],
    objectIds: ['opportunity-rover'],
    trajectory: { kind: 'none', note: 'Earth–Mars cruise not reconstructed yet (Phase 6).' },
    lastResearchUpdate: '2026-11-09',
  },
  {
    ...mars('phoenix', 'Phoenix', '2007-08-04', ['lander'], [68.22, 234.25], 'Smith et al. 2009 (via PDS ODE)', 'Mars Scout lander that set down in the arctic plains of Vastitas Borealis.'),
    landing: v('2008-05-25', ['nasa-phoenix']),
    end: v('2008-11-02', ['nasa-phoenix']),
    status: v('ended', ['nasa-phoenix']),
    milestones: [
      { date: '2007-08-04', title: 'Launch', description: 'Phoenix launched.', sources: ['nasa-phoenix', MC], kind: 'launch' },
      { date: '2008-05-25', title: 'Landing in Vastitas Borealis', description: 'Phoenix landed in the arctic plains of Mars.', sources: ['nasa-phoenix'], kind: 'landing' },
      { date: '2008-11-02', title: 'End of mission', description: 'The Phoenix mission ended.', sources: ['nasa-phoenix'], kind: 'end' },
    ] as Milestone[],
  },
  {
    ...mars('msl-curiosity', 'Mars Science Laboratory (Curiosity)', '2011-11-26', ['rover'], [-4.59, 137.44], 'Seelos et al. 2014 (via PDS ODE), MSL Gale landing site', 'Mars rover exploring the rock record of Gale crater from a time when Mars could have been home to microbial life.'),
    landing: v('2012-08-06', ['nasa-msl-curiosity'], 'date as given on the NASA mission page'),
    status: v('operating', ['nasa-msl-curiosity'], 'NASA labels it "Active Mission"'),
    milestones: [
      { date: '2011-11-26', title: 'Launch', description: 'Curiosity launched.', sources: ['nasa-msl-curiosity', MC], kind: 'launch' },
      { date: '2012-08-06', title: 'Landing in Gale crater', description: 'Curiosity landed in Gale crater.', sources: ['nasa-msl-curiosity'], kind: 'landing' },
    ] as Milestone[],
  },
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

/** Mars ORBITERS (never placed on the surface): sourced key dates and status from their NASA mission pages */
function orbiter(id: string, name: string, src: string, launch: string, arrival: string, status: Mission['status'], summary: string, end: Mission['end'] | null, extra: Milestone[] = []): Mission {
  return {
    id,
    name,
    agency: 'NASA',
    partners: [],
    nasaMission: true,
    classes: ['orbiter'],
    target: 'mars',
    launch: v(launch, [src]),
    arrival: v(arrival, [src], 'Mars orbit insertion'),
    ...(end ? { end } : {}),
    status,
    summary,
    milestones: [
      { date: launch, title: 'Launch', description: `${name} launched.`, sources: [src], kind: 'launch' },
      { date: arrival, title: 'Mars orbit insertion', description: `${name} entered orbit around Mars.`, sources: [src], kind: 'orbit-insertion' },
      ...extra,
    ],
    objectIds: [],
    trajectory: { kind: 'none', note: 'Orbital mission: not placed on the surface; trajectory not reconstructed yet.' },
    lastResearchUpdate: '2026-11-10',
  }
}

MARS_MISSIONS.push(
  orbiter('mariner-9', 'Mariner 9', 'nasa-mariner-9', '1971-05-30T22:23:04Z', '1971-11-14', v('ended', ['nasa-mariner-9']), 'The first spacecraft to orbit another planet (Mars).', v('1972-10-27T22:32:00Z', ['nasa-mariner-9'], 'last contact, when the attitude-control gas ran out'), [
    { date: '1972-10-27T22:32:00Z', title: 'Last contact', description: 'Mariner 9 ran out of the gaseous nitrogen it used for attitude control; last contact.', sources: ['nasa-mariner-9'], kind: 'last-contact' },
  ]),
  orbiter('mars-global-surveyor', 'Mars Global Surveyor', 'nasa-mgs', '1996-11-07', '1997-09-12', v('lost', ['nasa-mgs'], 'went silent in November 2006'), 'Mars orbiter that sent images and other data until it went silent in November 2006.', v('2006-11-14', ['nasa-mgs']), [
    { date: '2006-11-14', title: 'End of mission', description: 'Mars Global Surveyor went silent in November 2006; the mission ended.', sources: ['nasa-mgs'], kind: 'end' },
  ]),
  orbiter('mars-odyssey', '2001 Mars Odyssey', 'nasa-odyssey', '2001-04-07', '2001-10-24', v('operating', ['nasa-odyssey'], 'NASA labels it "Active Mission" (2001 - ongoing)'), 'Long-lived Mars orbiter; it also relays data from surface missions.', null),
  orbiter('mro', 'Mars Reconnaissance Orbiter', 'nasa-mro', '2005-08-12', '2006-03-10', v('operating', ['nasa-mro'], 'NASA labels it "Active Mission" (2006 - ongoing)'), 'Mars orbiter carrying HiRISE, the camera whose stereo images produced the Victoria crater terrain in this app.', null),
  orbiter('maven', 'MAVEN', 'nasa-maven', '2013-11-18', '2014-09-21', v('lost', ['nasa-maven'], 'contact lost Dec. 6, 2025; end of mission declared June 3, 2026; a review board found it not recoverable'), 'Mars orbiter that studied the upper atmosphere.', v('2026-06-03', ['nasa-maven'], 'end of mission declared'), [
    { date: '2025-12-06', title: 'Contact lost', description: 'Contact with MAVEN was lost.', sources: ['nasa-maven'], kind: 'last-contact' },
    { date: '2026-06-03', title: 'End of mission declared', description: 'NASA declared the end of the mission; a review board found the spacecraft is not recoverable.', sources: ['nasa-maven'], kind: 'end' },
  ]),
)

export const MARS_OBJECTS: PhysicalObject[] = [
  {
    id: 'opportunity-rover',
    missionId: 'mer-opportunity',
    name: 'Opportunity rover',
    category: 'rover',
    builtBy: 'NASA JPL',
    nasaHardware: true,
    dimensions: v('1.54 m tall with the Pancam mast deployed; 2.25 m wide and 1.51 m long at the solar panels; wheelbase 1.41 m × 1.22 m', ['pds-mer-insthost'], 'PDS gives these as approximate'),
    massKg: c(185, ['nasa-opportunity'], [{ value: 180, sources: ['pds-mer-insthost'] }], 'NASA\'s mission page gives 185 kg (rover only; whole spacecraft 1,062 kg); the PDS instrument-host description gives 180 kg "including the science package"'),
    design: 'Solar-powered, six-wheel-drive, four-wheel-steered Mars Exploration Rover (twin of Spirit) carrying the Athena science payload on a camera mast and a five-joint robotic arm.',
    // from mission-data/missions/mer-opportunity/components.json (every description is the sourced "function" text)
    components: [
      { id: 'merb-pma', name: 'Pancam Mast Assembly', description: 'Mast carrying the remote-sensing instruments 1.54 m above the ground, with azimuth and elevation actuators for targeted views and full panoramas.', sources: ['pds-mer-insthost'] },
      { id: 'merb-pancam', name: 'Panoramic Camera (Pancam)', description: 'Stereo multispectral panoramic camera on the mast.', sources: ['pds-mer-insthost', 'nasa-opportunity'] },
      { id: 'merb-navcam', name: 'Navigation cameras (Navcam)', description: 'Navigation cameras on the mast.', sources: ['nasa-opportunity'] },
      { id: 'merb-minites', name: 'Mini-TES spectrometer', description: 'Miniature Thermal Emission Spectrometer: a thermal-infrared spectrometer viewing the terrain from the top of the mast.', sources: ['pds-mer-insthost', 'nasa-opportunity'] },
      { id: 'merb-solar-array', name: 'Solar array', description: '30 strings of triple-junction cells (GaInP / GaAs / Ge) covering 1.3 m², producing about 800–900 Wh per sol at the start of the mission and about 600 Wh per sol by sol 90 (season and dust).', sources: ['pds-mer-insthost'] },
      { id: 'merb-batteries', name: 'Lithium-ion batteries', description: 'Two 8 Ah rechargeable lithium-ion batteries (over 400 Wh) for peak loads, night-time operations and survival heating. Inside the Warm Electronics Box: not visible on the exterior model.', sources: ['pds-mer-insthost'] },
      { id: 'merb-mobility', name: 'Rocker-bogie suspension and wheels', description: 'Rocker-bogie suspension crossing obstacles about one wheel diameter in size; each of the six 26 cm wheels independently driven, four of them steered; turns in place in 1.9 m; top speed 5 cm/s on flat ground, about 1 cm/s average under autonomous hazard avoidance.', sources: ['pds-mer-insthost'] },
      { id: 'merb-idd', name: 'Robotic arm (Instrument Deployment Device)', description: 'Five-degree-of-freedom arm placing four in-situ tools on rocks and soils: the Alpha Particle X-ray Spectrometer, the Mössbauer spectrometer, the Microscopic Imager and the Rock Abrasion Tool, which ground away rock surfaces to expose fresh interiors.', sources: ['pds-mer-insthost', 'nasa-opportunity'] },
      { id: 'merb-telecom', name: 'Antennas (high-gain, low-gain, UHF)', description: 'Direct-to-Earth X-band through a steerable high-gain antenna (up to 28.8 kbps to a 70 m DSN station early on) and a low-gain antenna; UHF relay through Mars orbiters at up to 256 kbps.', sources: ['pds-mer-insthost'] },
      { id: 'merb-web', name: 'Warm Electronics Box', description: 'Honeycomb composite box insulated with 2.5 cm of opacified aerogel; radioisotope heater units, electronics waste heat and survival heaters keep the electronics between −40 and +50 °C while outside temperatures range from 0 to −97 °C.', sources: ['pds-mer-insthost'] },
      { id: 'merb-avionics', name: 'Flight computer', description: '20 MHz 32-bit RAD6000 processor with 128 MB DRAM and 256 MB flash; it could drive up to 10 of the rover\'s 35 motors at once. Inside the Warm Electronics Box: not visible on the exterior model.', sources: ['pds-mer-insthost'] },
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
