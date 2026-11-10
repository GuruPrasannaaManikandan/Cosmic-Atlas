import { useEffect, useMemo, useRef } from 'react'
import { OBJECT_BY_ID, MISSION_BY_ID, Fact, dateMs, citeGroups } from '../missions'
import { storyFor, partsForComponent } from '../missions/stories'
import { useNarrator } from './narrator'
import { useGuide, componentLine } from './guide'
import { useStore } from '../store/store'
import { useSurface, PanelTab } from './surfaceState'
import { VALID_FROM, VALID_TO } from '../astro/ephemeris'

/** short visible labels; the accessible name always contains the visible label (WCAG 2.5.3) */
const TABS: { id: PanelTab; label: string; name: string }[] = [
  { id: 'overview', label: 'Overview', name: 'Mission Overview' },
  { id: 'inspect', label: 'Inspect', name: 'Engineering Inspection' },
  { id: 'story', label: 'Story', name: 'Historical Story' },
  { id: 'specs', label: 'Specifications', name: 'Technical Specifications' },
  { id: 'timeline', label: 'Timeline', name: 'Mission Timeline' },
  { id: 'science', label: 'Science', name: 'Science' },
]

/** mission status in the directive's vocabulary: operational / completed / inactive / lost contact (never "abandoned" by default) */
const STATUS_LABEL: Record<string, string> = { operating: 'Operational', completed: 'Completed', ended: 'Mission ended — inactive', lost: 'Lost contact', unknown: 'Unknown' }

const fmtDate = (f?: Fact<string>) => (f?.value ? f.value.replace('T', ' ').replace(/:\d{2}Z$/, ' UT').replace('Z', ' UT') : null)

function Overview({ objectId }: { objectId: string }) {
  const obj = OBJECT_BY_ID[objectId]
  const m = MISSION_BY_ID[obj.missionId]
  const surface = m.classes.some((c) => c === 'lander' || c === 'rover' || c === 'crewed-landing' || c === 'helicopter')
  const site = m.landingSite?.value
  const rows: { k: string; v: React.ReactNode; f?: Fact<unknown> }[] = [
    { k: 'Mission', v: m.name },
    { k: 'Spacecraft', v: obj.name },
    { k: 'Agency', v: <>{m.agency}{m.partners.length > 0 && <> · partners: {m.partners.map((p) => `${p.agency} (${p.role})`).join(', ')}</>}{!m.nasaMission && <em className="non-nasa"> · not a NASA mission: {m.nonNasaNote}</em>}</> },
    { k: 'Mission type', v: `${m.classes.join(', ')} · ${surface ? 'surface mission' : 'orbital / flyby mission'}` },
    { k: 'Launch', v: fmtDate(m.launch) ?? m.launch.note, f: m.launch },
    ...(m.landing ? [{ k: 'Landing', v: fmtDate(m.landing) ?? m.landing.note, f: m.landing as Fact<unknown> }] : []),
    ...(m.plannedDuration ? [{ k: 'Planned duration', v: m.plannedDuration.value ?? m.plannedDuration.note, f: m.plannedDuration as Fact<unknown> }] : []),
    ...(m.actualDuration ? [{ k: 'Actual duration', v: m.actualDuration.value ?? m.actualDuration.note, f: m.actualDuration as Fact<unknown> }] : []),
    { k: 'Mission status', v: m.status.value ? STATUS_LABEL[m.status.value] : m.status.note, f: m.status },
    { k: 'This hardware now', v: obj.currentStatus.value ?? obj.currentStatus.note, f: obj.currentStatus },
    { k: 'Historical location', v: site ? `${Math.abs(site.latDeg).toFixed(4)}°${site.latDeg >= 0 ? 'N' : 'S'}, ${site.lonEastDeg.toFixed(4)}°E (landing site)` : m.landingSite?.note ?? '—', f: m.landingSite as Fact<unknown> | undefined },
  ]
  return (
    <>
      <dl className="specs overview">
        {rows.map((r) => (
          <div key={r.k} className="ov-row">
            <dt>{r.k} {r.f && <Badge f={r.f} />}</dt>
            <dd>{r.v} {r.f && r.f.sources.length > 0 && <Cite ids={r.f.sources} />}{r.f?.note && r.f.value !== null && <div className="muted small">{r.f.note}</div>}</dd>
          </div>
        ))}
      </dl>
      <h3 className="ov-h">Why it was sent</h3>
      <p>{m.summary}</p>
    </>
  )
}

function Badge({ f }: { f: Fact<unknown> }) {
  const cls = f.status === 'verified' ? 'ok' : f.status === 'conflicting' ? 'warn' : 'bad'
  return <span className={`vbadge ${cls}`}>{f.status}</span>
}

function Cite({ ids }: { ids: string[] }) {
  return (
    <span className="cite">
      {citeGroups(ids).map((g) => (
        <a key={g.label} href={g.url} target="_blank" rel="noreferrer" title={g.titles}>
          [{g.label}{g.count > 1 ? ` ×${g.count}` : ''}]
        </a>
      ))}
    </span>
  )
}

/** the sentence with the word currently being spoken (voice) or read (captions) highlighted */
export function SpokenText({ text, charIdx }: { text: string; charIdx: number }) {
  if (charIdx < 0) return <>{text}</>
  const end = text.slice(charIdx).search(/\s|$/)
  const stop = end < 0 ? text.length : charIdx + end
  return (
    <>
      {text.slice(0, charIdx)}
      <mark className="spoken-word">{text.slice(charIdx, stop)}</mark>
      {text.slice(stop)}
    </>
  )
}

/** story narration: one shared narrator (keeps playing across tabs), synced transcript, controls, honest voice label */
function NarratorPanel({ objectId }: { objectId: string }) {
  const n = useNarrator()
  const can = typeof window !== 'undefined' && 'speechSynthesis' in window
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (n.objectId !== objectId) n.load(objectId, 'short')
  }, [objectId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.querySelector('.speaking')?.scrollIntoView?.({ block: 'nearest' })
  }, [n.idx])
  const story = storyFor(objectId)
  if (!story) return null
  return (
    <div className="narration">
      <div className="seg story-len" role="group" aria-label="Story version">
        <button className={n.mode === 'short' ? 'on' : ''} aria-pressed={n.mode === 'short'} onClick={() => n.load(objectId, 'short')}>
          Young explorers (short)
        </button>
        <button className={n.mode === 'full' ? 'on' : ''} aria-pressed={n.mode === 'full'} onClick={() => n.load(objectId, 'full')}>
          Full scientific story
        </button>
      </div>
      <div className="narration-controls" role="group" aria-label="Narration controls">
        {n.state === 'idle' && <button className="btn" onClick={() => n.play(0)}>▶ Narrate</button>}
        {n.state === 'playing' && <button className="btn" onClick={n.pause}>❚❚ Pause</button>}
        {n.state === 'paused' && <button className="btn" onClick={n.resume}>▶ Resume</button>}
        <button className="btn ghost" onClick={n.prev} disabled={n.idx <= 0} aria-label="Previous sentence">⏮</button>
        <button className="btn ghost" onClick={n.next} disabled={n.idx < 0 || n.idx >= n.lines.length - 1} aria-label="Next sentence">⏭</button>
        {n.state !== 'idle' && <button className="btn ghost" onClick={n.stop}>■ Stop</button>}
        <span className="narr-progress mono small" aria-live="off">{n.idx >= 0 ? `${n.idx + 1} / ${n.lines.length}` : `${n.lines.length} sentences`}</span>
      </div>
      <div className="narration-options small">
        <label title={can ? 'Spoken by your browser\'s built-in synthetic text-to-speech voice' : 'This browser has no speech engine — captions only'}>
          <input type="checkbox" checked={n.voice && can} disabled={!can} onChange={(e) => n.set({ voice: e.target.checked })} /> Voice <span className="muted">(browser text-to-speech, synthetic)</span>
        </label>
        <label>
          Speed{' '}
          <select value={n.rate} onChange={(e) => n.set({ rate: parseFloat(e.target.value) })} aria-label="Narration speed">
            <option value={0.8}>slower</option>
            <option value={1}>normal</option>
            <option value={1.25}>faster</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={n.autoFocus} onChange={(e) => n.set({ autoFocus: e.target.checked })} /> Camera follows the story
        </label>
      </div>
      <ol className="transcript" ref={listRef}>
        {n.lines.map((l, i) => (
          <li key={i} className={i === n.idx ? 'speaking' : ''}>
            {l.heading && <b className="t-head">{l.heading}</b>}
            <button className="t-line" onClick={() => n.play(i)} title="Play from this sentence">
              {i === n.idx ? <SpokenText text={l.text} charIdx={n.charIdx} /> : l.text}
            </button>
            <Cite ids={l.sources} />
          </li>
        ))}
      </ol>
      <p className="muted small">The guide reads the catalogue story above; nothing it says is a quotation of a real astronaut unless the text says so and cites it.</p>
    </div>
  )
}

export function DiscoveryPanel({ inspectNote, clockButtons = true, onRelive }: { inspectNote?: string; clockButtons?: boolean; onRelive?: () => void } = {}) {
  const panel = useSurface((s) => s.panel)!
  const component = useSurface((s) => s.component)
  const lmModel = useSurface((s) => s.lmModel)
  const set = useSurface((s) => s.set)
  const obj = OBJECT_BY_ID[panel.objectId]
  const mission = MISSION_BY_ID[obj.missionId]
  const story = useMemo(() => storyFor(obj.id), [obj.id])
  const narrator = useNarrator()
  const pickComponent = (cid: string | null) => {
    set({ component: cid })
    if (cid) {
      const line = componentLine(obj.id, cid)
      if (line && narrator.state !== 'playing') useGuide.getState().say(line)
    }
  }
  const compParts = component ? partsForComponent(obj.id, component) : []
  const collapsed = useSurface((s) => s.panelCollapsed)
  const close = () => {
    narrator.stop()
    set({ panel: null, component: null, panelCollapsed: false })
  }
  // tablist keyboard model: arrows move between tabs (with wrap), Home / End jump; focus follows selection
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    set({ panel: { ...panel, tab: TABS[to].id } })
    requestAnimationFrame(() => document.getElementById(`dtab-${TABS[to].id}`)?.focus())
  }
  const tab = panel.tab
  const loc = obj.location.value

  return (
    <aside className="discovery" aria-label={`${obj.name} record`} data-collapsed={collapsed ? 'true' : undefined}>
      <header className="discovery-head">
        <div className="discovery-title">
          <span className="eyebrow">{obj.nasaHardware ? 'NASA HARDWARE' : `${obj.builtBy} HARDWARE — NOT NASA`}</span>
          <h2>{obj.name}</h2>
          <p className="discovery-meta">{mission.name} · {obj.category.replace(/-/g, ' ')}</p>
        </div>
        <div className="discovery-head-actions">
          <button
            className="discovery-icon"
            onClick={() => set({ panelCollapsed: !collapsed })}
            aria-expanded={!collapsed}
            aria-controls="discovery-content"
            aria-label={collapsed ? 'Show the record' : 'Hide the record to see the 3-D view'}
            title={collapsed ? 'Show the record' : 'Hide the record (more 3-D view)'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <button className="discovery-icon discovery-close" onClick={close} aria-label="Return to exploration" title="Return to exploration (Esc)">
            ✕
          </button>
        </div>
      </header>
      <div id="discovery-content" className="discovery-content" hidden={collapsed}>
      <div className="discovery-tabs" role="tablist" aria-label="Record sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`dtab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="discovery-body"
            aria-label={t.name}
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? 'on' : ''}
            onClick={() => set({ panel: { ...panel, tab: t.id } })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="discovery-body" id="discovery-body" role="tabpanel" aria-labelledby={`dtab-${tab}`} tabIndex={0}>
        {tab === 'overview' && <Overview objectId={obj.id} />}
        {tab === 'inspect' && (
          <>
            <p className="muted">{inspectNote ?? 'Drag to orbit, scroll to zoom. Pick a part to look at it up close.'}</p>
            <div className="comp-list">
              <button className={!component ? 'on' : ''} onClick={() => pickComponent(null)}>Whole object</button>
              {obj.components.map((c) => (
                <button key={c.id} className={component === c.id ? 'on' : ''} onClick={() => pickComponent(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            {component && (
              <p>
                {obj.components.find((c) => c.id === component)?.description} <Cite ids={obj.components.find((c) => c.id === component)?.sources ?? []} />
              </p>
            )}
            {component && compParts.length > 0 && (
              <div className="comp-story" data-testid="component-story">
                <h3>In the story</h3>
                {compParts.map((p) => (
                  <div key={p.part} className="comp-story-part">
                    <b>{p.heading}.</b> {p.text} <Cite ids={p.sources} />
                    <button className="btn ghost small" onClick={() => narrator.playPart(obj.id, p.part)}>▶ Hear this from the guide</button>
                  </div>
                ))}
              </div>
            )}
            {obj.model.id === 'lm-descent-stage' && (
              <div className="seg model-variant" role="group" aria-label="3D model">
                <button className={lmModel === 'nasa' ? 'on' : ''} aria-pressed={lmModel === 'nasa'} onClick={() => set({ lmModel: 'nasa' })}>
                  NASA official model
                </button>
                <button className={lmModel === 'reconstruction' ? 'on' : ''} aria-pressed={lmModel === 'reconstruction'} onClick={() => set({ lmModel: 'reconstruction' })}>
                  Dimension-accurate reconstruction
                </button>
              </div>
            )}
            <p className="provenance">
              <b>3D model:</b>{' '}
              {obj.model.id === 'lm-descent-stage' && lmModel === 'reconstruction'
                ? 'Procedural reconstruction built to the NSSDCA dimensions (4.2 m octagonal stage, 1.5 m clearance, 9.4 m footpad span, ~1 m engine skirt). Footpad size, strut layout and foil layout are approximations.'
                : obj.model.provenance}
            </p>
          </>
        )}
        {tab === 'story' && story && <NarratorPanel objectId={obj.id} />}
        {tab === 'specs' && (
          <dl className="specs">
            <dt>Built by</dt>
            <dd>{String(obj.builtBy)}</dd>
            <dt>Dimensions <Badge f={obj.dimensions} /></dt>
            <dd>{obj.dimensions.value ?? obj.dimensions.note} {obj.dimensions.sources.length > 0 && <Cite ids={obj.dimensions.sources} />}</dd>
            <dt>Mass <Badge f={obj.massKg} /></dt>
            <dd>
              {obj.massKg.value !== null ? `${obj.massKg.value} kg` : obj.massKg.note} {obj.massKg.value !== null && obj.massKg.note && <span className="muted">({obj.massKg.note})</span>} <Cite ids={obj.massKg.sources} />
            </dd>
            <dt>Location <Badge f={obj.location} /></dt>
            <dd>
              {loc ? `${Math.abs(loc.latDeg)}°${loc.latDeg >= 0 ? 'N' : 'S'}, ${loc.lonEastDeg}°E${loc.elevationM !== undefined ? `, ${loc.elevationM} m` : ''}${loc.uncertaintyM !== undefined ? ` (±${loc.uncertaintyM} m)` : ''} — ${loc.datum}` : obj.location.note}{' '}
              <Cite ids={obj.location.sources} />
              {obj.location.note && loc && <div className="muted small">{obj.location.note}</div>}
            </dd>
            <dt>Status <Badge f={obj.currentStatus} /></dt>
            <dd>{obj.currentStatus.value} <Cite ids={obj.currentStatus.sources} /></dd>
            <dt>Design</dt>
            <dd>{obj.design}</dd>
          </dl>
        )}
        {tab === 'timeline' && (
          <ol className="m-timeline">
            {mission.milestones.map((m, i) => {
              const ms = dateMs(m.date)
              return (
                <li key={i}>
                  <time>{m.date.replace('T', ' ').replace('Z', ' UT')}</time>
                  <b>{m.title}</b>
                  <p>{m.description} <Cite ids={m.sources} /></p>
                  {clockButtons && ms >= VALID_FROM && ms <= VALID_TO && (
                    <button className="btn ghost small" onClick={() => useStore.getState().setSim(ms)} title="Moves the simulation clock: the Sun and shadows here change to that moment">
                      ☀ Set clock to this moment
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        {tab === 'science' && (
          <>
            <p>{mission.summary}</p>
            {story?.expanded.filter((p) => p.part === 'objectives' || p.part === 'discoveries').map((p, i) => (
              <p key={i}>
                <b>{p.heading}.</b> {p.text} <Cite ids={p.sources} />
              </p>
            ))}
          </>
        )}
      </div>
      <footer className="discovery-foot">
        {onRelive && (
          <button className="btn relive-btn" data-testid="relive-mission" onClick={() => { narrator.stop(); onRelive() }} title="Travel back through this mission's documented events">
            ⏪ Relive the mission
          </button>
        )}
        <button className="btn" onClick={close}>Return to Exploration</button>
      </footer>
      </div>
    </aside>
  )
}
