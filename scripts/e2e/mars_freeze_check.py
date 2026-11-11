"""
Mars driving-smoothness regression check (real Chrome, GPU, fresh profile). Drives three FIRST-VISIT routes and
reports, per route: browser long tasks (main-thread blocks > 50 ms), WebGL shader programs linked while driving
(Chrome on Windows compiles them synchronously through ANGLE / D3D11, and an uncompiled variant first drawn mid-drive
froze the page for 1-3 s), and Unity's own worst frame each second.

FAIL if any long task exceeds 250 ms while driving.
Usage: python scripts/e2e/mars_freeze_check.py --base http://localhost:5173 [--out docs/qa/performance]
"""
import argparse, asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

HOOK = r"""
(() => {
  window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true });
  const P = WebGL2RenderingContext.prototype; window.__links = [];
  const lp = P.linkProgram; P.linkProgram = function (p) { p.__t0 = 1; return lp.call(this, p) };
  const gp = P.getProgramParameter; P.getProgramParameter = function (p, n) {
    const t = performance.now(); const r = gp.call(this, p, n);
    if (n === this.LINK_STATUS && p.__t0 && !p.__logged) { p.__logged = 1; window.__links.push([Math.round(t), Math.round(performance.now() - t)]) }
    return r;
  };
})();
"""


async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:5173'); ap.add_argument('--out', default='docs/qa/performance')
    a = ap.parse_args()
    rep = {'routes': {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        page = await (await b.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1.5)).new_page()
        await page.add_init_script(HOOK)
        await page.goto(a.base); await asyncio.sleep(6)
        await page.evaluate("window.__store.getState().set({ phase: 'explore' }); window.__store.getState().enterSurface('victoria-crater')")
        for _ in range(180):
            await asyncio.sleep(1)
            if await page.evaluate("!!(window.__marsBridge&&window.__marsBridge.last.pose&&window.__marsBridge.last.pose.mode==='Explore')"): break
        rep['build'] = await page.evaluate("window.__marsBridge.last.build && window.__marsBridge.last.build.id")
        rep['programsLinkedDuringLoad'] = await page.evaluate("window.__links.length")
        await asyncio.sleep(15); await page.mouse.click(5, 300)
        r = await page.evaluate("window.__marsBridge.last.ready.objects[0]"); ox, oz = r['x'], r['z']
        for name, (x, z, h) in {'A west plains': (ox - 120, oz + 30, 1.85), 'B south rim': (ox + 60, oz - 160, 0.4), 'C north': (ox - 60, oz + 220, 2.6)}.items():
            await page.evaluate(f"window.__marsBridge.send('RestoreState', {json.dumps(json.dumps({'x': x, 'z': z, 'heading': h, 'camYawOffset': 0, 'camPitch': 0.24, 'camDist': 7.5}))})")
            await asyncio.sleep(2)
            await page.evaluate("window.__lt = []; window.__linkMark = window.__links.length")
            await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft')
            worst = []
            for _ in range(14):
                await asyncio.sleep(1); worst.append(round((await page.evaluate("window.__mars.stats"))['msMax']))
            await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft')
            lt = await page.evaluate("window.__lt"); links = await page.evaluate("window.__links.slice(window.__linkMark)")
            rep['routes'][name] = {'longTasks': lt, 'programsLinked': links, 'unityWorstFrameMsPerSecond': worst}
            print(name, json.dumps(rep['routes'][name]), flush=True)
        await b.close()
    worst_lt = max([d for rt in rep['routes'].values() for _, d in rt['longTasks']], default=0)
    rep['worstLongTaskMs'] = worst_lt; rep['pass'] = worst_lt <= 250
    Path(a.out).mkdir(parents=True, exist_ok=True)
    (Path(a.out) / f"mars_freeze_{rep['build']}.json").write_text(json.dumps(rep, indent=1))
    print(('PASS' if rep['pass'] else 'FAIL'), 'worst long task while driving:', worst_lt, 'ms; build', rep['build'])
    sys.exit(0 if rep['pass'] else 1)


asyncio.run(main())
