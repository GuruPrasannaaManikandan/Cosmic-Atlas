"""
Explore expedition live check (M3; real Chrome, GPU): Earth -> Moon / Mars -> landing and deployment on the surface
-> Return to orbit -> back in the orbital explorer, with no cut from orbit to the ground. Screenshots each stage and
checks the DOM / state. Also: Skip still lands (it jumps to the end of the flight), and Cancel restores the explorer.

Usage: python scripts/e2e/expedition_check.py --base http://localhost:5173 --out docs/qa/expedition
"""
import argparse, asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

RESULTS = []


def check(name, ok, detail=None):
    RESULTS.append({'check': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail is not None else ''), flush=True)


async def wait_for(page, js, timeout, step=0.25):
    for _ in range(int(timeout / step)):
        try:
            if await page.evaluate(js):
                return True
        except Exception:
            pass
        await asyncio.sleep(step)
    return False


async def phase_shots(page, out, prefix, picks):
    """seek the running flight to fractions of each phase and screenshot"""
    phases = await page.evaluate("window.__relive.clock.script.phases.map(p => [p.id, p.t0, p.t1])")
    for pid, f in picks:
        ph = next(p for p in phases if p[0] == pid)
        t = ph[1] + (ph[2] - ph[1]) * f
        await page.evaluate(f"window.__relive.relive.pause(); window.__relive.relive.seekMet({t})")
        await asyncio.sleep(2.6)
        await page.screenshot(path=str(out / f'{prefix}_{pid}_{int(f * 100)}.png'))
        st = await page.evaluate("window.__expedition.state().stage")
        print(prefix, pid, f, 'stage', st, flush=True)
    await page.evaluate("window.__relive.relive.play()")


async def finish_flight(page):
    await page.evaluate("(() => { const R = window.__relive; R.relive.seek(R.state().length - 1.2); R.relive.play() })()")


async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:5173'); ap.add_argument('--out', default='docs/qa/expedition')
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    console = []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        page = await (await b.new_context(viewport={'width': 1600, 'height': 900})).new_page()
        page.on('console', lambda m: console.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: console.append('pageerror: ' + str(e)))
        await page.goto(a.base); await asyncio.sleep(5)

        # ── MOON
        await page.click('[data-testid=start-expedition-moon]'); await asyncio.sleep(1.2)
        check('E01 Moon expedition opens the conceptual flight', await page.evaluate("document.querySelector('[data-testid=relive-root]')?.dataset.kind === 'expedition'"))
        check('E02 starts at Earth departure', await page.evaluate("window.__expedition.state().stage") == 'departure')
        check('E03 flight is autonomous (keyboard owned by the UI)', await page.evaluate("window.__input.mode()") == 'UI_INTERACTION')
        check('E04 the flight is labelled conceptual', 'CONCEPTUAL' in (await page.inner_text('.relive-title .eyebrow')))
        await phase_shots(page, out, 'moon', [('depart', 0.02), ('depart', 0.06), ('coast', 0.5), ('orbit', 0.2), ('descent', 0.6), ('descent', 0.97)])
        stages = await page.evaluate("window.__expedition.state().stage")
        check('E05 the stage follows the flight (descent = arrival)', stages == 'arrival', stages)
        await finish_flight(page)
        ok = await wait_for(page, "window.__store.getState().surfaceSiteId === 'tranquility-base'", 30)
        check('E06 the flight ends at Tranquility Base (no separate cut from orbit)', ok)
        ok = await wait_for(page, "document.querySelector('[data-testid=surface-lander]')?.dataset.phase === 'descent'", 60)
        check('E07 the lander flies its final descent on the measured terrain', ok)
        await asyncio.sleep(9); await page.screenshot(path=str(out / 'moon_surface_landing.png'))
        await asyncio.sleep(14); await page.screenshot(path=str(out / 'moon_surface_touchdown.png'))
        ok = await wait_for(page, "!window.__surface.state().intro && window.__surface.state().lander.phase === 'parked'", 25)
        check('E08 egress: control returns to the astronaut after the landing', ok)
        await asyncio.sleep(1.5); await page.screenshot(path=str(out / 'moon_surface_egress.png'))
        ch = await page.evaluate("window.__surface.debug.character()")
        check('E09 the astronaut stands at the foot of the ramp', ch and abs(ch['vel'][0]) < 1, ch and [round(x, 1) for x in ch['pos']])
        await page.keyboard.down('KeyW'); await asyncio.sleep(1.5); await page.keyboard.up('KeyW')
        moved = await page.evaluate("window.__surface.debug.character().pos")
        check('E10 WASD walks after landing', abs(moved[0] - ch['pos'][0]) + abs(moved[2] - ch['pos'][2]) > 0.5)
        await page.click('[data-testid=return-to-orbit]'); await asyncio.sleep(6)
        check('E11 Return to orbit: the lander lifts off from the surface', await page.evaluate("window.__surface.state().lander.phase") == 'ascent')
        await page.screenshot(path=str(out / 'moon_surface_liftoff.png'))
        ok = await wait_for(page, "window.__relive && window.__relive.state().id && window.__relive.clock.script.direction === 'return'", 30)
        check('E12 the return flight takes over above the site', ok)
        await asyncio.sleep(3); await page.screenshot(path=str(out / 'moon_return_ascent.png'))
        await phase_shots(page, out, 'moon_return', [('tei', 0.6), ('home', 0.5), ('home', 0.98)])
        await finish_flight(page)
        ok = await wait_for(page, "!window.__relive.state().id && !window.__store.getState().surfaceSiteId", 20)
        check('E13 back in the orbital explorer after the return', ok)
        check('E14 ends at Earth', await page.evaluate("window.__store.getState().selectedId") == 'earth')
        await asyncio.sleep(2); await page.screenshot(path=str(out / 'moon_back_in_orbit.png'))

        # Skip and Cancel
        await page.evaluate("window.__expedition.start('moon')"); await asyncio.sleep(1)
        await page.click('[data-testid=expedition-skip]')
        ok = await wait_for(page, "document.querySelector('[data-testid=surface-lander]')?.dataset.phase === 'descent'", 30)
        check('E15 Skip jumps to the end of the flight and still lands', ok)
        await wait_for(page, "!window.__surface.state().intro", 40)
        await page.evaluate("window.__store.getState().exitSurface()"); await asyncio.sleep(1.5)
        before = await page.evaluate("(() => { const s = window.__store.getState(); s.select('saturn'); return window.__store.getState().selectedId })()")
        await page.evaluate("window.__expedition.start('moon')"); await asyncio.sleep(1)
        await page.click('[data-testid=expedition-cancel]'); await asyncio.sleep(1)
        check('E16 Cancel restores the explorer', await page.evaluate("!window.__relive.state().id && window.__store.getState().selectedId") == before)

        # ── MARS
        await page.evaluate("window.__store.getState().set({ phase: 'explore' })")
        await page.evaluate("window.__expedition.start('mars')"); await asyncio.sleep(1.2)
        check('E21 Mars expedition opens the conceptual flight at departure', await page.evaluate("window.__expedition.state().stage") == 'departure')
        await phase_shots(page, out, 'mars', [('depart', 0.05), ('cruise', 0.5), ('approach', 0.7), ('entry', 0.5), ('landing', 0.2), ('landing', 0.9), ('deploy', 0.25), ('deploy', 0.8)])
        await finish_flight(page)
        ok = await wait_for(page, "!!document.querySelector('[data-testid=mars-root]')", 40)
        check('E22 the Mars surface opens after the landing and deployment', ok)
        ok = await wait_for(page, "!!(window.__marsBridge && window.__marsBridge.last.ready)", 150)
        check('E23 Unity Mars ready', ok)
        ok = await wait_for(page, "window.__marsBridge.last.pose && window.__marsBridge.last.pose.mode === 'Explore'", 40)
        check('E24 opens in exploration at the rover (the landing already happened)', ok)
        await asyncio.sleep(4); await page.screenshot(path=str(out / 'mars_surface_at_rover.png'))
        await page.click('[data-testid=return-to-orbit]'); await asyncio.sleep(1.5)
        ok = await wait_for(page, "window.__relive.state().id && window.__relive.clock.script.direction === 'return'", 20)
        check('E25 Return to orbit: the view climbs away; the rover stays', ok)
        await asyncio.sleep(2); await page.screenshot(path=str(out / 'mars_return_rise.png'))
        await phase_shots(page, out, 'mars_return', [('rise', 0.7), ('orbit', 0.8)])
        await finish_flight(page)
        ok = await wait_for(page, "!window.__relive.state().id && !window.__store.getState().surfaceSiteId", 20)
        check('E26 back in the orbital explorer at Mars', ok and await page.evaluate("window.__store.getState().selectedId") == 'mars')
        await asyncio.sleep(2); await page.screenshot(path=str(out / 'mars_back_in_orbit.png'))
        await b.close()
    check('E30 no console errors', not console, console[:6])
    (out / 'expedition_check.json').write_text(json.dumps({'results': RESULTS, 'console': console}, indent=1))
    n = sum(r['pass'] for r in RESULTS)
    print(f'{n}/{len(RESULTS)} checks passed')
    sys.exit(0 if n == len(RESULTS) else 1)

asyncio.run(main())
