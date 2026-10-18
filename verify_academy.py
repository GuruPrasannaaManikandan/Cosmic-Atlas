import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()

        print("1. Loading http://localhost:5173 as a first-time visitor...")
        await page.goto("http://localhost:5173")
        await page.wait_for_selector(".loader.gone", timeout=15000)
        # Clear storage once to simulate true first-time visitor
        await page.evaluate("localStorage.clear()")
        await page.reload()
        await page.wait_for_selector(".loader.gone", timeout=15000)
        await asyncio.sleep(1.5)

        # Step 1: Check Welcome Modal
        print("2. Verifying Welcome Modal (Cosmic Academy - Cadet Induction)...")
        welcome = page.locator(".academy-modal-content")
        await welcome.wait_for(state="visible", timeout=5000)
        
        badge_text = await page.locator(".academy-badge").text_content()
        print(f"Badge: {badge_text}")
        assert "CADET INDUCTION" in badge_text
        
        await page.screenshot(path="academy_1_welcome_modal.png")
        print("Saved academy_1_welcome_modal.png")

        # Step 2: Click BEGIN FIRST MISSION
        print("3. Starting Mission 1: TAKE COMMAND...")
        begin_btn = page.locator("button:has-text('BEGIN FIRST MISSION')")
        await begin_btn.click()
        await asyncio.sleep(1.0)

        # Check tutorial card is visible
        hud_card = page.locator(".tutorial-card")
        await hud_card.wait_for(state="visible", timeout=3000)
        m1_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m1_title}")
        assert "TAKE COMMAND" in m1_title

        # Interact with canvas to complete attitude calibration
        canvas = page.locator("canvas")
        box = await canvas.bounding_box()
        if box:
            await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await page.mouse.down()
            await page.mouse.move(box["x"] + box["width"] / 2 + 100, box["y"] + box["height"] / 2 + 50)
            await page.mouse.up()
            await asyncio.sleep(0.5)

        # Verify task completed
        complete_badge = page.locator(".tutorial-success-banner")
        await complete_badge.wait_for(state="visible", timeout=3000)
        print("Mission 1 completed!")
        await page.screenshot(path="academy_2_mission1_canvas.png")
        print("Saved academy_2_mission1_canvas.png")

        # Step 3: Advance to Mission 2
        print("4. Advancing to Mission 2: FIND YOUR FIRST WORLD...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m2_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m2_title}")
        assert "FIND YOUR FIRST WORLD" in m2_title

        # Search Earth
        search_input = page.locator(".search input")
        await search_input.fill("Earth")
        await asyncio.sleep(0.5)
        earth_result = page.locator(".results button:has-text('Earth')").first
        if await earth_result.is_visible():
            await earth_result.click()
            print("Selected Earth...")
            await asyncio.sleep(2.0)

        await page.screenshot(path="academy_3_mission2_earth.png")
        print("Saved academy_3_mission2_earth.png")

        # Step 4: Advance to Mission 3
        print("5. Advancing to Mission 3: INVESTIGATE A STAR...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m3_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m3_title}")
        assert "INVESTIGATE A STAR" in m3_title

        # Click assist or navigate to Betelgeuse
        assist_btn = page.locator(".tutorial-btn.assist")
        if await assist_btn.is_visible():
            await assist_btn.click()
            print("Used Assist to navigate to Betelgeuse...")
            await asyncio.sleep(3.0)

        await page.screenshot(path="academy_4_mission3_betelgeuse.png")
        print("Saved academy_4_mission3_betelgeuse.png")

        # Step 5: Advance to Mission 4
        print("6. Advancing to Mission 4: TRAVEL THROUGH COSMIC SCALES...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m4_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m4_title}")
        assert "TRAVEL THROUGH COSMIC SCALES" in m4_title

        # Click Solar System
        solar_btn = page.locator(".topnav button:has-text('Solar System')")
        if await solar_btn.is_visible():
            await solar_btn.click()
            print("Jumped to Solar System...")
            await asyncio.sleep(2.5)

        await page.screenshot(path="academy_5_mission4_scales.png")
        print("Saved academy_5_mission4_scales.png")

        # Step 6: Advance to Mission 5
        print("7. Advancing to Mission 5: BEGIN THE FIND HOME JOURNEY...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m5_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m5_title}")
        assert "FIND HOME JOURNEY" in m5_title

        # Click FIND HOME
        find_btn = page.locator("button:has-text('FIND HOME')").first
        await find_btn.click()
        await asyncio.sleep(1.5)

        await page.screenshot(path="academy_6_mission5_find_home.png")
        print("Saved academy_6_mission5_find_home.png")

        # Step 7: Advance to Mission 6
        print("8. Advancing to Mission 6: UNLOCK THE DATA LAB...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m6_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m6_title}")
        assert "UNLOCK THE DATA LAB" in m6_title

        data_btn = page.locator("button:has-text('Data Intelligence')")
        await data_btn.click()
        await asyncio.sleep(1.2)

        # Close data lab to keep view clear
        close_data = page.locator(".data-panel-close")
        if await close_data.is_visible():
            await close_data.click()
            await asyncio.sleep(0.5)

        await page.screenshot(path="academy_7_mission6_data_lab.png")
        print("Saved academy_7_mission6_data_lab.png")

        # Step 8: Advance to Mission 7
        print("9. Advancing to Mission 7: DISCOVER THE COSMIC EVENTS LAB...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m7_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m7_title}")
        assert "COSMIC EVENTS LAB" in m7_title

        events_btn = page.locator("button:has-text('Cosmic Events')")
        await events_btn.click()
        await asyncio.sleep(0.8)

        # Launch Supernova
        sn_launch = page.locator(".event-card:has-text('Betelgeuse') button:has-text('Launch Simulation')")
        if await sn_launch.is_visible():
            await sn_launch.click()
            print("Launched Betelgeuse Supernova simulation...")
            await asyncio.sleep(1.5)

        # Exit Event
        exit_event = page.locator(".event-exit-btn")
        if await exit_event.is_visible():
            await exit_event.click()
            await asyncio.sleep(0.5)

        await page.screenshot(path="academy_8_mission7_events.png")
        print("Saved academy_8_mission7_events.png")

        # Step 9: Advance to Mission 8 & Graduate
        print("10. Advancing to Mission 8: YOUR MISSION, YOUR WAY...")
        next_btn = page.locator(".tutorial-btn.primary")
        await next_btn.click()
        await asyncio.sleep(0.8)

        m8_title = await page.locator(".tutorial-mission-title").text_content()
        print(f"Current Mission: {m8_title}")
        assert "YOUR MISSION, YOUR WAY" in m8_title

        # Click Finish / Graduate
        finish_btn = page.locator(".tutorial-btn.primary")
        await finish_btn.click()
        await asyncio.sleep(1.0)

        # Verify Academy Complete Modal
        complete_modal = page.locator(".academy-modal-content:has-text('MISSION COMPLETE')")
        await complete_modal.wait_for(state="visible", timeout=3000)
        print("Graduation modal visible!")

        await page.screenshot(path="academy_9_graduation_modal.png")
        print("Saved academy_9_graduation_modal.png")

        # Step 10: Click ENTER THE UNIVERSE
        print("11. Clicking ENTER THE UNIVERSE...")
        enter_btn = page.locator("button:has-text('ENTER THE UNIVERSE')")
        await enter_btn.click()
        await asyncio.sleep(1.0)

        # Verify returning user is not interrupted on page reload
        print("12. Reloading page to verify returning user persistence...")
        # Add script that leaves the completed flag intact
        await context.add_init_script("/* don't clear */")
        await page.reload()
        await page.wait_for_selector(".loader.gone", timeout=15000)
        await asyncio.sleep(1.5)

        # Welcome modal should NOT be visible
        assert not await page.locator(".academy-modal-content").is_visible()
        print("Verified: Welcome modal did not interrupt returning user.")

        # Test Relaunch from topbar Academy button
        print("13. Relaunching tutorial from topbar Academy button...")
        academy_top_btn = page.locator(".topnav button:has-text('Academy')")
        await academy_top_btn.click()
        await asyncio.sleep(0.8)

        await hud_card.wait_for(state="visible", timeout=3000)
        print("Verified: Tutorial relaunched on demand!")

        await page.screenshot(path="academy_10_relaunch_verified.png")
        print("Saved academy_10_relaunch_verified.png")

        await browser.close()
        print("ALL E2E ACADEMY VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run())
