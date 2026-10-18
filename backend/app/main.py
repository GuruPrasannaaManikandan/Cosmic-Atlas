"""COSMIC ATLAS backend: dataset ingestion, schema mapping, catalogue connectors."""
from __future__ import annotations

import base64
import binascii
import logging
import os

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .connectors.live import ConnectorError, horizons_vector, simbad_lookup
from .ingest import mapping as mp
from .ingest.normalize import normalize_rows, summarize
from .ingest.parsers import UnsupportedFormat, parse
from .repo import SqliteRepository, signature_of

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("atlas")

# Production is same-origin (nginx proxies /api), so CORS only matters for the Vite dev server or a split deployment.
CORS_ORIGINS = [o.strip() for o in os.environ.get("ATLAS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

app = FastAPI(title="COSMIC ATLAS API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["content-type"])
repo = SqliteRepository()
MAX_BYTES = 40 * 1024 * 1024
log.info("COSMIC ATLAS API starting: db=%s cors=%s llm_mapping=%s", repo.path, CORS_ORIGINS, bool(os.environ.get("ANTHROPIC_API_KEY")))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


class IngestBody(BaseModel):
    filename: str
    content_b64: str


class RemapBody(BaseModel):
    mapping: list[dict]


def profile_columns(columns: list[str], rows: list[dict]) -> list[dict]:
    out = []
    for c in columns:
        vals = [r.get(c) for r in rows]
        present = [v for v in vals if v is not None and str(v).strip() != ""]
        nums = [v for v in present if mp._num(v) is not None]
        dtype = "numeric" if present and len(nums) >= 0.9 * len(present) else "text" if present else "empty"
        out.append({"name": c, "dtype": dtype, "missing": len(vals) - len(present), "sample": [str(v) for v in present[:3]], "unit_hint": mp.unit_hint(c)})
    return out


def build_response(ds: dict, mapping: list[dict], reused: bool, profile_id: str | None, ai: dict) -> dict:
    recs, issues = normalize_rows(ds["columns"], ds["rows"], mapping)
    if not any(e.get("field") for e in mapping):
        issues.append("No columns could be mapped to canonical fields – nothing can be placed in 3D.")
    return {
        "dataset_id": ds["id"], "filename": ds["filename"], "format": ds["format"], "n_rows": len(ds["rows"]),
        "columns": profile_columns(ds["columns"], ds["rows"]), "mapping": mapping, "summary": summarize(recs, issues),
        "profile": {"reused": reused, "profile_id": profile_id}, "ai": ai, "records": recs[:200],
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "connectors": ["simbad", "horizons"], "optional_formats": {"fits": _has("astropy"), "parquet": _has("pyarrow")}}


@app.get("/api/ready")
def ready():
    """Readiness: the database is reachable. External catalogues are deliberately not checked (they are optional)."""
    try:
        repo.ping()
    except Exception as e:  # noqa: BLE001
        log.error("Readiness check failed: database unavailable (%s: %s)", type(e).__name__, e)
        raise HTTPException(503, "database unavailable")
    return {"status": "ready", "database": "ok"}


def _has(mod: str) -> bool:
    import importlib.util
    return importlib.util.find_spec(mod) is not None


@app.post("/api/ingest")
def ingest(body: IngestBody):
    try:
        data = base64.b64decode(body.content_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "content_b64 is not valid base64")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file too large (40 MB limit)")
    try:
        fmt, cols, rows = parse(body.filename, data)
    except UnsupportedFormat as e:
        raise HTTPException(415, str(e))
    except Exception as e:  # malformed content
        raise HTTPException(422, f"could not parse file: {type(e).__name__}: {e}")
    if not rows:
        raise HTTPException(422, "the file has columns but no data rows")
    sig = signature_of(cols)
    prof = repo.find_profile(sig)
    if prof:
        mapping, ai, reused = prof["mapping"], {"used": False, "note": "Saved mapping profile reused (matching column signature)."}, True
        mapping = [e for e in mapping if e["source"] in cols] + [{"source": c, "field": None, "confidence": 0, "method": "unmapped", "conversion": None} for c in cols if c not in {e["source"] for e in mapping}]
    else:
        entries, ai = mp.llm_refine(mp.propose_mapping(cols, rows), rows)
        mapping, reused = mp.mapping_dicts(entries), False
    ds = {"filename": body.filename, "format": fmt, "columns": cols, "rows": rows, "mapping": mapping}
    ds["id"] = repo.save_dataset(ds)
    pid = prof["id"] if prof else repo.save_profile(sig, body.filename, mapping)
    return build_response(ds, mapping, reused, pid, ai)


@app.post("/api/datasets/{dataset_id}/remap")
def remap(dataset_id: str, body: RemapBody):
    ds = repo.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "unknown dataset")
    old = {e["source"]: e for e in ds["mapping"]}
    seen: set[str] = set()
    mapping = []
    for m in body.mapping:
        f = m.get("field")
        if f is not None and f not in mp.CANONICAL:
            raise HTTPException(400, f"unknown canonical field {f!r}")
        if f and f in seen:
            raise HTTPException(400, f"field {f!r} assigned to more than one column")
        if f:
            seen.add(f)
        prev = old.get(m["source"], {})
        changed = prev.get("field") != f
        mapping.append({"source": m["source"], "field": f, "confidence": 1.0 if changed and f else prev.get("confidence", 0), "method": "user-edit" if changed else prev.get("method", "unmapped"), "conversion": prev.get("conversion")})
    ds["mapping"] = mapping
    repo.save_dataset(ds)
    pid = repo.save_profile(signature_of(ds["columns"]), ds["filename"], mapping)
    return build_response(ds, mapping, False, pid, {"used": False, "note": "User-edited mapping saved as the reusable profile."})


@app.get("/api/datasets/{dataset_id}/records")
def records(dataset_id: str, q: str = "", status: str = "", sort: str = "row", offset: int = 0, limit: int = Query(200, le=1000)):
    ds = repo.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "unknown dataset")
    recs, _ = normalize_rows(ds["columns"], ds["rows"], ds["mapping"])
    if q:
        recs = [r for r in recs if q.lower() in (r["name"] or "").lower()]
    if status:
        recs = [r for r in recs if r["status"] == status]
    keys = {"row": lambda r: r["row"], "name": lambda r: (r["name"] or "~").lower(), "distance": lambda r: (r["distance_ly"] is None, r["distance_ly"] or 0), "quality": lambda r: -r["quality"]}
    recs.sort(key=keys.get(sort, keys["row"]))
    return {"total": len(recs), "records": recs[offset: offset + limit]}


@app.get("/api/datasets/{dataset_id}/points")
def points(dataset_id: str, limit: int = Query(50000, le=200000)):
    """Only records with a real or explicitly assumed distance are returned – never fabricated positions."""
    ds = repo.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "unknown dataset")
    recs, _ = normalize_rows(ds["columns"], ds["rows"], ds["mapping"])
    ok = [r for r in recs if r["status"] in ("ready", "approximate") and r["distance_ly"] and r["ra_deg"] is not None]
    out = [{"id": f"u{r['row']}", "name": r["name"] or f"row {r['row']}", "ra_deg": r["ra_deg"], "dec_deg": r["dec_deg"], "distance_ly": r["distance_ly"]} for r in ok[:limit]]
    return {"points": out, "total_visualizable": len(ok), "returned": len(out)}


@app.get("/api/catalogue/simbad")
def simbad(q: str):
    try:
        return simbad_lookup(repo, q)
    except ConnectorError as e:
        log.warning("SIMBAD lookup failed for %r: %s", q, e)
        raise HTTPException(502, str(e))


@app.get("/api/catalogue/horizons")
def horizons(body: str, date: str):
    try:
        return horizons_vector(repo, body, date)
    except ConnectorError as e:
        log.warning("Horizons lookup failed for %r on %s: %s", body, date, e)
        raise HTTPException(502, str(e))
