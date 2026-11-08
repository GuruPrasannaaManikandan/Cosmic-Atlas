"""
Frame-rate baseline for the Three.js renderer on the local GPU (Playwright Chromium with ANGLE/D3D11).

For each scene it waits for the view to settle, then counts requestAnimationFrame callbacks over a fixed window and
reports mean FPS, median / p95 / max frame time, JS heap, and the WebGL renderer string (proves which GPU was used).
Numbers are measured, never estimated; if the GPU path is unavailable the renderer string will say so (e.g. SwiftShader).

Usage:
  python scripts/e2e/perf_baseline.py --base http://localhost:5173 --out docs/perf/baseline.json [--width 1366 --height 768]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

SCENES = [
    ("cosmic-web", "() => { const s = window.__store.getState(); s.setPhase('intro') }", 3000),
    ("milky-way", "() => { const s = window.__store.getState(); s.setPhase('explore'); s.travel('milky-way', true) }", 2500),
    ("solar-system", "() => { const s = window.__store.getState(); s.setPhase('explore'); s.travel('sun', true) }", 2500),
    ("earth-closeup", "() => { const s = window.__store.getState(); s.setPhase('explore'); s.travel('earth', true) }", 2500),
    ("moon-closeup", "() => { const s = window.__store.getState(); s.setPhase('explore'); s.travel('moon', true) }", 2500),
    ("black-hole-event", "async () => { const m = await import('/src/events/eventState.ts'); window.__store.getState().setPhase('explore'); m.startEvent('black-hole-m87') }", 3000),
    ("nebula-event", "async () => { const m = await import('/src/events/eventState.ts'); m.stopEvent && m.stopEvent(); m.startEvent('nebula-carina') }", 3000),
    ("travel-mode", "async () => { const m = await import('/src/events/eventState.ts'); m.stopEvent && m.stopEvent(); const s = window.__store.getState(); s.setPhase('explore'); s.enterTravelMode('earth') }", 2500),
    ("timeline-playback", "() => { const s = window.__store.getState(); s.exitTravelMode(); s.travel('sun', true); s.setRate(10); s.setPlaying(true) }", 2500),
]

SAMPLE_JS = """(ms) => new Promise((resolve) => {
  const t = []; let start = 0
  const f = (now) => { if (!start) start = now; t.push(now); if (now - start < ms) requestAnimationFrame(f); else resolve(t) }
  requestAnimationFrame(f)
})"""

RENDERER_JS = """() => { const c = document.querySelector('canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  if (!gl) return 'no-webgl'; const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }"""


async def run(base: str, w: int, h: int, window_ms: int, uncapped: bool, shots: Path | None) -> dict:
    out: dict = {"base": base, "viewport": [w, h], "windowMs": window_ms, "uncapped": uncapped, "scenes": []}
    async with async_playwright() as p:
        args = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"]
        if uncapped:  # measure headroom above the display refresh rate
            args += ["--disable-gpu-vsync", "--disable-frame-rate-limit"]
        browser = await p.chromium.launch(headless=True, args=args)
        ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        await page.goto(base, wait_until="domcontentloaded")
        await page.wait_for_function("() => !!window.__store", timeout=30000)
        await page.wait_for_timeout(2500)
        out["renderer"] = await page.evaluate(RENDERER_JS)
        out["userAgent"] = await page.evaluate("() => navigator.userAgent")
        print("WebGL renderer:", out["renderer"])
        for name, setup, settle in SCENES:
            await page.evaluate(setup)
            await page.wait_for_timeout(settle)
            stamps = await page.evaluate(SAMPLE_JS, window_ms)
            dts = [b - a for a, b in zip(stamps, stamps[1:])]
            dts_sorted = sorted(dts)
            heap = await page.evaluate("() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null")
            r = {
                "scene": name,
                "frames": len(dts),
                "fps": round(len(dts) / ((stamps[-1] - stamps[0]) / 1000), 1) if len(stamps) > 1 else 0,
                "medianMs": round(statistics.median(dts), 2) if dts else None,
                "p95Ms": round(dts_sorted[int(0.95 * (len(dts_sorted) - 1))], 2) if dts else None,
                "maxMs": round(max(dts), 2) if dts else None,
                "jsHeapMB": heap,
            }
            if shots:
                shots.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(shots / f"{name}.png"))
                r["screenshot"] = f"{name}.png"
            out["scenes"].append(r)
            print(f"{name:18s} fps={r['fps']:6.1f} median={r['medianMs']}ms p95={r['p95Ms']}ms max={r['maxMs']}ms heap={heap}MB")
        await browser.close()
    out["measuredAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/perf/baseline.json")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--window-ms", type=int, default=4000)
    ap.add_argument("--uncapped", action="store_true", help="disable vsync / frame-rate limit")
    ap.add_argument("--shots", help="directory for one screenshot per scene")
    a = ap.parse_args()
    res = asyncio.run(run(a.base, a.width, a.height, a.window_ms, a.uncapped, Path(a.shots) if a.shots else None))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(res, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
