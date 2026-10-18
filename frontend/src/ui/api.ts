export interface ApiResult<T> { ok: boolean; data?: T; error?: string }

// Same-origin '/api' by default (Vite dev proxy locally, nginx in production). Set VITE_API_BASE at build time only
// when the API lives on a different origin. Build-time public value - never put secrets here.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const r = await fetch(API_BASE + url, init)
    if (!r.ok) {
      let detail = `${r.status} ${r.statusText}`
      try { const j = await r.json(); detail = j.detail ?? detail } catch { /* ignore */ }
      return { ok: false, error: String(detail) }
    }
    return { ok: true, data: (await r.json()) as T }
  } catch (e) {
    const hint = import.meta.env.DEV ? ' Start it with: uvicorn app.main:app --port 8000' : ' Please try again shortly.'
    return { ok: false, error: `Backend unreachable (${(e as Error).message}).${hint}` }
  }
}

export interface SimbadResult { source: string; query: string; main_id: string; ra_deg: number; dec_deg: number; otype: string | null; plx_mas: number | null; z: number | null; distance_ly: number | null; distance_basis: string | null; aliases: string[]; retrieved: string; cached: boolean }
export interface HorizonsResult { source: string; body: string; date: string; vector_au: [number, number, number] | null; raw_excerpt: string }

export const api = {
  health: () => call<{ status: string; connectors: string[] }>('/api/health'),
  simbad: (q: string) => call<SimbadResult>(`/api/catalogue/simbad?q=${encodeURIComponent(q)}`),
  horizons: (body: string, date: string) => call<HorizonsResult>(`/api/catalogue/horizons?body=${encodeURIComponent(body)}&date=${encodeURIComponent(date)}`),
  ingest: (filename: string, b64: string) => call<IngestResult>('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename, content_b64: b64 }) }),
  remap: (id: string, mapping: { source: string; field: string | null }[]) => call<IngestResult>(`/api/datasets/${id}/remap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mapping }) }),
  records: (id: string, q: URLSearchParams) => call<{ total: number; records: DataRecord[] }>(`/api/datasets/${id}/records?${q}`),
  points: (id: string) => call<{ points: { id: string; name: string; ra_deg: number; dec_deg: number; distance_ly: number }[]; total_visualizable: number; returned: number }>(`/api/datasets/${id}/points`),
}

export interface ColumnProfile { name: string; dtype: string; missing: number; sample: string[]; unit_hint: string | null }
export interface MappingEntry { source: string; field: string | null; confidence: number; method: string; conversion: string | null }
export interface DataRecord {
  row: number; name: string | null; ra_deg: number | null; dec_deg: number | null; distance_ly: number | null
  status: 'ready' | 'approximate' | 'no_distance' | 'non_spatial'; reasons: string[]; quality: number
  match: { object_id: string; method: string; confidence: number } | null
  candidates: { object_id: string; ratio: number }[]
  original: Record<string, unknown>; normalized: Record<string, unknown>
}
export interface IngestResult {
  dataset_id: string; filename: string; format: string; n_rows: number
  columns: ColumnProfile[]; mapping: MappingEntry[]
  summary: { total: number; ready: number; approximate: number; no_distance: number; non_spatial: number; duplicates: number; matched: number; issues: string[] }
  profile: { reused: boolean; profile_id: string | null }
  ai: { used: boolean; note: string }
  records: DataRecord[]
}
