import { useEffect, useMemo, useRef } from 'react'
import { OBJECT_BY_ID, MISSION_BY_ID, Fact, dateMs, citeGroups } from '../missions'
import { storyFor, partsForComponent } from '../missions/stories'
import { useNarrator } from './narrator'
import { useGuide, componentLine } from './guide'
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

export function DiscoveryPanel() {
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
  const tab = panel.tab
  const loc = obj.location.value

  return (
    <div className="discovery glass" role="dialog" aria-label={`${obj.name} details`}>
      <header>
        <span className="eyebrow">{obj.nasaHardware ? 'NASA HARDWARE' : `${obj.builtBy} HARDWARE — NOT NASA`}</span>
        <h2>{obj.name}</h2>
        <p className="muted">{mission.name} · {obj.category.replace(/-/g, ' ')}</p>
        <button className="discovery-close" onClick={() => { narrator.stop(); set({ panel: null, component: null }) }} aria-label="Return to exploration">✕</button>
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
        <button className="btn" onClick={() => { narrator.stop(); set({ panel: null, component: null }) }}>Return to Exploration</button>
      </footer>
    </div>
  )
}
