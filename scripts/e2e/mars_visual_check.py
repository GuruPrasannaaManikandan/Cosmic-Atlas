"""
Mars visual reconstruction check: the eight required views of Victoria crater and Opportunity, captured from the RUNNING
Cosmic Atlas app (real Chrome, GPU), plus Unity's own frame timing / draw calls / triangles and the rock instance count.

Views: crater overview, wide landscape, expedition rover medium, Opportunity medium, Opportunity close-up (mast),
wheels and rocker-bogie, solar array, instrument arm, ground-level terrain.
Framing uses only the player's public bridge commands (RestoreState, Inspect), i.e. the same camera the user drives.

Usage: python scripts/e2e/mars_visual_check.py --base http://localhost:5173 --out docs/qa/mars-visual-overhaul [--tag after]
"""
from __future__ import annotations

import argparse, asyncio, json, math, time
from pathlib import Path
from playwright.async_api import async_playwright

POSE = "window.__marsBridge.last.pose"


async def wait_for(page, js, timeout=60.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(js):
                return True
        except Exception:
            pass
        await asyncio.sleep(0.25)
    return False


async def send(page, method, arg=''):
    await page.evaluate(f"window.__marsBridge.send({json.dumps(method)}, {json.dumps(arg)})")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:5173')
    ap.add_argument('--out', default='docs/qa/mars-visual-overhaul')
    ap.add_argument('--tag', default='after')
    ap.add_argument('--width', type=int, default=1366)
    ap.add_argument('--height', type=int, default=768)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rep = {'views': [], 'metrics': {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        page = await (await b.new_context(viewport={'width': a.width, 'height': a.height}, device_scale_factor=1)).new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(a.base)
        await wait_for(page, "!!window.__store", 60)
        await asyncio.sleep(2)
        t0 = time.time()
        await page.evaluate("window.__store.getState().set({ phase: 'explore' }); window.__store.getState().enterSurface('victoria-crater')")
        await wait_for(page, "!!(window.__marsBridge && window.__marsBridge.last.ready)", 180)
        rep['metrics']['loadToReadySec'] = round(time.time() - t0, 2)
        ready = await page.evaluate("window.__marsBridge.last.ready")
        rep['metrics']['roverCalibration'] = ready.get('roverCalibration')
        rep['metrics']['terrainTriangles'] = ready.get('terrainTriangles')
        await wait_for(page, f"{POSE} && {POSE}.mode === 'Explore'", 30)
        await asyncio.sleep(2)
        opp = ready['objects'][0]
        ox, oz = opp['x'], opp['z']

        async def view(name, note):
            await asyncio.sleep(2.2)
            f = out / f"{a.tag}_{name}.png"
            await page.screenshot(path=str(f))
            rep['views'].append({'view': name, 'file': f.name, 'note': note})
            print('captured', name, flush=True)

        # 1 crater overview: high above the rim looking down (the arrival camera's start)
        await page.evaluate("window.__surface.state().set({ intro: true })")
        await send(page, 'Embed', '{"arrival":true}')
        await asyncio.sleep(0.6)
        await view('01_crater_overview', 'arrival camera ~700 m above the expedition landing point')
        await send(page, 'SkipArrival')
        await page.evaluate("window.__surface.state().set({ intro: false })")
        await wait_for(page, f"{POSE}.mode === 'Explore'", 10)

        # 2 wide landscape: on the rim west of Opportunity, looking east across the crater
        rim_x, rim_z = ox - 30, oz + 8
        heading = math.atan2(0 - rim_x, 0 - rim_z)
        await send(page, 'RestoreState', json.dumps({'x': rim_x, 'z': rim_z, 'heading': heading, 'camYawOffset': 0, 'camPitch': 0.12, 'camDist': 24}))
        await view('02_wide_landscape', 'rim of Victoria, looking across the crater')
        # 3 expedition rover, medium
        await send(page, 'RestoreState', json.dumps({'x': ox - 12, 'z': oz + 2, 'heading': heading + 0.5, 'camYawOffset': 2.4, 'camPitch': 0.2, 'camDist': 7.5}))
        await view('03_expedition_rover_medium', 'the illustrative expedition vehicle')
        # 4 ground-level terrain
        await send(page, 'RestoreState', json.dumps({'x': ox - 12, 'z': oz + 2, 'heading': heading, 'camYawOffset': 0.6, 'camPitch': -0.12, 'camDist': 4}))
        await view('04_ground_level', 'low camera near the ground')
        # Opportunity: walk close, then inspection views
        await send(page, 'RestoreState', json.dumps({'x': ox - 4.5, 'z': oz + 1.5, 'heading': math.atan2(ox - (ox - 4.5), oz - (oz + 1.5)), 'camYawOffset': 0, 'camPitch': 0.2, 'camDist': 7.5}))
        await asyncio.sleep(1)
        for anchor, name in (('whole', '05_opportunity_medium'), ('mast', '06_opportunity_closeup_mast'), ('mobility', '07_wheels_rocker_bogie'), ('solar', '08_solar_array'), ('arm', '09_instrument_arm'), ('hga', '10_high_gain_antenna')):
            await send(page, 'Inspect', anchor)
            await view(name, f'inspection camera, component "{anchor}" (highlight pulses on the NASA model part)')
        await send(page, 'SetExplorerMode', 'explore')

        # performance: Unity's own instrumentation while exploring near Opportunity (rocks and the rover in view)
        samples = []
        for _ in range(10):
            await asyncio.sleep(1.0)
            samples.append(await page.evaluate("window.__mars.stats"))
        mid = lambda k: sorted(s[k] for s in samples if s.get(k) is not None)[len(samples) // 2]
        await send(page, 'SetLook', '{}')
        await asyncio.sleep(0.5)
        look = await page.evaluate("window.__mars.look")
        rep['metrics'].update({'msP50': mid('msP50'), 'msP95': mid('msP95'), 'drawCalls': mid('drawCalls'), 'triangles': mid('triangles'), 'setPass': mid('setPass'),
                               'backbuffer': [samples[-1]['width'], samples[-1]['height']], 'profile': samples[-1]['profile'], 'look': look,
                               'jsHeapMB': await page.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null")})
        rep['consoleErrors'] = errors[:20]
        await b.close()
    (out / f'{a.tag}_metrics.json').write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep['metrics'], indent=1))
    print('console errors:', len(rep['consoleErrors']), rep['consoleErrors'][:5])


asyncio.run(main())
