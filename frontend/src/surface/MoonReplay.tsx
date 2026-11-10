import { useEffect, useMemo, useRef, useState } from 'react'
import { useSurface, surfaceControl, type SurfacePose } from './surfaceState'
import { useStore } from '../store/store'
import { input } from '../input/appInput'
import { replayFor, replayState, type ReplayDef } from '../replay/replay'
import { ReplayTimeline } from '../replay/ReplayTimeline'
import { VALID_FROM, VALID_TO } from '../astro/ephemeris'

/** save the present-day exploration state (astronaut, camera, clock, open record), then replay the landing */
export function beginMoonReplay(objectId: string) {
  const S = useSurface.getState()
  const pose = surfaceControl.snapshot?.()
  if (!pose) return
  const def = replayFor(objectId)
  replayState.saved = {
    savedAt: Date.now(),
    bodyId: 'moon',
    siteId: S.siteId!,
    objectId,
    panelTab: S.panel?.tab ?? null,
    component: S.component,
    simMs: useStore.getState().simMs,
    pose: pose as unknown as Record<string, unknown>,
  }
  S.set({ replay: { objectId }, panel: null, component: null, banner: null })
  // the Sun at the moment of landing (only within the ephemeris range), then the descent onto the LM position
  const landing = def?.events.find((e) => e.kind === 'landing')
  if (landing && landing.ms >= VALID_FROM && landing.ms <= VALID_TO) useStore.getState().setSim(landing.ms)
  surfaceControl.replayDescent?.()
}

function goBackToPresent() {
  const saved = replayState.saved
  const S = useSurface.getState()
  if (saved && surfaceControl.restore) {
    surfaceControl.restore(saved.pose as unknown as SurfacePose)
    useStore.getState().setSim(saved.simMs)
    replayState.lastRestore = { at: Date.now(), pose: (surfaceControl.snapshot?.() ?? null) as Record<string, unknown> | null, snapshot: saved }
  }
  S.set({ replay: null, panel: saved?.panelTab ? { objectId: saved.objectId, tab: saved.panelTab as never } : null, component: saved?.component ?? null })
}

export function MoonReplay() {
  const objectId = useSurface((s) => s.replay!.objectId)
  const def = useMemo(() => replayFor(objectId) as ReplayDef, [objectId])
  const landingIdx = def.events.findIndex((e) => e.kind === 'landing')
  const [selected, setSelected] = useState<number | null>(landingIdx >= 0 ? landingIdx : null)
  const selRef = useRef(selected)
  const simMs = useStore((s) => s.simMs)

  const select = (i: number) => {
    selRef.current = i
    setSelected(i)
    const e = def.events[i]
    if (e.kind === 'landing') {
      if (e.ms >= VALID_FROM && e.ms <= VALID_TO) useStore.getState().setSim(e.ms)
      surfaceControl.replayDescent?.()
    }
  }

  useEffect(() => {
    const offs = [
      input.on('nextEvent', () => select(Math.min(def.events.length - 1, (selRef.current ?? -1) + 1)), 'HISTORICAL_REPLAY'),
      input.on('prevEvent', () => select(Math.max(0, (selRef.current ?? 1) - 1)), 'HISTORICAL_REPLAY'),
      input.on('back', () => goBackToPresent(), 'HISTORICAL_REPLAY'),
    ]
    return () => offs.forEach((f) => f())
  }, [def]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="replay-root" data-testid="replay-root" role="region" aria-label="Historical replay">
      <header className="replay-top glass">
        <div>
          <span className="eyebrow replay-eyebrow">⏪ HISTORICAL REPLAY · RELIVING THE MISSION</span>
          <b className="replay-title">{def.title}</b>
          <span className="replay-when mono" data-testid="replay-when">{new Date(simMs).toISOString().slice(0, 16).replace('T', ' ')} UTC · the Sun and shadows of that moment</span>
        </div>
        <button className="btn big replay-back" data-testid="go-back-to-present" onClick={goBackToPresent}>
          ⏩ GO BACK TO PRESENT <kbd>Esc</kbd>
        </button>
      </header>
      <ReplayTimeline
        def={def}
        selected={selected}
        onSelect={select}
        extra={(i) => {
          const e = def.events[i]
          const inRange = e.ms >= VALID_FROM && e.ms <= VALID_TO
          return (
            <div className="replay-ev-actions">
              {e.kind === 'landing' && <button className="btn small" onClick={() => select(i)}>▶ Replay the descent</button>}
              {e.kind !== 'landing' && e.kind !== 'launch' && inRange && (
                <button className="btn ghost small" onClick={() => useStore.getState().setSim(e.ms)} title="Moves the simulation clock: the Sun and shadows here change to that moment">
                  ☀ Set the clock to this moment
                </button>
              )}
            </div>
          )
        }}
      />
      <footer className="replay-bottom glass">
        <p className="muted small replay-note">{def.sceneNote} Arrow keys turn the camera; <kbd>[</kbd> <kbd>]</kbd> step through events.</p>
      </footer>
    </div>
  )
}
