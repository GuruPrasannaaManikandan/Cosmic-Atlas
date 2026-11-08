import { useEffect } from 'react'
import { ASSET_REGISTRY, AstronomicalAsset } from '../data/assetRegistry'

const CLASS_LABEL: Record<AstronomicalAsset['provenanceClass'], string> = {
  observational: 'Observational imagery',
  'processed-scientific': 'Processed from spacecraft data',
  procedural: 'Procedural illustration (not an observation)',
  'educational-simulation': 'Educational simulation',
  cinematic: 'Cinematic reconstruction',
  unverified: 'Origin not documented upstream',
}

/** Image credits generated from the asset registry (CC BY assets require visible attribution). */
function ImageCredits() {
  const groups = new Map<string, { a: AstronomicalAsset; names: string[] }>()
  for (const a of Object.values(ASSET_REGISTRY)) {
    const key = `${a.attribution}|${a.license}|${a.provenanceClass}`
    const g = groups.get(key) ?? { a, names: [] }
    g.names.push(a.name.replace(/\s*\(.*?\)\s*$/, ''))
    groups.set(key, g)
  }
  return (
    <section aria-label="Image credits" style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Image credits &amp; licences</h3>
      <ul style={{ fontSize: 12.5 }}>
        {[...groups.values()].map(({ a, names }) => (
          <li key={a.attribution + a.license}>
            <b>{a.attribution}</b> — {a.license}. <i>{CLASS_LABEL[a.provenanceClass]}</i>
            {(a.sourceUrl ?? '').startsWith('http') && (
              <>
                {' '}
                (<a className="link" href={a.sourceUrl} target="_blank" rel="noreferrer">source</a>)
              </>
            )}
            <div style={{ color: 'var(--mut)' }}>{names.length} map{names.length > 1 ? 's' : ''}: {names.slice(0, 6).join(', ')}{names.length > 6 ? ', …' : ''}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Scientific notes">
      <div className="card glass" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Scientific Integrity Notes</div>
        <h2>Astrophysical Principles & Data Provenance</h2>
        <ul>
          <li>
            <b>Landmark Coordinates:</b> Landmarks originate from curated, peer-reviewed catalogues (SIMBAD, Hipparcos, Gaia, GRAVITY 2019, NED) converted into IAU Galactic Cartesian coordinates in light-years.
          </li>
          <li>
            <b>Solar System Ephemerides:</b> Planetary positions utilize approximate analytical Keplerian orbital elements (NASA JPL, epoch valid 1800–2050). High-precision vector comparison is available live via JPL Horizons API.
          </li>
          <li>
            <b>Scale & Perspective:</b> Planets and moons are drawn at their true mean radii and the Moon at its true distance; the Sun's display radius is enlarged (~10×). Very small bodies keep a minimum on-screen size. Logarithmic distance compression applies beyond 10⁶ render units while preserving angular diameter.
          </li>
          <li>
            <b>Illustrative Geometry:</b> Milky Way disc particles, the cosmic web filaments, nebula sprites and the Betelgeuse, Andromeda and Carina images are procedural illustrations, not observations. Planet maps are Solar System Scope composites based on NASA data; moon maps are USGS / NASA spacecraft mosaics (see credits). Laniakea, the Local Sheet, and the Orion Arm are schematic markers.
          </li>
          <li>
            <b>No Spatial Fabrication:</b> Ingested catalogue records lacking reliable distance measurements (parallax or cosmological redshift) are never assigned arbitrary 3D positions.
          </li>
        </ul>
        <ImageCredits />
        <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  )
}
export default AboutModal
