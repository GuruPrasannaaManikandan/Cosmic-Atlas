/**
 * Mars solar time and Sun position, by the NASA GISS Mars24 algorithm
 * (https://www.giss.nasa.gov/tools/mars24/help/algorithm.html, read 2026-11-10), which implements
 *   Allison, M., and M. McEwen 2000, Planet. Space Sci. 48, 215–235 ("AM2000") and
 *   Allison, M. 1997, Geophys. Res. Lett. 24, 1967–1970 ("A1997").
 * Step labels (A-1 … D-6) follow that page. The page's two worked examples are reproduced in marsTime.test.ts.
 *
 * Conventions (as in Mars24): longitudes in these formulas are PLANETOGRAPHIC and WEST-positive; latitude is
 * planetographic. The public helpers take east-positive longitudes (the catalogue's convention) and convert.
 */

const DEG = Math.PI / 180
const mod = (x: number, m: number) => ((x % m) + m) % m

/**
 * TAI − UTC (s) from each date on, per IERS Bulletin C (the leap-second history also carried in NAIF's naif0012.tls).
 * Mars24 includes the leap second at the end of 2016 and no later ones; IERS has announced none since.
 */
export const TAI_MINUS_UTC: readonly [string, number][] = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13], ['1975-01-01', 14],
  ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17], ['1979-01-01', 18], ['1980-01-01', 19],
  ['1981-07-01', 20], ['1982-07-01', 21], ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24],
  ['1990-01-01', 25], ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33], ['2009-01-01', 34],
  ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
]
const LEAP_MS = TAI_MINUS_UTC.map(([d, s]) => [Date.parse(d + 'T00:00:00Z'), s] as const)

/** A-4: TT − UTC in seconds */
export function ttMinusUtc(utcMs: number): number {
  if (utcMs < LEAP_MS[0][0]) {
    const T = (2440587.5 + utcMs / 8.64e7 - 2451545.0) / 36525 // A-3
    return 64.184 + 59 * T - 51.2 * T ** 2 - 67.1 * T ** 3 - 16.4 * T ** 4
  }
  let tai = LEAP_MS[0][1]
  for (const [t, s] of LEAP_MS) if (utcMs >= t) tai = s
  return tai + 32.184
}

export interface MarsTime {
  jdUT: number
  jdTT: number
  /** days since J2000 (TT) */
  dtJ2000: number
  /** mean anomaly, deg (0–360) */
  M: number
  /** angle of the fictitious mean sun, deg (0–360) */
  alphaFMS: number
  /** perturbers, deg */
  PBS: number
  /** equation of centre ν − M, deg */
  nuMinusM: number
  /** areocentric solar longitude, deg (0–360) */
  Ls: number
  /** equation of time, deg (positive: true sun ahead of mean sun) */
  eotDeg: number
  /** Mars Sol Date */
  msd: number
  /** mean solar time at the prime meridian ("Airy Mean Time"), hours 0–24 */
  mstH: number
  /** subsolar planetographic longitude, deg WEST (0–360) */
  subsolarLonWest: number
  /** planetographic solar declination, deg */
  declination: number
  /** heliocentric distance, AU */
  helioDistAU: number
}

/** Steps A-1 … D-2 for an instant (UTC, ms since 1970). */
export function marsTime(utcMs: number): MarsTime {
  const jdUT = 2440587.5 + utcMs / 8.64e7 // A-2
  const jdTT = jdUT + ttMinusUtc(utcMs) / 86400 // A-5
  const dt = jdTT - 2451545.0 // A-6
  const M = 19.3871 + 0.52402073 * dt // B-1
  const alphaFMS = 270.3871 + 0.524038496 * dt // B-2
  const PERT: [number, number, number][] = [
    [0.0071, 2.2353, 49.409], [0.0057, 2.7543, 168.173], [0.0039, 1.1177, 191.837], [0.0037, 15.7866, 21.736],
    [0.0021, 2.1354, 15.704], [0.002, 2.4694, 95.528], [0.0018, 32.8493, 49.095],
  ]
  let PBS = 0
  for (const [A, tau, phi] of PERT) PBS += A * Math.cos(((0.985626 * dt) / tau + phi) * DEG) // B-3
  const m = M * DEG
  const nuMinusM = (10.691 + 3.0e-7 * dt) * Math.sin(m) + 0.623 * Math.sin(2 * m) + 0.05 * Math.sin(3 * m)
    + 0.005 * Math.sin(4 * m) + 0.0005 * Math.sin(5 * m) + PBS // B-4
  const Ls = mod(alphaFMS + nuMinusM, 360) // B-5
  const l = Ls * DEG
  const eotDeg = 2.861 * Math.sin(2 * l) - 0.071 * Math.sin(4 * l) + 0.002 * Math.sin(6 * l) - nuMinusM // C-1
  const msd = (jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626 // C-2 (inner term)
  const mstH = mod(24 * msd, 24) // C-2
  const subsolarLonWest = mod(mstH * 15 + eotDeg + 180, 360) // C-5
  const declination = Math.asin(0.42565 * Math.sin(l)) / DEG + 0.25 * Math.sin(l) // D-1
  const helioDistAU = 1.52367934 * (1.00436 - 0.09309 * Math.cos(m) - 0.004336 * Math.cos(2 * m)
    - 0.00031 * Math.cos(3 * m) - 0.00003 * Math.cos(4 * m)) // D-2
  return { jdUT, jdTT, dtJ2000: dt, M: mod(M, 360), alphaFMS: mod(alphaFMS, 360), PBS, nuMinusM, Ls, eotDeg, msd, mstH, subsolarLonWest, declination, helioDistAU }
}

/** C-3: Local Mean Solar Time, hours, at a planetographic EAST longitude */
export const lmstHours = (t: MarsTime, lonEastDeg: number) => mod(t.mstH - (mod(-lonEastDeg, 360)) / 15, 24)

/** C-4: Local True Solar Time, hours */
export const ltstHours = (t: MarsTime, lonEastDeg: number) => mod(lmstHours(t, lonEastDeg) + t.eotDeg / 15, 24)

/** "hh:mm:ss" for an hour value (rounded to the second) */
export function hms(h: number): string {
  const s = Math.round(mod(h, 24) * 3600) % 86400
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

export interface SunPosition {
  /** solar zenith angle Z, deg (D-5) */
  zenith: number
  elevation: number
  /** azimuth, deg clockwise from north (D-6, with atan2 as the page advises) */
  azimuth: number
  /** unit vector towards the Sun in the local East-North-Up frame */
  enu: [number, number, number]
}

/** D-5 / D-6 at a planetographic latitude and EAST longitude */
export function sunPosition(t: MarsTime, latDeg: number, lonEastDeg: number): SunPosition {
  const lonWest = mod(-lonEastDeg, 360)
  const H = (lonWest - t.subsolarLonWest) * DEG
  const phi = latDeg * DEG
  const d = t.declination * DEG
  const zenith = Math.acos(Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(phi) * Math.cos(H)) / DEG
  const azimuth = mod(Math.atan2(Math.sin(H), Math.cos(phi) * Math.tan(d) - Math.sin(phi) * Math.cos(H)) / DEG, 360)
  const e = (90 - zenith) * DEG
  const a = azimuth * DEG
  return { zenith, elevation: 90 - zenith, azimuth, enu: [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)] }
}

/** Local Mars Sol Date: MSD shifted to a site's mean solar time (whole number changes at local mean midnight). */
export const localMsd = (t: MarsTime, lonEastDeg: number) => t.msd + mod(lonEastDeg, 360) / 360 - (mod(lonEastDeg, 360) > 180 ? 1 : 0)

/**
 * Mission sol from local mean solar time, with the convention given explicitly.
 * MER: GISS Mars24 technical notes — "Sol 1 for each MER lander denoted the solar day on which the lander touched down".
 * Phoenix, MSL, InSight and Mars 2020 count the landing sol as Sol 0.
 *
 * LIMITATION (stated, not hidden): MER kept a "hybrid" mission clock offset from landing-site LMST (GISS notes: more
 * than 37 min for Opportunity at the ~45-sol alignment). Sol boundaries computed here can therefore differ from the
 * mission's own sol numbering for events within about ±45 min of local midnight. Event records carry the published
 * sol when one exists; this function is for interpolation and for checking those values.
 */
export function missionSol(utcMs: number, landingUtcMs: number, siteLonEastDeg: number, landingSol: 0 | 1): number {
  const now = Math.floor(localMsd(marsTime(utcMs), siteLonEastDeg))
  const land = Math.floor(localMsd(marsTime(landingUtcMs), siteLonEastDeg))
  return now - land + landingSol
}
