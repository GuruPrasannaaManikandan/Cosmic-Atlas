/**
 * Relive Mission overlay: the full-screen mission player (3-D scene + mission clock, telemetry, event cards, the
 * phase timeline and transport controls). Opened from the main menu; "Return to explorer" restores the explorer
 * exactly as it was (player.ts snapshot).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReliveScene } from './scene/ReliveScene'
import { RELIVE_SCRIPTS, SPEEDS, clock, onReliveEvent, relive, useRelive } from './player'
import { formatClock, formatRate, formatUtc, playAt, sampleTrack } from './timeline'
import { missionAudio } from './audio'
import { citeGroups } from '../missions'
import type { MissionEvent, MissionScript, TelemetryTrack } from './types'
import { useStore } from '../store/store'
import { SITE_BY_ID } from '../surface/sites'
import { expedition } from '../expedition/expedition'
import { v3 } from './geo'
import './relive.css'

const ICON: Record<MissionEvent['kind'], string> = {
  countdown: '⏱', ignition: '🔥', liftoff: '🚀', staging: '⇊', jettison: '✂', cutoff: '■', burn: '➶', orbit: '◌', docking: '⧉',
  separation: '⇵', coast: '…', landing: '⬇', surface: '👣', entry: '☄', parachute: '☂', splashdown: '🌊', deploy: '⛭', comms: '📡', end: '◆',
}

function Cite({ ids }: { ids: string[] }) {
  return (
    <span className="relive-cite">
      {citeGroups(ids).map((g) => <a key={g.label} href={g.url} target="_blank" rel="noreferrer" title={g.titles}>[{g.label}]</a>)}
    </span>
  )
}

function fmtValue(tr: TelemetryTrack, v: number): string {
  if (tr.name === 'altitude') return v >= 10000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km` : `${Math.round(v).toLocaleString('en-US')} m`
  if (tr.name === 'speed') return v >= 1000 ? `${(v / 1000).toFixed(2)} km/s` : `${Math.round(v)} m/s`
  return `${Math.round(v).toLocaleString('en-US')} km`
}

/** expeditions: the conceptual flight's own values, labelled as computed */
function ComputedTelemetry({ script, t }: { script: MissionScript; t: number }) {
  const f = script.frame!(t)
  const body = f.env === 'earth' ? 'Earth' : f.env === 'moon' ? 'the Moon' : f.env.startsWith('mars') ? 'Mars' : f.env === 'cislunar' ? 'Earth' : null
  const alt = f.env === 'interplanetary' ? null : f.alt
  const sp = v3.len(f.vel)
  return (
    <section className="relive-tele glass" aria-label="Flight values" data-testid="relive-telemetry">
      <h4>Flight (conceptual)</h4>
      {alt !== null && body && (
        <div className="relive-tele-row"><span className="k">Altitude above {body}</span><b className="v">{alt >= 10000 ? `${Math.round(alt / 1000).toLocaleString('en-US')} km` : `${Math.round(alt)} m`}</b><span className="tag">computed</span></div>
      )}
      <div className="relive-tele-row"><span className="k">Speed ({f.env === 'mars-local' ? 'over the ground' : 'in this frame'})</span><b className="v">{sp >= 1000 ? `${(sp / 1000).toFixed(2)} km/s` : `${Math.round(sp)} m/s`}</b><span className="tag">computed</span></div>
      <span className="frame muted small">Two-body physics around the real Earth, Moon and Mars positions; the vehicle and its sequence are conceptual.</span>
    </section>
  )
}

function Telemetry({ script, t }: { script: MissionScript; t: number }) {
  const rows = (['altitude', 'speed', 'distance'] as const).map((n) => {
    for (const tr of script.telemetry.filter((x) => x.name === n)) {
      const s = sampleTrack(tr, t)
      if (s) return { tr, s }
    }
    return null
  }).filter(Boolean) as { tr: TelemetryTrack; s: { v: number; exact: boolean } }[]
  return (
    <section className="relive-tele glass" aria-label="Published telemetry" data-testid="relive-telemetry">
      <h4>Telemetry</h4>
      {rows.length === 0 && <p className="muted small">No published value for this moment.</p>}
      {rows.map(({ tr, s }) => (
        <div key={tr.name + tr.frame} className="relive-tele-row">
          <span className="k">{tr.name === 'distance' ? (tr.frame.startsWith('from the centre') ? 'From Mars centre' : 'Altitude (Earth)') : tr.name === 'altitude' ? 'Altitude' : 'Velocity'}</span>
          <b className="v">{fmtValue(tr, s.v)}</b>
          <span className={'tag ' + (s.exact ? 'ok' : '')} title={tr.frame}>{s.exact ? 'published' : 'interpolated'}</span>
          <span className="frame muted">{tr.frame} <Cite ids={tr.sources} /></span>
        </div>
      ))}
    </section>
  )
}

function EventCard({ script, i, onClose }: { script: MissionScript; i: number; onClose: () => void }) {
  const e = script.events[i]
  if (!e) return null
  return (
    <article className="relive-card glass" data-testid="relive-card" aria-live="polite">
      <header>
        <span className="ico" aria-hidden>{ICON[e.kind]}</span>
        <div>
          <b>{e.title}</b>
          <time>{e.basis === 'sequence' ? '≈ ' : ''}{formatClock(script.clock, e.t)} · {formatUtc(script.epochMs + e.t * 1000)}</time>
        </div>
        <button className="x" onClick={onClose} aria-label="Hide this event">×</button>
      </header>
      <p>{e.text} <Cite ids={e.sources} /></p>
      {e.basis === 'sourced' && <p className="basis ok">Published time</p>}
      {e.basis === 'derived' && <p className="basis">Derived time — {e.timeNote}</p>}
      {e.basis === 'sequence' && <p className="basis warn">≈ Not timed in the sources read — {e.timeNote}</p>}
      {e.basis === 'conceptual' && <p className="basis">Conceptual expedition step — not a real mission event</p>}
    </article>
  )
}

function Timeline({ script, u, L }: { script: MissionScript; u: number; L: number }) {
  const bar = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const seekAt = (x: number) => {
    const r = bar.current!.getBoundingClientRect()
    relive.seek(((x - r.left) / r.width) * L)
  }
  const phases = useMemo(() => script.phases.map((p) => ({ p, a: playAt(script.segments, p.t0) / L, b: playAt(script.segments, p.t1) / L })), [script, L])
  const ticks = useMemo(() => script.events.map((e, i) => ({ e, i, x: playAt(script.segments, e.t) / L })), [script, L])
  const S = useRelive()
  return (
    <div className="relive-tl" data-testid="relive-timeline">
      <div
        className="relive-tl-bar"
        ref={bar}
        role="slider"
        aria-label="Mission timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(L)}
        aria-valuenow={Math.round(u)}
        aria-valuetext={formatClock(script.clock, S.t)}
        tabIndex={0}
        onPointerDown={(ev) => { drag.current = true; (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); seekAt(ev.clientX) }}
        onPointerMove={(ev) => { if (drag.current) seekAt(ev.clientX) }}
        onPointerUp={() => { drag.current = false }}
      >
        {phases.map(({ p, a, b }) => (
          <div key={p.id} className={'ph ' + (S.phaseId === p.id ? 'on' : '')} style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} title={p.title}>
            {(b - a) > 0.07 && <span>{p.title}</span>}
          </div>
        ))}
        {ticks.map(({ e, i, x }) => (
          <button key={e.id} className={'tick ' + e.basis + (i === S.eventIdx ? ' on' : '')} style={{ left: `${x * 100}%` }} title={`${e.title} · ${formatClock(script.clock, e.t)}`} aria-label={e.title}
            onPointerDown={(ev) => ev.stopPropagation()} onClick={() => relive.seekEvent(i)} />
        ))}
        <div className="head" style={{ left: `${(u / L) * 100}%` }} />
      </div>
    </div>
  )
}

export default function ReliveMission() {
  const S = useRelive()
  const script = S.id ? RELIVE_SCRIPTS[S.id] : null
  const [info, setInfo] = useState(false)
  const [sound, setSound] = useState(missionAudio.enabled)
  const [, force] = useState(0)

  // audio: start on open (the click that opened it is the user gesture), cues on events
  useEffect(() => {
    if (!S.id) return
    missionAudio.start()
    const off = onReliveEvent((e) => { if (e.cue) missionAudio.cue(e.cue) })
    return () => { off(); missionAudio.stop() }
  }, [S.id])

  // event cards fade after a while (unless paused)
  useEffect(() => {
    const iv = setInterval(() => {
      const st = useRelive.getState()
      if (st.card && st.status === 'playing' && clock.wall - st.card.at > 8) st.set({ card: null })
      force((x) => x + 1)
    }, 500)
    return () => clearInterval(iv)
  }, [])

  // keyboard (capture: the explorer underneath never sees these keys)
  useEffect(() => {
    if (!S.id) return
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      let used = true
      switch (e.code) {
        case 'Space': relive.toggle(); break
        case 'ArrowRight': relive.nextEvent(); break
        case 'ArrowLeft': relive.prevEvent(); break
        case 'Equal': case 'NumpadAdd': relive.faster(); break
        case 'Minus': case 'NumpadSubtract': relive.slower(); break
        case 'KeyI': setInfo((x) => !x); break
        case 'Escape': if (info) setInfo(false); else if (RELIVE_SCRIPTS[S.id!]?.kind === 'expedition') relive.finish(); else relive.close(); break
        default: used = false
      }
      if (used) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [S.id, info])

  if (!S.id || !script) return null
  const phase = script.phases.find((p) => p.id === S.phaseId) ?? script.phases[0]
  const allSources = [...new Set(script.events.flatMap((e) => e.sources).concat(script.telemetry.flatMap((t) => t.sources)))]
  const goSurface = (siteId: string) => {
    relive.close()
    const site = SITE_BY_ID[siteId]
    const st = useStore.getState()
    st.set({ phase: 'explore' })
    if (site) st.setSim(site.daylight.ms)
    st.enterSurface(siteId)
  }
  const playing = S.status === 'playing'
  const exp = script.kind === 'expedition'
  const outbound = script.direction !== 'return'
  const eyebrow = exp
    ? outbound ? `EXPEDITION · ${script.dest === 'moon' ? 'TO THE MOON' : 'TO MARS'} · CONCEPTUAL` : `RETURN TO ORBIT · CONCEPTUAL`
    : `RELIVE THE MISSION · ${script.title.toUpperCase()}`

  return (
    <div className="relive" role="dialog" aria-modal="true" aria-label={exp ? script.title : `Relive the mission: ${script.title}`} data-testid="relive-root" data-kind={exp ? 'expedition' : 'relive'} data-status={S.status} data-phase={S.phaseId ?? ''}>
      <ReliveScene scriptId={script.id} />

      <header className="relive-top glass">
        <div className="relive-title">
          <span className="eyebrow">{eyebrow}</span>
          <b data-testid="relive-phase">{phase.title}</b>
          <span className="muted small">{phase.summary}</span>
        </div>
        <div className="relive-clock" data-testid="relive-clock">
          <b>{formatClock(script.clock, S.t)}</b>
          <span>{formatUtc(script.epochMs + S.t * 1000)}</span>
          <span className="rate" title="Time compression of this part of the mission">{formatRate(S.rate * S.speed)}</span>
        </div>
        <div className="relive-actions">
          <button className="btn" onClick={() => { missionAudio.enabled = !sound; setSound(!sound) }} aria-pressed={sound} title="Synthesised sound design (not archival audio)">{sound ? '🔊 Sound' : '🔇 Sound'}</button>
          <button className="btn" onClick={() => setInfo(!info)} aria-pressed={info} data-testid="relive-info">ⓘ How this is built</button>
          {exp ? (
            <>
              <button className="btn relive-exit" onClick={() => relive.finish()} data-testid="expedition-skip" title="Jump to the end of the flight (it still lands)">⏭ {outbound ? (script.dest === 'moon' ? 'Skip to the landing' : 'Skip to the surface') : 'Skip to orbit'} <kbd>Esc</kbd></button>
              {outbound && <button className="btn ghost" onClick={() => expedition.cancel()} data-testid="expedition-cancel">Cancel</button>}
            </>
          ) : (
            <button className="btn relive-exit" onClick={() => relive.close()} data-testid="relive-exit">⟲ Return to explorer</button>
          )}
        </div>
      </header>

      {S.status !== 'intro' && (exp ? <ComputedTelemetry script={script} t={S.t} /> : <Telemetry script={script} t={S.t} />)}
      {S.card && S.status !== 'intro' && S.status !== 'ended' && <EventCard script={script} i={S.card.i} onClose={() => S.set({ card: null })} />}

      {S.status !== 'intro' && (
        <footer className="relive-bottom glass">
          <div className="relive-transport">
            <button className="btn" onClick={() => relive.prevEvent()} title="Previous event (←)" aria-label="Previous event" data-testid="relive-prev">⏮</button>
            <button className="btn play" onClick={() => relive.toggle()} title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'} data-testid="relive-play">{playing ? '⏸' : '▶'}</button>
            <button className="btn" onClick={() => relive.nextEvent()} title="Next event (→)" aria-label="Next event" data-testid="relive-next">⏭</button>
            <button className="btn" onClick={() => relive.setSpeed(SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length])} title="Playback speed (+ / −)" data-testid="relive-speed">{S.speed}×</button>
            <span className="muted small relive-phase-note">{script.phases.indexOf(phase) + 1} / {script.phases.length} · {phase.title}</span>
          </div>
          <Timeline script={script} u={S.u} L={S.length} />
        </footer>
      )}

      {S.status === 'intro' && (
        <div className="relive-intro glass" data-testid="relive-intro">
          <span className="eyebrow">RELIVE THE MISSION</span>
          <h2>{script.title}</h2>
          <p className="sub">{script.subtitle}</p>
          <p>
            The mission from the first engine start to its last milestone, on the clock NASA published. Every event carries its source; times that
            were not published are marked ≈, and anything drawn without a source is listed under “How this is built”.
          </p>
          <p className="muted small">{script.epochNote}</p>
          <div className="row">
            <button className="btn exp-start-btn big" onClick={() => relive.play()} data-testid="relive-begin" autoFocus>▶ Begin</button>
            {S.resumeU !== null && <button className="btn big" onClick={() => relive.resume()} data-testid="relive-resume">⏵ Resume where you left off</button>}
            <button className="btn big" onClick={() => setInfo(true)}>ⓘ How this is built</button>
          </div>
          <p className="muted small">Space play/pause · ← → events · + − speed · Esc return to the explorer</p>
        </div>
      )}

      {S.status === 'ended' && !exp && (
        <div className="relive-intro glass" data-testid="relive-ended">
          <span className="eyebrow">MISSION COMPLETE</span>
          <h2>{script.conclusion.title}</h2>
          <p>{script.conclusion.text} <Cite ids={script.conclusion.sources} /></p>
          <div className="row">
            {script.id === 'apollo-11' && <button className="btn exp-start-btn big" onClick={() => goSurface('tranquility-base')} data-testid="relive-to-surface">Walk Tranquility Base (measured terrain)</button>}
            {script.id === 'mer-opportunity' && <button className="btn exp-start-btn big" onClick={() => goSurface('victoria-crater')} data-testid="relive-to-surface">Explore Victoria crater</button>}
            <button className="btn big" onClick={() => { relive.seek(0); relive.play() }}>↺ Watch again</button>
            <button className="btn big" onClick={() => relive.close()}>⟲ Return to explorer</button>
          </div>
        </div>
      )}

      {info && (
        <aside className="relive-info glass" data-testid="relive-info-panel" aria-label="How this is built">
          <header><b>How this is built</b><button className="x" onClick={() => setInfo(false)} aria-label="Close">×</button></header>
          <p>{script.epochNote}</p>
          <h5>Illustrative (drawn without a source)</h5>
          <ul>{script.illustrative.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <h5>Event times</h5>
          <p className="small">
            {script.events.filter((e) => e.basis === 'sourced').length} published · {script.events.filter((e) => e.basis === 'derived').length} derived ·{' '}
            {script.events.filter((e) => e.basis === 'sequence').length} in published order but not timed (≈)
          </p>
          <h5>Sources</h5>
          <ul className="small">{citeGroups(allSources).map((g) => <li key={g.label}><a href={g.url} target="_blank" rel="noreferrer">{g.label}</a> — {g.titles}</li>)}</ul>
          <h5>Phases</h5>
          <ol className="small relive-phase-list">
            {script.phases.map((p) => <li key={p.id}><button className="linkish" onClick={() => relive.seekPhase(p.id)}>{p.title}</button> <span className="muted">{formatClock(script.clock, p.t0)}</span></li>)}
          </ol>
        </aside>
      )}
    </div>
  )
}
