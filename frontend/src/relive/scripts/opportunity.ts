/**
 * Opportunity (MER-B) — launch, cruise, approach, entry, descent and landing, and the drive off the lander.
 *
 * Sources: the PDS MER mission description (phase-by-phase, with the published times), the archived JPL MER mission
 * pages (launch vehicle, spacecraft, EDL hardware), and the app's catalogue (launch 03:18:15 UTC; landing site).
 * Many EDL steps are published IN ORDER but WITHOUT times; those are 'sequence' events placed between their sourced
 * neighbours, and the UI marks them "≈". The few derived times say how they were computed.
 */
import type { MissionEvent, MissionScript, Phase, Segment, ShotCue, TelemetryTrack } from '../types'

const PDS = 'pds-mer-mission'
const LV = 'jpl-mer-launch-vehicle'
const SC = 'jpl-mer-spacecraft'
const EDL = 'jpl-mer-edl'
const CAT = 'nasa-opportunity'

const EPOCH = Date.UTC(2003, 6, 8, 3, 18, 15) // 7 July 2003 20:18:15 PDT (catalogue, NASA); PDS gives 03:18 UTC
const at = (ms: number) => (ms - EPOCH) / 1000
/** first impact, 04:55 UTC 25 January 2004 (PDS; to the minute) */
export const MER_LANDING = at(Date.UTC(2004, 0, 25, 4, 55, 0))
/** EDL starts "six minutes prior to landing" (PDS): the entry interface */
export const MER_ENTRY = MER_LANDING - 360
const CHUTE = MER_LANDING - 125
const REST = MER_LANDING + 120
const EGRESS = at(Date.UTC(2004, 0, 31, 11, 1, 0))
const APPROACH = at(Date.UTC(2003, 11, 10, 0, 0, 0))

const SEQ = (note: string) => ({ basis: 'sequence' as const, timeNote: note })
const DER = (note: string) => ({ basis: 'derived' as const, timeNote: note })

const ev = (id: string, t: number, title: string, text: string, kind: MissionEvent['kind'], sources: string[], extra: Partial<MissionEvent> = {}): MissionEvent => ({
  id, t, basis: 'sourced', title, text, kind, sources, ...extra,
})

const EVENTS: MissionEvent[] = [
  ev('liftoff', 0, 'Liftoff', 'A Delta II 7925H ("Heavy") lifts off from Space Launch Complex 17B, Cape Canaveral, on the RS-27A main engine and six of its nine strap-on solid motors. Launch azimuth 99°.', 'liftoff', [CAT, PDS, LV], { cue: 'ignition' }),
  ev('gem-burnout', 58, 'First six solid motors burn out', 'The six ground-lit graphite-epoxy motors (GEMs) burn out.', 'cutoff', [LV], SEQ('Not timed in the sources read; it comes just before the air-lit motors ignite.')),
  ev('gem-airlit', 60, 'Three air-lit solid motors ignite', 'The remaining three GEMs, with extended nozzles, ignite once the vehicle is lighter.', 'ignition', [LV], { ...DER('JPL: lit "a minute into flight".'), cue: 'ignition' }),
  ev('meco', 265, 'Stage I cutoff', 'The first-stage RS-27A engine shuts down.', 'cutoff', [LV], SEQ('Not timed in the sources read; the boost to orbit takes about 9 minutes (PDS).')),
  ev('stage2-ign', 278, 'Stage II ignition', 'The restartable AJ10-118K second stage fires for the first time.', 'ignition', [LV], { ...SEQ('Not timed in the sources read.'), cue: 'staging' }),
  ev('fairing', 290, 'Payload fairing jettisoned', 'The 2.9 m fairing is jettisoned shortly after Stage II ignition, at about 130 km.', 'jettison', [LV], { ...SEQ('JPL: "shortly after the ignition of Stage II", ~130 km.'), cue: 'pyro' }),
  ev('seco1', 540, 'Parking orbit', 'Stage II shuts itself off in low Earth orbit; a long coast of about an hour follows.', 'orbit', [PDS, LV], DER('PDS: the boost "took approximately 9 minutes".')),
  ev('stage2-restart', 540 + 3600, 'Stage II restart', 'At the right point in the orbit, the second stage fires again for the final alignment and velocity.', 'ignition', [PDS, LV], { ...DER('PDS: coast "of approximately 60 minutes" after the ~9-minute boost.'), cue: 'ignition' }),
  ev('spin', 4230, 'Spin-up', 'A spin table spins the third stage and spacecraft up like a top for stability.', 'burn', [LV], SEQ('Not timed in the sources read.')),
  ev('stage3-ign', 4260, 'Stage III ignition', 'The Star-48B solid motor burns for about 90 seconds — most of the velocity needed to leave Earth.', 'ignition', [LV], { ...SEQ('Not timed in the sources read; the burn lasts ~90 s (JPL).'), cue: 'ignition' }),
  ev('stage3-out', 4350, 'Stage III burnout', 'On a Type I trajectory to Mars.', 'cutoff', [LV, PDS], SEQ('Ignition + ~90 s (JPL).')),
  ev('despin', 4420, 'Yo-yo despin', 'Yo-yo weights unwind to slow the spin from 70 rpm to about 12 rpm.', 'burn', [LV, PDS], { ...SEQ('Not timed in the sources read.'), cue: 'pyro' }),
  ev('sep', 83 * 60, 'Spacecraft separation', 'The spacecraft separates from the third stage, about 83 minutes after launch.', 'separation', [PDS, LV], { ...DER('PDS: "approximately 83 minutes after launch".'), cue: 'pyro' }),
  ev('cruise', 83 * 60 + 600, 'Cruise', 'The cruise phase begins: checkout, calibration and navigation. Up to six trajectory correction maneuvers were planned; no science during cruise.', 'coast', [PDS, SC], SEQ('PDS: the cruise phase "began soon after separation".')),
  ev('approach', APPROACH, 'Approach phase', 'Forty-five days before entry: final navigation and trajectory correction maneuvers.', 'coast', [PDS], DER('PDS mission-phase start date 2003-12-10 (date only).')),
  ev('entry-turn', MER_ENTRY - 70 * 60, 'Turn to entry attitude', 'The spacecraft turns to its entry attitude, 70 minutes before entry.', 'burn', [PDS], DER('Entry − 70 min (PDS).')),
  ev('cruise-sep', MER_ENTRY - 15 * 60, 'Cruise stage separation', 'The cruise stage, with its solar arrays, is jettisoned 15 minutes before entry.', 'separation', [PDS, SC], { ...DER('Entry − 15 min (PDS).'), cue: 'pyro' }),
  ev('entry', MER_ENTRY, 'Atmospheric entry', 'The entry vehicle reaches the entry interface, 3522.2 km from the centre of Mars, at 5.4 km/s — heat shield first.', 'entry', [PDS, EDL], DER('PDS: EDL "started six minutes prior to landing" (landing 04:55 UTC).')),
  ev('chute', CHUTE, 'Parachute deploys', 'The parachute is deployed about 10 km above the surface.', 'parachute', [SC, PDS], { ...SEQ('Not timed in the sources read; placed between entry and landing so the published 20 s and 10 s intervals that follow fit before touchdown.'), cue: 'chute' }),
  ev('heatshield', CHUTE + 20, 'Heat shield released', 'Six separation nuts and push-off springs release the heat shield.', 'jettison', [PDS, SC], { ...DER('PDS: about 20 s after the parachute deploys.'), cue: 'pyro' }),
  ev('lander-sep', CHUTE + 30, 'Lander separation', 'The lander leaves the backshell and rappels down a metal tape to the end of a ~20 m braided Zylon bridle.', 'separation', [PDS, SC], { ...DER('PDS: about 10 s after the heat shield.'), cue: 'pyro' }),
  ev('radar', MER_LANDING - 60, 'Radar acquires the ground', 'The radar altimeter on a lower corner of the lander measures the distance to the surface.', 'comms', [PDS, SC], { ...SEQ('Order from PDS; not timed in the sources read.'), cue: 'beep' }),
  ev('dimes', MER_LANDING - 40, 'DIMES descent images', 'The Descent Image Motion Estimation System takes three images of the ground.', 'comms', [PDS], SEQ('Order from PDS; not timed in the sources read.')),
  ev('airbags', MER_LANDING - 12, 'Airbags inflate', 'Gas generators inflate four airbags of six lobes each around the lander, seconds before touchdown.', 'deploy', [PDS, SC], { ...SEQ('JPL: "inflated seconds before touchdown".'), cue: 'pyro' }),
  ev('rad', MER_LANDING - 8, 'RAD and TIRS rockets fire', 'Three RAD rockets on the backshell (about a ton of force each, for over 2 s) stop the descent 10–15 m up; three sideways TIRS rockets help hold the backshell vertical.', 'burn', [PDS, SC], { ...SEQ('Order from PDS; not timed in the sources read.'), cue: 'ignition' }),
  ev('bridle-cut', MER_LANDING - 3, 'Bridle cut', 'The bridle is cut 8.5 m above the surface; the lander falls free in its airbags.', 'separation', [PDS], { ...SEQ('Height from PDS; time not published.'), cue: 'pyro' }),
  ev('impact', MER_LANDING, 'First impact', 'Touchdown at 04:55 UTC, 25 January 2004 — 13:23 local solar time at Meridiani Planum.', 'landing', [PDS, CAT], { cue: 'bounce' }),
  ev('rest', REST, 'At rest in Eagle crater', 'After 26 bounces the lander rolls into a small crater, about 20 m across, later named Eagle — about 14.9 km from its target point. It comes to rest on its +Y side petal.', 'landing', [PDS, CAT], SEQ('PDS gives the 26 bounces but not how long they took.')),
  ev('retract', REST + 1800, 'Airbags retracted', 'The airbags are deflated and pulled in toward the lander, out of the rover\'s path.', 'deploy', [SC, EDL], SEQ('JPL: about 3 hours were allotted to retract the airbags and open the petals.')),
  ev('petals', REST + 3 * 3600, 'Petals open', 'Petal motors right the lander and open it flat; the base petal ends tilted 5°. The rover unfolds its solar arrays — EDL complete.', 'deploy', [PDS, SC, EDL], SEQ('JPL: within the ~3 hours allotted after landing.')),
  ev('egress', EGRESS, 'Egress — six wheels on Mars', 'On sol 7, Opportunity drives off the lander onto Martian soil (confirmed 11:01 UTC, 31 January 2004).', 'surface', [PDS], { cue: 'touchdown' }),
]

const START = -10
const END = EGRESS + 90

const P = (id: string, t0: number, t1: number, env: Phase['env'], title: string, summary: string): Phase => ({ id, t0, t1, env, title, summary })
const PHASES: Phase[] = [
  P('count', START, 0, 'pad', 'Launch', 'Space Launch Complex 17B, Cape Canaveral · 7 July 2003, 23:18 EDT'),
  P('boost', 0, 540, 'pad', 'Boost', 'Delta II 7925H: RS-27A and nine strap-on solid motors'),
  P('parking', 540, 4140, 'earth-near', 'Parking orbit', 'About an hour of coast in low Earth orbit'),
  P('departure', 4140, 83 * 60 + 600, 'earth-near', 'Departure for Mars', 'Stage II restart, spin-up, Star-48B, despin, separation'),
  P('cruise', 83 * 60 + 600, APPROACH, 'interplanetary', 'Cruise', '156 days on a Type I trajectory'),
  P('approach', APPROACH, MER_ENTRY - 15 * 60, 'interplanetary', 'Approach', 'The last 45 days before entry'),
  P('entry', MER_ENTRY - 15 * 60, CHUTE, 'mars-near', 'Entry', 'Into the atmosphere at 5.4 km/s'),
  P('descent', CHUTE, MER_LANDING, 'mars-descent', 'Descent', 'Parachute, bridle, airbags, retro-rockets'),
  P('bounces', MER_LANDING, REST, 'mars-descent', 'Bouncing to a stop', '26 bounces across Meridiani Planum'),
  P('unfold', REST, EGRESS - 120, 'mars-surface', 'Eagle crater', 'Airbags in, petals open, solar arrays out'),
  P('egress', EGRESS - 120, END, 'mars-surface', 'Egress', 'Sol 7: onto Martian soil'),
]

const S = (t0: number, t1: number, play: number): Segment => ({ t0, t1, play })
const SEGMENTS: Segment[] = [
  S(START, 0, 10), S(0, 70, 26), S(70, 300, 22), S(300, 560, 16), S(560, 4100, 14), S(4100, 4400, 18), S(4400, 6000, 14),
  S(6000, APPROACH, 22), S(APPROACH, MER_ENTRY - 75 * 60, 12), S(MER_ENTRY - 75 * 60, MER_ENTRY - 14 * 60, 14), S(MER_ENTRY - 14 * 60, MER_ENTRY, 12),
  S(MER_ENTRY, CHUTE - 5, 26), S(CHUTE - 5, MER_LANDING - 14, 34), S(MER_LANDING - 14, MER_LANDING + 3, 22), S(MER_LANDING + 3, REST, 26),
  S(REST, REST + 3 * 3600 + 600, 20), S(REST + 3 * 3600 + 600, EGRESS - 120, 10), S(EGRESS - 120, END, 18),
]

const TELEMETRY: TelemetryTrack[] = [
  { name: 'distance', unit: 'km', frame: 'from the centre of Mars at the entry interface (PDS)', sources: [PDS], samples: [{ t: MER_ENTRY, v: 3522.2 }], interp: false },
  { name: 'speed', unit: 'm/s', frame: 'at the entry interface (PDS)', sources: [PDS], samples: [{ t: MER_ENTRY, v: 5400 }], interp: false },
  { name: 'altitude', unit: 'm', frame: 'above the surface at that step (JPL, PDS); not timed in the sources, so not interpolated', sources: [SC, PDS], samples: [{ t: CHUTE, v: 10000 }, { t: MER_LANDING - 3, v: 8.5 }], interp: false },
]

const C = (t: number, kind: ShotCue['shot']['kind'], dist: number, elev = 0, azim = 0, fov = 45, label?: string): ShotCue => ({ t, shot: { kind, dist, elev, azim, fov }, label })
const SHOTS: ShotCue[] = [
  C(START, 'ground', 420, 5, 200, 30, 'SLC-17B'),
  C(-3, 'low', 70, 4, 210, 44),
  C(8, 'ground', 700, 8, 210, 28),
  C(45, 'chase', 160, -10, 20, 42),
  C(250, 'side', 90, 4, 80, 45, 'Staging'),
  C(560, 'wide', 2.6, 18, 140, 40, 'Parking orbit'),
  C(4120, 'chase', 40, 8, 200, 45, 'Departure'),
  C(4410, 'side', 25, 10, 100, 42),
  C(5600, 'wide', 1, 25, 0, 40, 'Earth to Mars'),
  C(APPROACH, 'wide', 1, 35, 30, 40),
  C(MER_ENTRY - 16 * 60, 'side', 14, 6, 90, 42, 'Cruise stage separation'),
  C(MER_ENTRY - 4 * 60, 'chase', 30, 14, 200, 45, 'Entry'),
  C(CHUTE - 2, 'side', 60, 4, 90, 45, 'Parachute'),
  C(CHUTE + 28, 'low', 45, -8, 160, 50),
  C(MER_LANDING - 14, 'side', 70, 6, 100, 50, 'Airbags and retro-rockets'),
  C(MER_LANDING + 2, 'ground', 90, 8, 200, 45, 'Bouncing'),
  C(REST - 40, 'low', 16, 12, 230, 45, 'Eagle crater'),
  C(REST + 600, 'orbit', 9, 24, 40, 45),
  C(EGRESS - 120, 'low', 7, 10, 160, 45, 'Egress'),
]

export const OPPORTUNITY: MissionScript = {
  id: 'mer-opportunity',
  missionId: 'mer-opportunity',
  title: 'Opportunity (MER-B)',
  subtitle: 'Launch to egress · 7 July 2003 – 31 January 2004',
  epochMs: EPOCH,
  epochNote: 'Mission time 0 = liftoff, 03:18:15 UTC 8 July 2003 (7 July, 20:18:15 PDT; NASA). PDS gives 03:18 UTC.',
  vehicle: 'delta-ii-7925h',
  clock: 'days',
  phases: PHASES,
  events: EVENTS,
  segments: SEGMENTS,
  telemetry: TELEMETRY,
  shots: SHOTS,
  illustrative: [
    'Delta II proportions are illustrative except the 2.9 m payload fairing and the 1168 mm (46 in) strap-on motors (JPL); the jettison of the spent strap-on motors is not described in the sources read, so they are faded out rather than shown separating.',
    'The ascent altitude profile and the parking-orbit altitude are illustrative; only the ~130 km fairing-jettison altitude, the 99° azimuth and the phase durations are published in the sources read.',
    'The Earth–Mars path is an illustrative Type I arc (less than half an orbit, as PDS describes); Earth and Mars are at their computed positions on the launch and landing dates.',
    'Cruise stage (2.65 m × 1.6 m with the aeroshell), aeroshell colours, parachute, bridle (~20 m), airbags (four bags of six lobes) and lander petals follow the JPL descriptions; their exact shapes are simplified.',
    'The entry track over Meridiani Planum, the bounce trajectory (only the count, 26, is published) and the terrain around Eagle crater (about 20 m across) are illustrative.',
    'Times marked ≈ are published in order but not timed; they are placed between their sourced neighbours.',
    'The rover is the NASA 3D Resources model in its deployed configuration; its folded cruise configuration is not modelled.',
    'Sound is synthesised sound design, not archival audio.',
  ],
  conclusion: {
    title: 'Opportunity is on Mars',
    text: 'Planned for 90 sols, Opportunity worked for almost 15 years and drove 45.16 km. It reached Victoria crater in September 2006 and drove into it on 11 September 2007; a planet-wide dust storm ended contact on 10 June 2018, and NASA declared the mission over on 13 February 2019.',
    sources: [CAT],
  },
}
