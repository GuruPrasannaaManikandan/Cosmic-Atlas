import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { nav, distanceTo } from '../store/nav'
import { BY_ID } from '../data/catalog'
import { sitesForBody, catalogueSitesFor, SURFACE_BODIES } from './sites'
import { MISSION_BY_ID } from '../missions'

const KM_PER_LY = 9.4607304725808e12
/** "approaching": within this distance of the body's centre the EXPLORE action appears */
const APPROACH_KM: Record<string, number> = { moon: 120000 }

/** the body the observer is at, if it has an explorable surface */
function useNearSurfaceBody(): string | null {
  const simMs = useStore((s) => s.simMs)
  const selectedId = useStore((s) => s.selectedId)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 600)
    return () => clearInterval(t)
  }, [])
  const candidates = [nav.followId, selectedId, nav.nearestId].filter(Boolean) as string[]
  for (const id of candidates) {
    if (!APPROACH_KM[id] || !BY_ID[id] || !sitesForBody(id).some((s) => s.available)) continue
    const km = distanceTo(id, simMs) * KM_PER_LY
    if (km < APPROACH_KM[id]) return id
  }
  return null
}

export function ExploreSurfaceButton({ hidden }: { hidden?: boolean }) {
  const body = useNearSurfaceBody()
  const [picker, setPicker] = useState(false)
  if (!body || hidden) return null
  const name = SURFACE_BODIES[body]?.name ?? body
  return (
    <>
      <button className="explore-surface-btn" onClick={() => setPicker(true)} data-testid="explore-surface">
        <span className="eyebrow">SURFACE EXPLORATION</span>
        <b>EXPLORE {name.toUpperCase()}</b>
      </button>
      {picker && <SitePicker bodyId={body} onClose={() => setPicker(false)} />}
    </>
  )
}

export function SitePicker({ bodyId, onClose }: { bodyId: string; onClose: () => void }) {
  const sites = sitesForBody(bodyId)
  const catalogue = catalogueSitesFor(bodyId)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop site-picker-backdrop" onClick={onClose}>
      <div className="site-picker glass" role="dialog" aria-label={`Explore the ${SURFACE_BODIES[bodyId]?.name}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="eyebrow">CHOOSE A LANDING SITE</span>
          <h2>Explore the {SURFACE_BODIES[bodyId]?.name}</h2>
          <button className="discovery-close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <ul className="site-list">
          {sites.map((s) => (
            <li key={s.id} className="site available">
              <div>
                <b>{s.name}</b>
                <span className="muted small">
                  {Math.abs(s.origin.latDeg).toFixed(5)}°{s.origin.latDeg >= 0 ? 'N' : 'S'}, {s.origin.lonEastDeg.toFixed(5)}°E · {s.objects.length} historical objects at their LRO-measured positions
                </span>
              </div>
              <button className="btn big" data-testid={`descend-${s.id}`} onClick={() => useStore.getState().enterSurface(s.id)}>
                Descend ▾
              </button>
            </li>
          ))}
          {catalogue
            .filter((c) => !c.explorable)
            .map((c) => (
              <li key={c.missionId} className="site">
                <div>
                  <b>{c.name}{!c.nasa && <em className="non-nasa"> · {MISSION_BY_ID[c.missionId].agency}, not NASA</em>}</b>
                  <span className="muted small">
                    {Math.abs(c.site.latDeg).toFixed(4)}°{c.site.latDeg >= 0 ? 'N' : 'S'}, {(((c.site.lonEastDeg + 180) % 360) - 180).toFixed(4)}°E · catalogued — surface environment not built yet
                  </span>
                </div>
              </li>
            ))}
        </ul>
        <p className="muted small">
          Chandrayaan-3 (ISRO) is catalogued as a labelled non-NASA exception; its measured landing position is not sourced yet, so it is not placed on the map.
        </p>
      </div>
    </div>
  )
}
