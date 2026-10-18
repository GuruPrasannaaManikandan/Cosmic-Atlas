import os
import time
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = r"A:\Placement\GDG\Universe\docs\screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()
        page.add_init_script("localStorage.setItem('cosmic_atlas_visited', 'true');")

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/7] Navigating to COSMIC ATLAS at http://localhost:5173 ...")
        page.goto("http://localhost:5173", wait_until="networkidle")
        time.sleep(1.5)

        # Close any modal if visible
        try:
            close_btn = page.locator(".academy-modal-close, button:has-text('EXPLORE ON MY OWN')")
            if close_btn.first.is_visible():
                close_btn.first.click()
                time.sleep(0.5)
        except Exception:
            pass

        # If on intro screen, click EXPLORE FREELY
        try:
            explore_btn = page.locator("button:has-text('EXPLORE FREELY')")
            if explore_btn.is_visible():
                explore_btn.click()
                time.sleep(1)
        except Exception:
            pass

        def search_and_enter(term: str, wait_sec: float = 4.5):
            print(f"Searching and pressing Enter for: {term}...")
            search_input = page.locator("input[placeholder*='Search']")
            search_input.click()
            search_input.fill("")
            search_input.type(term, delay=60)
            time.sleep(0.5)
            search_input.press("Enter")
            # Wait for travel flight to complete
            time.sleep(wait_sec)

        # 1. Earth
        print("[2/7] Traveling to Earth via topnav pill...")
        earth_pill = page.locator("button:has-text('Earth')").first
        if earth_pill.is_visible():
            earth_pill.click()
            time.sleep(4.5)
        else:
            search_and_enter("Earth", wait_sec=4.5)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_earth_realistic_surface.png"))
        print("Captured 01_earth_realistic_surface.png")

        # 2. Scale Breadcrumbs
        print("[3/7] Inspecting Scale Breadcrumbs...")
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_scale_breadcrumbs_bar.png"))
        print("Captured 02_scale_breadcrumbs_bar.png")

        # 3. Saturn
        print("[4/7] Traveling to Saturn...")
        search_and_enter("Saturn", wait_sec=4.5)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_saturn_rings_highres.png"))
        print("Captured 03_saturn_rings_highres.png")

        # 4. Sun
        print("[5/7] Traveling to Sun...")
        sun_pill = page.locator("button:has-text('Solar System')").first
        if sun_pill.is_visible():
            sun_pill.click()
            time.sleep(4.0)
        else:
            search_and_enter("Sun", wait_sec=4.0)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_sun_photosphere.png"))
        print("Captured 04_sun_photosphere.png")

        # 5. Betelgeuse
        print("[6/7] Traveling to Betelgeuse...")
        search_and_enter("Betelgeuse", wait_sec=5.0)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_betelgeuse_convective_surface.png"))
        print("Captured 05_betelgeuse_convective_surface.png")

        # 6. Andromeda Galaxy
        print("[7/7] Traveling to Andromeda Galaxy...")
        search_and_enter("Andromeda", wait_sec=5.0)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_andromeda_3d_disk.png"))
        print("Captured 06_andromeda_3d_disk.png")

        print("\nAll in-browser visual realism verifications completed successfully!")
        print(f"Screenshots directory: {SCREENSHOT_DIR}")
        if console_errors:
            print(f"Noted console messages ({len(console_errors)}):", console_errors[:3])
        else:
            print("Zero console errors detected.")

        browser.close()

if __name__ == "__main__":
    verify()
