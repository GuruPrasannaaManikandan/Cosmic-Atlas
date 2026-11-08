"""
Responsive layout audit for Cosmic Atlas (Playwright, Chromium).

For each standard viewport it loads the app, enters Explore mode, selects Earth (opening the Inspector) and measures:
  * page-level horizontal overflow
  * every interactive control in the top header: inside the viewport? actually hit-testable at its centre
    (i.e. not covered by another element)? only reachable by scrolling the nav strip?
  * pairwise overlaps between the major layout regions (header, breadcrumbs, browser, inspector, timebar, dock, status)
Screenshots and a JSON report are written to --out.

Usage:
  python scripts/e2e/layout_audit.py --base http://localhost:5173 --out docs/ui-audit/before
Exit code 1 if any control is clipped/covered or the page overflows horizontally (use --no-fail to only report).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

VIEWPORTS = [(1920, 1080), (1600, 900), (1366, 768), (1280, 720), (1024, 768), (768, 1024), (390, 844)]

REQUIRED_NAV = ["Find Home", "Travel Mode", "Cosmic Events", "Academy", "Earth", "Milky Way", "Solar System",
                "Data Intelligence", "Help", "Notes"]

REACH_JS = r"""
(required) => {
  const W = window.innerWidth, H = window.innerHeight
  const ok = (el) => {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false
    if (r.left < -0.5 || r.right > W + 0.5 || r.top < -0.5 || r.bottom > H + 0.5) return false
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (hit === el || el.contains(hit))
  }
  const names = (sel) => Array.from(document.querySelectorAll(sel)).filter(ok).map((b) =>
    (b.getAttribute('aria-label') || b.textContent || '').replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim())
  return { inline: names('.topnav > .nav-group button'), menu: names('#nav-more-menu button') }
}
"""

REGIONS = {
    "header": "header.top",
    "breadcrumbs": ".scale-breadcrumbs-bar",
    "browser": "aside.panel.left",
    "inspector": "aside.panel.right",
    "timebar": ".timebar",
    "dock": ".dock",
    "status": ".status",
}

MEASURE_JS = r"""
(regions) => {
  const W = window.innerWidth, H = window.innerHeight
  const vis = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom } }
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)

  // nearest ancestor that clips horizontally (overflow hidden/auto/scroll)
  const clipper = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox !== 'visible') return p
    }
    return null
  }

  const controls = []
  const header = document.querySelector(regions.header)
  if (header) {
    for (const el of header.querySelectorAll('button, input, a[href], select, [role=button]')) {
      if (!vis(el)) continue
      const r = rect(el)
      const issues = []
      if (r.x < -0.5 || r.r > W + 0.5 || r.y < -0.5 || r.b > H + 0.5) issues.push('outside-viewport')
      const c = clipper(el)
      if (c) {
        const cr = c.getBoundingClientRect()
        if (r.x < cr.left - 0.5 || r.r > cr.right + 0.5) issues.push(c.scrollWidth > c.clientWidth ? 'needs-scroll' : 'clipped-by-ancestor')
      }
      if (!issues.length) {
        const cx = Math.min(W - 1, Math.max(0, r.x + r.w / 2)), cy = Math.min(H - 1, Math.max(0, r.y + r.h / 2))
        const hit = document.elementFromPoint(cx, cy)
        if (hit && hit !== el && !el.contains(hit)) {
          issues.push('covered-by:' + (hit.className && typeof hit.className === 'string' ? hit.className.split(' ')[0] : hit.tagName))
        }
      }
      controls.push({ label: label(el), rect: r, issues })
    }
  }

  const present = {}
  for (const [k, sel] of Object.entries(regions)) {
    const el = document.querySelector(sel)
    if (el && vis(el)) present[k] = rect(el)
  }
  const overlaps = []
  const keys = Object.keys(present)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = present[keys[i]], b = present[keys[j]]
    const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x), oy = Math.min(a.b, b.b) - Math.max(a.y, b.y)
    if (ox > 1 && oy > 1) overlaps.push({ a: keys[i], b: keys[j], px: Math.round(ox) + 'x' + Math.round(oy) })
  }

  return {
    viewport: { W, H },
    pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    headerOverflowX: header ? header.scrollWidth > header.clientWidth + 1 : null,
    controls,
    regions: present,
    overlaps,
  }
}
"""


async def audit(base: str, out: Path, states: list[str]) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    report: dict = {"base": base, "results": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"])
        for (w, h) in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            # suppress the first-visit Academy modal so the layout under test is the normal explorer
            await ctx.add_init_script("try{localStorage.setItem('cosmic_academy_dismissed','1')}catch(e){}")
            page = await ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.goto(base, wait_until="domcontentloaded")
            await page.wait_for_function("() => !!window.__store", timeout=30000)
            await page.evaluate("() => window.__store.getState().setPhase('explore')")
            await page.wait_for_timeout(800)
            for state in states:
                if state == "inspector":
                    await page.evaluate("() => { const s = window.__store.getState(); s.travel('earth', true); s.set({ rightOpen: true, leftOpen: true }) }")
                    await page.wait_for_timeout(1200)
                m = await page.evaluate(MEASURE_JS, REGIONS)
                m["state"] = state
                # every navigation action must be reachable: inline, or in the "More" menu opened with a real click
                reach = await page.evaluate(REACH_JS, REQUIRED_NAV)
                more = page.locator(".nav-more-btn")
                menu_ok = True
                if await more.count() and await more.is_visible():
                    await more.click()
                    await page.wait_for_timeout(250)
                    reach = {**reach, "menu": (await page.evaluate(REACH_JS, REQUIRED_NAV))["menu"]}
                    await page.keyboard.press("Escape")
                    await page.wait_for_timeout(150)
                    menu_ok = await page.locator("#nav-more-menu").count() == 0
                found = set(reach["inline"]) | set(reach["menu"])
                missing = [n for n in REQUIRED_NAV if not any(n.lower() == f.lower() for f in found)]
                m["navUnreachable"] = missing
                m["menuClosesOnEscape"] = menu_ok
                # the search dropdown must not be covered (it used to sit under the breadcrumb bar)
                inp = page.locator(".search input").first
                search_ok = None
                if await inp.count() and await inp.is_visible():
                    await inp.click()
                    await inp.fill("mar")
                    await page.wait_for_timeout(400)
                    search_ok = await page.evaluate("""() => { const r = document.querySelector('.results button, .results li, .results [role=option]');
                        if (!r) return false; const b = r.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
                        return !!h && (h === r || r.contains(h)) }""")
                    await inp.fill("")
                    await page.keyboard.press("Escape")
                    await page.mouse.click(5, h - 5)
                m["searchResultsVisible"] = search_ok
                m["pageErrors"] = errors[:5]
                shot = out / f"{w}x{h}_{state}.png"
                await page.screenshot(path=str(shot))
                m["screenshot"] = shot.name
                report["results"].append(m)
                bad = [c for c in m["controls"] if c["issues"]]
                print(f"{w}x{h} {state:9s} pageOverflowX={m['pageOverflowX']!s:5s} headerOverflowX={m['headerOverflowX']!s:5s} "
                      f"controls={len(m['controls']):2d} bad={len(bad):2d} overlaps={[o['a'] + '/' + o['b'] for o in m['overlaps']]} "
                      f"navUnreachable={m['navUnreachable']} menuEsc={m['menuClosesOnEscape']} search={m['searchResultsVisible']}")
                for c in bad:
                    print(f"      - {c['label']!r}: {', '.join(c['issues'])} (x={c['rect']['x']:.0f}..{c['rect']['r']:.0f})")
            await ctx.close()
        await browser.close()
    (out / "layout_report.json").write_text(json.dumps(report, indent=1))
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="docs/ui-audit/latest")
    ap.add_argument("--states", default="explore,inspector")
    ap.add_argument("--no-fail", action="store_true")
    a = ap.parse_args()
    rep = asyncio.run(audit(a.base, Path(a.out), a.states.split(",")))
    failed = any(r["pageOverflowX"] or any(c["issues"] for c in r["controls"]) or r["overlaps"] or r.get("navUnreachable")
                 or r.get("menuClosesOnEscape") is False or r.get("searchResultsVisible") is False for r in rep["results"])
    print("RESULT:", "FAIL" if failed else "PASS")
    return 1 if (failed and not a.no_fail) else 0


if __name__ == "__main__":
    sys.exit(main())
