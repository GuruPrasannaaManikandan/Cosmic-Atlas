/**
 * Explore expeditions (Milestone 3): the explorer's OWN journey, flown automatically — Earth departure, the coast,
 * orbit, descent, landing and deployment, and later the return — with no cut from orbit to the ground.
 *
 * Everything here is CONCEPTUAL: the expedition vehicles are not NASA spacecraft and their sequence is not a real
 * mission's. What is real: the Earth, Moon and Mars positions (the app's ephemeris), the landing site, the physics
 * (two-body orbits, gravity, the thrust direction the path needs), and one derived number — the coast lasts as long
 * as the site's real mission took from launch to landing (catalogue dates). The scripts say so in `illustrative`.
 */
import type { Frame, Obj } from './flight'
import type { MissionEvent, MissionScript, Phase, Segment, ShotCue } from './types'
import {
  D2R, MU_EARTH, MU_MOON, R_EARTH, R_MARS, R_MOON, type V3, clamp01, enu, gmst, helioEcliptic, kepler, llUnit, moonEci,
  ramp, rotAxis, rotY, smooth, sunEci, v3,
} from './geo'
import { marsTime, sunPosition } from '../realism/marsTime'

export interface ExpeditionTarget {
  siteId: string
  name: string
  dest: 'moon' | 'mars'
  latDeg: number
  lonEastDeg: number
  /** the real mission's launch → landing time (days) and its sources, for the coast length */
  cruiseDays: number
  cruiseMission: string
  cruiseSources: string[]
}

/** the hover point where the Moon surface view takes over the descent (m above the landing point) */
export const MOON_HANDOFF_ALT = 420

const velOf = (p: (t: number) => V3, t: number, h = 0.5): V3 => v3.mul(v3.sub(p(t + h), p(t - h)), 1 / (2 * h))
function thrustDir(p: (t: number) => V3, t: number, mu: number, h = 1): V3 {
  const a = v3.mul(v3.add(v3.sub(p(t + h), v3.mul(p(t), 2)), p(t - h)), 1 / (h * h))
  const r = p(t)
  const d = v3.sub(a, v3.mul(r, -mu / Math.pow(v3.len(r), 3)))
  return v3.len(d) < 1e-6 ? v3.norm(r) : v3.norm(d)
}
function slerp(a: V3, b: V3, f: number): V3 {
  const c = Math.max(-1, Math.min(1, v3.dot(a, b)))
  const om = Math.acos(c)
  if (om < 1e-6) return a
  const s = Math.sin(om)
  return v3.add(v3.mul(a, Math.sin((1 - f) * om) / s), v3.mul(b, Math.sin(f * om) / s))
}
const ev = (id: string, t: number, title: string, text: string, kind: MissionEvent['kind'], extra: Partial<MissionEvent> = {}): MissionEvent => ({
  id, t, basis: 'conceptual', timeNote: 'Conceptual expedition step (not a real mission event).', title, text, kind, sources: [], ...extra,
})
const sideOf = (f: V3, up: V3): V3 => { const c = v3.cross(f, up); return v3.len(c) > 1e-6 ? v3.norm(c) : [1, 0, 0] }

const LEO_R = R_EARTH + 300e3
const LEO_W = Math.sqrt(MU_EARTH / Math.pow(LEO_R, 3))
const BURN0 = 120, BURN1 = 420

// ════════════════════════════════════════════════════════════════════════════════════ Moon, outbound
export function moonOutbound(tg: ExpeditionTarget, landingMs: number): MissionScript {
  const ORBIT_R = R_MOON + 100e3
  const W_ORB = Math.sqrt(MU_MOON / Math.pow(ORBIT_R, 3))
  const PD_T = 600
  const RP = R_MOON + 15e3, DA = (RP + ORBIT_R) / 2, DE = (ORBIT_R - RP) / (ORBIT_R + RP)
  const HALF = Math.PI * Math.sqrt(Math.pow(DA, 3) / MU_MOON)
  const VP = Math.sqrt(MU_MOON * (2 / RP - 1 / DA))
  const PD_RANGE = (VP * PD_T) / 2.25
  const total = Math.max(1.2, tg.cruiseDays) * 86400 // derived: the real mission's launch → landing time
  const T_END = total
  const T_PDI = T_END - PD_T
  const T_DOI = T_PDI - HALF
  const T_LOI = T_DOI - (2 * Math.PI) / W_ORB // one revolution in orbit
  const epoch = landingMs - total * 1000
  const ms = (t: number) => epoch + t * 1000
  const L = llUnit(tg.latDeg, tg.lonEastDeg)
  const MOTION = v3.mul(enu(L).e, -1) // westward (conceptual)
  const onOrbit = (th: number, r: number): V3 => v3.mul(v3.add(v3.mul(L, Math.cos(th)), v3.mul(MOTION, Math.sin(th))), r)
  const TH_PDI = -PD_RANGE / R_MOON
  const TH_DOI = TH_PDI - Math.PI
  const thOrb = (t: number) => TH_DOI + W_ORB * (t - T_DOI)

  // LEO in the plane that contains the Moon's direction at arrival, departing from the far side of Earth
  const mArr = v3.norm(moonEci(ms(T_LOI)))
  const n = v3.norm(v3.cross(mArr, [0, 1, 0]))
  const u0 = v3.norm(rotAxis(v3.mul(mArr, -1), n, -0.5))
  const leo = (t: number): V3 => v3.mul(rotAxis(u0, n, LEO_W * t), LEO_R)
  const burnEnd = (() => {
    const r = leo(BURN1)
    const tang = v3.norm(v3.cross(n, v3.norm(r)))
    return { r, v: v3.mul(tang, 10.86e3) }
  })()
  const coast = (t: number): V3 => {
    if (t <= BURN0) return leo(t)
    if (t <= BURN1) { const f = smooth((t - BURN0) / (BURN1 - BURN0)); return v3.mul(v3.norm(leo(t)), LEO_R + 60e3 * f) }
    const c = kepler(burnEnd.r, burnEnd.v, t - BURN1, MU_EARTH).r
    const m = moonEci(ms(t))
    const arrive = v3.add(m, v3.mul(v3.norm(v3.cross(n, m)), -(R_MOON + 600e3)))
    return v3.lerp(c, arrive, smooth(ramp(t, 3 * 3600, T_LOI)))
  }
  const lander = (t: number): V3 => {
    if (t <= T_DOI) return onOrbit(thOrb(t), ORBIT_R)
    if (t <= T_PDI) {
      const f = (t - T_DOI) / (T_PDI - T_DOI)
      const M = Math.PI + Math.PI * f
      let E = M
      for (let i = 0; i < 20; i++) E -= (E - DE * Math.sin(E) - M) / (1 - DE * Math.cos(E))
      const nu = 2 * Math.atan2(Math.sqrt(1 + DE) * Math.sin(E / 2), Math.sqrt(1 - DE) * Math.cos(E / 2))
      const r = (DA * (1 - DE * DE)) / (1 + DE * Math.cos(nu))
      const nuPos = ((nu % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      return onOrbit(TH_PDI - (2 * Math.PI - nuPos), r)
    }
    const tau = clamp01((t - T_PDI) / PD_T)
    const s = (1 - Math.pow(1 - tau, 2.25)) * PD_RANGE
    const h = MOON_HANDOFF_ALT + (15e3 - MOON_HANDOFF_ALT) * Math.pow(1 - tau, 1.7)
    return onOrbit(TH_PDI + s / R_MOON, R_MOON + h)
  }
  const sunMoon = (t: number): V3 => {
    // the Sun's real direction, carried into the Moon-fixed frame by keeping the landing moment's sun elevation at the site
    // (the site daylight moment is sourced; the frame rotation over the few hours shown is negligible)
    const { e, n: nn, u } = enu(L)
    const el = (10 + ((t - T_END) / 3600) * 0.508) * D2R
    return v3.norm(v3.add(v3.mul(u, Math.sin(el)), v3.add(v3.mul(e, Math.cos(el)), v3.mul(nn, 0))))
  }
  const frame = (t: number): Frame => {
    if (t < T_LOI - 1800) {
      const inEarth = t < 2 * 3600
      const p = coast(t)
      const vel = velOf(coast, t, 2)
      const f = v3.norm(vel)
      const burning = t > BURN0 && t < BURN1
      const objs: Obj[] = [{ key: 'craft', model: 'exp-lander', pos: p, fwd: burning ? f : v3.mul(f, -1), side: sideOf(f, n), p: { stowed: 1 } }]
      if (t < BURN1 + 300) objs.push({ key: 'stage', model: 'exp-stage', pos: v3.sub(p, v3.mul(f, 9 + (t > BURN1 ? (t - BURN1) * 0.4 : 0))), fwd: f, side: sideOf(f, n), thrust: burning ? 1 : 0, fade: t > BURN1 ? 1 - smooth((t - BURN1 - 200) / 100) : 1 })
      if (inEarth) {
        const th = gmst(ms(t))
        const fix = (q: V3) => rotY(q, -th)
        objs.forEach((o) => { o.pos = fix(o.pos); o.fwd = fix(o.fwd); if (o.side) o.side = fix(o.side) })
        const pf = fix(p)
        return { env: 'earth', focus: pf, axis: fix(f), vel: fix(vel), up: v3.norm(pf), alt: v3.len(pf) - R_EARTH, sun: fix(sunEci(ms(t))), objects: objs, bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH }] }
      }
      const path: V3[] = []
      for (let i = 0; i <= 120; i++) path.push(coast(BURN1 + ((T_LOI - BURN1) * i) / 120))
      return {
        env: 'cislunar', focus: p, axis: f, vel, up: [0, 1, 0], alt: v3.len(p) - R_EARTH, sun: sunEci(ms(t)), objects: objs, path,
        bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH, rotY: gmst(ms(t)) }, { id: 'moon', pos: moonEci(ms(t)), radius: R_MOON }],
      }
    }
    const p = t < T_LOI ? onOrbit(thOrb(t), ORBIT_R + (T_LOI - t) * 300) : lander(t)
    const vel = t < T_LOI ? velOf((tt) => onOrbit(thOrb(tt), ORBIT_R + (T_LOI - tt) * 300), t, 1) : velOf(lander, t, 1)
    const burning = (t > T_LOI - 1 && t < T_LOI + 360) || (t > T_DOI && t < T_DOI + 30) || t > T_PDI
    const f = t > T_PDI ? thrustDir(lander, Math.min(t, T_END - 1), MU_MOON) : burning ? v3.mul(v3.norm(vel), -1) : v3.norm(v3.cross(v3.norm(p), v3.cross(MOTION, L)))
    return {
      env: 'moon', focus: p, axis: f, vel, up: v3.norm(p), alt: v3.len(p) - R_MOON, sun: sunMoon(t),
      objects: [{ key: 'craft', model: 'exp-lander', pos: p, fwd: f, side: sideOf(f, v3.norm(p)), thrust: burning ? 1 : 0, p: { legs: smooth(ramp(t, T_DOI, T_DOI + 600)) } }],
      bodies: [{ id: 'moon', pos: [0, 0, 0], radius: R_MOON }],
      site: { pos: v3.mul(L, R_MOON), up: L, e: enu(L).e, n: enu(L).n, kind: 'moon' },
    }
  }
  const phases: Phase[] = [
    { id: 'depart', t0: 0, t1: 2 * 3600, env: 'earth-near', title: 'Earth departure', summary: 'From low Earth orbit, the departure stage burns for the Moon' },
    { id: 'coast', t0: 2 * 3600, t1: T_LOI - 1800, env: 'cislunar', title: 'Translunar coast', summary: `${tg.cruiseDays.toFixed(1)} days to the Moon, as long as ${tg.cruiseMission} took` },
    { id: 'orbit', t0: T_LOI - 1800, t1: T_DOI, env: 'moon-near', title: 'Lunar orbit', summary: 'Braking into orbit 100 km up, one revolution to line up with the site' },
    { id: 'descent', t0: T_DOI, t1: T_END, env: 'moon-near', title: `Descent to ${tg.name}`, summary: 'Descent orbit, then the powered descent' },
  ]
  const segments: Segment[] = [
    { t0: 0, t1: BURN1 + 120, play: 14 }, { t0: BURN1 + 120, t1: 2 * 3600, play: 6 }, { t0: 2 * 3600, t1: T_LOI - 1800, play: 14 },
    { t0: T_LOI - 1800, t1: T_LOI + 420, play: 9 }, { t0: T_LOI + 420, t1: T_DOI, play: 7 }, { t0: T_DOI, t1: T_PDI, play: 8 }, { t0: T_PDI, t1: T_END, play: 20 },
  ]
  const events: MissionEvent[] = [
    ev('leo', 0, 'In low Earth orbit', 'The expedition craft and its departure stage circle Earth 300 km up.', 'orbit'),
    ev('burn', BURN0, 'Departure burn', 'The departure stage fires to send the craft toward the Moon.', 'ignition', { cue: 'ignition' }),
    ev('stage-sep', BURN1 + 30, 'Stage separation', 'The spent departure stage is released.', 'separation', { cue: 'pyro' }),
    ev('coast', 2 * 3600, 'Coast to the Moon', `The coast takes as long as ${tg.cruiseMission} took from launch to landing.`, 'coast', { basis: 'derived', timeNote: `${tg.cruiseDays.toFixed(2)} days: the real mission's launch → landing time from the catalogue dates.`, sources: tg.cruiseSources }),
    ev('loi', T_LOI, 'Lunar orbit insertion', 'The craft brakes into a 100 km lunar orbit.', 'ignition', { cue: 'ignition' }),
    ev('doi', T_DOI, 'Descent orbit', 'A short burn lowers the far side of the orbit to 15 km above the site.', 'burn', { cue: 'ignition' }),
    ev('pdi', T_PDI, 'Powered descent', `The engine burns all the way down to ${tg.name}.`, 'ignition', { cue: 'ignition' }),
    ev('hover', T_END, 'Final approach', 'Hovering over the landing point beside the historic hardware.', 'landing', { cue: 'beep' }),
  ]
  const shots: ShotCue[] = [
    { t: 0, shot: { kind: 'side', dist: 40, elev: 15, azim: 70, fov: 42 }, label: 'Departure' },
    { t: BURN1 + 200, shot: { kind: 'wide', dist: 2.4, elev: 20, azim: 120, fov: 40 } },
    { t: 2 * 3600, shot: { kind: 'wide', dist: 30, elev: 14, azim: 100, fov: 38 } },
    { t: T_LOI - 1800, shot: { kind: 'chase', dist: 60, elev: 18, azim: 200, fov: 45 }, label: 'Lunar orbit' },
    { t: T_LOI + 420, shot: { kind: 'wide', dist: 1.4, elev: 25, azim: 120, fov: 40 } },
    { t: T_DOI, shot: { kind: 'chase', dist: 70, elev: 16, azim: 190, fov: 45 }, label: 'Descent' },
    { t: T_PDI + 420, shot: { kind: 'side', dist: 55, elev: 12, azim: 80, fov: 46 } },
  ]
  return {
    kind: 'expedition', dest: 'moon', siteId: tg.siteId, direction: 'outbound', frame,
    id: `expedition-moon-${tg.siteId}`, missionId: '', title: `Expedition to ${tg.name}`, subtitle: 'Explore · conceptual expedition',
    epochMs: epoch, epochNote: `Arrival is timed for the site's sourced daylight moment; the coast lasts ${tg.cruiseDays.toFixed(2)} days, the real ${tg.cruiseMission} launch → landing time.`,
    vehicle: 'saturn-v', clock: 'days', phases, events, segments, telemetry: [], shots,
    illustrative: [
      'The expedition craft, its departure stage and the whole flight sequence are CONCEPTUAL — not a NASA spacecraft and not a real mission.',
      'Orbits follow two-body physics around the app\'s real Earth and Moon positions; the coast is bent to meet the Moon at arrival.',
      'Lunar orbit (100 km), the descent orbit (15 km) and the powered descent are conceptual; the landing happens on the measured LROC terrain of the site.',
      'Sound is synthesised sound design, not archival audio.',
    ],
    conclusion: { title: 'Landed', text: '', sources: [] },
  }
}

// ════════════════════════════════════════════════════════════════════════════════════ Moon, return
export function moonReturn(tg: ExpeditionTarget, startMs: number): MissionScript {
  const ms = (t: number) => startMs + t * 1000
  const L = llUnit(tg.latDeg, tg.lonEastDeg)
  const MOTION = v3.mul(enu(L).e, -1)
  const onOrbit = (th: number, r: number): V3 => v3.mul(v3.add(v3.mul(L, Math.cos(th)), v3.mul(MOTION, Math.sin(th))), r)
  const ORBIT_R = R_MOON + 100e3
  const W = Math.sqrt(MU_MOON / Math.pow(ORBIT_R, 3))
  const ASC = 480, TEI = 2600, TEI_END = TEI + 300
  const C = Math.max(1, tg.cruiseDays - 1.2) * 86400
  const END = TEI_END + C + 1800
  const asc = (t: number): V3 => {
    const tau = clamp01(t / ASC)
    const vc = W * ORBIT_R
    const s = (vc * ASC * Math.pow(tau, 2.5)) / 2.5
    const h = MOON_HANDOFF_ALT * 0.7 + (100e3 - MOON_HANDOFF_ALT * 0.7) * Math.pow(smooth(tau), 0.8)
    if (t <= ASC) return onOrbit(s / R_MOON, R_MOON + h)
    const th0 = (vc * ASC) / 2.5 / R_MOON
    return onOrbit(th0 + W * (t - ASC), ORBIT_R + (t > TEI ? 500 * (t - TEI) * clamp01((t - TEI) / 300) : 0))
  }
  const homeDir = (t: number): V3 => v3.norm(v3.mul(moonEci(ms(t)), -1))
  const home = (t: number): V3 => {
    // Earth-centred: from the Moon's position at TEI to a 400 km Earth orbit at the end
    const m0 = moonEci(ms(TEI_END))
    const r0 = v3.len(m0)
    const f = smooth(ramp(t, TEI_END, TEI_END + C))
    const dir = slerp(v3.norm(m0), v3.norm(rotAxis(v3.norm(m0), [0, 1, 0], 1.2)), f)
    const r = r0 + (R_EARTH + 400e3 - r0) * Math.pow(f, 0.8)
    const capture = clamp01((t - TEI_END - C) / 1800)
    return v3.mul(rotAxis(dir, v3.norm(v3.cross(dir, [0, 1, 0])), capture * 1.1), r)
  }
  const frame = (t: number): Frame => {
    if (t < TEI_END + 600) {
      const p = asc(t)
      const vel = velOf(asc, t, 1)
      const burning = t < ASC || (t > TEI && t < TEI_END)
      const f = t < ASC ? thrustDir(asc, Math.max(1, Math.min(t, ASC - 1)), MU_MOON) : v3.norm(vel)
      return {
        env: 'moon', focus: p, axis: f, vel, up: v3.norm(p), alt: v3.len(p) - R_MOON, sun: v3.norm(v3.add(v3.mul(L, 0.2), v3.mul(enu(L).e, 0.98))),
        objects: [{ key: 'craft', model: 'exp-lander', pos: p, fwd: f, side: sideOf(f, v3.norm(p)), thrust: burning ? 1 : 0, p: { legs: 1 } }],
        bodies: [{ id: 'moon', pos: [0, 0, 0], radius: R_MOON }], site: { pos: v3.mul(L, R_MOON), up: L, e: enu(L).e, n: enu(L).n, kind: 'moon' },
      }
    }
    const p = home(t)
    const vel = velOf(home, t, 30)
    const f = v3.norm(vel)
    const path: V3[] = []
    for (let i = 0; i <= 120; i++) path.push(home(TEI_END + ((END - TEI_END) * i) / 120))
    return {
      env: 'cislunar', focus: p, axis: f, vel, up: [0, 1, 0], alt: v3.len(p) - R_EARTH, sun: sunEci(ms(t)), path,
      objects: [{ key: 'craft', model: 'exp-lander', pos: p, fwd: v3.mul(f, -1), side: sideOf(f, [0, 1, 0]), p: { legs: 0 } }],
      bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH, rotY: gmst(ms(t)) }, { id: 'moon', pos: moonEci(ms(t)), radius: R_MOON }],
    }
  }
  void homeDir
  return {
    kind: 'expedition', dest: 'moon', siteId: tg.siteId, direction: 'return', frame,
    id: `expedition-moon-return-${tg.siteId}`, missionId: '', title: `Return from ${tg.name}`, subtitle: 'Explore · conceptual expedition',
    epochMs: startMs, epochNote: 'The return starts at the moment you leave the surface.',
    vehicle: 'saturn-v', clock: 'days',
    phases: [
      { id: 'ascent', t0: 0, t1: ASC + 600, env: 'moon-near', title: 'Ascent to orbit', summary: 'Back up to a 100 km lunar orbit' },
      { id: 'tei', t0: ASC + 600, t1: TEI_END + 600, env: 'moon-near', title: 'Leaving the Moon', summary: 'The return burn' },
      { id: 'home', t0: TEI_END + 600, t1: END, env: 'cislunar', title: 'Coast home', summary: 'Back to Earth orbit' },
    ],
    events: [
      ev('liftoff', 0, 'Liftoff', `Leaving ${tg.name}; the historic hardware stays where it was left.`, 'liftoff', { cue: 'ignition' }),
      ev('orbit', ASC, 'Lunar orbit', 'In a 100 km orbit.', 'orbit'),
      ev('tei', TEI, 'Return burn', 'The engine fires to leave lunar orbit for Earth.', 'ignition', { cue: 'ignition' }),
      ev('earth', TEI_END + C, 'Earth arrival', 'Captured into a 400 km Earth orbit — back to the explorer.', 'orbit', { cue: 'beep' }),
    ],
    segments: [{ t0: 0, t1: ASC, play: 16 }, { t0: ASC, t1: TEI, play: 6 }, { t0: TEI, t1: TEI_END + 600, play: 8 }, { t0: TEI_END + 600, t1: END, play: 16 }],
    telemetry: [],
    shots: [
      { t: 0, shot: { kind: 'chase', dist: 50, elev: 25, azim: 200, fov: 46 }, label: 'Ascent' },
      { t: ASC, shot: { kind: 'wide', dist: 1.4, elev: 25, azim: 120, fov: 40 } },
      { t: TEI - 200, shot: { kind: 'side', dist: 50, elev: 12, azim: 70, fov: 44 }, label: 'Return burn' },
      { t: TEI_END + 600, shot: { kind: 'wide', dist: 30, elev: 14, azim: 100, fov: 38 }, label: 'Homeward' },
    ],
    illustrative: [
      'The expedition craft and the return sequence are CONCEPTUAL — not a NASA spacecraft and not a real mission.',
      'Earth and Moon are at their real positions for the date; the return path is illustrative.',
      'Sound is synthesised sound design, not archival audio.',
    ],
    conclusion: { title: 'Home', text: '', sources: [] },
  }
}

// ════════════════════════════════════════════════════════════════════════════════════ Mars, outbound
export const MARS_LANDING_LOCAL: V3 = [0, 0, 0]
export function marsOutbound(tg: ExpeditionTarget, landingMs: number): MissionScript {
  const C = Math.max(30, tg.cruiseDays) * 86400
  const T_E = C - 600 // entry interface, 10 minutes before the end
  const T_CHUTE = T_E + 240, T_PWR = T_E + 330, T_TD = T_E + 372, T_RAMP = T_TD + 12, T_DRIVE = T_TD + 24, END = T_TD + 60
  const epoch = landingMs - END * 1000
  const ms = (t: number) => epoch + t * 1000
  const SITE = llUnit(tg.latDeg, tg.lonEastDeg)
  // Earth departure (Earth-fixed for drawing), then a hyperbolic climb-out (illustrative)
  const n: V3 = [0, 1, 0]
  const u0 = llUnit(0, 0)
  const leo = (t: number): V3 => v3.mul(rotAxis(u0, n, LEO_W * t), LEO_R)
  const depart = (t: number): V3 => {
    if (t <= BURN0) return leo(t)
    const r = leo(Math.min(t, BURN1 + 200))
    const tang = v3.norm(v3.cross(n, v3.norm(r)))
    const k = smooth(ramp(t, BURN0, BURN1))
    const out = t > BURN1 ? (t - BURN1) * 11.4e3 : 0
    return v3.add(v3.mul(v3.norm(r), LEO_R + 50e3 * k + out * 0.35), v3.mul(tang, out * 0.94))
  }
  const helio = (t: number): V3 => {
    const t0 = 2 * 3600, t1 = T_E
    const e0 = helioEcliptic('earth', ms(t0)), m1 = helioEcliptic('mars', ms(t1))
    const a0 = Math.atan2(-e0[2], e0[0])
    let d = Math.atan2(-m1[2], m1[0]) - a0
    while (d < 0.6) d += 2 * Math.PI // prograde
    const f = clamp01((t - t0) / (t1 - t0))
    const r = v3.len(e0) + (v3.len(m1) - v3.len(e0)) * smooth(f)
    const a = a0 + d * f
    return [r * Math.cos(a), e0[1] + (m1[1] - e0[1]) * f, -r * Math.sin(a)]
  }
  // Mars approach and entry (Mars-fixed): 125 km interface 700 km uprange (conceptual)
  const AZ = 100
  const gc = (u: V3, az: number, d: number): V3 => {
    const { e, n: nn } = enu(u)
    const dir = v3.norm(v3.add(v3.mul(nn, Math.cos(az * D2R)), v3.mul(e, Math.sin(az * D2R))))
    return v3.norm(v3.add(v3.mul(u, Math.cos(d / R_MARS)), v3.mul(dir, Math.sin(d / R_MARS))))
  }
  const entryG = gc(SITE, AZ + 180, 700e3)
  const mars = (t: number): V3 => {
    if (t <= T_E) {
      const toSite = v3.norm(v3.sub(SITE, v3.mul(entryG, v3.dot(SITE, entryG))))
      const vin = v3.mul(v3.norm(v3.add(v3.mul(toSite, Math.cos(-12 * D2R)), v3.mul(entryG, Math.sin(-12 * D2R)))), 5600)
      return v3.add(v3.mul(entryG, R_MARS + 125e3), v3.mul(vin, t - T_E))
    }
    const f = clamp01((t - T_E) / (T_CHUTE - T_E))
    const g = gc(entryG, AZ, (1 - Math.pow(1 - f, 2.2)) * (700e3 - 6e3))
    const h = 125e3 * Math.pow(1 - f, 1.8) + 10e3 * (1 - Math.pow(1 - f, 1.8))
    return v3.mul(g, R_MARS + h)
  }
  // local frame at the landing point (x east, y up, z south)
  const localAlt = (t: number) => {
    if (t < T_PWR) return 10e3 - (10e3 - 1500) * smooth((t - T_CHUTE) / (T_PWR - T_CHUTE))
    if (t < T_TD) { const f = (t - T_PWR) / (T_TD - T_PWR); return 1500 * Math.pow(1 - f, 2.2) }
    return 0
  }
  const local = (t: number): V3 => [-(Math.max(0, T_TD - t)) * 4, localAlt(t), 0]
  const frame = (t: number): Frame => {
    if (t < 2 * 3600) {
      const th = gmst(ms(t))
      const fix = (q: V3) => rotY(q, -th)
      const p = depart(t), vel = velOf(depart, t, 1), f = v3.norm(vel)
      const burning = t > BURN0 && t < BURN1
      const objs: Obj[] = [{ key: 'craft', model: 'exp-capsule', pos: fix(p), fwd: fix(f), side: fix(sideOf(f, n)) }]
      if (t < BURN1 + 300) objs.push({ key: 'stage', model: 'exp-stage', pos: fix(v3.sub(p, v3.mul(f, 9 + (t > BURN1 ? (t - BURN1) * 0.4 : 0)))), fwd: fix(f), side: fix(sideOf(f, n)), thrust: burning ? 1 : 0, fade: t > BURN1 ? 1 - smooth((t - BURN1 - 200) / 100) : 1 })
      const pf = fix(p)
      return { env: 'earth', focus: pf, axis: fix(f), vel: fix(vel), up: v3.norm(pf), alt: v3.len(pf) - R_EARTH, sun: fix(sunEci(ms(t))), objects: objs, bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH }] }
    }
    if (t < T_E - 900) {
      const p = helio(t), vel = velOf(helio, t, 3600)
      const path: V3[] = []
      for (let i = 0; i <= 160; i++) path.push(helio(2 * 3600 + ((T_E - 2 * 3600) * i) / 160))
      const f = v3.norm(v3.mul(p, -1))
      return {
        env: 'interplanetary', focus: p, axis: f, vel, up: [0, 1, 0], alt: 1e12, sun: f, path,
        objects: [{ key: 'craft', model: 'exp-capsule', pos: p, fwd: f, side: sideOf(f, [0, 1, 0]) }],
        bodies: [{ id: 'sun', pos: [0, 0, 0], radius: 6.957e8 }, { id: 'earth', pos: helioEcliptic('earth', ms(t)), radius: 6.371e6 }, { id: 'mars', pos: helioEcliptic('mars', ms(t)), radius: R_MARS }],
      }
    }
    const mt = marsTime(ms(t))
    const sp = sunPosition(mt, tg.latDeg, tg.lonEastDeg).enu
    if (t < T_CHUTE) {
      const p = mars(t), vel = velOf(mars, t, 0.5), vd = v3.norm(vel), up = v3.norm(p)
      const { e, n: nn, u } = enu(SITE)
      const plasma = smooth(ramp(t, T_E + 20, T_E + 70)) * (1 - smooth(ramp(t, T_E + 150, T_E + 210)))
      return {
        env: 'mars', focus: p, axis: v3.mul(vd, -1), vel, up, alt: v3.len(p) - R_MARS, sun: v3.norm(v3.add(v3.add(v3.mul(e, sp[0]), v3.mul(nn, sp[1])), v3.mul(u, sp[2]))), plasma,
        objects: [{ key: 'craft', model: 'exp-capsule', pos: p, fwd: v3.mul(vd, -1), side: sideOf(vd, up) }],
        bodies: [{ id: 'mars', pos: [0, 0, 0], radius: R_MARS }], site: { pos: v3.mul(SITE, R_MARS), up: SITE, e, n: nn, kind: 'mars' },
      }
    }
    const p = local(t)
    const vel = velOf(local, t, 0.2)
    const up: V3 = [0, 1, 0]
    const objs: Obj[] = []
    const shellCut = T_PWR
    const back: V3 = t < shellCut ? v3.add(p, [0, 3.2, 0]) : v3.add(local(shellCut), [8 * (t - shellCut), 3.2 + 30 * (t - shellCut), 3 * (t - shellCut)])
    objs.push({ key: 'backshell', model: 'exp-capsule', pos: back, fwd: up, side: [1, 0, 0], p: { backOnly: 1 }, fade: t > shellCut ? 1 - smooth((t - shellCut - 10) / 10) : 1 })
    objs.push({ key: 'chute', model: 'mer-chute', pos: v3.add(back, [0, 3, 0]), fwd: up, side: [1, 0, 0], p: { open: smooth(ramp(t, T_CHUTE, T_CHUTE + 2)) }, fade: t > shellCut ? 1 - smooth((t - shellCut - 10) / 10) : 1 })
    if (t < T_CHUTE + 30) objs.push({ key: 'heatshield', model: 'exp-heatshield', pos: v3.add(p, [0, -0.4 - 0.5 * 3.71 * Math.pow(Math.max(0, t - T_CHUTE - 8), 2) * 0.3, 0]), fwd: up, side: [1, 0, 0], fade: 1 - smooth((t - T_CHUTE - 20) / 10) })
    objs.push({ key: 'craft', model: 'exp-mlander', pos: p, fwd: up, side: [1, 0, 0], thrust: t > T_PWR - 2 && t < T_TD ? 1 : 0, p: { ramp: smooth(ramp(t, T_TD + 4, T_RAMP)), legs: smooth(ramp(t, T_PWR - 30, T_PWR)) } })
    const drive = smooth(ramp(t, T_DRIVE, END - 8))
    objs.push({ key: 'rover', model: 'exp-rover', pos: v3.add(p, [0, 1.25 * (1 - smooth(ramp(t, T_RAMP + 2, T_DRIVE + 8))) + 0.02, 1.2 + 7 * drive]), fwd: up, side: [1, 0, 0], p: { drive } })
    return {
      env: 'mars-local', focus: v3.add(p, [0, 1.4, t > T_DRIVE ? 4 * drive : 0]), axis: up, vel, up, alt: p[1], sun: v3.norm([sp[0], sp[2], -sp[1]]), objects: objs, bodies: [],
      site: { pos: [0, 0, 0], up, e: [1, 0, 0], n: [0, 0, -1], kind: 'mars' },
    }
  }
  return {
    kind: 'expedition', dest: 'mars', siteId: tg.siteId, direction: 'outbound', frame,
    id: `expedition-mars-${tg.siteId}`, missionId: '', title: `Expedition to ${tg.name}`, subtitle: 'Explore · conceptual expedition',
    epochMs: epoch, epochNote: `Arrival is timed for the scene date; the cruise lasts ${tg.cruiseDays.toFixed(0)} days, the real ${tg.cruiseMission} launch → landing time.`,
    vehicle: 'delta-ii-7925h', clock: 'days',
    phases: [
      { id: 'depart', t0: 0, t1: 2 * 3600, env: 'earth-near', title: 'Earth departure', summary: 'The departure stage sends the expedition toward Mars' },
      { id: 'cruise', t0: 2 * 3600, t1: T_E - 900, env: 'interplanetary', title: 'Cruise to Mars', summary: `${tg.cruiseDays.toFixed(0)} days, as long as ${tg.cruiseMission} took` },
      { id: 'approach', t0: T_E - 900, t1: T_E, env: 'mars-near', title: 'Mars approach', summary: 'Straight into the atmosphere from the approach path' },
      { id: 'entry', t0: T_E, t1: T_CHUTE, env: 'mars-near', title: 'Entry', summary: 'Heat shield first through the thin atmosphere' },
      { id: 'landing', t0: T_CHUTE, t1: T_TD, env: 'mars-descent', title: 'Parachute and powered landing', summary: `Down to ${tg.name}` },
      { id: 'deploy', t0: T_TD, t1: END, env: 'mars-surface', title: 'Rover deployment', summary: 'The ramp comes down and the rover drives off' },
    ],
    events: [
      ev('leo', 0, 'In low Earth orbit', 'The expedition entry capsule, with the rover inside, waits on its departure stage.', 'orbit'),
      ev('burn', BURN0, 'Departure burn', 'The departure stage fires for Mars.', 'ignition', { cue: 'ignition' }),
      ev('stage-sep', BURN1 + 30, 'Stage separation', 'The spent stage is released.', 'separation', { cue: 'pyro' }),
      ev('cruise', 2 * 3600, 'Cruise', `The cruise takes as long as ${tg.cruiseMission} took from launch to landing.`, 'coast', { basis: 'derived', timeNote: `${tg.cruiseDays.toFixed(1)} days: the real mission's launch → landing time from the catalogue dates.`, sources: tg.cruiseSources }),
      ev('entry', T_E, 'Atmospheric entry', 'Into the atmosphere at about 5.6 km/s, heat shield first.', 'entry'),
      ev('chute', T_CHUTE, 'Parachute', 'The parachute opens 10 km up; the heat shield falls away.', 'parachute', { cue: 'chute' }),
      ev('powered', T_PWR, 'Powered landing', 'The lander drops from the backshell and flies down on its engines.', 'ignition', { cue: 'ignition' }),
      ev('touchdown', T_TD, 'Touchdown', `On the ground at ${tg.name}.`, 'landing', { cue: 'touchdown' }),
      ev('ramp', T_RAMP, 'Ramp down', 'The ramp unfolds to the ground.', 'deploy', { cue: 'pyro' }),
      ev('drive', T_DRIVE, 'Rover drives off', 'The expedition rover rolls onto Mars — the camera rover you explore with.', 'surface', { cue: 'touchdown' }),
    ],
    segments: [
      { t0: 0, t1: BURN1 + 120, play: 12 }, { t0: BURN1 + 120, t1: 2 * 3600, play: 4 }, { t0: 2 * 3600, t1: T_E - 900, play: 16 },
      { t0: T_E - 900, t1: T_E, play: 6 }, { t0: T_E, t1: T_CHUTE, play: 12 }, { t0: T_CHUTE, t1: T_TD, play: 16 }, { t0: T_TD, t1: END, play: 14 },
    ],
    telemetry: [],
    shots: [
      { t: 0, shot: { kind: 'side', dist: 30, elev: 15, azim: 70, fov: 42 }, label: 'Departure' },
      { t: BURN1 + 200, shot: { kind: 'wide', dist: 2.4, elev: 20, azim: 120, fov: 40 } },
      { t: 2 * 3600, shot: { kind: 'wide', dist: 1, elev: 30, azim: 20, fov: 40 }, label: 'Cruise' },
      { t: T_E - 900, shot: { kind: 'side', dist: 18, elev: 8, azim: 90, fov: 42 }, label: 'Approach' },
      { t: T_E - 120, shot: { kind: 'chase', dist: 30, elev: 14, azim: 200, fov: 45 }, label: 'Entry' },
      { t: T_CHUTE, shot: { kind: 'side', dist: 60, elev: 4, azim: 90, fov: 45 }, label: 'Parachute' },
      { t: T_PWR - 5, shot: { kind: 'low', dist: 40, elev: 10, azim: 150, fov: 48 }, label: 'Landing' },
      { t: T_TD + 2, shot: { kind: 'low', dist: 14, elev: 14, azim: 140, fov: 46 }, label: 'Deployment' },
    ],
    illustrative: [
      'The expedition capsule, lander, rover and the whole flight sequence are CONCEPTUAL — not a NASA spacecraft and not a real mission.',
      'Earth and Mars are at their computed positions; the cruise path is an illustrative arc and the entry track is illustrative.',
      'The terrain of this landing scene is illustrative; the surface you explore next is the measured HiRISE terrain in the embedded Unity view.',
      'Sound is synthesised sound design, not archival audio.',
    ],
    conclusion: { title: 'Landed', text: '', sources: [] },
  }
}

// ════════════════════════════════════════════════════════════════════════════════════ Mars, return (the view)
export function marsReturn(tg: ExpeditionTarget, startMs: number): MissionScript {
  const ms = (t: number) => startMs + t * 1000
  const SITE = llUnit(tg.latDeg, tg.lonEastDeg)
  const END = 1500
  const h = (t: number) => 2 + 400e3 * Math.pow(clamp01(t / END), 2.6)
  const frame = (t: number): Frame => {
    const mt = marsTime(ms(t))
    const sp = sunPosition(mt, tg.latDeg, tg.lonEastDeg).enu
    const alt = h(t)
    if (alt < 9000) {
      // the view pulls back from the rover and its lander (the shots widen); the subject stays on the ground
      return {
        env: 'mars-local', focus: [0, 1, 4], axis: [0, 1, 0], vel: [0, 0, 0], up: [0, 1, 0], alt: 1, sun: v3.norm([sp[0], sp[2], -sp[1]]),
        objects: [{ key: 'rover', model: 'exp-rover', pos: [0, 0.02, 8.2], fwd: [0, 1, 0], side: [1, 0, 0], p: { drive: 1 } }, { key: 'lander', model: 'exp-mlander', pos: [0, 0, 0], fwd: [0, 1, 0], side: [1, 0, 0], p: { ramp: 1, legs: 1 } }],
        bodies: [], site: { pos: [0, 0, 0], up: [0, 1, 0], e: [1, 0, 0], n: [0, 0, -1], kind: 'mars' },
      }
    }
    const { e, n, u } = enu(SITE)
    const p = v3.mul(SITE, R_MARS + alt)
    return {
      env: 'mars', focus: p, axis: SITE, vel: v3.mul(SITE, 100), up: SITE, alt, sun: v3.norm(v3.add(v3.add(v3.mul(e, sp[0]), v3.mul(n, sp[1])), v3.mul(u, sp[2]))), objects: [],
      bodies: [{ id: 'mars', pos: [0, 0, 0], radius: R_MARS }], site: { pos: v3.mul(SITE, R_MARS), up: SITE, e, n, kind: 'mars' },
    }
  }
  return {
    kind: 'expedition', dest: 'mars', siteId: tg.siteId, direction: 'return', frame,
    id: `expedition-mars-return-${tg.siteId}`, missionId: '', title: `Leaving ${tg.name}`, subtitle: 'Explore · the view returns to orbit',
    epochMs: startMs, epochNote: 'The rover stays on Mars, as every Mars rover has; only your view returns to orbit.',
    vehicle: 'delta-ii-7925h', clock: 'days',
    phases: [
      { id: 'rise', t0: 0, t1: 600, env: 'mars-surface', title: 'Rising over the site', summary: 'The rover and its lander stay behind' },
      { id: 'orbit', t0: 600, t1: END, env: 'mars-near', title: 'Back to orbit', summary: 'Mars falls away' },
    ],
    events: [
      ev('rise', 0, 'Leaving the surface', 'The expedition rover stays on Mars; your view climbs away from it.', 'surface'),
      ev('orbit', 900, 'Orbit', 'Back above Mars — returning to the explorer.', 'orbit', { cue: 'beep' }),
    ],
    segments: [{ t0: 0, t1: 600, play: 9 }, { t0: 600, t1: END, play: 7 }],
    telemetry: [],
    shots: [
      { t: 0, shot: { kind: 'low', dist: 12, elev: 12, azim: 150, fov: 46 } },
      { t: 60, shot: { kind: 'top', dist: 70, elev: 45, azim: 170, fov: 46 }, label: 'Leaving the rover' },
      { t: 220, shot: { kind: 'top', dist: 600, elev: 60, azim: 190, fov: 46 } },
      { t: 420, shot: { kind: 'top', dist: 3000, elev: 75, azim: 200, fov: 46 } },
      { t: 700, shot: { kind: 'wide', dist: 1.6, elev: 30, azim: 120, fov: 40 }, label: 'Orbit' },
    ],
    illustrative: ['A camera move, not a vehicle: the rover stays on Mars.', 'Sound is synthesised sound design, not archival audio.'],
    conclusion: { title: 'Orbit', text: '', sources: [] },
  }
}
