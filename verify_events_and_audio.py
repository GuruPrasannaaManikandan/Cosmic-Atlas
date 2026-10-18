import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()

        print("1. Loading http://localhost:5173...")
        await page.goto("http://localhost:5173", wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_selector(".loader.gone", timeout=25000)
        await asyncio.sleep(1.5)

        # Handle Welcome Modal if shown
        welcome_explore = page.locator("button:has-text('EXPLORE ON MY OWN')")
        if await welcome_explore.is_visible():
            print("Dismissing Welcome Modal to enter Explore Mode...")
            await welcome_explore.click()
            await asyncio.sleep(1.0)

        # Click EXPLORE FREELY if on intro screen
        print("2. Entering Explore Mode...")
        explore_btn = page.locator("button:has-text('EXPLORE FREELY')")
        if await explore_btn.is_visible():
            await explore_btn.click()
            await asyncio.sleep(1.0)

        # 1. Search Betelgeuse and navigate
        print("3. Searching Betelgeuse...")
        search_input = page.locator(".search input")
        await search_input.fill("Betelgeuse")
        await asyncio.sleep(0.5)
        
        # Click search result
        result_item = page.locator(".results button:has-text('Betelgeuse')").first
        if await result_item.is_visible():
            await result_item.click()
            print("Flying to Betelgeuse...")
            await asyncio.sleep(3.5) # Wait for camera interpolation
        
        await page.screenshot(path="betelgeuse_verified_view.png")
        print("Saved betelgeuse_verified_view.png")

        # 2. Test Audio Player Popover
        print("4. Testing Cosmic Audio Engine...")
        audio_btn = page.locator(".audio-mini-btn")
        if await audio_btn.is_visible():
            await audio_btn.click()
            await asyncio.sleep(0.5)
            await page.screenshot(path="audio_popover_verified.png")
            print("Saved audio_popover_verified.png")
            # Close popover
            await audio_btn.click()
            await asyncio.sleep(0.3)

        # 3. Test Cosmic Events Observatory Modal
        print("5. Opening Cosmic Events Observatory...")
        events_btn = page.locator("button:has-text('Cosmic Events')")
        await events_btn.click()
        await asyncio.sleep(0.5)
        await page.screenshot(path="cosmic_events_modal_verified.png")
        print("Saved cosmic_events_modal_verified.png")

        # 4. Launch Betelgeuse Supernova Simulation
        print("6. Launching Betelgeuse Supernova Simulation...")
        launch_sn_btn = page.locator(".event-card:has-text('Betelgeuse') button:has-text('Launch Simulation')")
        await launch_sn_btn.click()
        await asyncio.sleep(1.0)
        await page.screenshot(path="supernova_stage1_verified.png")
        print("Saved supernova_stage1_verified.png")

        # Jump to Stage 2: Core Collapse & Shock Breakout
        print("7. Testing Supernova Stage 2...")
        stage2_tab = page.locator(".event-stage-tab:has-text('Core Collapse')")
        if await stage2_tab.is_visible():
            await stage2_tab.click()
            await asyncio.sleep(0.8)
            await page.screenshot(path="supernova_stage2_breakout_verified.png")
            print("Saved supernova_stage2_breakout_verified.png")

        # Jump to Stage 3: Explosive Ejecta Fireball
        print("8. Testing Supernova Stage 3...")
        stage3_tab = page.locator(".event-stage-tab:has-text('Explosive Ejecta')")
        if await stage3_tab.is_visible():
            await stage3_tab.click()
            await asyncio.sleep(0.8)
            await page.screenshot(path="supernova_stage3_fireball_verified.png")
            print("Saved supernova_stage3_fireball_verified.png")

        # Jump to Stage 4: Remnant & Pulsar
        print("9. Testing Supernova Stage 4...")
        stage4_tab = page.locator(".event-stage-tab:has-text('Remnant')")
        if await stage4_tab.is_visible():
            await stage4_tab.click()
            await asyncio.sleep(0.8)
            await page.screenshot(path="supernova_stage4_pulsar_verified.png")
            print("Saved supernova_stage4_pulsar_verified.png")

        # Exit Supernova
        print("10. Exiting Supernova and launching Crab Pulsar...")
        exit_btn = page.locator("button:has-text('Exit Simulation')")
        await exit_btn.click()
        await asyncio.sleep(0.5)

        # Open Cosmic Events modal and launch Crab Pulsar
        await events_btn.click()
        await asyncio.sleep(0.5)
        launch_pulsar_btn = page.locator(".event-card:has-text('Crab Pulsar') button:has-text('Launch Simulation')")
        await launch_pulsar_btn.click()
        await asyncio.sleep(1.5)
        await page.screenshot(path="crab_pulsar_verified.png")
        print("Saved crab_pulsar_verified.png")

        # Exit Pulsar and launch M87* Black Hole
        print("11. Exiting Pulsar and launching M87* Black Hole...")
        await exit_btn.click()
        await asyncio.sleep(0.5)

        await events_btn.click()
        await asyncio.sleep(0.5)
        launch_bh_btn = page.locator(".event-card:has-text('Black Hole') button:has-text('Launch Simulation')")
        await launch_bh_btn.click()
        await asyncio.sleep(1.5)
        await page.screenshot(path="black_hole_m87_verified.png")
        print("Saved black_hole_m87_verified.png")

        # Exit back to Explore Mode
        print("12. Exiting back to Explore Mode...")
        await exit_btn.click()
        await asyncio.sleep(1.0)
        await page.screenshot(path="explore_mode_restored_verified.png")
        print("Saved explore_mode_restored_verified.png")

        print("All verification steps completed successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
