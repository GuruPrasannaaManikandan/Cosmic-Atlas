import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Desktop viewport: 1440x900
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto("http://localhost:5173/")
        await page.wait_for_timeout(2000)
        
        # Dismiss welcome modal if open
        close_btn = page.locator(".academy-modal-close")
        if await close_btn.count() > 0:
            await close_btn.click()
            await page.wait_for_timeout(500)
        else:
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)

        # Enter travel mode
        travel_btn = page.locator("button.travel-btn").first
        if await travel_btn.count() > 0:
            await travel_btn.click()
            await page.wait_for_timeout(1000)
        else:
            # Maybe click enter travel mode in start panel
            btn = page.locator("button:has-text('TRAVEL MODE')").first
            if await btn.count() > 0:
                await btn.click()
                await page.wait_for_timeout(1000)

        # Press 'm' to open Nav Map modal
        await page.keyboard.press("m")
        await page.wait_for_timeout(1000)
        
        modal = page.locator(".navmap-card")
        if await modal.count() > 0:
            print("Nav map modal opened successfully!")
            await page.screenshot(path="navmap_before.png")
            
            # Measure bounding rects
            header = await page.locator(".navmap-card .panel-head").bounding_box()
            hint = await page.locator(".navmap-card .hint").bounding_box()
            cat_tabs = await page.locator(".navmap-card .cat-tabs").first.bounding_box()
            search = await page.locator(".navmap-card .search").bounding_box()
            layout = await page.locator(".navmap-card .navmap-layout").bounding_box()
            
            print(f"Header: {header}")
            print(f"Hint: {hint}")
            print(f"Cat Tabs: {cat_tabs}")
            print(f"Search: {search}")
            print(f"Layout: {layout}")
            
            # Check overlap between cat_tabs and search
            if cat_tabs and search:
                overlap = cat_tabs['y'] + cat_tabs['height'] - search['y']
                print(f"Overlap between Cat Tabs and Search: {overlap}px")
        else:
            print("Could not find .navmap-card modal")
            await page.screenshot(path="navmap_not_found.png")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
