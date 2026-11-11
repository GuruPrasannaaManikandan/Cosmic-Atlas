"""
Relive Mission live check (real Chrome, GPU): opens each mission from the main menu, plays it, jumps to the key
moments of the lifecycle and screenshots them, and checks the DOM (clock, phase, telemetry badges, event card,
timeline) plus console errors and frame times.

Usage: python scripts/e2e/relive_check.py --base http://localhost:5173 --out docs/qa/relive
"""
import argparse, asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

A11 = [('pad', -4), ('liftoff', 6), ('maxq', 83), ('staging', 163.5), ('tower-jett', 199), ('sii', 420), ('orbit', 3000), ('tli', 10000),
       ('docking', 12100), ('coast', 150000), ('loi', 273100), ('undock', 360800), ('powered-descent', 369500), ('final', 369900),
       ('landed', 370500), ('eva', 397000), ('lunar-liftoff', 447745), ('rendezvous', 460900), ('tei', 487500), ('entry', 702300), ('chutes', 702900), ('splashdown', 703300)]
MER = [('pad', -3), ('liftoff', 8), ('airlit', 64), ('fairing', 292), ('parking', 2000), ('stage3', 4300), ('cruise', 2.0e6), ('cruise-sep', None), ('entry', None),
       ('chute', None), ('airbags-rad', None), ('bounce', None), ('rest', None), ('petals', None), ('egress', None)]


async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:5173'); ap.add_argument('--out', default='docs/qa/relive')
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rep = {'missions': {}, 'console': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
        page = await (await b.new_context(viewport={'width': 1600, 'height': 900})).new_page()
        page.on('console', lambda m: rep['console'].append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: rep['console'].append('pageerror: ' + str(e)))
        await page.goto(a.base); await asyncio.sleep(5)
        await page.screenshot(path=str(out / 'menu_launchers.png'))
        rep['menuCards'] = await page.evaluate("[...document.querySelectorAll('[data-testid^=relive-]')].map(e => e.dataset.testid)")
        for mid, shots in (('apollo-11', A11), ('mer-opportunity', MER)):
            r = {'shots': {}, 'checks': {}}
            # snapshot: an explorer state to come back to
            before = await page.evaluate("(() => { const s = window.__store.getState(); s.select('jupiter'); s.setSim(Date.UTC(2031, 2, 3)); return { sel: window.__store.getState().selectedId, sim: window.__store.getState().simMs } })()")
            await page.click(f'[data-testid="relive-{mid}"]')
            await page.wait_for_selector('[data-testid="relive-intro"]', timeout=30000)
            r['checks']['intro'] = True
            await asyncio.sleep(2.5); await page.screenshot(path=str(out / f'{mid}_intro.png'))
            await page.click('[data-testid="relive-begin"]'); await asyncio.sleep(3)
            r['checks']['playing'] = await page.evaluate("document.querySelector('[data-testid=relive-root]').dataset.status")
            r['checks']['clockAfter3s'] = await page.inner_text('[data-testid="relive-clock"] b')
            if mid == 'mer-opportunity':
                ev = await page.evaluate("Object.fromEntries(window.__relive.clock.script.events.map(e=>[e.id,e.t]))")
                fill = {'cruise-sep': ev['cruise-sep'] + 20, 'entry': ev['entry'] + 80, 'chute': ev['chute'] + 4, 'airbags-rad': ev['rad'] + 0.6,
                        'bounce': ev['impact'] + 8, 'rest': ev['rest'] + 30, 'petals': ev['petals'] + 30, 'egress': ev['egress'] - 30}
                shots = [(n, fill.get(n, t)) for n, t in shots]
            for name, t in shots:
                await page.evaluate(f"window.__relive.relive.pause(); window.__relive.relive.seekMet({t})")
                await asyncio.sleep(2.6)
                info = await page.evaluate("""(() => { const R = document.querySelector('[data-testid=relive-root]');
                  return { phase: R.dataset.phase, clock: document.querySelector('[data-testid=relive-clock] b').textContent,
                    tele: [...document.querySelectorAll('.relive-tele-row')].map(x => x.textContent.slice(0, 80)) } })()""")
                await page.screenshot(path=str(out / f'{mid}_{name}.png'))
                r['shots'][name] = info
                print(mid, name, json.dumps(info), flush=True)
            # transport and timeline
            await page.evaluate("window.__relive.relive.seekMet(0)")
            await page.click('[data-testid="relive-next"]'); await asyncio.sleep(0.5)
            r['checks']['cardAfterNext'] = await page.is_visible('[data-testid="relive-card"]')
            await page.click('[data-testid="relive-play"]'); await asyncio.sleep(2.0)
            fps = await page.evaluate("new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3) }; requestAnimationFrame(f) })")
            r['checks']['fps'] = round(fps, 1)
            await page.screenshot(path=str(out / f'{mid}_card.png'))
            await page.click('[data-testid="relive-info"]'); await asyncio.sleep(0.5)
            r['checks']['infoPanel'] = await page.is_visible('[data-testid="relive-info-panel"]')
            await page.screenshot(path=str(out / f'{mid}_info.png'))
            await page.keyboard.press('Escape'); await asyncio.sleep(0.3)
            # the ending (conclusion card and the hand-off to the surface)
            await page.evaluate("(() => { const R = window.__relive; R.relive.seek(R.state().length - 1.5); R.relive.play() })()"); await asyncio.sleep(4)
            r['checks']['ended'] = await page.is_visible('[data-testid="relive-ended"]')
            r['checks']['handoff'] = await page.is_visible('[data-testid="relive-to-surface"]')
            await page.screenshot(path=str(out / f'{mid}_ended.png'))
            await page.click('[data-testid="relive-exit"]'); await asyncio.sleep(1.5)
            r['checks']['closed'] = await page.evaluate("!document.querySelector('[data-testid=relive-root]')")
            after = await page.evaluate("({ sel: window.__store.getState().selectedId, sim: window.__store.getState().simMs })")
            r['checks']['snapshotRestored'] = after == before
            # resume where you left off
            await page.click(f'[data-testid="relive-{mid}"]'); await page.wait_for_selector('[data-testid="relive-begin"]')
            await page.click('[data-testid="relive-begin"]'); await asyncio.sleep(1)
            await page.evaluate("window.__relive.relive.seek(window.__relive.state().length / 2); window.__relive.relive.pause()"); await asyncio.sleep(0.5)
            await page.click('[data-testid="relive-exit"]'); await asyncio.sleep(1)
            await page.click(f'[data-testid="relive-{mid}"]'); await page.wait_for_selector('[data-testid="relive-intro"]')
            r['checks']['resumeOffered'] = await page.is_visible('[data-testid="relive-resume"]')
            await page.click('[data-testid="relive-exit"]'); await asyncio.sleep(1)
            rep['missions'][mid] = r
            print(mid, json.dumps(r['checks']), flush=True)
        await b.close()
    (out / 'relive_check.json').write_text(json.dumps(rep, indent=1))
    print('console errors:', len(rep['console']), rep['console'][:8])
    need = ['intro', 'cardAfterNext', 'infoPanel', 'ended', 'handoff', 'closed', 'snapshotRestored', 'resumeOffered']
    ok = all(all(m['checks'].get(k) for k in need) and m['checks'].get('fps', 0) > 40 for m in rep['missions'].values()) and not rep['console']
    print('RESULT:', 'PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)

asyncio.run(main())
