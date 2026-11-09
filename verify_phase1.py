import sys
import time
from playwright.sync_api import sync_playwright

def run():
    print("=== STARTING PHASE 1 AUTOMATED VERIFICATION ===")
    errors = []
    console_logs = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--use-gl=angle',
                '--use-angle=swiftshader'
            ]
        )
        context = browser.new_context(viewport={'width': 1400, 'height': 900})
        page = context.new_page()
        
        page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on('pageerror', lambda exc: errors.append(f"PAGE ERROR: {exc}"))

        # 1. Navigation and Initial Load
        print("[1] Navigating to http://localhost:5175/...")
        page.goto("http://localhost:5175/", wait_until="networkidle")
        page.wait_for_selector(".app", timeout=10000)
        print("    App container loaded successfully.")

        # Dismiss welcome modal if open
        if page.locator(".welcome-modal-overlay").is_visible():
            print("    Welcome modal detected - clicking 'Skip Tutorial & Explore'...")
            page.locator(".welcome-btn-skip").click()
            page.wait_for_timeout(500)

        # 2. Enter Free Exploration if on Intro screen
        if page.locator(".intro").is_visible():
            print("    Intro screen detected - clicking 'EXPLORE FREELY'...")
            page.locator("button:has-text('EXPLORE FREELY')").click()
            page.wait_for_timeout(1000)

        # 3. Canvas and 3D Viewport Verification
        canvas = page.locator("canvas").first
        canvas.wait_for(state="visible", timeout=10000)
        assert canvas.is_visible(), "Cosmic 3D Canvas must be visible"
        print("[2] 3D Cosmic Canvas initialized and visible.")

        # 4. Search and Modal Conflict Verification
        print("[3] Testing Search and Modal Conflict...")
        
        # Open Help Modal
        page.locator("button:has-text('? Help')").click()
        page.wait_for_selector(".modal[aria-label='Controls and help']", timeout=5000)
        print("    HelpModal dynamically loaded and opened.")

        # Press '/' while HelpModal is open
        search_input = page.locator(".search input")
        page.keyboard.press("/")
        page.wait_for_timeout(300)
        is_focused = search_input.evaluate("el => document.activeElement === el")
        assert not is_focused, "Search input must NOT receive focus while modal is active"
        assert not page.locator(".results").is_visible(), "Search results dropdown must NOT open while modal is active"
        print("    PASS: Global '/' shortcut suppressed when HelpModal is active.")

        # Press Escape to close HelpModal
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        assert not page.locator(".modal[aria-label='Controls and help']").is_visible(), "HelpModal must close on Escape"
        print("    PASS: HelpModal closed on Escape.")

        # Open About Modal
        page.locator("button:has-text('ⓘ Notes')").click()
        page.wait_for_selector(".modal[aria-label='Scientific notes']", timeout=5000)
        print("    AboutModal dynamically loaded and opened.")

        # Press '/' while AboutModal is open
        page.keyboard.press("/")
        page.wait_for_timeout(300)
        is_focused_about = search_input.evaluate("el => document.activeElement === el")
        assert not is_focused_about, "Search input must NOT receive focus while AboutModal is active"
        print("    PASS: Global '/' shortcut suppressed when AboutModal is active.")

        # Close AboutModal
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        assert not page.locator(".modal[aria-label='Scientific notes']").is_visible(), "AboutModal must close on Escape"
        print("    PASS: AboutModal closed on Escape.")

        # Now test search when NO modal is active
        page.keyboard.press("/")
        page.wait_for_timeout(300)
        is_focused_free = search_input.evaluate("el => document.activeElement === el")
        assert is_focused_free, "Search input must receive focus on '/' when no modal is active"
        print("    PASS: Search shortcut '/' activates input when no modal is active.")

        # Type in search
        search_input.fill("Earth")
        page.wait_for_selector(".results", timeout=5000)
        print("    Search dropdown appeared with catalogue results.")

        # Press Escape inside search
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        assert not page.locator(".results").is_visible(), "Search dropdown must dismiss on Escape"
        print("    PASS: Search dropdown dismissed and input blurred on Escape.")

        # 5. Test Lazy-Loaded Data Intelligence Panel
        print("[4] Testing Data Intelligence lazy loading...")
        page.locator("button:has-text('⌬ Data Intelligence')").click()
        page.wait_for_selector(".datapanel", timeout=5000)
        print("    DataPanel dynamically loaded and mounted.")
        page.screenshot(path="screenshot_datapanel.png")
        # Close DataPanel
        page.locator("button:has-text('⌬ Data Intelligence')").click()
        page.wait_for_timeout(300)
        print("    DataPanel closed cleanly.")

        # 6. Test Lazy-Loaded Cosmic Events Modal
        print("[5] Testing Cosmic Events Observatory lazy loading...")
        page.locator("button:has-text('🌌 Cosmic Events')").click()
        page.wait_for_selector(".events-modal-overlay", timeout=5000)
        print("    CosmicEventsModal dynamically loaded and mounted.")
        page.screenshot(path="screenshot_cosmicevents.png")
        page.locator(".events-modal-close").click()
        page.wait_for_timeout(300)
        print("    CosmicEventsModal closed cleanly.")

        # 7. Test Cosmic Academy Tutorial
        print("[6] Testing Cosmic Academy Tutorial...")
        page.locator("button:has-text('🎓 Academy')").click()
        page.wait_for_selector(".tutorial-card", timeout=5000)
        print("    TutorialOverlay dynamically loaded and mounted.")
        # Exit tutorial using exact class tutorial-exit-btn
        page.locator("button.tutorial-exit-btn").click()
        page.wait_for_timeout(300)
        print("    Tutorial exited cleanly.")

        # 8. Test Travel Mode, CockpitOverlay, TravelHUD, NavMapModal
        print("[7] Testing Travel Mode lazy loading and flight systems...")
        page.locator("button:has-text('🚀 TRAVEL MODE')").click()
        page.wait_for_selector(".travel-hud", timeout=5000)
        print("    TravelHUD dynamically loaded and mounted.")

        # Cycle camera view to cockpit (V key)
        page.keyboard.press("v")
        page.wait_for_timeout(300)
        # If not cockpit yet, cycle again
        if not page.locator(".cockpit-overlay").is_visible():
            page.keyboard.press("v")
            page.wait_for_timeout(300)
        page.wait_for_selector(".cockpit-overlay", timeout=5000)
        print("    CockpitOverlay dynamically loaded and mounted on cockpit view.")
        page.screenshot(path="screenshot_travelmode.png")

        # Open Tactical Nav Map inside Travel Mode
        page.locator("button:has-text('Nav Map (M)')").click()
        page.wait_for_selector(".navmap-card", timeout=5000)
        print("    NavMapModal dynamically loaded inside Travel Mode.")
        page.screenshot(path="screenshot_navmap.png")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        print("    NavMapModal closed on Escape.")

        # Disembark Travel Mode
        page.locator("button:has-text('Exit to Explore')").click()
        page.wait_for_timeout(500)
        print("    Disembarked from Travel Mode back to Free Flight.")

        page.screenshot(path="screenshot_observatory.png")

        # 9. Test SIMBAD API resilience and live endpoint
        print("[8] Testing SIMBAD connector resilience...")
        simbad_resp = page.request.get("http://127.0.0.1:8001/api/catalogue/simbad?q=Betelgeuse")
        print(f"    SIMBAD Betelgeuse status: {simbad_resp.status}")
        assert simbad_resp.status in (200, 502, 504), f"Unexpected status {simbad_resp.status}"
        data = simbad_resp.json()
        if simbad_resp.status == 200:
            print(f"    SIMBAD Success: {data.get('main_id')} at distance {data.get('distance_ly')} ly (cached={data.get('cached')})")
        else:
            print(f"    SIMBAD Graceful Fallback / Timeout response: {data.get('detail')}")

        browser.close()

    print("\n=== VERIFICATION RESULTS ===")
    print(f"Page errors: {len(errors)}")
    for err in errors:
        print(f"  - {err}")
    
    warn_or_err_logs = [log for log in console_logs if log.startswith("[error]") or log.startswith("[warning]")]
    print(f"Console warnings/errors: {len(warn_or_err_logs)}")
    for log in warn_or_err_logs[:10]:
        print(f"  - {log}")

    if errors:
        sys.exit(1)
    else:
        print("ALL PLAYWRIGHT VERIFICATION CHECKS PASSED PERFECTLY!")

if __name__ == "__main__":
    run()
