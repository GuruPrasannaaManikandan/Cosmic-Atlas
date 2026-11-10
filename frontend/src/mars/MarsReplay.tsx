import { useEffect, useMemo, useRef, useState } from 'react'
import { useSurface } from '../surface/surfaceState'
import { useStore } from '../store/store'
import { input } from '../input/appInput'
import { send, onMars, type MarsPose, type MarsReady } from './marsBridge'
import { replayFor, replayState, type ReplayDef } from '../replay/replay'
import { ReplayTimeline } from '../replay/ReplayTimeline'

/** save the present-day exploration state, then hand the scene to the replay */
export function beginMarsReplay(objectId: string, ready: MarsReady, pose: MarsPose | null) {
  const S = useSurface.getState()
  if (!pose) return
  replayState.saved = {
    savedAt: Date.now(),
    bodyId: 'mars',
    siteId: S.siteId!,
    objectId,
    panelTab: S.panel?.tab ?? null,
    component: S.component,
    simMs: useStore.getState().simMs,
    pose: { x: pose.x, z: pose.z, heading: pose.heading, camYawOffset: pose.camYawOffset, camPitch: pose.camPitch, camDist: pose.camDist },
  }
  S.set({ replay: { objectId }, panel: null, component: null, banner: null })
  send('ReplayStart', String(ready.route.firstSol))
}

/** "Go back to present": end the replay and restore the saved exploration state exactly (not the landing point) */
function goBackToPresent() {
  const saved = replayState.saved
  const S = useSurface.getState()
  if (!saved) return S.set({ replay: null })
  const off = onMars((kind, data) => {
    if (kind !== 'restored') return
    off()
    replayState.lastRestore = { at: Date.now(), pose: data, snapshot: saved }
  })
  send('ReplayEnd')
  send('RestoreState', JSON.stringify(saved.pose))
  S.set({ replay: null, panel: saved.panelTab ? { objectId: saved.objectId, tab: saved.panelTab as never } : null, component: saved.component })
}

const RATES = [1, 4, 15, 40]

export function MarsReplay({ ready, pose }: { ready: MarsReady; pose: MarsPose | null }) {
  const objectId = useSurface((s) => s.replay!.objectId)
  const def = useMemo(() => replayFor(objectId, { solRange: [ready.route.firstSol, ready.route.lastSol] }) as ReplayDef, [objectId, ready])
  const [lo, hi] = def.solRange!
  const [sol, setSol] = useState(lo)
  const [playing, setPlaying] = useState(true)
  const [rate, setRate] = useState(15)
  const [selected, setSelected] = useState<number | null>(null)
  const solRef = useRef(lo)
  const lastSend = useRef(0)

  const seek = (s: number) => {
    solRef.current = Math.max(lo, Math.min(hi + 0.999, s))
    setSol(solRef.current)
    send('ReplaySol', solRef.current.toFixed(3))
  }

  // the replay clock (React owns it; Unity follows)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let t = performance.now()
    let ui = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - t) / 1000)
      t = now
      solRef.current += rate * dt
      if (solRef.current >= hi + 0.999) {
        solRef.current = hi + 0.999
        setPlaying(false)
      }
      if (now - lastSend.current > 33) {
        lastSend.current = now
        send('ReplaySol', solRef.current.toFixed(3))
      }
      if (now - ui > 100) {
        ui = now
        setSol(solRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, rate, hi])

  const shownEvents = def.events.map((e, i) => ({ e, i })).filter(({ e }) => e.shown && e.sol !== undefined)
  const selRef = useRef<number | null>(null)
  const jumpTo = (i: number) => {
    selRef.current = i
    setSelected(i)
    const e = def.events[i]
    if (e.shown && e.sol !== undefined) {
      setPlaying(false)
      seek(e.sol)
    }
  }

  useEffect(() => {
    const offs = [
      input.on('playPause', () => setPlaying((p) => !p), 'HISTORICAL_REPLAY'),
      input.on('nextEvent', () => jumpTo(Math.min(def.events.length - 1, (selRef.current ?? -1) + 1)), 'HISTORICAL_REPLAY'),
      input.on('prevEvent', () => jumpTo(Math.max(0, (selRef.current ?? 1) - 1)), 'HISTORICAL_REPLAY'),
      input.on('back', () => goBackToPresent(), 'HISTORICAL_REPLAY'),
    ]
    return () => offs.forEach((f) => f())
  }, [def]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (s: number) => ((s - lo) / (hi + 1 - lo)) * 100

  return (
    <div className="replay-root" data-testid="replay-root" role="region" aria-label="Historical replay">
      <header className="replay-top glass">
        <div>
          <span className="eyebrow replay-eyebrow">⏪ HISTORICAL REPLAY · RELIVING THE MISSION</span>
          <b className="replay-title">{def.title}</b>
          <span className="replay-when mono" data-testid="replay-when">
            sol {Math.floor(sol)} · {pose?.utc ? new Date(pose.utc).toUTCString().slice(5, 16) : '…'} (Earth date, UTC)
          </span>
        </div>
        <button className="btn big replay-back" data-testid="go-back-to-present" onClick={goBackToPresent}>
          ⏩ GO BACK TO PRESENT <kbd>Esc</kbd>
        </button>
      </header>
      <ReplayTimeline def={def} selected={selected} onSelect={jumpTo} />
      <footer className="replay-bottom glass">
        <div className="replay-controls">
          <button className="btn" onClick={() => (sol >= hi + 0.99 ? (seek(lo), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚ Pause' : '▶ Play'} <kbd>Space</kbd>
          </button>
          <label className="small">
            Speed{' '}
            <select value={rate} onChange={(e) => setRate(+e.target.value)} aria-label="Replay speed">
              {RATES.map((r) => (
                <option key={r} value={r}>{r} sol/s</option>
              ))}
            </select>
          </label>
          <span className="muted small">Sol {lo} → {hi} · {ready.route.points.toLocaleString('en-US')} recorded drive points</span>
        </div>
        <div className="replay-scrub">
          <input
            type="range"
            min={lo}
            max={hi + 0.999}
            step={0.01}
            value={sol}
            onChange={(e) => {
              setPlaying(false)
              seek(+e.target.value)
            }}
            aria-label="Mission sol"
            data-testid="replay-scrubber"
          />
          {shownEvents.map(({ e, i }) => (
            <button key={i} className={'replay-mark' + (selected === i ? ' on' : '')} style={{ left: `${Math.max(0, Math.min(100, pct(e.sol!)))}%` }} onClick={() => jumpTo(i)} title={`${e.title} (sol ${e.sol}${e.approxDate ? ', month-only date' : ''})`} aria-label={e.title} />
          ))}
        </div>
        <p className="muted small replay-note">{def.sceneNote}</p>
      </footer>
    </div>
  )
}
