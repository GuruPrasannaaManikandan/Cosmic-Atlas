/**
 * Time scales for the orbital engine. The simulation clock (store.simMs) is UTC milliseconds; JPL mean elements
 * are referred to TDB epochs. TDB is approximated by TT (they differ by < 2 ms), and TT - UTC = 32.184 s + (TAI - UTC).
 */
export const MS_PER_DAY = 86400000
export const JD_UNIX_EPOCH = 2440587.5
/** J2000.0 = JD 2451545.0 TDB. */
export const JD_J2000 = 2451545.0

// IERS leap seconds: [UTC ms when it takes effect, TAI - UTC in seconds]. No leap second is scheduled after 2017.
const LEAP: [number, number][] = [
  [Date.UTC(1972, 0, 1), 10], [Date.UTC(1972, 6, 1), 11], [Date.UTC(1973, 0, 1), 12], [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14], [Date.UTC(1976, 0, 1), 15], [Date.UTC(1977, 0, 1), 16], [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18], [Date.UTC(1980, 0, 1), 19], [Date.UTC(1981, 6, 1), 20], [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22], [Date.UTC(1985, 6, 1), 23], [Date.UTC(1988, 0, 1), 24], [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26], [Date.UTC(1992, 6, 1), 27], [Date.UTC(1993, 6, 1), 28], [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30], [Date.UTC(1997, 6, 1), 31], [Date.UTC(1999, 0, 1), 32], [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34], [Date.UTC(2012, 6, 1), 35], [Date.UTC(2015, 6, 1), 36], [Date.UTC(2017, 0, 1), 37],
]

/** TT - UTC in seconds. Before 1972 a constant 42.184 s is used (documented simplification; error < 1 min). */
export function ttMinusUtc(ms: number): number {
  let tai = 10
  for (const [t, v] of LEAP) {
    if (ms >= t) tai = v
    else break
  }
  return 32.184 + tai
}

/** Julian Date (TDB ≈ TT) for a UTC millisecond timestamp. */
export function jdTdbFromUtcMs(ms: number): number {
  return JD_UNIX_EPOCH + (ms / 1000 + ttMinusUtc(ms)) / 86400
}

/** Calendar epoch such as "2000-01-01.5" (TDB) -> JD. */
export function jdFromCalendarEpoch(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}(?:\.\d+)?)$/.exec(s.trim())
  if (!m) throw new Error(`Bad epoch: ${s}`)
  const day = parseFloat(m[3])
  const base = Date.UTC(+m[1], +m[2] - 1, Math.floor(day))
  return JD_UNIX_EPOCH + base / MS_PER_DAY + (day - Math.floor(day))
}
