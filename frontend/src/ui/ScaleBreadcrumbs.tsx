import { useStore } from '../store/store'
import { nav, referenceFrameLabel, exampleScaleLabel } from '../store/nav'
import { initiateTravel } from '../travel/travelEngine'
import { BY_ID } from '../data/catalog'
import { len, sub, SUN_POS } from '../astro/coords'

export function ScaleBreadcrumbs() {
  const selectedId = useStore((s) => s.selectedId)
  const simMs = useStore((s) => s.simMs)
  const phase = useStore((s) => s.phase)

  if (phase === 'intro' || phase === 'travel') return null

  // Compute hierarchical path
  const crumbs: { label: string; id?: string; action?: () => void }[] = [
    {
      label: 'Cosmic Web',
      action: () => initiateTravel('laniakea', simMs, { viewDistanceLy: 1.5e8 }),
    },
  ]

  const dSun = len(sub(nav.pos, SUN_POS))
  const dGc = len(nav.pos)
  const selObj = selectedId ? BY_ID[selectedId] : null

  // Check if inside or targeting Laniakea / Milky Way / Solar System
  if (dGc < 2e7 || (selObj && (selObj.category === 'galaxy' || selObj.category === 'star' || selObj.category === 'planet' || selObj.memberOf.includes('laniakea') || selObj.id === 'milky-way'))) {
    crumbs.push({
      label: 'Laniakea',
      action: () => initiateTravel('laniakea', simMs, { viewDistanceLy: 4e6 }),
    })
  }

  if (dGc < 100000 || (selObj && (selObj.category === 'star' || selObj.category === 'planet' || selObj.category === 'moon' || selObj.memberOf.includes('milky-way') || selObj.id === 'milky-way'))) {
    crumbs.push({
      label: 'Milky Way',
      action: () => initiateTravel('milky-way', simMs, { viewDistanceLy: 45000 }),
    })
  }

  if (dSun < 0.05 || (selObj && (selObj.category === 'planet' || selObj.category === 'moon' || selObj.id === 'sun'))) {
    crumbs.push({
      label: 'Solar System',
      action: () => initiateTravel('sun', simMs, { viewDistanceLy: 0.003 }),
    })
  }

  if (selObj && selObj.id !== 'sun' && selObj.id !== 'milky-way' && selObj.id !== 'laniakea') {
    crumbs.push({
      label: selObj.name,
      action: () => initiateTravel(selObj.id, simMs),
    })
  }

  const frameStr = referenceFrameLabel()
  const scaleStr = exampleScaleLabel()

  return (
    <div className="scale-breadcrumbs-bar glass" aria-label="Cosmic Scale Hierarchy Breadcrumbs">
      <div className="breadcrumbs-list">
        <span className="crumb-root-icon">✦</span>
        {crumbs.map((c, i) => (
          <span key={i} className="crumb-item">
            {i > 0 && <span className="crumb-separator">›</span>}
            <button
              className={`crumb-btn ${i === crumbs.length - 1 ? 'active' : ''}`}
              onClick={c.action}
              title={`Navigate camera to ${c.label}`}
            >
              {c.label}
            </button>
          </span>
        ))}
      </div>

      <div className="breadcrumbs-telemetry">
        <span className="scale-badge-pill">{scaleStr.toUpperCase()}</span>
        <span className="frame-badge-pill">{frameStr}</span>
      </div>
    </div>
  )
}
