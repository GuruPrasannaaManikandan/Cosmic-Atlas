"""
Rendered-result occlusion test: background objects must never be visible through a solid body.

For each solid body and camera pose (several angles incl. the night side, several distances) the live page is
rendered twice in Google Chrome: (1) normally, (2) with everything BEHIND the body hidden - the background point
layers (backdrop stars, Milky Way, cosmic web, dataset points) and every other body's meshes/sprites farther from the
camera than the body (the Sun, planets, moons, stars). Inside the body's projected disk (shrunk to 92 % to stay clear of the atmospheric limb and
anti-aliased edge) the two images must be identical: any difference is background light leaking through the surface.

Usage: python scripts/e2e/occlusion_check.py --base http://localhost:5173 --out docs/qa/planetary-opacity [--tag after]
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BODIES = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "io", "titan", "pluto"]
# (angle from the sun direction in degrees, distance in body radii): lit 3/4, terminator, night side, close and far
POSES = [(50, 3.0), (100, 3.0), (160, 3.0), (160, 12.0), (70, 1.6)]

POSE = """async ([id, angDeg, dist]) => {
  const api = window.__navApi, st = window.__store.getState(), ms = st.simMs;
  const P = api.positionOf(id, ms), S = api.positionOf('sun', ms), R = api.radiusLy(id);
  const nrm = (v) => { const l = Math.hypot(...v); return v.map(x => x / l) };
  const s = nrm([S[0]-P[0], S[1]-P[1], S[2]-P[2]]), z = [0, 0, 1];
  const w = nrm([s[1]*z[2]-s[2]*z[1], s[2]*z[0]-s[0]*z[2], s[0]*z[1]-s[1]*z[0]]);
  const a = angDeg * Math.PI / 180;
  const d = nrm([s[0]*Math.cos(a) + w[0]*Math.sin(a), s[1]*Math.cos(a) + w[1]*Math.sin(a), s[2]*Math.cos(a) + w[2]*Math.sin(a) + 0.15]);
  api.setCameraAt([P[0]+d[0]*dist*R, P[1]+d[1]*dist*R, P[2]+d[2]*dist*R], P);
  await new Promise(r => setTimeout(r, 700));
  const it = (window.__labelState.items || []).find(i => i.id === id);
  if (!it) return null;
  const cam = window.__camera; const c = it.pos.clone().project(cam);
  const dCam = it.pos.length(), ang = Math.asin(Math.min(1, it.rVisual / dCam));
  const fovY = cam.fov * Math.PI / 180, H = innerHeight, W = innerWidth;
  const rPx = Math.tan(ang) / Math.tan(fovY / 2) * H / 2;
  return { cx: (c.x + 1) / 2 * W, cy: (1 - c.y) / 2 * H, rPx, W, H };
}"""

TOGGLE = """([id, hide]) => {
  // hide EVERYTHING that is not the body under test (stars, galaxy, other planets, moons, the Sun, orbit lines...)
  const scene = window.__scene; if (!scene) return 0;
  const target = (window.__labelState.items || []).find(i => i.id === id);
  let root = null;
  scene.traverse(o => {
    if (root || !target || o.type !== 'Group' || o.position.distanceTo(target.pos) > 1e-6 * Math.max(1e-12, target.pos.length())) return;
    let hasBody = false; o.traverse(c => { if (c.name === 'spin' || c.name === 'iau-frame') hasBody = true });
    if (hasBody) root = o;
  });
  const keep = new Set(); if (root) root.traverse(o => keep.add(o));
  // Only what is BEHIND the body is hidden (the camera sits at the scene origin in this renderer): background point
  // layers, and meshes/sprites whose world position is farther than the body. Things that may legitimately be in front
  // stay visible in both images: depth-tested orbit lines and the asteroid belt (it can lie between camera and body).
  const dT = root ? root.getWorldPosition(new root.position.constructor()).length() : 0;
  const v = root ? new root.position.constructor() : null;
  let n = 0;
  scene.traverse(o => {
    if (keep.has(o) || o.isLine || !(o.isPoints || o.isSprite || o.isMesh)) return;
    if (o.isPoints && o.name === 'asteroid-belt') return;
    if (!o.isPoints && o.getWorldPosition(v).length() <= dT) return;
    if (hide) { o.userData.__occl = o.visible; o.visible = false; n++ } else if ('__occl' in o.userData) { o.visible = o.userData.__occl; delete o.userData.__occl }
  });
  return root ? n : -1;
}"""


async def frame(page):
    await page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))")
    return Image.open(io.BytesIO(await page.screenshot(type="png"))).convert("RGB")


def disk_diff(a: Image.Image, b: Image.Image, geo: dict, shrink=0.92):
    diff = ImageChops.difference(a, b).convert("L")
    px = diff.load()
    cx, cy, r = geo["cx"], geo["cy"], geo["rPx"] * shrink
    x0, x1 = max(0, int(cx - r)), min(a.width - 1, int(cx + r))
    y0, y1 = max(0, int(cy - r)), min(a.height - 1, int(cy + r))
    n = bad = 0
    mx = 0
    for y in range(y0, y1 + 1, 2):
        for x in range(x0, x1 + 1, 2):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                n += 1
                v = px[x, y]
                mx = max(mx, v)
                if v > 6:
                    bad += 1
    return n, bad, mx, diff


async def main(a) -> int:
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rep = {"tag": a.tag, "results": []}
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=not a.headed, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        rep["browser"] = f"chrome {b.version}"
        ctx = await b.new_context(viewport={"width": 1280, "height": 800})
        await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
        page = await ctx.new_page()
        errs: list[str] = []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:200]))
        await page.goto(a.base, wait_until="networkidle")
        await page.wait_for_function("() => window.__navApi && window.__scene && window.__labelState")
        await page.evaluate("() => { const s = window.__store.getState(); s.setPhase('explore'); s.setPlaying(false); s.set({ leftOpen: false, rightOpen: false, labels: false }) }")
        await page.add_style_tag(content=".top, .scale-breadcrumbs-bar, .timebar, .dock, .status, .panel, .reopen, .label, .labels, [class*=label] { visibility: hidden !important; }")
        if a.simulate_defect:  # negative control: restore the pre-fix backdrop material at runtime
            n = await page.evaluate("() => { let n = 0; window.__scene.traverse(o => { if (o.name === 'backdrop-stars') { o.material.transparent = true; o.material.depthTest = false; o.material.needsUpdate = true; n++ } }); return n }")
            print("simulated pre-fix backdrop material on", n, "layer(s)")
        await page.wait_for_timeout(2500)
        poses = [(ang, d) for d in (1.3, 4.0, 20.0, 150.0, 2000.0) for ang in range(0, 360, 30)] if a.sweep else POSES
        for body in (a.bodies.split(",") if a.bodies else BODIES):
            for ang, dist in poses:
                geo = await page.evaluate(POSE, [body, ang, dist])
                if not geo or geo["rPx"] < 8:
                    rep["results"].append({"body": body, "angle": ang, "distR": dist, "skipped": "not on screen"})
                    continue
                img_a = await frame(page)
                hidden = await page.evaluate(TOGGLE, [body, True])
                if hidden < 0:
                    rep["results"].append({"body": body, "angle": ang, "distR": dist, "skipped": "body group not found"})
                    continue
                img_b = await frame(page)
                await page.evaluate(TOGGLE, [body, False])
                n, bad, mx, diff = disk_diff(img_a, img_b, geo)
                ok = bad == 0
                r = {"body": body, "angle": ang, "distR": dist, "diskRadiusPx": round(geo["rPx"]), "samples": n, "leakingPixels": bad, "maxDiff": mx, "hiddenLayers": hidden, "pass": ok}
                rep["results"].append(r)
                tag = f"{body}_{ang}deg_{str(dist).replace('.', 'p')}R"
                if not ok or (not a.sweep and (ang, dist) in ((160, 3.0), (50, 3.0))) or (a.sweep and ang in (0, 180) and dist in (1.3, 20.0)):
                    img_a.save(out / f"{a.tag}_{tag}.png")
                if not ok:
                    diff.point(lambda v: min(255, v * 8)).save(out / f"{a.tag}_{tag}_leak_diff.png")
                print(f"{body:8s} {ang:4d} deg {dist:5.1f} R  disk {geo['rPx']:6.0f}px  leaking px {bad:5d}/{n:6d}  max diff {mx:3d}  {'PASS' if ok else 'FAIL'}")
        rep["consoleErrors"] = errs
        await b.close()
    checked = [r for r in rep["results"] if "pass" in r]
    rep["summary"] = {"checked": len(checked), "passed": sum(r["pass"] for r in checked), "skipped": len(rep["results"]) - len(checked)}
    (out / f"occlusion_{a.tag}.json").write_text(json.dumps(rep, indent=1))
    print("summary:", rep["summary"], "console errors:", len(errs))
    ok = all(r["pass"] for r in checked) and not errs
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/planetary-opacity")
    ap.add_argument("--tag", default="before")
    ap.add_argument("--bodies", default="")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--sweep", action="store_true", help="camera movement: 12 angles x 5 distances (1.3-2000 R), across scale transitions")
    ap.add_argument("--simulate-defect", action="store_true", help="negative control: re-create the pre-fix backdrop material")
    sys.exit(asyncio.run(main(ap.parse_args())))
