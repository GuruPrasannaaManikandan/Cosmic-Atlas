import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { nav, distanceTo } from '../store/nav'
import { BY_ID } from '../data/catalog'
import { sitesForBody, unitySitesForBody, catalogueSitesFor, SURFACE_BODIES } from './sites'
import { MISSION_BY_ID } from '../missions'
import { expedition } from '../expedition/expedition'

const KM_PER_LY = 9.4607304725808e12
/** "approaching": within this distance of the body's centre the EXPLORE action appears */
const APPROACH_KM: Record<string, number> = { moon: 120000, mars: 250000 }

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
    if (!APPROACH_KM[id] || !BY_ID[id] || (!sitesForBody(id).some((s) => s.available) && !unitySitesForBody(id).length)) continue
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

/** open a site from the catalogue: a flight still playing (e.g. the return to orbit just started) is ended first, or its
 *  overlay would keep owning the keyboard on the new surface */
function enterSite(id: string) {
  if (expedition.active()) expedition.cancel()
  useStore.getState().enterSurface(id)
}

const latLonText = (lat: number, lon: number) => {
  const e = lon > 180 ? lon - 360 : lon
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(e).toFixed(4)}°${e >= 0 ? 'E' : 'W'}`
}

export function SitePicker({ bodyId, onClose }: { bodyId: string; onClose: () => void }) {
  const sites = sitesForBody(bodyId)
  const unitySites = unitySitesForBody(bodyId)
  const catalogue = catalogueSitesFor(bodyId)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop site-picker-backdrop" onClick={onClose}>
      <div className="site-picker glass" data-body={bodyId} role="dialog" aria-label={`Explore the ${SURFACE_BODIES[bodyId]?.name}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="eyebrow">CHOOSE A LANDING SITE</span>
          <h2>Explore {bodyId === 'moon' ? 'the Moon' : SURFACE_BODIES[bodyId]?.name}</h2>
          <button className="discovery-close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <ul className="site-grid" data-testid="site-grid">
          {sites.map((s) => (
            <li key={s.id} className="site-card available" data-testid={`site-card-${s.id}`}>
              <div className="site-card-head">
                <span className="site-badge kind">Crewed landing site</span>
                <span className="site-badge ok">Available</span>
              </div>
              <b className="site-card-title">{s.name}</b>
              <span className="site-card-meta">{latLonText(s.origin.latDeg, s.origin.lonEastDeg)}</span>
              <span className="site-card-text">{s.objects.length} historical objects at their LRO-measured positions · LROC terrain</span>
              <button className="btn site-card-go" data-testid={`descend-${s.id}`} onClick={() => enterSite(s.id)}>Descend ▾</button>
            </li>
          ))}
          {unitySites.map((s) => {
            const m = MISSION_BY_ID[s.missionIds[0]]
            return (
              <li key={s.id} className="site-card available" data-testid={`site-card-${s.id}`} data-mode={s.mode}>
                <div className="site-card-head">
                  <span className={`site-badge kind ${s.mode}`}>{s.mode === 'lander' ? '⬢ Stationary lander' : '⛭ Rover mission'}</span>
                  <span className="site-badge ok">Available</span>
                </div>
                <b className="site-card-title">{m?.name ?? s.name}</b>
                <span className="site-card-meta">
                  {s.name.split(' — ')[1] ?? s.name} · {latLonText(s.origin.latDeg, s.origin.lonEastDeg)}
                  {m?.landing?.value ? ` · landed ${m.landing.value.slice(0, 10)}` : ''}
                </span>
                <span className="site-card-text">{s.summary}</span>
                {s.hardware && <span className="site-card-hw">{s.hardware}</span>}
                <span className="site-card-scene">Scene: {s.scene.label}</span>
                <button className="btn site-card-go" data-testid={`descend-${s.id}`} onClick={() => enterSite(s.id)}>Land ▾</button>
              </li>
            )
          })}
        </ul>
        {catalogue.some((c) => !c.explorable) && (
          <>
            <h3 className="site-subhead">Catalogued — no surface environment yet</h3>
            <ul className="site-pending" data-testid="site-pending">
              {catalogue
                .filter((c) => !c.explorable)
                .map((c) => (
                  <li key={c.missionId}>
                    <b>{c.name}{!c.nasa && <em className="non-nasa"> · {MISSION_BY_ID[c.missionId].agency}, not NASA</em>}</b>
                    <span className="muted small">{latLonText(c.site.latDeg, ((c.site.lonEastDeg + 180) % 360) - 180)} · not built</span>
                  </li>
                ))}
            </ul>
          </>
        )}
        <p className="muted small">Mars environments run in the embedded Unity player (one ~90 MB download, then each site's terrain package of ~11 MB). Terrain: USGS controlled HiRISE products; every model is labelled as a NASA model, a documented reconstruction or a simplified model inside the site.</p>
        <p className="muted small">
          Chandrayaan-3 (ISRO) is catalogued as a labelled non-NASA exception; its measured landing position is not sourced yet, so it is not placed on the map.
        </p>
      </div>
    </div>
  )
}

/**
 * One landing-site catalogue for the whole app: opened from the orbital EXPLORE button, the homepage's "landing sites"
 * entries, or window.__openSitePicker('mars') (tests). Mounted once in App.
 */
let openPicker: ((bodyId: string) => void) | null = null
export const openSitePicker = (bodyId: string) => openPicker?.(bodyId)
if (typeof window !== 'undefined') (window as unknown as { __openSitePicker?: (b: string) => void }).__openSitePicker = openSitePicker

export function SitePickerHost() {
  const [body, setBody] = useState<string | null>(null)
  useEffect(() => {
    openPicker = (b) => setBody(b)
    return () => { openPicker = null }
  }, [])
  const siteId = useStore((s) => s.surfaceSiteId)
  useEffect(() => { if (siteId) setBody(null) }, [siteId])
  return body ? <SitePicker bodyId={body} onClose={() => setBody(null)} /> : null
}
