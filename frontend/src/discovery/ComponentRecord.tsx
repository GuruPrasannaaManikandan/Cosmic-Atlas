/**
 * The record of one discoverable part (instrument, camera, power, mobility...): every statement with its sources.
 * Shown while the 3-D view frames the part (or, when the model does not separate it yet, the whole vehicle — said so).
 * Selecting a part counts as inspecting it; keeping its record open for 5 s completes it.
 */
import { useEffect, useRef } from 'react'
import { SOURCES, type Component, type PartPlacement } from '../missions'
import { useDiscovery, partKey } from './progress'
import { CATEGORY_LABEL } from './labels'
import './discovery.css'

const PLACEMENT_TEXT: Record<PartPlacement, string> = {
  'model-part': 'A separate piece of the model: the view frames and highlights it.',
  'model-region': 'Part of a larger piece of the model: the view frames that region.',
  inside: 'Housed inside the body, not visible from outside: the view frames the body.',
  'not-modelled': 'Not yet a separate piece of this model: the view frames the whole vehicle (component regions on the model are the next milestone).',
}

function Cites({ ids }: { ids: string[] }) {
  const ok = ids.filter((i) => SOURCES[i])
  if (!ok.length) return null
  return (
    <sup className="cr-cite">
      {ok.map((i, k) => (
        <a key={i} href={SOURCES[i].url} target="_blank" rel="noreferrer" title={`${SOURCES[i].title} — ${SOURCES[i].organisation}`}>[{k + 1}]</a>
      ))}
    </sup>
  )
}

export function ComponentRecord({ siteId, objectId, comp, framed }: { siteId: string | null; objectId: string; comp: Component; framed?: boolean }) {
  useEffect(() => {
    if (!siteId) return
    const k = partKey(objectId, comp.id)
    useDiscovery.getState().mark(siteId, k, 3)
    const t = window.setTimeout(() => useDiscovery.getState().mark(siteId, k, 4), 5000)
    return () => window.clearTimeout(t)
  }, [siteId, objectId, comp.id])
  // the record opens below the list of parts: bring it into view when a part is picked
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [comp.id])
  const allSources = [...new Set([...comp.sources, ...(comp.location?.sources ?? []), ...(comp.howItWorks?.sources ?? []), ...(comp.measures?.sources ?? []), ...(comp.specs ?? []).flatMap((s) => s.sources), ...(comp.findings ?? []).flatMap((f) => f.sources)])].filter((s) => SOURCES[s])
  const placement = comp.placement ?? 'not-modelled'
  return (
    <section ref={ref} className="component-record" data-testid="component-record" data-component={comp.id} aria-label={`${comp.name} record`}>
      <header>
        {comp.category && <span className="cr-chip">{CATEGORY_LABEL[comp.category]}</span>}
        <h3>{comp.name}</h3>
        {comp.fullName && comp.fullName !== comp.name && <p className="cr-full">{comp.fullName}</p>}
      </header>
      <p>{comp.description} <Cites ids={comp.sources} /></p>
      {comp.location && <p><b>Where:</b> {comp.location.text} <Cites ids={comp.location.sources} /></p>}
      {comp.howItWorks && <p><b>How it works:</b> {comp.howItWorks.text} <Cites ids={comp.howItWorks.sources} /></p>}
      {comp.measures && <p><b>Measures:</b> {comp.measures.text} <Cites ids={comp.measures.sources} /></p>}
      {comp.specs && comp.specs.length > 0 && (
        <dl className="cr-specs">
          {comp.specs.map((s) => (
            <div key={s.label}><dt>{s.label}</dt><dd>{s.value} <Cites ids={s.sources} /></dd></div>
          ))}
        </dl>
      )}
      {comp.findings && comp.findings.length > 0 && (
        <>
          <h4>Findings and events</h4>
          <ul className="cr-findings">{comp.findings.map((f) => <li key={f.text}>{f.text} <Cites ids={f.sources} /></li>)}</ul>
        </>
      )}
      {comp.placement && (
        <p className="cr-3d muted small" data-placement={placement}><b>In the 3-D view:</b> {framed === false && placement !== 'inside' ? 'This model does not have this part as a separate piece yet: the view frames the whole vehicle.' : PLACEMENT_TEXT[placement]}</p>
      )}
      {allSources.length > 0 ? (
        <ol className="cr-sources">{allSources.map((s) => <li key={s}><a href={SOURCES[s].url} target="_blank" rel="noreferrer">{SOURCES[s].title}</a> <span className="muted small">— {SOURCES[s].organisation}</span></li>)}</ol>
      ) : (
        <p className="muted small">No source read yet describes this part; nothing beyond its name is shown.</p>
      )}
    </section>
  )
}
