/**
 * Apollo 11 — the complete mission, from the terminal count to the crew safe on the recovery ship's doorstep.
 *
 * Every time below is a ground elapsed time (GET) copied from "Apollo by the Numbers" (NASA SP-2000-4029), Apollo 11
 * timeline, unless the event says otherwise. GET 0 is range zero, 13:32:00 GMT 16 July 1969 (same source).
 * Telemetry values are the published table values at those events (ascent, Earth-orbit, translunar, transearth phase
 * tables of the same chapter), converted from feet / nautical miles to SI.
 */
import type { MissionEvent, MissionScript, Phase, Segment, ShotCue, TelemetryTrack } from '../types'

const SP = 'nasa-sp4029'
const FT = 0.3048
const NMI = 1852

/** 'hhh:mm:ss.ss' → seconds (negative for countdown) */
export function get(s: string): number {
  const neg = s.startsWith('-')
  const [h, m, sec] = s.replace('-', '').split(':').map(Number)
  const v = h * 3600 + m * 60 + sec
  return neg ? -v : v
}

const ev = (id: string, t: string, title: string, text: string, kind: MissionEvent['kind'], extra: Partial<MissionEvent> = {}): MissionEvent => ({
  id, t: get(t), basis: 'sourced', title, text, kind, sources: [SP], ...extra,
})

// ─────────────────────────────────────────────────────────── events (SP-4029 Apollo 11 timeline, verbatim times)
const EVENTS: MissionEvent[] = [
  ev('sic-start-cmd', '-000:00:08.90', 'S-IC engine start command', 'The command to start the five F-1 engines of the first stage.', 'countdown', { cue: 'beep' }),
  ev('sic-ignition', '-000:00:06.40', 'S-IC engine ignition (#5)', 'The centre F-1 engine ignites first; the others follow.', 'ignition', { cue: 'ignition' }),
  ev('sic-thrust-ok', '-000:00:01.60', 'All S-IC engines thrust OK', 'All five F-1 engines report thrust OK while the hold-down arms keep the vehicle on the pad.', 'countdown'),
  ev('range-zero', '000:00:00.00', 'Range zero', 'Range zero: 13:32:00 GMT, 16 July 1969 (09:32 a.m. EDT).', 'countdown'),
  ev('holddown', '000:00:00.30', 'Hold-down arms released', 'All hold-down arms released — first motion.', 'liftoff'),
  ev('liftoff', '000:00:00.63', 'Liftoff', 'Liftoff from Launch Complex 39, Pad A, Kennedy Space Center (umbilical disconnected, 1.07 g).', 'liftoff', { sources: [SP, 'nssdca-a11-csm'] }),
  ev('yaw', '000:00:01.70', 'Tower clearance yaw maneuver', 'The vehicle yaws away from the launch tower; the maneuver ends at 9.7 s.', 'burn'),
  ev('roll', '000:00:13.20', 'Pitch and roll program', 'Between 13.2 and 31.1 s the vehicle rolls from the pad azimuth of 90° to the flight azimuth of 72.058°.', 'burn'),
  ev('mach1', '000:01:06.30', 'Mach 1', 'Sound barrier passed at 4.2 n mi altitude.', 'burn', { cue: 'sonic' }),
  ev('maxq', '000:01:23.00', 'Maximum dynamic pressure', 'Max Q: 735.17 lbf/ft², at 7.3 n mi altitude.', 'burn'),
  ev('sic-ceco', '000:02:15.20', 'S-IC centre engine cutoff', 'The centre F-1 engine is shut down to limit acceleration.', 'cutoff'),
  ev('sic-oeco', '000:02:41.63', 'S-IC outboard engine cutoff', 'The four outboard F-1 engines shut down at 35.7 n mi altitude; peak acceleration 3.94 g.', 'cutoff'),
  ev('sic-sep', '000:02:42.30', 'S-IC/S-II separation', 'The spent first stage separates (commanded time).', 'staging', { cue: 'staging' }),
  ev('sii-ign', '000:02:44.00', 'S-II ignition', 'The five J-2 engines of the second stage ignite.', 'ignition', { cue: 'ignition' }),
  ev('sii-interstage', '000:03:12.30', 'S-II aft interstage jettisoned', 'The ring between the stages falls away.', 'jettison', { cue: 'pyro' }),
  ev('les-jett', '000:03:17.90', 'Launch escape tower jettisoned', 'The launch escape system is no longer needed and is jettisoned with its boost cover.', 'jettison', { cue: 'pyro' }),
  ev('sii-ceco', '000:07:40.62', 'S-II centre engine cutoff', 'The centre J-2 engine shuts down at 97.3 n mi altitude.', 'cutoff'),
  ev('sic-impact', '000:09:03.70', 'S-IC impact', 'The first stage hits the Atlantic at 30.212°N 74.038°W, 357.1 n mi from the launch site (theoretical impact time).', 'end'),
  ev('sii-oeco', '000:09:08.22', 'S-II outboard engine cutoff', 'Second-stage shutdown at 101.1 n mi altitude.', 'cutoff'),
  ev('sii-sep', '000:09:09.00', 'S-II/S-IVB separation', 'The second stage separates (commanded time).', 'staging', { cue: 'staging' }),
  ev('sivb-ign1', '000:09:12.20', 'S-IVB first burn ignition', 'The single J-2 engine of the third stage ignites.', 'ignition', { cue: 'ignition' }),
  ev('sivb-cut1', '000:11:39.33', 'S-IVB first burn cutoff', 'Third-stage shutdown; deviations from the planned trajectory were only −0.6 ft/s and −0.1 n mi.', 'cutoff'),
  ev('eoi', '000:11:49.33', 'Earth orbit insertion', 'Parking orbit 100.4 × 98.9 n mi, inclination 32.521°, period 88.18 min.', 'orbit'),
  ev('sii-impact', '000:20:13.70', 'S-II impact', 'The second stage hits the Atlantic at 31.535°N 34.844°W, 2,371.8 n mi from the launch site (theoretical).', 'end'),
  ev('tli-ign', '002:44:16.20', 'Translunar injection ignition', 'Second S-IVB burn: the J-2 restarts to send Apollo 11 to the Moon.', 'ignition', { cue: 'ignition' }),
  ev('tli-cut', '002:50:03.03', 'Translunar injection cutoff', 'Burn of 346.83 s, +10,008.1 ft/s; peak acceleration 1.45 g.', 'cutoff'),
  ev('tli', '002:50:13.03', 'Translunar injection', 'On the way to the Moon at 35,545.6 ft/s, 180.6 n mi above Earth.', 'orbit'),
  ev('csm-sep', '003:15:23.00', 'CSM separated from the S-IVB', 'The command and service module separates from the S-IVB; the adapter\'s upper panels are jettisonable, leaving the lunar module exposed on top of the stage.', 'separation', { cue: 'pyro' }),
  ev('docking', '003:24:03.70', 'CSM docked with the LM', 'After turning around (transposition), Columbia docks with the lunar module still on the S-IVB.', 'docking', { cue: 'pyro' }),
  ev('ejection', '004:17:03.00', 'CSM/LM ejected from the S-IVB', 'The docked spacecraft pull the lunar module out of the adapter.', 'separation', { cue: 'pyro' }),
  ev('evasive', '004:40:01.72', 'Evasive maneuver from the S-IVB', 'A 2.93 s burn moves the spacecraft away from the spent stage.', 'burn'),
  ev('slingshot', '005:37:47.60', 'S-IVB lunar slingshot maneuver', 'The S-IVB fires its auxiliary propulsion to send itself past the Moon.', 'burn'),
  ev('mcc1', '026:44:58.64', 'Midcourse correction', 'The only translunar correction: 3.13 s, 20.9 ft/s, 109,475 n mi from Earth.', 'burn'),
  ev('lm-inspect', '055:30:00.00', 'First LM inspection', 'Armstrong and Aldrin enter the LM for its initial inspection.', 'comms'),
  ev('equigravisphere', '061:39:55.00', 'Equigravisphere', 'The point where the Moon\'s gravity begins to dominate the Earth\'s.', 'coast'),
  ev('loi-ign', '075:49:50.37', 'Lunar orbit insertion ignition', 'The service propulsion engine fires for 357.53 s, a velocity change of 2,917.5 ft/s.', 'ignition', { cue: 'ignition' }),
  ev('loi-cut', '075:55:47.90', 'Lunar orbit insertion cutoff', 'In lunar orbit: 169.7 × 60.0 n mi.', 'cutoff'),
  ev('loc-ign', '080:11:36.75', 'Lunar orbit circularization', 'A 16.88 s burn lowers the orbit to 66.1 × 54.5 n mi.', 'burn'),
  ev('lm-final-prep', '095:20:00.00', 'Final preparations for descent', 'Armstrong and Aldrin enter the LM for the final preparations.', 'comms'),
  ev('undock', '100:12:00.00', 'CSM/LM undocked', 'Eagle and Columbia separate. Michael Collins stays in lunar orbit in the CSM.', 'separation', { cue: 'pyro', sources: [SP, 'nssdca-a11-csm'] }),
  ev('doi', '101:36:14.00', 'Descent orbit insertion', 'Eagle\'s descent engine fires for about 30 s to lower its orbit toward the landing site.', 'burn', { cue: 'ignition' }),
  ev('alt50k', '102:32:55.00', 'Altitude 50,000 feet', 'Eagle is 50,000 ft above the Moon, about to start the powered descent.', 'coast'),
  ev('pdi', '102:33:05.01', 'Powered descent initiation', 'The descent engine ignites for the 12.6-minute powered descent.', 'ignition', { cue: 'ignition' }),
  ev('a1202', '102:38:22.00', '1202 alarm', 'The first of the guidance computer\'s program alarms during the descent.', 'comms', { cue: 'beep' }),
  ev('alt30k', '102:38:50.00', 'Below 30,000 ft and 2,000 ft/s', 'Landing-radar velocity updates start.', 'coast'),
  ev('approach', '102:41:32.00', 'Approach phase', 'The LM enters the approach phase of the powered descent.', 'burn'),
  ev('lpd', '102:43:09.00', 'Landing point redesignation', 'The landing point is redesignated during the approach.', 'burn'),
  ev('lowfuel', '102:44:28.00', 'Fuel low-level light', 'The descent propellant low-level quantity light comes on.', 'comms', { cue: 'beep' }),
  ev('dust', '102:44:35.00', 'Surface dust disturbed', 'First evidence of surface dust disturbed by the descent engine.', 'landing'),
  ev('landing', '102:45:39.90', 'Lunar landing', '"Houston, Tranquility Base here — the Eagle has landed." Mare Tranquilitatis, 20:17:39 GMT.', 'landing', { cue: 'touchdown', sources: [SP, 'nssdca-a11-lm'] }),
  ev('pdc', '102:45:41.40', 'Descent engine cutoff', 'Powered descent engine cutoff.', 'cutoff'),
  ev('eva-start', '109:07:33.00', 'EVA started (hatch open)', 'The hatch opens for the first moonwalk.', 'surface'),
  ev('first-step', '109:24:15.00', 'First step on the Moon', 'Neil Armstrong steps onto the surface: "That\'s one small step for a man … one giant leap for mankind."', 'surface', { sources: [SP, 'nssdca-a11-csm'] }),
  ev('lmp-surface', '109:43:16.00', 'Aldrin on the surface', 'Buzz Aldrin, the lunar module pilot, steps onto the Moon.', 'surface'),
  ev('flag', '110:09:43.00', 'Flag deployed', 'The United States flag is deployed.', 'surface'),
  ev('pse', '110:55:42.00', 'Passive seismometer deployed', 'The EASEP seismic station is set up south of the LM.', 'deploy', { sources: [SP, 'nssdca-a11-lm'] }),
  ev('lrrr', '111:03:57.00', 'Laser retroreflector deployed', 'The Lunar Ranging Retro-Reflector, a passive corner-cube array that needs no power, is set up near the EASEP.', 'deploy', { sources: [SP, 'nssdca-a11-lm'] }),
  ev('pse-data', '111:08:39.00', 'First seismic data on Earth', 'The first passive-seismic experiment data reach Earth.', 'comms'),
  ev('eva-end', '111:39:13.00', 'EVA ended (hatch closed)', 'Both astronauts are back inside the LM after about 2.5 hours outside.', 'surface'),
  ev('jettison-eq', '114:05:00.00', 'LM equipment jettisoned', 'Equipment no longer needed is thrown out of the cabin onto the surface.', 'jettison'),
  ev('lm-liftoff', '124:22:00.79', 'Lunar liftoff', 'The ascent engine fires; the descent stage stays behind as the launch platform.', 'liftoff', { cue: 'ignition', sources: [SP, 'nssdca-a11-lm'] }),
  ev('lm-insertion', '124:29:15.67', 'LM orbit insertion', 'Eagle\'s ascent stage reaches lunar orbit.', 'cutoff'),
  ev('csi', '125:19:35.00', 'Coelliptic sequence initiation', 'The rendezvous sequence begins.', 'burn'),
  ev('tpi', '127:03:51.80', 'Terminal phase initiation', 'Eagle burns toward Columbia.', 'burn'),
  ev('redocking', '128:03:00.00', 'CSM/LM docked', 'Eagle and Columbia dock again in lunar orbit.', 'docking', { cue: 'pyro' }),
  ev('ascent-jett', '130:09:31.20', 'LM ascent stage jettisoned', 'The crew is back in Columbia; the ascent stage is left in lunar orbit.', 'jettison', { cue: 'pyro' }),
  ev('tei-ign', '135:23:42.28', 'Transearth injection ignition', 'The service propulsion engine fires for 151.41 s, a velocity change of 3,279.0 ft/s.', 'ignition', { cue: 'ignition' }),
  ev('tei-cut', '135:26:13.69', 'Transearth injection cutoff', 'Homeward bound at 8,589 ft/s, after 30 lunar orbits lasting 59 h 30 min.', 'cutoff'),
  ev('mcc-te', '150:29:57.40', 'Transearth midcourse correction', 'A 10.0 s, 4.8 ft/s correction — the only one needed on the way home.', 'burn'),
  ev('tv-final', '177:32:00.00', 'Final TV broadcast', 'The 12.5-minute broadcast: each crew member thanks the people who made the mission possible.', 'comms'),
  ev('cmsm-sep', '194:49:12.70', 'CM/SM separation', 'The service module is jettisoned; the command module continues alone toward the atmosphere.', 'separation', { cue: 'pyro' }),
  ev('entry', '195:03:05.70', 'Entry', 'Columbia reaches the atmosphere (400,000 ft) at 36,194.4 ft/s on an automatic entry profile.', 'entry'),
  ev('drogue', '195:12:06.90', 'Drogue parachute deployed', 'The drogue parachute deploys to steady and slow the command module.', 'parachute', { cue: 'chute' }),
  ev('mains', '195:13:30.00', 'Main parachutes', 'The three main parachutes open (deployment time not listed in the Apollo 11 timeline).', 'parachute', {
    basis: 'sequence', cue: 'chute', timeNote: 'SP-4029 lists no time for the Apollo 11 main-parachute deployment; it is placed between the drogue (195:12:06.9) and splashdown (195:18:35). Three mains: SP-4029, Apollo 15 recovery text.',
  }),
  ev('splashdown', '195:18:35.00', 'Splashdown', 'Pacific Ocean, 16:50:35 GMT 24 July, 13.30°N 169.15°W — 13 n mi from USS Hornet. The CM settles apex-down.', 'splashdown', { cue: 'splash', sources: [SP, 'nssdca-a11-csm'] }),
  ev('apex-up', '195:26:15.00', 'CM upright', 'Flotation bags return the command module to the apex-up position.', 'splashdown'),
  ev('collar', '195:32:00.00', 'Flotation collar inflated', 'Recovery swimmers inflate the flotation collar around Columbia.', 'end'),
]

// ─────────────────────────────────────────────────────────── phases
const P = (id: string, t0: string | number, t1: string | number, env: Phase['env'], title: string, summary: string): Phase => ({
  id, t0: typeof t0 === 'number' ? t0 : get(t0), t1: typeof t1 === 'number' ? t1 : get(t1), env, title, summary,
})
const START = -12
const END = get('195:33:00.00')
const PHASES: Phase[] = [
  P('count', START, '000:00:00.63', 'pad', 'Terminal count', 'Launch Complex 39A, Kennedy Space Center · 16 July 1969'),
  P('sic', '000:00:00.63', '000:02:42.30', 'pad', 'First stage — S-IC', 'Five F-1 engines, 7.6 million lbf of thrust'),
  P('sii', '000:02:42.30', '000:09:09.00', 'earth-near', 'Second stage — S-II', 'Five J-2 engines burning liquid hydrogen'),
  P('sivb', '000:09:09.00', '000:11:49.33', 'earth-near', 'Third stage — S-IVB to orbit', 'One J-2 engine; first burn'),
  P('epo', '000:11:49.33', '002:44:16.20', 'earth-near', 'Earth parking orbit', '100 n mi, 88-minute orbits while the systems are checked'),
  P('tli', '002:44:16.20', '002:50:13.03', 'earth-near', 'Translunar injection', 'The S-IVB restarts: 5 min 47 s, +10,008 ft/s'),
  P('td', '002:50:13.03', '004:40:04.65', 'earth-near', 'Transposition, docking and extraction', 'Columbia turns around, docks with Eagle and pulls it free'),
  P('coast-out', '004:40:04.65', '075:49:50.37', 'cislunar', 'Translunar coast', 'Three days to the Moon'),
  P('loi', '075:49:50.37', '080:11:53.63', 'moon-near', 'Lunar orbit insertion', 'Braking into lunar orbit'),
  P('lunar-orbit', '080:11:53.63', '101:36:14.00', 'moon-near', 'Lunar orbit', 'Undocking: Eagle and Columbia part'),
  P('descent', '101:36:14.00', '102:45:41.40', 'moon-near', 'Descent to Tranquility Base', 'Descent orbit, then the 12.6-minute powered descent'),
  P('surface', '102:45:41.40', '124:22:00.79', 'moon-surface', 'Tranquility Base', '21 h 36 min on the Moon · one moonwalk'),
  P('ascent', '124:22:00.79', '130:09:31.20', 'moon-near', 'Ascent and rendezvous', 'Eagle\'s ascent stage rejoins Columbia'),
  P('tei', '130:09:31.20', '135:26:13.69', 'moon-near', 'Transearth injection', 'Leaving lunar orbit'),
  P('coast-home', '135:26:13.69', '194:49:12.70', 'cislunar', 'Transearth coast', 'Two and a half days home'),
  P('entry', '194:49:12.70', '195:12:06.90', 'earth-entry', 'Entry', 'Heat shield first at 36,194 ft/s'),
  P('recovery', '195:12:06.90', END, 'ocean', 'Parachutes and splashdown', 'Pacific Ocean, recovery ship USS Hornet'),
]

// ─────────────────────────────────────────────────────────── pacing (MET span → seconds of playback at 1×)
const S = (a: string | number, b: string | number, play: number): Segment => ({ t0: typeof a === 'number' ? a : get(a), t1: typeof b === 'number' ? b : get(b), play })
const SEGMENTS: Segment[] = [
  S(START, '000:00:00.63', 12.6), // real time through ignition
  S('000:00:00.63', '000:00:40', 26), // the climb off the pad, slightly slowed
  S('000:00:40', '000:02:50', 26), // Mach 1, max Q, staging
  S('000:02:50', '000:03:25', 12), // interstage and tower jettison
  S('000:03:25', '000:09:20', 22),
  S('000:09:20', '000:11:55', 14),
  S('000:11:55', '002:44:10', 16), // parking orbit
  S('002:44:10', '002:50:20', 16), // TLI
  S('002:50:20', '003:14:50', 8),
  S('003:14:50', '003:25:00', 18), // transposition and docking
  S('003:25:00', '004:41:00', 14), // extraction
  S('004:41:00', '075:49:00', 22), // three days of coast
  S('075:49:00', '075:56:30', 14), // LOI
  S('075:56:30', '100:11:00', 12),
  S('100:11:00', '100:14:00', 8), // undocking
  S('100:14:00', '102:32:30', 14),
  S('102:32:30', '102:41:00', 26), // powered descent
  S('102:41:00', '102:46:10', 34), // final approach and landing, near real time
  S('102:46:10', '109:20:00', 10),
  S('109:20:00', '111:40:00', 34), // the moonwalk
  S('111:40:00', '124:21:50', 10),
  S('124:21:50', '124:30:00', 18), // lunar liftoff
  S('124:30:00', '128:04:00', 12),
  S('128:04:00', '135:22:30', 12),
  S('135:22:30', '135:27:00', 12), // TEI
  S('135:27:00', '194:48:30', 18), // coast home
  S('194:48:30', '195:04:00', 14), // SM jettison, entry interface
  S('195:04:00', '195:12:20', 22), // entry
  S('195:12:20', '195:18:45', 26), // parachutes, splashdown
  S('195:18:45', END, 16),
]

// ─────────────────────────────────────────────────────────── published telemetry
const A = (t: string, v: number) => ({ t: get(t), v })
const TELEMETRY: TelemetryTrack[] = [
  {
    name: 'altitude', unit: 'm', frame: 'above Earth (SP-4029 ascent / translunar tables)', sources: [SP],
    samples: [
      A('000:00:00.63', 0.032 * NMI), A('000:01:06.30', 4.236 * NMI), A('000:01:23.00', 7.326 * NMI), A('000:02:15.20', 23.761 * NMI),
      A('000:02:41.63', 35.701 * NMI), A('000:02:42.30', 36.029 * NMI), A('000:07:40.62', 97.28 * NMI), A('000:09:08.22', 101.142 * NMI),
      A('000:09:09.00', 101.175 * NMI), A('000:11:39.33', 103.202 * NMI), A('000:11:49.33', 103.176 * NMI),
    ],
  },
  {
    name: 'distance', unit: 'km', frame: 'altitude above Earth (SP-4029 translunar table)', sources: [SP],
    samples: [A('002:50:13.03', 180.581 * NMI / 1000), A('003:15:23.00', 3815.19 * NMI / 1000), A('003:24:03.70', 5317.6 * NMI / 1000), A('004:40:01.72', 16620.8 * NMI / 1000), A('026:44:58.64', 109475.3 * NMI / 1000), A('026:45:01.77', 109477.2 * NMI / 1000)],
  },
  {
    name: 'altitude', unit: 'm', frame: 'above the Moon (SP-4029 timeline)', sources: [SP],
    samples: [A('102:32:55.00', 50000 * FT), A('102:45:39.90', 0)],
  },
  {
    name: 'distance', unit: 'km', frame: 'altitude above Earth (SP-4029 transearth table)', sources: [SP],
    samples: [A('150:29:57.40', 169087.2 * NMI / 1000), A('150:30:07.40', 169080.6 * NMI / 1000), A('194:49:12.70', 1778.3 * NMI / 1000), A('195:03:05.70', 400000 * FT / 1000)],
  },
  {
    name: 'speed', unit: 'm/s', frame: 'Earth-fixed (SP-4029 ascent table)', sources: [SP],
    samples: [
      A('000:00:00.63', 1.5 * FT), A('000:01:06.30', 1054.1 * FT), A('000:01:23.00', 1653.4 * FT), A('000:02:15.20', 5320.8 * FT), A('000:02:41.63', 7851.9 * FT),
      A('000:02:42.30', 7882.9 * FT), A('000:07:40.62', 17404.8 * FT), A('000:09:08.22', 21368.2 * FT), A('000:09:09.00', 21377.0 * FT), A('000:11:39.33', 24237.6 * FT), A('000:11:49.33', 24243.9 * FT),
    ],
  },
  {
    name: 'speed', unit: 'm/s', frame: 'space-fixed (SP-4029 Earth-orbit / translunar tables)', sources: [SP],
    samples: [
      A('002:44:16.20', 25560.2 * FT), A('002:50:03.03', 35568.3 * FT), A('002:50:13.03', 35545.6 * FT), A('003:15:23.00', 24962.5 * FT), A('003:24:03.70', 22662.5 * FT),
      A('004:40:01.72', 14680.0 * FT), A('004:40:04.65', 14663.0 * FT), A('026:44:58.64', 5025.0 * FT), A('026:45:01.77', 5010.0 * FT),
    ],
  },
  {
    name: 'speed', unit: 'm/s', frame: 'space-fixed (SP-4029 transearth table, entry text)', sources: [SP],
    samples: [A('135:23:42.28', 5376.0 * FT), A('135:26:13.69', 8589.0 * FT), A('150:29:57.40', 4075.0 * FT), A('150:30:07.40', 4074.0 * FT), A('194:49:12.70', 29615.5 * FT), A('195:03:05.70', 36194.4 * FT)],
  },
]

// ─────────────────────────────────────────────────────────── camera director
const C = (t: string | number, kind: ShotCue['shot']['kind'], dist: number, elev = 0, azim = 0, fov = 45, label?: string): ShotCue => ({ t: typeof t === 'number' ? t : get(t), shot: { kind, dist, elev, azim, fov }, label })
const SHOTS: ShotCue[] = [
  C(START, 'ground', 900, 6, 125, 30, 'Pad 39A'),
  C('-000:00:03', 'low', 170, 3, 120, 42),
  C('000:00:08', 'ground', 1500, 6, 125, 26),
  C('000:00:40', 'chase', 230, 20, 20, 42),
  C('000:02:38', 'side', 170, 22, 80, 45, 'Staging'),
  C('000:03:30', 'chase', 200, 16, 160, 42),
  C('000:09:00', 'side', 120, 18, 70, 45),
  C('000:12:00', 'wide', 2.6, 18, 140, 40, 'Earth orbit'),
  C('002:44:00', 'side', 70, 12, 70, 45, 'TLI'),
  C('003:14:00', 'side', 70, 10, 100, 40, 'Transposition and docking'),
  C('003:30:00', 'orbit', 80, 15, 40, 42),
  C('004:45:00', 'wide', 30, 12, 100, 38, 'Earth–Moon space'),
  C('075:40:00', 'chase', 90, 20, 200, 45, 'Lunar orbit'),
  C('080:30:00', 'wide', 1.5, 25, 120, 40),
  C('100:08:00', 'side', 60, 8, 80, 42, 'Undocking'),
  C('101:30:00', 'chase', 120, 12, 190, 45),
  C('102:39:00', 'chase', 70, 18, 160, 50, 'Final approach'),
  C('102:45:00', 'low', 45, 6, 230, 45),
  C('102:46:00', 'ground', 60, 10, 220, 40, 'Tranquility Base'),
  C('109:20:00', 'low', 22, 8, 200, 45, 'The moonwalk'),
  C('111:45:00', 'top', 60, 50, 200, 40),
  C('124:21:00', 'ground', 46, 5, 230, 50, 'Lunar liftoff'),
  C('124:22:40', 'chase', 90, 30, 200, 45),
  C('127:40:00', 'side', 60, 10, 80, 42, 'Rendezvous'),
  C('135:20:00', 'chase', 90, 15, 200, 45, 'Transearth injection'),
  C('135:30:00', 'wide', 30, 12, 280, 38, 'Homeward'),
  C('194:48:00', 'side', 40, 8, 90, 42, 'Service module jettison'),
  C('195:03:00', 'chase', 60, 20, 30, 45, 'Entry'),
  C('195:12:00', 'side', 90, -8, 220, 42, 'Parachutes'),
  C('195:17:20', 'side', 120, 2, 200, 42),
  C('195:18:30', 'side', 45, 6, 0, 42, 'Splashdown'),
]

export const APOLLO_11: MissionScript = {
  id: 'apollo-11',
  missionId: 'apollo-11',
  title: 'Apollo 11',
  subtitle: 'The complete mission · 16–24 July 1969',
  epochMs: Date.UTC(1969, 6, 16, 13, 32, 0),
  epochNote: 'GET 0 = range zero, 13:32:00 GMT 16 July 1969 (NASA SP-4029). Mission clock shown as GET.',
  vehicle: 'saturn-v',
  clock: 'get',
  phases: PHASES,
  events: EVENTS,
  segments: SEGMENTS,
  telemetry: TELEMETRY,
  shots: SHOTS,
  illustrative: [
    'Saturn V, CSM and LES shapes are built from the SP-4029 key-facts dimensions; engine bells, markings and surface detail are simplified. The LM is the NASA 3D Resources model.',
    'Ascent path: positions are interpolated between the published table values (altitude, range, latitude/longitude at each event); the attitude follows the flight path.',
    'Parking orbit and the start of the coast are computed from the published insertion values (100.4 × 98.9 n mi, 32.521°, 88.18 min; TLI state 35,545.6 ft/s, 7.367° flight-path angle) on a spherical Earth; the Earth–Moon path is that conic bent to meet the Moon\'s position at lunar orbit insertion — the shape is illustrative, the distances and speeds shown are the published ones.',
    'Lunar orbit geometry, the descent ground track and the launch site surroundings are illustrative; the measured LROC terrain of Tranquility Base is in the Explore view.',
    'Lunar surface around the LM is a procedural regolith; LM, EASEP and retroreflector positions follow NSSDCA (EASEP ~17 m south of the LM, LRRR ~5 m NNW of EASEP).',
    'Entry corridor, the drogue/main parachute shapes and the ocean are illustrative; the entry and splashdown times, the entry speed and the splashdown point are published.',
    'Sound is synthesised sound design, not archival audio.',
  ],
  conclusion: {
    title: 'Mission complete',
    text: 'Apollo 11 ended with splashdown 195 h 18 min 35 s after launch. The crew went into quarantine until 10 August 1969. On the Moon they left the LM descent stage, the seismometer (it stopped answering commands on 27 August 1969) and the passive laser retroreflector.',
    sources: [SP, 'nssdca-a11-lm'],
  },
}
