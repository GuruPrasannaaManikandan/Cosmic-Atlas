/**
 * Frames and orbital maths for Relive Mission (float64, metres, three.js axes: +Y = the body's north pole).
 *
 * Body-fixed: lon 0 on +X, east longitude toward −Z (matches three's SphereGeometry UVs for equirectangular maps).
 * Inertial (Earth): the same axes rotated by GMST, so x = vernal equinox and +Y = celestial north.
 */
import { EQ_TO_GAL, type Vec3 } from '../astro/coords'
import { relativeKm } from '../astro/heliocentric'
import { planetEclipticAU } from '../astro/ephemeris'

export type V3 = [number, number, number]
export const D2R = Math.PI / 180
export const MU_EARTH = 3.986004418e14 // m³/s²
export const MU_MOON = 4.9048695e12
/** SP-4029: "a spherical Earth with a radius of 3,443.934 n mi" (apogee/perigee reference) */
export const R_EARTH = 3443.934 * 1852
export const R_MOON = 1737.4e3
export const R_MARS = 3396.2e3
export const AU = 149597870700

export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] },
  lerp: (a: V3, b: V3, f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
}

/** unit vector of a body-fixed latitude / east longitude */
export function llUnit(latDeg: number, lonEastDeg: number): V3 {
  const p = latDeg * D2R, l = lonEastDeg * D2R
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)]
}

export function unitLL(u: V3): { lat: number; lon: number } {
  return { lat: Math.asin(Math.max(-1, Math.min(1, u[1]))) / D2R, lon: Math.atan2(-u[2], u[0]) / D2R }
}

/** local east / north / up at a body-fixed unit position */
export function enu(up: V3): { e: V3; n: V3; u: V3 } {
  const e = v3.norm(v3.cross([0, 1, 0], up))
  const n = v3.cross(up, e)
  return { e, n, u: up }
}

/** rotate about +Y by angle a (radians) */
export function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

/** rotate v about unit axis k by angle a (Rodrigues) */
export function rotAxis(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  const kxv = v3.cross(k, v), kv = v3.dot(k, v)
  return [v[0] * c + kxv[0] * s + k[0] * kv * (1 - c), v[1] * c + kxv[1] * s + k[1] * kv * (1 - c), v[2] * c + kxv[2] * s + k[2] * kv * (1 - c)]
}

/** Greenwich mean sidereal time (radians), IAU 1982 expression */
export function gmst(ms: number): number {
  const d = ms / 86400000 + 2440587.5 - 2451545.0
  return ((((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360) * D2R
}

/** equatorial (X, Y, Z with Z north) → three axes */
const eqToThree = (v: Vec3): V3 => [v[0], v[2], -v[1]]
/** galactic → equatorial (EQ_TO_GAL is orthonormal: its transpose inverts it) */
function galToEq(g: Vec3): Vec3 {
  const M = EQ_TO_GAL
  return [M[0][0] * g[0] + M[1][0] * g[1] + M[2][0] * g[2], M[0][1] * g[0] + M[1][1] * g[1] + M[2][1] * g[2], M[0][2] * g[0] + M[1][2] * g[1] + M[2][2] * g[2]]
}

/** Moon relative to Earth, Earth-centred inertial (three axes), metres — from the app's ephemeris */
export function moonEci(ms: number): V3 {
  return v3.mul(eqToThree(galToEq(relativeKm('moon', 'earth', ms))), 1000)
}

/** unit vector Earth → Sun in the inertial frame */
export function sunEci(ms: number): V3 {
  return v3.norm(eqToThree(galToEq(relativeKm('sun', 'earth', ms))))
}

/** heliocentric ecliptic position (three axes, ecliptic north = +Y), metres */
export function helioEcliptic(name: 'earth' | 'mars', ms: number): V3 {
  const e = planetEclipticAU(name, ms)
  return [e[0] * AU, e[2] * AU, -e[1] * AU]
}

/** two-body propagation of an elliptic orbit (universal enough for the TLI ellipse). Returns position, velocity. */
export function kepler(r0: V3, v0: V3, dt: number, mu: number): { r: V3; v: V3 } {
  const r0n = v3.len(r0), v0n = v3.len(v0)
  const a = 1 / (2 / r0n - (v0n * v0n) / mu)
  if (!(a > 0)) return { r: v3.add(r0, v3.mul(v0, dt)), v: v0 } // not elliptic: straight line (unused)
  const h = v3.cross(r0, v0)
  const evec = v3.sub(v3.mul(v3.cross(v0, h), 1 / mu), v3.mul(r0, 1 / r0n))
  const e = v3.len(evec)
  const n = Math.sqrt(mu / (a * a * a))
  const p = v3.norm(e > 1e-9 ? evec : r0)
  const q = v3.norm(v3.cross(v3.norm(h), p))
  const cosE0 = (1 - r0n / a) / e
  const sinE0 = v3.dot(r0, v0) / (e * Math.sqrt(mu * a))
  const E0 = Math.atan2(sinE0, cosE0)
  let M = E0 - e * Math.sin(E0) + n * dt
  M = Math.atan2(Math.sin(M), Math.cos(M))
  let E = M
  for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const b = a * Math.sqrt(1 - e * e)
  const r: V3 = v3.add(v3.mul(p, a * (Math.cos(E) - e)), v3.mul(q, b * Math.sin(E)))
  const rn = v3.len(r)
  const fac = Math.sqrt(mu * a) / rn
  const v: V3 = v3.add(v3.mul(p, -fac * Math.sin(E)), v3.mul(q, fac * Math.sqrt(1 - e * e) * Math.cos(E)))
  return { r, v }
}

/** monotone cubic Hermite (Fritsch–Carlson). Optional fixed slope at the first knot. */
export function monotone(xs: number[], ys: number[], startSlope?: number): (x: number) => number {
  const n = xs.length
  const d: number[] = [], m: number[] = new Array(n)
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  m[0] = startSlope ?? d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
  }
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t) }
/** 0→1 as t goes a→b */
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
