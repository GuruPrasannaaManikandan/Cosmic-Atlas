"""
Acceptance journeys for "Abandoned but Not Forgotten" in the running Cosmic Atlas app (real Chrome, GPU).

MARS (directive §13, steps 1-17):
  home -> Mars expedition (departure, cruise, approach) -> Unity Mars surface with its arrival -> WASD drives /
  arrows only turn the camera -> drive to Opportunity (discovery, prompt) -> E opens the record (Overview, Story,
  Specifications, Inspect + component highlight, Timeline) -> Relive the mission (replay along the recorded traverse,
  an event jump) -> GO BACK TO PRESENT restores the saved pose, camera and record exactly -> exploration resumes ->
  embedded frame timing (renderer condition C4) -> Return to orbit destroys the Unity player.
MOON (regression + replay): Moon expedition from the orbital info panel -> Tranquility Base -> walk to the LM -> record ->
  Relive (descent replay, clock) -> GO BACK TO PRESENT restores astronaut, camera and clock.

Usage: python scripts/e2e/abandoned_journey_check.py --base http://localhost:5173 --out docs/qa/abandoned-but-not-forgotten
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

rep: dict = {"checks": [], "metrics": {}, "screenshots": []}


def check(name: str, ok: bool, detail=None):
    rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" - {detail}" if detail is not None else ""), flush=True)


async def shot(page, out: Path, name: str):
    p = out / f"{name}.png"
    await page.screenshot(path=str(p))
    rep["screenshots"].append(p.name)


async def wait_for(page, js: str, timeout=60.0, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(js):
                return True
        except Exception:
            pass
        await asyncio.sleep(every)
    return False


POSE = "window.__marsBridge.last.pose"


async def hold(page, key: str, secs: float):
    await page.keyboard.down(key)
    await asyncio.sleep(secs)
    await page.keyboard.up(key)


async def mars_journey(page, base: str, out: Path):
    await page.goto(base)
    await wait_for(page, "!!document.querySelector('[data-testid=start-expedition-mars]')", 60)
    await asyncio.sleep(1.5)
    await shot(page, out, "m01_home_abandoned_but_not_forgotten")

    # 3-5 expedition
    await page.click("[data-testid=start-expedition-mars]")
    await asyncio.sleep(1.5)
    st = await page.evaluate("window.__expedition.state().stage")
    check("M03 expedition starts at Earth departure", st == "departure", st)
    await shot(page, out, "m02_expedition_departure")
    mode = await page.evaluate("window.__input.mode()")
    check("M03 expedition flight is autonomous (keyboard owned by UI)", mode == "UI_INTERACTION", mode)
    await wait_for(page, "window.__expedition.state().stage === 'cruise'", 20)
    await asyncio.sleep(2)
    await shot(page, out, "m03_expedition_cruise")
    ok = await wait_for(page, "window.__expedition.state().stage === 'approach'", 60)
    check("M04 approach stage reached", ok)
    await shot(page, out, "m04_expedition_approach")

    # 6 Mars surface (Unity, embedded)
    ok = await wait_for(page, "!!document.querySelector('[data-testid=mars-root]')", 90)
    check("M06 Mars surface opens inside Cosmic Atlas", ok)
    ok = await wait_for(page, "!!(window.__marsBridge && window.__marsBridge.last.ready)", 120)
    check("M06 Unity Mars player loaded and reported ready", ok)
    ready = await page.evaluate("window.__marsBridge.last.ready")
    rep["metrics"]["unityLoadMs"] = await page.evaluate("window.__marsBridge.last.loadMs")
    rep["metrics"]["ready"] = {k: ready.get(k) for k in ("device", "profile", "sol", "utc", "terrainTriangles", "heightCheck", "route", "objects", "trail")}
    check("M06 terrain height check still passes in the embedded player", bool(ready.get("heightCheck", {}).get("pass")), ready.get("heightCheck"))
    # M3: the expedition flight itself lands and deploys the rover; Unity opens at the rover (no separate camera drop)
    st = await page.evaluate("window.__expedition.state()")
    check("M05 the expedition landed and deployed the rover before the surface opened", st["stage"] in ("arrival", "idle"), st)
    ok = await wait_for(page, f"{POSE} && {POSE}.mode === 'Explore' && !window.__surface.state().intro", 30)
    check("M06 arrival ends in exploration", ok)
    await asyncio.sleep(1.5)
    await shot(page, out, "m06_mars_surface_explore")
    mode = await page.evaluate("window.__input.mode()")
    check("M06 input mode is VEHICLE_EXPLORATION", mode == "VEHICLE_EXPLORATION", mode)

    # 7-8 controls: WASD moves, arrows only look
    await page.mouse.click(400, 300)  # focus the page (does not drag)
    a = await page.evaluate(POSE)
    await hold(page, "KeyW", 3.0)
    await wait_for(page, f"Math.abs({POSE}.speed) < 0.01", 8)  # coast to a stop (drag 1.2 m/s^2)
    await asyncio.sleep(0.3)
    b = await page.evaluate(POSE)
    moved = math.hypot(b["x"] - a["x"], b["z"] - a["z"])
    check("M07 W drives the rover forward", moved > 2.0, f"{moved:.2f} m")
    check("M07 W does not rotate the camera", abs(b["camYawOffset"] - a["camYawOffset"]) < 1e-4 and abs(b["camPitch"] - a["camPitch"]) < 1e-4)
    await hold(page, "ArrowLeft", 0.8)
    await asyncio.sleep(0.5)
    c = await page.evaluate(POSE)
    check("M08 ArrowLeft turns the camera", abs(c["camYawOffset"] - b["camYawOffset"]) > 0.5, f"{c['camYawOffset'] - b['camYawOffset']:.2f} rad")
    check("M08 ArrowLeft never moves or steers the rover", math.hypot(c["x"] - b["x"], c["z"] - b["z"]) < 0.01 and abs(c["heading"] - b["heading"]) < 1e-4)
    await hold(page, "ArrowDown", 0.4)
    await asyncio.sleep(0.4)
    d = await page.evaluate(POSE)
    check("M08 ArrowDown tilts the camera only", d["camPitch"] != c["camPitch"] and math.hypot(d["x"] - c["x"], d["z"] - c["z"]) < 0.01)
    await hold(page, "ArrowRight", 0.8)
    await asyncio.sleep(0.4)
    f = await page.evaluate(POSE)
    await hold(page, "KeyD", 0.8)
    await asyncio.sleep(0.6)
    e = await page.evaluate(POSE)
    check("M07 D steers the rover (heading changes)", abs(e["heading"] - f["heading"]) > 0.2, f"{e['heading'] - f['heading']:.2f} rad")
    check("M07 D does not change the camera's look offset or pitch", abs(e["camYawOffset"] - f["camYawOffset"]) < 1e-4 and abs(e["camPitch"] - f["camPitch"]) < 1e-4)

    # 9 approach Opportunity by driving (steering with A / D)
    steer = None
    await page.keyboard.down("KeyW")
    await page.keyboard.down("ShiftLeft")
    t0 = time.time()
    while time.time() - t0 < 90:
        p = await page.evaluate(POSE)
        if p["oppDist"] < 6.5:
            break
        want = math.atan2(p["oppX"] - p["x"], p["oppZ"] - p["z"])
        dd = (want - p["heading"] + math.pi) % (2 * math.pi) - math.pi
        s = "KeyD" if dd > 0.06 else "KeyA" if dd < -0.06 else None
        if s != steer:
            if steer:
                await page.keyboard.up(steer)
            if s:
                await page.keyboard.down(s)
            steer = s
        if p["oppDist"] < 18:
            await page.keyboard.up("ShiftLeft")
        await asyncio.sleep(0.1)
    if steer:
        await page.keyboard.up(steer)
    await page.keyboard.up("KeyW")
    await page.keyboard.up("ShiftLeft")
    await asyncio.sleep(2.5)
    S = await page.evaluate("window.__surface.state()")
    p = await page.evaluate(POSE)
    check("M09 Opportunity discovered on approach", "opportunity-rover" in S["discovered"], S["discovered"])
    check("M09 inspect prompt within reach", S["nearbyId"] == "opportunity-rover", f"{p['oppDist']:.1f} m")
    check("M09 the rover cannot drive through Opportunity", p["oppDist"] >= 2.9, f"{p['oppDist']:.2f} m")
    rep["metrics"]["driveToOpportunitySec"] = round(time.time() - t0, 1)
    await shot(page, out, "m07_approach_opportunity")

    # 10-14 select, record
    await page.keyboard.press("KeyE")
    ok = await wait_for(page, "!!window.__surface.state().panel", 5)
    check("M10 E opens Opportunity's record", ok)
    await asyncio.sleep(1.5)
    pm = await page.evaluate(POSE)
    check("M10 Unity switches to the inspection camera", pm["mode"] == "Inspect", pm["mode"])
    await shot(page, out, "m08_record_overview")
    for tab, name in (("Historical Story", "m09_record_story"), ("Technical Specifications", "m10_record_specifications"), ("Mission Timeline", "m12_record_timeline")):
        await page.get_by_role("tab", name=tab).click()
        await asyncio.sleep(0.8)
        await shot(page, out, name)
    await page.get_by_role("tab", name="Engineering Inspection").click()
    await page.get_by_role("button", name="Solar array", exact=True).click()
    await asyncio.sleep(2.0)
    await shot(page, out, "m11_inspect_solar_array_highlight")
    await page.get_by_role("button", name="Rocker-bogie suspension and wheels").click()
    await asyncio.sleep(2.0)
    await shot(page, out, "m11b_inspect_rocker_bogie")

    # 15 replay
    saved_pose = await page.evaluate(POSE)
    await page.click("[data-testid=relive-mission]")
    ok = await wait_for(page, f"{POSE}.mode === 'Replay'", 5)
    check("M15 Relive the mission enters the historical replay", ok)
    check("M15 input mode is HISTORICAL_REPLAY", await page.evaluate("window.__input.mode()") == "HISTORICAL_REPLAY")
    saved = await page.evaluate("window.__replay.saved")
    check("M15 present-day state saved (site, pose, camera, record)", saved and saved["siteId"] == "victoria-crater" and saved["panelTab"] is not None and abs(saved["pose"]["x"] - saved_pose["x"]) < 1e-3)
    s0 = await page.evaluate(f"{POSE}.replaySol")
    await asyncio.sleep(4)
    s1 = await page.evaluate(f"{POSE}.replaySol")
    r1 = await page.evaluate(POSE)
    check("M15 Opportunity moves through its recorded sols", s1 > s0 + 10, f"sol {s0:.0f} -> {s1:.0f}")
    await shot(page, out, "m13_replay_victoria_campaign")
    await page.get_by_role("button", name="Into Victoria crater").first.click()
    await asyncio.sleep(2.5)
    r2 = await page.evaluate(POSE)
    check("M15 event jump: 'Into Victoria crater' moves the replay to sol ~1291", abs(r2["replaySol"] - 1291) < 2, f"sol {r2['replaySol']:.1f}, {r2['utc']}")
    await shot(page, out, "m14_replay_event_into_victoria")

    # 16-17 back to present, exact restore
    await page.click("[data-testid=go-back-to-present]")
    ok = await wait_for(page, "!!(window.__replay.lastRestore && window.__replay.lastRestore.pose)", 5)
    check("M16 GO BACK TO PRESENT returns to exploration", ok)
    await asyncio.sleep(1.0)
    now = await page.evaluate(POSE)
    S = await page.evaluate("window.__surface.state()")
    keys = ("x", "z", "heading", "camYawOffset", "camPitch", "camDist")
    diff = {k: abs(now[k] - saved_pose[k]) for k in keys}
    check("M17 position, heading and camera restored exactly", all(v < 1e-3 for v in diff.values()), diff)
    check("M17 selected object and record tab restored", S["panel"] and S["panel"]["objectId"] == "opportunity-rover" and S["panel"]["tab"] == saved["panelTab"], S["panel"])
    check("M17 scene clock back to the present scene date", now["sol"] == saved_pose["sol"] and now["utc"] == saved_pose["utc"], now["utc"])
    check("M17 Opportunity back at its scene position", abs(now["oppX"] - saved_pose["oppX"]) < 1e-3 and abs(now["oppZ"] - saved_pose["oppZ"]) < 1e-3)
    await shot(page, out, "m15_back_to_present_record")
    await page.keyboard.press("Escape")
    await asyncio.sleep(1.5)
    now2 = await page.evaluate(POSE)
    check("M17 exploration resumes from the same spot", now2["mode"] == "Explore" and math.hypot(now2["x"] - saved_pose["x"], now2["z"] - saved_pose["z"]) < 1e-3)
    await shot(page, out, "m16_back_to_present_explore")

    # C4: embedded frame timing (Unity's own instrumentation), 12 s while exploring
    samples = []
    for _ in range(12):
        await asyncio.sleep(1.0)
        samples.append(await page.evaluate("window.__mars.stats"))
    p50 = sorted(s["msP50"] for s in samples)[len(samples) // 2]
    p95 = sorted(s["msP95"] for s in samples)[len(samples) // 2]
    rep["metrics"]["c4EmbeddedFrame"] = {"msP50": p50, "msP95": p95, "backbuffer": [samples[-1]["width"], samples[-1]["height"]], "drawCalls": samples[-1]["drawCalls"], "triangles": samples[-1]["triangles"], "profile": samples[-1]["profile"]}
    check("C4 embedded Mars view meets the Balanced 30 fps gate (p50 <= 33 ms)", p50 <= 33.4, rep["metrics"]["c4EmbeddedFrame"])

    # return to orbit: one renderer again
    await page.get_by_role("button", name="⤴ Return to orbit").first.click()
    # M3: the view climbs back to orbit (Relive engine) — Unity is gone while it flies; skip the rest of the climb
    ok = await wait_for(page, "!window.__store.getState().surfaceSiteId && !!(window.__relive && window.__relive.state().id)", 15)
    await asyncio.sleep(2)
    running = await page.evaluate("window.__marsBridge.running()")
    await page.click("[data-testid=expedition-skip]")
    ok2 = await wait_for(page, "!window.__relive.state().id", 15)
    await asyncio.sleep(1.5)
    canvases = await page.evaluate("document.querySelectorAll('canvas').length")
    check("M-exit Return to orbit leaves Mars and destroys the Unity player", ok and ok2 and not running and canvases == 1, {"running": running, "canvases": canvases})
    await shot(page, out, "m17_back_in_orbit")


async def moon_journey(page, out: Path):
    # from the orbital view: select the Moon, open its info, Begin expedition
    await page.evaluate("window.__store.getState().select('moon'); window.__store.getState().set({ rightOpen: true })")
    ok = await wait_for(page, "!!document.querySelector('[data-testid=info-expedition-moon]')", 10)
    check("L01 Moon info panel offers the expedition", ok)
    await page.click("[data-testid=info-expedition-moon]")
    ok = await wait_for(page, "window.__store.getState().surfaceSiteId === 'tranquility-base'", 90)
    check("L02 expedition lands at Tranquility Base", ok)
    await wait_for(page, "!!window.__surface.debug.character", 30)
    await asyncio.sleep(2)
    await shot(page, out, "l01_moon_descent")
    await wait_for(page, "!window.__surface.state().intro", 50)
    sun = await page.evaluate("new Date(window.__store.getState().simMs).toISOString()")
    check("L02 lands at the site's sourced daylight moment", sun.startswith("1969-07-21"), sun)
    await asyncio.sleep(1)
    await shot(page, out, "l02_moon_surface")
    await page.keyboard.down("KeyW")
    ok = await wait_for(page, "!!window.__surface.state().nearbyId", 25, 0.2)
    await page.keyboard.up("KeyW")
    check("L03 walking reaches Apollo 11 hardware", ok, await page.evaluate("window.__surface.state().nearbyId"))
    await asyncio.sleep(1)
    await page.keyboard.press("KeyE")
    await wait_for(page, "!!window.__surface.state().panel", 5)
    await asyncio.sleep(1.5)
    obj = await page.evaluate("window.__surface.state().panel.objectId")
    await shot(page, out, "l03_moon_record")
    before = await page.evaluate("({ ...window.__surface.debug.character(), sim: window.__store.getState().simMs, camMode: window.__surface.state().camMode })")
    await page.click("[data-testid=relive-mission]")
    ok = await wait_for(page, "!!window.__surface.state().replay", 5)
    check("L04 Relive the mission on the Moon", ok, obj)
    await asyncio.sleep(3)
    await shot(page, out, "l04_moon_replay_descent")
    await page.click("[data-testid=go-back-to-present]")
    await asyncio.sleep(1.5)
    after = await page.evaluate("({ ...window.__surface.debug.character(), sim: window.__store.getState().simMs })")
    dpos = math.dist(before["pos"], after["pos"])
    check("L05 GO BACK TO PRESENT restores astronaut position and camera", dpos < 1e-3 and abs(before["camYaw"] - after["camYaw"]) < 1e-6 and abs(before["camPitch"] - after["camPitch"]) < 1e-6, {"dpos": dpos})
    check("L05 clock restored", before["sim"] == after["sim"])
    S = await page.evaluate("window.__surface.state()")
    check("L05 record reopened on the same object", S["panel"] and S["panel"]["objectId"] == obj)
    await shot(page, out, "l05_moon_back_to_present")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/abandoned-but-not-forgotten")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=not a.headed, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": a.width, "height": a.height}, device_scale_factor=1)
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        try:
            await mars_journey(page, a.base, out)
            await moon_journey(page, out)
        except Exception as e:  # report what was reached
            check("journey completed without an exception", False, repr(e))
            await shot(page, out, "zz_failure")
        rep["consoleErrors"] = errors[:30]
        rep["viewport"] = [a.width, a.height]
        rep["mode"] = "headed" if a.headed else "headless"
        await b.close()
    (out / "journey_check.json").write_text(json.dumps(rep, indent=1))
    fails = [c for c in rep["checks"] if c["pass"] is False]
    print(f"\n{len(rep['checks']) - len(fails)}/{len(rep['checks'])} checks passed; console errors: {len(rep['consoleErrors'])}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    asyncio.run(main())
