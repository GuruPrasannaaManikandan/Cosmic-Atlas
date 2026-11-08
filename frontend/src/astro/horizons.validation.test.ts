/**
 * Accuracy check of the Keplerian engine against JPL Horizons (fixture retrieved 2026-10-25, see
 * docs/SOLAR_SYSTEM_VALIDATION.md). Tolerances are the documented expected errors of each model, not a claim of
 * ephemeris accuracy. Run `npx vitest run src/astro/horizons.validation.test.ts` to print the full table.
 */
import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/horizons_vectors.json'
import { Vec3, equatorialToGalactic, len, sub, scale } from './coords'
import { positionAtMs, orbitPathKm } from './kepler'
import { SOLAR_BODY_BY_ID, CHARON_PLUTO_MASS_RATIO } from '../data/solarSystem'

const q = CHARON_PLUTO_MASS_RATIO

/** Model vector in the same sense as the Horizons query (target relative to centre), galactic axes, km. */
function model(id: string, ms: number): Vec3 | null {
  if (id === 'pluto') return scale(positionAtMs(SOLAR_BODY_BY_ID.charon.orbit.elements, ms), -q / (1 + q))
  if (id === 'pluto-bary') return positionAtMs(SOLAR_BODY_BY_ID.pluto.orbit.elements, ms)
  const b = SOLAR_BODY_BY_ID[id]
  if (!b) return null
  return positionAtMs(b.orbit.elements, ms)
}

export interface ValidationRow { id: string; utc: string; errKm: number; refKm: number; errDeg: number }

export function validationRows(): ValidationRow[] {
  const rows: ValidationRow[] = []
  for (const v of fixture.vectors) {
    const ms = Date.parse(v.utc)
    const m = model(v.id, ms)
    if (!m) continue
    const ref = equatorialToGalactic(v.xyz_km as Vec3)
    const err = len(sub(m, ref))
    const r = len(ref)
    rows.push({ id: v.id, utc: v.utc.slice(0, 10), errKm: err, refKm: r, errDeg: (2 * Math.asin(Math.min(1, err / (2 * r))) * 180) / Math.PI })
  }
  return rows
}

// Expected-error envelopes (angular error as seen from the primary, degrees) per model class.
const TOL_DEG: Record<string, number> = {
  moon: 6, // no solar perturbations (evection/variation)
  himalia: 25, phoebe: 25, nereid: 25, // Sun-perturbed distant orbits
  hyperion: 25, // Titan 4:3 resonance
  mimas: 80, // Mimas-Tethys 2:1 resonance: 71-yr libration with ~44° amplitude in longitude
  nix: 90, hydra: 10, charon: 1, pluto: 1, // Pluto circumbinary / binary pair
  'pluto-bary': 2, ceres: 3, vesta: 3, pallas: 6, hygiea: 15, eris: 1, haumea: 1, makemake: 1,
}
const DEFAULT_TOL_DEG = 3

describe('Keplerian engine vs JPL Horizons (fixture)', () => {
  const rows = validationRows()
  it('prints the comparison table', () => {
    // eslint-disable-next-line no-console
    console.log('\nbody          date        error_km      ref_dist_km   error_deg\n' + rows.map((r) =>
      `${r.id.padEnd(13)} ${r.utc}  ${r.errKm.toExponential(3).padStart(10)}  ${r.refKm.toExponential(3).padStart(12)}  ${r.errDeg.toFixed(3).padStart(8)}`).join('\n'))
    expect(rows.length).toBeGreaterThan(40)
  })
  it('every compared body is within its documented error envelope', () => {
    for (const r of rows) {
      const tol = TOL_DEG[r.id] ?? DEFAULT_TOL_DEG
      expect(r.errDeg, `${r.id} @ ${r.utc}`).toBeLessThan(tol)
    }
  })
  it('the drawn orbit passes through the body (same math)', () => {
    const el = SOLAR_BODY_BY_ID.io.orbit.elements
    const ms = Date.UTC(2026, 9, 25)
    const p = positionAtMs(el, ms)
    const path = orbitPathKm(el, ms, 2048)
    const dmin = Math.min(...path.map((x) => len(sub(x, p))))
    expect(dmin / el.aKm).toBeLessThan(2e-3)
  })
})
