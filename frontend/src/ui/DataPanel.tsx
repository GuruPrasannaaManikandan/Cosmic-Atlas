import { useState, useRef } from 'react'
import { api, IngestResult, DataRecord } from './api'
import { useStore } from '../store/store'
import { raDecDistToRoot } from '../astro/coords'

const FIELDS = [
  '',
  'id',
  'name',
  'alt_names',
  'object_type',
  'parent',
  'ra',
  'dec',
  'distance',
  'distance_unit',
  'distance_err',
  'redshift',
  'parallax_mas',
  'glon',
  'glat',
  'x',
  'y',
  'z',
  'magnitude',
  'angular_size',
  'epoch',
  'source_catalogue',
]

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready for 3D',
  approximate: 'Assumption',
  no_distance: 'No Distance',
  non_spatial: 'Non-spatial / Malformed',
}

const SAMPLE_CSV = `Object Designation,RA (hms),Declination,Dist_pc,redshift,Kind,Notes
Sirius,06 45 08.9,-16 42 58,2.64,,star,brightest star
Vega,18 36 56.3,+38 47 01,7.68,,star,
Polaris,02 31 49.1,+89 15 51,133,,star,
Deneb,20 41 25.9,+45 16 49,802,,star,large distance uncertainty
M 31,00 42 44.3,+41 16 09,778000,,galaxy,exact alias of bundled object
Andromeda Galaxi,00 42 44.3,+41 16 09,,,galaxy,typo - must not be merged
NGC 4486,12 30 49.4,+12 23 28,,0.00428,galaxy,M87 - redshift only
3C 273,12 29 06.7,+02 03 09,,0.158,quasar,cosmological distance assumption
Mystery source,14 15 39.7,+19 10 57,,,unknown,sky position only - no distance
Bad row,25 99 99,+95 00 00,10,,star,invalid coordinates
Vega,18 36 56.3,+38 47 01,7.68,,star,duplicate row
`

function b64(buf: ArrayBuffer): string {
  let s = ''
  const u = new Uint8Array(buf)
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

function strToB64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

export function DataPanel() {
  const [res, setRes] = useState<IngestResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<{ total: number; records: DataRecord[] } | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('row')
  const [sel, setSel] = useState<DataRecord | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const set = useStore((s) => s.set)

  const load = async (id: string, p: { q?: string; status?: string; sort?: string } = {}) => {
    const sp = new URLSearchParams({
      limit: '200',
      q: p.q ?? q,
      status: p.status ?? status,
      sort: p.sort ?? sort,
    })
    const r = await api.records(id, sp)
    if (r.ok && r.data) setRows(r.data)
    else setErr(r.error ?? 'Could not load records')
  }

  const accept = (r: IngestResult) => {
    setRes(r)
    setMapping(Object.fromEntries(r.mapping.map((m) => [m.source, m.field ?? ''])))
    setRows({ total: r.n_rows, records: r.records })
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const r = await api.ingest(f.name, b64(await f.arrayBuffer()))
      setBusy(false)
      if (!r.ok || !r.data) {
        setErr(r.error ?? 'Upload failed')
        return
      }
      accept(r.data)
    } catch (e: unknown) {
      setBusy(false)
      setErr(String(e))
    }
  }

  const loadSample = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const r = await api.ingest('unfamiliar_catalogue.csv', strToB64(SAMPLE_CSV))
      setBusy(false)
      if (!r.ok || !r.data) {
        setErr(r.error ?? 'Sample load failed')
        return
      }
      accept(r.data)
    } catch (e: unknown) {
      setBusy(false)
      setErr(String(e))
    }
  }

  const remap = async () => {
    if (!res) return
    setBusy(true)
    const r = await api.remap(
      res.dataset_id,
      Object.entries(mapping).map(([source, field]) => ({ source, field: field || null }))
    )
    setBusy(false)
    if (!r.ok || !r.data) {
      setErr(r.error ?? 'Remap failed')
      return
    }
    accept(r.data)
  }

  const visualize = async () => {
    if (!res) return
    const r = await api.points(res.dataset_id)
    if (!r.ok || !r.data) {
      setErr(r.error ?? 'No points returned')
      return
    }
    const pts = r.data.points.map((p) => ({
      id: p.id,
      name: p.name,
      pos: raDecDistToRoot(p.ra_deg, p.dec_deg, p.distance_ly),
    }))
    set({ datasetPoints: pts })
    setMsg(
      `Visualizing ${r.data.returned} of ${r.data.total_visualizable} compatible objects as luminous golden coordinates. Objects without verifiable distance are omitted to maintain spatial accuracy.`
    )
  }

  return (
    <aside className="datapanel glass" aria-label="Astro Data Intelligence workspace">
      <div className="dp-head">
        <h3>
          <span>⌬</span> ASTRO DATA INTELLIGENCE
        </h3>
        <button
          className="icon-btn"
          onClick={() => set({ dataOpen: false })}
          title="Close Data Intelligence panel"
          aria-label="Close Data Intelligence panel"
        >
          ✕
        </button>
      </div>

      <p className="muted small" style={{ marginTop: '8px' }}>
        Ingest unfamiliar astronomical datasets with deterministic schema profiling, automated unit conversion, and 4-way visualizability classification.
      </p>

      {/* Drag & Drop Upload Zone */}
      <div
        className={'dropzone' + (isDragOver ? ' active' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          onFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="dropzone-icon">⇪</div>
        <div className="dropzone-title">Click to upload or drag & drop catalogue file</div>
        <div className="dropzone-sub">Supported formats: CSV, TSV, JSON, VOTable (FITS/Parquet if backend packages installed) · Max 40 MB</div>
        <div className="format-chips">
          <span className="format-chip">CSV / TSV</span>
          <span className="format-chip">JSON</span>
          <span className="format-chip">VOTable</span>
          <span className="format-chip">FITS</span>
          <span className="format-chip">Parquet</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,.json,.xml,.vot,.votable,.fits,.parquet"
          style={{ display: 'none' }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <button className="btn" onClick={loadSample} disabled={busy}>
          ✦ Load Sample Dataset (unfamiliar_catalogue.csv)
        </button>
        {busy && <span className="small muted">Processing catalogue…</span>}
      </div>

      {err && (
        <div className="banner glass" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', margin: '10px 0' }}>
          <span>⚠ {err}</span>
        </div>
      )}

      {res && (
        <>
          {/* Summary Card */}
          <div className="summary-card">
            <div className="summary-top">
              <span className="summary-title">{res.filename}</span>
              <span className="pill">{res.format.toUpperCase()} · {res.n_rows} rows</span>
            </div>

            <div className="chips">
              <span className="ready">● {res.summary.ready} Ready for 3D</span>
              <span className="approx">● {res.summary.approximate} Approx / Assumption</span>
              <span className="nodist">● {res.summary.no_distance} No Distance</span>
              <span className="nonsp">● {res.summary.non_spatial} Non-spatial / Malformed</span>
            </div>

            <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '12px', color: 'var(--txt-dim)' }}>
              <span>Bundled matches: <b>{res.summary.matched}</b></span>
              <span>Duplicate rows: <b>{res.summary.duplicates}</b></span>
            </div>

            {res.summary.issues.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {res.summary.issues.map((issue, idx) => (
                  <div key={idx} className="warn small" style={{ margin: '2px 0' }}>
                    ⚠ {issue}
                  </div>
                ))}
              </div>
            )}

            <div className="small muted" style={{ marginTop: '8px', borderTop: '1px solid var(--line-subtle)', paddingTop: '6px' }}>
              {res.profile.reused
                ? `Reused saved column profile: ${res.profile.profile_id}`
                : `Saved reusable column profile: ${res.profile.profile_id ?? 'None'}`}{' '}
              · AI assistance: {res.ai.note}
            </div>
          </div>

          {/* Schema Mapping Workspace */}
          <h4>Proposed Column Mapping (User-Editable)</h4>
          <div className="tablewrap" style={{ maxHeight: '200px' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Source Column</th>
                  <th>Canonical Astronomy Field</th>
                  <th>Confidence</th>
                  <th>Method</th>
                  <th>Conversion / Unit</th>
                </tr>
              </thead>
              <tbody>
                {res.mapping.map((m) => (
                  <tr key={m.source}>
                    <td><b>{m.source}</b></td>
                    <td>
                      <select
                        value={mapping[m.source] ?? ''}
                        onChange={(e) => setMapping({ ...mapping, [m.source]: e.target.value })}
                        style={{ height: '26px', fontSize: '11.5px' }}
                      >
                        {FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {f || '— ignore column —'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={'conf c' + Math.round(m.confidence * 4)}>
                        {Math.round(m.confidence * 100)}%
                      </span>
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--mut)' }}>{m.method}</td>
                    <td className="small muted">{m.conversion ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actions" style={{ marginTop: '10px' }}>
            <button className="btn" onClick={remap} disabled={busy}>
              ↻ Apply Mapping & Re-validate
            </button>
            <button className="btn primary" onClick={visualize} disabled={busy || res.summary.ready + res.summary.approximate === 0}>
              ✦ Visualize Compatible Objects in 3D
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                set({ datasetPoints: [] })
                setMsg(null)
              }}
            >
              Clear 3D Points
            </button>
          </div>

          {msg && <p className="ok small" style={{ marginTop: '6px' }}>{msg}</p>}

          {/* Dataset Explorer Table */}
          <h4>Catalogue Records Explorer</h4>
          <div className="actions" style={{ marginBottom: '8px' }}>
            <input
              placeholder="Search by object name…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                load(res.dataset_id, { q: e.target.value })
              }}
              style={{ flex: '1 1 180px' }}
            />
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                load(res.dataset_id, { status: e.target.value })
              }}
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                load(res.dataset_id, { sort: e.target.value })
              }}
            >
              <option value="row">Sort by Row</option>
              <option value="name">Sort by Name</option>
              <option value="distance">Sort by Distance</option>
              <option value="quality">Sort by Quality</option>
            </select>
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>RA (J2000)</th>
                  <th>Dec (J2000)</th>
                  <th>Dist (ly)</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Identification</th>
                </tr>
              </thead>
              <tbody>
                {rows?.records.map((r) => (
                  <tr
                    key={r.row}
                    onClick={() => setSel(r)}
                    className={sel?.row === r.row ? 'sel' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{r.row}</td>
                    <td><b>{r.name ?? '—'}</b></td>
                    <td>{r.ra_deg != null ? `${r.ra_deg.toFixed(3)}°` : '—'}</td>
                    <td>{r.dec_deg != null ? `${r.dec_deg.toFixed(3)}°` : '—'}</td>
                    <td>
                      {r.distance_ly != null
                        ? Math.round(r.distance_ly).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <span className={'st ' + r.status}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td>{Math.round(r.quality * 100)}%</td>
                    <td>
                      {r.match ? (
                        <span style={{ color: 'var(--ok)' }}>
                          ✓ {r.match.object_id} ({r.match.method})
                        </span>
                      ) : r.candidates.length ? (
                        <span style={{ color: 'var(--warm)' }}>
                          Review: {r.candidates[0].object_id}?
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows && (
            <div className="small muted" style={{ marginTop: '6px' }}>
              Showing {rows.records.length} of {rows.total} matching records (capped at 200)
            </div>
          )}

          {/* Record Inspection Drawer */}
          {sel && (
            <div className="detail">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>Record Inspection: Row {sel.row} ({sel.name ?? 'Unnamed'})</b>
                <span className={'pill ' + (sel.status === 'ready' ? 'dwelling' : sel.status === 'approximate' ? 'paused' : 'bad')}>
                  {STATUS_LABEL[sel.status]}
                </span>
              </div>

              {sel.reasons.length > 0 && (
                <div className="warn small" style={{ margin: '6px 0' }}>
                  <b>Status rationale:</b> {sel.reasons.join('; ')}
                </div>
              )}

              <div className="two" style={{ marginTop: '8px' }}>
                <div>
                  <h5 style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--mut)', textTransform: 'uppercase' }}>
                    Original Source Data
                  </h5>
                  <pre>{JSON.stringify(sel.original, null, 2)}</pre>
                </div>
                <div>
                  <h5 style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--cy)', textTransform: 'uppercase' }}>
                    Normalized Canonical Data
                  </h5>
                  <pre>{JSON.stringify(sel.normalized, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  )
}
