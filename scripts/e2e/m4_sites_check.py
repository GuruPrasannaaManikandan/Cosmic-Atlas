"""
M4 acceptance: the seven Mars landing-site environments in the embedded Unity player, in real Chrome (GPU).

For each site (opened from the Mars landing-site catalogue, then switched to the next one):
  S1  the catalogue card is marked Available and opens the site
  S2  the Unity player reports ready for THIS site (site mode), terrain + horizon + hardware built; height check passes
  S3  the expected hardware is present (ids from site.json), with the model the site file names
  S4  input mode matches the mission: VEHICLE_EXPLORATION (rover missions) / PLANETARY_EXPLORATION (stationary landers)
  S5  W moves the explorer; the arrow keys turn only the camera (position unchanged)
  S6  the minimap is shown by default and the coordinates read out
  S7  next to the hardware the inspect prompt appears; E opens the record; Unity enters Inspect; a component highlights
      (where the model has one); Esc returns to exploration
  S8  the site map opens and closes
  S9  frame time (Unity's own, Balanced) and load time recorded
  S10 Return to orbit quits the player (no player left running) before the next site
Plus: console errors / Unity errors per site; screenshots per site (explore, near, inspect, component).

  python scripts/e2e/m4_sites_check.py --base http://localhost:5173 --out docs/qa/m4
"""
from __future__ import annotations

import argparse, asyncio, json, math, sys, time
from pathlib import Path

from playwright.async_api import async_playwright

SITES = ['viking-1', 'viking-2', 'pathfinder', 'spirit', 'phoenix', 'curiosity', 'insight']
READY = 'window.__marsBridge && window.__marsBridge.last.ready'
POSE = 'window.__marsBridge.last.pose'

rep: dict = {'checks': [], 'sites': {}, 'errors': []}


def check(name, ok, detail=''):
    rep['checks'].append({'check': name, 'pass': bool(ok), 'detail': detail if isinstance(detail, (dict, list, int, float)) else str(detail)[:400]})
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:200]) if detail != '' else ''}", flush=True)


async def wait_for(page, expr, secs):
    try:
        await page.wait_for_function(f'() => !!({expr})', timeout=secs * 1000)
        return True
    except Exception:
        return False


async def hold(page, key, secs):
    await page.keyboard.down(key)
    await asyncio.sleep(secs)
    await page.keyboard.up(key)


async def site_run(page, base, out: Path, sid: str, logs: list):
    r = {'site': sid}
    rep['sites'][sid] = r
    site_def = json.loads((Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'mars-sites' / sid / 'site.json').read_text(encoding='utf-8'))
    logs.clear()
    # S1 from the catalogue (the landing-site picker), as a user would
    opened = await page.evaluate("""() => { const b = window.__openSitePicker; if (b) { b('mars'); return true } return false }""")
    if opened:
        ok = await wait_for(page, f"document.querySelector('[data-testid=descend-mars-{sid}]')", 20)
        card = await page.evaluate(f"() => {{ const c = document.querySelector('[data-testid=site-card-mars-{sid}]'); return c ? c.innerText : null }}")
        check(f'{sid} S1 catalogue card is Available and labelled {site_def["mode"]}', ok and card and 'AVAILABLE' in card.upper() and ('LANDER' in card.upper() if site_def['mode'] == 'lander' else 'ROVER' in card.upper()), card[:160] if card else None)
        if sid == SITES[0]:
            await page.screenshot(path=str(out / 'catalogue_mars.png'))
        t0 = time.time()
        await page.click(f'[data-testid=descend-mars-{sid}]')
    else:
        t0 = time.time()
        await page.evaluate(f"() => window.__store.getState().enterSurface('mars-{sid}')")
        check(f'{sid} S1 catalogue opener present', False, 'window.__openSitePicker missing: entered via the store')
    ok = await wait_for(page, f"{READY} && {READY}.siteId === '{sid}'", 180)
    r['readySecs'] = round(time.time() - t0, 1)
    ready = await page.evaluate(f'() => {READY}') if ok else None
    check(f'{sid} S2 Unity site mode ready', ok, {'secs': r['readySecs']})
    if not ok:
        r['logs'] = logs[-30:]
        return
    r['ready'] = {k: ready.get(k) for k in ('siteId', 'siteKind', 'terrainTriangles', 'chunks', 'horizon', 'heightCheck', 'profile', 'sol', 'utc', 'sunElevation', 'sunAzimuth', 'loadMs')}
    hc = ready.get('heightCheck') or {}
    check(f'{sid} S2 terrain + horizon built, height check passes', ready['terrainTriangles'] > 100000 and (ready.get('horizon') or {}).get('chunks', 0) > 0 and hc.get('pass'), {'tris': ready['terrainTriangles'], 'horizon': ready.get('horizon'), 'heightCheck': hc})
    want = [h['id'] for h in site_def['hardware']]
    got = {o['id']: o for o in ready['objects']}
    check(f'{sid} S3 hardware present: {want}', all(w in got and got[w].get('parts', 0) > 0 for w in want), {w: (got.get(w) or {}).get('parts') for w in want})
    r['hardware'] = [{k: o.get(k) for k in ('id', 'model', 'parts', 'components', 'note', 'x', 'z', 'y')} for o in ready['objects']]
    await wait_for(page, f"{POSE} && {POSE}.mode === 'Explore'", 30)
    await asyncio.sleep(2.5)
    await page.mouse.click(683, 420)
    mode = await page.evaluate('() => window.__input.mode()')
    want_mode = 'VEHICLE_EXPLORATION' if site_def['mode'] == 'rover' else 'PLANETARY_EXPLORATION'
    check(f'{sid} S4 input mode {want_mode}', mode == want_mode, mode)
    await page.screenshot(path=str(out / f'{sid}_01_explore.png'))

    # S5 movement and camera
    p0 = await page.evaluate(f'() => ({{...{POSE}}})')
    await hold(page, 'KeyW', 1.6)
    await asyncio.sleep(0.6)
    p1 = await page.evaluate(f'() => ({{...{POSE}}})')
    moved = math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z'])
    check(f'{sid} S5 W moves the explorer', moved > 0.8, {'moved': round(moved, 2)})
    # a rover coasts after W is released: test the camera only once it has stopped
    await wait_for(page, f"{POSE} && Math.abs({POSE}.speed) < 0.03", 12)
    await asyncio.sleep(0.5)
    a0 = await page.evaluate(f'() => ({{...{POSE}}})')
    await hold(page, 'ArrowLeft', 0.7)
    await asyncio.sleep(0.4)
    a1 = await page.evaluate(f'() => ({{...{POSE}}})')
    dyaw = abs(math.atan2(math.sin(a1['camYaw'] - a0['camYaw']), math.cos(a1['camYaw'] - a0['camYaw'])) + (a1.get('camYawOffset', 0) - a0.get('camYawOffset', 0)) * 0)
    dpos = math.hypot(a1['x'] - a0['x'], a1['z'] - a0['z'])
    check(f'{sid} S5 an arrow key turns only the camera', dyaw > 0.2 and dpos < 0.15, {'camTurn': round(dyaw, 3), 'moved': round(dpos, 3)})

    # S6 minimap + coordinates
    mm = await page.evaluate("() => { const m = document.querySelector('[data-testid=mars-minimap]'); const c = document.querySelector('[data-testid=mars-coords]'); return { minimap: m && m.dataset.shown, coords: c && c.innerText } }")
    check(f'{sid} S6 minimap shown by default; coordinates displayed', mm['minimap'] == 'on' and mm['coords'] and ('°N' in mm['coords'] or '°S' in mm['coords']), mm)

    # S7 go next to the main hardware (RestoreState puts the explorer beside it, facing it), inspect
    main = site_def['hardware'][0]
    hx, hz = got[main['id']]['x'], got[main['id']]['z']
    dist = main['radius'] + 3.5
    # approach from the side facing away from any other hardware (e.g. Spirit's lander right next to the rover)
    others = [got[h['id']] for h in site_def['hardware'][1:] if h['id'] in got]
    ux, uz = -0.6, -0.8
    if others:
        cx, cz = sum(o['x'] for o in others) / len(others), sum(o['z'] for o in others) / len(others)
        L = math.hypot(hx - cx, hz - cz) or 1
        ux, uz = (hx - cx) / L, (hz - cz) / L
    px, pz = hx + dist * ux, hz + dist * uz
    heading = math.atan2(hx - px, hz - pz)
    await page.evaluate(f"() => window.__marsBridge.send('RestoreState', JSON.stringify({{x: {px}, z: {pz}, heading: {heading}, camYawOffset: 0, camPitch: {0.25 if site_def['mode'] == 'rover' else 0.12}, camDist: 7.5}}))")
    ok = await wait_for(page, f"{POSE} && {POSE}.near === '{main['id']}'", 15)
    await asyncio.sleep(1.2)
    await page.screenshot(path=str(out / f'{sid}_02_near.png'))
    prompt = await page.evaluate("() => { const p = document.querySelector('.surf-prompt'); return p ? p.innerText : null }")
    check(f'{sid} S7 next to {main["id"]}: inspect prompt', ok and prompt and 'Inspect' in prompt, prompt)
    await page.keyboard.press('KeyE')
    ok = await wait_for(page, f"document.querySelector('[data-testid=site-inspector]') && {POSE}.mode === 'Inspect'", 10)
    await asyncio.sleep(1.8)
    await page.screenshot(path=str(out / f'{sid}_03_inspect.png'))
    check(f'{sid} S7 E opens the record and Unity frames the hardware', ok, await page.evaluate(f'() => {POSE}.inspect'))
    mode = await page.evaluate('() => window.__input.mode()')
    check(f'{sid} S7 inspection owns the keys (HARDWARE_INSPECTION)', mode == 'HARDWARE_INSPECTION', mode)
    # a component (first one the model really has)
    comps = [c for c in main['components'] if any(x['id'] == c['id'] and x['renderers'] > 0 for x in got[main['id']].get('components') or [])]
    if comps:
        await page.click("[data-testid=site-inspector] [role=tab]:nth-child(2)")
        await asyncio.sleep(0.3)
        await page.click(f"[data-testid=site-inspector] .site-parts li:nth-child(2) button")
        ok = await wait_for(page, f"{POSE}.inspect && {POSE}.inspect.component === '{comps[0]['id']}'", 8)
        await asyncio.sleep(1.8)
        await page.screenshot(path=str(out / f'{sid}_04_component_{comps[0]["id"]}.png'))
        check(f'{sid} S7 component {comps[0]["id"]} framed and highlighted on the model', ok)
    else:
        rep['checks'].append({'check': f'{sid} S7 component highlight', 'pass': None, 'detail': 'SKIP: this model has no separately named parts (whole-vehicle inspection only)'})
        print(f'[SKIP] {sid} S7 component highlight - model has no separate parts', flush=True)
    await page.keyboard.press('Escape')
    ok = await wait_for(page, f"!document.querySelector('[data-testid=site-inspector]') && {POSE}.mode === 'Explore'", 8)
    check(f'{sid} S7 Esc closes the record, back to exploration', ok)

    # S8 map
    await page.keyboard.press('KeyM')
    ok = await wait_for(page, "document.querySelector('.mars-map')", 5)
    await asyncio.sleep(0.4)
    if sid == 'pathfinder':
        await page.screenshot(path=str(out / f'{sid}_05_site_map.png'))
    await page.keyboard.press('Escape')
    closed = await wait_for(page, "!document.querySelector('.mars-map')", 5)
    check(f'{sid} S8 site map opens and closes', ok and closed)

    # S9 frame time (Unity's own) over ~4 s of driving/walking
    samples = []
    await page.keyboard.down('KeyW')
    for _ in range(4):
        await asyncio.sleep(1.05)
        samples.append(await page.evaluate('() => window.__mars && window.__mars.stats'))
    await page.keyboard.up('KeyW')
    s = [x for x in samples if x]
    r['stats'] = s[-1] if s else None
    p50 = sorted(x['msP50'] for x in s)[len(s) // 2] if s else None
    r['msP50'] = p50
    check(f'{sid} S9 frame time recorded (Balanced, Unity msP50)', p50 is not None, {'msP50': p50, 'drawCalls': s[-1].get('drawCalls') if s else None, 'totalUsedMB': s[-1].get('totalUsedMB') if s else None, 'rocks': s[-1].get('rockInstances') if s else None})
    await page.screenshot(path=str(out / f'{sid}_06_moving.png'))

    # errors seen while this site ran
    errs = [l for l in logs if l.startswith('error') or 'PAGEERROR' in l or '[Mars] site load failed' in l or 'Exception' in l]
    r['consoleErrors'] = errs[:20]
    r['unityLogLines'] = [l for l in logs if 'ERROR' in l or '[Mars]' in l][:20]
    check(f'{sid} no console / Unity errors', not errs, errs[:3])

    # S10 leave
    await page.locator('[data-testid=return-to-orbit]').first.click()
    ok = await wait_for(page, "!window.__store.getState().surfaceSiteId && !window.__marsBridge.running()", 30)
    check(f'{sid} S10 Return to orbit quits the player', ok)
    await asyncio.sleep(2)


async def main(base, out: Path, only):
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 1366, 'height': 768})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        logs: list = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text[:400]}'))
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR {str(e)[:300]}'))
        await page.goto(base, wait_until='domcontentloaded')
        await wait_for(page, 'window.__store && window.__input', 60)
        await asyncio.sleep(3)
        for sid in (only or SITES):
            try:
                await site_run(page, base, out, sid, logs)
            except Exception as e:
                check(f'{sid} run completed without a harness exception', False, repr(e)[:300])
                try:
                    await page.goto(base); await wait_for(page, 'window.__store', 60); await asyncio.sleep(2)
                except Exception:
                    pass
        await b.close()
    passed = sum(c['pass'] is True for c in rep['checks'])
    skipped = sum(c['pass'] is None for c in rep['checks'])
    total = len(rep['checks']) - skipped
    rep['summary'] = {'passed': passed, 'total': total, 'skipped': skipped, 'base': base}
    (out / 'm4_sites_check.json').write_text(json.dumps(rep, indent=1))
    print(f"RESULT: {'PASS' if passed == total else 'FAIL'} ({passed}/{total}, {skipped} skipped)")
    return 0 if passed == total else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:5173')
    ap.add_argument('--out', default='docs/qa/m4')
    ap.add_argument('--site', nargs='*')
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out), a.site)))
