"""
Phase 3b: every Apollo surface site in real Chrome.

For each site (Apollo 11, 12, 14, 15, 16, 17): descend, confirm the LROC NAC DTM terrain loaded (not the procedural
fallback), every catalogued object is placed, walk up to each object (teleport next to it), confirm the DISCOVERED
state and that E opens the right record with a story and specifications, screenshot, measure the frame rate, and
return to orbit. Then a touch-device pass (phone viewport, touch emulation): the joystick drives the astronaut.

Usage: python scripts/e2e/moon_sites_check.py --base http://localhost:5173 --out docs/qa/space-exploration/moon-sites
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
from pathlib import Path

from playwright.async_api import async_playwright

SITES = ["tranquility-base", "apollo-12", "apollo-14", "apollo-15", "apollo-16", "apollo-17"]
ST = "window.__store.getState()"
SU = "window.__surface.state()"
DBG = "window.__surface.debug"


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "errors": [], "sites": {}}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:300]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:170]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: rep["errors"].append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:200]))
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store && window.__nav")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.evaluate(f"() => {{ {ST}.setPlaying(false); {ST}.travel('moon', true) }}")
        await page.wait_for_timeout(1500)

        # the picker lists every Apollo site as explorable
        await page.get_by_test_id("explore-surface").click()
        n_desc = await page.locator("[data-testid^=descend-]").count()
        await page.screenshot(path=str(out / "picker.jpg"), type="jpeg", quality=82)
        check("S0 the site picker offers all six Apollo landing sites", n_desc == 6, n_desc)
        await page.keyboard.press("Escape")

        for sid in SITES:
            # descend at a sourced daylight moment for this site
            await page.evaluate(f"() => {{ const s = {ST}; s.enterSurface('{sid}') }}")
            await page.wait_for_function(f"() => window.__surface && {DBG}.terrain && {SU}.siteId === '{sid}'", timeout=60000)
            await page.evaluate(f"() => {SU}.set({{ intro: false }})")
            # light each site at its own sourced historical moment (moonwalk / day after landing)
            await page.wait_for_timeout(500)
            await page.evaluate(f"() => {ST}.setSim({DBG}.terrain().daylightMs)")
            await page.wait_for_timeout(1500)
            t = await page.evaluate(f"() => {DBG}.terrain()")
            check(f"[{sid}] LROC NAC DTM terrain loaded (not the procedural fallback)", t["kind"] == "dtm" and t["product"], t["product"])
            objs = t["objects"]
            await page.screenshot(path=str(out / f"{sid}_01_arrival.jpg"), type="jpeg", quality=82)
            fps = await page.evaluate("() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(f) })")
            site_rep = {"product": t["product"], "fps": round(fps, 1), "objects": []}
            for o in objs:
                # stand 3 m south of the object (facing north toward it) and look
                await page.evaluate(f"() => {DBG}.teleport({o['x']}, {o['z'] + 3.2 if o['model'] != 'lm-descent-stage' else o['z'] + 6.5})")
                await page.wait_for_timeout(900)
                st = await page.evaluate(f"() => ({{ disc: {SU}.discovered, near: {SU}.nearbyId }})")
                ok_disc = o["id"] in st["disc"] and st["near"] == o["id"]
                await page.keyboard.press("KeyE")
                await page.wait_for_timeout(1300)
                panel = page.locator(".discovery")
                ptxt = await panel.inner_text() if await panel.count() else ""
                await page.screenshot(path=str(out / f"{sid}_{o['id']}.jpg"), type="jpeg", quality=80)
                story_ok = False
                if await panel.count():
                    await page.get_by_role("tab", name="Historical Story").click()
                    story_ok = len((await panel.inner_text()).strip()) > 200
                    await page.get_by_role("tab", name="Technical Specifications").click()
                    specs = await panel.inner_text()
                    await page.get_by_role("button", name="Return to Exploration", exact=True).click()
                    await page.wait_for_timeout(300)
                else:
                    specs = ""
                good = ok_disc and bool(ptxt) and story_ok and ("verified" in specs.lower())
                site_rep["objects"].append({"id": o["id"], "discovered": ok_disc, "story": story_ok})
                check(f"[{sid}] {o['id']}: discovered, E opens its record, story + specs", good, {"near": st["near"], "model": o["model"]})
            check(f"[{sid}] frame rate on the surface (headless, balanced)", fps > 20, round(fps, 1))
            rep["sites"][sid] = site_rep
            await page.evaluate(f"() => {ST}.exitSurface()")
            await page.wait_for_timeout(800)

        # ------------------------------------------------------------ touch device
        await page.evaluate(f"() => {ST}.enterSurface('apollo-12')")
        await page.wait_for_function(f"() => window.__surface && {DBG}.terrain", timeout=60000)
        await page.evaluate(f"() => {SU}.set({{ intro: false }})")
        await page.wait_for_timeout(600)
        touch_on_desktop = await page.locator("[data-testid=touch-controls]").count() > 0
        await ctx.close()
        mob = await b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        await mob.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        mp = await mob.new_page()
        mp.on("pageerror", lambda e: rep["errors"].append("PAGEERROR(m) " + str(e)[:200]))
        await mp.goto(base, wait_until="networkidle")
        await mp.wait_for_function("() => window.__store")
        await mp.get_by_role("button", name="EXPLORE FREELY").click()
        await mp.evaluate(f"() => {{ {ST}.setPlaying(false); {ST}.setSim(Date.UTC(1971, 6, 31, 12)); {ST}.enterSurface('apollo-15') }}")
        await mp.wait_for_function(f"() => window.__surface && {DBG}.character", timeout=60000)
        await mp.evaluate(f"() => {SU}.set({{ intro: false }})")
        await mp.wait_for_timeout(1000)
        has_touch_ui = await mp.locator("[data-testid=touch-controls]").count() == 1
        c0 = await mp.evaluate(f"() => {DBG}.character()")
        stick = await mp.locator(".touch-stick").bounding_box()
        cx, cy = stick["x"] + stick["width"] / 2, stick["y"] + stick["height"] / 2
        # drag the joystick forward and hold (pointer events)
        await mp.mouse.move(cx, cy)
        await mp.mouse.down()
        await mp.mouse.move(cx, cy - 50, steps=5)
        await mp.wait_for_timeout(2200)
        c1 = await mp.evaluate(f"() => {DBG}.character()")
        await mp.mouse.up()
        await mp.screenshot(path=str(out / "touch_apollo15_390x844.jpg"), type="jpeg", quality=82)
        moved = math.hypot(c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2])
        check("T1 touch device: on-screen joystick shown and drives the astronaut", has_touch_ui and moved > 1.2, {"moved_m": round(moved, 2)})
        ov = await mp.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
        check("T2 phone layout: no horizontal overflow on the surface", not ov)
        rep["touchOnDesktop"] = touch_on_desktop
        check("T3 desktop (mouse) keeps the keyboard UI: no on-screen joystick", not touch_on_desktop)
        await b.close()

    errs = [e for e in rep["errors"] if "favicon" not in e]
    check("Z1 no console errors", not errs, errs[:5])
    (out / "moon_sites_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/space-exploration/moon-sites")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
