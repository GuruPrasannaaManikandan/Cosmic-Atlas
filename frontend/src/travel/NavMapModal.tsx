import { useEffect, useMemo, useState } from 'react'
import { OBJECTS, BY_ID, positionOf, radiusLyOf, CosmicObject } from '../data/catalog'
import { useStore } from '../store/store'
import { ship, engageAutopilot, cancelAutopilot } from './shipState'
import { sub, len, toThree, formatDistance, LY_PER_AU } from '../astro/coords'
import { KM_PER_AU } from '../astro/kepler'
import * as THREE from 'three'

export const KM_TO_LY = 1.057000834e-13

export type NavCategoryFilter = 'all' | 'planet' | 'moon' | 'dwarf-planet' | 'asteroid'
export type ParentFilter = 'all' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'

interface DestinationItem {
  id: string
  name: string
  category: string
  parentKey?: string
  parentLabel?: string
  color: string
  typeLabel: string
  distLy: number
  distAu: number
  distKm: number
  bearingDeg: number
  distText: string
  radiusKm: number
  triaxialKm?: string
  semiMajorAxis?: string
  orbitalPeriod?: string
  eccentricity?: string
  obj: CosmicObject
}

// Authoritative Solar System body list derived dynamically from the catalog
const SOLAR_SYSTEM_OBJECTS = OBJECTS.filter(
  (o) =>
    o.id === 'sun' ||
    o.category === 'planet' ||
    o.category === 'moon' ||
    o.category === 'dwarf-planet' ||
    o.category === 'asteroid'
)

export function NavMapModal({ onClose }: { onClose: () => void }) {
  const [minimized, setMinimized] = useState(false)
  const ms = useStore((s) => s.simMs)
  const [selected, setSelected] = useState<string>(ship.targetId ?? 'earth')
  const [catFilter, setCatFilter] = useState<NavCategoryFilter>('all')
  const [parentFilter, setParentFilter] = useState<ParentFilter>('all')
  const [query, setQuery] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // 'M' toggles the map closed, but never while typing in its search box (e.g. "mars", "moon", "mimas")
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (!typing && !e.repeat && e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  // Periodic tick for real-time telemetry updates (4 Hz)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250)
    return () => clearInterval(t)
  }, [])

  const fwd = useMemo(() => new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat), [ship.quat])

  // Compute live telemetry for all solar system bodies
  const allDestinations: DestinationItem[] = useMemo(() => {
    return SOLAR_SYSTEM_OBJECTS.map((o) => {
      const P = positionOf(o, ms)
      const rel = sub(P, ship.pos)
      const distLy = len(rel)
      const distAu = distLy / LY_PER_AU
      const distKm = distLy / KM_TO_LY
      const toB = new THREE.Vector3(...toThree(rel)).normalize()
      const dot = Math.max(-1, Math.min(1, fwd.dot(toB)))
      const bearingDeg = Math.round(Math.acos(dot) * (180 / Math.PI))

      const parentKey = o.parents && o.parents.length ? o.parents[0] : undefined
      const parentObj = parentKey ? BY_ID[parentKey] : undefined
      const parentLabel = parentObj ? parentObj.name : undefined

      let typeLabel = 'Celestial Body'
      if (o.id === 'sun') typeLabel = 'G2V Star · Solar Primary'
      else if (o.category === 'planet') typeLabel = 'Major Planet'
      else if (o.category === 'moon') typeLabel = parentLabel ? `${parentLabel} Moon` : 'Natural Satellite'
      else if (o.category === 'dwarf-planet') typeLabel = 'Dwarf Planet'
      else if (o.category === 'asteroid') typeLabel = 'Asteroid'

      const radiusKm = o.displayRadiusAU ? o.displayRadiusAU * KM_PER_AU : radiusLyOf(o) / KM_TO_LY

      return {
        id: o.id,
        name: o.name,
        category: o.category,
        parentKey,
        parentLabel,
        color: o.color,
        typeLabel,
        distLy,
        distAu,
        distKm,
        bearingDeg,
        distText: distAu < 0.01 ? `${Math.round(distKm).toLocaleString()} km` : formatDistance(distLy),
        radiusKm,
        triaxialKm: o.props?.['Triaxial shape'],
        semiMajorAxis: o.props?.['Semi-major axis'],
        orbitalPeriod: o.props?.['Orbital period'],
        eccentricity: o.props?.['Eccentricity'],
        obj: o,
      }
    })
  }, [ms, fwd])

  // Apply Category, Parent and Search Filters
  const filteredDestinations = useMemo(() => {
    let list = allDestinations

    // Category filter
    if (catFilter === 'planet') {
      list = list.filter((d) => d.id === 'sun' || d.category === 'planet')
    } else if (catFilter === 'moon') {
      list = list.filter((d) => d.category === 'moon')
      if (parentFilter !== 'all') {
        list = list.filter((d) => d.parentKey === parentFilter)
      }
    } else if (catFilter === 'dwarf-planet') {
      list = list.filter((d) => d.category === 'dwarf-planet')
    } else if (catFilter === 'asteroid') {
      list = list.filter((d) => d.category === 'asteroid')
    }

    // Search query filter
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q) ||
          (d.parentLabel && d.parentLabel.toLowerCase().includes(q)) ||
          d.typeLabel.toLowerCase().includes(q) ||
          (d.obj.aliases && d.obj.aliases.some((a) => a.toLowerCase().includes(q)))
      )
    }

    // Sort: if searching, sort by closest name match; else by distance from ship
    if (q) {
      return list.sort((a, b) => {
        const aExact = a.name.toLowerCase() === q ? 1 : 0
        const bExact = b.name.toLowerCase() === q ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        return a.distLy - b.distLy
      })
    }
    return list.sort((a, b) => a.distLy - b.distLy)
  }, [allDestinations, catFilter, parentFilter, query])

  const selObj = allDestinations.find((b) => b.id === selected) ?? filteredDestinations[0]

  const handleStartAutopilot = (warp: boolean = false) => {
    if (!selObj) return
    engageAutopilot(selObj.id, ms, warp)
    onClose()
  }

  const categoryCounts = useMemo(() => {
    return {
      all: allDestinations.length,
      planet: allDestinations.filter((d) => d.id === 'sun' || d.category === 'planet').length,
      moon: allDestinations.filter((d) => d.category === 'moon').length,
      'dwarf-planet': allDestinations.filter((d) => d.category === 'dwarf-planet').length,
      asteroid: allDestinations.filter((d) => d.category === 'asteroid').length,
    }
  }, [allDestinations])

  if (minimized) {
    const tgt = ship.autopilot.destinationName ?? (ship.targetId && BY_ID[ship.targetId] ? BY_ID[ship.targetId].name : null)
    return (
      <div className="navmap-mini" role="region" aria-label="Navigation map (minimized)">
        <span className="navmap-mini-label">Nav</span>
        <span className="navmap-mini-target">{tgt ? `→ ${tgt}` : 'no destination'}</span>
        <button className="navmap-mini-btn" onClick={() => setMinimized(false)} aria-label="Expand navigation map" title="Expand">▢</button>
        <button className="navmap-mini-btn" onClick={onClose} aria-label="Close Navigation Map" title="Close (M)">✕</button>
      </div>
    )
  }

  return (
    // Docked, non-modal overlay: the scene stays visible and flyable; nothing is dimmed or blocked behind it.
    <div className="navmap-overlay" role="dialog" aria-modal="false" aria-label="Solar System Navigation Map">
      <div className="card glass navmap-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div>
            <div className="eyebrow violet">NAVIGATION</div>
            <h2>Solar System map</h2>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" onClick={() => setMinimized(true)} aria-label="Minimize navigation map" title="Minimize">
              ▁
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close Navigation Map" title="Close (M)">
              ✕
            </button>
          </div>
        </div>

        <p className="hint">
          Comprehensive destination astrogation across all {SOLAR_SYSTEM_OBJECTS.length} Solar System bodies.
          Select any moon, dwarf planet, asteroid, or planet to compute transfer trajectory or engage flight autopilot.
        </p>

        {/* Category Filter Tabs */}
        <div className="cat-tabs">
          <button
            className={'cat-tab' + (catFilter === 'all' ? ' active' : '')}
            onClick={() => setCatFilter('all')}
          >
            All Destinations ({categoryCounts.all})
          </button>
          <button
            className={'cat-tab' + (catFilter === 'planet' ? ' active' : '')}
            onClick={() => setCatFilter('planet')}
          >
            Planets & Sun ({categoryCounts.planet})
          </button>
          <button
            className={'cat-tab' + (catFilter === 'moon' ? ' active' : '')}
            onClick={() => setCatFilter('moon')}
          >
            Moons ({categoryCounts.moon})
          </button>
          <button
            className={'cat-tab' + (catFilter === 'dwarf-planet' ? ' active' : '')}
            onClick={() => setCatFilter('dwarf-planet')}
          >
            Dwarf Planets ({categoryCounts['dwarf-planet']})
          </button>
          <button
            className={'cat-tab' + (catFilter === 'asteroid' ? ' active' : '')}
            onClick={() => setCatFilter('asteroid')}
          >
            Asteroids ({categoryCounts.asteroid})
          </button>
        </div>

        {/* Secondary Parent Filter for Moons */}
        {catFilter === 'moon' && (
          <div className="navmap-parent-tabs">
            {(
              [
                ['all', 'All Moons'],
                ['earth', 'Earth'],
                ['mars', 'Mars'],
                ['jupiter', 'Jupiter'],
                ['saturn', 'Saturn'],
                ['uranus', 'Uranus'],
                ['neptune', 'Neptune'],
                ['pluto', 'Pluto'],
              ] as [ParentFilter, string][]
            ).map(([pKey, pLabel]) => (
              <button
                key={pKey}
                className={'navmap-parent-tab' + (parentFilter === pKey ? ' active' : '')}
                onClick={() => setParentFilter(pKey)}
              >
                {pLabel}
              </button>
            ))}
          </div>
        )}

        {/* Search Input Filter */}
        <div className="search">
          <span className="search-ic">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search celestial destination (e.g. Phobos, Europa, Ceres, Titan, Deimos, Triton)..."
            aria-label="Search destination"
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        <div className="navmap-layout">
          {/* List of Planetary Destinations */}
          <div className="navmap-list">
            {filteredDestinations.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mut)', fontSize: '13px' }}>
                No celestial destinations matching &ldquo;{query}&rdquo;
              </div>
            ) : (
              filteredDestinations.map((b) => (
                <button
                  key={b.id}
                  className={
                    'navmap-row' +
                    (selected === b.id ? ' sel' : '') +
                    (ship.targetId === b.id ? ' targeted' : '')
                  }
                  onClick={() => setSelected(b.id)}
                >
                  <div className="nm-icon" style={{ color: b.color }}>
                    ●
                  </div>
                  <div className="nm-info">
                    <div className="nm-name">
                      <b>{b.name}</b>
                      {ship.targetId === b.id && <span className="pill flying">LOCKED</span>}
                    </div>
                    <div className="nm-sub">
                      {b.typeLabel} · {b.distAu.toFixed(3)} AU
                    </div>
                  </div>
                  <div className="nm-dist">
                    <b>{b.distText}</b>
                    <small>Bearing: {b.bearingDeg}°</small>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Destination Details & Actions Panel */}
          {selObj && (
            <div className="navmap-target-pane">
              <div>
                <div className="eyebrow">DESTINATION TELEMETRY</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ color: selObj.color, fontSize: '18px' }}>●</span>
                  <h3 style={{ margin: 0, color: selObj.color }}>{selObj.name}</h3>
                  <span className="pill" style={{ marginLeft: 'auto', fontSize: '10px' }}>
                    {selObj.typeLabel}
                  </span>
                </div>

                <div className="metrics" style={{ margin: '12px 0 8px' }}>
                  <div className="metric">
                    <label>Current Separation</label>
                    <b>{selObj.distText}</b>
                    <small>
                      {selObj.distAu.toFixed(4)} AU ({Math.round(selObj.distKm).toLocaleString()} km)
                    </small>
                  </div>
                  <div className="metric">
                    <label>Relative Bearing</label>
                    <b>{selObj.bearingDeg}°</b>
                    <small>
                      {selObj.bearingDeg < 15
                        ? 'Forward alignment: ready'
                        : selObj.bearingDeg < 60
                        ? 'Moderate correction needed'
                        : 'Significant reorientation maneuver needed'}
                    </small>
                  </div>
                  <div className="metric">
                    <label>Physical Radius</label>
                    <b>
                      {Math.round(selObj.radiusKm).toLocaleString()} km
                    </b>
                    <small>
                      {selObj.triaxialKm ? `Triaxial shape: ${selObj.triaxialKm}` : 'Volumetric mean radius'}
                    </small>
                  </div>
                  {selObj.orbitalPeriod && (
                    <div className="metric">
                      <label>Orbital Period</label>
                      <b>{selObj.orbitalPeriod}</b>
                      <small>Semi-major axis: {selObj.semiMajorAxis ?? 'N/A'}</small>
                    </div>
                  )}
                </div>

                {selObj.obj.info && (
                  <p
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--mut)',
                      lineHeight: '1.4',
                      margin: '8px 0',
                      maxHeight: '65px',
                      overflowY: 'auto',
                    }}
                  >
                    {selObj.obj.info}
                  </p>
                )}
              </div>

              <div className="actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                <button
                  className="btn primary"
                  style={{ width: '100%', height: '36px' }}
                  onClick={() => handleStartAutopilot(false)}
                >
                  ✦ Engage Sub-light Autopilot
                </button>
                <button
                  className="btn find"
                  style={{ width: '100%', height: '36px' }}
                  onClick={() => handleStartAutopilot(true)}
                >
                  ⚡ Engage Warp Cruise Transfer
                </button>
                <button
                  className="btn"
                  style={{ width: '100%' }}
                  onClick={() => {
                    ship.targetId = selObj.id
                    onClose()
                  }}
                >
                  ◎ Lock Target Crosshair Only
                </button>
                {ship.autopilot.active && (
                  <button
                    className="btn ghost"
                    style={{ width: '100%', color: 'var(--err)' }}
                    onClick={() => {
                      cancelAutopilot()
                      onClose()
                    }}
                  >
                    ✕ Disengage Active Autopilot
                  </button>
                )}
              </div>

              <p className="note" style={{ marginTop: '12px', fontSize: '10.5px' }}>
                Positions computed dynamically via Keplerian orbital dynamics from NASA/JPL planetary data.
                Autopilot aligns heading and throttles velocity inversely with remaining distance to guarantee safe orbital capture.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
