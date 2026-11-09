import { useEffect, useMemo, useRef, useState } from 'react'
import { OBJECT_BY_ID, MISSION_BY_ID, SOURCES, Fact, dateMs } from '../missions'
import { STORIES } from '../missions/stories'
import { useStore } from '../store/store'
import { useSurface, PanelTab } from './surfaceState'
import { VALID_FROM, VALID_TO } from '../astro/ephemeris'

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'story', label: 'Historical Story' },
  { id: 'specs', label: 'Technical Specifications' },
  { id: 'timeline', label: 'Mission Timeline' },
  { id: 'science', label: 'Science' },
]

function Badge({ f }: { f: Fact<unknown> }) {
  const cls = f.status === 'verified' ? 'ok' : f.status === 'conflicting' ? 'warn' : 'bad'
  return <span className={`vbadge ${cls}`}>{f.status}</span>
}

function Cite({ ids }: { ids: string[] }) {
  return (
    <span className="cite">
      {ids.map((id) => (
        <a key={id} href={SOURCES[id]?.url} target="_blank" rel="noreferrer" title={`${SOURCES[id]?.title} — ${SOURCES[id]?.organisation}`}>
          [{SOURCES[id]?.organisation.split(' ')[0] ?? id}]
        </a>
      ))}
    </span>
  )
}

/** text-first narration: the transcript is always shown; voice (Web Speech API) is optional and user-controlled */
function Narration({ lines }: { lines: string[] }) {
  const can = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [idx, setIdx] = useState(-1)
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const run = useRef(0)
  const stop = () => {
    run.current++
    if (can) window.speechSynthesis.cancel()
    setState('idle')
    setIdx(-1)
  }
  useEffect(() => stop, [lines])
  const play = (from = 0) => {
    if (!can) return
    const token = ++run.current
    window.speechSynthesis.cancel()
    const say = (i: number) => {
      if (token !== run.current) return
      if (i >= lines.length) {
        setState('idle')
        setIdx(-1)
        return
      }
      setIdx(i)
      const u = new SpeechSynthesisUtterance(lines[i])
      u.rate = 0.95
      u.pitch = 1
      u.onend = () => setTimeout(() => say(i + 1), 350) // a pause between sentences
      u.onerror = () => setState('idle')
      window.speechSynthesis.speak(u)
    }
    setState('playing')
    say(from)
  }
  return (
    <div className="narration">
      <div className="narration-controls">
        {can ? (
          <>
            {state === 'idle' && <button className="btn" onClick={() => play(0)}>▶ Narrate</button>}
            {state === 'playing' && <button className="btn" onClick={() => { window.speechSynthesis.pause(); setState('paused') }}>❚❚ Pause</button>}
            {state === 'paused' && <button className="btn" onClick={() => { window.speechSynthesis.resume(); setState('playing') }}>▶ Resume</button>}
            {state !== 'idle' && <button className="btn ghost" onClick={stop}>■ Stop</button>}
            <button className="btn ghost" onClick={() => play(0)}>↺ Replay</button>
          </>
        ) : (
          <span className="muted">Voice is not available in this browser — read the transcript below.</span>
        )}
      </div>
      {idx >= 0 && <p className="subtitle" aria-live="polite">{lines[idx]}</p>}
      <div className="transcript">
        {lines.map((l, i) => (
          <p key={i} className={i === idx ? 'speaking' : ''}>{l}</p>
        ))}
      </div>
    </div>
  )
}

export function DiscoveryPanel() {
  const panel = useSurface((s) => s.panel)!
  const component = useSurface((s) => s.component)
  const set = useSurface((s) => s.set)
  const [expanded, setExpanded] = useState(false)
  const obj = OBJECT_BY_ID[panel.objectId]
  const mission = MISSION_BY_ID[obj.missionId]
  const story = STORIES[obj.id]
  const lines = useMemo(() => (story ? (expanded ? story.expanded.map((p) => `${p.heading}. ${p.text}`) : story.concise) : []), [story, expanded])
  const tab = panel.tab
  const loc = obj.location.value

  return (
    <div className="discovery glass" role="dialog" aria-label={`${obj.name} details`}>
      <header>
        <span className="eyebrow">{obj.nasaHardware ? 'NASA HARDWARE' : `${obj.builtBy} HARDWARE — NOT NASA`}</span>
        <h2>{obj.name}</h2>
        <p className="muted">{mission.name} · {obj.category.replace(/-/g, ' ')}</p>
        <button className="discovery-close" onClick={() => set({ panel: null, component: null })} aria-label="Return to exploration">✕</button>
      </header>
      <nav className="discovery-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => set({ panel: { ...panel, tab: t.id } })}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="discovery-body">
        {tab === 'inspect' && (
          <>
            <p className="muted">Drag to orbit, scroll to zoom. Pick a part to look at it up close.</p>
            <div className="comp-list">
              <button className={!component ? 'on' : ''} onClick={() => set({ component: null })}>Whole object</button>
              {obj.components.map((c) => (
                <button key={c.id} className={component === c.id ? 'on' : ''} onClick={() => set({ component: c.id })}>
                  {c.name}
                </button>
              ))}
            </div>
            {component && (
              <p>
                {obj.components.find((c) => c.id === component)?.description} <Cite ids={obj.components.find((c) => c.id === component)?.sources ?? []} />
              </p>
            )}
            <p className="provenance">
              <b>3D model:</b> {obj.model.provenance}
            </p>
          </>
        )}
        {tab === 'story' && story && (
          <>
            <div className="seg story-len">
              <button className={!expanded ? 'on' : ''} onClick={() => setExpanded(false)}>Short</button>
              <button className={expanded ? 'on' : ''} onClick={() => setExpanded(true)}>Full story</button>
            </div>
            <Narration lines={lines} />
            {expanded && (
              <p className="muted small">
                Sources: <Cite ids={[...new Set(story.expanded.flatMap((p) => p.sources))]} />
              </p>
            )}
          </>
        )}
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
                  {ms >= VALID_FROM && ms <= VALID_TO && (
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
      <footer>
        <button className="btn" onClick={() => set({ panel: null, component: null })}>Return to Exploration</button>
      </footer>
    </div>
  )
}
