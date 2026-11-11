/**
 * E3: the arrival panel shared by every Mars scene — the conceptual THEIA carrier lands on the measured terrain, opens its
 * ramp and THEIA drives out. The phase comes from the Unity player (pose.arrivalPhase); Esc / Skip ends in the same
 * landed state (never a cut that leaves THEIA inside).
 */
import type { MarsPose, MarsReady } from './marsBridge'

const PHASES: { id: string; label: string; text: string }[] = [
  { id: 'descent', label: 'Powered descent', text: 'The carrier descends on its engines toward a flat patch clear of the historical hardware.' },
  { id: 'touchdown', label: 'Touchdown', text: 'Footpads on the measured terrain; engines off.' },
  { id: 'door', label: 'Ramp opening', text: 'The rear door lowers into a ramp to the ground.' },
  { id: 'deploy', label: 'THEIA drives out', text: 'THEIA rolls down the ramp onto Mars. You take the controls next.' },
]

export function TheiaArrival({ siteName, latLonText, pose, ready, onSkip }: { siteName: string; latLonText: string; pose: MarsPose | null; ready: MarsReady | null; onSkip: () => void }) {
  const phase = pose?.arrivalPhase || 'descent'
  const k = Math.max(0, PHASES.findIndex((p) => p.id === phase))
  const pick = ready?.carrier?.pick
  return (
    <div className="surf-intro mars-arrival theia-arrival" role="status" aria-live="polite" data-testid="theia-arrival" data-phase={phase}>
      <span className="eyebrow">ARRIVAL · {PHASES[k].label.toUpperCase()}</span>
      <b>{siteName}</b>
      <span className="muted small">{latLonText} · Mars</span>
      <ol className="theia-steps" aria-label="Landing sequence">
        {PHASES.map((p, i) => (
          <li key={p.id} className={i < k ? 'done' : i === k ? 'on' : ''}>{p.label}</li>
        ))}
      </ol>
      <span className="small">{PHASES[k].text}</span>
      <span className="muted small mars-honest">
        The THEIA carrier and the THEIA rover are CONCEPTUAL vehicles, not historical or NASA hardware. Landing spot chosen automatically
        {pick ? ` (${pick.valid} flat, clear candidates of ${pick.tested}; ground relief under the footpads ${pick.footprintReliefM.toFixed(2)} m)` : ''}.
      </span>
      <button className="btn ghost small" onClick={onSkip}>Skip <kbd>Esc</kbd></button>
    </div>
  )
}
