/**
 * Discovery catalogue (J): everything that can be discovered at this site — the historical vehicles, their parts and the
 * measured landmarks — with the user's progress for each. Listing an item never marks it: the status comes only from
 * what the user did (progress.ts). A vehicle's record opens from here once it has been approached.
 */
import { useEffect, useState } from 'react'
import { MISSION_BY_ID, OBJECT_BY_ID, SOURCES } from '../missions'
import { useDiscovery, LEVELS, partKey, landmarkKey, type Level } from './progress'
import { SITE_DISCOVERIES, type SiteLandmark } from './siteDiscoveries'
import { CATEGORY_LABEL } from './labels'
import './discovery.css'

const deg = (r: number) => (r * 180) / Math.PI
const bearing = (x0: number, z0: number, x1: number, z1: number) => (deg(Math.atan2(x1 - x0, z1 - z0)) + 360) % 360

function Status({ level }: { level: Level }) {
  return <span className={`dc-status l${level}`} data-level={level}>{LEVELS[level]}</span>
}

function LandmarkRecord({ siteId, l }: { siteId: string; l: SiteLandmark }) {
  useEffect(() => {
    const k = landmarkKey(l.id)
    useDiscovery.getState().mark(siteId, k, 3)
    const t = window.setTimeout(() => useDiscovery.getState().mark(siteId, k, 4), 5000)
    return () => window.clearTimeout(t)
  }, [siteId, l.id])
  const src = [...new Set([...l.description.sources, ...l.placement.sources])].filter((s) => SOURCES[s])
  return (
    <div className="dc-landmark-record" data-testid={`landmark-record-${l.id}`}>
      <p>{l.description.text}</p>
      <p className="muted small"><b>Position:</b> {l.placement.text}</p>
      <ol className="cr-sources">{src.map((s) => <li key={s}><a href={SOURCES[s].url} target="_blank" rel="noreferrer">{SOURCES[s].title}</a></li>)}</ol>
    </div>
  )
}

export interface CatalogueProps {
  siteId: string
  siteName: string
  missionId: string
  /** explorer position (site frame) */
  pose: { x: number; z: number } | null
  /** scene hardware positions (site frame) and which parts the model separates */
  hardware: { id: string; x: number; z: number; parts: string[] }[]
  onOpenRecord: (hardwareId: string) => void
  onClose: () => void
}

export function DiscoveryCatalogue({ siteId, siteName, missionId, pose, hardware, onOpenRecord, onClose }: CatalogueProps) {
  const levels = useDiscovery((s) => s.bySite[siteId] ?? {})
  const cfg = SITE_DISCOVERIES[siteId]
  const mission = MISSION_BY_ID[missionId]
  const [openLandmark, setOpenLandmark] = useState<string | null>(null)
  if (!cfg) return null
  const lv = (k: string) => (levels[k] ?? 0) as Level
  const vehicles = Object.entries(cfg.objects).map(([hw, oid]) => ({ hw, obj: OBJECT_BY_ID[oid], pos: hardware.find((h) => h.id === hw) })).filter((v) => v.obj)
  const keys = [...vehicles.flatMap((v) => [v.obj.id, ...v.obj.components.map((c) => partKey(v.obj.id, c.id))]), ...cfg.landmarks.map((l) => landmarkKey(l.id))]
  const count = (min: Level) => keys.filter((k) => lv(k) >= min).length
  const dist = (x: number, z: number) => (pose ? `${Math.round(Math.hypot(x - pose.x, z - pose.z))} m · ${Math.round(bearing(pose.x, pose.z, x, z))}°` : '')
  const site = mission?.landingSite?.value
  return (
    <div className="surf-overlay" role="dialog" aria-modal="true" aria-label="Discovery catalogue" onClick={onClose}>
      <div className="surf-pause glass discovery-catalogue" data-testid="discovery-catalogue" onClick={(e) => e.stopPropagation()}>
        <header className="dc-head">
          <span className="eyebrow">DISCOVERY CATALOGUE</span>
          <h2>{siteName}</h2>
          <p className="muted small">
            {mission?.name}{mission?.landing?.value ? ` · landed ${mission.landing.value.slice(0, 10)}` : ''}
            {site ? ` · ${Math.abs(site.latDeg).toFixed(3)}°${site.latDeg >= 0 ? 'N' : 'S'}, ${site.lonEastDeg.toFixed(3)}°E (catalogue landing site)` : ''}
          </p>
          <p className="dc-summary" data-testid="dc-summary">
            {count(1)} of {keys.length} discovered · {count(3)} inspected · {count(4)} completed
          </p>
        </header>
        <div className="dc-body">
          {vehicles.map(({ hw, obj, pos }) => {
            const vlev = lv(obj.id)
            return (
              <section key={obj.id} className="dc-vehicle" data-testid={`dc-vehicle-${obj.id}`}>
                <div className="dc-row dc-vrow">
                  <span className="cr-chip">{obj.category === 'rover' ? CATEGORY_LABEL['historical-rover'] : CATEGORY_LABEL['stationary-lander']}</span>
                  <b>{obj.name}</b>
                  <Status level={vlev} />
                  {pos && <span className="muted small">{dist(pos.x, pos.z)}</span>}
                  <button className="btn small" disabled={vlev < 2} onClick={() => onOpenRecord(hw)} title={vlev < 2 ? 'Approach it first' : 'Open its record and inspect it'}>
                    {vlev < 2 ? 'Approach to inspect' : 'Inspect'}
                  </button>
                </div>
                <ul className="dc-parts">
                  {obj.components.map((c) => {
                    const sep = !!c.part && !!pos?.parts.includes(c.part) && c.placement !== 'not-modelled'
                    return (
                      <li key={c.id} className="dc-row" data-testid={`dc-part-${c.id}`}>
                        <span className="dc-part-name">{c.name}{c.fullName && c.fullName !== c.name ? <span className="muted small"> — {c.fullName}</span> : null}</span>
                        <span className="muted small">{c.category ? CATEGORY_LABEL[c.category] : ''}{c.placement === 'inside' ? ' · inside the body' : sep ? ' · 3-D part' : ' · whole-vehicle view'}</span>
                        <Status level={lv(partKey(obj.id, c.id))} />
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {cfg.landmarks.length > 0 && (
            <section className="dc-vehicle">
              <h3 className="dc-sub">Landmarks and other hardware at this site</h3>
              <ul className="dc-parts">
                {cfg.landmarks.map((l) => {
                  const level = lv(landmarkKey(l.id))
                  return (
                    <li key={l.id} className="dc-landmark" data-testid={`dc-landmark-${l.id}`}>
                      <div className="dc-row">
                        <span className="cr-chip">{CATEGORY_LABEL[l.category]}</span>
                        <b>{l.name}</b>
                        <Status level={level} />
                        <span className="muted small">{dist(l.x, l.z)}{l.noModel ? ' · no 3-D model (ground image)' : ''}</span>
                        <button className="btn small" disabled={level < 1} onClick={() => setOpenLandmark(openLandmark === l.id ? null : l.id)}>
                          {level < 1 ? 'Not discovered' : openLandmark === l.id ? 'Close' : 'Read'}
                        </button>
                      </div>
                      {openLandmark === l.id && <LandmarkRecord siteId={siteId} l={l} />}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          <p className="muted small">
            Discovered: in view range. Approached: within inspection range. Inspected: its record opened (a part: selected, so the camera frames it).
            Completed: every section of a vehicle record viewed, or a part or landmark record read for 5 s. Progress is kept for this browser session.
          </p>
        </div>
        <button className="btn" onClick={onClose}>Close <kbd>J</kbd></button>
      </div>
    </div>
  )
}
