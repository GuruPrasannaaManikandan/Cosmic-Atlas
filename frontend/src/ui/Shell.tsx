import { useEffect, useState, useMemo } from 'react'
import { expedition } from '../expedition/expedition'
import { useStore } from '../store/store'
import { OBJECTS, BY_ID, positionOf } from '../data/catalog'
import { TOUR, STAGES } from '../data/tour'
import { nav, referenceFrameLabel, exampleScaleLabel, distanceTo } from '../store/nav'
import { formatDistance, unitToGalacticLB, sub, len, SUN_POS, LY_PER_AU } from '../astro/coords'
import { VALID_FROM, VALID_TO, isModelRange, planetRootPos } from '../astro/ephemeris'
import { api, HorizonsResult } from './api'
import { labelState } from '../scene/labelState'
import { startEvent } from '../events/eventState'
import { timelineEvents, missionsForBody } from '../missions'

export const CAT_ICON: Record<string, string> = {
  supercluster: '◌',
  cluster: '✺',
  group: '◍',
  sheet: '▱',
  galaxy: '◎',
  'galactic-structure': '〰',
  nebula: '☁',
  star: '✦',
  'star-cluster': '✧',
  planet: '●',
  moon: '○',
  'dwarf-planet': '◐',
  asteroid: '⬡',
}

const GROUPS: { title: string; categoryKey: string; ids: string[] }[] = [
  { title: 'Cosmic structures', categoryKey: 'cosmic', ids: ['laniakea', 'coma', 'virgo', 'local-sheet', 'local-group'] },
  { title: 'Galaxies', categoryKey: 'galaxies', ids: ['milky-way', 'andromeda', 'm33'] },
  { title: 'Milky Way landmarks', categoryKey: 'landmarks', ids: ['orion-arm', 'carina', 'alnitak', 'alnilam', 'mintaka', 'betelgeuse', 'pleiades', 'aldebaran'] },
  { title: 'Solar System Planets', categoryKey: 'solar', ids: ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] },
  { title: 'Dwarf Planets & Asteroids', categoryKey: 'solar', ids: ['ceres', 'vesta', 'pallas', 'hygiea', 'pluto', 'haumea', 'makemake', 'eris'] },
  { title: 'Moons of Earth & Mars', categoryKey: 'solar', ids: ['moon', 'phobos', 'deimos'] },
  { title: 'Moons of Jupiter', categoryKey: 'solar', ids: ['io', 'europa', 'ganymede', 'callisto', 'amalthea', 'thebe', 'metis', 'adrastea', 'himalia', 'elara'] },
  { title: 'Moons of Saturn', categoryKey: 'solar', ids: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'hyperion', 'iapetus', 'phoebe', 'janus', 'epimetheus', 'pan', 'atlas', 'prometheus', 'pandora', 'helene'] },
  { title: 'Moons of Uranus', categoryKey: 'solar', ids: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'puck'] },
  { title: 'Moons of Neptune', categoryKey: 'solar', ids: ['triton', 'proteus', 'nereid', 'larissa', 'galatea', 'despina'] },
  { title: 'Moons of Pluto', categoryKey: 'solar', ids: ['charon', 'nix', 'hydra', 'kerberos', 'styx'] },
]

/** Hook re-rendering a component at a fixed interval (for values read from the mutable nav state). */
function useTick(ms: number) {
  const [, f] = useState(0)
  useEffect(() => {
    const t = setInterval(() => f((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

export function Browser() {
  const { select, travel, selectedId, objectsVersion, set } = useStore()
  const [filterTab, setFilterTab] = useState<string>('all')
  const [searchFilter, setSearchFilter] = useState<string>('')

  const live = OBJECTS.filter((o) => o.provenance === 'live-catalogue')
  const allGroups = live.length
    ? [...GROUPS, { title: 'Live catalogue results', categoryKey: 'live', ids: live.map((o) => o.id) }]
    : GROUPS

  const displayedGroups = useMemo(() => {
    let grps = allGroups
    if (filterTab !== 'all') {
      grps = grps.filter((g) => g.categoryKey === filterTab)
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase()
      grps = grps
        .map((g) => ({
          ...g,
          ids: g.ids.filter((id) => {
            const o = BY_ID[id]
            return o && (o.name.toLowerCase().includes(q) || o.aliases.some((a) => a.toLowerCase().includes(q)))
          }),
        }))
        .filter((g) => g.ids.length > 0)
    }
    return grps
  }, [allGroups, filterTab, searchFilter])

  return (
    <aside className="panel left glass" key={objectsVersion} aria-label="Object browser">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Catalogue</div>
          <h3>Cosmic Objects</h3>
        </div>
        <button
          className="icon-btn"
          onClick={() => set({ leftOpen: false })}
          title="Hide object list"
          aria-label="Hide object list"
        >
          ✕
        </button>
      </div>

      <div className="cat-tabs" role="tablist" aria-label="Object categories">
        <button className={'cat-tab' + (filterTab === 'all' ? ' active' : '')} onClick={() => setFilterTab('all')}>All</button>
        <button className={'cat-tab' + (filterTab === 'cosmic' ? ' active' : '')} onClick={() => setFilterTab('cosmic')}>Cosmic</button>
        <button className={'cat-tab' + (filterTab === 'galaxies' ? ' active' : '')} onClick={() => setFilterTab('galaxies')}>Galaxies</button>
        <button className={'cat-tab' + (filterTab === 'landmarks' ? ' active' : '')} onClick={() => setFilterTab('landmarks')}>Landmarks</button>
        <button className={'cat-tab' + (filterTab === 'solar' ? ' active' : '')} onClick={() => setFilterTab('solar')}>Solar</button>
        {live.length > 0 && (
          <button className={'cat-tab' + (filterTab === 'live' ? ' active' : '')} onClick={() => setFilterTab('live')}>Live ({live.length})</button>
        )}
      </div>

      <input
        type="search"
        placeholder="Filter list…"
        value={searchFilter}
        onChange={(e) => setSearchFilter(e.target.value)}
        style={{
          width: '100%',
          height: '28px',
          padding: '0 8px',
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          marginBottom: '8px',
          fontSize: '12px',
        }}
      />

      <p className="hint">
        Click to inspect · double-click to fly there. <span className="tilde">~</span> schematic placement.
      </p>

      <div className="tree">
        {displayedGroups.map((g) => (
          <section key={g.title}>
            <h4>
              <span>{g.title}</span>
              <span style={{ fontSize: '10px', color: 'var(--dim)' }}>{g.ids.length}</span>
            </h4>
            {g.ids
              .filter((id) => BY_ID[id])
              .map((id) => {
                const o = BY_ID[id]
                return (
                  <button
                    key={id}
                    className={'node' + (selectedId === id ? ' sel' : '')}
                    onClick={() => select(id)}
                    onDoubleClick={() => travel(id)}
                    title={`${o.name} — double-click to travel`}
                  >
                    <span className="ic">{CAT_ICON[o.category] ?? '•'}</span>
                    <span className="nm">{o.name}</span>
                    {o.schematic && (
                      <span className="tilde" title="schematic placement">
                        ~
                      </span>
                    )}
                  </button>
                )
              })}
          </section>
        ))}
      </div>
    </aside>
  )
}

export function Info() {
  const id = useStore((s) => s.selectedId)
  const ms = useStore((s) => s.simMs)
  const { travel, select, breadcrumbs: bc, set } = useStore()
  const [hz, setHz] = useState<{ busy?: boolean; text?: string; err?: string }>({})
  const [collapsed, setCollapsed] = useState(false)
  const [, force] = useState(0)

  useTick(500)
  useEffect(() => setHz({}), [id])

  if (!id || !BY_ID[id]) return null
  const o = BY_ID[id]
  const p = positionOf(o, ms)
  const fromSun = sub(p, SUN_POS)
  const dSun = len(fromSun)
  const lb = dSun > 0 ? unitToGalacticLB([fromSun[0] / dSun, fromSun[1] / dSun, fromSun[2] / dSun]) : null
  const prev = bc.length > 1 ? bc[bc.length - 2] : null

  const checkHorizons = async () => {
    setHz({ busy: true })
    const iso = new Date(ms).toISOString().slice(0, 10)
    const r = await api.horizons(o.id, iso)
    if (!r.ok || !r.data) {
      setHz({ err: r.error })
      return
    }
    const h: HorizonsResult = r.data
    if (!h.vector_au) {
      setHz({ err: 'Horizons returned no vector.' })
      return
    }
    const rMine = len(sub(planetRootPos(o.id, Date.parse(iso + 'T00:00:00Z')), SUN_POS)) / LY_PER_AU
    const rJpl = Math.hypot(...h.vector_au)
    const deltaKm = Math.abs(rJpl - rMine) * 149.5978707
    setHz({
      text: `JPL Horizons: ${rJpl.toFixed(4)} AU · Atlas model: ${rMine.toFixed(4)} AU (Δ ${deltaKm.toFixed(2)} million km)`,
    })
  }

  const isSolar = o.category === 'planet' || o.category === 'moon' || o.category === 'dwarf-planet' || o.category === 'asteroid' || o.id === 'sun'

  return (
    <aside className="panel right glass" aria-label="Object inspector">
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            {CAT_ICON[o.category] ?? '•'} {o.category.replace('-', ' ')}
          </div>
          <h3>{o.name}</h3>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="icon-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand inspector' : 'Minimize inspector'}
            aria-label={collapsed ? 'Expand inspector' : 'Minimize inspector'}
          >
            {collapsed ? '▾' : '▴'}
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              select(null)
              set({ rightOpen: false })
            }}
            title="Close inspector"
            aria-label="Close inspector"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="badges">
        <span className={'badge prov ' + o.provenance}>{o.provenance.replace('-', ' ')}</span>
        <span className={'badge conf ' + o.confidence}>{o.confidence} confidence</span>
        {o.schematic && <span className="badge warn">schematic placement</span>}
      </div>

      <div className="actions">
        <button className="btn primary" onClick={() => travel(o.id)}>
          ➜ Fly here
        </button>
        {(o.id === 'moon' || o.id === 'mars') && (
          <button className="btn exp-start-btn" data-testid={`info-expedition-${o.id}`} onClick={() => expedition.start(o.id as 'moon' | 'mars')} title="Depart from Earth, fly there and land at a historic site">
            🚀 Begin expedition to {o.id === 'moon' ? 'the Moon' : 'Mars'}
          </button>
        )}
        {o.id === 'betelgeuse' && (
          <button
            className="btn action-supernova-btn"
            onClick={() => startEvent('supernova-betelgeuse')}
            title="Launch hypothetical Type II-P Supernova simulation"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 69, 0, 0.4), rgba(255, 140, 0, 0.2))',
              border: '1px solid rgba(255, 100, 50, 0.6)',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            💥 Simulate Supernova
          </button>
        )}
        {o.id === 'carina' && (
          <button
            className="btn"
            onClick={() => startEvent('nebula-carina')}
            title="Launch Carina Star-Forming Pillars simulation"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 229, 192, 0.4), rgba(255, 42, 75, 0.2))',
              border: '1px solid rgba(0, 229, 192, 0.6)',
              color: '#fff',
            }}
          >
            ✨ Explore Gas Pillars
          </button>
        )}
        <button
          className={'btn' + (nav.orbit ? ' on' : '')}
          onClick={() => {
            nav.orbit = !nav.orbit
            force((x) => x + 1)
          }}
          title="When on, dragging orbits around the object you are following"
        >
          ⟳ Orbit {nav.orbit ? 'on' : 'off'}
        </button>
        {prev && prev !== o.id && (
          <button className="btn" onClick={() => travel(prev)} title="Return to previous viewpoint">
            ↩ {BY_ID[prev]?.name.replace(/ \(.*/, '')}
          </button>
        )}
        {o.parents[0] && (
          <button className="btn" onClick={() => travel(o.parents[0])}>
            ↑ {BY_ID[o.parents[0]]?.name}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="scroll">
          <p className="desc">{o.info}</p>

          <h4>Astrophysical Measurements</h4>
          <div className="metrics">
            <div className="metric">
              <label>Distance from Sun</label>
              <b>
                {o.distance
                  ? formatDistance(o.distance.valueLy)
                  : o.id === 'sun'
                  ? '0 AU (Reference)'
                  : formatDistance(dSun)}
              </b>
              <small>
                {o.distance
                  ? (o.distance.uncertaintyLy ? `± ${formatDistance(o.distance.uncertaintyLy)} · ` : '') +
                    o.distance.basis
                  : o.id === 'sun'
                  ? 'Coordinate origin for heliocentric frame'
                  : 'Derived from model coordinates'}
              </small>
            </div>
            <div className="metric">
              <label>From Camera Viewpoint</label>
              <b>{formatDistance(distanceTo(o.id, ms))}</b>
              <small>Live distance to camera</small>
            </div>
            {o.extentLy && (
              <div className="metric">
                <label>Physical Extent</label>
                <b>~{formatDistance(o.extentLy)}</b>
                <small>Approximate diameter</small>
              </div>
            )}
          </div>

          {(o.position.kind === 'equatorial' || (lb && dSun > 0)) && (
            <>
              <h4>Celestial Coordinates</h4>
              <dl className="kv">
                {o.position.kind === 'equatorial' && (
                  <div>
                    <dt>Equatorial RA / Dec (J2000)</dt>
                    <dd>
                      {o.position.raDeg.toFixed(4)}° / {o.position.decDeg.toFixed(4)}°
                    </dd>
                  </div>
                )}
                {lb && dSun > 0 && (
                  <div>
                    <dt>Galactic Coordinates (l, b)</dt>
                    <dd>
                      {lb.l.toFixed(2)}° / {lb.b.toFixed(2)}°
                    </dd>
                  </div>
                )}
              </dl>
            </>
          )}

          {o.props && Object.keys(o.props).length > 0 && (
            <>
              <h4>Properties</h4>
              <dl className="kv">
                {Object.entries(o.props).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {(o.parents.length > 0 || o.memberOf.length > 0 || o.nearby.length > 0) && (
            <>
              <h4>Astrophysical Relationships</h4>
              <dl className="kv">
                {o.parents.length > 0 && (
                  <div>
                    <dt>Orbits</dt>
                    <dd>
                      {o.parents.map((x) => (
                        <button className="link" key={x} onClick={() => select(x)}>
                          {BY_ID[x]?.name}
                        </button>
                      ))}
                    </dd>
                  </div>
                )}
                {o.memberOf.length > 0 && (
                  <div>
                    <dt>Member of</dt>
                    <dd>
                      {o.memberOf.map((x) => (
                        <button className="link" key={x} onClick={() => select(x)}>
                          {BY_ID[x]?.name}
                        </button>
                      ))}
                    </dd>
                  </div>
                )}
                {o.nearby.length > 0 && (
                  <div>
                    <dt>Nearby (Proximity)</dt>
                    <dd>
                      {o.nearby.map((x) => (
                        <button className="link" key={x} onClick={() => select(x)}>
                          {BY_ID[x]?.name}
                        </button>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          )}

          {o.category === 'planet' && (
            <>
              <h4>Live Ephemeris Verification</h4>
              <button className="btn" onClick={checkHorizons} disabled={hz.busy}>
                {hz.busy ? 'Querying JPL Horizons…' : '⇄ Compare with JPL Horizons (live)'}
              </button>
              {hz.text && <p className="ok small" style={{ marginTop: '8px' }}>{hz.text}</p>}
              {hz.err && <p className="err small" style={{ marginTop: '8px' }}>{hz.err}</p>}
            </>
          )}

          <h4>Scientific Provenance</h4>
          <p className="meta">
            Catalogue: <b>{o.source.catalogue}</b>
            {o.source.identifier ? ` — ${o.source.identifier}` : ''}
          </p>
          {o.source.note && <p className="meta">{o.source.note}</p>}
          {o.aliases.length > 0 && (
            <p className="meta">
              Designations: {o.aliases.join(', ')}
            </p>
          )}
          {o.links && o.links.length > 0 && (
            <div className="links">
              {o.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}

          {isSolar && (
            <p className="note">
              {o.position.kind === 'solar-body'
                ? 'Deterministic Keplerian analytical orbital mechanics with secular precession (NASA/JPL SSD & IAU 2015). Surface features and irregular geometries rendered to true physical dimensions.'
                : '⚠ Planetary body radii are exaggerated for visual clarity. Orbital positions use an approximate Keplerian analytical model (JPL elements).'}
            </p>
          )}
        </div>
      )}
    </aside>
  )
}

export function TimeBar() {
  const { simMs, playing, daysPerSec, setPlaying, setRate, setSim } = useStore()
  const rates = [-365, -30, -1, -1 / 24, 1 / 24, 1, 30, 365]
  const iso = new Date(simMs).toISOString().slice(0, 16)
  const inRange = isModelRange(simMs)
  const mag = Math.abs(daysPerSec)

  return (
    <div className="timebar glass" role="group" aria-label="Solar System time controls">
      <span className="eyebrow warm">☀ Time Engine</span>
      <input
        type="datetime-local"
        value={iso}
        min="1800-01-01T00:00"
        max="2050-12-31T23:59"
        aria-label="Simulation date (UTC)"
        onChange={(e) => {
          const t = Date.parse(e.target.value + ':00Z')
          if (Number.isFinite(t)) setSim(Math.min(Math.max(t, VALID_FROM), VALID_TO))
        }}
      />
      <div className="seg">
        <button
          className={daysPerSec < 0 ? 'on' : ''}
          onClick={() => setRate(-mag)}
          title="Run time backwards"
          aria-label="Reverse"
        >
          ◀◀
        </button>
        <button
          className="play"
          onClick={() => setPlaying(!playing)}
          title={playing ? 'Pause' : 'Play'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          className={daysPerSec > 0 ? 'on' : ''}
          onClick={() => setRate(mag)}
          title="Run time forwards"
          aria-label="Forward"
        >
          ▶▶
        </button>
      </div>
      <select value={daysPerSec} onChange={(e) => setRate(parseFloat(e.target.value))} aria-label="Simulation speed">
        {rates.map((r) => (
          <option key={r} value={r}>
            {Math.abs(r) === 1 / 24 ? `${r < 0 ? '−' : '+'}1 h/s` : `${r > 0 ? '+' : '−'}${Math.abs(r)} d/s`}
          </option>
        ))}
      </select>
      <button className="btn ghost" onClick={() => setSim(Date.now())}>
        Now
      </button>
      <MissionEventSelect />
      <span
        className={'pill ' + (inRange ? '' : 'bad')}
        title="Planet positions come from approximate JPL Keplerian elements (1800–2050), not a high-precision numerical integration."
      >
        {inRange ? 'Keplerian model (JPL)' : 'Outside model range'}
      </span>
    </div>
  )
}

/**
 * Historical mission milestones from the curated catalogue (src/missions). Picking one moves the simulation clock to
 * that moment, so the planets, the Moon phase and the surface lighting all show that historical date. Shows the
 * selected body's missions when it has any, otherwise every mission.
 */
export function MissionEventSelect() {
  const sel = useStore((s) => s.selectedId)
  const setSim = useStore((s) => s.setSim)
  const setPlaying = useStore((s) => s.setPlaying)
  const scoped = sel && missionsForBody(sel).length ? sel : null
  const events = useMemo(() => timelineEvents(scoped).filter((e) => e.ms >= VALID_FROM && e.ms <= VALID_TO), [scoped])
  return (
    <select
      className="mission-events"
      value=""
      aria-label={scoped ? `Mission events at ${BY_ID[scoped]?.name ?? scoped}` : 'Mission events'}
      title="Jump the simulation clock to a historical mission event (sourced dates; date-only events jump to 00:00 UTC)"
      onChange={(e) => {
        const ev = events[+e.target.value]
        if (!ev) return
        setPlaying(false)
        setSim(ev.ms)
      }}
    >
      <option value="">{scoped ? `🛰 ${BY_ID[scoped]?.name ?? scoped} missions…` : '🛰 Mission events…'}</option>
      {events.map((e, i) => (
        <option key={i} value={i}>
          {e.date.slice(0, 10)} · {e.missionName} — {e.title}
        </option>
      ))}
    </select>
  )
}

export function StatusBar() {
  useTick(300)
  const sel = useStore((s) => s.selectedId)
  const ms = useStore((s) => s.simMs)

  return (
    <div className="status glass" aria-live="polite">
      <span>
        <label>Frame</label>
        {referenceFrameLabel()}
      </span>
      <span>
        <label>Scale</label>
        {exampleScaleLabel()}
      </span>
      {sel && BY_ID[sel] && (
        <span>
          <label>Target</label>
          {BY_ID[sel].name.replace(/ \(.*/, '')} · {formatDistance(distanceTo(sel, ms))}
        </span>
      )}
    </div>
  )
}

export function Diagnostics() {
  const [s, setS] = useState({ fps: 0 })
  useTick(500)

  useEffect(() => {
    let last = performance.now(),
      frames = 0,
      raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      frames++
      if (t - last > 1000) {
        setS({ fps: Math.round((frames * 1000) / (t - last)) })
        frames = 0
        last = t
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="diag glass">
      <div className="eyebrow">Telemetry & Diagnostics</div>
      <div>
        <label>Display FPS</label>
        <b>{s.fps}</b>
      </div>
      <div>
        <label>Rendered objects</label>
        <b>{labelState.items.length}</b>
      </div>
      <div>
        <label>Nearest body</label>
        <b>{BY_ID[nav.nearestId]?.name.replace(/ \(.*/, '')}</b>
      </div>
      <div>
        <label>Distance to surface</label>
        <b>{formatDistance(nav.nearestSurface)}</b>
      </div>
      <div>
        <label>Distance from Sun</label>
        <b>{formatDistance(len(sub(nav.pos, SUN_POS)))}</b>
      </div>
      <div>
        <label>Render scale S</label>
        <b>{nav.scale.toExponential(2)} ly/u</b>
      </div>
      <div>
        <label>Flight velocity</label>
        <b>{formatDistance(nav.nearestSurface * 1.2 * nav.speedMult)}/s</b>
      </div>
    </div>
  )
}

export function TourCard() {
  const {
    tourIndex,
    tourStatus,
    visited,
    tourPause,
    tourResume,
    tourSkip,
    tourExit,
    startTour,
    travel,
    select,
  } = useStore()
  const [collapsed, setCollapsed] = useState(false)
  useTick(150)

  const step = TOUR[tourIndex]

  if (tourStatus === 'done') {
    return (
      <div className="tourcard glass done" aria-label="Tour completion">
        <div className="tc-head">
          <span className="eyebrow violet">✦ FIND HOME · COMPLETED</span>
          <span className="pill dwelling">Arrived</span>
        </div>
        <h3>Welcome Home — Earth</h3>
        <p className="stage-title">Stage 6 of 6 · Terrestrial Arrival</p>
        <p className="tc-text">
          You have traversed over 1 billion light-years: from the filaments of the Laniakea Supercluster, past local spiral galaxies, down through the Orion Arm and stellar nurseries, to the third rock from the Sun.
        </p>

        <h4 style={{ margin: '10px 0 4px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--mut)' }}>
          Visited Landmarks ({visited.length})
        </h4>
        <div className="route">
          {visited.map((v) => (
            <button
              key={v}
              className="link"
              onClick={() => {
                select(v)
                travel(v)
              }}
              style={{ marginRight: '6px', fontSize: '12px' }}
            >
              {BY_ID[v]?.name.replace(/ \(.*/, '')} →
            </button>
          ))}
        </div>

        <p className="small muted" style={{ marginTop: '8px' }}>
          Earth’s texture is procedural. The Moon is exaggerated in scale for clear visibility.
        </p>

        <div className="actions" style={{ marginTop: '14px' }}>
          <button
            className="btn"
            onClick={() => {
              nav.orbit = true
              travel('moon')
            }}
          >
            ○ Locate Moon
          </button>
          <button className="btn" onClick={() => travel('sun')}>
            ☀ Solar System
          </button>
          <button className="btn" onClick={() => startTour()}>
            ↻ Restart Tour
          </button>
          <button className="btn primary" onClick={tourExit}>
            Explore Freely
          </button>
        </div>
      </div>
    )
  }

  // real progress: completed steps + current flight fraction from navigation controller
  const flightT = nav.flight && nav.flight.targetId === step.target ? nav.flight.t : tourStatus === 'dwelling' ? 1 : 0
  const pct = ((tourIndex + flightT) / TOUR.length) * 100
  const label = {
    flying: 'Travelling',
    dwelling: 'Arrived',
    paused: 'Paused',
    interrupted: 'Manual Control',
    idle: '',
    done: '',
  }[tourStatus]

  return (
    <div className={'tourcard glass' + (collapsed ? ' collapsed' : '')} aria-label="FIND HOME Tour progress">
      <div className="tc-head">
        <span className="eyebrow violet">✦ FIND HOME · Stage {step.stage}/6</span>
        <span className={'pill ' + tourStatus}>{label}</span>
        <button
          className="icon-btn sm"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand tour card' : 'Collapse tour card'}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>

      <div className="stages-stepper" title={`Stage ${step.stage} of 6: ${STAGES[step.stage - 1]}`}>
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div
            key={s}
            className={'stage-step-dot' + (s === step.stage ? ' active' : s < step.stage ? ' passed' : '')}
          />
        ))}
      </div>

      <h3>{BY_ID[step.target]?.name}</h3>
      {!collapsed && <p className="stage-title">{STAGES[step.stage - 1]}</p>}
      {!collapsed && <p className="tc-text">{step.text}</p>}

      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className="tc-meta">
        Stop {tourIndex + 1} of {TOUR.length}
        {tourStatus === 'interrupted' && ' · Tour paused by user navigation'}
      </div>

      {!collapsed && (
        <div className="actions">
          {tourStatus === 'paused' || tourStatus === 'interrupted' ? (
            <button className="btn primary" onClick={tourResume}>
              ▶ Resume Tour
            </button>
          ) : (
            <button className="btn" onClick={tourPause}>
              ❚❚ Pause
            </button>
          )}
          <button className="btn" onClick={tourSkip} disabled={tourIndex >= TOUR.length - 1}>
            Skip ⏭
          </button>
          <button className="btn ghost" onClick={tourExit}>
            Explore freely
          </button>
        </div>
      )}
    </div>
  )
}
