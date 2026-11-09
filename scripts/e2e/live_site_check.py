"""
Deployed-site verification (production build: no dev-only hooks, so only the UI and window.__store / __nav are used).

Clean browser profile (no cache) in Google Chrome; records which bundle the site serves, then exercises: initial load,
Solar System navigation, planet selection chip + Inspector, search, timeline, Travel Mode (entry continuity,
autopilot, nav map docked/minimize/close, exit), Cosmic Events, Academy, settings (Flight speed / reduce motion),
responsive layouts, and console / failed-network / 4xx-5xx evidence. A hard reload with the HTTP cache disabled is
also checked to serve the same bundle.

Usage: python scripts/e2e/live_site_check.py --base https://cosmic-atlas-jk2e.onrender.com --out docs/qa/deployment
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ST = "window.__store.getState()"


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"base": base, "checks": [], "console": [], "network": []}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:300]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:150]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        rep["browser"] = f"chrome {b.version}"
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})  # fresh profile = clean cache
        page = await ctx.new_page()
        page.on("console", lambda m: rep["console"].append(f"{m.type}: {m.text[:200]}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: rep["console"].append("PAGEERROR " + str(e)[:200]))
        page.on("requestfailed", lambda r: rep["network"].append(f"FAILED {r.url} {r.failure}"))
        page.on("response", lambda r: rep["network"].append(f"{r.status} {r.url}") if r.status >= 400 else None)
        shot = lambda n: page.screenshot(path=str(out / f"{n}.jpg"), type="jpeg", quality=82)

        resp = await page.goto(base, wait_until="domcontentloaded", timeout=120000)
        html = await page.content()
        import re
        rep["servedBundle"] = sorted(set(re.findall(r"assets/[A-Za-z0-9_.-]+\.(?:js|css)", html)))
        rep["cacheControl"] = resp.headers.get("cache-control") if resp else None
        await page.wait_for_function("() => window.__store && window.__nav && document.querySelector('canvas')", timeout=120000)
        await page.wait_for_timeout(2500)
        await shot("live_01_initial_load")
        check("L1 initial load: app and 3-D canvas start", True, {"bundle": rep["servedBundle"], "cacheControl": rep["cacheControl"]})
        # first-visit Academy offer may appear for a clean profile
        if await page.get_by_role("button", name="EXPLORE FREELY").count() == 0:
            await page.keyboard.press("Escape")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.wait_for_timeout(600)
        panels = await page.evaluate(f"() => ({{ left: {ST}.leftOpen, right: {ST}.rightOpen, timeOpen: {ST}.timeOpen }})")
        check("L2 contextual UI deployed: no panels open by default", panels.get("timeOpen") is False and not panels["left"] and not panels["right"], panels)

        # Solar System navigation + selection + inspector
        await page.evaluate(f"() => {ST}.travel('jupiter')")
        hud = None
        for _ in range(30):
            await page.wait_for_timeout(150)
            hud = await page.evaluate("() => { const h = document.querySelector('.flight-hud'); return h ? h.innerText.replace(/\\s+/g, ' ') : null }")
            if hud:
                break
        await shot("live_02_warp_hud")
        check("L3 compact warp-flight HUD deployed", bool(hud) and await page.locator(".travel-progress-hud").count() == 0, hud)
        await page.wait_for_function("() => !window.__nav.flight", timeout=90000)
        await page.wait_for_timeout(1500)
        labels = await page.evaluate("() => (window.__labelState && window.__labelState.items || []).map(i => i.id)")
        check("L4 Solar System navigation: Jupiter and Galilean moons", all(m in labels for m in ("io", "europa", "ganymede", "callisto")), [m for m in ("io", "europa", "ganymede", "callisto") if m in labels])
        await shot("live_03_jupiter")
        chip = await page.locator(".sel-chip").count()
        await page.get_by_role("button", name="Details").click()
        await page.wait_for_timeout(600)
        insp = await page.locator("aside, [class*=inspector]").filter(has_text="Jupiter").count()
        await shot("live_04_inspector")
        check("L5 selection chip and on-demand Inspector", chip == 1 and insp > 0, {"chip": chip, "inspector": insp})

        # Search
        box = page.get_by_placeholder("Search universe", exact=False)
        await box.click()
        await box.type("Satur", delay=50)
        await page.wait_for_timeout(500)
        sugg = page.locator(".results button").filter(has_text="Saturn")
        n = await sugg.count()
        if n:
            await sugg.first.click()
        await page.wait_for_function("() => !window.__nav.flight", timeout=90000)
        await page.wait_for_timeout(1200)
        await shot("live_05_saturn_via_search")
        check("L6 search: suggestion selects and flies to Saturn", n > 0 and await page.evaluate(f"() => {ST}.selectedId") == "saturn")

        # Timeline
        await page.get_by_role("button", name="Show timeline (T)").click()
        await page.wait_for_timeout(500)
        t0 = await page.evaluate(f"() => {ST}.simMs")
        await page.get_by_role("button", name="Play", exact=True).click()
        await page.wait_for_timeout(1500)
        await page.get_by_role("button", name="Pause", exact=True).click()
        t1 = await page.evaluate(f"() => {ST}.simMs")
        await shot("live_06_timeline")
        check("L7 timeline opens on demand and plays", await page.locator(".timebar").count() == 1 and t1 > t0, {"advancedDays": (t1 - t0) / 86400000})

        # Travel Mode: entry continuity, autopilot, nav map, exit
        cam = await page.evaluate("() => [...window.__nav.pos]")
        await page.get_by_role("button", name="Travel Mode").first.click()
        await page.wait_for_timeout(1500)
        sh = await page.evaluate("() => ({ pos: [...window.__ship.pos], v: Math.hypot(...window.__ship.vel) })")
        check("L8 Travel Mode entry keeps the exact view at rest", math.dist(cam, sh["pos"]) < 1e-12 and sh["v"] == 0, {"delta": math.dist(cam, sh["pos"]), "speed": sh["v"]})
        await shot("live_07_travel_mode")
        await page.evaluate(f"() => {ST}.travel('titan')")
        await page.wait_for_timeout(300)
        ap = await page.evaluate("() => ({ active: window.__ship.autopilot.active, dest: window.__ship.autopilot.destinationId })")
        check("L9 destination request engages the spacecraft autopilot", ap["active"] and ap["dest"] == "titan", ap)
        await page.wait_for_timeout(3000)
        await page.keyboard.press("KeyM")
        await page.wait_for_timeout(800)
        nm = await page.evaluate("() => ({ card: !!document.querySelector('.navmap-overlay .navmap-card'), modal: !!document.querySelector('.modal .navmap-card') })")
        await shot("live_08_navmap")
        await page.get_by_role("button", name="Minimize navigation map").click()
        await page.wait_for_timeout(300)
        mini = await page.locator(".navmap-mini").count()
        await page.get_by_role("button", name="Close Navigation Map").first.click()
        check("L10 nav map docked, minimizes and closes", nm["card"] and not nm["modal"] and mini == 1, nm)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(800)
        check("L11 Escape returns to Explore", await page.evaluate(f"() => {ST}.phase") == "explore")

        # Cosmic Events and Academy
        await page.get_by_role("button", name="Cosmic Events").first.click()
        await page.wait_for_timeout(800)
        await page.locator(".event-card button").first.click()
        await page.wait_for_timeout(3000)
        await shot("live_09_cosmic_event")
        ex = page.get_by_role("button", name="Exit", exact=False)
        ok_ev = await ex.count() > 0
        if ok_ev:
            await ex.first.click()
            await page.wait_for_timeout(800)
        check("L12 Cosmic Event runs and exits", ok_ev)
        await page.get_by_role("button", name="Academy").first.click()
        await page.wait_for_timeout(1000)
        ac = await page.locator("[class*=academy]").count()
        await shot("live_10_academy")
        await page.keyboard.press("Escape")
        check("L13 Cosmic Academy opens", ac > 0, ac)

        # Settings
        sel = page.get_by_label("Warp flight speed")
        has_flight = await sel.count() > 0
        if has_flight:
            await sel.select_option("2")
        check("L14 flight speed / reduce-motion settings present", has_flight and await page.get_by_role("button", name="Reduce motion").count() > 0)

        # Responsive
        for w, h in ((1366, 768), (768, 1024), (390, 844)):
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(600)
            ov = await page.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
            await shot(f"live_11_responsive_{w}x{h}")
            check(f"L15 {w}x{h}: no horizontal overflow", not ov)

        # Hard reload with the HTTP cache disabled serves the same bundle
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        await page.reload(wait_until="domcontentloaded")
        html2 = await page.content()
        b2 = sorted(set(re.findall(r"assets/[A-Za-z0-9_.-]+\.(?:js|css)", html2)))
        check("L16 hard reload (cache disabled) serves the same bundle", b2 == rep["servedBundle"], b2)
        await b.close()

    errs = [c for c in rep["console"] if c.startswith(("error", "PAGEERROR"))]
    net = [n for n in rep["network"]]
    check("L17 no console errors or failed / 4xx-5xx requests", not errs and not net, {"consoleErrors": errs[:5], "network": net[:5]})
    (out / "live_site_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://cosmic-atlas-jk2e.onrender.com")
    ap.add_argument("--out", default="docs/qa/deployment")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
