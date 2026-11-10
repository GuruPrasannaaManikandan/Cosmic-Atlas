"""
Stage 2 gate measurement for the Unity Mars prototype (FINAL_VISUAL_REALISM_SPEC.md §2.1).

Serves the WebGL build, loads it in Chromium on this machine's GPU (ANGLE D3D11), then for each quality profile runs
the in-player 60 s scripted camera path and reads Unity's OWN frame timing from window.__mars (MarsBridge.jslib).
Also records: load time, renderer string, tab visibility, WASM heap after load / after each profile / after 10 profile
switches, the in-player terrain height check, Brotli size of the build, and screenshots.

Usage: python scripts/e2e/mars_prototype_benchmark.py --build unity/CosmicAtlas/Builds/MarsPrototype --out docs/qa/space-exploration/mars-prototype [--headed] [--uncapped] [--seconds 60]
"""
import argparse, asyncio, functools, http.server, json, threading, time
from pathlib import Path

import brotli
from playwright.async_api import async_playwright


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "application/javascript", ".data": "application/octet-stream"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def serve(directory: str, port: int):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=directory))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def brotli_sizes(build: Path) -> dict:
    out = {}
    for f in sorted((build / "Build").iterdir()):
        raw = f.read_bytes()
        out[f.name] = {"raw": len(raw), "brotli": len(brotli.compress(raw, quality=11))}
    out["total"] = {"raw": sum(v["raw"] for v in out.values()), "brotli": sum(v["brotli"] for v in out.values())}
    return out


HEAP = "() => { try { return Math.round(window.unityInstance.Module.HEAPU8.length / 1048576) } catch (e) { return null } }"


async def run(a) -> dict:
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rep = {"viewport": [a.width, a.height], "headed": a.headed, "uncapped": a.uncapped, "seconds": a.seconds, "profiles": {}, "errors": []}
    srv = serve(a.build, a.port)
    async with async_playwright() as p:
        args = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl", "--enable-precise-memory-info"]
        if a.uncapped:
            args += ["--disable-gpu-vsync", "--disable-frame-rate-limit"]
        b = await p.chromium.launch(headless=not a.headed, args=args)
        rep["browserVersion"] = b.version
        page = await b.new_page(viewport={"width": a.width, "height": a.height})
        page.on("console", lambda m: rep["errors"].append(m.text[:300]) if m.type == "error" else None)
        page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:300]))
        t0 = time.time()
        await page.goto(f"http://127.0.0.1:{a.port}/", wait_until="domcontentloaded")
        await page.wait_for_function("() => (window.__mars && window.__mars.ready) || window.__atlasError", timeout=600000)
        rep["loadSeconds"] = round(time.time() - t0, 1)
        rep["pageError"] = await page.evaluate("() => window.__atlasError || null")
        rep["ready"] = await page.evaluate("() => window.__mars.ready")
        rep["renderer"] = await page.evaluate("""() => { const c = document.createElement('canvas').getContext('webgl2');
            if (!c) return 'no-webgl2'; const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER) }""")
        rep["visibility"] = await page.evaluate("() => document.visibilityState")
        rep["heapAfterLoadMB"] = await page.evaluate(HEAP)
        print("loaded in", rep["loadSeconds"], "s |", rep["renderer"], "| heap", rep["heapAfterLoadMB"], "MB | visible:", rep["visibility"])
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(out / "load_balanced.png"))

        for prof in a.profiles:
            await page.evaluate(f"() => window.unityInstance.SendMessage('MarsPrototype', 'SetProfile', '{prof}')")
            await page.wait_for_function(f"() => window.__mars.profile && window.__mars.profile.id === '{prof}'", timeout=180000)
            await page.wait_for_timeout(2000)
            await page.evaluate(f"() => {{ window.__mars.benchmark = null; window.unityInstance.SendMessage('MarsPrototype', 'RunBenchmark', '{a.seconds}') }}")
            await page.wait_for_function(f"() => window.__mars.benchmark && window.__mars.benchmark.running === false && window.__mars.benchmark.profile === '{prof}'",
                                         timeout=int((a.seconds + 120) * 1000))
            res = await page.evaluate("() => window.__mars.benchmark")
            res["heapMB"] = await page.evaluate(HEAP)
            res["terrainTrianglesLod0"] = (await page.evaluate("() => window.__mars.profile"))["terrainTriangles"]
            rep["profiles"][prof] = res
            print(f"{prof:12s} fps p50 {res['fpsP50']:.1f}  p5 {res['fpsP5']:.1f}  ms p50/p95/p99 {res['msP50']:.1f}/{res['msP95']:.1f}/{res['msP99']:.1f}  heap {res['heapMB']} MB  tris {res['terrainTrianglesLod0']}")
            # screenshots at two points of the path (overview ~t=10 s, rover close-up ~t=50 s)
            for tag, lo, hi in (("overview", 9.0, 12.0), ("rover", 48.0, 52.0)):
                await page.wait_for_function(f"() => {{ const t = window.__mars.stats && (window.__mars.stats.pathT % 60); return t >= {lo} && t <= {hi} }}", timeout=90000, polling=100)
                await page.screenshot(path=str(out / f"{prof}_{tag}.png"))

        # heap stability: 10 profile switches
        seq = ["ultra", "performance"] * 5
        for prof in seq:
            await page.evaluate(f"() => window.unityInstance.SendMessage('MarsPrototype', 'SetProfile', '{prof}')")
            await page.wait_for_function(f"() => window.__mars.profile && window.__mars.profile.id === '{prof}'", timeout=180000)
        rep["heapAfter10SwitchesMB"] = await page.evaluate(HEAP)
        rep["readyFinal"] = await page.evaluate("() => window.__mars.ready")
        await b.close()
    srv.shutdown()
    rep["buildSize"] = brotli_sizes(Path(a.build))
    g = rep["profiles"].get("balanced")
    rep["gates"] = {
        "balancedFpsP50>=30": None if not g else g["fpsP50"] >= 30,
        "balancedFpsP5>=24": None if not g else g["fpsP5"] >= 24,
        "firstSceneBrotli<=40MB": rep["buildSize"]["total"]["brotli"] <= 40 * 1024 * 1024,
        "heap<=512MB(after load and 10 switches)": max(x or 0 for x in [rep["heapAfterLoadMB"], rep["heapAfter10SwitchesMB"]]) <= 512,
        "heapStableAfterSwitches": rep["heapAfter10SwitchesMB"] == max(v["heapMB"] for v in rep["profiles"].values()) if rep["profiles"] else None,
        "loadToFirstFrame<=15s": rep["loadSeconds"] <= 15,
        "terrainHeights<=0.05m": (rep["ready"] or {}).get("heightCheck", {}).get("pass"),
        "consoleErrors": len(rep["errors"]),
    }
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", default="unity/CosmicAtlas/Builds/MarsPrototype")
    ap.add_argument("--out", default="docs/qa/space-exploration/mars-prototype")
    ap.add_argument("--port", type=int, default=8093)
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--uncapped", action="store_true")
    ap.add_argument("--profiles", default="balanced,performance,high,ultra")
    a = ap.parse_args()
    a.profiles = a.profiles.split(",")
    rep = asyncio.run(run(a))
    tag = ("headed" if a.headed else "headless") + ("_uncapped" if a.uncapped else "")
    Path(a.out, f"benchmark_{tag}.json").write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep["gates"], indent=1))
    print("brotli total MB:", round(rep["buildSize"]["total"]["brotli"] / 1048576, 2), "raw MB:", round(rep["buildSize"]["total"]["raw"] / 1048576, 2))


if __name__ == "__main__":
    main()
