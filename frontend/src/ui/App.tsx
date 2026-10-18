import { Component, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { CosmicCanvas } from '../scene/Scene'
import { Labels } from './Labels'
import { DataPanel } from './DataPanel'
import { useStore } from '../store/store'
import { CosmicObject, searchObjects, registerObject } from '../data/catalog'
import { nav, interrupt } from '../store/nav'
import { sub, len, SUN_POS } from '../astro/coords'
import { api, SimbadResult } from './api'
import { labelState } from '../scene/labelState'
import { Browser, Info, TimeBar, StatusBar, Diagnostics, TourCard, CAT_ICON } from './Shell'
import { TravelHUD } from '../travel/TravelHUD'
import { CockpitOverlay } from '../travel/CockpitOverlay'
import { NavMapModal } from '../travel/NavMapModal'
import { AudioPlayer } from './AudioPlayer'
import { CosmicEventsModal } from '../events/CosmicEventsModal'
import { EventPlayerHUD } from '../events/EventPlayerHUD'
import { startEvent, eventState, subscribeEventState } from '../events/eventState'
import { WelcomeModal } from '../tutorial/WelcomeModal'
import { TutorialOverlay } from '../tutorial/TutorialOverlay'
import { AcademyCompleteModal } from '../tutorial/AcademyCompleteModal'
import { checkFirstTimeUser, openWelcomeModal, startTutorial } from '../tutorial/tutorialState'
import { ScaleBreadcrumbs } from './ScaleBreadcrumbs'
import { TravelProgressHUD } from '../travel/TravelProgressHUD'

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  render() {
    if (this.state.err) {
      return (
        <div className="fallback glass">
          <h2>The 3D view could not start</h2>
          <p>{this.state.err.message}</p>
          <p>
            WebGL may be disabled or unsupported. Try another browser, enable hardware acceleration, or use Performance quality.
          </p>
          <button className="btn primary" onClick={() => this.setState({ err: null })}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function Search() {
  const [q, setQ] = useState('')
  const [live, setLive] = useState<{ state: 'idle' | 'busy' | 'err'; msg?: string }>({ state: 'idle' })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchObjects(q).slice(0, 8), [q])
  const travel = useStore((s) => s.travel)
  const bump = () => useStore.setState((s) => ({ objectsVersion: s.objectsVersion + 1 }))

  // Global keyboard shortcut '/' or 'Ctrl+K'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const liveSearch = async () => {
    setLive({ state: 'busy' })
    const r = await api.simbad(q)
    if (!r.ok || !r.data) {
      setLive({ state: 'err', msg: r.error })
      return
    }
    const d: SimbadResult = r.data
    if (d.distance_ly == null) {
      setLive({
        state: 'err',
        msg: `${d.main_id} found in SIMBAD (RA ${d.ra_deg.toFixed(3)}°, Dec ${d.dec_deg.toFixed(3)}°) but lacks a usable distance (parallax/redshift). Unlocated sky-only coordinates are not plotted in 3D to maintain physical accuracy.`,
      })
      return
    }
    const id = 'live-' + d.main_id.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const gal = d.z != null && d.z > 0.0005
    const added = registerObject({
      id,
      name: d.main_id,
      aliases: d.aliases.slice(0, 8),
      category: gal ? 'galaxy' : 'star',
      visual: gal ? 'galaxy' : 'star',
      position: { kind: 'equatorial', raDeg: d.ra_deg, decDeg: d.dec_deg, distanceLy: d.distance_ly },
      parents: [],
      memberOf: [],
      nearby: [],
      extentLy: gal ? Math.max(d.distance_ly * 0.0002, 5e4) : undefined,
      distance: { valueLy: d.distance_ly, basis: d.distance_basis ?? 'SIMBAD' },
      color: '#ffe14d',
      provenance: 'live-catalogue',
      confidence: 'medium',
      source: { catalogue: `SIMBAD TAP (live, retrieved ${d.retrieved})`, identifier: d.main_id },
      info: `Live astronomical record from CDS SIMBAD. Object classification: ${d.otype ?? 'unknown'}. Distance derived: ${d.distance_basis}.`,
      props: {
        'Object type (SIMBAD)': d.otype ?? 'n/a',
        Parallax: d.plx_mas != null ? `${d.plx_mas} mas` : 'n/a',
        Redshift: d.z != null ? String(d.z) : 'n/a',
      },
      importance: 0.85,
      viewDistanceLy: d.distance_ly > 1e5 ? d.distance_ly * 0.002 : Math.max(5, d.distance_ly * 0.02),
      links: [
        {
          label: 'CDS SIMBAD',
          url: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(d.main_id)}`,
        },
      ],
    } as CosmicObject)
    if (added) bump()
    setLive({ state: 'idle' })
    setOpen(false)
    travel(id)
  }

  return (
    <div className="search" role="search">
      <span className="search-ic" aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        placeholder="Search universe — M31, Betelgeuse, Pleiades… (Press /)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActiveIndex(0)
          setLive({ state: 'idle' })
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 220)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((prev) => (prev + 1) % Math.max(1, results.length))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results[activeIndex]) {
              travel(results[activeIndex].id)
              setOpen(false)
            } else if (q) {
              liveSearch()
            }
          }
        }}
        aria-label="Search astronomical objects"
      />
      {q && (
        <button
          className="search-clear"
          onClick={() => {
            setQ('')
            inputRef.current?.focus()
          }}
          title="Clear search"
        >
          ✕
        </button>
      )}
      {!q && <span className="search-kbd">/</span>}

      {open && q && (
        <div className="results glass">
          <div className="res-group-title">Bundled Catalogue</div>
          {results.map((o, idx) => (
            <button
              key={o.id}
              className={idx === activeIndex ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                travel(o.id)
                setOpen(false)
                setQ('')
              }}
            >
              <span>
                <i>{CAT_ICON[o.category] ?? '•'}</i> {o.name}
              </span>
              <em>{o.category.replace('-', ' ')}</em>
            </button>
          ))}
          {!results.length && (
            <div className="empty">No match in bundled catalogue — query the CDS SIMBAD database below.</div>
          )}
          <button
            className="live"
            onMouseDown={(e) => e.preventDefault()}
            onClick={liveSearch}
            disabled={live.state === 'busy'}
          >
            🌐 {live.state === 'busy' ? 'Querying CDS SIMBAD (Strasbourg)…' : `Query CDS SIMBAD live for “${q}”`}
          </button>
          {live.state === 'err' && <div className="err pad">{live.msg}</div>}
        </div>
      )}
    </div>
  )
}

function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Controls and help">
      <div className="card glass" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Observatory Operations</div>
        <h2>Controls & Navigation Reference</h2>

        <div className="help-grid">
          <div className="help-box">
            <h4>Mouse & Touch Controls</h4>
            <table className="help-table">
              <tbody>
                <tr><td>Left Drag</td><td>Rotate camera (Yaw / Pitch)</td></tr>
                <tr><td>Right Drag / Shift+Drag</td><td>Pan camera along screen plane</td></tr>
                <tr><td>Mouse Wheel</td><td>Dolly (Zoom in / out)</td></tr>
                <tr><td>Double Click</td><td>Direct flight to target landmark</td></tr>
                <tr><td>Touch Drag</td><td>Rotate view</td></tr>
                <tr><td>Pinch</td><td>Zoom / Dolly</td></tr>
              </tbody>
            </table>
          </div>

          <div className="help-box">
            <h4>Keyboard Flight Controls</h4>
            <table className="help-table">
              <tbody>
                <tr><td><kbd>W</kbd> / <kbd>↑</kbd></td><td>Thrust forward</td></tr>
                <tr><td><kbd>S</kbd> / <kbd>↓</kbd></td><td>Thrust backward</td></tr>
                <tr><td><kbd>A</kbd> / <kbd>←</kbd></td><td>Strafe left</td></tr>
                <tr><td><kbd>D</kbd> / <kbd>→</kbd></td><td>Strafe right</td></tr>
                <tr><td><kbd>Space</kbd> / <kbd>E</kbd></td><td>Ascend vertically</td></tr>
                <tr><td><kbd>C</kbd> / <kbd>Q</kbd></td><td>Descend vertically</td></tr>
                <tr><td><kbd>Shift</kbd></td><td>6× Warp thrust booster</td></tr>
                <tr><td><kbd>/</kbd> or <kbd>Ctrl+K</kbd></td><td>Focus universe search</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="help-box">
          <h4>Observatory Architecture & Multi-Scale Coordinates</h4>
          <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--txt-dim)', lineHeight: 1.5 }}>
            All bodies exist in a single double-precision Galactic-Centre Cartesian coordinate frame in light-years.
            Camera-relative rendering with dynamic adaptive scale ensures jitter-free visualization from 1 billion light-years down to Earth orbital radius.
          </p>
        </div>

        <div className="help-box" style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
          <h4>🎓 Cosmic Academy Interactive Tutorial</h4>
          <p style={{ margin: '4px 0 10px', fontSize: '13px', color: 'var(--txt-dim)', lineHeight: 1.5 }}>
            Learn the complete observatory systems, 3D attitude controls, scale navigation, astrophysical inspection, and simulation labs in an 8-stage hands-on cadet mission.
          </p>
          <button
            className="btn academy-btn"
            onClick={() => {
              onClose()
              startTutorial(true)
            }}
          >
            Launch Cosmic Academy Tutorial
          </button>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Close Reference
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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

function Loader() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      if (labelState.camera) {
        setReady(true)
        clearInterval(t)
      }
    }, 100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className={'loader' + (ready ? ' gone' : '')} aria-hidden={ready}>
      <div className="ring" />
      <span>Calibrating Astrophysical Coordinates…</span>
    </div>
  )
}

export function App() {
  const phase = useStore((s) => s.phase)
  const {
    quality,
    leftOpen,
    rightOpen,
    showStats,
    showOrbits,
    showGrid,
    showLabels,
    dataOpen,
    navMapOpen,
    error,
    selectedId,
    set,
  } = useStore()
  const tourIdx = useStore((s) => s.tourIndex)
  const [about, setAbout] = useState(false)
  const [help, setHelp] = useState(false)
  const [eventsModalOpen, setEventsModalOpen] = useState(false)
  const [activeEventId, setActiveEventId] = useState(eventState.activeId)
  const [gl, setGl] = useState<boolean | null>(null)
  const [speed, setSpeed] = useState(nav.speedMult)
  const [, force] = useState(0)

  useEffect(() => setGl(webglOk()), [])
  useEffect(() => {
    if (checkFirstTimeUser()) {
      openWelcomeModal()
    }
  }, [])
  useEffect(() => {
    return subscribeEventState(() => {
      setActiveEventId(eventState.activeId)
    })
  }, [])
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [])

  const inSolar = len(sub(nav.pos, SUN_POS)) < 0.02
  const isTour = phase === 'tour'
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 860
  const showInfo = rightOpen && !!selectedId && !dataOpen && (!isTour || !isMobile) && phase !== 'travel'
  const st = useStore.getState()

  if (gl === false) {
    return (
      <div className="fallback glass">
        <h2>WebGL is not available</h2>
        <p>COSMIC ATLAS requires WebGL 2.0 or WebGL 1.0. Please enable hardware acceleration in your browser settings.</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Boundary>
        <CosmicCanvas />
      </Boundary>
      {phase !== 'intro' && phase !== 'travel' && !activeEventId && <Labels />}
      <Loader />

      {/* Top Application Header (Hidden in Travel Mode or Event Mode) */}
      {phase !== 'travel' && !activeEventId && (
        <header className="top glass">
          <div className="brand" onClick={() => st.setPhase('intro')}>
            <span className="logo" aria-hidden>
              ✦
            </span>
            <div>
              <b>COSMIC ATLAS</b>
              <div className="sub">
                <span className="live-dot" />
                <span>OBSERVATORY OF SCALES</span>
              </div>
            </div>
          </div>

          <Search />

          <nav className="topnav" aria-label="Navigation controls">
            <button
              className="btn find"
              onClick={() => st.startTour()}
              title="Guided journey from ~1 billion light-years to Earth"
            >
              ✦ FIND HOME
            </button>
            <button
              className="btn travel-btn"
              onClick={() => st.enterTravelMode()}
              title="Enter Travel Mode: pilot a spacecraft through the Solar System"
            >
              🚀 TRAVEL MODE
            </button>
            <button
              className="btn events-btn"
              onClick={() => setEventsModalOpen(true)}
              title="Cosmic Events Observatory: View 3D simulations of supernovae, pulsars, and black holes"
            >
              🌌 Cosmic Events
            </button>
            <button
              className="btn academy-btn"
              onClick={() => startTutorial(true)}
              title="Cosmic Academy: Interactive training mission for new and returning explorers"
            >
              🎓 Academy
            </button>
            <AudioPlayer />
            <span className="divider" />
            <button className="btn ghost" onClick={() => st.goHome()} title="Fly camera directly to Earth">
              ◉ Earth
            </button>
            <button className="btn ghost" onClick={() => st.travel('milky-way')} title="Fly camera to the Milky Way Galaxy">
              ◎ Milky Way
            </button>
            <button className="btn ghost" onClick={() => st.travel('sun')} title="Fly camera to the Solar System">
              ☀ Solar System
            </button>
            <span className="divider" />
            <button
              className={'btn ghost' + (dataOpen ? ' on' : '')}
              onClick={() => set({ dataOpen: !dataOpen })}
              title="Ingest and map unfamiliar astronomy datasets"
            >
              ⌬ Data Intelligence
            </button>
            <button className="btn ghost" onClick={() => setHelp(true)} title="Keyboard & navigation controls">
              ? Help
            </button>
            <button className="btn ghost" onClick={() => setAbout(true)} title="Scientific notes & data integrity">
              ⓘ Notes
            </button>
          </nav>
        </header>
      )}

      {/* Hierarchical Astronomical Scale Breadcrumbs */}
      {phase !== 'intro' && !activeEventId && <ScaleBreadcrumbs />}

      {/* Floating Travel Progress HUD */}
      <TravelProgressHUD />

      {/* Opening Intro Experience */}
      {phase === 'intro' && (
        <div className="intro">
          <div className="intro-badge">
            <span>✦</span>
            <span>OBSERVATORY OF ASTRONOMICAL SCALES · 10⁻¹⁵ TO 10²⁶ METERS</span>
          </div>

          <h1>COSMIC ATLAS</h1>

          <p>
            Traverse 15 orders of magnitude in an interactive, camera-relative 3D universe.
            Fly from the 1-billion-light-year cosmic web filaments, through local galaxy superclusters and the Milky Way spiral arms, all the way home to Earth.
          </p>

          <div className="intro-actions">
            <button className="btn academy-btn big" onClick={() => startTutorial(true)}>
              🎓 COSMIC ACADEMY (TUTORIAL)
            </button>
            <button className="btn find big" onClick={() => st.startTour()}>
              ✦ BEGIN FIND HOME TOUR
            </button>
            <button className="btn travel-btn big" onClick={() => st.enterTravelMode('earth')}>
              🚀 ENTER TRAVEL MODE
            </button>
            <button className="btn big" onClick={() => st.setPhase('explore')}>
              EXPLORE FREELY
            </button>
          </div>

          <div className="intro-direct-bar">
            <span>Direct Jump:</span>
            <button className="chip" onClick={() => { st.setPhase('explore'); st.travel('earth') }}>◉ Earth</button>
            <button className="chip" onClick={() => { st.setPhase('explore'); st.travel('sun') }}>☀ Solar System</button>
            <button className="chip" onClick={() => { st.setPhase('explore'); st.travel('betelgeuse') }}>✦ Betelgeuse</button>
            <button className="chip" onClick={() => { st.setPhase('explore'); startEvent('supernova-betelgeuse') }}>💥 Supernova Sim</button>
            <button className="chip" onClick={() => { st.setPhase('explore'); startEvent('black-hole-m87') }}>🕳️ M87* Black Hole</button>
            <button className="chip" onClick={() => { st.setPhase('explore'); st.travel('laniakea') }}>◌ Laniakea</button>
          </div>

          <div className="intro-legend">
            <div><kbd>Left-Drag</kbd> Rotate View</div>
            <div><kbd>Right-Drag</kbd> Pan</div>
            <div><kbd>Scroll</kbd> Zoom / Dolly</div>
            <div><kbd>W A S D</kbd> Fly</div>
            <div><kbd>Shift</kbd> 6× Warp Boost</div>
          </div>
        </div>
      )}

      {/* TRAVEL MODE INTERACTIVE SIMULATION */}
      {phase === 'travel' && (
        <>
          <CockpitOverlay />
          <TravelHUD />
          {navMapOpen && <NavMapModal onClose={() => set({ navMapOpen: false })} />}
        </>
      )}

      {/* Main Exploration Mode UI (Hidden in Event Mode) */}
      {phase !== 'intro' && phase !== 'travel' && !activeEventId && (
        <>
          {leftOpen && phase !== 'tour' && <Browser />}
          {!leftOpen && phase !== 'tour' && (
            <button
              className="btn reopen glass"
              onClick={() => set({ leftOpen: true })}
              title="Show object catalogue"
              aria-label="Show object catalogue"
            >
              ☰ Objects
            </button>
          )}

          {phase === 'tour' && <TourCard />}
          {showInfo && <Info />}

          {(inSolar || (phase === 'tour' && tourIdx >= 16)) && <TimeBar />}

          <StatusBar />

          {/* Bottom Dock Controls */}
          <div className="dock glass" role="toolbar" aria-label="Observatory controls">
            <button
              className="btn ghost"
              onClick={() => {
                interrupt()
                nav.followId = null
                nav.orbit = false
                if (useStore.getState().phase === 'tour') useStore.getState().tourExit()
              }}
              title="Stop tracking target and fly freely"
            >
              ✈ Free flight
            </button>

            <span className="divider" />

            <button
              className={'tog' + (showOrbits ? ' on' : '')}
              aria-pressed={showOrbits}
              onClick={() => set({ showOrbits: !showOrbits })}
              title="Toggle Keplerian planetary orbits"
            >
              ◯ Orbits
            </button>
            <button
              className={'tog' + (showLabels ? ' on' : '')}
              aria-pressed={showLabels}
              onClick={() => set({ showLabels: !showLabels })}
              title="Toggle celestial object labels"
            >
              Aa Labels
            </button>
            <button
              className={'tog' + (showGrid ? ' on' : '')}
              aria-pressed={showGrid}
              onClick={() => set({ showGrid: !showGrid })}
              title="Toggle Galactic-plane distance rings (10,000 ly intervals)"
            >
              # Grid
            </button>

            <span className="divider" />

            <label title="Camera translation speed multiplier">
              Speed
              <select
                value={speed}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  nav.speedMult = v
                  setSpeed(v)
                }}
              >
                {[0.1, 0.5, 1, 3, 10, 50].map((v) => (
                  <option key={v} value={v}>
                    ×{v}
                  </option>
                ))}
              </select>
            </label>

            <label title="Rendering resolution and particle density">
              Quality
              <select
                value={quality}
                onChange={(e) =>
                  set({ quality: e.target.value as 'high' | 'balanced' | 'performance' })
                }
              >
                <option value="high">High</option>
                <option value="balanced">Balanced</option>
                <option value="performance">Performance</option>
              </select>
            </label>

            <button
              className={'tog' + (showStats ? ' on' : '')}
              aria-pressed={showStats}
              onClick={() => set({ showStats: !showStats })}
              title="Toggle telemetry & diagnostics"
              aria-label="Diagnostics"
            >
              ⚙
            </button>
          </div>

          {showStats && <Diagnostics />}
        </>
      )}

      {/* Astro Data Intelligence Workspace */}
      {dataOpen && <DataPanel />}

      {/* Modals & Simulation HUD */}
      <EventPlayerHUD />
      {eventsModalOpen && (
        <CosmicEventsModal
          isOpen={eventsModalOpen}
          onClose={() => setEventsModalOpen(false)}
        />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}

      {/* Cosmic Academy Tutorial System */}
      <TutorialOverlay />
      <WelcomeModal onOpenHelp={() => setHelp(true)} />
      <AcademyCompleteModal onOpenEvents={() => setEventsModalOpen(true)} />

      {error && (
        <div className="banner glass" role="alert">
          <span>{error}</span>
          <button className="btn" onClick={() => location.reload()}>
            Recover Scene
          </button>
        </div>
      )}
    </div>
  )
}
