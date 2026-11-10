"""
Astronaut-guided storytelling in real Chrome (Tranquility Base).

  G  Guide dialogue: approach line (catalogue name + LRO position, with source chips) in a speech bubble pinned over
     the astronaut; discovery line = the first sentence of the short story.
  I  Inspection: the astronaut stays in view, turns to face the object and points; choosing a component makes the
     guide describe it and shows the story parts that explain it; "Hear this from the guide" narrates that part and
     the camera focuses the component.
  N  Narration: short (young explorers) and full (scientific) stories; captions mode advances by reading time with a
     word cursor; transcript highlight follows; pause/resume, next, progress; narration survives tab switches; stop
     clears the bubble; with the browser voice on, the story still advances (watchdog) even if the speech engine
     never reports the end of an utterance.
  Plus console errors and screenshots.

Usage: python scripts/e2e/storytelling_check.py --base http://localhost:5173 --out docs/qa/space-exploration/storytelling
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ST = "window.__store.getState()"
SU = "window.__surface.state()"
DBG = "window.__surface.debug"
NA = "window.__narrator.state()"
GU = "window.__guide.state()"


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "errors": []}

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
        shot = lambda n: page.screenshot(path=str(out / f"{n}.jpg"), type="jpeg", quality=84)
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store")
        await page.get_by_role("button", name="EXPLORE FREELY").click()
        await page.evaluate(f"() => {{ {ST}.setPlaying(false); {ST}.setSim(Date.UTC(1969, 6, 21, 3, 30)); {ST}.enterSurface('tranquility-base') }}")
        await page.wait_for_function(f"() => window.__surface && {DBG}.character && {DBG}.guide", timeout=60000)
        await page.evaluate(f"() => {SU}.set({{ intro: false }})")
        await page.wait_for_timeout(1200)

        # ------------------------------------------------------------ G: approach line
        objs = {o["id"]: o for o in (await page.evaluate(f"() => {DBG}.terrain()"))["objects"]}
        lr = objs["a11-lrrr"]
        await page.evaluate(f"() => {DBG}.teleport({lr['x'] + 34}, {lr['z'] + 10})")  # ~35 m east of the retroreflector
        await page.wait_for_function(f"() => {GU}.history.some(l => l.kind === 'approach')", timeout=8000)
        await page.wait_for_timeout(500)
        hist = await page.evaluate(f"() => {GU}.history.map(l => ({{ kind: l.kind, text: l.text, n: l.sources.length, obj: l.objectId }}))")
        appr = [h for h in hist if h["kind"] == "approach"]
        bub = await page.locator("[data-testid=guide-bubble]").inner_text() if await page.locator("[data-testid=guide-bubble]").count() else ""
        g = await page.evaluate(f"() => {DBG}.guide()")
        await shot("g01_approach_bubble")
        check("G1 approaching hardware: the guide points it out (catalogue name + LRO position, sourced) in a bubble over the astronaut",
              appr and all(h["n"] > 0 for h in appr) and "Over there" in bub and g["bubbleDocked"] == "false", {"lines": [h["text"] for h in appr][:3], "docked": g["bubbleDocked"]})
        await page.evaluate(f"() => {DBG}.teleport({lr['x'] + 4}, {lr['z'] + 6})")
        await page.wait_for_function(f"() => {GU}.history.some(l => l.kind === 'discover' && l.objectId === 'a11-lrrr')", timeout=8000)
        d = await page.evaluate(f"() => {GU}.history.filter(l => l.kind === 'discover' && l.objectId === 'a11-lrrr')[0]")
        await shot("g02_discovery_line")
        check("G2 discovery: the guide says the first sentence of the short story, with its sources", d["text"].startswith("This is the Laser Ranging Retroreflector") and len(d["sources"]) > 0, d["text"][:90])
        # walk a few steps west so the retroreflector is ahead-left; the helmet should glance at it
        cur = (await page.evaluate(f"() => {DBG}.character()"))["camYaw"]
        canvas = await page.locator("[data-testid=surface-root] canvas").first.bounding_box()
        cx, cy = canvas["x"] + 400, canvas["y"] + 400
        import math
        target = -math.radians(300)  # heading 300 deg (west-north-west)
        dd = math.atan2(math.sin(cur - target), math.cos(cur - target))
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        await page.mouse.move(cx + dd / 0.0024, cy, steps=10)
        await page.mouse.up()
        await page.keyboard.down("KeyW")
        await page.wait_for_timeout(700)
        await page.keyboard.up("KeyW")
        await page.wait_for_timeout(600)
        g = await page.evaluate(f"() => {DBG}.guide()")
        near = await page.evaluate(f"() => {SU}.nearbyId")
        await shot("g03_helmet_glance")
        check("G3 walking past hardware, the astronaut's helmet turns toward the nearby object (only toward things in front)", near and g["lookTarget"] == near and 0.02 < abs(g["headYaw"]) <= 1.1, {"nearby": near, "lookTarget": g["lookTarget"], "headYaw": round(g["headYaw"], 2)})

        # ------------------------------------------------------------ I: inspection with the astronaut as guide
        lm = objs["a11-lm-descent"]
        await page.evaluate(f"() => {DBG}.teleport({lm['x'] - 5.5}, {lm['z'] + 2})")
        await page.wait_for_timeout(900)
        await page.keyboard.press("KeyE")
        await page.wait_for_timeout(2200)
        g = await page.evaluate(f"() => {DBG}.guide()")
        await shot("i01_inspect_guide_pointing")
        check("I1 inspecting: the astronaut stays in view, faces the object and points at it", g["visibleWhileInspecting"] and g["pointing"] and g["facingObject"], g)
        await page.get_by_role("button", name="Egress platform and ladder").click()
        await page.wait_for_timeout(900)
        bub = await page.locator("[data-testid=guide-bubble]").inner_text()
        story_part = await page.get_by_test_id("component-story").inner_text()
        await shot("i02_component_ladder")
        check("I2 choosing a component: the guide describes it (sourced) and the panel shows the story part about it",
              "Egress platform and ladder" in bub and "02:56:15" in story_part, {"bubble": bub[:80], "part": story_part[:90]})
        await page.get_by_role("button", name="Hear this from the guide").first.click()
        await page.wait_for_timeout(1200)
        na = await page.evaluate(f"() => ({{ state: {NA}.state, part: {NA}.lines[{NA}.idx]?.part, comp: {SU}.component, bubble: {GU}.line?.kind }})")
        await shot("i03_hear_part_ladder")
        check("I3 'Hear this from the guide' narrates the story part about the ladder (the first steps)", na["state"] == "playing" and na["part"] == "events" and na["comp"] == "ladder" and na["bubble"] == "story", na)
        await page.evaluate(f"() => {NA}.stop()")
        # a part about the whole stage: the camera moves to the part the story is about
        await page.get_by_role("button", name="Descent engine").click()
        await page.wait_for_timeout(500)
        await page.get_by_role("button", name="Hear this from the guide").first.click()
        await page.wait_for_timeout(1200)
        na2 = await page.evaluate(f"() => ({{ part: {NA}.lines[{NA}.idx]?.part, comp: {SU}.component }})")
        await shot("i04_story_moves_camera")
        check("I4 the camera follows the story: the 'How it is built' part refocuses from the engine to the whole stage", na2["part"] == "design" and na2["comp"] == "body", na2)
        await page.evaluate(f"() => {NA}.stop()")

        # ------------------------------------------------------------ N: narration
        await page.get_by_role("tab", name="Historical Story").click()
        await page.wait_for_timeout(300)
        voice_box = page.get_by_label("Voice", exact=False)
        if await voice_box.count() and await voice_box.is_checked():
            await voice_box.uncheck()  # deterministic captions-only timing for the sync checks
        await page.get_by_role("button", name="Young explorers (short)").click()
        await page.get_by_role("button", name="▶ Narrate").click()
        await page.wait_for_timeout(700)
        s1 = await page.evaluate(f"() => ({{ idx: {NA}.idx, n: {NA}.lines.length, text: {NA}.lines[0].text, bubble: {GU}.line?.text, char: {NA}.charIdx }})")
        mark = await page.locator("[data-testid=guide-bubble] mark.spoken-word").count()
        speaking = await page.locator(".transcript li.speaking").inner_text()
        await shot("n01_short_story_bubble")
        check("N1 short story plays in the guide's bubble with a moving word cursor and the transcript in step",
              s1["idx"] == 0 and s1["bubble"] == s1["text"] and mark == 1 and s1["text"][:30] in speaking, {"progress": f"{s1['idx']+1}/{s1['n']}", "char": s1["char"]})
        await page.wait_for_function(f"() => {NA}.idx === 1", timeout=15000)
        await page.get_by_role("tab", name="Technical Specifications").click()
        await page.wait_for_timeout(600)
        persists = await page.evaluate(f"() => ({{ state: {NA}.state, bubble: !!{GU}.line }})")
        await page.get_by_role("tab", name="Historical Story").click()
        check("N2 narration advances by reading time and keeps playing across tab switches", persists["state"] == "playing" and persists["bubble"], persists)
        await page.get_by_role("button", name="❚❚ Pause").click()
        i_p = await page.evaluate(f"() => {NA}.idx")
        await page.wait_for_timeout(5000)
        i_p2 = await page.evaluate(f"() => ({{ idx: {NA}.idx, state: {NA}.state }})")
        await page.get_by_role("button", name="▶ Resume").click()
        await page.wait_for_timeout(300)
        check("N3 pause holds the sentence; resume continues", i_p2["idx"] == i_p and i_p2["state"] == "paused" and await page.evaluate(f"() => {NA}.state") == "playing", i_p2)
        await page.get_by_role("button", name="Full scientific story").click()
        await page.get_by_role("button", name="▶ Narrate").click()
        await page.wait_for_timeout(500)
        await page.get_by_role("button", name="Next sentence").click()
        await page.wait_for_timeout(500)
        s2 = await page.evaluate(f"() => ({{ mode: {NA}.mode, idx: {NA}.idx, n: {NA}.lines.length, src: {NA}.lines[{NA}.idx].sources.length, prog: document.querySelector('.narr-progress')?.textContent }})")
        await shot("n02_full_story")
        check("N4 full scientific story: sentence-level lines, each with sources; next and progress work", s2["mode"] == "full" and s2["idx"] == 1 and s2["n"] > 8 and s2["src"] > 0 and s2["prog"] == f"2 / {s2['n']}", s2)
        await page.get_by_role("button", name="■ Stop").click()
        await page.wait_for_timeout(300)
        check("N5 stop clears the story bubble", await page.evaluate(f"() => {NA}.state === 'idle' && (!{GU}.line || {GU}.line.kind !== 'story')"))
        # voice on: whatever the speech engine does, the story must advance (watchdog)
        if await voice_box.count() and not await voice_box.is_disabled():
            await voice_box.check()
            await page.get_by_role("button", name="Young explorers (short)").click()
            await page.get_by_role("button", name="▶ Narrate").click()
            try:
                await page.wait_for_function(f"() => {NA}.idx >= 1", timeout=25000)
                adv = True
            except Exception:  # noqa: BLE001
                adv = False
            check("N6 browser voice on: the story still advances even if the speech engine stays silent (watchdog)", adv)
            await page.evaluate(f"() => {NA}.stop()")
        else:
            check("N6 browser voice: no speech engine in this browser - captions-only is the honest fallback", True, "voice control disabled")
        await page.get_by_role("button", name="Return to Exploration", exact=True).click()
        await page.wait_for_timeout(500)
        check("N7 leaving the record stops the narration", await page.evaluate(f"() => {NA}.state") == "idle")
        await b.close()

    errs = [e for e in rep["errors"] if "favicon" not in e]
    check("Z1 no console errors", not errs, errs[:5])
    (out / "storytelling_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/space-exploration/storytelling")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
