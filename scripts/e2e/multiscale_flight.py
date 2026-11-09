"""
Multi-scale navigation check after the occlusion fix: fly from the intro (cosmic-web scale) to the Milky Way, the
Solar System and Mars with the real fly-to, recording the adaptive scale, a screenshot at each stage, and console
errors. Mid-flight frames are sampled to catch depth popping (a flight must not reveal stars through Mars on arrival).

Usage: python scripts/e2e/multiscale_flight.py --base http://localhost:5173 --out docs/qa/planetary-opacity
"""
import argparse, asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright


async def main(base: str, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep, errs = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 800})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:200]))
        await page.goto(base, wait_until="networkidle")
        await page.wait_for_function("() => window.__store && window.__nav")
        await page.evaluate("() => { const s = window.__store.getState(); s.setPhase('explore'); s.setPlaying(false); s.set({ leftOpen: false, rightOpen: false }) }")
        await page.wait_for_timeout(1500)
        for i, target in enumerate(["laniakea", "milky-way", "sun", "mars"]):
            await page.evaluate(f"() => window.__store.getState().travel('{target}')")
            mid = 0
            for k in range(40):
                await page.wait_for_timeout(250)
                if k == 6:
                    await page.screenshot(path=str(out / f"multiscale_{i + 1}_{target}_midflight.png"))
                    mid = await page.evaluate("() => window.__nav.scale")
                if not await page.evaluate("() => !!window.__nav.flight"):
                    break
            await page.wait_for_timeout(800)
            st = await page.evaluate("() => ({ scale: window.__nav.scale, nearest: window.__nav.nearestId, flying: !!window.__nav.flight })")
            await page.screenshot(path=str(out / f"multiscale_{i + 1}_{target}_arrived.png"))
            rep.append({"target": target, "midflightScale": mid, **st})
            print(target, st)
        await b.close()
    (out / "multiscale_flight.json").write_text(json.dumps({"stages": rep, "consoleErrors": errs}, indent=1))
    ok = not errs and all(not r["flying"] for r in rep) and rep[-1]["nearest"] in ("mars", "phobos", "deimos")
    print("console errors:", errs[:3])
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/planetary-opacity")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out))))
