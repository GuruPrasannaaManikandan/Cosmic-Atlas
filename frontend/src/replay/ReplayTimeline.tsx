import { useEffect, useRef } from 'react'
import { citeGroups } from '../missions'
import type { ReplayDef } from './replay'
import './replay.css'

const ICON: Record<string, string> = {
  launch: '🚀', flyby: '↷', arrival: '◎', 'orbit-insertion': '◌', landing: '⬇', 'surface-op': '⛭', release: '⇣', 'last-contact': '📡', end: '■', other: '•',
}

/** the mission's dated events; SHOWN ones jump the 3-D replay, TOLD ones explain where and why they are not shown */
export function ReplayTimeline({ def, selected, onSelect, extra }: { def: ReplayDef; selected: number | null; onSelect: (i: number) => void; extra?: (i: number) => React.ReactNode }) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (selected !== null) list.current?.querySelector(`[data-i="${selected}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])
  return (
    <aside className="replay-timeline glass" aria-label="Mission timeline">
      <h3>Mission timeline</h3>
      <ol ref={list}>
        {def.events.map((e, i) => (
          <li key={i} data-i={i} className={(selected === i ? 'on ' : '') + (e.shown ? 'shown' : 'told')}>
            <button className="replay-ev" onClick={() => onSelect(i)} aria-pressed={selected === i}>
              <span className="replay-ev-icon" aria-hidden>{ICON[e.kind] ?? '•'}</span>
              <span className="replay-ev-main">
                <time>{e.date.replace('T', ' ').replace('Z', ' UT')}{e.sol !== undefined ? ` · sol ${e.approxDate ? '≈' : ''}${e.sol}` : ''}</time>
                <b>{e.title}</b>
              </span>
              <span className={'replay-ev-tag ' + (e.shown ? 'ok' : '')}>{e.shown ? 'SHOWN' : 'TOLD'}</span>
            </button>
            {selected === i && (
              <div className="replay-ev-body">
                <p>
                  {e.description}{' '}
                  <span className="cite">
                    {citeGroups(e.sources).map((g) => (
                      <a key={g.label} href={g.url} target="_blank" rel="noreferrer" title={g.titles}>[{g.label}]</a>
                    ))}
                  </span>
                </p>
                <p className="muted small">{e.how}</p>
                {extra?.(i)}
              </div>
            )}
          </li>
        ))}
      </ol>
    </aside>
  )
}
