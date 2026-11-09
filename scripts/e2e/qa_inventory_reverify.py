"""
Re-verify FEATURE_INVENTORY.csv rows marked NO-OBSERVABLE-EFFECT with an actionability-aware click (role + accessible
name, scrolled into view - as a user would), on a fresh page in the same state. Rows are updated in place with
VERIFIED-FUNCTIONAL (state changed) or CONFIRMED-NO-EFFECT, plus the observed diff.
Usage: python scripts/e2e/qa_inventory_reverify.py --csv docs/qa/2026-11-09/reports/FEATURE_INVENTORY.csv
"""
import argparse, asyncio, csv, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from qa_chrome_audit import SNAP, to_explore, new_page, ST  # noqa: E402
from playwright.async_api import async_playwright


async def main(path: Path, base: str) -> int:
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True)
        for r in rows:
            if r["result"] != "NO-OBSERVABLE-EFFECT":
                continue
            ctx, page = await new_page(b)
            await to_explore(page, base)
            if r["state"] == "inspector":
                await page.evaluate(f"() => {ST}.select('earth')")
                await page.wait_for_timeout(700)
            if r["state"] == "more-menu":
                await page.get_by_role("button", name="More").first.click()
            name = r["name"]
            loc = page.get_by_role("button", name=name, exact=True)
            if not await loc.count():
                loc = page.get_by_role("button", name=name.lstrip("✦✧➜⟳↑✈◯# "), exact=False)
            if r["name"] == "✈ Free flight":   # meaningful only while following/orbiting: start an orbit first
                await page.evaluate(f"() => {ST}.select('earth')")
                o = page.get_by_role("button", name="Orbit", exact=False)
                if await o.count():
                    await o.first.click()
                    await page.wait_for_timeout(500)
            before = await page.evaluate(SNAP)
            try:
                await loc.first.scroll_into_view_if_needed(timeout=4000)
                await loc.first.click(timeout=4000)
                await page.wait_for_timeout(1000)
                after = await page.evaluate(SNAP)
                diff = {k: (before.get(k), after.get(k)) for k in before if before.get(k) != after.get(k) and k != "__textLen"}
                r["result"] = "VERIFIED-FUNCTIONAL" if diff else "CONFIRMED-NO-EFFECT"
                r["detail"] = ("locator click: " + json.dumps(diff))[:300]
            except Exception as e:  # noqa: BLE001
                r["result"], r["detail"] = "NOT-CLICKABLE", str(e).splitlines()[0][:200]
            print(f"{r['state']:10s} {name[:34]:34s} -> {r['result']}  {r['detail'][:110]}")
            await ctx.close()
        await b.close()
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    s = {}
    for r in rows:
        s[r["result"]] = s.get(r["result"], 0) + 1
    print("summary:", s)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="docs/qa/2026-11-09/reports/FEATURE_INVENTORY.csv")
    ap.add_argument("--base", default="http://localhost:5174")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(Path(a.csv), a.base)))
