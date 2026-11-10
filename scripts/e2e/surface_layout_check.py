"""
Surface HUD + inspection layout audit at seven viewports, in real Chrome.

For each viewport it measures the rendered rectangles of the HUD regions and the inspection panel and checks:
  - no horizontal page overflow;
  - no two visible HUD elements overlap, and nothing sits under the header;
  - while a guide line is showing, opening an inspection keeps the guide bubble clear of the panel;
  - the panel's close button is visible and actually clickable (topmost at its centre);
  - every inspection tab is fully visible (no clipping, no visible horizontal scrollbar);
  - the 3-D viewport is not covered by the panel (desktop: the canvas ends where the panel begins;
    phone / portrait tablet: the panel is a bottom sheet and the canvas keeps the top of the screen);
  - whole-object framing: the inspected object's projected bounds lie inside the visible canvas (when the app exposes
    the framing hook).
Screenshots of exploring and inspecting states are saved per viewport.

Usage: python scripts/e2e/surface_layout_check.py --out docs/qa/space-exploration/ui-refinement/after [--site apollo-17]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

VIEWPORTS = [(1920, 1080), (1600, 900), (1366, 768), (1280, 720), (1024, 768), (768, 1024), (390, 844)]
ST = "window.__store.getState()"
SU = "window.__surface.state()"
DBG = "window.__surface.debug"

MEASURE = """() => {
  const vis = (el) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null }
  const q = (s) => vis(document.querySelector(s))
  const hud = {
    header: q('.surf-top'), compass: q('.surf-compass'), waypoint: q('.surf-waypoint'), night: q('.surf-night'),
    banner: q('.surf-banner'), prompt: q('.surf-prompt'), minimap: q('.surf-minimap'), keys: q('.surf-keys'),
    bubble: q('[data-testid=guide-bubble]'), touch: q('.touch-stick'), touchBtns: q('.touch-buttons'),
  }
  const panel = q('.discovery')
  const tabs = document.querySelector('.discovery-tabs')
  let tabInfo = null
  if (tabs && panel) {
    const tr = tabs.getBoundingClientRect()
    const btns = [...tabs.querySelectorAll('[role=tab]')].map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent.trim(), clipped: r.right > tr.right + 0.5 || r.left < tr.left - 0.5 || r.bottom > tr.bottom + 0.5 || b.scrollWidth > b.clientWidth + 1 } })
    tabInfo = { scrollbar: tabs.scrollWidth > tabs.clientWidth + 1 && getComputedStyle(tabs).overflowX !== 'hidden', tabs: btns }
  }
  let close = null
  const cb = document.querySelector('.discovery-close')
  if (cb) { const r = cb.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); close = { inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, clickable: !!top && (top === cb || cb.contains(top)) } }
  const cv = document.querySelector('[data-testid=surface-root] canvas')
  const canvas = cv ? (() => { const r = cv.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })() : null
  return { hud, panel, tabInfo, close, canvas, overflowX: document.documentElement.scrollWidth > innerWidth + 1, vw: innerWidth, vh: innerHeight }
}"""


def inter(a, b, tol=2):
    if not a or not b:
        return 0
    w = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
    h = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
    return w * h if w > tol and h > tol else 0


async def main(base: str, out: Path, site: str) -> int:
    out.mkdir(parents=True, exist_ok=True)
    rep = {"checks": [], "viewports": {}, "errors": []}

    def check(name, ok, detail=""):
        rep["checks"].append({"check": name, "pass": bool(ok), "detail": detail if isinstance(detail, (dict, list)) else str(detail)[:400]})
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {('- ' + str(detail)[:200]) if detail != '' else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        for (w, h) in VIEWPORTS:
            mobile = w < 500
            ctx = await b.new_context(viewport={"width": w, "height": h}, has_touch=mobile, is_mobile=mobile)
            await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
            page = await ctx.new_page()
            page.on("pageerror", lambda e: rep["errors"].append("PAGEERROR " + str(e)[:200]))
            tag = f"{w}x{h}"
            await page.goto(base, wait_until="networkidle")
            await page.wait_for_function("() => window.__store")
            await page.get_by_role("button", name="EXPLORE FREELY").click()
            await page.evaluate(f"() => {{ {ST}.setPlaying(false); {ST}.enterSurface('{site}') }}")
            await page.wait_for_function(f"() => window.__surface && {DBG}.terrain", timeout=60000)
            await page.evaluate(f"() => {SU}.set({{ intro: false }})")
            await page.evaluate(f"() => {ST}.setSim({DBG}.terrain().daylightMs)")
            await page.wait_for_timeout(1200)
            objs = {o["id"]: o for o in (await page.evaluate(f"() => {DBG}.terrain()"))["objects"]}
            lm = next(o for o in objs.values() if o["model"] == "lm-descent-stage")
            # stand near the LM so the E prompt + a guide line are showing, then measure the exploring HUD
            await page.evaluate(f"() => {DBG}.teleport({lm['x'] - 5.5}, {lm['z'] + 2})")
            await page.wait_for_timeout(1500)
            m1 = await page.evaluate(MEASURE)
            await page.screenshot(path=str(out / f"{tag}_explore.jpg"), type="jpeg", quality=80)
            hud = {k: v for k, v in m1["hud"].items() if v}
            pairs = []
            keys = list(hud)
            for i in range(len(keys)):
                for j in range(i + 1, len(keys)):
                    a, c = keys[i], keys[j]
                    # the bubble floats over the scene by design; it only must not cover the controls / header
                    ov = inter(hud[a], hud[c])
                    if ov:
                        pairs.append(f"{a}x{c}:{int(ov)}px2")
            check(f"[{tag}] exploring: no overlapping HUD elements (incl. nothing under the header)", not pairs, pairs[:6])
            check(f"[{tag}] exploring: no horizontal page overflow", not m1["overflowX"])

            # open the inspection while the guide is talking
            await page.evaluate(f"() => window.__guide.state().say({{ kind: 'discover', text: 'Guide line visible while the inspection opens.', sources: ['nssdca-a11-lm'] }}, 20000)")
            await page.evaluate(f"() => {SU}.set({{ panel: {{ objectId: '{lm['id']}', tab: 'inspect' }}, component: null }})")
            await page.wait_for_timeout(1800)
            m2 = await page.evaluate(MEASURE)
            await page.screenshot(path=str(out / f"{tag}_inspect.jpg"), type="jpeg", quality=80)
            pn = m2["panel"]
            bub_over_panel = inter(m2["hud"].get("bubble"), pn) if pn else 0
            check(f"[{tag}] inspecting: the guide bubble never renders under the panel", not bub_over_panel, {"overlap_px2": int(bub_over_panel)})
            check(f"[{tag}] inspecting: close button visible and clickable", m2["close"] and m2["close"]["inView"] and m2["close"]["clickable"], m2["close"])
            ti = m2["tabInfo"] or {"scrollbar": True, "tabs": []}
            clipped = [t["label"] for t in ti["tabs"] if t["clipped"]]
            check(f"[{tag}] inspecting: all {len(ti['tabs'])} tabs fully visible, no visible tab scrollbar", len(ti["tabs"]) == 5 and not clipped and not ti["scrollbar"], {"clipped": clipped, "scrollbar": ti["scrollbar"]})
            cv = m2["canvas"]
            side = pn and pn["h"] > 0.8 * m2["vh"]
            if side:
                covered = cv["x"] + cv["w"] > pn["x"] + 2
                check(f"[{tag}] inspecting (side panel): the 3-D viewport ends where the panel begins", not covered and cv["w"] >= 0.5 * m2["vw"], {"canvasRight": round(cv["x"] + cv["w"]), "panelLeft": round(pn["x"]), "canvasW": round(cv["w"])})
            else:
                covered = pn and (cv["y"] + cv["h"] > pn["y"] + 2)
                check(f"[{tag}] inspecting (bottom sheet): the 3-D viewport keeps the top of the screen", pn is not None and not covered and cv["h"] >= 0.3 * m2["vh"], {"canvasBottom": round(cv["y"] + cv["h"]) if cv else None, "sheetTop": round(pn["y"]) if pn else None})
            hud2 = {k: v for k, v in m2["hud"].items() if v and k != "bubble"}
            under = [k for k, v in hud2.items() if pn and inter(v, pn)]
            check(f"[{tag}] inspecting: no HUD element hidden under the panel", not under, under)
            fr = await page.evaluate(f"() => {DBG}.inspectFrame ? {DBG}.inspectFrame() : null")
            if fr is not None:
                check(f"[{tag}] inspecting: whole object framed inside the 3-D viewport", fr["inside"], fr)
            # every tab opens
            names = [t["label"] for t in ti["tabs"]]
            ok_tabs = True
            for nm in names:
                try:
                    await page.get_by_role("tab", name=nm).click(timeout=3000)
                    await page.wait_for_timeout(150)
                    sel = await page.get_by_role("tab", name=nm).get_attribute("aria-selected")
                    ok_tabs = ok_tabs and sel == "true"
                except Exception:  # noqa: BLE001
                    ok_tabs = False
            await page.screenshot(path=str(out / f"{tag}_inspect_lasttab.jpg"), type="jpeg", quality=80)
            check(f"[{tag}] inspecting: every tab can be selected", ok_tabs and len(names) == 5, names)
            m3 = await page.evaluate(MEASURE)
            check(f"[{tag}] inspecting: no horizontal page overflow", not m3["overflowX"])
            # collapsing the record gives the 3-D view back; expanding restores it
            await page.get_by_role("button", name="Hide the record to see the 3-D view").click()
            await page.wait_for_timeout(700)
            m4 = await page.evaluate(MEASURE)
            await page.screenshot(path=str(out / f"{tag}_inspect_collapsed.jpg"), type="jpeg", quality=80)
            cv4 = m4["canvas"]
            grown = (cv4["w"] >= m4["vw"] - 60) if side else (cv4["h"] >= 0.8 * m4["vh"])
            await page.get_by_role("button", name="Show the record").click()
            await page.wait_for_timeout(500)
            back = (await page.evaluate(MEASURE))["panel"]
            check(f"[{tag}] collapsing the record returns the 3-D space; expanding restores the panel", grown and back is not None and back["h"] > 150, {"canvas": [round(cv4["w"]), round(cv4["h"])], "vw": m4["vw"], "vh": m4["vh"]})
            rep["viewports"][tag] = {"explore": m1, "inspect": m2}
            await ctx.close()
        await b.close()
    errs = [e for e in rep["errors"] if "favicon" not in e]
    check("Z1 no page errors", not errs, errs[:5])
    (out / "layout_report.json").write_text(json.dumps(rep, indent=1))
    ok = all(c["pass"] for c in rep["checks"])
    print(f"RESULT: {'PASS' if ok else 'FAIL'} ({sum(c['pass'] for c in rep['checks'])}/{len(rep['checks'])})")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/qa/space-exploration/ui-refinement/after")
    ap.add_argument("--site", default="apollo-17")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.base, Path(a.out), a.site)))
