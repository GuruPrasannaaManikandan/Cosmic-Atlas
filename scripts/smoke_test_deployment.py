"""End-to-end smoke test for a running COSMIC ATLAS deployment (local Compose, preview or public URL).

Usage:  python scripts/smoke_test_deployment.py https://your-site.example   [--skip-live]
Non-destructive: it only uploads the bundled sample dataset (a new dataset row) and reads it back.
"""
from __future__ import annotations

import base64
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
results: list[tuple[str, bool, str]] = []


def req(base: str, path: str, data: dict | None = None, timeout: float = 120) -> tuple[int, dict, bytes]:
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(base + path, data=body, headers={"content-type": "application/json"} if body else {})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def check(name: str, ok: bool, info: str = "") -> None:
    results.append((name, ok, info))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" - {info}" if info else ""))


def main() -> int:
    base = sys.argv[1].rstrip("/")
    live = "--skip-live" not in sys.argv

    t = time.perf_counter()
    s, h, b = req(base, "/")
    html = b.decode(errors="replace")
    check("homepage", s == 200 and '<div id="root">' in html, f"{s} in {time.perf_counter() - t:.2f}s")
    assets = [p for p in html.split('"') if p.startswith("/assets/")]
    for a in assets:
        s, h, b = req(base, a)
        check(f"asset {a}", s == 200, f"{s} {h.get('Content-Type', '')} {len(b) // 1024} KiB cache={h.get('Cache-Control', '-')}")
    s, h, _ = req(base, "/assets/astronomy/textures/earth_day_2k.jpg")
    check("texture earth_day_2k.jpg", s == 200 and "image/jpeg" in h.get("Content-Type", ""), f"{s} {h.get('Content-Type', '')}")
    s, _, b = req(base, "/some/client/route")
    check("SPA fallback on refresh", s == 200 and b'<div id="root">' in b, str(s))
    s, _, _ = req(base, "/assets/does-not-exist.js")
    check("missing asset is a real 404", s == 404, str(s))

    s, _, b = req(base, "/api/health")
    check("GET /api/health", s == 200 and json.loads(b).get("status") == "ok", b.decode()[:120])
    s, _, b = req(base, "/api/ready")
    check("GET /api/ready", s == 200, b.decode()[:120])

    csv = (ROOT / "sample-data" / "unfamiliar_catalogue.csv").read_bytes()
    s, _, b = req(base, "/api/ingest", {"filename": "unfamiliar_catalogue.csv", "content_b64": base64.b64encode(csv).decode()})
    d = json.loads(b) if s == 200 else {}
    check("POST /api/ingest (sample dataset)", s == 200 and d.get("n_rows", 0) > 0, f"{s} rows={d.get('n_rows')} reused_profile={d.get('profile', {}).get('reused')}")
    if d:
        did = d["dataset_id"]
        s, _, b = req(base, f"/api/datasets/{did}/records?limit=5")
        check("GET records", s == 200 and json.loads(b)["total"] > 0, f"total={json.loads(b).get('total') if s == 200 else s}")
        s, _, b = req(base, f"/api/datasets/{did}/points")
        check("GET points", s == 200 and "points" in json.loads(b), f"visualizable={json.loads(b).get('total_visualizable') if s == 200 else s}")
        s, _, b = req(base, f"/api/datasets/{did}/remap", {"mapping": [{"source": m["source"], "field": m["field"]} for m in d["mapping"]]})
        check("POST remap (unchanged mapping)", s == 200, str(s))
        print(f"       dataset_id={did}")
    s, _, b = req(base, "/api/datasets/does-not-exist/points")
    check("unknown dataset -> JSON 404", s == 404 and "detail" in json.loads(b), str(s))
    s, _, b = req(base, "/api/ingest", {"filename": "x.csv", "content_b64": "!!!"})
    check("invalid upload -> JSON 400", s == 400 and "detail" in json.loads(b), str(s))

    if live:
        t = time.perf_counter()
        s, _, b = req(base, "/api/catalogue/simbad?q=Betelgeuse")
        check("SIMBAD live lookup (Betelgeuse)", s == 200 and json.loads(b).get("main_id"), f"{s} {time.perf_counter() - t:.1f}s {b.decode()[:90]}")
        s, _, b = req(base, "/api/catalogue/simbad?q=zzqqxxnotanobject123")
        check("SIMBAD unknown name -> graceful 502 JSON", s == 502 and "detail" in json.loads(b), f"{s} {b.decode()[:90]}")
        t = time.perf_counter()
        s, _, b = req(base, "/api/catalogue/horizons?body=mars&date=2026-10-18")
        check("Horizons live vector (Mars)", s == 200 and json.loads(b).get("vector_au"), f"{s} {time.perf_counter() - t:.1f}s")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
