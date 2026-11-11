"""
Mars performance profile in the RUNNING app (real Chrome, GPU), per scenario, with Unity's own frame instrumentation
(frame-time p50 / p95 / p99 over the last 120 frames, draw calls, triangles, set-pass calls) and browser long tasks
(main-thread blocking > 50 ms). Same scene, camera and settings every run, so before / after are comparable.

Scenarios: load, stationary, driving, camera rotation, close-up inspection, terrain-heavy view, map open, replay.

Usage: python scripts/e2e/mars_perf.py --base http://localhost:5173 --out docs/qa/performance --tag before [--width 1920 --height 1080 --dpr 1.5]
"""
from __future__ import annotations
import argparse, asyncio, json, math, statistics, time
from pathlib import Path
from playwright.async_api import async_playwright

POSE = "window.__marsBridge.last.pose"


async def wait_for(page, js, timeout=90.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(js):
                return True
        except Exception:
            pass
        await asyncio.sleep(0.25)
    return False


async def sample(page, secs):
    out = []
    await page.evaluate("window.__lt = []")
    for _ in range(int(secs)):
        await asyncio.sleep(1.0)
        out.append(await page.evaluate("window.__mars.stats"))
    lt = await page.evaluate("window.__lt")
    p50 = statistics.median(s['msP50'] for s in out)
    return {
        'msP50': round(p50, 1), 'fpsFromP50': round(1000 / p50, 1),
        'msP95': round(max(s['msP95'] for s in out), 1), 'msP99': round(max(s['msP99'] for s in out), 1),
        'drawCalls': int(statistics.median(s['drawCalls'] for s in out)), 'setPass': int(statistics.median(s['setPass'] for s in out)),
        'trianglesM': round(statistics.median(s['triangles'] for s in out) / 1e6, 2),
        'longTasks': len(lt), 'longTaskMaxMs': round(max(lt), 0) if lt else 0,
        'backbuffer': [out[-1]['width'], out[-1]['height']],
    }


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:5173')
    ap.add_argument('--out', default='docs/qa/performance')
    ap.add_argument('--tag', default='run')
    ap.add_argument('--width', type=int, default=1920)
    ap.add_argument('--height', type=int, default=1080)
    ap.add_argument('--dpr', type=float, default=1.5)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rep = {'viewport': [a.width, a.height, a.dpr], 'scenarios': {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        page = await (await b.new_context(viewport={'width': a.width, 'height': a.height}, device_scale_factor=a.dpr)).new_page()
        await page.add_init_script("window.__lt=[]; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration) }).observe({ type: 'longtask', buffered: true })")
        await page.goto(a.base)
        await wait_for(page, "!!window.__store", 60)
        await asyncio.sleep(2)
        t0 = time.time()
        await page.evaluate("window.__store.getState().set({ phase: 'explore' }); window.__store.getState().enterSurface('victoria-crater')")
        await wait_for(page, "!!(window.__marsBridge && window.__marsBridge.last.ready)", 180)
        rep['loadToReadySec'] = round(time.time() - t0, 2)
        rep['build'] = await page.evaluate("window.__marsBridge.last.build && window.__marsBridge.last.build.id")
        await wait_for(page, f"{POSE} && {POSE}.mode === 'Explore'", 30)
        ready = await page.evaluate("window.__marsBridge.last.ready")
        ox, oz = ready['objects'][0]['x'], ready['objects'][0]['z']
        send = lambda m, arg='': page.evaluate(f"window.__marsBridge.send({json.dumps(m)}, {json.dumps(arg)})")
        place = lambda x, z, h, yaw=0, pitch=0.24, dist=7.5: send('RestoreState', json.dumps({'x': x, 'z': z, 'heading': h, 'camYawOffset': yaw, 'camPitch': pitch, 'camDist': dist}))
        h_to_opp = math.atan2(ox - (ox - 40), oz - (oz + 6))
        await place(ox - 40, oz + 6, h_to_opp)
        await asyncio.sleep(3)
        rep['scenarios']['stationary'] = await sample(page, 6)
        await page.mouse.click(5, 5)
        await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft')
        await asyncio.sleep(1)
        rep['scenarios']['driving'] = await sample(page, 6)
        await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft')
        await asyncio.sleep(2)
        await page.keyboard.down('ArrowLeft')
        rep['scenarios']['cameraRotation'] = await sample(page, 6)
        await page.keyboard.up('ArrowLeft')
        await place(ox - 4.5, oz + 1.5, math.atan2(4.5, -1.5))
        await asyncio.sleep(1)
        await page.keyboard.press('KeyE')
        await asyncio.sleep(2)
        rep['scenarios']['closeUpInspection'] = await sample(page, 6)
        await page.keyboard.press('Escape')
        await asyncio.sleep(1)
        await place(ox - 30, oz + 8, math.atan2(-(ox - 30), -(oz + 8)), 0, 0.12, 24)
        await asyncio.sleep(3)
        rep['scenarios']['terrainHeavy'] = await sample(page, 6)
        await page.keyboard.press('KeyM')
        await asyncio.sleep(1)
        rep['scenarios']['mapOpen'] = await sample(page, 5)
        await page.keyboard.press('Escape')
        await asyncio.sleep(1)
        await place(ox - 4.5, oz + 1.5, math.atan2(4.5, -1.5))
        await asyncio.sleep(1)
        await page.keyboard.press('KeyE')
        await asyncio.sleep(1.5)
        await page.click('[data-testid=relive-mission]')
        await asyncio.sleep(3)
        rep['scenarios']['replay'] = await sample(page, 6)
        await page.click('[data-testid=go-back-to-present]')
        rep['jsHeapMB'] = await page.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null")
        await b.close()
    (out / f'mars_perf_{a.tag}.json').write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep, indent=1))


asyncio.run(main())
