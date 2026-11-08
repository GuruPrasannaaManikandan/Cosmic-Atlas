"""
Travel Mode browser regression suite (Playwright, Chromium, against the Vite dev server).

Every check drives REAL keyboard / mouse events into the page and reads the live simulation state through the
dev server's module graph (the same module instances the app uses), so a passing check means the control actually
changes the flight state — not merely that a button is on screen.

Usage:
  python scripts/e2e/travel_controls.py --base http://localhost:5173 [--json out.json]
Exit code 1 if any check fails.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

from playwright.async_api import async_playwright

# Read live state ONLY through the app's debug handles. A dynamic import('/src/...') can return a different module
# instance than the app uses after a Vite hot update (the app then imports '...ts?t=<stamp>').
SHIP = "const S = { ship: window.__ship, ...window.__shipApi };"
STORE = "const st = window.__store;"


async def state(page, expr: str):
    return await page.evaluate(f"async () => {{ {SHIP} {STORE} return ({expr}) }}")


async def run(base: str) -> list[dict]:
    results: list[dict] = []

    def record(name: str, ok: bool, detail: str):
        results.append({"check": name, "ok": bool(ok), "detail": detail})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} — {detail}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"])
        ctx = await browser.new_context(viewport={"width": 1366, "height": 768})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(base, wait_until="domcontentloaded")
        await page.wait_for_function("() => !!window.__store", timeout=30000)

        async def enter(view: str = "chase"):
            await page.evaluate("() => window.__store.getState().set({ navMapOpen: false })")
            await page.evaluate(f"async () => {{ {SHIP} {STORE} st.getState().setPhase('explore'); st.getState().enterTravelMode('earth'); S.setCameraView('{view}'); S.ship.thrust = 0; S.ship.vel = [0,0,0]; S.ship.gear = 1 }}")
            await page.wait_for_timeout(500)
            await page.mouse.click(683, 420)  # focus the canvas like a user would
            await page.wait_for_timeout(150)

        def rotate(q, v):
            x, y, z, w = q
            ux, uy, uz = x, y, z
            tx, ty, tz = 2 * (uy * v[2] - uz * v[1]), 2 * (uz * v[0] - ux * v[2]), 2 * (ux * v[1] - uy * v[0])
            return [v[0] + w * tx + (uy * tz - uz * ty), v[1] + w * ty + (uz * tx - ux * tz), v[2] + w * tz + (ux * ty - uy * tx)]

        async def fwd_right_up():
            q = await state(page, "[S.ship.quat.x, S.ship.quat.y, S.ship.quat.z, S.ship.quat.w]")
            return {"f": rotate(q, [0, 0, -1]), "r": rotate(q, [1, 0, 0]), "u": rotate(q, [0, 1, 0]), "quat": q}

        def to_three(v):  # galactic (root) -> three axes
            return [v[0], v[2], -v[1]]

        async def displacement(action, ms: int):
            # exact km offset from the reference body when it does not change; root-frame ly otherwise
            # (root-frame positions are quantised at ~34 km near the Sun, which hides slow manoeuvres)
            a0 = await state(page, "({ ref: S.ship.refBodyId, local: S.ship.localKm && S.ship.localKm.slice(), pos: S.ship.pos.slice() })")
            await action()
            await page.wait_for_timeout(ms)
            a1 = await state(page, "({ ref: S.ship.refBodyId, local: S.ship.localKm && S.ship.localKm.slice(), pos: S.ship.pos.slice() })")
            if a0["ref"] == a1["ref"] and a0["local"] and a1["local"]:
                return to_three([a1["local"][i] - a0["local"][i] for i in range(3)])
            return to_three([a1["pos"][i] - a0["pos"][i] for i in range(3)])

        def dot(a, b):
            return sum(x * y for x, y in zip(a, b))

        def norm(a):
            return sum(x * x for x in a) ** 0.5

        # ---- W: forward ---------------------------------------------------------------------------------
        await enter()
        axes = await fwd_right_up()
        await page.keyboard.down("w")
        await page.wait_for_timeout(900)
        d = await displacement(lambda: asyncio.sleep(0), 600)
        await page.keyboard.up("w")
        record("W moves forward", norm(d) > 0 and dot(d, axes["f"]) > 0.9 * norm(d),
               f"thrust={await state(page, 'S.ship.thrust'):.2f} cos(move,fwd)={dot(d, axes['f']) / max(norm(d), 1e-30):.3f}")

        # ---- opposing keys: releasing S while W is still held must not cancel W ----------------------------
        await enter()
        await page.keyboard.down("w")
        await page.wait_for_timeout(300)
        await page.keyboard.down("s")
        await page.wait_for_timeout(150)
        await page.keyboard.up("s")
        t0 = await state(page, "S.ship.thrust")
        await page.wait_for_timeout(500)
        t1 = await state(page, "S.ship.thrust")
        await page.keyboard.up("w")
        record("Releasing S while W held keeps W active", t1 > t0 + 0.05, f"thrust {t0:.2f} -> {t1:.2f}")

        # ---- S: backward ----------------------------------------------------------------------------------
        await enter()
        axes = await fwd_right_up()
        await page.keyboard.down("s")
        await page.wait_for_timeout(900)
        d = await displacement(lambda: asyncio.sleep(0), 600)
        await page.keyboard.up("s")
        record("S moves backward", norm(d) > 0 and dot(d, axes["f"]) < -0.9 * norm(d),
               f"cos(move,fwd)={dot(d, axes['f']) / max(norm(d), 1e-30):.3f} |d|={norm(d):.3e}")

        # ---- A / D: left / right (translation, attitude unchanged) ----------------------------------------
        for key, sign, name in (("a", -1, "A moves left"), ("d", 1, "D moves right")):
            await enter()
            axes = await fwd_right_up()
            await page.keyboard.down(key)
            await page.wait_for_timeout(900)
            d = await displacement(lambda: asyncio.sleep(0), 500)
            await page.keyboard.up(key)
            q1 = (await fwd_right_up())["quat"]
            turned = abs(dot(q1, axes["quat"])) < 0.9999
            c = dot(d, axes["r"]) / max(norm(d), 1e-30)
            record(name, norm(d) > 0 and sign * c > 0.9 and not turned, f"cos(move,right)={c:.3f} attitudeChanged={turned}")

        # ---- Space / C: ascend / descend ------------------------------------------------------------------
        for key, sign, name in (("Space", 1, "Space ascends"), ("c", -1, "C descends")):
            await enter()
            axes = await fwd_right_up()
            await page.keyboard.down(key)
            await page.wait_for_timeout(900)
            d = await displacement(lambda: asyncio.sleep(0), 500)
            await page.keyboard.up(key)
            c = dot(d, axes["u"]) / max(norm(d), 1e-30)
            record(name, norm(d) > 0 and sign * c > 0.9, f"cos(move,up)={c:.3f}")

        # ---- Shift: boost while held ----------------------------------------------------------------------
        await enter()
        await page.keyboard.down("Shift")
        await page.wait_for_timeout(200)
        b_on = await state(page, "S.ship.boost")
        await page.keyboard.up("Shift")
        await page.wait_for_timeout(200)
        b_off = await state(page, "S.ship.boost")
        record("Shift boosts only while held", b_on is True and b_off is False, f"held={b_on} released={b_off}")

        # ---- stuck keys: window blur while W is held -----------------------------------------------------
        await enter()
        await page.keyboard.down("w")
        await page.wait_for_timeout(300)
        await page.evaluate("() => window.dispatchEvent(new Event('blur'))")
        await page.wait_for_timeout(100)
        t0 = await state(page, "S.ship.thrust")
        await page.wait_for_timeout(600)
        t1 = await state(page, "S.ship.thrust")
        await page.keyboard.up("w")
        record("Window blur releases held keys (no stuck throttle)", abs(t1 - t0) < 1e-6, f"thrust {t0:.3f} -> {t1:.3f} after blur")

        # ---- mouse look in cockpit -------------------------------------------------------------------------
        await enter("cockpit")
        q0 = (await fwd_right_up())["quat"]
        await page.mouse.move(683, 420)
        await page.mouse.down()
        for i in range(10):
            await page.mouse.move(683 + 15 * (i + 1), 420 + 4 * (i + 1))
            await page.wait_for_timeout(30)
        await page.mouse.up()
        await page.wait_for_timeout(200)
        q1 = (await fwd_right_up())["quat"]
        record("Mouse drag looks around in cockpit view", abs(dot(q0, q1)) < 0.9995, f"|q0·q1|={abs(dot(q0, q1)):.5f}")

        # ---- mouse wheel zoom (external) -----------------------------------------------------------------
        await enter("external")
        d0 = await state(page, "S.ship.orbitAngle.dist")
        await page.mouse.move(683, 420)
        await page.mouse.wheel(0, 400)
        await page.wait_for_timeout(200)
        d1 = await state(page, "S.ship.orbitAngle.dist")
        record("Mouse wheel zooms the external camera", d1 != d0, f"dist {d0} -> {d1}")

        # ---- V cycles cameras ------------------------------------------------------------------------------
        await enter("chase")
        seen = []
        for _ in range(3):
            await page.keyboard.press("v")
            await page.wait_for_timeout(120)
            seen.append(await state(page, "S.ship.cameraView"))
        record("V cycles cockpit / chase / external", sorted(set(seen)) == ["chase", "cockpit", "external"], f"{seen}")

        # ---- NavMap search accepts the letter m ------------------------------------------------------------
        await enter()
        await page.keyboard.press("m")
        await page.wait_for_timeout(400)
        opened = await state(page, "st.getState().navMapOpen")
        inp = page.locator(".navmap-card input").first
        typed_ok = False
        if opened and await inp.count():
            await inp.click()
            await inp.type("mars", delay=40)
            await page.wait_for_timeout(200)
            typed_ok = (await state(page, "st.getState().navMapOpen")) and (await inp.input_value()) == "mars"
        record("NavMap opens with M and its search accepts 'mars'", opened and typed_ok, f"opened={opened} stillOpenWithQuery={typed_ok}")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        record("Escape closes the NavMap", not await state(page, "st.getState().navMapOpen"), "")

        # ---- Escape exits Travel Mode -----------------------------------------------------------------------
        await enter()
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        record("Escape exits Travel Mode", await state(page, "st.getState().phase") == "explore",
               f"phase={await state(page, 'st.getState().phase')}")

        # ---- Autopilot to the Moon: arrival + station keeping while time runs -------------------------------
        await enter()
        await page.evaluate(f"async () => {{ {SHIP} {STORE} S.engageAutopilot('moon', st.getState().simMs) }}")
        arrived = False
        for _ in range(120):
            await page.wait_for_timeout(500)
            ap = await state(page, "({ active: S.ship.autopilot.active, phase: S.ship.autopilot.phase })")
            if not ap["active"] and ap["phase"] == "arrive":
                arrived = True
                break
        record("Autopilot arrives at the Moon", arrived, f"last={ap}")
        if arrived:
            rel = """(() => { const P = S.positionOf('moon', st.getState().simMs);
                      return Math.hypot(P[0]-S.ship.pos[0], P[1]-S.ship.pos[1], P[2]-S.ship.pos[2]) / 1.0570008340246154e-13 })()"""
            k0 = await state(page, rel)
            await page.evaluate("() => { const s = window.__store.getState(); s.setRate(1); s.setPlaying(true) }")
            await page.wait_for_timeout(3000)
            k1 = await state(page, rel)
            await page.evaluate("() => window.__store.getState().setPlaying(false)")
            record("Station keeping: Moon distance stable while time plays at 1 d/s",
                   abs(k1 - k0) < max(0.05 * k0, 50), f"{k0:,.0f} km -> {k1:,.0f} km")

        record("No uncaught page errors", not errors, "; ".join(errors[:3]))
        await browser.close()
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--json")
    a = ap.parse_args()
    res = asyncio.run(run(a.base))
    if a.json:
        with open(a.json, "w") as f:
            json.dump(res, f, indent=1)
    failed = [r for r in res if not r["ok"]]
    print(f"\n{len(res) - len(failed)}/{len(res)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
