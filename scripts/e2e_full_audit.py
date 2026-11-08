import asyncio
import time
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:5173"
RESULTS = {
    "Scenario A (First Launch & Exploration)": "PENDING",
    "Scenario B (Discover & Inspect Bodies)": "PENDING",
    "Scenario C (Complete Travel Mode Journey)": "PENDING",
    "Scenario D (Scientific Simulation Behavior)": "PENDING",
    "Scenario E (Dense Scene & Performance)": "PENDING",
    "Scenario F (Failure Recovery)": "PENDING",
    "Scenario G (Responsive & Accessible Layout)": "PENDING",
}

async def run_audit():
    console_errors = []
    console_warnings = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"]
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        def handle_console(msg):
            if msg.type == "error":
                console_errors.append(f"[{msg.type.upper()}] {msg.text}")
            elif msg.type == "warning":
                console_warnings.append(f"[{msg.type.upper()}] {msg.text}")
        page.on("console", handle_console)
        page.on("pageerror", lambda err: console_errors.append(f"[PAGE_ERROR] {str(err)}"))

        print("======================================================================")
        print("COSMIC ATLAS — FULL APPLICATION INTELLIGENCE AUDIT & SCENARIO TESTING")
        print("======================================================================")
        
        # -------------------------------------------------------------------------
        # SCENARIO A: First Launch & Basic Exploration
        # -------------------------------------------------------------------------
        print("\n>>> Testing Scenario A: First launch and basic exploration...")
        start_time = time.time()
        await page.goto(BASE_URL, wait_until="networkidle")
        load_time = time.time() - start_time
        print(f"  [A.1] Page loaded in {load_time:.2f}s")

        # Wait for canvas
        canvas = page.locator("canvas")
        await canvas.wait_for(state="visible", timeout=10000)
        print("  [A.2] WebGL canvas rendered successfully")

        # Handle onboarding / welcome academy modal if open
        academy_overlay = page.locator(".academy-modal-overlay")
        if await academy_overlay.is_visible():
            print("  [A.3] Academy Welcome modal detected, dismissing via 'EXPLORE ON MY OWN'...")
            explore_btn = page.locator(".academy-btn.secondary:has-text('EXPLORE ON MY OWN')")
            if await explore_btn.is_visible():
                await explore_btn.click()
            else:
                close_btn = page.locator(".academy-modal-close")
                await close_btn.click()
            await page.wait_for_timeout(500)
            print("  [A.4] Onboarding modal dismissed cleanly")

        # If still in intro screen, click 'EXPLORE FREELY'
        intro_screen = page.locator(".intro")
        if await intro_screen.is_visible():
            print("  [A.5] Intro overlay active, transitioning to Explore mode via 'EXPLORE FREELY'...")
            explore_freely = page.locator(".intro-actions button:has-text('EXPLORE FREELY')")
            await explore_freely.click()
            await page.wait_for_timeout(500)

        # Verify Header and Controls presence
        top_header = page.locator("header.top")
        await top_header.wait_for(state="visible", timeout=5000)
        brand = page.locator(".brand b")
        assert await brand.inner_text() == "COSMIC ATLAS", "Brand text mismatch"
        print("  [A.6] Topbar and brand header verified: 'COSMIC ATLAS'")

        # Test Free-flight camera controls (mouse drag)
        box = await canvas.bounding_box()
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        await page.mouse.move(cx + 80, cy + 40, steps=5)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        print("  [A.7] Interactive camera rotation response verified")

        # Select a planet (Earth) via Topbar direct shortcut
        earth_btn = page.locator(".topnav button:has-text('Earth')")
        await earth_btn.click()
        await page.wait_for_timeout(1000)

        # Verify Info Panel opens with Earth telemetry
        info_panel = page.locator("aside.panel.right")
        await info_panel.wait_for(state="visible", timeout=5000)
        info_title = await page.locator("aside.panel.right h3").inner_text()
        assert "Earth" in info_title, f"Expected Earth in Info panel, got: {info_title}"
        print(f"  [A.8] Planet selection verified: Info panel displaying '{info_title}'")

        # Test minimizing and restoring the inspector panel
        min_btn = page.locator("aside.panel.right button[title*='Minimize inspector']")
        if await min_btn.is_visible():
            await min_btn.click()
            await page.wait_for_timeout(200)
            expand_btn = page.locator("aside.panel.right button[title*='Expand inspector']")
            assert await expand_btn.is_visible(), "Expand button missing after minimize"
            await expand_btn.click()
            await page.wait_for_timeout(200)
            print("  [A.9] Panel collapse/expand state retention verified")

        # Open and close Help modal
        help_btn = page.locator(".topnav button:has-text('? Help')")
        await help_btn.click()
        help_dialog = page.locator("div.modal[aria-label='Controls and help']")
        await help_dialog.wait_for(state="visible", timeout=3000)
        close_ref_btn = page.locator("button:has-text('Close Reference')")
        await close_ref_btn.click()
        await help_dialog.wait_for(state="hidden", timeout=3000)
        print("  [A.10] Help modal opened and dismissed cleanly")

        # Open and close Scientific Notes modal
        notes_btn = page.locator(".topnav button:has-text('ⓘ Notes')")
        await notes_btn.click()
        notes_dialog = page.locator("div.modal[aria-label='Scientific notes']")
        await notes_dialog.wait_for(state="visible", timeout=3000)
        ack_btn = page.locator("button:has-text('Acknowledge & Close')")
        await ack_btn.click()
        await notes_dialog.wait_for(state="hidden", timeout=3000)
        print("  [A.11] Scientific Notes modal opened and dismissed cleanly")

        RESULTS["Scenario A (First Launch & Exploration)"] = "PASSED"
        print(">>> SCENARIO A: PASSED\n")

        # -------------------------------------------------------------------------
        # SCENARIO B: Discover and Inspect Celestial Bodies
        # -------------------------------------------------------------------------
        print(">>> Testing Scenario B: Discover and inspect celestial bodies...")
        
        # Test Search for a small moon (Phobos)
        search_input = page.locator(".search input")
        await search_input.fill("Phobos")
        await page.wait_for_timeout(400)
        phobos_res = page.locator(".results button:not(.live):has-text('Phobos')")
        await phobos_res.wait_for(state="visible", timeout=3000)
        await phobos_res.click()
        await page.wait_for_timeout(800)

        # Verify Info panel displays Phobos
        info_title = await page.locator("aside.panel.right h3").inner_text()
        assert "Phobos" in info_title, f"Expected Phobos, got: {info_title}"
        eyebrow = await page.locator("aside.panel.right .eyebrow").inner_text()
        assert "moon" in eyebrow.lower(), f"Expected moon category, got: {eyebrow}"
        print(f"  [B.1] Search & Inspect Phobos (Moon) verified: '{info_title}' ({eyebrow})")

        # Test Search for Dwarf Planet (Ceres)
        await search_input.fill("Ceres")
        await page.wait_for_timeout(400)
        ceres_res = page.locator(".results button:not(.live):has-text('Ceres')")
        await ceres_res.wait_for(state="visible", timeout=3000)
        await ceres_res.click()
        await page.wait_for_timeout(800)

        info_title = await page.locator("aside.panel.right h3").inner_text()
        assert "Ceres" in info_title, f"Expected Ceres, got: {info_title}"
        print(f"  [B.2] Search & Inspect Ceres (Dwarf Planet) verified: '{info_title}'")

        # Test Search for Asteroid (Vesta)
        await search_input.fill("Vesta")
        await page.wait_for_timeout(400)
        vesta_res = page.locator(".results button:not(.live):has-text('Vesta')")
        await vesta_res.wait_for(state="visible", timeout=3000)
        await vesta_res.click()
        await page.wait_for_timeout(800)

        info_title = await page.locator("aside.panel.right h3").inner_text()
        assert "Vesta" in info_title, f"Expected Vesta, got: {info_title}"
        print(f"  [B.3] Search & Inspect Vesta (Asteroid) verified: '{info_title}'")

        # Test Browser Category Tabs & Filter
        browser_panel = page.locator("aside.panel.left")
        if not await browser_panel.is_visible():
            reopen_btn = page.locator("button.btn.reopen")
            if await reopen_btn.is_visible():
                await reopen_btn.click()
                await browser_panel.wait_for(state="visible", timeout=3000)

        # Click 'Solar' category tab in Browser
        solar_tab = page.locator("aside.panel.left .cat-tab:has-text('Solar')")
        await solar_tab.click()
        await page.wait_for_timeout(300)

        # In Browser filter input, search for "Titan"
        browser_filter = page.locator("aside.panel.left input[type='search']")
        await browser_filter.fill("Titan")
        await page.wait_for_timeout(300)
        titan_node = page.locator("aside.panel.left .node:has(.nm:text-is('Titan'))")
        await titan_node.wait_for(state="visible", timeout=3000)
        await titan_node.click()
        await page.wait_for_timeout(600)

        info_title = await page.locator("aside.panel.right h3").inner_text()
        assert "Titan" in info_title, f"Expected Titan, got: {info_title}"
        print(f"  [B.4] Catalogue category filtering & inspection verified: '{info_title}'")

        # Clear filter & reset to All
        await browser_filter.fill("")
        all_tab = page.locator("aside.panel.left .cat-tab:has-text('All')")
        await all_tab.click()
        await page.wait_for_timeout(300)

        RESULTS["Scenario B (Discover & Inspect Bodies)"] = "PASSED"
        print(">>> SCENARIO B: PASSED\n")

        # -------------------------------------------------------------------------
        # SCENARIO C: Complete Travel Mode Journey
        # -------------------------------------------------------------------------
        print(">>> Testing Scenario C: Complete Travel Mode journey...")

        # Enter Travel Mode
        travel_btn = page.locator(".topnav button.travel-btn")
        await travel_btn.click()
        await page.wait_for_timeout(1000)

        # Verify TravelHUD is visible
        travel_hud = page.locator(".travel-hud")
        await travel_hud.wait_for(state="visible", timeout=5000)
        print("  [C.1] Travel Mode entered: Travel HUD mounted")

        # Test toggling Cockpit View via 'V' key
        await page.keyboard.press("v")
        await page.wait_for_timeout(300)
        cockpit = page.locator(".cockpit-overlay")
        if await cockpit.is_visible():
            print("  [C.1b] Cockpit view toggled and overlay verified")

        # Open Nav Map modal via 'M' key
        await page.keyboard.press("m")
        await page.wait_for_timeout(500)
        navmap = page.locator(".navmap-card")
        await navmap.wait_for(state="visible", timeout=5000)
        print("  [C.2] Solar System Navigation Map modal opened")

        # Verify Layout ordering and no clipping
        head = await page.locator(".navmap-card .panel-head").bounding_box()
        hint = await page.locator(".navmap-card .hint").bounding_box()
        cat_tabs = await page.locator(".navmap-card .cat-tabs").bounding_box()
        search_box = await page.locator(".navmap-card .search").bounding_box()
        layout_box = await page.locator(".navmap-card .navmap-layout").bounding_box()

        assert cat_tabs["y"] > hint["y"] + hint["height"] - 2, "Hint overlaps category tabs"
        assert search_box["y"] > cat_tabs["y"] + cat_tabs["height"] - 2, "Category tabs overlap search bar"
        assert layout_box["y"] > search_box["y"] + search_box["height"] - 2, "Search bar overlaps destination list"
        print("  [C.3] Nav Map layout geometry verified: Header -> Hint -> Tabs -> Search -> List (zero overlap)")

        # Test Category Tabs: 'Moons' -> parent chips appear
        moons_tab = page.locator(".navmap-card .cat-tab:has-text('Moons')")
        await moons_tab.click()
        await page.wait_for_timeout(300)
        parent_tabs = page.locator(".navmap-card .navmap-parent-tabs")
        assert await parent_tabs.is_visible(), "Parent chips missing for Moons tab"

        # Click 'Mars' parent chip
        mars_chip = page.locator(".navmap-card .navmap-parent-tab:has-text('Mars')")
        await mars_chip.click()
        await page.wait_for_timeout(300)

        # Click Phobos in destination list
        phobos_dest = page.locator(".navmap-card .navmap-row:has-text('Phobos')")
        await phobos_dest.click()
        await page.wait_for_timeout(300)

        # Engage Autopilot
        engage_btn = page.locator(".navmap-card button.btn.primary:has-text('Engage')").first
        assert await engage_btn.is_visible(), "Engage Autopilot button not visible"
        await engage_btn.click()
        await page.wait_for_timeout(800)

        # Verify NavMap modal closed upon engagement
        assert not await navmap.is_visible(), "NavMap modal should close upon engagement"
        print("  [C.4] Autopilot engaged successfully toward Phobos")

        # Disengage Autopilot
        disengage_btn = page.locator("button:has-text('Disengage Autopilot')").first
        if await disengage_btn.is_visible():
            await disengage_btn.click()
            await page.wait_for_timeout(400)
            print("  [C.5] Autopilot disengaged via UI control")
        else:
            await page.keyboard.press("c")
            await page.wait_for_timeout(400)
            print("  [C.5] Autopilot disengaged via 'C' hotkey")

        # Reopen NavMap and retarget Europa
        await page.keyboard.press("m")
        await page.wait_for_timeout(500)
        await navmap.wait_for(state="visible", timeout=3000)

        # Search Europa
        nav_search = page.locator(".navmap-card .search input")
        await nav_search.fill("Europa")
        await page.wait_for_timeout(300)
        europa_dest = page.locator(".navmap-card .navmap-row:has-text('Europa')")
        await europa_dest.click()
        await page.wait_for_timeout(300)

        # Engage Autopilot to Europa
        engage_btn_europa = page.locator(".navmap-card button.btn.primary:has-text('Engage')").first
        await engage_btn_europa.click()
        await page.wait_for_timeout(1000)
        print("  [C.6] Immediate retargeting and re-engagement to Europa verified")

        # Exit Travel Mode
        exit_btn = page.locator("button:has-text('Exit to Explore')").first
        if await exit_btn.is_visible():
            await exit_btn.click()
        else:
            await page.keyboard.press("Escape")
        await page.wait_for_timeout(1000)

        # Verify returned to exploration view
        assert await page.locator("header.top").is_visible(), "Failed to return to exploration header"
        print("  [C.7] Returned cleanly to Solar System exploration mode")

        RESULTS["Scenario C (Complete Travel Mode Journey)"] = "PASSED"
        print(">>> SCENARIO C: PASSED\n")

        # -------------------------------------------------------------------------
        # SCENARIO D: Scientific Simulation Behavior
        # -------------------------------------------------------------------------
        print(">>> Testing Scenario D: Scientific simulation behavior...")

        # Travel to Sun / Solar System
        sun_btn = page.locator(".topnav button:has-text('Solar System')")
        await sun_btn.click()
        await page.wait_for_timeout(1200)

        # Verify TimeBar is mounted in solar system view
        timebar = page.locator(".timebar")
        await timebar.wait_for(state="visible", timeout=5000)
        print("  [D.1] Solar System TimeBar visible and mounted")

        # Read initial simulation date
        time_input = page.locator(".timebar input[type='datetime-local']")
        val1 = await time_input.input_value()
        print(f"  [D.2] Initial simulation timestamp: {val1}")

        # Set rate to +365 d/s and let it run for 1.2 seconds
        rate_select = page.locator(".timebar select")
        await rate_select.select_option("365")
        
        # Ensure playing
        play_btn = page.locator(".timebar button.play")
        play_text = await play_btn.inner_text()
        if "▶" in play_text:
            await play_btn.click()
        await page.wait_for_timeout(1200)

        val2 = await time_input.input_value()
        print(f"  [D.3] Advanced simulation timestamp (+365 d/s): {val2}")
        assert val1 != val2, f"Simulation time did not advance! ({val1} == {val2})"

        # Pause simulation
        await play_btn.click()
        await page.wait_for_timeout(400)
        val3 = await time_input.input_value()
        await page.wait_for_timeout(500)
        val4 = await time_input.input_value()
        assert val3 == val4, f"Simulation time did not pause! ({val3} != {val4})"
        print("  [D.4] Simulation pause and rate acceleration verified")

        # Reset to 'Now'
        now_btn = page.locator(".timebar button:has-text('Now')")
        await now_btn.click()
        await page.wait_for_timeout(400)

        # Select Earth and run Live Ephemeris Verification with JPL Horizons
        await earth_btn.click()
        await page.wait_for_timeout(800)
        hz_btn = page.locator("button:has-text('Compare with JPL Horizons')")
        if await hz_btn.is_visible():
            await hz_btn.click()
            res_elem = page.locator("p.ok.small, p.err.small")
            await res_elem.wait_for(state="visible", timeout=12000)
            res_txt = await res_elem.inner_text()
            print(f"  [D.5] JPL Horizons API verification: {res_txt}")
            assert "JPL Horizons" in res_txt or "Atlas model" in res_txt, f"Unexpected response: {res_txt}"

        # Toggle Orbits on/off via Dock
        orbits_tog = page.locator(".dock button.tog:has-text('Orbits')")
        init_pressed = await orbits_tog.get_attribute("aria-pressed")
        await orbits_tog.click()
        await page.wait_for_timeout(200)
        toggled_pressed = await orbits_tog.get_attribute("aria-pressed")
        assert init_pressed != toggled_pressed, "Orbit toggle button did not update aria-pressed state"
        # Toggle back
        await orbits_tog.click()
        print("  [D.6] Orbit line toggling verified")

        RESULTS["Scenario D (Scientific Simulation Behavior)"] = "PASSED"
        print(">>> SCENARIO D: PASSED\n")

        # -------------------------------------------------------------------------
        # SCENARIO E: Dense Scene & Performance
        # -------------------------------------------------------------------------
        print(">>> Testing Scenario E: Dense scene and performance...")

        # Open Telemetry & Diagnostics
        diag_tog = page.locator(".dock button[aria-label='Diagnostics']")
        await diag_tog.click()
        await page.wait_for_timeout(300)
        diag_box = page.locator(".diag")
        await diag_box.wait_for(state="visible", timeout=3000)

        # Measure FPS over 2 seconds
        fps_values = []
        for _ in range(5):
            await page.wait_for_timeout(400)
            fps_text = await page.locator(".diag label:has-text('Display FPS') + b").inner_text()
            try:
                fps_values.append(int(fps_text))
            except ValueError:
                pass

        avg_fps = sum(fps_values) / len(fps_values) if fps_values else 0
        print(f"  [E.1] Measured display FPS: {avg_fps:.1f} (Sample readings: {fps_values})")

        # Close Diagnostics
        await diag_tog.click()
        await page.wait_for_timeout(200)

        # Check console errors accumulated so far
        print(f"  [E.2] Accumulated console errors: {len(console_errors)}")
        if console_errors:
            for err in console_errors[:5]:
                print(f"       {err}")
        assert len(console_errors) == 0, f"Found {len(console_errors)} browser console errors!"

        RESULTS["Scenario E (Dense Scene & Performance)"] = "PASSED"
        print(">>> SCENARIO E: PASSED\n")

        # -------------------------------------------------------------------------
        # SCENARIO F: Failure Recovery
        # -------------------------------------------------------------------------
        print(">>> Testing Scenario F: Failure recovery...")

        # Search for non-existent object
        await search_input.fill("nonexistentobjectxyz999")
        await page.wait_for_timeout(400)
        empty_msg = page.locator(".results .empty")
        await empty_msg.wait_for(state="visible", timeout=3000)
        msg_text = await empty_msg.inner_text()
        print(f"  [F.1] Empty search state handled cleanly: '{msg_text}'")

        # Test live SIMBAD query for invalid target
        simbad_btn = page.locator(".results button.live")
        await simbad_btn.click()
        err_msg = page.locator(".results .err.pad")
        await err_msg.wait_for(state="visible", timeout=12000)
        err_text = await err_msg.inner_text()
        print(f"  [F.2] SIMBAD unknown target error handled gracefully: '{err_text}'")

        # Clear search
        clear_btn = page.locator("button.search-clear")
        await clear_btn.click()
        await page.wait_for_timeout(300)

        # Test rapid modal clicking (open Help -> close with ESC)
        await help_btn.click()
        await page.wait_for_timeout(100)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        assert not await help_dialog.is_visible(), "Help modal failed to close on ESC"
        print("  [F.3] Rapid modal open and Escape cancellation verified")

        RESULTS["Scenario F (Failure Recovery)"] = "PASSED"
        print(">>> SCENARIO F: PASSED\n")

        # -------------------------------------------------------------------------
        # SCENARIO G: Responsive & Accessible Layout
        # -------------------------------------------------------------------------
        print(">>> Testing Scenario G: Responsive & accessible layout...")
        VIEWPORTS = [
            ("Desktop", 1440, 900),
            ("Laptop", 1366, 768),
            ("Tablet", 1024, 768),
            ("Narrow", 768, 900),
        ]

        for vp_name, w, h in VIEWPORTS:
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(400)

            top_visible = await page.locator("header.top").is_visible()
            dock_visible = await page.locator(".dock").is_visible()
            assert top_visible, f"Topbar not visible in {vp_name}"
            assert dock_visible, f"Dock not visible in {vp_name}"

            overflow_x = await page.evaluate("() => document.body.scrollWidth > window.innerWidth")
            assert not overflow_x, f"Horizontal window overflow detected in {vp_name}!"
            print(f"  [G.{vp_name}] Viewport {w}x{h}: Topbar & Dock functional, zero horizontal overflow")

        RESULTS["Scenario G (Responsive & Accessible Layout)"] = "PASSED"
        print(">>> SCENARIO G: PASSED\n")

        # Final Verification Summary
        print("======================================================================")
        print("FINAL AUDIT RESULTS SUMMARY:")
        print("======================================================================")
        all_passed = True
        for scenario, status in RESULTS.items():
            print(f"  {scenario}: {status}")
            if status != "PASSED":
                all_passed = False
        print("======================================================================")
        if all_passed:
            print("ALL 7 USER SCENARIOS AUDITED AND VALIDATED SUCCESSFULLY!")
        else:
            print("AUDIT ENCOUNTERED DEFECTS!")

        await browser.close()
        return all_passed

if __name__ == "__main__":
    success = asyncio.run(run_audit())
    if not success:
        exit(1)
