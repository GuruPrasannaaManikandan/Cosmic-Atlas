/**
 * Milestone 1 exporter: reads the EXISTING Cosmic Atlas TypeScript astronomy modules (read-only) and writes
 *   unity-migration/data/catalog.v1.json          canonical astronomy data artefact
 *   unity-migration/data/parity_fixtures.v1.json  reference outputs of the TS engine for the C# parity tests
 *
 * Run from the frontend folder (so vite-node and the TS config resolve):
 *   cd frontend && npx vite-node ../unity-migration/exporter/export-astro-data.ts
 *
 * Nothing under frontend/ or backend/ is written. Exit code is non-zero if a self-check fails.
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as coords from '../../frontend/src/astro/coords'
import * as time from '../../frontend/src/astro/time'
import * as kepler from '../../frontend/src/astro/kepler'
import * as eph from '../../frontend/src/astro/ephemeris'
import * as ss from '../../frontend/src/data/solarSystem'
import * as catalog from '../../frontend/src/data/catalog'

type Vec3 = [number, number, number]

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '..', 'data')
const REPO = resolve(HERE, '..', '..')

const SOURCE_FILES = [
  'frontend/src/astro/coords.ts',
  'frontend/src/astro/time.ts',
  'frontend/src/astro/kepler.ts',
  'frontend/src/astro/ephemeris.ts',
  'frontend/src/data/solarSystem.ts',
  'frontend/src/data/satellitePhaseFit.ts',
  'frontend/src/data/catalog.ts',
]

const failures: string[] = []
const check = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg)
}

// ------------------------------------------------------------------------------------------------- provenance
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8' }).trim()
  } catch {
    return 'unavailable'
  }
}
const head = git('rev-parse HEAD')
const dirtySources = git(`status --porcelain -- ${SOURCE_FILES.map((f) => `"${f}"`).join(' ')}`)

// ------------------------------------------------------------------------------------------------- self-checks
/** Deep equality where a key holding `undefined` is treated as absent (JSON drops such keys). */
function deepEqualJson(a: unknown, b: unknown, path = '$'): string | null {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || (a === 0 && b === 0) ? null : `${path}: ${a} != ${b}`
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? null : `${path}: ${String(a)} != ${String(b)}`
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`
  const ka = Object.keys(a as object).filter((k) => (a as any)[k] !== undefined).sort()
  const kb = Object.keys(b as object).filter((k) => (b as any)[k] !== undefined).sort()
  if (ka.join('|') !== kb.join('|')) return `${path}: keys differ (${ka.join(',')}) vs (${kb.join(',')})`
  for (const k of ka) {
    const r = deepEqualJson((a as any)[k], (b as any)[k], `${path}.${k}`)
    if (r) return r
  }
  return null
}

function findNonFinite(v: unknown, path = '$'): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${path} = ${v}`
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const r = findNonFinite(x, `${path}.${k}`)
      if (r) return r
    }
  }
  return null
}

// ------------------------------------------------------------------------------------------------- catalogue artefact
const ids = catalog.OBJECTS.map((o) => o.id)
check(new Set(ids).size === ids.length, 'catalogue object ids are not unique')

const leapProbe = [
  Date.UTC(1971, 11, 31, 23, 59, 59, 999), Date.UTC(1972, 0, 1), Date.UTC(2016, 11, 31, 23, 59, 59, 999), Date.UTC(2017, 0, 1),
]

const catalogData = {
  constants: {
    LY_PER_PC: coords.LY_PER_PC,
    LY_PER_AU: coords.LY_PER_AU,
    SUN_GC_LY: coords.SUN_GC_LY,
    SUN_POS: coords.SUN_POS,
    C_KM_S: coords.C_KM_S,
    EQ_TO_GAL: coords.EQ_TO_GAL,
    OBLIQUITY_J2000_DEG: coords.OBLIQUITY_J2000_DEG,
    KM_PER_AU: kepler.KM_PER_AU,
    DAYS_PER_JULIAN_YEAR: kepler.DAYS_PER_JULIAN_YEAR,
    KM_TO_LY: catalog.KM_TO_LY,
    JD_UNIX_EPOCH: time.JD_UNIX_EPOCH,
    JD_J2000: time.JD_J2000,
    MS_PER_DAY: time.MS_PER_DAY,
    J2000_MS: eph.J2000_MS,
    EPHEMERIS_VALID_FROM_MS: eph.VALID_FROM,
    EPHEMERIS_VALID_TO_MS: eph.VALID_TO,
    MOON_DISPLAY_AU: catalog.MOON_DISPLAY_AU,
    CHARON_PLUTO_MASS_RATIO: ss.CHARON_PLUTO_MASS_RATIO,
    SATURN_EQ_RADIUS_KM: ss.SATURN_EQ_RADIUS_KM,
  },
  planetElements: eph.PLANET_ELEMENTS,
  planetPoles: ss.PLANET_POLES,
  planetRadiusKm: ss.PLANET_RADIUS_KM,
  saturnRings: ss.SATURN_RINGS,
  objects: catalog.OBJECTS,
  solarBodies: ss.SOLAR_BODIES,
}

const roundTrip = deepEqualJson(catalogData, JSON.parse(JSON.stringify(catalogData)))
check(roundTrip === null, `catalogue JSON round trip differs: ${roundTrip}`)
const nonFinite = findNonFinite(catalogData)
check(nonFinite === null, `non-finite number in catalogue: ${nonFinite}`)

const contentHash = createHash('sha256').update(JSON.stringify(catalogData)).digest('hex')
const generatedFrom = {
  gitHead: head,
  sourceFiles: SOURCE_FILES,
  sourceFilesDirty: dirtySources === '' ? [] : dirtySources.split('\n'),
  exporter: 'unity-migration/exporter/export-astro-data.ts',
  generatedAtUtc: new Date().toISOString(),
}

// ------------------------------------------------------------------------------------------------- epochs
const fixedEpochs = [
  Date.UTC(1800, 0, 1), Date.UTC(1850, 5, 15), Date.UTC(1900, 0, 1), Date.UTC(1950, 0, 1),
  Date.UTC(1969, 6, 20, 20, 17), Date.UTC(1972, 0, 1), Date.UTC(1999, 0, 1), eph.J2000_MS,
  Date.UTC(2017, 0, 1), Date.UTC(2026, 9, 25), Date.UTC(2026, 10, 8, 12, 30), Date.UTC(2050, 11, 31),
]
let seed = 20261108
const lcg = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
const randomEpochs = Array.from({ length: 40 }, () => Math.round(eph.VALID_FROM + lcg() * (eph.VALID_TO - eph.VALID_FROM)))
const epochs = [...fixedEpochs, ...randomEpochs]

// ------------------------------------------------------------------------------------------------- fixtures
const timeCases = [
  ...epochs,
  ...leapProbe,
  Date.UTC(1700, 0, 1), Date.UTC(2100, 0, 1), Date.UTC(2200, 6, 4, 3, 2, 1, 7), -1, 0, 1,
].map((ms) => ({ ms, ttMinusUtc: time.ttMinusUtc(ms), jdTdb: time.jdTdbFromUtcMs(ms), centuriesSinceJ2000: eph.centuriesSinceJ2000(ms), isModelRange: eph.isModelRange(ms) }))

const calendarEpochs = ['2000-01-01.5', '2020-01-01.0', '1950-01-01.0', '2016-07-31.25', '1999-12-31.999'].map((s) => ({ s, jd: time.jdFromCalendarEpoch(s) }))

const raDecCases: [number, number, number][] = [
  [0, 0, 1], [266.40499, -28.93617, 26673], [10.6847, 41.2687, 2.537e6], [88.7929, 7.4071, 548], [192.85948, 27.12825, 1000], [359.999, -89.9, 3.3],
]
const coordCases = {
  raDec: raDecCases.map(([ra, dec, d]) => ({
    raDeg: ra, decDeg: dec, distanceLy: d,
    unit: coords.raDecToUnit(ra, dec),
    galacticUnit: coords.equatorialToGalactic(coords.raDecToUnit(ra, dec)),
    rootLy: coords.raDecDistToRoot(ra, dec, d),
  })),
  galacticLB: [[0, 0, 10], [90, 0, 10], [320, -5, 1.6e8], [180, 45, 5], [12.3, -88, 7]].map(([l, b, d]) => ({
    lDeg: l, bDeg: b, distanceLy: d, unit: coords.galacticLBToUnit(l, b), rootLy: coords.sunRelativeToRoot(coords.galacticLBToUnit(l, b), d),
    backToLB: coords.unitToGalacticLB(coords.galacticLBToUnit(l, b)),
  })),
  ecliptic: ([[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.7, 0.2], [-5.2, 1.1, 0.12]] as Vec3[]).map((v) => ({ v, galactic: coords.eclipticToGalactic(v) })),
}

const keplerCases = {
  stable: ([[0, 0], [1, 0.0167], [-3.1, 0.2], [3.14159, 0.5], [Math.PI, 0.9], [-Math.PI, 0.9], [0.001, 0.99], [5.5, 0.751], [100.25, 0.3], [-42, 0.05]] as [number, number][])
    .map(([M, e]) => ({ M, e, E: kepler.solveKeplerStable(M, e) })),
  legacy: ([[0, 0.0167], [1.2, 0.2], [-2.5, 0.0485], [3.0, 0.2563], [0.1, 0.9]] as [number, number][]).map(([M, e]) => ({ M, e, E: eph.solveKepler(M, e) })),
  jplRates: [
    { iDeg: 5.16, periodDays: 27.322, apsisPeriodYr: 5.997, nodePeriodYr: 18.6 },
    { iDeg: 157.3, periodDays: 5.8792, apsisPeriodYr: 675.2, nodePeriodYr: 299.4 },
    { iDeg: 0.0, periodDays: 6.387222, apsisPeriodYr: null, nodePeriodYr: null },
  ].map((row) => ({ row, rates: kepler.jplSatelliteRates(row) })),
}

const planetIds = Object.keys(eph.PLANET_ELEMENTS)
const planets = planetIds.map((id) => ({
  id,
  samples: epochs.map((ms) => {
    const au = eph.planetEclipticAU(id, ms)
    const g = coords.eclipticToGalactic(au)
    return {
      ms,
      eclipticAu: au,
      offsetLy: eph.planetOffsetLy(id, ms),
      rootLy: eph.planetRootPos(id, ms),
      heliocentricKm: [g[0] * kepler.KM_PER_AU, g[1] * kepler.KM_PER_AU, g[2] * kepler.KM_PER_AU] as Vec3,
    }
  }),
}))

/** Heliocentric km (galactic axes) composed in km from the app's own primitives (no ly round trip). */
function heliocentricKm(id: string, ms: number): Vec3 {
  const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
  const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
  const planetKm = (p: string): Vec3 => mul(coords.eclipticToGalactic(eph.planetEclipticAU(p, ms)), kepler.KM_PER_AU)
  const q = ss.CHARON_PLUTO_MASS_RATIO
  const bary = (): Vec3 => kepler.positionAtMs(ss.PLUTO_BODY.orbit.elements, ms)
  const b = ss.SOLAR_BODY_BY_ID[id]
  if (b.parent === 'sun') {
    if (b.id === 'pluto') return add(bary(), mul(kepler.positionAtMs(ss.SOLAR_BODY_BY_ID.charon.orbit.elements, ms), -q / (1 + q)))
    return kepler.positionAtMs(b.orbit.elements, ms)
  }
  if (b.parent === 'pluto') {
    if (b.id === 'charon') return add(bary(), mul(kepler.positionAtMs(b.orbit.elements, ms), 1 / (1 + q)))
    return add(bary(), kepler.positionAtMs(b.orbit.elements, ms))
  }
  return add(planetKm(b.parent), kepler.positionAtMs(b.orbit.elements, ms))
}

const bodies = ss.SOLAR_BODIES.map((b) => ({
  id: b.id,
  parent: b.parent,
  samples: epochs.map((ms) => ({
    ms,
    relativeToPrimaryKm: kepler.positionAtMs(b.orbit.elements, ms),
    orbitNormal: kepler.orbitNormalAtMs(b.orbit.elements, ms),
    rootLy: catalog.solarBodyRootPos(b, ms),
    heliocentricKm: heliocentricKm(b.id, ms),
  })),
}))

const frames = ss.SOLAR_BODIES.map((b) => ({ id: b.id, frame: b.orbit.elements.frame, toGalactic: kepler.frameToGalactic(b.orbit.elements.frame) }))

const orbitPaths = ['moon', 'triton', 'nereid', 'charon', 'ceres', 'eris'].map((id) => ({
  id, ms: Date.UTC(2026, 10, 8), n: 16, pointsKm: kepler.orbitPathKm(ss.SOLAR_BODY_BY_ID[id].orbit.elements, Date.UTC(2026, 10, 8), 16),
}))

const objectEpochs = epochs.filter((_, i) => i % 5 === 0)
const objects = catalog.OBJECTS.map((o) => ({
  id: o.id,
  kind: o.position.kind,
  samples: objectEpochs.map((ms) => ({ ms, rootLy: catalog.positionOf(o, ms) })),
}))

const fixtures = {
  schemaVersion: 1,
  generatedFrom,
  catalogContentHash: contentHash,
  epochs,
  time: { cases: timeCases, calendarEpochs },
  coords: coordCases,
  kepler: keplerCases,
  frames,
  planets,
  bodies,
  orbitPaths,
  objects,
}
const fxNonFinite = findNonFinite(fixtures)
check(fxNonFinite === null, `non-finite number in fixtures: ${fxNonFinite}`)

// ------------------------------------------------------------------------------------------------- write
if (failures.length) {
  console.error('EXPORT FAILED:\n  ' + failures.join('\n  '))
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'catalog.v1.json'), JSON.stringify({ schemaVersion: 1, generatedFrom, contentHash, ...catalogData }, null, 1) + '\n')
writeFileSync(resolve(OUT_DIR, 'parity_fixtures.v1.json'), JSON.stringify(fixtures) + '\n')
console.log(
  `catalog.v1.json: ${catalogData.objects.length} objects, ${catalogData.solarBodies.length} solar bodies, ${planetIds.length} planets, sha256 ${contentHash.slice(0, 16)}…\n` +
  `parity_fixtures.v1.json: ${epochs.length} epochs, ${timeCases.length} time cases, ${planets.length} planets, ${bodies.length} bodies, ${objects.length} objects\n` +
  `round trip: deep-equal OK; git ${head.slice(0, 7)}; dirty source files: ${generatedFrom.sourceFilesDirty.length}`,
)
