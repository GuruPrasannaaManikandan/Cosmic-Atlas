import type { Mission, PhysicalObject } from '../schema'
import { v, u, ME_DE421, LROC_ME, moonPos } from './facts'

const SITES = 'nssdca-apollo-sites'
const LROC = 'lroc-2016-coords'
const LAND = 'nssdca-apollo-landings'
const CHRONO = 'nssdca-chronology'

/** a standard Apollo landing record from the NSSDCA tables (launch + landing date, site, EVA, samples) */
function apollo(n: number, o: {
  launch: string
  landing: string
  site: string
  lm: [number, number, number, number]
  eva: number
  traverse: string
  samples: number
  objectIds: string[]
}): Mission {
  return {
    id: `apollo-${n}`,
    name: `Apollo ${n}`,
    agency: 'NASA',
    partners: [],
    nasaMission: true,
    classes: ['crewed-landing'],
    target: 'moon',
    launch: v(o.launch, [LAND, CHRONO]),
    landing: v(o.landing, [LAND], 'date only: the landing time of day is not in the sources read yet'),
    end: u('splashdown date not yet sourced for this mission'),
    status: v('completed', [CHRONO]),
    landingSite: v(moonPos(o.lm[0], o.lm[1], LROC_ME, o.lm[2], o.lm[3]), [LROC, SITES], `Lunar Module position; site: ${o.site}`),
    summary: `Crewed lunar landing at ${o.site}. ${o.eva} h of EVA, ${o.traverse} km of traverses, ${o.samples} kg of samples returned (NSSDCA).`,
    milestones: [
      { date: o.launch, title: 'Launch', description: `Apollo ${n} launched from Kennedy Space Center.`, sources: [LAND], kind: 'launch' },
      { date: o.landing, title: `Landing at ${o.site}`, description: `The Lunar Module landed at ${o.site}.`, sources: [LAND], kind: 'landing' },
    ],
    objectIds: o.objectIds,
    trajectory: { kind: 'none', note: 'Earth–Moon transfer trajectory not reconstructed yet (Phase 6).' },
    lastResearchUpdate: '2026-11-09',
  }
}

export const MOON_MISSIONS: Mission[] = [
  {
    id: 'apollo-11',
    name: 'Apollo 11',
    agency: 'NASA',
    partners: [],
    nasaMission: true,
    classes: ['crewed-landing'],
    target: 'moon',
    launch: v('1969-07-16T13:32:00Z', ['nssdca-a11-csm', LAND, 'nasa-apollo11'], 'Saturn V SA-504 from pad 39A, Kennedy Space Center'),
    landing: v('1969-07-20T20:17:40Z', ['nssdca-a11-lm', LAND]),
    end: v('1969-07-24T16:50:35Z', ['nssdca-a11-csm', 'nasa-apollo11'], 'splashdown in the Pacific Ocean; recovery ship USS Hornet'),
    status: v('completed', ['nasa-apollo11']),
    landingSite: v(moonPos(0.67416, 23.47314, LROC_ME, -1926, 0.3), [LROC, SITES, 'nssdca-a11-lm'], 'Tranquility Base, Mare Tranquilitatis (Lunar Module position)'),
    actualDuration: v('21 h 36 min on the lunar surface; one EVA of about 2.5 h', ['nssdca-a11-lm', LAND], 'EVA 02:56:15–05:11:13 UT per NSSDCA; the landings table lists 2.53 h EVA time'),
    summary:
      'First crewed lunar landing. Neil Armstrong (Commander) and Edwin "Buzz" Aldrin (Lunar Module Pilot) landed the Lunar Module in the Sea of Tranquility while Michael Collins (Command Module Pilot) stayed in lunar orbit. They collected 21.55 kg of rock and soil and left the descent stage, the EASEP seismic station and a laser retroreflector behind.',
    milestones: [
      { date: '1969-07-16T13:32:00Z', title: 'Launch', description: 'Saturn V SA-504 lifted off from pad 39A at Kennedy Space Center.', sources: ['nssdca-a11-csm'], kind: 'launch' },
      { date: '1969-07-20T20:17:40Z', title: 'Landing at Tranquility Base', description: 'The Lunar Module landed in Mare Tranquilitatis: "Houston, Tranquility Base here — the Eagle has landed."', sources: ['nssdca-a11-lm', 'nssdca-a11-csm'], kind: 'landing' },
      { date: '1969-07-21T02:56:15Z', title: 'First step on the Moon', description: 'Neil Armstrong stepped onto the lunar surface; Buzz Aldrin followed 19 minutes later.', sources: ['nssdca-a11-csm'], kind: 'surface-op' },
      { date: '1969-07-21T04:40:39Z', title: 'Seismometer switched on', description: 'The EASEP passive seismic station was turned on.', sources: ['nssdca-a11-lm'], kind: 'surface-op' },
      { date: '1969-07-21T05:11:13Z', title: 'Moonwalk ends', description: 'The astronauts returned to the Lunar Module.', sources: ['nssdca-a11-csm'], kind: 'surface-op' },
      { date: '1969-07-21T17:54:01Z', title: 'Lift-off from the Moon', description: 'The ascent stage lifted off after 21 h 36 min on the surface, leaving the descent stage behind as its launch platform.', sources: ['nssdca-a11-lm'], kind: 'other' },
      { date: '1969-07-24T16:50:35Z', title: 'Splashdown', description: 'Apollo 11 splashed down in the Pacific Ocean.', sources: ['nssdca-a11-csm'], kind: 'end' },
      { date: '1969-08-03T10:58:46Z', title: 'Seismometer goes quiet for the night', description: 'EASEP stopped transmitting before local sunset as its solar power dropped.', sources: ['nssdca-a11-lm'], kind: 'surface-op' },
      { date: '1969-08-27', title: 'Seismometer stops answering', description: 'EASEP no longer accepted commands from Earth and the experiment was ended.', sources: ['nssdca-a11-lm'], kind: 'last-contact' },
    ],
    objectIds: ['a11-lm-descent', 'a11-easep-pse', 'a11-lrrr'],
    trajectory: { kind: 'none', note: 'Earth–Moon transfer not reconstructed yet (Phase 6, JPL Horizons / SPICE where available).' },
    lastResearchUpdate: '2026-11-09',
  },
  apollo(12, { launch: '1969-11-14', landing: '1969-11-19', site: 'Oceanus Procellarum', lm: [-3.0128, 336.5781, -1422, 2.2], eva: 7.75, traverse: '1.35', samples: 34.35, objectIds: ['a12-lm-descent', 'a12-alsep'] }),
  apollo(14, { launch: '1971-01-31', landing: '1971-02-05', site: 'Fra Mauro', lm: [-3.64589, 342.52806, -1062, 0.4], eva: 9.38, traverse: '3.45', samples: 42.28, objectIds: ['a14-lm-descent', 'a14-alsep', 'a14-lrrr'] }),
  apollo(15, { launch: '1971-07-26', landing: '1971-07-30', site: 'Hadley Rille', lm: [26.13239, 3.6333, -1931, 1.0], eva: 19.13, traverse: '27.9', samples: 77.31, objectIds: ['a15-lm-descent', 'a15-alsep', 'a15-lrrr', 'a15-lrv'] }),
  apollo(16, { launch: '1972-04-16', landing: '1972-04-20', site: 'Descartes', lm: [-8.9734, 15.5011, 8, 3.0], eva: 20.23, traverse: '27 (value truncated on the source page)', samples: 95.71, objectIds: ['a16-lm-descent', 'a16-alsep', 'a16-lrv'] }),
  apollo(17, { launch: '1972-12-07', landing: '1972-12-11', site: 'Taurus-Littrow', lm: [20.1911, 30.7723, -2626, 3.5], eva: 22.07, traverse: '35 (value truncated on the source page)', samples: 110.52, objectIds: ['a17-lm-descent', 'a17-alsep', 'a17-lrv', 'a17-sep'] }),
  {
    id: 'chandrayaan-3',
    name: 'Chandrayaan-3',
    agency: 'ISRO',
    partners: [{ agency: 'NASA', role: 'provided the passive Laser Retroreflector Array (LRA) on the lander' }],
    nasaMission: false,
    nonNasaNote: 'ISRO (India) mission, included as a clearly labelled non-NASA educational exception. It is not NASA hardware; only the small LRA retroreflector on the lander came from NASA.',
    classes: ['lander', 'rover'],
    target: 'moon',
    launch: v('2023-07-14', ['isro-ch3', CHRONO], 'LVM3 M4 from SDSC-SHAR, Sriharikota (scheduled 14:35 IST)'),
    landing: v('2023-08-23', ['isro-ch3'], 'date only: ISRO gives the powered-descent start (~17:45 IST) but the touchdown time was not on the pages read'),
    status: v('ended', ['isro-ch3'], 'lander and rover put into sleep mode on 4 Sept 2023; ISRO reported efforts to re-establish contact from 22 Sept 2023 — the outcome is not stated on the pages read'),
    landingSite: u('ISRO gives only the planned prime site (4 km × 2.4 km at 69.367621°S, 32.348126°E); the measured landing position has not been sourced yet'),
    plannedDuration: v('one lunar day (~14 Earth days)', ['isro-ch3-details']),
    summary: 'India\'s lunar south-polar lander and rover. The lander module (1752 kg including a 26 kg rover) soft-landed on 23 August 2023; the rover carried APXS and LIBS spectrometers.',
    milestones: [
      { date: '2023-07-14', title: 'Launch', description: 'LVM3 M4 launched Chandrayaan-3 into orbit.', sources: ['isro-ch3'], kind: 'launch' },
      { date: '2023-08-23', title: 'Soft landing', description: 'Chandrayaan-3 soft-landed on the Moon.', sources: ['isro-ch3'], kind: 'landing' },
      { date: '2023-09-04', title: 'Sleep mode', description: 'The lander and rover were put into sleep mode, awaiting sunrise around 22 Sept 2023.', sources: ['isro-ch3'], kind: 'surface-op' },
      { date: '2023-09-22', title: 'Wake-up attempts', description: 'ISRO reported efforts to establish communication with the lander and rover.', sources: ['isro-ch3'], kind: 'last-contact' },
    ],
    objectIds: ['ch3-lander', 'ch3-rover'],
    trajectory: { kind: 'none', note: 'Not reconstructed.' },
    lastResearchUpdate: '2026-11-09',
  },
]

const lmDescent = (n: number, pos: [number, number, number, number]): PhysicalObject => ({
  id: `a${n}-lm-descent`,
  missionId: `apollo-${n}`,
  name: `Apollo ${n} Lunar Module descent stage`,
  category: 'lunar-module-descent-stage',
  builtBy: 'NASA (prime contractor not yet sourced)',
  nasaHardware: true,
  dimensions: n === 11 ? v('octagonal prism 4.2 m across and 1.7 m thick; 1.5 m above the surface on its legs; 9.4 m between opposite footpads; ~1 m conical engine skirt', ['nssdca-a11-lm']) : u('not yet sourced for this mission (the later J-mission descent stages differ from Apollo 11)'),
  massKg: n === 11 ? v(2034, ['nssdca-a11-lm'], 'dry mass at launch including stowed surface equipment; the mass left on the Moon is lower and not stated') : u('not yet sourced'),
  design: 'The descent stage held the landing engine, propellant tanks, water, oxygen and helium tanks and stowed surface equipment. Four legs with round footpads; one leg carried the egress platform and ladder. It stayed on the Moon as the launch platform for the ascent stage.',
  components: [
    { id: 'legs', name: 'Landing legs and footpads', description: 'Four legs with round footpads; 9.4 m between the ends of opposite footpads (Apollo 11).', sources: ['nssdca-a11-lm'] },
    { id: 'ladder', name: 'Egress platform and ladder', description: 'Mounted on one landing leg; the astronauts climbed down it to the surface.', sources: ['nssdca-a11-lm'] },
    { id: 'engine', name: 'Descent engine', description: 'Deep-throttling ablative rocket of about 45,000 N maximum thrust on a gimbal ring; a one-metre conical skirt protrudes below the stage.', sources: ['nssdca-a11-lm'] },
    { id: 'body', name: 'Octagonal descent stage', description: 'Octagonal prism 4.2 m across and 1.7 m thick holding the propellant tanks and stowed equipment.', sources: ['nssdca-a11-lm'] },
  ],
  location: v(moonPos(pos[0], pos[1], LROC_ME, pos[2], pos[3]), [LROC, SITES]),
  currentStatus: v('on the lunar surface, imaged by the Lunar Reconnaissance Orbiter', [LROC]),
  model: { id: 'lm-descent-stage', provenance: n === 11 ? "Official NASA 3D Resources Apollo Lunar Module model with the ascent stage removed (it lifted off on 21 July 1969); its legs are stylised: footpad span 6.43 m vs NSSDCA's 9.4 m (about a third short); choose the dimension-accurate reconstruction for true proportions. Heading is approximate (ladder facing west, from crew photographs). A procedural reconstruction is shown while it loads." : `Official NASA 3D Resources Apollo Lunar Module model (an Apollo 11-era LM) with the ascent stage removed. ${n >= 15 ? 'The extended J-mission descent stage (Apollo 15-17) and its LRV bay are not modelled. ' : ''}Heading is not sourced.` },
  sources: [LROC, SITES, ...(n === 11 ? ['nssdca-a11-lm'] : [])],
})

const simple = (id: string, mission: string, name: string, category: PhysicalObject['category'], pos: [number, number, number?, number?], datum: string, src: string[], design: string, model: PhysicalObject['model'] = { id: null, provenance: 'No model yet - shown as a position marker.' }, extra: Partial<PhysicalObject> = {}): PhysicalObject => ({
  id,
  missionId: mission,
  name,
  category,
  builtBy: 'NASA',
  nasaHardware: true,
  dimensions: u('not yet sourced'),
  massKg: u('not yet sourced'),
  design,
  components: [],
  location: v(moonPos(pos[0], pos[1], datum, pos[2], pos[3]), src),
  currentStatus: v('on the lunar surface', src),
  model,
  sources: src,
  ...extra,
})

const ALSEP_MODEL = { id: 'alsep-central', provenance: 'Procedural reconstruction of the ALSEP central station (25 kg box with a sunshield and a 58 cm axial-helical antenna, NSSDCA). Box and sunshield dimensions are approximate. The SNAP-27 RTG and the instruments are not placed: their positions are not sourced.' }
const ALSEP_FACTS = (n: number): Partial<PhysicalObject> => ({
  massKg: v(25, ['nssdca-a15-lm-alsep'], 'central station (NSSDCA Apollo 15 record; same ALSEP design)'),
  dimensions: v('central station: a 25 kg box with a stowed volume of 34,800 cm3; 58 cm long, 3.8 cm diameter axial-helical antenna', ['nssdca-a15-lm-alsep']),
  design: 'Apollo Lunar Surface Experiments Package: a central station that collected data from the experiments laid out around it and radioed it to Earth, powered by a SNAP-27 radioisotope thermoelectric generator (about 70 W).',
  components: [
    { id: 'antenna', name: 'Axial-helical antenna', description: '58 cm long, 3.8 cm diameter antenna pointed at Earth.', sources: ['nssdca-a15-lm-alsep'] },
    { id: 'station', name: 'Central station', description: 'Received commands and sent the experiments\' data to Earth.', sources: ['nssdca-a15-lm-alsep'] },
  ],
  currentStatus: v('switched off on 30 September 1977', ['nssdca-a15-lm-alsep'], n === 15 ? 'NSSDCA: shut down along with the other ALSEP stations' : 'NSSDCA (Apollo 15 record): all ALSEP stations were shut down together on this date'),
})
const LRV_MODEL = { id: 'lrv', provenance: 'Procedural reconstruction built to NSSDCA dimensions (3.1 m frame, 2.3 m wheelbase, 1.14 m height, 81.8 cm x 23 cm wire-mesh wheels, two seats, T-handle controller, mesh dish antenna on a front mast). Track width, seat and console shapes are approximate.' }
const LRV_FACTS = (km: number): Partial<PhysicalObject> => ({
  massKg: v(210, ['nssdca-lrv']),
  dimensions: v('frame 3.1 m long; wheelbase 2.3 m; maximum height 1.14 m; wheels 81.8 cm diameter, 23 cm wide; ground clearance 36 cm loaded', ['nssdca-lrv']),
  design: `Battery-powered electric car that folded into the Lunar Module for the trip. Each wheel had its own motor; the crew steered with a T-shaped hand controller. On this mission it was driven ${km} km (NSSDCA).`,
  components: [
    { id: 'wheels', name: 'Wire-mesh wheels', description: '81.8 cm tyres of woven zinc-coated steel strands with titanium chevrons for grip; no air inside.', sources: ['nssdca-lrv'] },
    { id: 'controls', name: 'Hand controller and seats', description: 'Two foldable seats; a T-shaped hand controller between them for drive, steering and brakes.', sources: ['nssdca-lrv'] },
    { id: 'antenna', name: 'High-gain antenna', description: 'A large mesh dish antenna on a mast at the front centre of the rover.', sources: ['nssdca-lrv'] },
    { id: 'chassis', name: 'Folding chassis', description: 'A three-part aluminium chassis hinged so it could fold up into the Lunar Module.', sources: ['nssdca-lrv'] },
  ],
  builtBy: 'NASA (prime contractor not yet sourced)',
})

export const MOON_OBJECTS: PhysicalObject[] = [
  lmDescent(11, [0.67416, 23.47314, -1926, 0.3]),
  {
    id: 'a11-easep-pse',
    missionId: 'apollo-11',
    name: 'EASEP passive seismic station',
    category: 'surface-experiment',
    builtBy: 'NASA',
    nasaHardware: true,
    dimensions: u('overall dimensions not given by NSSDCA; the model uses approximate proportions'),
    massKg: v(48, ['nssdca-a11-lm'], 'total mass of the EASEP unit'),
    design: 'A square base carrying the seismometer and a dust detector, two canted rectangular solar panels, an antenna mast and an isotope heater.',
    components: [
      { id: 'seismometer', name: 'Passive seismometer', description: 'Measured seismic activity (moonquakes and meteorite impacts) and transmitted the data to Earth.', sources: ['nssdca-a11-lm'] },
      { id: 'solar-panels', name: 'Solar panels', description: 'Two canted rectangular solar panels powered the station during the lunar day.', sources: ['nssdca-a11-lm'] },
      { id: 'antenna', name: 'Antenna mast', description: 'Sent the measurements back to Earth.', sources: ['nssdca-a11-lm'] },
      { id: 'dust-detector', name: 'Lunar dust detector', description: 'Measured dust accumulation (NSSDCA experiment 1969-059C-05).', sources: ['nssdca-a11-lm'] },
    ],
    location: v(moonPos(0.67322, 23.47315, LROC_ME, -1928, 0.4), [LROC], 'LROC "Apollo 11 PSE" position; NSSDCA text describes it as about 17 m south of the LM, the LRO measurement gives ~28 m'),
    currentStatus: v('inactive since 27 August 1969, when it stopped accepting commands', ['nssdca-a11-lm']),
    model: { id: 'easep-pse', provenance: 'Procedural reconstruction from the NSSDCA description (square base, two canted solar panels, antenna mast). Dimensions are approximate — no sourced measurements yet.' },
    sources: ['nssdca-a11-lm', LROC],
  },
  {
    id: 'a11-lrrr',
    missionId: 'apollo-11',
    name: 'Laser Ranging Retroreflector',
    category: 'retroreflector',
    builtBy: 'NASA (PI: C. O. Alley, University of Maryland)',
    nasaHardware: true,
    dimensions: u('panel size not given by NSSDCA; the model uses approximate proportions'),
    massKg: v(77, ['nssdca-a11-lrrr'], 'as stated on the NSSDCA experiment page'),
    design: 'An array of fused-silica corner cubes on a folding support structure used to aim and align the array toward Earth. It needs no power.',
    components: [
      { id: 'array', name: 'Corner-cube array', description: 'Cubes of fused silica that reflect light straight back to where it came from.', sources: ['nssdca-a11-lrrr'] },
      { id: 'support', name: 'Folding support', description: 'Aimed and aligned the array toward Earth.', sources: ['nssdca-a11-lrrr'] },
    ],
    location: v(moonPos(0.67345, 23.47307, ME_DE421), [SITES], 'NSSDCA also describes it as about 5 m NNW of the EASEP, consistent with these coordinates'),
    currentStatus: v('on the lunar surface; passive (needs no power)', ['nssdca-a11-lrrr', 'nssdca-a11-lm']),
    model: { id: 'lrrr', provenance: 'Procedural reconstruction from the NSSDCA description (corner-cube array on a tilted folding support). Dimensions approximate.' },
    sources: ['nssdca-a11-lrrr', SITES],
  },
  lmDescent(12, [-3.0128, 336.5781, -1422, 2.2]),
  simple('a12-alsep', 'apollo-12', 'Apollo 12 ALSEP central station', 'surface-experiment', [-3.0098, 336.5751, -1422, 2.2], LROC_ME, [LROC, SITES], 'Apollo Lunar Surface Experiments Package.', ALSEP_MODEL, ALSEP_FACTS(12)),
  lmDescent(14, [-3.64589, 342.52806, -1062, 0.4]),
  simple('a14-alsep', 'apollo-14', 'Apollo 14 ALSEP central station', 'surface-experiment', [-3.64419, 342.52232, -1064, 0.4], LROC_ME, [LROC, SITES], 'Apollo Lunar Surface Experiments Package.', ALSEP_MODEL, ALSEP_FACTS(14)),
  simple('a14-lrrr', 'apollo-14', 'Apollo 14 Laser Ranging Retroreflector', 'retroreflector', [-3.64417, -17.47865], ME_DE421, [SITES], 'Passive corner-cube retroreflector array.', { id: 'lrrr', provenance: 'Same procedural retroreflector as Apollo 11 (approximate; the Apollo 14 array size and cube count are not yet sourced).' }),
  lmDescent(15, [26.13239, 3.6333, -1931, 1.0]),
  simple('a15-alsep', 'apollo-15', 'Apollo 15 ALSEP central station', 'surface-experiment', [26.13406, 3.62991, -1924, 0.5], LROC_ME, [LROC, SITES], 'Apollo Lunar Surface Experiments Package.', ALSEP_MODEL, { ...ALSEP_FACTS(15), sources: [LROC, SITES, 'nssdca-a15-lm-alsep'] }),
  simple('a15-lrrr', 'apollo-15', 'Apollo 15 Laser Ranging Retroreflector', 'retroreflector', [26.13341, 3.6285], ME_DE421, [SITES], 'Passive corner-cube retroreflector array.', { id: 'lrrr', provenance: 'Same procedural retroreflector as Apollo 11 (approximate; the larger Apollo 15 array is not yet sourced).' }),
  simple('a15-lrv', 'apollo-15', 'Apollo 15 Lunar Roving Vehicle', 'roving-vehicle', [26.13174, 3.63803, -1928, 0.5], LROC_ME, [LROC, 'nssdca-lrv'], 'Lunar Roving Vehicle, parked at its final position.', LRV_MODEL, LRV_FACTS(27.8)),
  lmDescent(16, [-8.9734, 15.5011, 8, 3.0]),
  simple('a16-alsep', 'apollo-16', 'Apollo 16 ALSEP central station', 'surface-experiment', [-8.9759, 15.4986, 12, 3.0], LROC_ME, [LROC, SITES], 'Apollo Lunar Surface Experiments Package.', ALSEP_MODEL, ALSEP_FACTS(16)),
  simple('a16-lrv', 'apollo-16', 'Apollo 16 Lunar Roving Vehicle', 'roving-vehicle', [-8.9729, 15.5037, 10, 3.7], LROC_ME, [LROC, 'nssdca-lrv'], 'Lunar Roving Vehicle, parked at its final position.', LRV_MODEL, LRV_FACTS(26.7)),
  lmDescent(17, [20.1911, 30.7723, -2626, 3.5]),
  simple('a17-alsep', 'apollo-17', 'Apollo 17 ALSEP central station', 'surface-experiment', [20.1923, 30.7655, -2622, 3.5], LROC_ME, [LROC, SITES], 'Apollo Lunar Surface Experiments Package.', ALSEP_MODEL, ALSEP_FACTS(17)),
  simple('a17-lrv', 'apollo-17', 'Apollo 17 Lunar Roving Vehicle', 'roving-vehicle', [20.1896, 30.7769, -2628, 3.2], LROC_ME, [LROC, 'nssdca-lrv'], 'Lunar Roving Vehicle, parked at its final position.', LRV_MODEL, LRV_FACTS(35.9)),
  simple('a17-sep', 'apollo-17', 'Apollo 17 Surface Electrical Properties experiment', 'surface-experiment', [20.192, 30.7768, -2627, 3.7], LROC_ME, [LROC], 'LROC lists it as "Apollo 17 SEP".'),
  {
    id: 'ch3-lander',
    missionId: 'chandrayaan-3',
    name: 'Vikram lander (Chandrayaan-3) — ISRO, not NASA',
    category: 'lander',
    builtBy: 'ISRO',
    nasaHardware: false,
    dimensions: u('not on the ISRO pages read'),
    massKg: v(1752, ['isro-ch3-details'], 'lander module including the 26 kg rover'),
    design: 'Lander module carrying the rover; payloads RAMBHA-LP, ChaSTE, ILSA and NASA\'s passive Laser Retroreflector Array (LRA). Power 738 W.',
    components: [],
    location: u('measured landing position not sourced yet (ISRO page gives only the planned prime site)'),
    currentStatus: v('in sleep mode since 4 Sept 2023; outcome of later wake-up attempts not stated on the pages read', ['isro-ch3']),
    model: { id: null, provenance: 'No model yet.' },
    sources: ['isro-ch3-details', 'isro-ch3'],
  },
  {
    id: 'ch3-rover',
    missionId: 'chandrayaan-3',
    name: 'Pragyan rover (Chandrayaan-3) — ISRO, not NASA',
    category: 'rover',
    builtBy: 'ISRO',
    nasaHardware: false,
    dimensions: u('not on the ISRO pages read'),
    massKg: v(26, ['isro-ch3-details']),
    design: 'Rover carrying an Alpha Particle X-ray Spectrometer (APXS) and a Laser-Induced Breakdown Spectroscope (LIBS); power 50 W. The ISRO pages read call it "Chandrayaan-3 Rover"; the name Pragyan is pending a source.',
    components: [],
    location: u('rover traverse and final position not sourced yet'),
    currentStatus: v('in sleep mode since 4 Sept 2023; outcome of later wake-up attempts not stated on the pages read', ['isro-ch3']),
    model: { id: null, provenance: 'No model yet.' },
    sources: ['isro-ch3-details', 'isro-ch3'],
  },
]
