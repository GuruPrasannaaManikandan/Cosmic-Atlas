/**
 * Precise Solar-System relative positions in kilometres (galactic axes, Sun origin).
 *
 * The app's root frame stores positions in light-years from the Galactic Centre, where one float64 ULP near the Sun is
 * ~34 km (see COSMIC_ATLAS_UNITY_MIGRATION_BLUEPRINT.md, finding D1). Differences between two Solar-System bodies taken
 * in that frame inherit that error. These helpers compose positions in km from the same engine primitives instead
 * (same composition as catalog.solarBodyRootPos and the C# SolarSystemFrames), so body-to-body offsets are exact to
 * well below a metre. Used by the Travel Mode flight model.
 */
import { Vec3, add, sub, scale, eclipticToGalactic } from './coords'
import { planetEclipticAU, PLANET_ELEMENTS } from './ephemeris'
import { positionAtMs, KM_PER_AU } from './kepler'
import { BY_ID, positionOf, KM_TO_LY } from '../data/catalog'
import { SOLAR_BODY_BY_ID, PLUTO_BODY, CHARON_PLUTO_MASS_RATIO } from '../data/solarSystem'

/** Heliocentric position in km (galactic axes), or null for objects outside the Solar-System model. */
export function heliocentricKm(id: string, ms: number): Vec3 | null {
  if (id === 'sun') return [0, 0, 0]
  if (PLANET_ELEMENTS[id]) return scale(eclipticToGalactic(planetEclipticAU(id, ms)), KM_PER_AU)
  const b = SOLAR_BODY_BY_ID[id]
  if (!b) return null
  const q = CHARON_PLUTO_MASS_RATIO
  const bary = () => positionAtMs(PLUTO_BODY.orbit.elements, ms)
  if (b.parent === 'sun') {
    if (b.id === 'pluto') return add(bary(), scale(positionAtMs(SOLAR_BODY_BY_ID.charon.orbit.elements, ms), -q / (1 + q)))
    return positionAtMs(b.orbit.elements, ms)
  }
  if (b.parent === 'pluto') {
    if (b.id === 'charon') return add(bary(), scale(positionAtMs(b.orbit.elements, ms), 1 / (1 + q)))
    return add(bary(), positionAtMs(b.orbit.elements, ms))
  }
  const parent = heliocentricKm(b.parent, ms)
  return parent ? add(parent, positionAtMs(b.orbit.elements, ms)) : null
}

/** Position of `a` minus position of `b` in km. Exact for Solar-System bodies; root-frame fallback otherwise. */
export function relativeKm(a: string, b: string, ms: number): Vec3 {
  if (a === b) return [0, 0, 0]
  const ha = heliocentricKm(a, ms)
  const hb = heliocentricKm(b, ms)
  if (ha && hb) return sub(ha, hb)
  return scale(sub(positionOf(BY_ID[a], ms), positionOf(BY_ID[b], ms)), 1 / KM_TO_LY)
}
