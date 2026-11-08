from playwright.sync_api import sync_playwright
import os
import shutil
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
ARTIFACT_DIR = r"C:\Users\srikr\.gemini\antigravity\brain\478f369b-84c7-407a-9525-bbd0343195ed"

# List of targets: (filename, target_id, custom_view_dist_factor, is_solar_overview)
TARGETS = [
    ("earth_distant.png", "earth", 4.5, False),
    ("earth_closeup.png", "earth", 1.0, False),
    ("saturn_distant.png", "saturn", 3.8, False),
    ("saturn_closeup.png", "saturn", 1.0, False),
    ("jupiter_closeup.png", "jupiter", 1.0, False),
    ("mars_closeup.png", "mars", 1.0, False),
    ("moon_closeup.png", "moon", 1.0, False),
    ("solar_system_overview.png", "sun", 1.0, True),
]

def run():
    print("=== CAPTURING AUTHORITATIVE REALISM VISUAL TARGETS ===")
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
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        page.goto("http://localhost:5173/", wait_until="networkidle")
        page.wait_for_selector(".app", timeout=15000)

        # Skip welcome if visible
        try:
            btn = page.locator(".welcome-btn-skip")
            if btn.is_visible(timeout=1000):
                btn.click()
                page.wait_for_timeout(500)
        except Exception:
            pass

        # Enter explore mode
        try:
            explore_btn = page.locator("button:has-text('EXPLORE FREELY')")
            if explore_btn.is_visible(timeout=1000):
                explore_btn.click()
                page.wait_for_timeout(1000)
        except Exception:
            pass

        # Open telemetry right drawer, close left drawer & search modals
        page.evaluate("""() => {
            window.__store.setState({ rightOpen: true, leftOpen: false, navMapOpen: false });
        }""")
        page.wait_for_timeout(500)

        for filename, target_id, factor, is_solar_overview in TARGETS:
            print(f"Positioning and capturing {filename} for {target_id}...")

            if is_solar_overview:
                page.evaluate("""() => {
                    const st = window.__store.getState();
                    st.travel('sun', true);
                    st.select('sun');
                }""")
            else:
                if factor != 1.0:
                    page.evaluate(f"""() => {{
                        const st = window.__store.getState();
                        const o = window.__catalog ? window.__catalog.find(x => x.id === '{target_id}') : null;
                        const baseDist = '{target_id}' === 'earth' ? 2.356e-9 : 3.7e-8;
                        st.travel('{target_id}', true, baseDist * {factor});
                        st.select('{target_id}');
                    }}""")
                else:
                    page.evaluate(f"""() => {{
                        const st = window.__store.getState();
                        st.travel('{target_id}', true);
                        st.select('{target_id}');
                    }}""")

            page.wait_for_timeout(1200)

            local_path = os.path.join(ROOT, filename)
            page.screenshot(path=local_path)

            if os.path.exists(ARTIFACT_DIR):
                art_path = os.path.join(ARTIFACT_DIR, filename)
                shutil.copy2(local_path, art_path)
                print(f"  -> Saved {filename} to local and artifact directory ({os.path.getsize(local_path):,} bytes)")
            else:
                print(f"  -> Saved {filename} ({os.path.getsize(local_path):,} bytes)")

        browser.close()
    print("ALL 8 TARGET REALISM SCREENSHOTS GENERATED AND SAVED SUCCESSFULLY!")

if __name__ == '__main__':
    run()
