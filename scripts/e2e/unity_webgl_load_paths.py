"""
Load-path check for the Unity WebGL build (diagnoses "3D renderer download failed" reports).

Cases: page opened as file:// ; first HTTP visit ; reload through Unity's IndexedDB cache (304 revalidation) ;
index.html served WITHOUT its Build/ folder. Each must either reach window.__atlas.ready or show a specific
error naming the cause (window.__atlasError). Needs serve_unity_webgl.py running on :8091.

Usage: python scripts/e2e/unity_webgl_load_paths.py [--channel chrome|msedge]
"""
import asyncio
import pathlib
import shutil
import subprocess
import sys
import tempfile

from playwright.async_api import async_playwright

BUILD = pathlib.Path(__file__).resolve().parents[2] / "unity" / "CosmicAtlas" / "Builds" / "WebGL"


async def attempt(ctx, url, label, expect_ready, expect_text=None, hard=False):
    page = await ctx.new_page()
    if hard:  # hard refresh: bypass the HTTP cache for every request
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    logs, failed, resp = [], [], {}
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text[:220]}") if m.type == "error" else None)
    page.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:220]))
    page.on("requestfailed", lambda r: failed.append(f"{r.url} -> {r.failure}"))
    page.on("response", lambda r: resp.__setitem__(r.url.split('/')[-1] or '/', r.status))
    await page.goto(url)
    try:
        await page.wait_for_function("() => (window.__atlas && window.__atlas.ready) || window.__atlasError", timeout=60000)
    except Exception as e:  # noqa: BLE001
        logs.append("TIMEOUT " + str(e)[:80])
    st = await page.evaluate("() => ({ready: !!(window.__atlas && window.__atlas.ready), err: window.__atlasError || null})")
    ok = st["ready"] if expect_ready else (bool(st["err"]) and (expect_text is None or expect_text in st["err"]))
    print(f"[{'PASS' if ok else 'FAIL'}] {label}: {url}\n   state={st}\n   responses={resp}\n   failed={failed}")
    for line in logs[:6]:
        print("     ", line)
    await page.close()
    return ok


async def main(channel=None):
    page_only = pathlib.Path(tempfile.mkdtemp(prefix="atlas_pageonly_"))
    shutil.copy(BUILD / "index.html", page_only / "index.html")
    results = []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel=channel, headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        print("browser:", channel or "chromium", b.version)
        ctx = await b.new_context()
        results.append(await attempt(ctx, (BUILD / "index.html").as_uri(), "file:// page", False, "over HTTP"))
        results.append(await attempt(ctx, "http://127.0.0.1:8091/", "HTTP first visit", True))
        results.append(await attempt(ctx, "http://127.0.0.1:8091/", "HTTP reload (UnityCache 304)", True))
        results.append(await attempt(ctx, "http://127.0.0.1:8091/", "HTTP hard refresh (HTTP cache disabled)", True, hard=True))
        incog = await b.new_context()  # fresh profile = clean cache, like an incognito window
        results.append(await attempt(incog, "http://127.0.0.1:8091/", "clean profile (incognito-equivalent)", True))
        await incog.close()
        srv = subprocess.Popen([sys.executable, "-m", "http.server", "8092", "--bind", "127.0.0.1", "--directory", str(page_only)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        await asyncio.sleep(1.5)
        try:
            results.append(await attempt(ctx, "http://127.0.0.1:8092/", "index.html without Build/", False, "HTTP 404"))
        finally:
            srv.terminate()
        await b.close()
    print(f"RESULT: {'PASS' if all(results) else 'FAIL'} ({sum(results)}/{len(results)})")
    return 0 if all(results) else 1


if __name__ == "__main__":
    ch = sys.argv[sys.argv.index("--channel") + 1] if "--channel" in sys.argv else None
    sys.exit(asyncio.run(main(ch)))
