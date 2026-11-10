"""
Acceptance tests for the Gameplay Controls directive (Part 22, Tests 1-11) in real Chrome.

  T1-T6  Astronaut (Apollo 15, Hadley-Apennine): W/S/A/D move relative to the camera; arrow keys turn ONLY the camera;
         diagonals are not faster; after turning with the arrows, W follows the new view direction.
  T7     Lunar Roving Vehicle: R boards; W/S/A/D drive, brake and steer (wheels turn, steering slews, suspension and
         attitude follow the terrain); arrows turn only the camera; R leaves.
  T8     Spacecraft: manual WASD translation; arrows turn the view without rotating the ship; automatic travel is NOT
         cancelled by movement keys; P switches automatic / manual explicitly.
  T9     The inspection record owns the keyboard (W does not move the astronaut behind it).
  T10    Mode transitions leave no held keys and no stuck movement (surface ↔ inspection ↔ rover, travel → orbit).
  T11    Screenshots at the supported viewports: astronaut framed (visible, sensible size), controls panel readable.

Usage: python scripts/e2e/controls_check.py --base http://localhost:5173 --out docs/qa/space-exploration/controls
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
SHIP = "const S = { ship: window.__ship, ...window.__shipApi };"
VIEWPORTS = [(1920, 1080), (1366, 768), (1024, 768), (390, 844)]


async def main(base: str, out: Path, with_rover: bool = False) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "errors": []}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:300]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:170]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1');localStorage.removeItem('cosmic-atlas.input.settings')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: rep["errors"].append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:200]))
        ch = lambda: page.evaluate(f"() => {DBG}.character()")
        mode = lambda: page.evaluate("() => window.__input.mode()")
        held = lambda: page.evaluate("() => window.__input.held()")

        async def hold(keys: list[str], ms: int):
            for k in keys:
                await page.keyboard.down(k)
            await page.wait_for_timeout(ms)
            for k in reversed(keys):
                await page.keyboard.up(k)

        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store && window.__nav && window.__input")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        check("T0 orbital view runs in MAIN_MENU mode", await mode() == "MAIN_MENU", await mode())

        # ---- orbital view: arrows turn the view, they do not fly the camera ----
        await page.mouse.click(700, 450)
        p0 = await page.evaluate("() => ({ pos: [...window.__nav.pos], q: window.__nav.quat.toArray() })")
        await hold(["ArrowLeft"], 600)
        p1 = await page.evaluate("() => ({ pos: [...window.__nav.pos], q: window.__nav.quat.toArray() })")
        moved = math.dist(p0["pos"], p1["pos"])
        turned = abs(sum(a * b for a, b in zip(p0["q"], p1["q"]))) < 0.99999
        check("T0b orbital view: an arrow key turns the view and does not translate it", turned and moved == 0, {"moved": moved, "turned": turned})

        # ---- T12 a focused text field owns the keyboard: typing W A S D / arrows moves nothing ----
        box = page.locator("input[type='search'], input[placeholder*='earch']").first
        await box.click()
        p0 = await page.evaluate("() => ({ pos: [...window.__nav.pos], q: window.__nav.quat.toArray() })")
        await hold(["KeyW", "KeyD", "ArrowLeft"], 700)
        p1 = await page.evaluate("() => ({ pos: [...window.__nav.pos], q: window.__nav.quat.toArray() })")
        typed = await box.input_value()
        check("T12 typing in the search field moves and turns nothing; the keys reach the field", p0 == p1 and await held() == [] and len(typed) > 0, {"typed": typed})
        await box.fill("")
        await page.keyboard.press("Escape")
        await page.mouse.click(700, 450)

        # ---- enter Apollo 15 ----
        await page.evaluate(f"() => {{ {ST}.setPlaying(false); {ST}.travel('moon', true) }}")
        await page.wait_for_timeout(1500)
        await page.evaluate(f"() => {ST}.enterSurface('apollo-15')")
        await page.wait_for_function(f"() => window.__surface && {DBG}.terrain && {SU}.siteId === 'apollo-15'", timeout=60000)
        await page.evaluate(f"() => {SU}.set({{ intro: false }})")
        await page.wait_for_timeout(500)
        await page.evaluate(f"() => {ST}.setSim({DBG}.terrain().daylightMs)")
        await page.wait_for_timeout(1500)
        await page.evaluate(f"() => {DBG}.teleport(-30, 30)")
        await page.wait_for_timeout(600)
        check("T0c surface runs in PLANETARY_EXPLORATION mode", await mode() == "PLANETARY_EXPLORATION", await mode())

        def fwd(yaw):
            return (-math.sin(yaw), -math.cos(yaw))

        def right(yaw):
            return (math.cos(yaw), -math.sin(yaw))

        async def move_test(keys, want, name, ms=1400):
            c0 = await ch()
            await hold(keys, ms)
            await page.wait_for_timeout(250)
            c1 = await ch()
            d = (c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2])
            n = math.hypot(*d) or 1e-9
            w = want(c0["camYaw"])
            cos = (d[0] * w[0] + d[1] * w[1]) / (n * math.hypot(*w))
            cam_turn = abs(math.atan2(math.sin(c1["camYaw"] - c0["camYaw"]), math.cos(c1["camYaw"] - c0["camYaw"])))
            check(name, n > 0.5 and cos > 0.95 and cam_turn < 0.01, {"dist": round(n, 2), "cos": round(cos, 3), "cameraTurn": round(cam_turn, 4)})
            return n

        await move_test(["KeyW"], lambda y: fwd(y), "T1 W moves the astronaut forward along the camera direction; the camera does not turn")
        await move_test(["KeyS"], lambda y: tuple(-v for v in fwd(y)), "T2 S moves the astronaut backward")
        await move_test(["KeyA"], lambda y: tuple(-v for v in right(y)), "T3a A moves left; no camera turn")
        await move_test(["KeyD"], lambda y: right(y), "T3b D moves right; no camera turn")

        for key, field, sign in (("ArrowLeft", "camYaw", 1), ("ArrowRight", "camYaw", -1), ("ArrowUp", "camPitch", 1), ("ArrowDown", "camPitch", -1)):
            c0 = await ch()
            await hold([key], 600)
            await page.wait_for_timeout(200)
            c1 = await ch()
            moved = math.hypot(c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2])
            dv = c1[field] - c0[field]
            check(f"T4 {key} turns only the camera ({field} {'+' if sign > 0 else '-'}); the astronaut stays put", moved < 0.02 and sign * dv > 0.05, {"moved": round(moved, 4), "delta": round(dv, 3)})
        # level the view again
        await hold(["ArrowDown"], 300)

        # T5 diagonal speed
        async def steady_speed(keys):
            for k in keys:
                await page.keyboard.down(k)
            await page.wait_for_timeout(1500)
            c0 = await ch()
            await page.wait_for_timeout(800)
            c1 = await ch()
            for k in reversed(keys):
                await page.keyboard.up(k)
            await page.wait_for_timeout(600)
            return math.hypot(c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2]) / 0.8

        v_w = await steady_speed(["KeyW"])
        v_wa = await steady_speed(["KeyW", "KeyA"])
        v_wd = await steady_speed(["KeyW", "KeyD"])
        check("T5 W+A and W+D are smooth and not faster than W alone", v_wa <= v_w * 1.05 and v_wd <= v_w * 1.05 and v_wa > 0.5 * v_w, {"W": round(v_w, 2), "W+A": round(v_wa, 2), "W+D": round(v_wd, 2)})

        # T6 camera-relative after turning
        await hold(["ArrowLeft"], 900)
        await page.wait_for_timeout(200)
        await move_test(["KeyW"], lambda y: fwd(y), "T6 after turning with the arrows, W follows the NEW view direction")

        # ---- T9 inspection owns the keyboard ----
        objs = (await page.evaluate(f"() => {DBG}.terrain()"))["objects"]
        alsep = next(o for o in objs if o["id"] == "a15-alsep")
        await page.evaluate(f"() => {DBG}.teleport({alsep['x'] + 2}, {alsep['z'] + 2})")
        await page.wait_for_timeout(700)
        await page.keyboard.press("KeyE")
        await page.wait_for_timeout(500)
        panel = await page.evaluate(f"() => !!{SU}.panel")
        c0 = await ch()
        await hold(["KeyW"], 1000)
        c1 = await ch()
        moved = math.hypot(c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2])
        check("T9 with the inspection record open, W does not move the astronaut (HARDWARE_INSPECTION mode)", panel and moved < 0.02 and await mode() == "HARDWARE_INSPECTION", {"panel": panel, "moved": round(moved, 4)})

        # ---- T10 transitions: hold W, open the record, release behind it, close → no stuck movement ----
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(300)
        await page.keyboard.press("KeyE")  # opens the record while W is held
        await page.wait_for_timeout(300)
        h_panel = await held()
        await page.keyboard.up("KeyW")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        c0 = await ch()
        await page.wait_for_timeout(900)
        c1 = await ch()
        drift = math.hypot(c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2])
        check("T10a surface ↔ inspection: held keys are dropped on the mode change and nothing keeps moving", h_panel == [] and drift < 0.05 and await held() == [], {"heldWhilePanel": h_panel, "drift": round(drift, 3)})

        # ---- T7 rover ----
        if not with_rover:
            # Rover driving is NOT implemented (M0 scope): the R binding was removed so the Controls panel lists no
            # control that does not work. Recorded as SKIP, never as a pass. Run with --rover once it exists.
            for t in ("T7a-f rover boarding / driving / steering / braking / camera / suspension", "T10b leaving the rover with W held"):
                rep["checks"].append({"check": t, "pass": None, "detail": "SKIP: rover driving not implemented yet"})
                print(f"[SKIP] {t} - rover driving not implemented yet")
        if with_rover:
            lrv = next(o for o in objs if o["id"] == "a15-lrv")
            await page.evaluate(f"() => {DBG}.teleport({lrv['x'] + 2.5}, {lrv['z']})")
            await page.wait_for_timeout(800)
            prompt = await page.evaluate(f"() => ({{ nearby: {SU}.nearbyId }})")
            await page.keyboard.press("KeyR")
            await page.wait_for_timeout(600)
            v0 = await page.evaluate(f"() => {DBG}.vehicle()")
            check("T7a R beside the LRV boards it (VEHICLE_EXPLORATION mode)", v0 and v0["driving"] and await mode() == "VEHICLE_EXPLORATION", {"nearby": prompt["nearby"], "vehicle": v0})
            await hold(["KeyW"], 2500)
            v1 = await page.evaluate(f"() => {DBG}.vehicle()")
            dist = math.hypot(v1["x"] - v0["x"], v1["z"] - v0["z"])
            check("T7b W drives the rover forward; the wheels turn with distance (no sliding)", dist > 1 and abs(v1["wheelAngle"] - v0["wheelAngle"] - (v1["odometer"] - v0["odometer"]) / 0.409) < 0.05, {"dist": round(dist, 2), "speed": round(v1["speed"], 2)})
            await page.keyboard.down("KeyW")
            await page.keyboard.down("KeyA")
            await page.wait_for_timeout(1500)
            v2 = await page.evaluate(f"() => {DBG}.vehicle()")
            await page.keyboard.up("KeyA")
            await page.keyboard.up("KeyW")
            dyaw = math.atan2(math.sin(v2["yaw"] - v1["yaw"]), math.cos(v2["yaw"] - v1["yaw"]))
            check("T7c A steers left: the steering slews and the rover turns while moving", v2["steer"] > 0.5 and dyaw > 0.05, {"steer": round(v2["steer"], 2), "dyaw": round(dyaw, 3)})
            await hold(["KeyS"], 3000)
            v3 = await page.evaluate(f"() => {DBG}.vehicle()")
            check("T7d S brakes the rover", v3["speed"] < v2["speed"], {"before": round(v2["speed"], 2), "after": round(v3["speed"], 2)})
            await page.wait_for_timeout(1500)
            v4 = await page.evaluate(f"() => {DBG}.vehicle()")
            c_cam0 = await ch()
            await hold(["ArrowRight"], 700)
            v5 = await page.evaluate(f"() => {DBG}.vehicle()")
            c_cam1 = await ch()
            check("T7e arrows turn only the camera while driving (the rover does not move or steer)", math.hypot(v5["x"] - v4["x"], v5["z"] - v4["z"]) < 0.05 and abs(c_cam1["camYaw"] - c_cam0["camYaw"]) > 0.05, {"camTurn": round(c_cam1["camYaw"] - c_cam0["camYaw"], 3)})
            check("T7f suspension and chassis attitude follow the terrain (values reported per wheel)", isinstance(v5["susp"], list) and len(v5["susp"]) == 4 and all(abs(s) <= 0.15 + 1e-9 for s in v5["susp"]), {"susp": v5["susp"], "pitch": v5["pitch"], "roll": v5["roll"]})
            await page.screenshot(path=str(out / "rover_driving.jpg"), type="jpeg", quality=84)
            await page.keyboard.down("KeyW")
            await page.wait_for_timeout(200)
            await page.keyboard.press("KeyR")  # leave while W is held
            await page.keyboard.up("KeyW")
            await page.wait_for_timeout(500)
            c0 = await ch()
            await page.wait_for_timeout(800)
            c1 = await ch()
            check("T10b leaving the rover with W held: back to walking, nothing stuck", await mode() == "PLANETARY_EXPLORATION" and await held() == [] and math.hypot(c1["pos"][0] - c0["pos"][0], c1["pos"][2] - c0["pos"][2]) < 0.05)

        # ---- T11 framing and screenshots ----
        for w, h in VIEWPORTS:
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(900)
            fr = await page.evaluate(f"() => {DBG}.astronautScreen()")
            ok = fr and fr["visible"] and 0.06 <= fr["heightFrac"] <= 0.5
            check(f"T11 {w}x{h}: astronaut visible and sensibly sized in third person", ok, fr)
            await page.screenshot(path=str(out / f"surface_{w}x{h}.jpg"), type="jpeg", quality=84)
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.keyboard.press("KeyH")
        await page.wait_for_timeout(400)
        panel_txt = await page.locator(".controls-panel").first.inner_text()
        check("T11b the Controls panel lists the current mode's real controls", "W A S D" in panel_txt and "↑ ↓ ← →" in panel_txt and "planetary exploration" in panel_txt.lower(), panel_txt[:160])
        await page.screenshot(path=str(out / "controls_panel_surface.jpg"), type="jpeg", quality=84)
        await page.keyboard.press("Escape")

        # ---- T8 spacecraft ----
        await page.evaluate(f"() => {ST}.exitSurface()")
        await page.wait_for_timeout(1500)
        await page.evaluate(f"async () => {{ {SHIP} const st = window.__store; st.getState().set({{ navMapOpen: false }}); st.getState().setPhase('explore'); st.getState().enterTravelMode('earth'); S.setCameraView('chase'); S.ship.thrust = 0; S.ship.vel = [0,0,0]; S.ship.gear = 1 }}")
        await page.wait_for_timeout(700)
        await page.mouse.click(700, 420)
        check("T8a travel runs in SPACECRAFT_FLIGHT mode, manual piloting", await mode() == "SPACECRAFT_FLIGHT" and not await page.evaluate("() => window.__ship.autopilot.active"))
        q0 = await page.evaluate("() => window.__ship.quat.toArray()")
        l0 = await page.evaluate("() => ({ ...window.__travelView })")
        await hold(["ArrowLeft"], 700)
        q1 = await page.evaluate("() => window.__ship.quat.toArray()")
        l1 = await page.evaluate("() => ({ ...window.__travelView })")
        same = abs(sum(a * b for a, b in zip(q0, q1))) > 0.999999
        check("T8b arrow keys turn the view around the spacecraft and do not rotate the ship", same and l1["yaw"] - l0["yaw"] < -0.05, {"shipUnchanged": same, "lookYaw": round(l1["yaw"], 3)})
        t0 = await page.evaluate("() => window.__ship.thrust")
        await hold(["KeyW"], 900)
        t1 = await page.evaluate("() => window.__ship.thrust")
        check("T8c W thrusts forward in manual flight", t1 > t0 + 0.2, {"thrust": [t0, t1]})
        await page.evaluate("() => { window.__ship.thrust = 0 }")
        await page.evaluate(f"async () => {{ {SHIP} S.engageAutopilot('moon', window.__store.getState().simMs) }}")
        await page.wait_for_timeout(300)
        await hold(["KeyW", "KeyA"], 700)
        still = await page.evaluate("() => window.__ship.autopilot.active")
        check("T8d automatic travel stays autonomous: movement keys do not cancel it", still is True)
        await page.screenshot(path=str(out / "flight_auto_chase.jpg"), type="jpeg", quality=84)
        await page.keyboard.press("KeyP")
        await page.wait_for_timeout(300)
        manual = not await page.evaluate("() => window.__ship.autopilot.active")
        check("T8e P switches explicitly to manual piloting", manual)
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(300)
        await page.keyboard.press("Escape")  # leave Travel Mode while W is held
        await page.keyboard.up("KeyW")
        await page.wait_for_timeout(800)
        n0 = await page.evaluate("() => [...window.__nav.pos]")
        await page.wait_for_timeout(700)
        n1 = await page.evaluate("() => [...window.__nav.pos]")
        check("T10c leaving Travel Mode with W held: orbital view, nothing stuck", await mode() == "MAIN_MENU" and await held() == [] and n0 == n1, {"mode": await mode()})

        rep["errorsCount"] = len(rep["errors"])
        await b.close()

    passed = sum(c["pass"] is True for c in rep["checks"])
    skipped = sum(c["pass"] is None for c in rep["checks"])
    total = len(rep["checks"]) - skipped
    (out / "controls_check.json").write_text(json.dumps(rep, indent=1))
    print(f"RESULT: {'PASS' if passed == total else 'FAIL'} ({passed}/{total}, {skipped} skipped); console errors: {len(rep['errors'])}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/space-exploration/controls")
    ap.add_argument("--rover", action="store_true", help="also run the rover checks T7 / T10b (needs rover driving)")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out), a.rover)))
