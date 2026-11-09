import { planetEclipticAU } from '../astro/ephemeris'
import { jdTdbFromUtcMs } from '../astro/time'
import { JD_J2000 } from '../astro/time'

/**
 * Sun direction in a lunar site's local frame (+x east, +y up, +z south) at a simulation time.
 *
 * Moon orientation: IAU WGCCRE 2015 (Archinal et al. 2018) secular terms only —
 *   α0 = 269.9949 + 0.0031 T,  δ0 = 66.5392 + 0.0130 T,  W = 38.3213 + 13.17635815 d
 * The periodic libration terms are omitted, so the Sun can be off by up to a few degrees: fine for lighting and
 * shadows, not for astrometry. The Sun is seen from the Moon along −(Earth–Moon barycentre heliocentric vector)
 * from the existing JPL Keplerian elements; the Moon's ~0.003 AU offset changes the direction by < 0.2°.
 */
const D2R = Math.PI / 180
const OBLIQUITY_J2000 = 23.4392911 * D2R

type V3 = [number, number, number]

function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]
}
function rotZ(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]
}

/** ICRF (equatorial J2000) vector → Moon body-fixed (mean, secular IAU terms) */
export function moonBodyFixed(vEq: V3, ms: number): V3 {
  const d = jdTdbFromUtcMs(ms) - JD_J2000
  const T = d / 36525
  const a0 = (269.9949 + 0.0031 * T) * D2R
  const d0 = (66.5392 + 0.013 * T) * D2R
  const W = ((38.3213 + 13.17635815 * d) % 360) * D2R
  // body-fixed = Rz(W) · Rx(π/2 − δ0) · Rz(π/2 + α0) · v   (rotations of the frame, hence the negative angles)
  let v = rotZ(vEq, -(Math.PI / 2 + a0))
  v = rotX(v, -(Math.PI / 2 - d0))
  return rotZ(v, -W)
}

/** body-fixed vector → site local frame (+x east, +y up, +z south) */
export function bodyFixedToLocal(v: V3, latDeg: number, lonEastDeg: number): V3 {
  const f = latDeg * D2R, l = lonEastDeg * D2R
  const up: V3 = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]
  const east: V3 = [-Math.sin(l), Math.cos(l), 0]
  const north: V3 = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)]
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  return [dot(v, east), dot(v, up), -dot(v, north)]
}

const norm = (v: V3): V3 => {
  const n = Math.hypot(...v) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

export function sunDirectionAtLunarSite(ms: number, latDeg: number, lonEastDeg: number): V3 {
  const e = planetEclipticAU('earth', ms)
  const ecl: V3 = [-e[0], -e[1], -e[2]]
  const eq = rotX(ecl, OBLIQUITY_J2000)
  return norm(bodyFixedToLocal(moonBodyFixed(norm(eq), ms), latDeg, lonEastDeg))
}

/** Earth's MEAN direction from a near-side site: the sub-Earth point is (0°, 0°) on average (librations ignored) */
export function meanEarthDirectionAtLunarSite(latDeg: number, lonEastDeg: number): V3 {
  return norm(bodyFixedToLocal([1, 0, 0], latDeg, lonEastDeg))
}

export const elevationDeg = (dir: V3) => Math.asin(Math.max(-1, Math.min(1, dir[1]))) / D2R
export const azimuthDeg = (dir: V3) => ((Math.atan2(dir[0], -dir[2]) / D2R + 360) % 360)
