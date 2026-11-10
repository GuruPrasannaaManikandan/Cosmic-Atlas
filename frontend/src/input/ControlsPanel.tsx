import { useEffect, useState } from 'react'
import { input } from './appInput'
import type { Binding, InputMode } from './inputManager'

/**
 * Contextual Controls panel (directive Part 21). It renders the ACTIVE mode's bindings straight from the input
 * manager, so it can only ever list controls that are implemented. The settings are per browser.
 */
const KEY_LABEL: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Escape: 'Esc',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', BracketLeft: '[', BracketRight: ']',
}
export const keyLabel = (code: string) => KEY_LABEL[code] ?? code.replace(/^Key|^Digit/, '')

const MODE_TITLE: Record<InputMode, string> = {
  MAIN_MENU: 'Orbital view',
  SPACECRAFT_FLIGHT: 'Spacecraft flight',
  PLANETARY_EXPLORATION: 'Planetary exploration',
  VEHICLE_EXPLORATION: 'Driving the rover',
  HISTORICAL_REPLAY: 'Historical replay',
  HARDWARE_INSPECTION: 'Hardware inspection',
  UI_INTERACTION: 'Menus',
}

/** group the four move keys and the four look keys into one line each */
function rows(bs: Binding[]): { keys: string; label: string }[] {
  const out: { keys: string; label: string }[] = []
  const move = bs.filter((b) => b.action.startsWith('move'))
  const look = bs.filter((b) => b.action.startsWith('look'))
  if (move.length === 4) out.push({ keys: 'W A S D', label: move.map((b) => b.label).join(' · ') })
  if (look.length === 4) out.push({ keys: '↑ ↓ ← →', label: look[0].label.startsWith('Orbit') ? 'Orbit the view' : 'Turn the camera / view' })
  for (const b of bs) {
    if (b.action.startsWith('move') || b.action.startsWith('look')) continue
    out.push({ keys: [...new Set(b.codes.map(keyLabel))].join(' / '), label: b.label })
  }
  return out
}

export function ControlsPanel({ mode, extra }: { mode?: InputMode; extra?: { keys: string; label: string }[] }) {
  const m = mode ?? input.refresh()
  const [s, setS] = useState(input.settings)
  useEffect(() => setS(input.settings), [])
  const update = (p: Partial<typeof s>) => { input.setSettings(p); setS(input.settings) }
  const list = [...rows(input.bindings(m)), ...(extra ?? [])]
  return (
    <div className="controls-panel" data-mode={m}>
      <h3 className="controls-title">{MODE_TITLE[m]}</h3>
      <dl className="controls-list">
        {list.map((r) => (
          <div key={r.keys + r.label} className="controls-row">
            <dt>{r.keys.split(' / ').map((k) => <kbd key={k}>{k}</kbd>)}</dt>
            <dd>{r.label}</dd>
          </div>
        ))}
      </dl>
      <fieldset className="controls-settings">
        <legend>Camera settings</legend>
        <label>
          Arrow-key turn speed
          <input type="range" min={0.6} max={3.6} step={0.1} value={s.lookSpeed} aria-valuetext={`${s.lookSpeed.toFixed(1)} radians per second`}
            onChange={(e) => update({ lookSpeed: Number(e.target.value) })} />
        </label>
        <label><input type="checkbox" checked={s.invertY} onChange={(e) => update({ invertY: e.target.checked })} /> Invert up / down</label>
        <label><input type="checkbox" checked={s.mouseLook} onChange={(e) => update({ mouseLook: e.target.checked })} /> Mouse look (drag or click to capture)</label>
      </fieldset>
    </div>
  )
}
