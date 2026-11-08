import asyncio
from playwright.async_api import async_playwright

async def check_console():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(str(err)))
        
        await page.goto("http://localhost:5173/")
        await page.wait_for_timeout(2000)
        
        # Dismiss welcome modal
        close_btn = page.locator(".academy-modal-close")
        if await close_btn.count() > 0:
            await close_btn.click()
            await page.wait_for_timeout(500)
            
        # Enter travel mode
        travel_btn = page.locator("button.travel-btn").first
        if await travel_btn.count() > 0:
            await travel_btn.click()
            await page.wait_for_timeout(1000)

        # Press 'm' to open Nav Map modal
        await page.keyboard.press("m")
        await page.wait_for_timeout(1000)
        
        # Click all categories
        for tab_name in ["Planets & Sun", "Moons", "Dwarf Planets", "Asteroids", "All Destinations"]:
            tab = page.locator(f".navmap-card .cat-tab:has-text('{tab_name}')")
            await tab.click()
            await page.wait_for_timeout(150)
            
        # Click a destination row
        row = page.locator(".navmap-card .navmap-row").first
        await row.click()
        await page.wait_for_timeout(150)
        
        # Test close modal
        close_modal = page.locator(".navmap-card .icon-btn")
        await close_modal.click()
        await page.wait_for_timeout(500)
        assert await page.locator(".navmap-card").count() == 0, "Modal should close"
        
        await browser.close()
        
    print(f"Browser console errors count: {len(errors)}")
    if errors:
        for e in errors:
            print(f"  Error: {e}")
    else:
        print("ZERO browser console errors!")

if __name__ == "__main__":
    asyncio.run(check_console())
