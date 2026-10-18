import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1440, 'height': 900})
        await page.goto('http://localhost:5173')
        await page.wait_for_selector('.loader.gone', timeout=15000)
        btn = page.locator("button:has-text('EXPLORE FREELY')")
        if await btn.is_visible():
            await btn.click()
            await asyncio.sleep(0.5)
        audio = page.locator('.audio-btn')
        await audio.click()
        await asyncio.sleep(0.5)
        await page.screenshot(path='audio_popover_verified.png')
        print('Captured audio_popover_verified.png')
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
