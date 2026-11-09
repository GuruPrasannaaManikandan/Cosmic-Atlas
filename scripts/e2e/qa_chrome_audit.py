"""
Chrome QA harness for the live local Cosmic Atlas site (real Google Chrome via Playwright channel="chrome").

Sections (--only to choose, default all):
  inventory  every visible interactive control in Explore, Inspector and the "More" menu is clicked on a fresh page;
             the observed effect (store state diff, dialogs/overlays opened, navigation/flight started, page errors)
             decides whether it is FUNCTIONAL, NO-OBSERVABLE-EFFECT or ERROR -> FEATURE_INVENTORY.csv
  journeys   end-to-end user journeys A-F, I, J of the QA brief with screenshots + pass/fail per step
             (G Surface Explore / H Artifact details are reported NOT IMPLEMENTED: the app has no such mode)

Evidence: <out>/screenshots, <out>/reports (JSON), <out>/logs (console + network failures per journey).
Usage: python scripts/e2e/qa_chrome_audit.py --base http://localhost:5174 --out docs/qa/2026-11-09 [--channel chrome]
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright, Page

ST = "window.__store.getState()"
SNAP = """() => { const s = window.__store.getState(), o = {};
  for (const [k, v] of Object.entries(s)) if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) o[k] = v;
  delete o.simMs; const n = window.__nav || {}; o.__flight = !!n.flight; o.__orbit = !!n.orbit; o.__follow = n.followId || null; o.__speed = n.speedMult;
  o.__buttons = document.querySelectorAll('button').length; let h = 0; for (const ch of document.body.innerText) h = (h * 31 + ch.charCodeAt(0)) | 0; o.__textHash = h; o.__overlays = document.querySelectorAll('[role=dialog], [class*=modal], [class*=overlay], .nav-menu, .results').length;
  o.__textLen = document.body.innerText.length; return o }"""
INTERACTIVE = """() => [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem]')]
  .filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth })
  .map((e, i) => { const r = e.getBoundingClientRect(); return { i, tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 60), cls: (e.className && e.className.baseVal === undefined ? e.className : '').toString().slice(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disabled: !!e.disabled, type: e.type || '' } })"""


class Run:
    def __init__(self, out: Path):
        self.out = out
        for d in ("screenshots", "reports", "logs"):
            (out / d).mkdir(parents=True, exist_ok=True)
        self.console: list[str] = []
        self.netfail: list[str] = []

    def attach(self, page: Page):
        page.on("console", lambda m: self.console.append(f"{m.type}: {m.text[:240]}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: self.console.append("PAGEERROR " + str(e)[:240]))
        page.on("requestfailed", lambda r: self.netfail.append(f"{r.method} {r.url} -> {r.failure}"))
        page.on("response", lambda r: self.netfail.append(f"{r.status} {r.url}") if r.status >= 400 else None)

    def errors(self) -> list[str]:
        return [c for c in self.console if c.startswith(("error", "PAGEERROR")) and "favicon" not in c]


async def new_page(browser, size=(1440, 900), dismiss_academy=True):
    ctx = await browser.new_context(viewport={"width": size[0], "height": size[1]})
    if dismiss_academy:
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
    return ctx, await ctx.new_page()


async def to_explore(page: Page, base: str):
    await page.goto(base, wait_until="networkidle")
    await page.wait_for_function("() => window.__store && window.__nav", timeout=60000)
    await page.get_by_role("button", name="EXPLORE FREELY").click()
    await page.wait_for_timeout(600)


# ------------------------------------------------------------------------------------------------ inventory
async def inventory(browser, base: str, run: Run):
    rows = []
    async def survey(state: str, prepare):
        ctx, page = await new_page(browser)
        await prepare(page)
        items = await page.evaluate(INTERACTIVE)
        await ctx.close()
        for it in items:
            ctx, page = await new_page(browser)
            errs: list[str] = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))
            page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "favicon" not in m.text else None)
            result, detail = "UNTESTED", ""
            try:
                await prepare(page)
                cur = await page.evaluate(INTERACTIVE)
                match = [c for c in cur if c["tag"] == it["tag"] and c["name"] == it["name"] and abs(c["x"] - it["x"]) < 4 and abs(c["y"] - it["y"]) < 4]
                if not match:
                    result, detail = "NOT-REPRODUCIBLE", "control not present on fresh page"
                elif it["disabled"]:
                    result, detail = "DISABLED", ""
                elif it["tag"] in ("input", "textarea") and it["type"] not in ("checkbox", "range", "date", "datetime-local"):
                    loc = page.locator("button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem]")
                    before = await page.evaluate(SNAP)
                    await page.mouse.click(it["x"] + it["w"] / 2, it["y"] + it["h"] / 2)
                    await page.keyboard.type("Mars", delay=30)
                    await page.wait_for_timeout(700)
                    after = await page.evaluate(SNAP)
                    focus = await page.evaluate("() => document.activeElement && document.activeElement.tagName")
                    diff = {k: (before.get(k), after.get(k)) for k in set(before) | set(after) if before.get(k) != after.get(k)}
                    result = "FUNCTIONAL" if focus in ("INPUT", "TEXTAREA") and diff else ("FOCUSABLE" if focus in ("INPUT", "TEXTAREA") else "NO-OBSERVABLE-EFFECT")
                    detail = json.dumps(diff)[:300]
                elif it["tag"] == "select":
                    before = await page.evaluate(SNAP)
                    sel = page.locator("select").nth([c for c in cur if c["tag"] == "select"].index(match[0]))
                    opts = await sel.evaluate("s => [...s.options].map(o => o.value)")
                    val = await sel.input_value()
                    new = next((o for o in opts if o != val), val)
                    await sel.select_option(new)
                    await page.wait_for_timeout(900)
                    after = await page.evaluate(SNAP)
                    diff = {k: (before.get(k), after.get(k)) for k in set(before) | set(after) if before.get(k) != after.get(k)}
                    result, detail = ("FUNCTIONAL" if diff else "NO-OBSERVABLE-EFFECT"), f"{val} -> {new} " + json.dumps(diff)[:250]
                else:
                    before = await page.evaluate(SNAP)
                    if "label" in it["cls"] and it["name"]:   # 3D scene labels move every frame: click by text, not stale coordinates
                        await page.locator("button.label").filter(has_text=it["name"].lstrip("✦✧ ")).first.click(timeout=5000)
                    else:
                        await page.mouse.click(it["x"] + it["w"] / 2, it["y"] + it["h"] / 2)
                    await page.wait_for_timeout(1100)
                    after = await page.evaluate(SNAP)
                    diff = {k: (before.get(k), after.get(k)) for k in set(before) | set(after) if before.get(k) != after.get(k) and k not in ("__textLen", "__textHash")}
                    if not diff and before["__textHash"] != after["__textHash"]:
                        diff["__textHash"] = "visible text changed"
                    text_delta = after["__textLen"] - before["__textLen"]
                    if not diff and abs(text_delta) > 20:
                        diff["__textLen"] = (before["__textLen"], after["__textLen"])
                    result = "FUNCTIONAL" if diff else "NO-OBSERVABLE-EFFECT"
                    detail = json.dumps(diff)[:300]
                if errs:
                    result, detail = "ERROR", "; ".join(errs[:2])
            except Exception as e:  # noqa: BLE001
                result, detail = "HARNESS-ERROR", str(e)[:200]
            rows.append({"state": state, **{k: it[k] for k in ("tag", "role", "name", "cls", "x", "y", "w", "h", "disabled")}, "result": result, "detail": detail})
            print(f"{state:10s} {it['tag']:6s} {it['name'][:34]:34s} -> {result}")
            await ctx.close()

    async def explore(page):
        await to_explore(page, base)

    async def inspector(page):
        await to_explore(page, base)
        await page.evaluate(f"() => {ST}.select('earth')")
        await page.wait_for_timeout(700)

    async def more_menu(page):
        await to_explore(page, base)
        await page.get_by_role("button", name="More").first.click()
        await page.wait_for_timeout(500)

    for name, prep in (("explore", explore), ("inspector", inspector), ("more-menu", more_menu)):
        await survey(name, prep)
    # de-duplicate: a control that exists in several states keeps one row per state (state matters for reachability)
    path = run.out / "reports" / "FEATURE_INVENTORY.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    summary = {}
    for r in rows:
        summary[r["result"]] = summary.get(r["result"], 0) + 1
    print("inventory:", summary)
    return rows


# ------------------------------------------------------------------------------------------------ journeys
async def journeys(browser, base: str, run: Run):
    report = []

    def step(j, name, ok, detail=""):
        report.append({"journey": j, "step": name, "pass": bool(ok), "detail": str(detail)[:240]})
        print(f"[{'PASS' if ok else 'FAIL'}] {j}: {name} {('- ' + str(detail)[:140]) if detail else ''}")

    async def shot(page, name):
        p = run.out / "screenshots" / f"{name}.png"
        await page.screenshot(path=str(p))
        return p.name

    # A — Basic app
    ctx, page = await new_page(browser, dismiss_academy=False)
    run.attach(page)
    t0 = time.time()
    await page.goto(base, wait_until="domcontentloaded")
    await page.wait_for_function("() => window.__store && document.querySelector('canvas')", timeout=60000)
    step("A", "page loads, canvas present", True, f"{time.time() - t0:.1f} s to canvas")
    await page.wait_for_timeout(2500)
    await shot(page, "A1_initial_screen")
    academy = await page.locator("[class*=academy]").count()
    step("A", "first-visit Academy prompt shown (expected for a new visitor)", academy > 0, f"{academy} academy elements")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(500)
    if await page.get_by_role("button", name="EXPLORE FREELY").count():
        await page.get_by_role("button", name="EXPLORE FREELY").click()
    await page.wait_for_timeout(700)
    step("A", "universe visible in Explore", await page.evaluate(f"() => {ST}.phase") == "explore")
    await page.evaluate(f"() => {ST}.select('earth')")
    await page.wait_for_timeout(800)
    insp = await page.locator("aside, [class*=inspector]").filter(has_text="Earth").count()
    step("A", "select Earth -> inspector shows Earth", insp > 0 and await page.evaluate(f"() => {ST}.rightOpen"))
    await shot(page, "A2_inspector_earth")
    await page.get_by_role("button", name="Close inspector").click()
    await page.wait_for_timeout(500)
    step("A", "close inspector", not await page.evaluate(f"() => {ST}.rightOpen"))
    step("A", "no console errors", not run.errors(), run.errors()[:2])

    # B — Solar System
    jump = page.get_by_role("button", name="Solar System").first
    if await jump.count():
        await jump.click()
    else:
        await page.evaluate(f"() => {ST}.travel('sun')")
    await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
    await page.wait_for_timeout(800)
    await shot(page, "B1_solar_system")
    scale_before = await page.evaluate("() => window.__nav.scale")
    await page.evaluate(f"() => {ST}.travel('jupiter')")
    await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
    await page.wait_for_timeout(1500)
    labels = await page.evaluate("() => (window.__labelState.items || []).map(i => i.id)")
    moons = [m for m in ("io", "europa", "ganymede", "callisto") if m in labels]
    step("B", "select Jupiter -> planet and Galilean moons render", len(moons) == 4, f"labelled: {moons}")
    await shot(page, "B2_jupiter_system")
    t_a = await page.evaluate(f"() => {ST}.simMs")
    await page.evaluate(f"() => {{ {ST}.setRate(1); {ST}.setPlaying(true) }}")
    await page.wait_for_timeout(2000)
    await page.evaluate(f"() => {ST}.setPlaying(false)")
    t_b = await page.evaluate(f"() => {ST}.simMs")
    step("B", "time controls advance the system", (t_b - t_a) / 86400000 > 1.5, f"{(t_b - t_a) / 86400000:.2f} days in 2 s at 1 d/s")
    crumb = page.locator(".crumb-item").filter(has_text="Milky Way")
    if await crumb.count():
        await crumb.first.click()
        try:
            await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
        except Exception:  # noqa: BLE001
            pass
        await page.wait_for_timeout(800)
    scale_after = await page.evaluate("() => window.__nav.scale")
    step("B", "breadcrumb returns to a larger scale", scale_after > scale_before * 100, f"scale {scale_before:.3g} -> {scale_after:.3g}")
    await shot(page, "B3_breadcrumb_milky_way")
    await ctx.close()

    # C — Search
    ctx, page = await new_page(browser)
    run.attach(page)
    await to_explore(page, base)
    box = page.get_by_placeholder("Search universe", exact=False)
    await box.click()
    await box.type("Jupi", delay=60)
    await page.wait_for_timeout(500)
    sugg = page.locator(".results button").filter(has_text="Jupiter")
    step("C", "typing shows suggestions", await sugg.count() > 0, await page.locator(".results button").count())
    await shot(page, "C1_search_suggestions")
    await sugg.first.click()
    await page.wait_for_timeout(400)
    flying = await page.evaluate("() => !!window.__nav.flight")
    step("C", "selecting a result moves the camera", flying or await page.evaluate("() => window.__nav.nearestId") == "jupiter")
    await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
    step("C", "inspector shows Jupiter", await page.evaluate(f"() => {ST}.selectedId") == "jupiter" and await page.locator("aside, [class*=inspector]").filter(has_text="Jupiter").count() > 0)
    await box.click()
    await box.fill("zzqqxx-no-such-object")
    await page.wait_for_timeout(500)
    empty = await page.locator(".results").inner_text() if await page.locator(".results").count() else ""
    step("C", "no-match query shows an empty-state / live-lookup option", len(empty) > 0, empty[:80])
    clear = page.locator(".search-clear")
    if await clear.count():
        await clear.click()
    step("C", "clear search empties the field", await box.input_value() == "")
    await page.keyboard.press("Escape")
    await ctx.close()

    # D — Travel (journey-level; the 18-check matrix lives in travel_controls.py)
    ctx, page = await new_page(browser)
    run.attach(page)
    await to_explore(page, base)
    await page.get_by_role("button", name="Travel Mode").first.click()
    await page.wait_for_timeout(1500)
    step("D", "enter Travel Mode", await page.evaluate(f"() => {ST}.phase") == "travel")
    p0 = await page.evaluate("() => [...window.__ship.localKm || window.__ship.pos || []]")
    await page.keyboard.down("w")
    await page.wait_for_timeout(1500)
    await page.keyboard.up("w")
    p1 = await page.evaluate("() => [...window.__ship.localKm || window.__ship.pos || []]")
    moved = p0 and p1 and any(abs(a - b) > 1e-9 for a, b in zip(p0, p1))
    step("D", "W thrust moves the ship", moved, f"{p0[:3] if p0 else p0} -> {p1[:3] if p1 else p1}")
    # typing in the search box must not fly the ship
    sbox = page.get_by_placeholder("Search universe", exact=False)
    if await sbox.count():
        q0 = await page.evaluate("() => [...window.__ship.localKm || []]")
        await sbox.click()
        await sbox.type("wwwwssssaaaadddd", delay=25)
        await page.wait_for_timeout(500)
        q1 = await page.evaluate("() => [...window.__ship.localKm || []]")
        th = await page.evaluate("() => window.__ship.thrust")
        step("D", "typing in search does not drive the ship", th == 0 or th is None, f"thrust={th}")
        await sbox.fill("")
        await page.keyboard.press("Escape")
    await page.keyboard.press("m")
    await page.wait_for_timeout(700)
    nm = await page.evaluate(f"() => {ST}.navMapOpen")
    step("D", "nav map opens with M", nm)
    await shot(page, "D1_navmap")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(400)
    await page.set_viewport_size({"width": 1024, "height": 700})
    await page.wait_for_timeout(600)
    await page.set_viewport_size({"width": 1440, "height": 900})
    await page.evaluate("() => window.dispatchEvent(new Event('blur'))")
    step("D", "window resize + blur keep Travel Mode alive", await page.evaluate(f"() => {ST}.phase") == "travel" and not run.errors(), run.errors()[:2])
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(600)
    step("D", "Escape exits Travel Mode", await page.evaluate(f"() => {ST}.phase") == "explore")
    await ctx.close()

    # E — Timeline
    ctx, page = await new_page(browser)
    run.attach(page)
    await to_explore(page, base)
    await page.evaluate(f"() => {ST}.travel('earth')")          # the Time Engine bar is shown at Solar System scale
    await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
    date_in = page.get_by_label("Simulation date (UTC)")
    step("E", "Time Engine visible at Solar System scale", await date_in.count() > 0)
    if await date_in.count():
        await date_in.fill("2030-06-15T12:00")
        await page.wait_for_timeout(600)
    yr = await page.evaluate(f"() => new Date({ST}.simMs).getUTCFullYear()")
    step("E", "set date via the date picker", yr == 2030, f"sim year {yr}")
    await page.evaluate(f"() => {ST}.select('mars')")
    m0 = await page.evaluate("() => window.__navApi ? window.__navApi.positionOf('mars', window.__store.getState().simMs) : null")
    s0 = await page.evaluate(f"() => {ST}.simMs")
    await page.get_by_role("button", name="Reverse", exact=True).click()
    await page.get_by_role("button", name="Play", exact=True).click()
    await page.wait_for_timeout(1500)
    rate = await page.evaluate(f"() => ({{ r: {ST}.daysPerSec, p: {ST}.playing, dt: ({ST}.simMs - {s0}) / 86400000 }})")
    step("E", "Reverse + Play runs time backwards", rate["r"] < 0 and rate["p"] and rate["dt"] < 0, rate)
    await page.get_by_role("button", name="Pause", exact=True).click()
    step("E", "Pause stops time", not await page.evaluate(f"() => {ST}.playing"))
    await page.evaluate(f"() => {ST}.setPlaying(false)")
    m1 = await page.evaluate("() => window.__navApi ? window.__navApi.positionOf('mars', window.__store.getState().simMs) : null")
    step("E", "celestial state changes consistently with time", m0 and m1 and m0 != m1)
    now_btn = page.get_by_role("button", name="Now", exact=True)
    if await now_btn.count():
        await now_btn.first.click()
        await page.wait_for_timeout(500)
    dt = abs(await page.evaluate(f"() => {ST}.simMs - Date.now()")) / 1000
    step("E", "Now returns to the present", dt < 120, f"|sim - now| = {dt:.0f} s")
    await shot(page, "E1_timeline")
    await ctx.close()

    # F — Cosmic event
    ctx, page = await new_page(browser)
    run.attach(page)
    await to_explore(page, base)
    await page.evaluate(f"() => {ST}.select('saturn')")
    before = await page.evaluate(f"() => ({{ sel: {ST}.selectedId, phase: {ST}.phase, pos: [...window.__nav.pos] }})")
    await page.get_by_role("button", name="Cosmic Events").first.click()
    await page.wait_for_timeout(800)
    await page.locator(".event-card button").first.click()
    await page.wait_for_timeout(3000)
    await shot(page, "F1_cosmic_event_running")
    txt = await page.locator("body").inner_text()
    step("F", "event scene loads with narrative/labels", len(txt) > 200 and await page.get_by_role("button", name="Exit", exact=False).count() > 0)
    await page.get_by_role("button", name="Exit", exact=False).first.click()
    await page.wait_for_timeout(1200)
    after = await page.evaluate(f"() => ({{ sel: {ST}.selectedId, phase: {ST}.phase, pos: [...window.__nav.pos] }})")
    same_pos = all(abs(a - b) < 1e-6 * max(1, abs(a)) for a, b in zip(before["pos"], after["pos"]))
    step("F", "exit restores the previous scene (phase, selection, camera)", after["phase"] == before["phase"] and after["sel"] == before["sel"] and same_pos, f"{before['sel']}/{before['phase']} -> {after['sel']}/{after['phase']}, camera kept={same_pos}")
    await shot(page, "F2_after_event_exit")
    await ctx.close()

    # G / H — not implemented in the app
    step("G", "Surface Explore (Moon/Mars/Titan)", False, "NOT IMPLEMENTED: no surface/explore mode exists in the frontend or Unity project")
    step("H", "Artifact details (rover/instrument inspection)", False, "NOT IMPLEMENTED: no artifact/rover models or inspection UI exist")

    # I — Failure recovery: API 500, API unreachable, missing static asset
    for mode in ("500", "abort"):
        ctx, page = await new_page(browser)
        run.attach(page)
        if mode == "500":
            await page.route("**/api/**", lambda r: r.fulfill(status=500, content_type="application/json", body='{"detail":"injected failure"}'))
        else:
            await page.route("**/api/**", lambda r: r.abort("connectionrefused"))
        await page.route("**/main_belt_sbdb*.json", lambda r: r.fulfill(status=404, body="missing"))
        await to_explore(page, base)
        box = page.get_by_placeholder("Search universe", exact=False)
        await box.click()
        await box.fill("Qqzx Unlisted 4711")
        await page.wait_for_timeout(400)
        await box.press("Enter")
        await page.wait_for_timeout(2500)
        res = await page.locator(".results").inner_text() if await page.locator(".results").count() else "(results panel closed)"
        spinner = "searching" in res.lower() or "querying" in res.lower()
        step("I", f"API {mode}: live lookup shows an actionable error, no endless spinner", ("unreachable" in res.lower() or "fail" in res.lower() or "error" in res.lower() or "injected" in res.lower()) and not spinner, res[:120])
        await page.keyboard.press("Escape")
        await page.evaluate(f"() => {ST}.select('earth')")
        await page.wait_for_timeout(500)
        hz = page.locator("button.btn").filter(has_text="Horizons")
        if await hz.count():
            await hz.first.click()
            await page.wait_for_timeout(2000)
            err = page.locator("p.err")
            body = (await err.first.inner_text()) if await err.count() else "(no error element)"
            step("I", f"API {mode}: Horizons check reports the failure in the inspector", await err.count() > 0, body[:140])
        await page.evaluate(f"() => {ST}.travel('mars')")
        await page.wait_for_timeout(1500)
        step("I", f"API {mode} + missing asteroid data: app stays usable (navigation works)", await page.evaluate("() => !!window.__nav.flight || window.__nav.nearestId === 'mars'"))
        await shot(page, f"I_{mode}_failure_state")
        await ctx.close()

    # J — Responsive key flows
    for size in ((1366, 768), (768, 1024), (430, 932), (390, 844)):
        ctx, page = await new_page(browser, size=size)
        run.attach(page)
        await to_explore(page, base)
        tag = f"{size[0]}x{size[1]}"
        search_vis = await page.get_by_placeholder("Search universe", exact=False).is_visible() if await page.get_by_placeholder("Search universe", exact=False).count() else False
        if not search_vis:
            await page.get_by_role("button", name="More").first.click()
            await page.wait_for_timeout(300)
        await page.evaluate(f"() => {ST}.select('mars')")
        await page.wait_for_timeout(700)
        close = page.get_by_role("button", name="Close inspector")
        ok_insp = await close.count() > 0 and await close.first.is_visible()
        box = await close.first.bounding_box() if ok_insp else None
        in_view = box is not None and box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= size[0] + 1 and box["y"] + box["height"] <= size[1] + 1
        step("J", f"{tag}: inspector opens with an on-screen close control", ok_insp and in_view, box)
        await shot(page, f"J_{tag}_inspector")
        if ok_insp:
            await close.first.click()
        await page.keyboard.press("Escape")
        tm = page.get_by_role("button", name="Travel Mode")
        if not (await tm.count() and await tm.first.is_visible()):
            await page.get_by_role("button", name="More").first.click()
            await page.wait_for_timeout(300)
            tm = page.get_by_role("menuitem", name="Travel Mode")
        if await tm.count() and await tm.first.is_visible():
            await tm.first.click()
            await page.wait_for_timeout(1200)
            ph = await page.evaluate(f"() => {ST}.phase")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)
            step("J", f"{tag}: Travel Mode reachable and exits with Escape", ph == "travel" and await page.evaluate(f"() => {ST}.phase") == "explore", ph)
        else:
            step("J", f"{tag}: Travel Mode reachable", False, "button not visible even in More menu")
        await ctx.close()

    (run.out / "reports" / "journeys.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    (run.out / "logs" / "journeys_console.log").write_text("\n".join(run.console), encoding="utf-8")
    (run.out / "logs" / "journeys_network_failures.log").write_text("\n".join(run.netfail), encoding="utf-8")
    return report


async def main(a) -> int:
    out = Path(a.out)
    run = Run(out)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel=a.channel, headless=not a.headed,
                                          args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        meta = {"browser": f"{a.channel} {browser.version}", "base": a.base}
        (out / "reports").mkdir(parents=True, exist_ok=True)
        (out / "reports" / f"run_meta_{a.only}.json").write_text(json.dumps(meta, indent=1))
        print(meta)
        ok = True
        if a.only in ("all", "inventory"):
            rows = await inventory(browser, a.base, run)
            ok &= not any(r["result"] in ("ERROR",) for r in rows)
        if a.only in ("all", "journeys"):
            rep = await journeys(browser, a.base, run)
            impl = [r for r in rep if r["journey"] not in ("G", "H")]
            print(f"journeys: {sum(r['pass'] for r in impl)}/{len(impl)} implemented-journey steps pass; G/H not implemented")
            ok &= all(r["pass"] for r in impl)
        await browser.close()
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5174")
    ap.add_argument("--out", default="docs/qa/2026-11-09")
    ap.add_argument("--channel", default="chrome")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--only", default="all", choices=["all", "inventory", "journeys"])
    sys.exit(asyncio.run(main(ap.parse_args())))
