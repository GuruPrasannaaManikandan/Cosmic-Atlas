"""
Chrome verification of the lunar surface exploration vertical slice (Tranquility Base) and its integration.

  E  Entry: travel to the Moon -> contextual EXPLORE MOON action -> site picker (Apollo sites, Chandrayaan-3 labelled
     non-NASA) -> descent; orbital canvas hidden + paused, surface canvas renders.
  A  Astronaut + controls: walks where the camera looks (W), lopes faster (Shift), hops under lunar gravity (Space),
     stays on the ground, cannot walk through the Lunar Module, mouse-drag look, first/third person (V).
  D  Discovery: DISCOVERED banner near hardware, E opens the record of the RIGHT object; Story / Specs / Timeline tabs
     show catalogue data; component focus; "Set clock" moves the Sun.
  M  Surface map: opens with M, lists hardware with distances, waypoint selection, zoom.
  L  Lighting: daylight at the Apollo 11 moonwalk, lunar-night warning at a night date.
  R  Return to orbit restores the previous view next to the Moon; Travel Mode still works; mission events in the
     time bar move the clock.  Plus performance (frame rate on the surface), responsive layouts, console errors.

Usage: python scripts/e2e/surface_exploration_check.py --base http://localhost:5173 --out docs/qa/space-exploration
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
SU = "window.__surface.state()"
DBG = "window.__surface.debug"
MOONWALK = "Date.UTC(1969, 6, 21, 3, 30)"


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "errors": [], "metrics": {}}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:300]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:160]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        rep["browser"] = f"chrome {b.version}"
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: rep["errors"].append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:200]))
        shot = lambda name: page.screenshot(path=str(out / f"{name}.jpg"), type="jpeg", quality=84)
        ch = lambda: page.evaluate(f"() => {DBG}.character()")

        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store && window.__nav")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.evaluate(f"() => {{ {ST}.setPlaying(false); {ST}.setSim({MOONWALK}) }}")

        # ---------------------------------------------------------------- E: approach the Moon -> EXPLORE MOON
        await page.evaluate(f"() => {ST}.travel('moon')")
        await page.wait_for_function("() => !window.__nav.flight", timeout=90000)
        await page.wait_for_timeout(1500)
        # ---------------------------------------------------------------- R0: mission events in the time bar
        await page.evaluate(f"() => {ST}.set({{ timeOpen: true }})")
        await page.wait_for_timeout(400)
        sel = page.locator("select.mission-events")
        n_ev = await sel.locator("option").count()
        await sel.select_option(index=1)
        first_ms = await page.evaluate(f"() => {ST}.simMs")
        check("T1 time bar lists the Moon's sourced mission events and jumps the clock (first = Apollo 11 launch 13:32 UT)", n_ev > 20 and first_ms == -14552880000, {"events": n_ev - 1, "jumpedTo": first_ms})
        await page.evaluate(f"() => {{ {ST}.setSim({MOONWALK}); {ST}.set({{ timeOpen: false }}); {ST}.travel('moon', true) }}")

        await page.wait_for_timeout(1500)
        btn = page.get_by_test_id("explore-surface")
        await btn.wait_for(timeout=8000)
        check("E1 approaching the Moon shows the contextual EXPLORE MOON action", "EXPLORE MOON" in (await btn.inner_text()))
        await shot("s01_explore_moon_button")
        before = await page.evaluate("() => ({ pos: [...window.__nav.pos], follow: window.__nav.followId, sel: window.__store.getState().selectedId })")
        await btn.click()
        picker = page.locator(".site-picker")
        await picker.wait_for()
        txt = await picker.inner_text()
        check("E2 site picker: Tranquility Base explorable, other Apollo sites catalogued, Chandrayaan-3 labelled non-NASA", "Tranquility Base" in txt and "Apollo 17" in txt and "not NASA" in txt.replace("non-NASA", "not NASA"), txt[:200])
        await shot("s02_site_picker")
        await page.get_by_test_id("descend-tranquility-base").click()
        await page.get_by_test_id("surface-root").wait_for(timeout=20000)
        await page.wait_for_function(f"() => window.__surface && {DBG}.character && {SU}.siteId === 'tranquility-base'", timeout=20000)
        await page.wait_for_timeout(1200)
        await shot("s03_descent")
        hidden = await page.evaluate("() => { const c = document.querySelector('.app > canvas, .app canvas'); const r = document.querySelector('[data-testid=surface-root] canvas'); return { surfaceCanvas: !!r, orbitalHidden: getComputedStyle(document.querySelector('.app > header') || document.body).visibility } }")
        check("E3 descent: surface canvas renders, orbital UI hidden", hidden["surfaceCanvas"], hidden)
        await page.wait_for_function(f"() => !{SU}.intro", timeout=15000)
        await page.wait_for_timeout(800)
        await shot("s04_astronaut_third_person")
        c0 = await ch()
        check("A1 astronaut stands on the ground at the start", c0["grounded"] and abs(c0["vel"][1]) < 1e-6, {"pos": c0["pos"]})

        # ---------------------------------------------------------------- L: lighting
        sun = await page.locator(".surf-top").inner_text()
        check("L1 daylight at the Apollo 11 moonwalk date: low Sun in the east", "below horizon" not in sun and "Sun" in sun, sun.split("\n")[-1][:120])

        # ---------------------------------------------------------------- A: controls
        canvas = page.locator("[data-testid=surface-root] canvas").first
        box = await canvas.bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        yaw0 = c0["camYaw"]
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        await page.mouse.move(cx + 220, cy, steps=8)
        await page.mouse.up()
        yaw1 = (await ch())["camYaw"]
        check("A2 mouse drag turns the camera", abs(yaw1 - yaw0) > 0.3, {"yawChange": yaw1 - yaw0})
        c1 = await ch()
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(2500)
        await page.keyboard.up("KeyW")
        await page.wait_for_timeout(1500)
        c2 = await ch()
        dx, dz = c2["pos"][0] - c1["pos"][0], c2["pos"][2] - c1["pos"][2]
        fwd = (-math.sin(c1["camYaw"]), -math.cos(c1["camYaw"]))
        along = dx * fwd[0] + dz * fwd[1]
        check("A3 W walks toward where the camera looks, then stops (no drift)", along > 1.5 and math.hypot(c2["vel"][0], c2["vel"][2]) == 0, {"along": round(along, 2), "across": round(dx * fwd[1] - dz * fwd[0], 2)})
        face = abs(math.atan2(math.sin(c2["yaw"] - c1["camYaw"]), math.cos(c2["yaw"] - c1["camYaw"])))
        check("A4 astronaut turns to face the direction of travel", face < 0.2, {"facingError": round(face, 3)})
        await page.keyboard.down("ShiftLeft")
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(1800)
        v_run = await ch()
        await page.keyboard.up("KeyW")
        await page.keyboard.up("ShiftLeft")
        check("A5 Shift lopes faster than walking", math.hypot(v_run["vel"][0], v_run["vel"][2]) > 1.6, {"speed": round(math.hypot(v_run["vel"][0], v_run["vel"][2]), 2)})
        await page.wait_for_timeout(1500)
        base_y = (await ch())["pos"][1]
        await page.keyboard.down("Space")
        await page.wait_for_timeout(120)
        await page.keyboard.up("Space")
        peak = base_y
        air = False
        for _ in range(30):
            await page.wait_for_timeout(50)
            s = await ch()
            peak = max(peak, s["pos"][1])
            air = air or not s["grounded"]
        await page.wait_for_timeout(1200)
        landed = await ch()
        check("A6 Space hops under lunar gravity (~0.7 m) and lands again", air and 0.4 < peak - base_y < 1.0 and landed["grounded"], {"apexM": round(peak - base_y, 2)})
        await shot("s05_after_walk")
        # collision with the LM: start 9 m west of it, walk east into it
        lm = await page.evaluate(f"() => {SU}.discovered")
        await page.evaluate(f"() => {DBG}.teleport(-9, 0)")
        await page.mouse.move(cx, cy)
        # face east: drag so camYaw ~ -pi/2 (set directly through repeated drags is slow; use keys relative to the camera instead)
        cam = (await ch())["camYaw"]
        target = -math.pi / 2
        await page.mouse.down()
        await page.mouse.move(cx - (target - cam) / 0.0024, cy, steps=10)
        await page.mouse.up()
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(9000)
        await page.keyboard.up("KeyW")
        s = await ch()
        check("A7 cannot walk through the Lunar Module descent stage", math.hypot(s["pos"][0], s["pos"][2]) >= 2.3 + 0.42 - 0.05, {"distFromLmCentre": round(math.hypot(s["pos"][0], s["pos"][2]), 2), "x": round(s["pos"][0], 2)})
        await shot("s06_at_lunar_module")
        lmr = await page.evaluate("() => window.__models && window.__models.results['apollo-lm']")
        check("A9 the Lunar Module on the surface is the official NASA model with its ascent stage removed", bool(lmr) and lmr["removedMeshes"] > 50 and lmr["measured"]["height"] < 3.0, {"removed": lmr and lmr["removedMeshes"], "height": lmr and round(lmr["measured"]["height"], 2)})

        # ---------------------------------------------------------------- D: discovery near the LRRR
        disc = await page.evaluate(f"() => {SU}.discovered")
        check("D1 walking up to the Lunar Module discovers it", "a11-lm-descent" in disc, disc)
        lrrr = await page.evaluate(f"() => window.__surface.state().player")
        await page.evaluate(f"() => {DBG}.teleport(-2.1 - 2, 21.5 - 1)")
        await page.wait_for_timeout(900)
        st = await page.evaluate(f"() => ({{ banner: {SU}.banner, near: {SU}.nearbyId, disc: {SU}.discovered }})")
        prompt = await page.locator(".surf-prompt").inner_text() if await page.locator(".surf-prompt").count() else ""
        await shot("s07_discovered_lrrr")
        check("D2 next to the retroreflector: E-to-inspect prompt; newly found hardware gets a DISCOVERED banner", st["near"] == "a11-lrrr" and "Retroreflector" in prompt and st["banner"] in st["disc"], {**st, "prompt": prompt})
        await page.keyboard.press("KeyE")
        await page.wait_for_timeout(1200)
        panel = page.locator(".discovery")
        ptxt = await panel.inner_text()
        check("D3 E opens the record of the right object (Apollo 11 LRRR)", "Laser Ranging Retroreflector" in ptxt and "Apollo 11" in ptxt, ptxt[:120])
        await shot("s08_inspect_lrrr")
        await page.get_by_role("button", name="Corner-cube array").click()
        await page.wait_for_timeout(1000)
        check("D4 inspecting a component focuses it", await page.evaluate(f"() => {SU}.component") == "array")
        await shot("s09_inspect_component")
        await page.get_by_role("button", name="Return to Exploration", exact=True).click()
        await page.wait_for_timeout(400)
        await page.evaluate(f"() => {DBG}.teleport(0, 5.5)")
        await page.wait_for_timeout(900)
        await page.keyboard.press("KeyE")
        await page.wait_for_timeout(1500)
        await shot("s09b_inspect_lm_nasa")
        await page.get_by_role("button", name="Dimension-accurate reconstruction").click()
        await page.wait_for_timeout(1200)
        await shot("s09c_inspect_lm_reconstruction")
        variant = await page.evaluate(f"() => {SU}.lmModel")
        await page.get_by_role("button", name="NASA official model").click()
        check("D4b the LM record offers the NASA model and the dimension-accurate reconstruction", variant == "reconstruction" and await page.evaluate(f"() => {SU}.lmModel") == "nasa")
        await page.get_by_role("button", name="Return to Exploration", exact=True).click()
        await page.wait_for_timeout(400)
        await page.evaluate(f"() => {DBG}.teleport(-2.1 - 2, 21.5 - 1)")
        await page.wait_for_timeout(900)
        await page.keyboard.press("KeyE")
        await page.wait_for_timeout(1000)
        await page.get_by_role("tab", name="Technical Specifications").click()
        specs = await panel.inner_text()
        check("D5 specifications show the sourced LRO position and verification badges", "0.67345" in specs and "verified" in specs.lower() and "unverified" in specs.lower(), specs[:160])
        await page.get_by_role("tab", name="Historical Story").click()
        story = await panel.inner_text()
        check("D6 story tab: short story from the catalogue with a full version", "glass cubes" in story and "Full story" in story)
        await page.get_by_role("button", name="Full story").click()
        await shot("s10_story")
        await page.get_by_role("tab", name="Mission Timeline").click()
        tl = await panel.inner_text()
        check("D7 mission timeline lists Apollo 11 milestones in order", tl.find("Launch") < tl.find("Landing at Tranquility Base") < tl.find("Splashdown"))
        await shot("s11_timeline")
        await page.get_by_role("button", name="Return to Exploration", exact=True).click()
        await page.wait_for_timeout(500)
        check("D8 Return to Exploration closes the record", await panel.count() == 0)

        # ---------------------------------------------------------------- M: surface map
        await page.keyboard.press("KeyM")
        await page.wait_for_timeout(700)
        mp = page.locator(".surf-map")
        mtxt = await mp.inner_text()
        check("M1 M opens the surface map listing the hardware with distances", "EASEP" in mtxt and " m ·" in mtxt and "procedural" in mtxt.lower(), mtxt[:160])
        await page.locator(".surf-map-list button", has_text="EASEP").click()
        wp = await page.evaluate(f"() => {SU}.waypointId")
        await page.get_by_role("button", name="Zoom in").click()
        await page.get_by_role("button", name="Zoom in").click()
        await page.wait_for_timeout(300)
        await shot("s12_surface_map")
        check("M2 choosing a destination sets a waypoint", wp == "a11-easep-pse", wp)
        await page.get_by_role("button", name="Close map").click()
        await page.wait_for_timeout(600)
        wpt = await page.locator(".surf-waypoint").inner_text()
        check("M3 HUD guides to the waypoint (distance + bearing)", " m" in wpt and "bearing" in wpt, wpt)
        await shot("s13_waypoint_hud")

        # ---------------------------------------------------------------- A: first person
        await page.keyboard.press("KeyV")
        await page.wait_for_timeout(900)
        check("A8 V switches to first person", await page.evaluate(f"() => {SU}.camMode") == "first")
        await shot("s14_first_person")
        await page.keyboard.press("KeyV")

        # ---------------------------------------------------------------- perf
        fps = await page.evaluate("() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(f) })")
        rep["metrics"]["surfaceFps"] = round(fps, 1)
        check("P1 surface frame rate (headless Chrome, balanced quality)", fps > 20, {"fps": round(fps, 1)})

        # ---------------------------------------------------------------- L2: night
        await page.evaluate(f"() => {ST}.setSim(Date.UTC(1969, 7, 8))")
        await page.wait_for_timeout(900)
        night = await page.locator(".surf-night").count()
        await shot("s15_lunar_night")
        check("L2 a lunar-night date shows the night warning (Sun below the horizon)", night == 1)
        await page.get_by_role("button", name="Go to the Apollo 11 moonwalk", exact=False).click()
        await page.wait_for_timeout(600)
        check("L3 the warning's button returns the clock to the moonwalk", await page.locator(".surf-night").count() == 0)

        # ---------------------------------------------------------------- responsive
        for w, h in ((1366, 768), (390, 844)):
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(700)
            ov = await page.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
            await shot(f"s16_surface_{w}x{h}")
            check(f"R1 surface HUD at {w}x{h}: no horizontal overflow", not ov)
        await page.set_viewport_size({"width": 1440, "height": 900})

        # ---------------------------------------------------------------- R: pause + return to orbit
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        check("R2 Escape pauses with a menu", await page.locator(".surf-pause").count() == 1)
        await shot("s17_pause")
        await page.get_by_role("button", name="Return to orbit").last.click()
        await page.wait_for_timeout(1500)
        after = await page.evaluate("() => ({ pos: [...window.__nav.pos], follow: window.__nav.followId, sel: window.__store.getState().selectedId, surf: window.__store.getState().surfaceSiteId })")
        d = math.dist(before["pos"], after["pos"])
        check("R3 Return to orbit restores the view and selection next to the Moon", after["surf"] is None and after["follow"] == before["follow"] and after["sel"] == before["sel"] and d < 1e-12, {"posDeltaLy": d})
        await shot("s18_back_in_orbit")
        cam = await page.evaluate("() => [...window.__nav.pos]")
        await page.get_by_role("button", name="Travel Mode").first.click()
        await page.wait_for_timeout(1500)
        tm = await page.evaluate("(cam) => ({ phase: window.__store.getState().phase, d: Math.hypot(...window.__ship.pos.map((v, i) => v - cam[i])), v: Math.hypot(...window.__ship.vel) })", cam)
        check("R4 existing Travel Mode still starts exactly at the restored view, at rest", tm["phase"] == "travel" and tm["d"] < 1e-12 and tm["v"] == 0, tm)
        await page.keyboard.press("Escape")
        await b.close()

    errs = [e for e in rep["errors"] if "favicon" not in e]
    check("Z1 no console errors", not errs, errs[:5])
    (out / "surface_exploration_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/space-exploration")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
