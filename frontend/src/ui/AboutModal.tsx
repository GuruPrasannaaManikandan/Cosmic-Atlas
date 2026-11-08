import { useEffect } from 'react'

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
            <b>Scale & Perspective:</b> To facilitate visual exploration across 15 orders of magnitude, planet physical diameters and Moon separation are exaggerated. Logarithmic distance compression applies beyond 10⁶ render units while preserving angular diameter.
          </li>
          <li>
            <b>Illustrative Geometry:</b> Milky Way disc particles, the cosmic web filaments, nebula sprites, and planet surface textures are procedural approximations. Laniakea, the Local Sheet, and the Orion Arm are represented as schematic markers.
          </li>
          <li>
            <b>No Spatial Fabrication:</b> Ingested catalogue records lacking reliable distance measurements (parallax or cosmological redshift) are never assigned arbitrary 3D positions.
          </li>
        </ul>
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
