"""
Planetary consistency audit in the real app (Vite dev server): every planet at five camera distances (planet radii),
lit 3/4 from the Sun, simulation paused. Records a JPEG per pose, the mean frame interval over 1.5 s
(requestAnimationFrame; headless + uncapped = throughput, not vsync-limited), WebGL / page errors, and a crude
"rendered" check (non-black pixels near the image centre).

Uses the dev-only window.__navApi hook (store/nav.ts) to place the camera.

Usage: python scripts/e2e/planet_audit.py --base http://localhost:5174 --out docs/foundation/planets [--quality balanced]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]
DISTANCES = [2.5, 6, 20, 150, 2000]

POSE_JS = """
async ([id, dist]) => {
  const api = window.__navApi, st = window.__store.getState();
  const ms = st.simMs;
  const P = api.positionOf(id, ms), S = api.positionOf('sun', ms), R = api.radiusLy(id);
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], nrm = (v) => { const l = Math.hypot(...v); return v.map(x => x / l) };
  const s = nrm(sub(S, P)), z = [0, 0, 1];
  const w = nrm([s[1]*z[2]-s[2]*z[1], s[2]*z[0]-s[0]*z[2], s[0]*z[1]-s[1]*z[0]]);
  const c = Math.cos(0.87), k = Math.sin(0.87);
  const d = nrm([s[0]*c + w[0]*k, s[1]*c + w[1]*k, s[2]*c + w[2]*k + 0.25]);
  api.setCameraAt([P[0] + d[0]*dist*R, P[1] + d[1]*dist*R, P[2] + d[2]*dist*R], P);
  await new Promise(r => setTimeout(r, 900));
  const t = []; let last = performance.now();
  await new Promise(res => { const f = (now) => { t.push(now - last); last = now; if (t.length < 400 && now - t0 < 1500) requestAnimationFrame(f); else res(); }; const t0 = performance.now(); requestAnimationFrame(f); });
  t.shift();
  return { meanFrameMs: t.reduce((a, b) => a + b, 0) / Math.max(t.length, 1), frames: t.length };
}
"""


async def main(base: str, out: Path, quality: str, planets: list[str], distances: list[float] = DISTANCES, headed: bool = False, size=(1280, 720), remount: bool = False) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"base": base, "quality": quality, "headed": headed, "viewport": list(size), "poses": [], "errors": []}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=not headed, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] + ([] if headed else ["--disable-gpu-vsync", "--disable-frame-rate-limit"]))
        ctx = await b.new_context(viewport={"width": size[0], "height": size[1]})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: rep["errors"].append(m.text[:240]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:240]))
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__navApi && window.__store", timeout=60000)
        await page.evaluate(f"() => {{ const s = window.__store.getState(); s.setPhase('explore'); s.setPlaying(false); s.set({{ quality: '{quality}', leftOpen: false, rightOpen: false }}) }}")
        if remount:
            other = 'high' if quality != 'high' else 'balanced'
            await page.evaluate(f"() => window.__store.getState().set({{ quality: '{other}' }})")
            await page.wait_for_timeout(1500)
            await page.evaluate(f"() => window.__store.getState().set({{ quality: '{quality}' }})")
        await page.wait_for_timeout(2500)  # textures
        for pid in planets:
            for d in distances:
                m = await page.evaluate(POSE_JS, [pid, d])
                shot = out / (f"{d:g}".replace(".", "p").join([f"{pid}_", "R.jpg"]))
                await page.screenshot(path=str(shot), type="jpeg", quality=82)
                im = Image.open(shot).convert("L")
                w, h = im.size
                box = im.crop((w // 2 - 40, h // 2 - 40, w // 2 + 40, h // 2 + 40))  # noqa
                lit = sum(1 for v in box.getdata() if v > 40) / (80 * 80)
                rec = {"planet": pid, "distanceR": d, **m, "centreLitFraction": round(lit, 3), "file": shot.name}
                rep["poses"].append(rec)
                print(f"{pid:8s} {d:7.1f} R  frame {m['meanFrameMs']:6.2f} ms  centre lit {lit:.2f}")
        await b.close()
    (out / f"planet_audit_{quality}{'_headed' if headed else ''}{'' if planets == PLANETS else '_' + '_'.join(planets)}.json").write_text(json.dumps(rep, indent=1))
    close_ok = all(r["centreLitFraction"] > 0.2 for r in rep["poses"] if r["distanceR"] <= 6)
    print("console errors:", len(rep["errors"]), rep["errors"][:3])
    print("RESULT:", "PASS" if close_ok and not rep["errors"] else "FAIL")
    return 0 if close_ok and not rep["errors"] else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5174")
    ap.add_argument("--out", default="docs/foundation/planets")
    ap.add_argument("--quality", default="balanced")
    ap.add_argument("--planets", default=",".join(PLANETS))
    ap.add_argument("--distances", default=",".join(str(d) for d in DISTANCES))
    ap.add_argument("--headed", action="store_true", help="visible window, vsync on: frame interval is the real presented rate")
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--remount", action="store_true", help="switch to another tier first so the canvas is remounted at --quality")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out), a.quality, a.planets.split(","), [float(x) for x in a.distances.split(",")], a.headed, tuple(int(v) for v in a.size.split("x")), a.remount)))
