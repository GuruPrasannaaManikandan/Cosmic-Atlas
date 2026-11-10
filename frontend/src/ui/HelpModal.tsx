import { useEffect } from 'react'
import { startTutorial } from '../tutorial/tutorialState'
import { ControlsPanel } from '../input/ControlsPanel'
import '../input/controls.css'

export function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Controls and help">
      <div className="card glass" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Observatory Operations</div>
        <h2>Controls & Navigation Reference</h2>

        <div className="help-grid">
          <div className="help-box">
            <h4>Mouse & Touch Controls</h4>
            <table className="help-table">
              <tbody>
                <tr><td>Left Drag</td><td>Rotate camera (Yaw / Pitch)</td></tr>
                <tr><td>Right Drag / Shift+Drag</td><td>Pan camera along screen plane</td></tr>
                <tr><td>Mouse Wheel</td><td>Dolly (Zoom in / out)</td></tr>
                <tr><td>Double Click</td><td>Direct flight to target landmark</td></tr>
                <tr><td>Touch Drag</td><td>Rotate view</td></tr>
                <tr><td>Pinch</td><td>Zoom / Dolly</td></tr>
              </tbody>
            </table>
          </div>

          <div className="help-box">
            <h4>Keyboard</h4>
            {/* rendered from the input manager's bindings, so it only lists controls that work */}
            <ControlsPanel mode="MAIN_MENU" extra={[{ keys: '/ / Ctrl+K', label: 'Search the universe' }]} />
          </div>
        </div>

        <div className="help-box">
          <h4>Observatory Architecture & Multi-Scale Coordinates</h4>
          <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--txt-dim)', lineHeight: 1.5 }}>
            All bodies exist in a single double-precision Galactic-Centre Cartesian coordinate frame in light-years.
            Camera-relative rendering with dynamic adaptive scale ensures jitter-free visualization from 1 billion light-years down to Earth orbital radius.
          </p>
        </div>

        <div className="help-box" style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
          <h4>🎓 Cosmic Academy Interactive Tutorial</h4>
          <p style={{ margin: '4px 0 10px', fontSize: '13px', color: 'var(--txt-dim)', lineHeight: 1.5 }}>
            Learn the complete observatory systems, 3D attitude controls, scale navigation, astrophysical inspection, and simulation labs in an 8-stage hands-on cadet mission.
          </p>
          <button
            className="btn academy-btn"
            onClick={() => {
              onClose()
              startTutorial(true)
            }}
          >
            Launch Cosmic Academy Tutorial
          </button>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Close Reference
          </button>
        </div>
      </div>
    </div>
  )
}
export default HelpModal
