import type { Mission, MissionClass, PhysicalObject } from '../schema'
import { v, u, c } from './facts'

const CH = 'nssdca-chronology'

/** a mission known so far only from the NSSDCA chronology row (launch date + type) */
function row(id: string, name: string, launch: string, target: string, classes: MissionClass[], type: string): Mission {
  return {
    id,
    name,
    agency: 'NASA',
    partners: [],
    nasaMission: true,
    classes,
    target,
    launch: v(launch, [CH]),
    status: u('current status not yet sourced'),
    summary: `${type} (NSSDCA chronology).`,
    milestones: [{ date: launch, title: 'Launch', description: `${name} launched — ${type}.`, sources: [CH], kind: 'launch' }],
    objectIds: [],
    trajectory: { kind: 'none', note: 'Not reconstructed yet (Phase 6: JPL Horizons spacecraft ephemeris where available).' },
    lastResearchUpdate: '2026-11-09',
  }
}

export const DEEP_SPACE_MISSIONS: Mission[] = [
  {
    id: 'cassini',
    name: 'Cassini',
    agency: 'NASA',
    partners: [
      { agency: 'ESA', role: 'built the Huygens probe' },
      { agency: 'ASI', role: 'partner agency (Italian Space Agency)' },
    ],
    nasaMission: true,
    classes: ['orbiter'],
    target: 'saturn',
    launch: v('1997-10-15', ['nasa-cassini', CH]),
    arrival: v('2004-06-30', ['nasa-cassini'], 'Saturn orbit insertion, June 30, 2004 (PDT) — 1 July in UTC'),
    end: v('2017-09-15', ['nasa-cassini'], 'final plunge into Saturn'),
    status: v('ended', ['nasa-cassini']),
    summary: 'Joint NASA–ESA–ASI mission; the first spacecraft to orbit Saturn. Completed 294 orbits and 162 targeted moon flybys, released ESA\'s Huygens probe to Titan and ended with 22 Grand Finale orbits and a plunge into Saturn.',
    milestones: [
      { date: '1997-10-15', title: 'Launch', description: 'Cassini launched carrying ESA\'s Huygens probe.', sources: ['nasa-cassini'], kind: 'launch' },
      { date: '2004-06-30', title: 'Saturn orbit insertion', description: 'Cassini entered orbit around Saturn (June 30, 2004 PDT).', sources: ['nasa-cassini'], kind: 'orbit-insertion' },
      { date: '2005-01', title: 'Huygens lands on Titan', description: 'ESA\'s Huygens probe parachuted to the surface of Titan.', sources: ['nasa-cassini'], kind: 'landing' },
      { date: '2017-04', title: 'Grand Finale begins', description: 'Cassini began 22 orbits diving between Saturn and its innermost ring (NASA also describes late 2016 as the start of the finale orbits).', sources: ['nasa-cassini'], kind: 'other' },
      { date: '2017-09-15', title: 'End of mission', description: 'Cassini made its final approach and plunged into Saturn\'s atmosphere.', sources: ['nasa-cassini'], kind: 'end' },
    ],
    objectIds: [],
    trajectory: { kind: 'none', reference: 'JPL Horizons spacecraft -82 (planned)', note: 'Venus, Earth and Jupiter gravity-assist dates not yet sourced; the cruise is not reconstructed yet (Phase 6).' },
    lastResearchUpdate: '2026-11-09',
  },
  {
    id: 'huygens',
    name: 'Huygens',
    agency: 'ESA',
    partners: [{ agency: 'NASA', role: 'carried to Saturn by NASA\'s Cassini orbiter (joint NASA–ESA–ASI mission)' }],
    nasaMission: false,
    nonNasaNote: 'Huygens was built by ESA. It flew as part of the joint NASA–ESA–ASI Cassini-Huygens mission and is shown here because of that collaboration — it is not NASA hardware.',
    classes: ['atmospheric-probe', 'lander'],
    target: 'titan',
    launch: v('1997-10-15', ['nasa-cassini', CH]),
    landing: c('2005-01-14T11:30:00Z', ['esa-huygens-landing'], [{ value: '2005-01-14T12:34:00Z', sources: ['esa-huygens-landing'] }], "ESA's landing page says 'around 11:30 UTC'; an ESA summary gives 12:34 UTC. The date, 14 Jan 2005, is consistent."),
    status: v('ended', ['nasa-cassini']),
    landingSite: c(
      { bodyId: 'titan', latDeg: -10.573, lonEastDeg: 360 - 192.335, datum: 'west longitude 192.335° converted to east-positive' },
      ['egu2015-huygens'],
      [{ value: { bodyId: 'titan', latDeg: -10.25, lonEastDeg: 360 - 192.32, datum: 'west longitude 192.32° converted to east-positive' }, sources: ['nasa-huygens-site'] }],
      'NASA gives 10.25°S 192.32°W; a 2015 trajectory reconstruction using post-2007 radar coordinates gives 10.573°S 192.335°W',
    ),
    summary: 'ESA atmospheric probe that parachuted to the surface of Titan in January 2005 after riding to Saturn on Cassini.',
    milestones: [
      { date: '1997-10-15', title: 'Launch (on Cassini)', description: 'Huygens launched attached to Cassini.', sources: ['nasa-cassini'], kind: 'launch' },
      { date: '2005-01-14T11:30:00Z', title: 'Descent and landing on Titan', description: "Huygens parachuted through Titan's atmosphere for 2 h 27 min 50 s and landed; its surface phase lasted 1 h 10 min.", sources: ['esa-huygens-landing'], kind: 'landing' },
    ],
    objectIds: ['huygens-probe'],
    trajectory: { kind: 'none', note: 'Descent profile not reconstructed yet (Phase 5).' },
    lastResearchUpdate: '2026-11-09',
  },
  row('mariner-2', 'Mariner 2', '1962-08-27', 'venus', ['flyby'], 'Venus flyby'),
  row('mariner-4', 'Mariner 4', '1964-11-28', 'mars', ['flyby'], 'Mars flyby'),
  // Mariner 9: sourced record in catalog/mars.ts (Mars orbiters)
  row('mariner-10', 'Mariner 10', '1973-11-04', 'mercury', ['flyby'], 'Venus/Mercury flybys'),
  row('pioneer-10', 'Pioneer 10', '1972-03-03', 'jupiter', ['flyby'], 'Jupiter flyby'),
  row('pioneer-11', 'Pioneer 11', '1973-04-05', 'saturn', ['flyby'], 'Jupiter/Saturn flyby'),
  row('voyager-2', 'Voyager 2', '1977-08-20', 'neptune', ['flyby'], 'Jupiter/Saturn/Uranus/Neptune flyby'),
  row('voyager-1', 'Voyager 1', '1977-09-05', 'saturn', ['flyby'], 'Jupiter/Saturn flyby'),
  row('pioneer-venus-1', 'Pioneer Venus 1', '1978-05-20', 'venus', ['orbiter'], 'Venus orbiter'),
  row('pioneer-venus-2', 'Pioneer Venus 2', '1978-08-08', 'venus', ['atmospheric-probe'], 'Venus probes'),
  row('magellan', 'Magellan', '1989-05-04', 'venus', ['orbiter'], 'Venus orbiter'),
  row('galileo', 'Galileo', '1989-10-18', 'jupiter', ['orbiter', 'atmospheric-probe'], 'Jupiter orbiter and probe'),
  row('near', 'NEAR Shoemaker', '1996-02-17', 'eros', ['orbiter'], 'Asteroid Eros orbiter'),
  row('stardust', 'Stardust', '1999-02-07', 'comet', ['sample-return'], 'Comet coma sample return'),
  row('messenger', 'MESSENGER', '2004-08-03', 'mercury', ['orbiter'], 'Mercury orbiter'),
  row('deep-impact', 'Deep Impact', '2005-01-12', 'comet', ['impactor'], 'Comet rendezvous and impact'),
  row('new-horizons', 'New Horizons', '2006-01-19', 'pluto', ['flyby'], 'Pluto/Charon and Kuiper Belt flyby'),
  row('dawn', 'Dawn', '2007-09-27', 'ceres', ['orbiter'], 'Asteroid Ceres and Vesta orbiter'),
  row('lro', 'Lunar Reconnaissance Orbiter', '2009-06-18', 'moon', ['orbiter'], 'Lunar orbiter'),
  row('lcross', 'LCROSS', '2009-06-18', 'moon', ['impactor'], 'Lunar impactor'),
  row('juno', 'Juno', '2011-08-05', 'jupiter', ['orbiter'], 'Jupiter orbiter'),
  row('osiris-rex', 'OSIRIS-REx', '2016-09-08', 'bennu', ['sample-return'], 'Asteroid sample return (row partly truncated in the source text)'),
]

export const DEEP_SPACE_OBJECTS: PhysicalObject[] = [
  {
    id: 'huygens-probe',
    missionId: 'huygens',
    name: 'Huygens probe — ESA',
    category: 'atmospheric-probe',
    builtBy: 'ESA',
    nasaHardware: false,
    dimensions: v('2.7 m diameter, 60 deg half-angle front shield', ['esa-huygens-engineering']),
    massKg: v(318, ['esa-huygens-engineering']),
    design: 'Atmospheric entry probe: a 79 kg front shield protected it during entry, then parachutes carried the descent module to the surface.',
    components: [],
    location: u('see the Huygens mission landing-site record (sources conflict)'),
    currentStatus: v('on the surface of Titan', ['nasa-cassini']),
    model: { id: 'nasa:huygens', provenance: "NASA 3D Resources model of the ESA probe in cruise configuration (front shield attached), validated against ESA's 2.7 m shield diameter." },
    sources: ['nasa-cassini', 'esa-huygens-engineering', 'esa-huygens-landing'],
  },
]
