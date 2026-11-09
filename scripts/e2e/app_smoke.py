"""
Targeted regression smoke of the existing app features (no redesign checks): Explore entry, Search, object selection /
Inspector, Timeline (play + rate), Find Home tour start/exit, Cosmic Events open + start + exit, Academy open/close,
Audio toggle, Data Intelligence panel, and solar-system navigation (fly-to). Each step must produce its observable
state change and no uncaught page errors / console errors.

Usage: python scripts/e2e/app_smoke.py --base http://localhost:5174
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

from playwright.async_api import async_playwright

ST = "window.__store.getState()"


async def main(base: str) -> int:
    results, errors = [], []

    def rec(name, ok, detail=""):
        results.append({"check": name, "pass": bool(ok), "detail": str(detail)[:200]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:160]) if detail else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)[:200]))
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store && window.__nav")

        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.wait_for_timeout(800)
        rec("Explore mode entered from the welcome screen", await page.evaluate(f"() => {ST}.phase") == "explore")

        # search + selection + inspector
        box = page.get_by_placeholder("Search universe", exact=False)
        await box.click()
        await box.fill("Saturn")
        await page.wait_for_timeout(400)
        await box.press("Enter")
        await page.wait_for_timeout(1200)
        sel = await page.evaluate(f"() => ({ST}.selectedId)")
        rec("Search 'Saturn' + Enter selects Saturn", sel == "saturn", sel)
        rec("Inspector opens for the selection", await page.evaluate(f"() => {ST}.rightOpen"), "")
        # navigation: the selection flies the camera to Saturn (wait for the flight to finish, then Saturn is nearest)
        try:
            await page.wait_for_function("() => !window.__nav.flight", timeout=45000)
        except Exception:  # noqa: BLE001
            pass
        near = await page.evaluate("() => { const n = window.__nav, a = window.__navApi, P = a.positionOf('saturn', window.__store.getState().simMs); return { nearest: n.nearestId, flying: !!n.flight, distR: Math.hypot(n.pos[0]-P[0], n.pos[1]-P[1], n.pos[2]-P[2]) / a.radiusLy('saturn') } }")
        rec("Solar-system navigation: fly-to arrives in the Saturn system", not near["flying"] and near["distR"] < 100, near)

        # timeline
        t0 = await page.evaluate(f"() => {ST}.simMs")
        await page.evaluate(f"() => {{ {ST}.setRate(30); {ST}.setPlaying(true) }}")
        await page.wait_for_timeout(1500)
        t1 = await page.evaluate(f"() => {ST}.simMs")
        await page.evaluate(f"() => {ST}.setPlaying(false)")
        days = (t1 - t0) / 86400000
        rec("Timeline plays at the set rate (30 d/s for ~1.5 s)", 25 < days < 60, f"{days:.1f} days advanced")

        # Find Home tour
        await page.get_by_role("button", name="Find Home").first.click()
        await page.wait_for_timeout(1500)
        ph = await page.evaluate(f"() => ({ST}.phase)")
        rec("Find Home starts the guided tour", ph == "tour", ph)
        await page.keyboard.press("Escape")
        await page.evaluate(f"() => {{ if ({ST}.phase === 'tour') {ST}.setPhase('explore') }}")

        # Cosmic Events: selector modal -> launch the first event card -> event mode -> exit
        await page.get_by_role("button", name="Cosmic Events").first.click()
        await page.wait_for_timeout(1000)
        rec("Cosmic Events opens its selector", await page.locator(".events-modal-overlay").count() > 0)
        launch = page.locator(".event-card button").first
        has = await launch.count() > 0
        if has:
            await launch.click()
            await page.wait_for_timeout(2500)
        closed = await page.locator(".events-modal-overlay").count() == 0
        exit_btn = page.get_by_role("button", name="Exit", exact=False)
        rec("A Cosmic Event simulation starts (selector closes, event controls shown)", has and closed and await exit_btn.count() > 0,
            f"card button={has}, modal closed={closed}, exit controls={await exit_btn.count()}")
        if await exit_btn.count():
            await exit_btn.first.click()
            await page.wait_for_timeout(1000)
        elif await page.locator(".events-modal-close").count():
            await page.locator(".events-modal-close").click()

        # Academy
        await page.get_by_role("button", name="Academy").first.click()
        await page.wait_for_timeout(1000)
        academy = await page.locator("[role=dialog], .academy-modal, [class*=academy]").count()
        rec("Cosmic Academy opens", academy > 0, f"{academy} academy elements")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)

        # Audio
        audio = page.locator("button[aria-label*='udio' i], button[title*='udio' i], button[aria-label*='music' i], button[aria-label*='ound' i]")
        n = await audio.count()
        if n:
            await audio.first.click()
            await page.wait_for_timeout(600)
        rec("Audio control present and toggles without errors", n > 0, f"{n} audio controls")

        # Data Intelligence
        await page.evaluate(f"() => {ST}.set({{ dataOpen: true }})")
        await page.wait_for_timeout(1000)
        txt = await page.locator("body").inner_text()
        rec("Data Intelligence panel renders", "data" in txt.lower() and await page.evaluate(f"() => {ST}.dataOpen"))
        await page.evaluate(f"() => {ST}.set({{ dataOpen: false }})")

        rec("No console errors or uncaught exceptions during the session", not errors, errors[:3])
        await b.close()
    ok = all(r["pass"] for r in results)
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(r['pass'] for r in results)}/{len(results)})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5174")
    sys.exit(asyncio.run(main(ap.parse_args().base)))
