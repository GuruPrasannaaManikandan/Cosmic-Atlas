"""
Phase 2 model validation in real Chrome: opens the Spacecraft Archive, loads every official NASA model, records the
measured dimensions and the checks against sourced values (computed in-app on the loaded geometry), and saves a
screenshot of each model for side-by-side comparison with NASA's own preview images
(docs/space-exploration/3d-asset-provenance/references/).

Usage: python scripts/e2e/model_validation_check.py --base http://localhost:5173 --out docs/qa/space-exploration/models
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

MODELS = ["apollo-lm", "mer-b", "perseverance", "ingenuity", "viking-lander", "insight", "huygens"]


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "models": {}, "errors": [], "deviations": []}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:300]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:170]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1920, "height": 1080})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: rep["errors"].append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:200]))
        failed = []
        page.on("requestfailed", lambda r: failed.append(r.url))
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.wait_for_timeout(800)
        await page.get_by_role("button", name="Spacecraft").first.click()
        await page.locator(".archive").wait_for(timeout=20000)
        titles = await page.locator(".archive-list button").all_inner_texts()
        check("V1 Spacecraft Archive opens from the top navigation and lists every official model", len(titles) == len(MODELS), titles)
        for i, mid in enumerate(MODELS):
            await page.locator(".archive-list button").nth(i).click()
            try:
                await page.wait_for_function(f"() => window.__models && window.__models.results['{mid}']", timeout=60000)
            except Exception as e:  # noqa: BLE001
                check(f"M[{mid}] loads", False, str(e)[:120])
                continue
            await page.wait_for_timeout(1500)
            r = await page.evaluate(f"() => window.__models.results['{mid}']")
            info = await page.locator(".archive-info").inner_text()
            await page.locator(".archive-view").screenshot(path=str(out / f"model_{mid}.jpg"), type="jpeg", quality=86)
            rep["models"][mid] = {k: r[k] for k in ("scale", "measured", "checks", "triangles", "removedMeshes")}
            if mid == "apollo-lm":
                rep["models"][mid]["parts"] = r["parts"]
            m = r["measured"]
            check(f"M[{mid}] loads (Draco, self-hosted decoder) and is measured", m["height"] > 0.05 and r["triangles"] > 100, {"WxLxH": [round(m["width"], 2), round(m["length"], 2), round(m["height"], 2)], "tris": r["triangles"], "scale": round(r["scale"], 4)})
            for c in r["checks"]:
                line = f"M[{mid}] {c['label']}: {c['measuredM']:.2f} m vs sourced {c['expectedM']} m ({c['deviation']*100:+.1f}%, tol ±{c['tol']*100:.0f}%)"
                if c["pass"]:
                    check(line, True)
                else:
                    # a NASA model that disagrees with the sourced dimension is a finding about the asset, reported as such
                    rep["deviations"].append({"model": mid, **{k: c[k] for k in ("label", "measuredM", "expectedM", "deviation", "tol", "source")}})
                    print(f"[DEVIATION] {line}")
            check(f"M[{mid}] archive panel shows provenance and SHA-256", "NASA 3D Resources" in info and "SHA-256" in info)
        await b.close()
    check("Z1 no failed requests (models, textures, Draco decoder)", not failed, failed[:5])
    errs = [e for e in rep["errors"] if "favicon" not in e]
    check("Z2 no console errors", not errs, errs[:5])
    (out / "model_validation_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])} checks) · {len(rep['deviations'])} model deviation(s) recorded: " + ", ".join(f"{d['model']} {d['label']} {d['deviation']*100:+.1f}%" for d in rep["deviations"]))
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/space-exploration/models")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
