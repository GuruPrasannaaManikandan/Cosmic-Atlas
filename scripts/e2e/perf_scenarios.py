"""
Performance acceptance runs in real (headed) Google Chrome with vsync, on the live local site.

Load metrics: TTFB, DOMContentLoaded, load, time to first canvas frame, time to interactive (Explore button usable),
bytes transferred. Per scenario (default 60 s): frame interval mean / median / p95 / p99 / max, FPS distribution,
long tasks (> 50 ms) count and total, JS heap before/after. Scenarios: idle Solar System, camera orbit (real mouse
drags), fast navigation (fly-to every 6 s), dense starfield (Milky Way), black-hole Cosmic Event, planetary close-up
(Saturn 2.5 R), Travel Mode nav map. Optional soak (--soak 300) samples heap every 10 s to expose leaks.

Usage: python scripts/e2e/perf_scenarios.py --base http://localhost:5174 --out docs/qa/2026-11-09/metrics --seconds 60 --soak 300
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

ST = "window.__store.getState()"
START = """() => { window.__perf = { t: [], long: [], last: performance.now() };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.long.push(e.duration) }).observe({ type: 'longtask', buffered: false }) } catch (e) {}
  const f = (n) => { const p = window.__perf; if (!p) return; p.t.push(n - p.last); p.last = n; if (!p.stop) requestAnimationFrame(f) }; requestAnimationFrame(f) }"""
STOP = """() => { const p = window.__perf; p.stop = true; const m = performance.memory; return { t: p.t.slice(1), long: p.long, heapMB: m ? m.usedJSHeapSize / 1048576 : null } }"""
HEAP = "() => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null"


def summarize(name: str, raw: dict, heap0) -> dict:
    t = sorted(raw["t"])
    n = len(t)
    pct = lambda q: t[min(n - 1, int(q * n))]
    fps = [1000 / x for x in raw["t"] if x > 0]
    buckets = {">=58": 0, "45-58": 0, "30-45": 0, "<30": 0}
    for f in fps:
        buckets[">=58" if f >= 58 else "45-58" if f >= 45 else "30-45" if f >= 30 else "<30"] += 1
    return {"scenario": name, "frames": n, "meanMs": round(statistics.fmean(t), 2), "medianMs": round(pct(0.5), 2), "p95Ms": round(pct(0.95), 2),
            "p99Ms": round(pct(0.99), 2), "maxMs": round(t[-1], 1), "meanFps": round(1000 / statistics.fmean(t), 1),
            "fpsDistributionPct": {k: round(100 * v / max(1, len(fps)), 1) for k, v in buckets.items()},
            "longTasks": len(raw["long"]), "longTaskTotalMs": round(sum(raw["long"]), 1),
            "heapStartMB": round(heap0, 1) if heap0 else None, "heapEndMB": round(raw["heapMB"], 1) if raw["heapMB"] else None}


async def main(a) -> int:
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    W, H = (int(v) for v in a.size.split("x"))
    rep = {"browser": None, "viewport": [W, H], "quality": a.quality, "vsync": True, "seconds": a.seconds, "load": {}, "scenarios": [], "soak": []}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel=a.channel, headless=False, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"])
        rep["browser"] = f"{a.channel} {b.version}"
        ctx = await b.new_context(viewport={"width": W, "height": H})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        t0 = time.time()
        await page.goto(a.base, wait_until="load")
        await page.wait_for_function("() => window.__store && document.querySelector('canvas')")
        await page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        first_frame = time.time() - t0
        await page.get_by_role("button", name="EXPLORE FREELY").wait_for(state="visible")
        tti = time.time() - t0
        nav = await page.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource');
            return { ttfbMs: Math.round(n.responseStart), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd),
                     resources: res.length, transferKB: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), n.transferSize || 0) / 1024),
                     decodedKB: Math.round(res.reduce((s, r) => s + (r.decodedBodySize || 0), 0) / 1024) } }""")
        rep["load"] = {**nav, "firstCanvasFrameS": round(first_frame, 2), "timeToInteractiveS": round(tti, 2), "note": "dev server (unminified Vite modules); a production build loads less"}
        print("load:", rep["load"])
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.evaluate(f"() => {{ {ST}.set({{ quality: '{a.quality}', leftOpen: false, rightOpen: false }}) }}")
        await page.wait_for_timeout(2500)

        async def measure(name, setup, during=None):
            await setup()
            await page.wait_for_timeout(2500)  # warm-up (texture upload / shader compile)
            heap0 = await page.evaluate(HEAP)
            await page.evaluate(START)
            end = time.time() + a.seconds
            if during:
                await during(end)
            else:
                await page.wait_for_timeout(a.seconds * 1000)
            raw = await page.evaluate(STOP)
            s = summarize(name, raw, heap0)
            rep["scenarios"].append(s)
            print(f"{name:22s} mean {s['meanMs']:6.2f} ms  median {s['medianMs']:6.2f}  p95 {s['p95Ms']:6.2f}  p99 {s['p99Ms']:6.2f}  max {s['maxMs']:6.1f}  >=58fps {s['fpsDistributionPct']['>=58']}%  long tasks {s['longTasks']}  heap {s['heapStartMB']}->{s['heapEndMB']} MB")

        async def fly(id_, wait=True):
            await page.evaluate(f"() => {ST}.travel('{id_}')")
            if wait:
                await page.wait_for_function("() => !window.__nav.flight", timeout=90000)

        async def idle_solar():
            await fly("earth")
            await page.evaluate("() => window.__store.getState().travel('sun')")
            await page.wait_for_function("() => !window.__nav.flight", timeout=90000)

        async def orbit_drag(end):
            cx, cy = W // 2, H // 2
            while time.time() < end:
                await page.mouse.move(cx - 200, cy)
                await page.mouse.down()
                for k in range(40):
                    await page.mouse.move(cx - 200 + k * 10, cy + (k % 10) - 5)
                    await page.wait_for_timeout(16)
                await page.mouse.up()

        async def fast_nav(end):
            seq = ["mars", "jupiter", "saturn", "earth", "neptune", "venus", "uranus", "mercury"]
            i = 0
            while time.time() < end:
                await fly(seq[i % len(seq)], wait=False)
                i += 1
                await page.wait_for_timeout(6000)

        async def milky_way():
            await fly("milky-way")

        async def black_hole():
            await page.get_by_role("button", name="Cosmic Events").first.click()
            await page.wait_for_timeout(800)
            card = page.locator(".event-card").filter(has_text="Black Hole").locator("button").first
            if not await card.count():
                card = page.locator(".event-card button").first
            await card.click()

        async def exit_event():
            ex = page.get_by_role("button", name="Exit", exact=False)
            if await ex.count():
                await ex.first.click()
                await page.wait_for_timeout(1000)

        async def saturn_close():
            await page.evaluate("""() => { const api = window.__navApi, ms = window.__store.getState().simMs; const P = api.positionOf('saturn', ms), S = api.positionOf('sun', ms), R = api.radiusLy('saturn');
                const d = [S[0]-P[0], S[1]-P[1], S[2]-P[2]], l = Math.hypot(...d); api.setCameraAt([P[0]+d[0]/l*2.5*R, P[1]+d[1]/l*2.5*R, P[2]+d[2]/l*2.5*R + 0.6*R], P) }""")

        async def nav_map():
            await page.evaluate(f"() => {ST}.enterTravelMode('earth')")
            await page.wait_for_timeout(1500)
            await page.keyboard.press("m")

        await measure("idle-solar-system", idle_solar)
        await measure("camera-orbit-drag", idle_solar, orbit_drag)
        await measure("fast-navigation", idle_solar, fast_nav)
        await measure("dense-starfield-milkyway", milky_way)
        await measure("black-hole-event", black_hole)
        await exit_event()
        await measure("planet-closeup-saturn", saturn_close)
        await measure("travel-navmap-open", nav_map)
        await page.keyboard.press("Escape")
        await page.keyboard.press("Escape")

        if a.soak:
            await idle_solar()
            t_end = time.time() + a.soak
            while time.time() < t_end:
                rep["soak"].append({"t": round(a.soak - (t_end - time.time())), "heapMB": round(await page.evaluate(HEAP), 1)})
                await page.wait_for_timeout(10000)
            print("soak heap MB:", [s["heapMB"] for s in rep["soak"]])
        rep["pageErrors"] = errors
        await b.close()
    (out / f"performance_{a.quality}.json").write_text(json.dumps(rep, indent=1))
    return 0 if not errors else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5174")
    ap.add_argument("--out", default="docs/qa/2026-11-09/metrics")
    ap.add_argument("--channel", default="chrome")
    ap.add_argument("--quality", default="balanced")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--soak", type=int, default=0)
    sys.exit(asyncio.run(main(ap.parse_args())))
