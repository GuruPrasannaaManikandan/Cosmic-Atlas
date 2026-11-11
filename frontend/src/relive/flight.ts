/**
 * Flight models: where every piece of hardware is, which way it points and which engines burn, at mission time t.
 *
 * Built ONLY from the scripts' published values plus physics (two-body orbits, gravity, the thrust direction that the
 * computed path needs). Where nothing is published (orbit plane at the Moon, the descent ground track, entry corridors,
 * the bounces), the geometry is illustrative and the script's `illustrative` list says so.
 */
import { APOLLO_11, get } from './scripts/apollo11'
import { MER_ENTRY, MER_LANDING, OPPORTUNITY } from './scripts/opportunity'
import type { Met } from './types'
import {
  D2R, MU_EARTH, MU_MOON, R_EARTH, R_MARS, R_MOON, type V3, clamp01, enu, gmst, helioEcliptic, kepler, llUnit,
  monotone, moonEci, ramp, rotAxis, rotY, smooth, sunEci, v3,
} from './geo'
import { marsTime, sunPosition } from '../realism/marsTime'

export type FlightEnv = 'earth' | 'cislunar' | 'moon' | 'interplanetary' | 'mars' | 'mars-local'

export type ModelKind =
  | 'sic' | 'sii' | 'interstage' | 'sivb' | 'sla-upper' | 'sm' | 'cm' | 'les' | 'lm' | 'lm-descent' | 'lm-ascent'
  | 'astronaut' | 'flag' | 'easep' | 'lrrr' | 'drogue' | 'mains'
  | 'delta-core' | 'gem' | 'fairing' | 'delta-stage2' | 'star48' | 'mer-cruise' | 'mer-aeroshell' | 'mer-heatshield'
  | 'mer-backshell' | 'mer-chute' | 'mer-lander' | 'mer-rover'
  | 'exp-stage' | 'exp-lander' | 'exp-capsule' | 'exp-heatshield' | 'exp-mlander' | 'exp-rover'

export interface Obj {
  key: string
  model: ModelKind
  /** env-frame position (m) of the model origin (its base) */
  pos: V3
  /** model +Y axis */
  fwd: V3
  /** model +Z axis hint (roll); orthogonalised by the renderer */
  side?: V3
  /** engine plume 0..1 (0 = off) */
  thrust?: number
  /** 0..1 fade for parts leaving the shot */
  fade?: number
  /** free parameters for a model (petal opening, airbag inflation, spin, …) */
  p?: Record<string, number>
}

export interface Frame {
  env: FlightEnv
  /** the camera's subject (centre of attention) */
  focus: V3
  /** the subject's long axis and its velocity direction (for chase / side shots) */
  axis: V3
  vel: V3
  /** local vertical at the subject */
  up: V3
  /** altitude of the subject above the env body (m); for sky and atmosphere */
  alt: number
  /** unit vector toward the Sun (env frame) */
  sun: V3
  objects: Obj[]
  /** extra bodies / markers (cislunar, interplanetary) in the env frame */
  bodies: { id: 'earth' | 'moon' | 'mars' | 'sun'; pos: V3; radius: number; rotY?: number }[]
  /** a ground point used by 'ground' shots and local surface patches */
  site?: { pos: V3; up: V3; e: V3; n: V3; kind: 'pad' | 'moon' | 'ocean' | 'mars' }
  /** atmosphere-entry plasma 0..1 */
  plasma?: number
  /** path polyline (env frame) for cislunar / interplanetary views */
  path?: V3[]
  /** body rotation about +Y for the env body (Earth: GMST; others 0) — body-fixed envs use 0 */
  bodyRot?: number
}

// ════════════════════════════════════════════════════════════════════════════════════════════ shared helpers
const FT = 0.3048
const NMI = 1852
const between = (t: number, a: number, b: number) => t >= a && t < b

/** thrust direction needed by a path p(t): a − g (finite differences), as a unit vector */
function thrustDir(p: (t: number) => V3, t: number, mu: number, h = 1): V3 {
  const a = v3.mul(v3.add(v3.sub(p(t + h), v3.mul(p(t), 2)), p(t - h)), 1 / (h * h))
  const r = p(t)
  const g = v3.mul(r, -mu / Math.pow(v3.len(r), 3))
  const d = v3.sub(a, g)
  return v3.len(d) < 1e-6 ? v3.norm(r) : v3.norm(d)
}
const velOf = (p: (t: number) => V3, t: number, h = 0.5): V3 => v3.mul(v3.sub(p(t + h), p(t - h)), 1 / (2 * h))

/** great-circle point at distance d (m) from unit position u0 along azimuth az (deg from north), on a sphere of radius R */
function gcPoint(u0: V3, azDeg: number, d: number, R: number): V3 {
  const { e, n } = enu(u0)
  const dir = v3.norm(v3.add(v3.mul(n, Math.cos(azDeg * D2R)), v3.mul(e, Math.sin(azDeg * D2R))))
  const ang = d / R
  return v3.norm(v3.add(v3.mul(u0, Math.cos(ang)), v3.mul(dir, Math.sin(ang))))
}

// ════════════════════════════════════════════════════════════════════════════════════════════ APOLLO 11
const A = APOLLO_11
const E = (id: string) => A.events.find((e) => e.id === id)!.t
const T = {
  liftoff: E('liftoff'), ceco: E('sic-ceco'), oeco: E('sic-oeco'), sicSep: E('sic-sep'), siiIgn: E('sii-ign'), interstage: E('sii-interstage'), les: E('les-jett'),
  siiCeco: E('sii-ceco'), siiOeco: E('sii-oeco'), siiSep: E('sii-sep'), ivbIgn: E('sivb-ign1'), ivbCut: E('sivb-cut1'), eoi: E('eoi'),
  tliIgn: E('tli-ign'), tliCut: E('tli-cut'), tli: E('tli'), csmSep: E('csm-sep'), dock: E('docking'), eject: E('ejection'), evasive: E('evasive'),
  mcc1: E('mcc1'), loiIgn: E('loi-ign'), loiCut: E('loi-cut'), locIgn: E('loc-ign'), undock: E('undock'), doi: E('doi'), pdi: E('pdi'), alt50k: E('alt50k'),
  approach: E('approach'), landing: E('landing'), pdc: E('pdc'), firstStep: E('first-step'), lmp: E('lmp-surface'), flag: E('flag'), pse: E('pse'), lrrr: E('lrrr'),
  evaEnd: E('eva-end'), lmLiftoff: E('lm-liftoff'), lmIns: E('lm-insertion'), redock: E('redocking'), ascJett: E('ascent-jett'), teiIgn: E('tei-ign'), teiCut: E('tei-cut'),
  mccTe: E('mcc-te'), cmsm: E('cmsm-sep'), entry: E('entry'), drogue: E('drogue'), mains: E('mains'), splash: E('splashdown'), apexUp: E('apex-up'),
  sicIgn: E('sic-ignition'),
}
export const APOLLO_TIMES = T

// stack lengths (m) from the SP-4029 key-facts table; LES overlaps the CM so the total is the published 363.013 ft
export const SAT = {
  sic: 138.03 * FT, sii: 81.5 * FT, sivb: 58.63 * FT, iu: 3 * FT, sla: 28 * FT, slaUpper: 21.208 * FT, smStruct: (24.583 - 9.75) * FT, smBell: 9.75 * FT,
  cm: 11.417 * FT, les: 33.46 * FT, total: 363.013 * FT, dia: 33 * FT, sivbTop: 21.667 * FT, smDia: 12.833 * FT, lesDia: 4 * FT,
  interstage: 5.6, // illustrative ring height (the S-II aft interstage is drawn as the lower part of the S-II envelope)
}
const LES_OVERLAP = SAT.sic + SAT.sii + SAT.sivb + SAT.iu + SAT.sla + SAT.smStruct + SAT.cm + SAT.les - SAT.total

// ascent table (SP-4029): GET s, geocentric lat °N, lon °E, altitude n mi
const ASC = [
  [0.63, 28.447, -80.6041, 0.032], [66.3, 28.4523, -80.5853, 4.236], [83.0, 28.4624, -80.5499, 7.326],
  // the extracted table prints −81.1517 here, which contradicts its own 25.07 n mi downrange: −80.1517 is used
  [135.2, 28.5739, -80.1517, 23.761], [161.63, 28.7007, -79.6908, 35.701], [162.3, 28.7046, -79.6764, 36.029],
  [460.62, 30.9513, -69.4309, 97.28], [548.22, 31.7089, -64.1983, 101.142], [549.0, 31.7152, -64.1467, 101.175], [699.33, 32.4865, -53.4588, 103.202],
]
const ascT = ASC.map((r) => r[0])
const ascLat = monotone(ascT, ASC.map((r) => r[1]), 0)
const ascLon = monotone(ascT, ASC.map((r) => r[2]), 0)
const ascAlt = monotone(ascT, ASC.map((r) => Math.max(0, (r[3] - 0.032) * NMI)), 0)
export const PAD_39A = { lat: 28.447, lon: -80.6041 }

const PARK_R = R_EARTH + 99.65 * NMI // mean of 100.4 × 98.9 n mi (SP-4029, spherical Earth of 3,443.934 n mi)
const PARK_W = (2 * Math.PI) / (88.18 * 60)
const ms = (t: Met) => A.epochMs + t * 1000

/** inertial position at the S-IVB first cutoff, and the orbit's in-plane prograde direction (space-fixed heading 88.414°) */
const park0 = (() => {
  const t0 = 699.33
  const uFix = llUnit(32.4865, -53.4588)
  const u = rotY(uFix, gmst(ms(t0)))
  const { e, n } = enu(u)
  const h = 88.414 * D2R
  const dir = v3.norm(v3.add(v3.mul(n, Math.cos(h)), v3.mul(e, Math.sin(h))))
  return { t0, u, dir }
})()
const inertialToFixed = (p: V3, t: Met) => rotY(p, -gmst(ms(t)))

/** Earth-centred inertial position of the S-IVB from orbit insertion through TLI and the coast (m) */
function apolloEci(t: Met): V3 {
  const { t0, u, dir } = park0
  const ang = (tt: number) => PARK_W * (tt - t0)
  const circ = (tt: number, r: number): V3 => v3.mul(v3.add(v3.mul(u, Math.cos(ang(tt))), v3.mul(dir, Math.sin(ang(tt)))), r)
  if (t <= T.tliIgn) {
    // a smooth settle from the table's 103.2 n mi at cutoff to the 100 n mi mean parking orbit
    const r = R_EARTH + (103.202 * NMI) + (PARK_R - R_EARTH - 103.202 * NMI) * smooth((t - t0) / 900)
    return circ(t, r)
  }
  const tEnd = T.tli
  if (t <= tEnd) {
    const f = smooth(ramp(t, T.tliIgn, T.tliCut))
    return circ(t, PARK_R + (R_EARTH + 180.581 * NMI - PARK_R) * f)
  }
  return tliState(t)
}

/** after TLI: a two-body ellipse from the published TLI state (180.581 n mi, 35,545.6 ft/s, γ = 7.367°) */
const tliStart = (() => {
  const r0u = v3.norm(apolloEciCircAt(T.tli))
  const n = v3.norm(v3.cross(park0.u, park0.dir))
  const tang = v3.norm(v3.cross(n, r0u))
  const g = 7.367 * D2R, v = 35545.6 * FT
  return { r0: v3.mul(r0u, R_EARTH + 180.581 * NMI), v0: v3.add(v3.mul(r0u, v * Math.sin(g)), v3.mul(tang, v * Math.cos(g))) }
})()
function apolloEciCircAt(t: Met): V3 {
  const { t0, u, dir } = park0
  const a = PARK_W * (t - t0)
  return v3.add(v3.mul(u, Math.cos(a)), v3.mul(dir, Math.sin(a)))
}
export function tliState(t: Met): V3 {
  return kepler(tliStart.r0, tliStart.v0, t - T.tli, MU_EARTH).r
}

/** published Earth distances (altitude + R) for the coasts; directions slerp from the departure / to the Moon */
const outR = monotone(
  [T.tli, T.csmSep, T.dock, T.evasive, T.mcc1, T.loiIgn],
  [180.581, 3815.19, 5317.6, 16620.8, 109475.3].map((x) => R_EARTH + x * NMI).concat([0]),
)
function cislunarOut(t: Met): V3 {
  const mLoi = moonEci(ms(T.loiIgn))
  const dEnd = v3.len(mLoi) - (R_MOON + 400e3)
  const r = t < T.mcc1 ? outR(t) : monotone([T.mcc1, T.loiIgn], [R_EARTH + 109475.3 * NMI, dEnd])(t)
  const d0 = v3.norm(tliState(Math.min(t, T.evasive)))
  const d1 = v3.norm(v3.sub(mLoi, v3.mul(v3.norm(v3.cross([0, 1, 0], mLoi)), R_MOON + 400e3)))
  const f = smooth(ramp(t, T.evasive, T.loiIgn)) // illustrative direction blend
  return v3.mul(slerp(d0, d1, f), r)
}
function slerp(a: V3, b: V3, f: number): V3 {
  const c = Math.max(-1, Math.min(1, v3.dot(a, b)))
  const om = Math.acos(c)
  if (om < 1e-6) return a
  const s = Math.sin(om)
  return v3.add(v3.mul(a, Math.sin((1 - f) * om) / s), v3.mul(b, Math.sin(f * om) / s))
}
const homeR = monotone([T.teiCut, T.mccTe, T.cmsm, T.entry], [0, R_EARTH + 169087.2 * NMI, R_EARTH + 1778.3 * NMI, R_EARTH + 400000 * FT])
function cislunarHome(t: Met): V3 {
  const m0 = moonEci(ms(T.teiCut))
  const startR = v3.len(m0) - R_MOON - 400e3
  const r = t < T.mccTe ? monotone([T.teiCut, T.mccTe], [startR, R_EARTH + 169087.2 * NMI])(t) : homeR(t)
  const d0 = v3.norm(v3.sub(m0, v3.mul(v3.norm(v3.cross(m0, [0, 1, 0])), R_MOON + 400e3)))
  const d1 = rotY(llUnit(5, -150), gmst(ms(T.entry)))
  return v3.mul(slerp(d0, d1, smooth(ramp(t, T.teiCut, T.cmsm))), r)
}

// ── lunar orbit / descent geometry (Moon-fixed; illustrative plane through the landing site, westward motion)
const SITE_LAT = 0.67416, SITE_LON = 23.47314
const L = llUnit(SITE_LAT, SITE_LON)
const MOTION = v3.mul(enu(L).e, -1) // westward (illustrative)
const ON = v3.norm(v3.cross(L, MOTION)) // orbit normal
/** position on the orbit plane at angle th from the site toward MOTION, radius r */
const onOrbit = (th: number, r: number): V3 => v3.mul(v3.add(v3.mul(L, Math.cos(th)), v3.mul(MOTION, Math.sin(th))), r)
const CSM_R = R_MOON + 60 * NMI
const W_CSM = Math.sqrt(MU_MOON / Math.pow(CSM_R, 3))
// descent transfer: apolune at the CSM orbit, perilune 50,000 ft (SP-4029: 102:32:55) at PDI
const RP = R_MOON + 50000 * FT, RA = CSM_R
const DA = (RP + RA) / 2, DE = (RA - RP) / (RA + RP), DN = Math.sqrt(MU_MOON / Math.pow(DA, 3))
const VP = Math.sqrt(MU_MOON * (2 / RP - 1 / DA))
const PD_T = T.landing - T.pdi
const PD_P = 1.25 // horizontal-speed decay exponent of the powered descent (illustrative shape)
const PD_RANGE = (VP * PD_T) / (PD_P + 1)
const TH_PDI = -PD_RANGE / R_MOON
const TH_DOI = TH_PDI - Math.PI
const csmThetaA = (t: Met) => TH_DOI + W_CSM * (t - T.doi)

function lmDescent(t: Met): V3 {
  if (t <= T.doi) return onOrbit(csmThetaA(t), CSM_R + Math.min(1, Math.max(0, (t - T.undock) / 4000)) * -30)
  if (t <= T.pdi) {
    // half an ellipse, apolune → perilune, timed by its mean motion (scaled so perilune is exactly at PDI)
    const f = (t - T.doi) / (T.pdi - T.doi)
    const M = Math.PI + Math.PI * f
    let Ea = M
    for (let i = 0; i < 20; i++) Ea -= (Ea - DE * Math.sin(Ea) - M) / (1 - DE * Math.cos(Ea))
    const nu = 2 * Math.atan2(Math.sqrt(1 + DE) * Math.sin(Ea / 2), Math.sqrt(1 - DE) * Math.cos(Ea / 2))
    const r = (DA * (1 - DE * DE)) / (1 + DE * Math.cos(nu))
    const nuPos = ((nu % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) // π → 2π
    return onOrbit(TH_PDI - (2 * Math.PI - nuPos), r)
  }
  const tau = clamp01((t - T.pdi) / PD_T)
  const s = (1 - Math.pow(1 - tau, PD_P + 1)) * PD_RANGE // ∫ VP (1−τ)^p
  const h = 50000 * FT * Math.pow(1 - tau, 1.6)
  return onOrbit(TH_PDI + s / R_MOON, R_MOON + h)
}
// lunar ascent (illustrative profile to an ~18 km insertion), then a co-orbit rising to the CSM by the docking time
const ASC_T = T.lmIns - T.lmLiftoff
function lmAscent(t: Met): V3 {
  if (t <= T.lmLiftoff) return onOrbit(0, R_MOON)
  if (t <= T.lmIns) {
    const tau = (t - T.lmLiftoff) / ASC_T
    const vc = Math.sqrt(MU_MOON / (R_MOON + 18e3))
    const s = (vc * ASC_T * Math.pow(tau, 2.5)) / 2.5
    const h = 18e3 * Math.pow(smooth(tau), 0.75)
    return onOrbit(s / R_MOON, R_MOON + h)
  }
  const w0 = Math.sqrt(MU_MOON / Math.pow(R_MOON + 18e3, 3))
  const th0 = (w0 * ASC_T) / 2.5
  const D = T.redock - T.lmIns
  const x = clamp01((t - T.lmIns) / D)
  const r = R_MOON + 18e3 + (CSM_R - R_MOON - 18e3) * smooth(x)
  // angle: the integral of an angular rate easing (smoothstep) from the low orbit's to the CSM's
  const th = th0 + w0 * (t - T.lmIns) + (W_CSM - w0) * D * (x * x * x - (x * x * x * x) / 2)
  return onOrbit(th, r)
}
const csmThetaB = (t: Met) => {
  const p = lmAscent(T.redock)
  const th = Math.atan2(v3.dot(p, MOTION), v3.dot(p, L))
  return th + W_CSM * (t - T.redock)
}
const csmMoon = (t: Met): V3 => {
  if (t < T.lmLiftoff) return onOrbit(csmThetaA(t), CSM_R)
  if (t < T.teiIgn) return onOrbit(csmThetaB(t), CSM_R)
  // TEI: the CSM speeds up and climbs away (illustrative)
  const dt = t - T.teiIgn
  const k = clamp01(dt / (T.teiCut - T.teiIgn))
  return onOrbit(csmThetaB(t), CSM_R + 600 * dt * k * k)
}

/** Sun in the Moon-fixed frame: the published 10.8° elevation at Tranquility Base at landing, from the east, rising ~0.51°/h */
function moonSun(t: Met): V3 {
  const el = (10.8 + ((t - T.landing) / 3600) * (360 / (29.530589 * 24))) * D2R
  const { e, n, u } = enu(L)
  const az = 90 * D2R
  return v3.norm(v3.add(v3.add(v3.mul(u, Math.sin(el)), v3.mul(e, Math.cos(el) * Math.sin(az))), v3.mul(n, Math.cos(el) * Math.cos(az))))
}

// ── the stack builder (Saturn V and spacecraft), along axis f from base p
function stackObjects(t: Met, base: V3, f: V3, side: V3): Obj[] {
  const o: Obj[] = []
  let y = 0
  const at = (k: number): V3 => v3.add(base, v3.mul(f, k))
  const sicOn = t < T.sicSep, siiOn = t < T.siiSep, ringOn = t < T.interstage, lesOn = t < T.les
  const sicThrust = t < T.sicIgn ? 0 : t < T.liftoff ? smooth((t - T.sicIgn) / 4) : t < T.ceco ? 1 : t < T.oeco ? 0.82 : 0
  const siiThrust = between(t, T.siiIgn, T.siiOeco) ? (t < T.siiCeco ? smooth((t - T.siiIgn) / 1.5) : 0.82) : 0
  const ivbThrust = between(t, T.ivbIgn, T.ivbCut) || between(t, T.tliIgn, T.tliCut) ? 1 : 0
  if (sicOn) { o.push({ key: 'sic', model: 'sic', pos: at(y), fwd: f, side, thrust: sicThrust }); y += SAT.sic }
  if (siiOn) {
    if (ringOn) o.push({ key: 'ring', model: 'interstage', pos: at(y), fwd: f, side })
    o.push({ key: 'sii', model: 'sii', pos: at(y), fwd: f, side, thrust: siiThrust }); y += SAT.sii
  }
  o.push({ key: 'sivb', model: 'sivb', pos: at(y), fwd: f, side, thrust: ivbThrust }); y += SAT.sivb + SAT.iu
  o.push({ key: 'sla', model: 'sla-upper', pos: at(y + 6.791 * FT), fwd: f, side, p: { open: 0 } }) // above the fixed lower 6.791 ft
  o.push({ key: 'lm-in', model: 'lm', pos: at(y + 0.7), fwd: f, side, fade: 0 }) // hidden inside the adapter
  y += SAT.sla
  o.push({ key: 'sm', model: 'sm', pos: at(y), fwd: f, side, thrust: 0 }); y += SAT.smStruct
  o.push({ key: 'cm', model: 'cm', pos: at(y), fwd: f, side })
  if (lesOn) o.push({ key: 'les', model: 'les', pos: at(y + SAT.cm - LES_OVERLAP), fwd: f, side })
  return o
}

/** spent stage: separates with the stack's velocity, then falls behind an accelerating stack */
function spent(key: string, model: ModelKind, t: Met, tSep: number, base: V3, f: V3, side: V3, accel: number, tumble = 0.05): Obj | null {
  const dt = t - tSep
  if (dt < 0 || dt > 70) return null
  const back = 0.5 * accel * dt * dt + 2 * dt
  const f2 = v3.norm(rotAxis(f, side, tumble * dt))
  return { key, model, pos: v3.sub(base, v3.mul(f, back)), fwd: f2, side, fade: 1 - smooth((dt - 50) / 20) }
}

function apolloFrame(t: Met): Frame {
  // ─────────────── Earth-fixed: pad, ascent, parking orbit, TLI, transposition (to the evasive maneuver)
  if (t < T.evasive + 4) {
    let pos: V3, fwd: V3
    const fixedAt = (tt: number): V3 => {
      if (tt <= T.liftoff) return v3.mul(llUnit(PAD_39A.lat, PAD_39A.lon), R_EARTH)
      if (tt <= 699.33) return v3.mul(llUnit(ascLat(tt), ascLon(tt)), R_EARTH + ascAlt(tt))
      return inertialToFixed(apolloEci(tt), tt)
    }
    pos = fixedAt(t)
    const up = v3.norm(pos)
    const vel = t <= T.liftoff ? [0, 0, 0] as V3 : velOf(fixedAt, t)
    // vertical on the pad and through the tower clearance; then along the Earth-relative velocity
    const vDir = v3.len(vel) > 1 ? v3.norm(vel) : up
    fwd = t < 9.7 ? up : v3.norm(v3.lerp(up, vDir, smooth(ramp(t, 9.7, 60))))
    if (t > 699.33) fwd = v3.norm(velOf((tt) => apolloEci(tt), t)) // in orbit: along the inertial velocity
    if (t > 699.33) fwd = v3.norm(rotY(fwd, -gmst(ms(t))))
    const side = v3.norm(v3.cross(fwd, up).some((x) => Math.abs(x) > 1e-6) ? v3.cross(fwd, up) : [1, 0, 0])
    let objects: Obj[]
    let focus = pos
    if (t < T.csmSep) {
      objects = stackObjects(t, pos, fwd, side)
      // spent hardware
      const b = (tt: number) => fixedAt(tt)
      const s1 = spent('sic-spent', 'sic', t, T.sicSep, v3.sub(b(T.sicSep), v3.mul(fwd, SAT.sic)), fwd, side, 9)
      if (s1) { s1.pos = v3.add(pos, v3.mul(fwd, -SAT.sic - 0.5 * 9 * (t - T.sicSep) ** 2 - 3 * (t - T.sicSep))); objects.push(s1) }
      const r1 = spent('ring-spent', 'interstage', t, T.interstage, pos, fwd, side, 9, 0.3)
      if (r1) objects.push(r1)
      const l1 = t > T.les && t < T.les + 40 ? { key: 'les-spent', model: 'les' as ModelKind, pos: v3.add(pos, v3.mul(fwd, SAT.sii + SAT.sivb + SAT.iu + SAT.sla + SAT.smStruct + SAT.cm + 60 * (t - T.les) + 8 * (t - T.les) ** 2)), fwd: v3.norm(rotAxis(fwd, side, 0.2 * (t - T.les))), side, fade: 1 - smooth((t - T.les - 25) / 15), thrust: t - T.les < 2 ? 1 : 0 } : null
      if (l1) objects.push(l1)
      const s2 = t > T.siiSep && t < T.siiSep + 70 ? { key: 'sii-spent', model: 'sii' as ModelKind, pos: v3.add(pos, v3.mul(fwd, -SAT.sii - 4 * (t - T.siiSep) - 0.5 * 6 * (t - T.siiSep) ** 2)), fwd: v3.norm(rotAxis(fwd, side, 0.03 * (t - T.siiSep))), side, fade: 1 - smooth((t - T.siiSep - 50) / 20) } : null
      if (s2) objects.push(s2)
      focus = v3.add(pos, v3.mul(fwd, (t < T.sicSep ? SAT.total * 0.45 : t < T.siiSep ? (SAT.total - SAT.sic) * 0.45 : (SAT.sivb + SAT.sla + SAT.cm) * 0.5)))
    } else {
      // transposition and docking: the S-IVB/LM keeps its attitude; the CSM pulls ahead, turns around, docks, extracts
      const ivbBase = pos
      const lmBase = v3.add(ivbBase, v3.mul(fwd, SAT.sivb + SAT.iu + 0.7))
      const lmTop = v3.add(lmBase, v3.mul(fwd, 22.917 * FT))
      const dSep = t - T.csmSep
      const turn = smooth(ramp(t, T.csmSep + 101, T.csmSep + 101 + 300)) // separation burn 003:17:04.6, then the turn
      const away = t < T.dock ? 10 + 22 * smooth(ramp(t, T.csmSep, T.csmSep + 200)) - 31 * smooth(ramp(t, T.csmSep + 380, T.dock)) : 0
      const csmFwd = v3.norm(rotAxis(fwd, side, Math.PI * (t < T.dock ? turn : 1)))
      let csmBase: V3
      if (t < T.dock) csmBase = v3.add(lmTop, v3.mul(fwd, away + (turn > 0.5 ? SAT.cm + SAT.smStruct : 0)))
      else {
        const pull = t < T.eject ? 0 : 3 + 0.25 * (t - T.eject) + (t > T.evasive ? 2 * (t - T.evasive) : 0)
        csmBase = v3.add(lmTop, v3.mul(fwd, SAT.cm + SAT.smStruct + pull))
      }
      const lmPos = t < T.eject ? lmBase : v3.add(lmBase, v3.mul(fwd, 3 + 0.25 * (t - T.eject) + (t > T.evasive ? 2 * (t - T.evasive) : 0)))
      objects = [
        { key: 'sivb', model: 'sivb', pos: ivbBase, fwd, side, thrust: 0 },
        { key: 'lm', model: 'lm', pos: lmPos, fwd, side },
        { key: 'sm', model: 'sm', pos: csmBase, fwd: csmFwd, side, thrust: 0 },
        { key: 'cm', model: 'cm', pos: v3.add(csmBase, v3.mul(csmFwd, SAT.smStruct)), fwd: csmFwd, side },
      ]
      if (dSep < 120) {
        for (let i = 0; i < 4; i++) {
          const ax = rotAxis(side, fwd, (i * Math.PI) / 2)
          objects.push({ key: 'sla' + i, model: 'sla-upper', pos: v3.add(v3.add(ivbBase, v3.mul(fwd, SAT.sivb + SAT.iu + 2.07)), v3.mul(ax, dSep * 0.6)), fwd: v3.norm(rotAxis(fwd, v3.cross(fwd, ax), -Math.min(1.2, dSep * 0.05))), side: ax, p: { panel: 1 }, fade: 1 - smooth((dSep - 80) / 40) })
        }
      }
      focus = v3.add(lmTop, v3.mul(fwd, 6))
    }
    return {
      env: 'earth', focus, axis: fwd, vel, up, alt: v3.len(pos) - R_EARTH, sun: inertialToFixed(sunEci(ms(t)), t), objects, bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH }],
      site: padSite(),
    }
  }
  // ─────────────── Earth–Moon space (inertial)
  if (t < T.loiIgn - 1200 || (t > T.teiCut + 600 && t < T.cmsm)) {
    const out = t < T.loiIgn
    const p = out ? cislunarOut(t) : cislunarHome(t)
    const vel = velOf(out ? cislunarOut : cislunarHome, t, 60)
    const path: V3[] = []
    const [a, b] = out ? [T.evasive, T.loiIgn] : [T.teiCut, T.cmsm]
    for (let i = 0; i <= 160; i++) path.push((out ? cislunarOut : cislunarHome)(a + ((b - a) * i) / 160))
    const fwd = v3.norm(vel)
    const side = v3.norm(v3.cross(fwd, [0, 1, 0]))
    const objs: Obj[] = out
      ? [{ key: 'lm', model: 'lm', pos: v3.add(p, v3.mul(fwd, -8)), fwd: v3.mul(fwd, -1), side }, { key: 'sm', model: 'sm', pos: v3.add(p, v3.mul(fwd, -8 + 0.1)), fwd, side }, { key: 'cm', model: 'cm', pos: v3.add(p, v3.mul(fwd, -8 + 0.1 + SAT.smStruct)), fwd, side }]
      : [{ key: 'sm', model: 'sm', pos: p, fwd, side, thrust: between(t, T.mccTe, T.mccTe + 10) ? 1 : 0 }, { key: 'cm', model: 'cm', pos: v3.add(p, v3.mul(fwd, SAT.smStruct)), fwd, side }]
    if (out) objs[1].thrust = between(t, T.mcc1, T.mcc1 + 3.13) ? 1 : 0
    return {
      env: 'cislunar', focus: p, axis: fwd, vel, up: [0, 1, 0], alt: v3.len(p) - R_EARTH, sun: sunEci(ms(t)), objects: objs, path,
      bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH, rotY: gmst(ms(t)) }, { id: 'moon', pos: moonEci(ms(t)), radius: R_MOON }],
    }
  }
  // ─────────────── Moon (Moon-fixed): LOI, lunar orbit, descent, surface, ascent, rendezvous, TEI
  if (t < T.cmsm - 3600) {
    const sun = moonSun(t)
    const site = { pos: v3.mul(L, R_MOON), up: L, e: enu(L).e, n: enu(L).n, kind: 'moon' as const }
    const objs: Obj[] = []
    const csm = csmMoon(t)
    const csmVel = velOf(csmMoon, t, 2)
    const cf = v3.norm(csmVel)
    const cside = v3.norm(v3.cross(cf, v3.norm(csm)))
    const pushCsm = (thrust = 0, pos = csm, f = cf, side = cside) => {
      objs.push({ key: 'sm', model: 'sm', pos, fwd: f, side, thrust })
      objs.push({ key: 'cm', model: 'cm', pos: v3.add(pos, v3.mul(f, SAT.smStruct)), fwd: f, side })
    }
    const spsOn = between(t, T.loiIgn, T.loiCut) || between(t, T.locIgn, T.locIgn + 16.88) || between(t, T.teiIgn, T.teiCut)
    const lmDocked = t < T.undock
    // during LOI the SPS points retrograde: the stack is flown backwards
    const csmFwd = spsOn && t < T.teiIgn ? v3.mul(cf, -1) : cf
    let focus = csm, axis = csmFwd, vel = csmVel
    if (lmDocked) {
      pushCsm(spsOn ? 1 : 0, csm, csmFwd)
      objs.push({ key: 'lm', model: 'lm', pos: v3.add(csm, v3.mul(csmFwd, SAT.smStruct + SAT.cm + 0.3 + 22.917 * FT)), fwd: v3.mul(csmFwd, -1), side: cside })
    } else if (t < T.lmLiftoff) {
      const lp = lmDescent(t)
      const onSurface = t >= T.landing
      const dps = between(t, T.doi, T.doi + 30) || between(t, T.pdi, T.pdc)
      // burning: along the thrust the computed path needs; coasting: engine forward along the track
      const lf = onSurface ? L : dps && t > T.pdi ? thrustDir(lmDescent, Math.min(t, T.landing - 1), MU_MOON, 1) : v3.norm(v3.cross(v3.norm(lp), ON))
      const lside = v3.norm(v3.cross(lf, v3.norm(lp)).some((x) => Math.abs(x) > 1e-9) ? v3.cross(lf, v3.norm(lp)) : MOTION)
      objs.push({ key: 'lm', model: 'lm', pos: onSurface ? v3.mul(L, R_MOON) : lp, fwd: lf, side: lside, thrust: dps ? (t > T.pdi + 26 && t < T.pdi + 360 ? 1 : 0.65) : 0, p: { dust: onSurface ? 0 : clamp01(1 - (v3.len(lp) - R_MOON) / 40) } })
      if (t < T.doi + 600) pushCsm()
      focus = onSurface ? v3.add(v3.mul(L, R_MOON), v3.mul(L, 3)) : lp
      axis = lf
      vel = onSurface ? [0, 0, 0] : velOf(lmDescent, t, 1)
      if (onSurface) {
        // the surface: astronauts, flag, EASEP (~17 m south of the LM) and LRRR (~5 m NNW of EASEP), NSSDCA
        const { e, n } = enu(L)
        const g = (x: number, z: number, hgt = 0): V3 => v3.add(v3.add(v3.mul(L, R_MOON + hgt), v3.mul(e, x)), v3.mul(n, z))
        const easep = g(0, -17), lrrr = v3.add(easep, v3.add(v3.mul(n, 5 * Math.cos(22.5 * D2R)), v3.mul(e, -5 * Math.sin(22.5 * D2R))))
        if (t >= T.flag) objs.push({ key: 'flag', model: 'flag', pos: g(-5, 6), fwd: L, side: e })
        if (t >= T.pse) objs.push({ key: 'easep', model: 'easep', pos: easep, fwd: L, side: e })
        if (t >= T.lrrr) objs.push({ key: 'lrrr', model: 'lrrr', pos: lrrr, fwd: L, side: e })
        const walk = (who: number, tt: number): V3 => {
          // illustrative wander between the LM, the flag and the experiment area
          const k = (tt - (who ? T.lmp : T.firstStep)) / 60
          const toward = tt > T.pse - 600 ? (who ? easep : lrrr) : g(-4 + 3 * Math.sin(k * 0.7 + who), 4 + 3 * Math.cos(k * 0.5 + who * 2))
          const start = g(0, 3.6 + (who ? 0.8 : 0))
          return v3.lerp(start, toward, smooth(clamp01(k / 3)))
        }
        if (between(t, T.firstStep, T.evaEnd - 120)) objs.push({ key: 'cdr', model: 'astronaut', pos: walk(0, t), fwd: L, side: e, p: { walk: t } })
        if (between(t, T.lmp, T.evaEnd - 300)) objs.push({ key: 'lmp', model: 'astronaut', pos: walk(1, t), fwd: L, side: v3.mul(e, -1), p: { walk: t + 7 } })
      }
    } else {
      // ascent stage leaves the descent stage on the surface
      objs.push({ key: 'lm-descent', model: 'lm-descent', pos: v3.mul(L, R_MOON), fwd: L, side: enu(L).e })
      const { e, n } = enu(L)
      const g = (x: number, z: number): V3 => v3.add(v3.add(v3.mul(L, R_MOON), v3.mul(e, x)), v3.mul(n, z))
      const easep = g(0, -17)
      objs.push({ key: 'flag', model: 'flag', pos: g(-5, 6), fwd: L, side: e }, { key: 'easep', model: 'easep', pos: easep, fwd: L, side: e }, { key: 'lrrr', model: 'lrrr', pos: v3.add(easep, v3.add(v3.mul(n, 4.6), v3.mul(e, -1.9))), fwd: L, side: e })
      if (t < T.ascJett + 600) {
        const ap = t < T.redock ? lmAscent(t) : v3.add(csm, v3.mul(cf, SAT.smStruct + SAT.cm + 0.3 + 12.333 * FT + (t > T.ascJett ? 0.4 * (t - T.ascJett) : 0)))
        const af = t < T.redock ? (t < T.lmLiftoff + 10 ? L : thrustDir(lmAscent, Math.min(t, T.lmIns - 1), MU_MOON, 1)) : v3.mul(cf, -1)
        const aps = between(t, T.lmLiftoff, T.lmIns)
        objs.push({ key: 'lm-ascent', model: 'lm-ascent', pos: t < T.redock ? ap : ap, fwd: af, side: enu(v3.norm(ap)).e, thrust: aps ? 1 : 0, fade: t > T.ascJett ? 1 - smooth((t - T.ascJett) / 500) : 1 })
        if (t < T.redock) { focus = ap; axis = af; vel = velOf(lmAscent, t, 1) }
      }
      if (t > T.lmLiftoff + 600 || t < T.lmLiftoff) pushCsm(spsOn ? 1 : 0)
      if (t > T.redock - 1800) { focus = csm; axis = cf; vel = csmVel }
      if (t < T.lmLiftoff + 40) { focus = v3.add(v3.mul(L, R_MOON), v3.mul(L, 3 + Math.max(0, v3.len(lmAscent(t)) - R_MOON))); axis = L }
    }
    const alt = v3.len(focus) - R_MOON
    return { env: 'moon', focus, axis, vel, up: v3.norm(focus), alt, sun, objects: objs, bodies: [{ id: 'moon', pos: [0, 0, 0], radius: R_MOON }], site }
  }
  // ─────────────── return to Earth (Earth-fixed): SM jettison, entry, parachutes, splashdown
  return returnFrame(t)
}

const SPLASH = llUnit(13.3, -169.15)
const ENTRY_HEADING = 70 // illustrative
const RET_RANGE = 2600e3 // illustrative ground range from the entry interface to splashdown
const retAlt = monotone(
  [T.cmsm, T.entry, T.entry + 120, T.entry + 300, T.drogue, T.mains, T.splash],
  [1778.3 * NMI, 400000 * FT, 62e3, 36e3, 7.3e3, 3.1e3, 0],
)
const retFrac = monotone([T.cmsm, T.entry, T.entry + 300, T.drogue, T.splash], [-1.6, 0, 0.82, 0.997, 1])
function retPos(t: Met): V3 {
  const tt = Math.min(t, T.splash)
  const u = gcPoint(SPLASH, ENTRY_HEADING + 180, (1 - retFrac(tt)) * RET_RANGE, R_EARTH)
  return v3.mul(u, R_EARTH + retAlt(tt))
}
function returnFrame(t: Met): Frame {
  const pos = retPos(t)
  const up = v3.norm(pos)
  const vel = t < T.splash ? velOf(retPos, t, 1) : [0, 0, 0] as V3
  const vd = v3.len(vel) > 1 ? v3.norm(vel) : up
  const side = v3.norm(v3.cross(vd, up))
  const objs: Obj[] = []
  const underChute = t >= T.drogue
  // heat shield forward on entry (the CM's apex trails); apex up under the parachutes
  let fwd = underChute ? up : v3.mul(vd, -1)
  if (t >= T.splash) {
    // apex-down after splashdown, then righted at 195:26:15 (SP-4029)
    const up2 = smooth(ramp(t, T.apexUp - 60, T.apexUp))
    fwd = v3.norm(rotAxis(up, side, Math.PI * (1 - up2) * smooth(ramp(t, T.splash, T.splash + 40))))
  }
  if (t < T.cmsm + 120) {
    const d = t - T.cmsm
    objs.push({ key: 'sm-spent', model: 'sm', pos: v3.sub(pos, v3.mul(vd, -SAT.smStruct - 3 - 0.6 * d)), fwd: v3.norm(rotAxis(vd, side, 0.02 * d)), side, fade: 1 - smooth((d - 80) / 40) })
  }
  const cmBase = t >= T.splash ? v3.add(pos, v3.mul(up, -1.2)) : pos
  objs.push({ key: 'cm', model: 'cm', pos: cmBase, fwd, side, p: { scorched: t > T.entry ? 1 : 0, collar: t >= E('collar') ? 1 : 0 } })
  if (between(t, T.drogue, T.mains + 2)) objs.push({ key: 'drogue', model: 'drogue', pos: v3.add(pos, v3.mul(up, SAT.cm + 1)), fwd: up, side, p: { open: smooth(ramp(t, T.drogue, T.drogue + 2)) } })
  if (between(t, T.mains, T.splash + 25)) objs.push({ key: 'mains', model: 'mains', pos: v3.add(pos, v3.mul(up, SAT.cm + 1)), fwd: up, side, p: { open: smooth(ramp(t, T.mains, T.mains + 8)), collapse: smooth(ramp(t, T.splash, T.splash + 20)) } })
  const plasma = t > T.entry ? smooth(ramp(t, T.entry + 15, T.entry + 70)) * (1 - smooth(ramp(t, T.entry + 220, T.entry + 330))) : 0
  return {
    env: 'earth', focus: v3.add(cmBase, v3.mul(fwd, 1.6)), axis: underChute ? up : vd, vel, up, alt: v3.len(pos) - R_EARTH, sun: inertialToFixed(sunEci(ms(t)), t), objects: objs,
    bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH }], plasma,
    site: { pos: v3.mul(SPLASH, R_EARTH), up: SPLASH, e: enu(SPLASH).e, n: enu(SPLASH).n, kind: 'ocean' },
  }
}
function padSite(): Frame['site'] {
  const u = llUnit(PAD_39A.lat, PAD_39A.lon)
  return { pos: v3.mul(u, R_EARTH), up: u, e: enu(u).e, n: enu(u).n, kind: 'pad' }
}

// ════════════════════════════════════════════════════════════════════════════════════════════ OPPORTUNITY
const O = OPPORTUNITY
const OE = (id: string) => O.events.find((e) => e.id === id)!.t
const M = {
  gemOut: OE('gem-burnout'), airlit: OE('gem-airlit'), meco: OE('meco'), s2: OE('stage2-ign'), fairing: OE('fairing'), seco1: OE('seco1'), restart: OE('stage2-restart'),
  spin: OE('spin'), s3: OE('stage3-ign'), s3out: OE('stage3-out'), despin: OE('despin'), sep: OE('sep'), cruise: OE('cruise'), approach: OE('approach'),
  turn: OE('entry-turn'), cruiseSep: OE('cruise-sep'), entry: MER_ENTRY, chute: OE('chute'), heat: OE('heatshield'), landerSep: OE('lander-sep'),
  radar: OE('radar'), airbags: OE('airbags'), rad: OE('rad'), cut: OE('bridle-cut'), impact: MER_LANDING, rest: OE('rest'), retract: OE('retract'), petals: OE('petals'), egress: OE('egress'),
}
export const MER_TIMES = M
const oms = (t: Met) => O.epochMs + t * 1000
const MER_AZ = 99 // PDS launch azimuth
// illustrative boost profile; the ~130 km at the fairing jettison is the only published altitude
const merAlt = monotone([0, 60, M.meco, M.fairing, M.seco1], [0, 12e3, 108e3, 130e3, 185e3], 0)
const merRange = monotone([0, 60, M.meco, M.fairing, M.seco1], [0, 9e3, 360e3, 410e3, 1650e3], 0)
const MER_PARK_R = R_EARTH + 185e3
const merPark0 = (() => {
  const u0 = llUnit(PAD_39A.lat, PAD_39A.lon)
  const uFix = gcPoint(u0, MER_AZ, merRange(M.seco1), R_EARTH)
  const ahead = gcPoint(u0, MER_AZ, merRange(M.seco1) + 1000, R_EARTH)
  const th = gmst(oms(M.seco1))
  const u = rotY(uFix, th)
  const dir = v3.norm(v3.sub(rotY(ahead, th), u))
  const dirO = v3.norm(v3.sub(dir, v3.mul(u, v3.dot(dir, u))))
  return { u, dir: dirO }
})()
const MER_W = Math.sqrt(MU_EARTH / Math.pow(MER_PARK_R, 3))
/** departure: RK4 two-body from the end of an illustrative Stage II + Star-48B boost to escape */
const merDeparture = (() => {
  const pts: { t: number; r: V3 }[] = []
  const t0 = M.restart
  const pos0 = (tt: number) => v3.mul(v3.add(v3.mul(merPark0.u, Math.cos(MER_W * (tt - M.seco1))), v3.mul(merPark0.dir, Math.sin(MER_W * (tt - M.seco1)))), MER_PARK_R)
  let r = pos0(t0)
  let v = v3.mul(v3.sub(pos0(t0 + 0.5), pos0(t0 - 0.5)), 1)
  const thrustAcc = (tt: number, vv: V3): V3 => {
    const a = between(tt, M.restart, M.restart + 70) ? 2.2 : between(tt, M.s3, M.s3out) ? 29 : 0 // illustrative to ~11.3 km/s
    return v3.mul(v3.norm(vv), a)
  }
  const acc = (tt: number, rr: V3, vv: V3): V3 => v3.add(v3.mul(rr, -MU_EARTH / Math.pow(v3.len(rr), 3)), thrustAcc(tt, vv))
  const dt = 2
  for (let tt = t0; tt <= M.cruise + 10; tt += dt) {
    pts.push({ t: tt, r })
    const k1v = acc(tt, r, v), k1r = v
    const k2v = acc(tt + dt / 2, v3.add(r, v3.mul(k1r, dt / 2)), v3.add(v, v3.mul(k1v, dt / 2))), k2r = v3.add(v, v3.mul(k1v, dt / 2))
    const k3v = acc(tt + dt / 2, v3.add(r, v3.mul(k2r, dt / 2)), v3.add(v, v3.mul(k2v, dt / 2))), k3r = v3.add(v, v3.mul(k2v, dt / 2))
    const k4v = acc(tt + dt, v3.add(r, v3.mul(k3r, dt)), v3.add(v, v3.mul(k3v, dt))), k4r = v3.add(v, v3.mul(k3v, dt))
    r = v3.add(r, v3.mul(v3.add(v3.add(k1r, v3.mul(k2r, 2)), v3.add(v3.mul(k3r, 2), k4r)), dt / 6))
    v = v3.add(v, v3.mul(v3.add(v3.add(k1v, v3.mul(k2v, 2)), v3.add(v3.mul(k3v, 2), k4v)), dt / 6))
  }
  return { pts, pos0, t0, dt }
})()
function merEci(t: Met): V3 {
  if (t <= M.restart) return merDeparture.pos0(t)
  const i = Math.min(merDeparture.pts.length - 2, Math.max(0, Math.floor((t - merDeparture.t0) / merDeparture.dt)))
  const a = merDeparture.pts[i], b = merDeparture.pts[i + 1]
  return v3.lerp(a.r, b.r, clamp01((t - a.t) / (b.t - a.t)))
}
function merFixed(t: Met): V3 {
  if (t <= 0) return v3.mul(llUnit(PAD_39A.lat, PAD_39A.lon), R_EARTH)
  if (t <= M.seco1) return v3.mul(gcPoint(llUnit(PAD_39A.lat, PAD_39A.lon), MER_AZ, merRange(t), R_EARTH), R_EARTH + merAlt(t))
  return rotY(merEci(t), -gmst(oms(t)))
}
export const DELTA = { core: 2.44, coreLen: 26, gemDia: 1.168, gemLen: 14.7, fairDia: 2.9, fairLen: 8.5, s2Len: 6, s3Len: 2.0 } // illustrative except gemDia & fairDia

function deltaObjects(t: Met, base: V3, f: V3, side: V3): Obj[] {
  const o: Obj[] = []
  const coreOn = t < M.meco + 6
  const gemsLit = t < M.gemOut ? 1 : 0
  const airLit = between(t, M.airlit, M.airlit + 66) ? 1 : 0
  if (coreOn) {
    o.push({ key: 'core', model: 'delta-core', pos: base, fwd: f, side, thrust: t < 0 ? (t > -2 ? 0.5 : 0) : t < M.meco ? 1 : 0, fade: t > M.meco ? 1 - smooth((t - M.meco) / 6) : 1 })
    // nine GEMs around the core: six ground-lit, three air-lit (JPL); faded out when spent (their jettison is not described)
    const gemFade = (lit: boolean) => (lit ? (t > M.airlit + 66 ? 1 - smooth((t - M.airlit - 66) / 8) : 1) : t > M.gemOut ? 1 - smooth((t - M.gemOut) / 8) : 1)
    for (let i = 0; i < 9; i++) {
      const air = i % 3 === 2
      const ang = (i / 9) * Math.PI * 2
      const off = v3.add(v3.mul(side, Math.cos(ang) * (DELTA.core / 2 + DELTA.gemDia / 2)), v3.mul(v3.cross(f, side), Math.sin(ang) * (DELTA.core / 2 + DELTA.gemDia / 2)))
      o.push({ key: 'gem' + i, model: 'gem', pos: v3.add(base, off), fwd: f, side, thrust: air ? airLit : t >= 0 ? gemsLit : 0, fade: gemFade(air), p: { air: air ? 1 : 0 } })
    }
  }
  const y2 = coreOn ? DELTA.coreLen : 0
  const s2Base = v3.add(base, v3.mul(f, y2))
  const s2Thrust = between(t, M.s2, M.seco1) || between(t, M.restart, M.restart + 70) ? 1 : 0
  if (t < M.spin + 20) o.push({ key: 's2', model: 'delta-stage2', pos: s2Base, fwd: f, side, thrust: s2Thrust, fade: t > M.spin ? 1 - smooth((t - M.spin) / 20) : 1 })
  const s3Base = v3.add(s2Base, v3.mul(f, t < M.spin ? DELTA.s2Len : DELTA.s2Len + (t - M.spin) * 0.8))
  const spinRate = t < M.spin ? 0 : t < M.despin ? 70 : t < M.despin + 3 ? 70 - 58 * (t - M.despin) / 3 : 12
  if (t < M.sep + 60) o.push({ key: 's3', model: 'star48', pos: s3Base, fwd: f, side, thrust: between(t, M.s3, M.s3out) ? 1 : 0, p: { spin: spinRate }, fade: t > M.sep ? 1 - smooth((t - M.sep) / 60) : 1 })
  const scBase = v3.add(s3Base, v3.mul(f, DELTA.s3Len + (t > M.sep ? (t - M.sep) * 0.3 : 0)))
  o.push({ key: 'sc', model: 'mer-cruise', pos: scBase, fwd: f, side, p: { spin: t < M.sep ? spinRate : 2 } })
  if (t < M.fairing + 30) {
    const d = Math.max(0, t - M.fairing)
    for (let h = 0; h < 2; h++) {
      const out = v3.mul(side, (h ? 1 : -1) * d * 4)
      o.push({ key: 'fair' + h, model: 'fairing', pos: v3.add(v3.add(s3Base, v3.mul(f, -0.6 - d * 3)), out), fwd: v3.norm(rotAxis(f, v3.cross(f, side), (h ? -1 : 1) * Math.min(1.4, d * 0.25))), side: h ? side : v3.mul(side, -1), p: { half: 1 }, fade: 1 - smooth((d - 18) / 12) })
    }
  }
  return o
}

// interplanetary: an illustrative Type I arc from Earth at separation to Mars at landing (prograde, < 180°)
function helioPath(t: Met): V3 {
  const t0 = M.sep, t1 = MER_LANDING
  const e0 = helioEcliptic('earth', oms(t0)), m1 = helioEcliptic('mars', oms(t1))
  const a0 = Math.atan2(-e0[2], e0[0]), a1u = Math.atan2(-m1[2], m1[0])
  let d = a1u - a0
  while (d < 0) d += 2 * Math.PI
  const f = clamp01((t - t0) / (t1 - t0))
  const fa = f + 0.12 * Math.sin(Math.PI * f) // a little faster early, as near perihelion (illustrative)
  const r = v3.len(e0) + (v3.len(m1) - v3.len(e0)) * smooth(fa)
  const a = a0 + d * fa
  const y = e0[1] + (m1[1] - e0[1]) * fa
  return [r * Math.cos(a), y, -r * Math.sin(a)]
}
export const merTransferAngleDeg = () => {
  const e0 = helioEcliptic('earth', oms(M.sep)), m1 = helioEcliptic('mars', oms(MER_LANDING))
  let d = Math.atan2(-m1[2], m1[0]) - Math.atan2(-e0[2], e0[0])
  while (d < 0) d += 2 * Math.PI
  return d / D2R
}

// Mars approach and entry (Mars-fixed; entry interface 3522.2 km from the centre at 5.4 km/s, PDS)
const SITE_M = llUnit(-1.9483, 354.47417)
const ENTRY_AZ = 95 // illustrative
const ENTRY_RANGE = 780e3 // illustrative
const GAMMA = -11.5 * D2R // illustrative flight-path angle at the interface
const entryGround = gcPoint(SITE_M, ENTRY_AZ + 180, ENTRY_RANGE, R_MARS)
const entryPoint: V3 = v3.mul(entryGround, 3522.2e3)
const entryVel = (() => {
  const toSite = v3.norm(v3.sub(SITE_M, v3.mul(entryGround, v3.dot(SITE_M, entryGround))))
  return v3.mul(v3.norm(v3.add(v3.mul(toSite, Math.cos(GAMMA)), v3.mul(entryGround, Math.sin(GAMMA)))), 5400)
})()
const mAlt = monotone([M.entry, M.entry + 60, M.entry + 120, M.entry + 180, M.chute], [3522.2e3 - R_MARS, 68e3, 31e3, 16e3, 10e3])
const mFrac = monotone([M.entry, M.entry + 80, M.entry + 160, M.chute], [0, 0.62, 0.93, 1])
function marsPos(t: Met): V3 {
  if (t <= M.entry) return v3.add(entryPoint, v3.mul(entryVel, t - M.entry))
  const g = gcPoint(entryGround, ENTRY_AZ, mFrac(Math.min(t, M.chute)) * (ENTRY_RANGE - 9e3), R_MARS)
  return v3.mul(g, R_MARS + mAlt(Math.min(t, M.chute)))
}

// Mars local frame at Eagle crater: x east, y up, z south (three: −z is north)
const EAGLE_R = 10 // ~20 m across (PDS)
const DROP: V3 = [-150, 0, 70] // illustrative first-impact point relative to Eagle
const lAlt = monotone([M.chute, M.heat, M.rad - 0.5, M.rad + 2.5, M.cut, M.impact], [10000, 8300, 140, 12, 8.5, 0])
const drift = (t: Met): V3 => v3.add(DROP, [-(M.impact - t) * 0.6, 0, -(M.impact - t) * 0.25]) // illustrative wind drift
function bounceState(t: Met): { p: V3; spin: number } {
  // 26 bounces (PDS) with decaying heights, then a roll into Eagle crater (illustrative dynamics)
  const g = 3.71
  let tt = t - M.impact
  let h = 14, k = 0.8
  const dir = v3.norm(v3.mul(DROP, -1))
  let x = 0
  const total = v3.len(DROP)
  for (let i = 0; i < 26; i++) {
    const T2 = 2 * Math.sqrt((2 * h) / g)
    const seg = (total * 0.85) / 26 * (1.25 - i / 40)
    if (tt < T2) {
      const f = tt / T2
      const y = 4 * h * f * (1 - f)
      return { p: v3.add(v3.add(DROP, v3.mul(dir, x + seg * f)), [0, y, 0]), spin: (i + f) * 1.7 }
    }
    tt -= T2
    x += seg
    h *= k
  }
  const rollT = M.rest - M.impact - 60
  const f = smooth(clamp01(tt / Math.max(1, rollT - 40)))
  const p = v3.lerp(v3.add(DROP, v3.mul(dir, x)), [0, 0, 0], f)
  const r = v3.len(p)
  const bowl = r < EAGLE_R ? -2 * (1 - (r * r) / (EAGLE_R * EAGLE_R)) : 0 // illustrative depth
  return { p: [p[0], bowl + 0.15, p[2]], spin: 26 * 1.7 + f * 6 }
}

function merFrame(t: Met): Frame {
  // ─────────────── Earth
  if (t < M.cruise) {
    const pos = merFixed(t)
    const up = v3.norm(pos)
    const vel = t <= 0 ? [0, 0, 0] as V3 : velOf(merFixed, t)
    const vDir = v3.len(vel) > 1 ? v3.norm(vel) : up
    let fwd = t < 8 ? up : v3.norm(v3.lerp(up, vDir, smooth(ramp(t, 8, 50))))
    if (t > M.seco1) fwd = v3.norm(rotY(velOf(merEci, t), -gmst(oms(t))))
    const side = v3.norm(v3.len(v3.cross(fwd, up)) > 1e-6 ? v3.cross(fwd, up) : [1, 0, 0])
    const objs = deltaObjects(t, pos, fwd, side)
    const focusUp = t < M.meco ? DELTA.coreLen * 0.7 : t < M.spin ? DELTA.s2Len + 2 : DELTA.s2Len + 3
    return {
      env: 'earth', focus: v3.add(pos, v3.mul(fwd, focusUp)), axis: fwd, vel, up, alt: v3.len(pos) - R_EARTH, sun: rotY(sunEci(oms(t)), -gmst(oms(t))), objects: objs,
      bodies: [{ id: 'earth', pos: [0, 0, 0], radius: R_EARTH }], site: padSite(),
    }
  }
  // ─────────────── interplanetary (heliocentric ecliptic)
  if (t < M.cruiseSep - 600) {
    const p = helioPath(t)
    const vel = velOf(helioPath, t, 3600)
    const fwd = v3.norm(v3.mul(p, -1)) // solar arrays toward the Sun (illustrative attitude)
    const path: V3[] = []
    for (let i = 0; i <= 200; i++) path.push(helioPath(M.sep + ((MER_LANDING - M.sep) * i) / 200))
    return {
      env: 'interplanetary', focus: p, axis: fwd, vel, up: [0, 1, 0], alt: 1e12, sun: v3.norm(v3.mul(p, -1)),
      objects: [{ key: 'sc', model: 'mer-cruise', pos: p, fwd, side: v3.norm(v3.cross(fwd, [0, 1, 0])), p: { spin: 2 } }], path,
      bodies: [{ id: 'sun', pos: [0, 0, 0], radius: 6.957e8 }, { id: 'earth', pos: helioEcliptic('earth', oms(t)), radius: 6.371e6 }, { id: 'mars', pos: helioEcliptic('mars', oms(t)), radius: R_MARS }],
    }
  }
  const mt = marsTime(oms(t))
  const sp = sunPosition(mt, -1.9483, 354.47417).enu // local ENU at the site
  // ─────────────── Mars approach and entry (Mars-fixed)
  if (t < M.chute) {
    const pos = marsPos(t)
    const vel = velOf(marsPos, t, 0.5)
    const vd = v3.norm(vel)
    const up = v3.norm(pos)
    const side = v3.norm(v3.cross(vd, up))
    const { e, n, u } = enu(SITE_M)
    const sun = v3.norm(v3.add(v3.add(v3.mul(e, sp[0]), v3.mul(n, sp[1])), v3.mul(u, sp[2])))
    const objs: Obj[] = []
    const heatFwd = v3.mul(vd, -1) // model +Y = backshell apex; heat shield leads
    const cruiseOn = t < M.cruiseSep
    objs.push({ key: 'aeroshell', model: 'mer-aeroshell', pos, fwd: t < M.turn ? v3.norm(v3.mul(pos, -1)) : heatFwd, side })
    if (cruiseOn || t < M.cruiseSep + 240) {
      const d = Math.max(0, t - M.cruiseSep)
      objs.push({ key: 'cruise', model: 'mer-cruise', pos: v3.add(pos, v3.mul(heatFwd, 1.0 + d * 0.35)), fwd: heatFwd, side, p: { stageOnly: 1, spin: 2 }, fade: 1 - smooth((d - 150) / 90) })
    }
    const plasma = smooth(ramp(t, M.entry + 25, M.entry + 70)) * (1 - smooth(ramp(t, M.entry + 150, M.entry + 210)))
    return {
      env: 'mars', focus: pos, axis: heatFwd, vel, up, alt: v3.len(pos) - R_MARS, sun, objects: objs, plasma,
      bodies: [{ id: 'mars', pos: [0, 0, 0], radius: R_MARS }],
      site: { pos: v3.mul(SITE_M, R_MARS), up: SITE_M, e, n, kind: 'mars' },
    }
  }
  // ─────────────── Mars local (Eagle crater frame)
  const sun: V3 = v3.norm([sp[0], sp[2], -sp[1]])
  const objs: Obj[] = []
  let focus: V3, axis: V3 = [0, 1, 0]
  let vel: V3 = [0, 0, 0]
  const up: V3 = [0, 1, 0]
  if (t < M.impact) {
    const lp = (tt: number): V3 => v3.add(drift(tt), [0, lAlt(tt), 0])
    const lander = lp(t)
    vel = velOf(lp, t, 0.2)
    // backshell + chute above: until lander separation the lander is inside; then it hangs on the ~20 m bridle
    const hang = t < M.landerSep ? 0 : 20 * smooth(ramp(t, M.landerSep, M.landerSep + 9))
    const back = t < M.cut ? v3.add(lander, [0, 2.2 + hang, 0]) : v3.add(lp(M.cut), [1.5 * (t - M.cut), 20 + 2.2 + 6 * (t - M.cut), 0.5 * (t - M.cut)])
    const radOn = between(t, M.rad, M.rad + 2.6)
    objs.push({ key: 'backshell', model: 'mer-backshell', pos: back, fwd: up, side: [1, 0, 0], thrust: radOn ? 1 : 0, p: { tirs: between(t, M.rad, M.rad + 0.8) ? 1 : 0 } })
    objs.push({ key: 'chute', model: 'mer-chute', pos: v3.add(back, [0, 2, 0]), fwd: up, side: [1, 0, 0], p: { open: smooth(ramp(t, M.chute, M.chute + 1.5)), lines: t < M.cut ? 1 : 1 } })
    if (t < M.heat + 25) {
      const d = Math.max(0, t - M.heat)
      objs.push({ key: 'heatshield', model: 'mer-heatshield', pos: v3.add(lander, [0, -0.6 - 0.5 * 3.71 * d * d * 0.35, 0]), fwd: up, side: [1, 0, 0], fade: 1 - smooth((d - 15) / 10) })
    }
    objs.push({ key: 'lander', model: 'mer-lander', pos: lander, fwd: up, side: [1, 0, 0], p: { bags: smooth(ramp(t, M.airbags, M.airbags + 2.5)), petals: 0, bridle: t < M.cut && t >= M.landerSep ? hang : 0 } })
    focus = t < M.landerSep ? back : v3.lerp(lander, back, 0.35 * (t < M.cut ? 1 : 0))
  } else {
    const b = t < M.rest ? bounceState(t) : { p: [0, -1.85, 0] as V3, spin: 0 }
    const restTilt = t < M.rest ? b.spin : 0
    // at rest on the +Y side petal; righted when the petals open (PDS: base petal 5° after opening)
    const righting = smooth(ramp(t, M.petals - 1200, M.petals))
    const tilt = t < M.rest ? restTilt : (1 - righting) * 1.91 + righting * (5 * D2R)
    const axisTilt: V3 = v3.norm(rotAxis([0, 1, 0], [0, 0, 1], tilt))
    const bags = t < M.retract - 1800 ? 1 : 1 - smooth(ramp(t, M.retract - 1800, M.retract))
    const petals = smooth(ramp(t, M.petals - 900, M.petals))
    objs.push({ key: 'lander', model: 'mer-lander', pos: b.p, fwd: axisTilt, side: [1, 0, 0], p: { bags, petals } })
    if (t >= M.petals - 600) {
      const roll = smooth(ramp(t, M.egress - 90, M.egress))
      objs.push({ key: 'rover', model: 'mer-rover', pos: v3.add(b.p, [0, 0.32 * (1 - roll) + 0.05, -3.2 * roll]), fwd: [0, 1, 0], side: [1, 0, 0], p: { appear: smooth(ramp(t, M.petals - 600, M.petals - 300)) } })
    }
    focus = v3.add(b.p, [0, 0.6, 0])
    vel = t < M.rest ? velOf((tt) => bounceState(tt).p, t, 0.2) : [0, 0, 0]
    axis = axisTilt
  }
  return {
    env: 'mars-local', focus, axis, vel, up, alt: focus[1], sun, objects: objs, bodies: [],
    site: { pos: [0, 0, 0], up: [0, 1, 0], e: [1, 0, 0], n: [0, 0, -1], kind: 'mars' },
  }
}

export function frameAt(scriptId: string, t: Met): Frame {
  return scriptId === 'apollo-11' ? apolloFrame(t) : merFrame(t)
}

/** for tests: the S-IVB/CSM distance from Earth's centre along the post-TLI conic */
export const _test = { tliState, cislunarOut, apolloEci, get, SAT, LES_OVERLAP, merFixed, helioPath, marsPos, bounceState, lmDescent, PD_RANGE }
