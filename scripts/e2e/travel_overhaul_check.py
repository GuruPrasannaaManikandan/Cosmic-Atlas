"""
Chrome verification of the Travel / warp-flight / contextual-UI overhaul on the live local site.

Journeys (state captured before departure, during flight and after arrival; screenshots in --out):
  W  Explore warp chain Earth -> Moon -> Mars -> Phobos -> Jupiter -> Europa -> Saturn -> Titan -> Neptune:
     every leg must depart from the previous arrival (first-frame displacement ~0), arrive at the target's framing
     distance, keep the flight HUD compact and off the centre of the view, and hide the large panels in flight.
  C  Mid-flight cancellation with the real Cancel button: position holds; the next flight departs from there.
  T  Travel Mode: entry keeps the exact view; autopilot (via search) accelerates then decelerates and arrives;
     W leaves the autopilot engaged and P switches to manual; braking (B) reduces the measured speed; V cycles camera modes;
     nav map opens docked, minimizes, expands, closes.
  P  Contextual panels: default view uncluttered; Catalogue (L), Inspector (chip Details / I), Timeline (T).
  R  Responsive screenshots. Plus: DOM inventory of the Travel HUD controls, console/page errors.

Usage: python scripts/e2e/travel_overhaul_check.py --base http://localhost:5173 --out docs/qa/travel-mode-overhaul
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
LEGS = ["moon", "mars", "phobos", "jupiter", "europa", "saturn", "titan", "neptune"]


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "legs": [], "travel": {}, "inventory": [], "errors": []}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:300]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:150]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        rep["browser"] = f"chrome {b.version}"
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: rep["errors"].append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:200]))
        shot = lambda name: page.screenshot(path=str(out / f"{name}.png"))
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store && window.__nav && window.__navApi")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.evaluate(f"() => {ST}.setPlaying(false)")
        await page.wait_for_timeout(800)

        # ---------------------------------------------------------------- P: default exploration view
        st0 = await page.evaluate(f"() => ({{ left: {ST}.leftOpen, right: {ST}.rightOpen, time: {ST}.timeOpen, panels: document.querySelectorAll('.panel').length, timebar: document.querySelectorAll('.timebar').length }})")
        check("P1 default view: no Catalogue, Inspector or Timeline open", not st0["left"] and not st0["right"] and st0["panels"] == 0 and st0["timebar"] == 0, st0)
        await page.evaluate(f"() => {ST}.travel('earth')")
        await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
        await page.wait_for_timeout(600)
        await shot("01_default_exploration_view_earth")
        chip = await page.locator(".sel-chip").count()
        insp = await page.locator(".panel.right, aside.panel").count()
        check("P2 selecting Earth shows a compact chip, not the Inspector", chip == 1 and await page.evaluate(f"() => !{ST}.rightOpen"), {"chip": chip})

        # ---------------------------------------------------------------- W: warp chain with continuity
        hud_boxes = []
        for i, target in enumerate(LEGS):
            before = await page.evaluate("() => [...window.__nav.pos]")
            await page.evaluate(f"() => {ST}.travel('{target}')")
            await page.wait_for_timeout(40)
            first = await page.evaluate("() => [...window.__nav.pos]")
            dep_target = await page.evaluate(f"(b) => {{ const P = window.__navApi.positionOf('{target}', {ST}.simMs); return Math.hypot(b[0]-P[0], b[1]-P[1], b[2]-P[2]) }}", before)
            moved = math.dist(before, first)
            samples, panels_in_flight = [], []
            k = 0
            while await page.evaluate("() => !!window.__nav.flight") and k < 400:
                s = await page.evaluate(f"""() => {{ const t = window.__travel || null; const h = document.querySelector('.flight-hud'); const r = h ? h.getBoundingClientRect() : null;
                    const P = window.__navApi.positionOf('{target}', {ST}.simMs), n = window.__nav.pos;
                    return {{ d: Math.hypot(n[0]-P[0], n[1]-P[1], n[2]-P[2]), hud: r ? [r.x, r.y, r.width, r.height] : null, panels: document.querySelectorAll('.panel, .timebar').length,
                             text: h ? h.innerText.replace(/\\s+/g, ' ').slice(0, 120) : '' }} }}""")
                samples.append(s)
                if s["hud"]:
                    hud_boxes.append(s["hud"])
                panels_in_flight.append(s["panels"])
                if i < 2 and len(samples) in (3, 10, 18):
                    await shot(f"0{2 + i}_{target}_flight_{len(samples)}")
                k += 1
                await page.wait_for_timeout(120)
            await page.wait_for_timeout(500)
            after = await page.evaluate(f"""() => {{ const P = window.__navApi.positionOf('{target}', {ST}.simMs), n = window.__nav.pos;
                return {{ d: Math.hypot(n[0]-P[0], n[1]-P[1], n[2]-P[2]), R: window.__navApi.radiusLy('{target}'), follow: window.__nav.followId, pos: [...n] }} }}""")
            ds = [s["d"] for s in samples]
            mono = all(ds[j + 1] <= ds[j] * 1.0001 for j in range(len(ds) - 1)) if len(ds) > 2 else True
            leg = {"leg": f"{(LEGS[i - 1] if i else 'earth')} -> {target}", "departureDistanceLy": dep_target, "firstFrameDisplacementLy": moved,
                   "firstFrameDisplacementFraction": moved / dep_target if dep_target else None, "samples": len(samples), "distanceMonotonic": mono,
                   "arrivalDistanceR": after["d"] / after["R"], "followId": after["follow"], "panelsVisibleInFlight": max(panels_in_flight or [0]),
                   "hudText": samples[len(samples) // 2]["text"] if samples else ""}
            rep["legs"].append(leg)
            ok = leg["firstFrameDisplacementFraction"] is not None and leg["firstFrameDisplacementFraction"] < 0.05 and after["follow"] == target and leg["panelsVisibleInFlight"] == 0 and len(samples) > 3
            check(f"W{i + 1} {leg['leg']}: departs from previous arrival, arrives, panels hidden in flight", ok,
                  f"first-frame move {100 * (leg['firstFrameDisplacementFraction'] or 0):.3f}% of route, arrival {leg['arrivalDistanceR']:.1f} R, distance monotonic={mono}")
            if i == 1:
                await shot("04_mars_arrival")
        if hud_boxes:
            W, H = 1440, 900
            area = max(w * h for _, _, w, h in hud_boxes) / (W * H)
            covers_centre = any(x < W / 2 < x + w and y < H / 2 < y + h for x, y, w, h in hud_boxes)
            check("W HUD is compact (< 3 % of the viewport) and never covers the centre", area < 0.03 and not covers_centre, {"maxAreaFraction": round(area, 4), "coversCentre": covers_centre})

        # ---------------------------------------------------------------- C: mid-flight cancellation
        await page.evaluate(f"() => {ST}.travel('earth', true)")
        await page.wait_for_timeout(500)
        await page.evaluate(f"() => {ST}.travel('mars')")
        await page.wait_for_function("() => window.__nav.flight && window.__nav.flight.t > 0.45", timeout=30000)
        await shot("05_mid_flight_before_cancel")
        await page.get_by_role("button", name="Cancel flight").click()
        c1 = await page.evaluate("() => [...window.__nav.pos]")
        await page.wait_for_timeout(700)
        c2 = await page.evaluate("() => [...window.__nav.pos]")
        flying = await page.evaluate("() => !!window.__nav.flight")
        await shot("06_after_cancel")
        check("C1 Cancel stops the flight and holds the actual position", not flying and math.dist(c1, c2) == 0, {"drift": math.dist(c1, c2)})
        await page.evaluate(f"() => {ST}.travel('jupiter')")
        await page.wait_for_timeout(40)
        c3 = await page.evaluate("() => [...window.__nav.pos]")
        dj = await page.evaluate(f"(b) => {{ const P = window.__navApi.positionOf('jupiter', {ST}.simMs); return Math.hypot(b[0]-P[0], b[1]-P[1], b[2]-P[2]) }}", c2)
        check("C2 the next flight departs from the cancellation point", math.dist(c2, c3) / dj < 0.05, {"firstFrameFraction": math.dist(c2, c3) / dj})
        await page.wait_for_function("() => !window.__nav.flight", timeout=60000)

        # ---------------------------------------------------------------- T: Travel Mode
        await page.evaluate(f"() => {ST}.travel('earth', true)")
        await page.wait_for_timeout(600)
        cam = await page.evaluate("() => ({ pos: [...window.__nav.pos], q: [window.__nav.quat.x, window.__nav.quat.y, window.__nav.quat.z, window.__nav.quat.w] })")
        await page.get_by_role("button", name="Travel Mode").first.click()
        await page.wait_for_timeout(1200)
        sh = await page.evaluate("() => ({ pos: [...window.__ship.pos], q: [window.__ship.quat.x, window.__ship.quat.y, window.__ship.quat.z, window.__ship.quat.w], v: Math.hypot(...window.__ship.vel), ref: window.__ship.refBodyId })")
        qdot = abs(sum(a * b_ for a, b_ in zip(cam["q"], sh["q"])))
        check("T1 entering Travel Mode keeps the exact view (position, orientation) at rest", math.dist(cam["pos"], sh["pos"]) < 1e-15 and qdot > 0.999999 and sh["v"] == 0, {"posDelta": math.dist(cam["pos"], sh["pos"]), "quatDot": qdot, "speed": sh["v"], "ref": sh["ref"]})
        await shot("07_travel_mode_entered_at_earth")
        # DOM inventory of the Travel HUD controls
        rep["inventory"] = await page.evaluate("""() => [...document.querySelectorAll('button, [role=button], input, select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight })
            .map(e => { const r = e.getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.innerText || e.title || '').trim().replace(/\\s+/g, ' ').slice(0, 50), role: e.getAttribute('role') || e.tagName.toLowerCase(), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], enabled: !e.disabled } })""")
        unnamed = [i for i in rep["inventory"] if not i["name"]]
        weak = [i for i in rep["inventory"] if len(i["name"]) < 2]
        check("T2 every visible Travel-Mode control has a meaningful accessible name", not unnamed and not weak, {"controls": len(rep["inventory"]), "unnamed": unnamed[:5]})
        # autopilot to the Moon via the same destination request the search uses
        start = await page.evaluate("() => [...window.__ship.pos]")
        await page.evaluate(f"() => {ST}.travel('moon')")
        await page.wait_for_timeout(60)
        ap = await page.evaluate("() => ({ active: window.__ship.autopilot.active, dest: window.__ship.autopilot.destinationId, pos: [...window.__ship.pos] })")
        check("T3 destination request engages the autopilot from the current ship position", ap["active"] and ap["dest"] == "moon" and math.dist(ap["pos"], start) < 1e-9, {"teleport": math.dist(ap["pos"], start)})
        speeds, phases = [], []
        for k in range(160):
            s = await page.evaluate("() => ({ v: Math.hypot(...window.__ship.vel), ph: window.__ship.autopilot.phase, on: window.__ship.autopilot.active, arrived: window.__ship.arrivedId })")
            speeds.append(s["v"]); phases.append(s["ph"])
            if k == 12:
                await shot("08_autopilot_departure_chase")
            if k == 40:
                await shot("09_autopilot_cruise")
            if not s["on"]:
                break
            await page.wait_for_timeout(250)
        peak = max(speeds) if speeds else 0
        ipk = speeds.index(peak) if speeds else 0
        decel = speeds[-1] < 0.2 * peak if speeds else False
        arrived = await page.evaluate("() => ({ arrived: window.__ship.arrivedId, active: window.__ship.autopilot.active, d: (() => { const P = window.__navApi.positionOf('moon', window.__store.getState().simMs), s = window.__ship.pos; return Math.hypot(s[0]-P[0], s[1]-P[1], s[2]-P[2]) / window.__navApi.radiusLy('moon') })() })")
        rep["travel"]["autopilotMoon"] = {"samples": len(speeds), "peakSpeedLyS": peak, "peakIndex": ipk, "finalSpeedLyS": speeds[-1] if speeds else None, "phases": sorted(set(phases)), "arrival": arrived}
        check("T4 autopilot accelerates, decelerates and arrives at the Moon", 0 < ipk < len(speeds) - 1 and decel and not arrived["active"] and arrived["d"] < 50, rep["travel"]["autopilotMoon"])
        await shot("10_moon_arrival_travel_mode")
        # manual override + throttle + braking
        await page.evaluate(f"() => {ST}.travel('mars')")
        await page.wait_for_timeout(1500)
        # Gameplay Controls rule (16.3): a movement key never cancels automatic travel; P switches explicitly
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(400)
        kept = await page.evaluate("() => ({ active: window.__ship.autopilot.active })")
        await page.keyboard.up("KeyW")
        await page.keyboard.press("KeyP")
        await page.wait_for_timeout(300)
        ov = await page.evaluate("() => ({ active: window.__ship.autopilot.active })")
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(1600)
        await page.keyboard.up("KeyW")
        v_before = await page.evaluate("() => Math.hypot(...window.__ship.vel)")
        await shot("11_manual_flight")
        await page.keyboard.down("KeyB")
        await page.wait_for_timeout(1500)
        await page.keyboard.up("KeyB")
        v_after = await page.evaluate("() => Math.hypot(...window.__ship.vel)")
        check("T5a W alone does NOT cancel the autopilot", kept["active"], kept)
        check("T5 P switches to manual piloting; W then flies the ship", not ov["active"] and v_before > 0, {"afterP": ov, "speed": v_before})
        check("T6 braking (B) reduces the actual velocity", v_after < 0.6 * v_before and v_before > 0, {"before": v_before, "after": v_after})
        # camera modes
        views = []
        for k in range(3):
            views.append(await page.evaluate("() => window.__ship.cameraView"))
            await shot(f"12_camera_{views[-1]}")
            await page.keyboard.press("KeyV")
            await page.wait_for_timeout(500)
        check("T7 V cycles cockpit / chase / external", len(set(views)) == 3, views)
        # nav map
        await page.keyboard.press("KeyM")
        await page.wait_for_timeout(600)
        nm = await page.evaluate("() => { const c = document.querySelector('.navmap-card'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, modalBackdrop: !!document.querySelector('.modal .navmap-card') } }")
        await shot("13_navigation_map_docked")
        centre_free = nm and (nm["x"] > 1440 / 2 or nm["x"] + nm["w"] < 1440 / 2)
        check("T8 nav map opens docked (no dimming backdrop) and leaves the centre visible", bool(nm) and not nm["modalBackdrop"] and centre_free, nm)
        await page.get_by_role("button", name="Minimize navigation map").click()
        await page.wait_for_timeout(300)
        mini = await page.locator(".navmap-mini").count()
        await shot("14_navigation_map_minimized")
        await page.get_by_role("button", name="Expand navigation map").click()
        await page.wait_for_timeout(300)
        await page.get_by_role("button", name="Close Navigation Map").first.click()
        await page.wait_for_timeout(300)
        check("T9 nav map minimizes, expands and closes", mini == 1 and not await page.evaluate(f"() => {ST}.navMapOpen"))
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)
        check("T10 Escape exits Travel Mode to Explore", await page.evaluate(f"() => {ST}.phase") == "explore")

        # ---------------------------------------------------------------- P: panels on demand
        await page.evaluate(f"() => {ST}.travel('saturn', true)")
        await page.wait_for_timeout(600)
        await page.keyboard.press("KeyL")
        await page.wait_for_timeout(400)
        cat = await page.locator(".panel.left, aside.panel").count()
        await shot("15_catalogue_opened")
        await page.get_by_role("button", name="Details").click()
        await page.wait_for_timeout(400)
        inspector = await page.evaluate(f"() => {ST}.rightOpen")
        await shot("16_inspector_opened")
        await page.keyboard.press("KeyT")
        await page.wait_for_timeout(400)
        tb = await page.locator(".timebar").count()
        await shot("17_timeline_opened")
        check("P3 Catalogue (L), Inspector (Details), Timeline (T) open on demand", cat >= 1 and inspector and tb == 1, {"catalogue": cat, "inspector": inspector, "timeline": tb})
        await page.evaluate(f"() => {ST}.travel('uranus')")
        await page.wait_for_timeout(900)
        in_flight = await page.evaluate("() => ({ panels: document.querySelectorAll('.panel').length, timebar: document.querySelectorAll('.timebar').length })")
        await shot("18_panels_hidden_during_warp")
        await page.wait_for_function("() => !window.__nav.flight", timeout=60000)
        await page.wait_for_timeout(500)
        restored = await page.evaluate("() => ({ panels: document.querySelectorAll('.panel').length, timebar: document.querySelectorAll('.timebar').length })")
        check("P4 panels step aside during warp and return after arrival", in_flight["panels"] == 0 and in_flight["timebar"] == 0 and restored["panels"] >= 1 and restored["timebar"] == 1, {"inFlight": in_flight, "restored": restored})
        await page.keyboard.press("KeyL")
        await page.keyboard.press("KeyI")
        await page.keyboard.press("KeyT")
        await page.wait_for_timeout(400)
        await shot("19_full_screen_exploration")
        # typing guard: the shortcuts must not fire inside the search box
        box = page.get_by_placeholder("Search universe", exact=False)
        await box.click()
        await box.type("lit", delay=40)
        typed = await page.evaluate(f"() => ({{ left: {ST}.leftOpen, right: {ST}.rightOpen, time: {ST}.timeOpen }})")
        await box.fill("")
        await page.keyboard.press("Escape")
        check("P5 panel shortcuts do not fire while typing", not any(typed.values()), typed)

        # ---------------------------------------------------------------- R: responsive
        for w, h in ((1366, 768), (768, 1024), (390, 844)):
            await page.set_viewport_size({"width": w, "height": h})
            await page.evaluate(f"() => {ST}.select('mars')")
            await page.wait_for_timeout(500)
            await shot(f"20_responsive_{w}x{h}")
            box = await page.evaluate("() => { const c = document.querySelector('.sel-chip'); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom] }")
            check(f"R {w}x{h}: selection chip fully on screen", box is not None and box[0] >= 0 and box[2] <= w + 0.5, box)
        await b.close()

    rep["errors"] = [e for e in rep["errors"] if "favicon" not in e]
    check("No console errors or uncaught exceptions", not rep["errors"], rep["errors"][:3])
    (out / "travel_overhaul_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/travel-mode-overhaul")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
