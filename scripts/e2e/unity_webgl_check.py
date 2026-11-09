"""
Loads the Unity WebGL PRODUCTION build in Chromium on the local GPU (ANGLE/D3D11) and verifies it through the JS bridge.

Checks (each reported PASS/FAIL in webgl_report.json):
  template      the AtlasMinimal page loads, creates window.unityInstance, no __atlasError
  unity->js     AtlasReportReady sets window.__atlas.ready; AtlasReportFrame publishes frame statistics
  js->unity     SendMessage('ShowcaseController', 'SelectFromJs' / 'SetQualityFromJs') changes the station / quality
                and Unity's next report ECHOES the requested values (bridge round trip)
  robustness    malformed SendMessage arguments are ignored; Unity keeps reporting frames afterwards
  shaders       every runtime Shader.Find() shader resolves in the player (diagnostics.missingShaders == [])
  catalogue     the catalogue model deserialised after IL2CPP stripping (all collections non-empty, Earth elements present)
  stations      every station renders at every requested quality tier without page errors
  failure path  (separate browser with WebGL disabled) the template shows its "needs WebGL 2" message and sets __atlasError

Measurements: Unity's OWN average frame time (ShowcaseController averages 30 frames per report; 6 reports per sample,
median/min/max), WASM heap size, JS heap (performance.memory, Chromium), load time. Screenshots: every station at the
first quality tier, and the black hole, nebula and Earth stations at every tier.
Uncapped (--uncapped) disables vsync / frame-rate limits so frame time reflects GPU+CPU cost, not the display rate.

Usage:
  python scripts/e2e/serve_unity_webgl.py --dir unity/CosmicAtlas/Builds/WebGL --port 8091   (separate process)
  python scripts/e2e/unity_webgl_check.py --base http://127.0.0.1:8091 --out docs/unity-m2/webgl --uncapped
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

QUALITY_INDEX = {"Low": 0, "Medium": 1, "High": 2, "Ultra": 3}
TIER_SHOT_STATIONS = {"Earth", "BlackHole", "Nebula"}
STATION_NAMES = ["Stars", "JupiterSystem", "Moons", "Earth", "BlackHole", "Nebula", "Galaxies", "Pulsar", "SmallBodies", "Comet"]


def check(rep: dict, name: str, ok: bool, detail: str = "") -> None:
    rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {('— ' + detail) if detail else ''}")


async def wait_reports(page, station: int, quality: int, count: int, timeout_ms: int = 60000) -> list[float]:
    stamp = await page.evaluate("() => performance.now()")
    samples = []
    for _ in range(count):
        await page.wait_for_function(
            f"() => window.__atlas.updatedAt > {stamp} && window.__atlas.station === {station} && window.__atlas.quality === {quality}",
            timeout=timeout_ms)
        a = await page.evaluate("() => ({ ms: window.__atlas.avgFrameMs, at: window.__atlas.updatedAt })")
        samples.append(a["ms"])
        stamp = a["at"]
    return samples


async def send(page, method: str, arg: str) -> None:
    await page.evaluate(f"() => window.unityInstance.SendMessage('ShowcaseController', '{method}', {json.dumps(arg)})")


async def memory(page) -> dict:
    return await page.evaluate("""() => {
        let heap = null; try { heap = Math.round(window.unityInstance.Module.HEAPU8.length / 1048576) } catch (e) {}
        const m = performance.memory;
        return { wasmHeapMB: heap, jsHeapUsedMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null, jsHeapTotalMB: m ? Math.round(m.totalJSHeapSize / 1048576) : null };
    }""")


async def run(base: str, out: Path, uncapped: bool, qualities: list[str], w: int, h: int, headed: bool = False) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    rep: dict = {"base": base, "viewport": [w, h], "uncapped": uncapped, "headed": headed, "qualities": qualities, "checks": [], "results": []}
    async with async_playwright() as p:
        args = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl", "--enable-precise-memory-info"]
        if uncapped:
            args += ["--disable-gpu-vsync", "--disable-frame-rate-limit"]
        browser = await p.chromium.launch(headless=not headed, args=args)
        rep["browserVersion"] = browser.version
        page = await browser.new_page(viewport={"width": w, "height": h})
        errors: list[str] = []
        warnings: list[str] = []
        page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else (warnings.append(m.text[:300]) if "[Bridge]" in m.text else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)[:300]))
        t0 = time.time()
        await page.goto(base, wait_until="domcontentloaded")
        try:
            await page.wait_for_function("() => (window.unityInstance && window.__atlas && window.__atlas.ready) || window.__atlasError", timeout=300000)
        except Exception as e:  # noqa: BLE001
            rep["loadError"] = str(e)
        rep["loadSeconds"] = round(time.time() - t0, 1)
        rep["pageError"] = await page.evaluate("() => window.__atlasError || null")
        rep["atlas"] = await page.evaluate("() => window.__atlas || null")
        rep["renderer"] = await page.evaluate("""() => { const c = document.createElement('canvas').getContext('webgl2');
            if (!c) return 'no-webgl2'; const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER) }""")
        rep["memoryAfterLoad"] = await memory(page)
        atlas = rep["atlas"] or {}
        print("load:", rep["loadSeconds"], "s | renderer:", rep["renderer"], "| memory:", rep["memoryAfterLoad"])

        check(rep, "template: page loads and creates unityInstance", bool(await page.evaluate("() => !!window.unityInstance")) and not rep["pageError"],
              f"{rep['loadSeconds']} s, error={rep['pageError']}")
        check(rep, "unity->js: AtlasReportReady published window.__atlas.ready", bool(atlas.get("ready")),
              f"stationCount={atlas.get('stationCount')} autoQuality={atlas.get('autoQuality')} device={atlas.get('device')}")
        diag = atlas.get("diagnostics") or {}
        check(rep, "shaders: every runtime Shader.Find shader resolves in the player", diag.get("missingShaders") == [],
              f"missing={diag.get('missingShaders')}")
        cat = diag.get("catalog") or {}
        cat_ok = all((cat.get(k) or 0) > 0 for k in ("planetElements", "planetPoles", "planetRadiusKm", "saturnRings", "objects", "solarBodies")) \
            and cat.get("schemaVersion", -1) >= 1 and isinstance(cat.get("earthElements"), dict)
        check(rep, "catalogue: model survives IL2CPP stripping (all collections populated)", cat_ok,
              json.dumps({k: v for k, v in cat.items() if k != "earthElements"}) + f" earthElements keys={list((cat.get('earthElements') or {}).keys())[:6]}")

        if atlas.get("ready"):
            n = atlas["stationCount"]
            check(rep, "stations: all 10 showcase stations built in the player", n == 10, f"stationCount={n}")
            # bridge round trip: initial frame reports arrive at all
            try:
                await page.wait_for_function("() => window.__atlas.frames > 0", timeout=60000)
                check(rep, "unity->js: AtlasReportFrame publishes frame statistics", True, f"avgFrameMs={await page.evaluate('() => window.__atlas.avgFrameMs')}")
            except Exception as e:  # noqa: BLE001
                check(rep, "unity->js: AtlasReportFrame publishes frame statistics", False, str(e)[:200])
            echo_fail: list[str] = []
            for q in qualities:
                qi = QUALITY_INDEX[q]
                await send(page, "SetQualityFromJs", q)
                for s in range(n):
                    await send(page, "SelectFromJs", f"{s},0")
                    await page.wait_for_timeout(1500)  # warm-up: shader variants, uploads
                    try:
                        samples = sorted(await wait_reports(page, s, qi, 6))
                    except Exception as e:  # noqa: BLE001
                        echo_fail.append(f"{q}/station {s}: {str(e)[:120]}")
                        continue
                    mem = await memory(page)
                    name = STATION_NAMES[s] if s < len(STATION_NAMES) else str(s)
                    r = {"quality": q, "station": s, "name": name, "medianFrameMs": round(samples[len(samples) // 2], 2),
                         "minFrameMs": round(samples[0], 2), "maxFrameMs": round(samples[-1], 2), **mem}
                    if q == qualities[0] or name in TIER_SHOT_STATIONS:
                        shot = out / f"webgl_{s:02d}_{name}_{q}.png"
                        await page.screenshot(path=str(shot))
                        r["screenshot"] = shot.name
                    rep["results"].append(r)
                    print(f"{q:6s} {s} {name:13s}: median {r['medianFrameMs']:7.2f} ms (min {r['minFrameMs']}, max {r['maxFrameMs']}), wasm {mem['wasmHeapMB']} MB, js {mem['jsHeapUsedMB']} MB")
            check(rep, "js->unity: SelectFromJs/SetQualityFromJs round trip echoed for every station and tier", not echo_fail,
                  f"{len(rep['results'])} station x tier combinations echoed; failures={echo_fail[:3]}")
            # robustness: malformed arguments are ignored and Unity keeps running on the last valid state
            last = rep["results"][-1] if rep["results"] else {"station": 0, "quality": qualities[-1]}
            await send(page, "SetQualityFromJs", "Bogus")
            await send(page, "SelectFromJs", "x,y")
            try:
                await wait_reports(page, last["station"], QUALITY_INDEX[last["quality"]], 2)
                check(rep, "robustness: malformed SendMessage arguments ignored, frames keep coming", True, f"bridge warnings={warnings[-2:]}")
            except Exception as e:  # noqa: BLE001
                check(rep, "robustness: malformed SendMessage arguments ignored, frames keep coming", False, str(e)[:200])
        rep["memoryAtEnd"] = await memory(page)
        rep["consoleErrors"] = errors[:20]
        check(rep, "no console errors or uncaught page errors", not errors, f"{len(errors)} errors {errors[:2]}")
        await browser.close()

        # failure path: WebGL unavailable -> the template must explain instead of hanging
        b2 = await p.chromium.launch(headless=True, args=["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"])
        p2 = await b2.new_page(viewport={"width": 900, "height": 500})
        await p2.goto(base, wait_until="domcontentloaded")
        try:
            await p2.wait_for_function("() => window.__atlasError || window.unityInstance", timeout=60000)
        except Exception:  # noqa: BLE001
            pass
        err = await p2.evaluate("() => window.__atlasError || null")
        shot = out / "webgl_failure_path_no_webgl.png"
        await p2.screenshot(path=str(shot))
        check(rep, "failure path: template reports missing WebGL 2 clearly", bool(err) and "WebGL" in err, f"__atlasError={err!r}")
        await b2.close()

    rep["pass"] = all(c["pass"] for c in rep["checks"])
    (out / "webgl_report.json").write_text(json.dumps(rep, indent=1))
    return rep


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8091")
    ap.add_argument("--out", default="docs/unity-m2/webgl")
    ap.add_argument("--uncapped", action="store_true")
    ap.add_argument("--qualities", default="Medium,Low,High,Ultra")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--headed", action="store_true", help="visible browser window (frames are really presented)")
    a = ap.parse_args()
    rep = asyncio.run(run(a.base, Path(a.out), a.uncapped, a.qualities.split(","), a.width, a.height, a.headed))
    passed = sum(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if rep['pass'] else 'FAIL'} ({passed}/{len(rep['checks'])} checks)")
    return 0 if rep["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
