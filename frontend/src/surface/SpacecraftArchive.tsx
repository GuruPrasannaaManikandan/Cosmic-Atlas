import { Component, ReactNode, Suspense, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { NASA_MODELS, NASA_MODEL_BY_ID } from './models/nasaModels'
import { NasaModel, ProcessedModel } from './models/NasaModel'
import { OBJECT_BY_ID, MISSION_BY_ID, SOURCES } from '../missions'

class ModelBoundary extends Component<{ children: ReactNode; onError: (e: string) => void }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() {
    return { err: true }
  }
  componentDidCatch(e: Error) {
    this.props.onError(e.message)
  }
  render() {
    return this.state.err ? null : this.props.children
  }
}

/** 1.8 m human silhouette for scale */
function Person() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.8, 0]}>
        <capsuleGeometry args={[0.2, 1.2, 4, 10]} />
        <meshStandardMaterial color="#5c7094" roughness={0.8} />
      </mesh>
    </group>
  )
}

/** frame each model by its measured size so small (Ingenuity) and large (InSight) models both fill the view */
function FitCamera({ m }: { m: ProcessedModel | null }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update(): void } | null }
  useEffect(() => {
    if (!m) return
    const s = Math.max(m.measured.width, m.measured.length, m.measured.height, 1.9)
    const d = s * 1.55
    camera.position.set(d * 0.62, Math.max(1.2, s * 0.55), d * 0.82)
    camera.near = Math.max(0.01, s / 200)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(0, m.measured.height / 2, 0)
      controls.update()
    }
  }, [m, camera, controls])
  return null
}

function Viewer({ id, onReady, onError }: { id: string; onReady: (m: ProcessedModel) => void; onError: (e: string) => void }) {
  const [m, setM] = useState<ProcessedModel | null>(null)
  const size = m ? Math.max(m.measured.width, m.measured.length, m.measured.height) : 3
  return (
    <Canvas shadows camera={{ fov: 40, position: [6, 4, 8], near: 0.05, far: 500 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }} data-testid="archive-canvas">
      <color attach="background" args={['#070b14']} />
      <hemisphereLight args={['#c9d6f2', '#2a2622', 0.9]} />
      <directionalLight position={[6, 10, 5]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <gridHelper args={[20, 20, '#2b4a77', '#17263f']} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.35} />
      </mesh>
      <group position={[-(size / 2 + 0.8), 0, 0]}>
        <Person />
      </group>
      <ModelBoundary key={id} onError={onError}>
        <Suspense fallback={null}>
          <NasaModel
            id={id}
            onReady={(pm) => {
              setM(pm)
              onReady(pm)
            }}
          />
        </Suspense>
      </ModelBoundary>
      <OrbitControls makeDefault minDistance={0.5} maxDistance={40} />
      <FitCamera m={m} />
    </Canvas>
  )
}

export default function SpacecraftArchive({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState(NASA_MODELS[0].id)
  const [res, setRes] = useState<Record<string, ProcessedModel>>({})
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const spec = NASA_MODEL_BY_ID[id]
  const r = res[id]
  const obj = spec.objectId ? OBJECT_BY_ID[spec.objectId] : null
  const mission = obj ? MISSION_BY_ID[obj.missionId] : null
  return (
    <div className="modal-backdrop archive-backdrop" onClick={onClose}>
      <div className="archive glass" role="dialog" aria-label="Spacecraft archive" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">SPACECRAFT ARCHIVE · OFFICIAL NASA 3D MODELS</span>
            <h2>{spec.title}</h2>
          </div>
          <button className="discovery-close" onClick={onClose} aria-label="Close archive">✕</button>
        </header>
        <div className="archive-body">
          <nav className="archive-list" aria-label="Models">
            {NASA_MODELS.map((m) => (
              <button key={m.id} className={m.id === id ? 'on' : ''} onClick={() => { setErr(null); setId(m.id) }} aria-pressed={m.id === id}>
                {m.title}
                {!m.builtBy.startsWith('NASA') && <em className="non-nasa"> · {m.builtBy.split(' ')[0]}</em>}
              </button>
            ))}
          </nav>
          <div className="archive-view">
            <Viewer id={id} onReady={(pm) => setRes((x) => ({ ...x, [pm.spec.id]: pm }))} onError={setErr} />
            {!r && !err && <div className="archive-loading">Loading model…</div>}
            {err && <div className="archive-loading err">Could not load this model: {err}</div>}
            <span className="archive-scale muted small">Grid: 1 m · figure: 1.8 m person</span>
          </div>
          <aside className="archive-info">
            {obj && (
              <p>
                <b>{obj.name}</b>
                <br />
                <span className="muted">{mission?.name} · built by {String(obj.builtBy)}</span>
              </p>
            )}
            {r && (
              <>
                <h3>Measured on the loaded model</h3>
                <p className="mono small">
                  {r.measured.width.toFixed(2)} × {r.measured.length.toFixed(2)} × {r.measured.height.toFixed(2)} m (W × L × H) · {r.triangles.toLocaleString()} triangles
                  {r.removedMeshes > 0 && ` · ${r.removedMeshes} ascent-stage meshes removed`}
                </p>
                <h3>Validation against sourced dimensions</h3>
                {r.checks.length === 0 ? (
                  <p className="muted small">No independent sourced dimension yet — {spec.calibration.kind === 'native' ? 'shown at the model\'s native metric scale' : 'scale comes from the calibration below'}.</p>
                ) : (
                  <table className="archive-checks">
                    <tbody>
                      {r.checks.map((c) => (
                        <tr key={c.label} className={c.pass ? 'ok' : 'warn'}>
                          <td>{c.label}</td>
                          <td className="mono">{c.measuredM.toFixed(2)} m</td>
                          <td className="mono">vs {c.expectedM} m</td>
                          <td className="mono">{(c.deviation * 100).toFixed(1)}%</td>
                          <td>{c.pass ? 'PASS' : 'DEVIATES'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {r.checks.map((c) => c.note && <p key={c.label} className="muted small">{c.note}</p>)}
              </>
            )}
            {spec.pose && (
              <>
                <h3>Pose</h3>
                <p className="small">{spec.pose.note}</p>
              </>
            )}
            <h3>Scale</h3>
            <p className="small">
              {spec.calibration.note}
              {spec.calibration.kind !== 'native' && <> Source: <a href={SOURCES[spec.calibration.source]?.url} target="_blank" rel="noreferrer">{SOURCES[spec.calibration.source]?.organisation}</a>.</>}
            </p>
            <h3>Provenance</h3>
            <p className="small">
              <a href={spec.repoPath} target="_blank" rel="noreferrer">NASA 3D Resources</a> — "free and without copyright". File {spec.file.split('/').pop()} ({(spec.bytes / 1e6).toFixed(2)} MB), SHA-256 <span className="mono">{spec.sha256.slice(0, 16)}…</span>
            </p>
            <h3>Visual fidelity</h3>
            <p className={'small fidelity ' + spec.fidelity}>
              <b>{spec.fidelity === 'high' ? 'High — recognisably faithful' : spec.fidelity === 'medium' ? 'Medium — stylised' : 'Low — placeholder-grade, not a faithful reconstruction'}</b>
            </p>
            <p className="muted small">{spec.notes}</p>
          </aside>
        </div>
      </div>
    </div>
  )
}
