import { useEffect, useRef } from 'react'
import { citeGroups } from '../missions'
import { useGuide } from './guide'
import { useNarrator } from './narrator'
import { bubbleAnchor } from './SurfaceScene'
import { SpokenText } from './DiscoveryPanel'

const KIND_LABEL = { approach: 'Guide', discover: 'Guide', inspect: 'Guide', story: 'Guide · story', hint: 'Guide' }

/**
 * The astronaut guide's speech bubble. The scene pins it above the astronaut's helmet every frame; when the astronaut
 * is off-screen or in first-person view it docks at the bottom of the screen (like a helmet radio caption).
 * Story lines show the word being spoken/read; every factual line shows its catalogue sources.
 */
export function GuideBubble() {
  const line = useGuide((s) => s.line)
  const charIdx = useNarrator((s) => s.charIdx)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bubbleAnchor.el = ref.current
    return () => {
      bubbleAnchor.el = null
    }
  })
  if (!line) return null
  return (
    <div ref={ref} className={`guide-bubble kind-${line.kind}`} data-docked="true" data-testid="guide-bubble" role="status" aria-live="polite">
      <span className="guide-who">🧑‍🚀 {KIND_LABEL[line.kind]}</span>
      <p className="guide-text">{line.kind === 'story' ? <SpokenText text={line.text} charIdx={charIdx} /> : line.text}</p>
      {line.sources.length > 0 && (
        <span className="guide-src">
          {citeGroups(line.sources).map((g) => (
            <a key={g.label} href={g.url} target="_blank" rel="noreferrer" title={g.titles}>
              {g.label}
              {g.count > 1 ? ` ×${g.count}` : ''}
            </a>
          ))}
        </span>
      )}
    </div>
  )
}
