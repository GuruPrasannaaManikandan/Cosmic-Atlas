import asyncio
from playwright.async_api import async_playwright

VIEWPORTS = [
    ("desktop", 1440, 900),
    ("laptop", 1366, 768),
    ("tablet", 1024, 768),
    ("narrow", 768, 900),
]

async def verify_viewport(page, name, width, height):
    print(f"\n==========================================")
    print(f"Testing Viewport: {name} ({width}x{height})")
    print(f"==========================================")
    await page.set_viewport_size({"width": width, "height": height})
    await page.wait_for_timeout(500)
    
    # 1. Measure all elements
    head = await page.locator(".navmap-card .panel-head").bounding_box()
    hint = await page.locator(".navmap-card .hint").bounding_box()
    cat_tabs = await page.locator(".navmap-card .cat-tabs").bounding_box()
    search = await page.locator(".navmap-card .search").bounding_box()
    layout = await page.locator(".navmap-card .navmap-layout").bounding_box()
    
    print(f"Header:   y={head['y']:.1f}, h={head['height']:.1f}, bottom={head['y']+head['height']:.1f}")
    print(f"Hint:     y={hint['y']:.1f}, h={hint['height']:.1f}, bottom={hint['y']+hint['height']:.1f}")
    print(f"CatTabs:  y={cat_tabs['y']:.1f}, h={cat_tabs['height']:.1f}, bottom={cat_tabs['y']+cat_tabs['height']:.1f}")
    print(f"Search:   y={search['y']:.1f}, h={search['height']:.1f}, bottom={search['y']+search['height']:.1f}")
    print(f"Layout:   y={layout['y']:.1f}, h={layout['height']:.1f}")
    
    # Assertions
    assert cat_tabs['height'] >= 30, f"CatTabs height {cat_tabs['height']} is too small/squashed!"
    assert hint['y'] + hint['height'] <= cat_tabs['y'] + 1, f"Hint overlaps CatTabs! Hint bottom: {hint['y']+hint['height']}, Tabs top: {cat_tabs['y']}"
    assert cat_tabs['y'] + cat_tabs['height'] <= search['y'] + 1, f"CatTabs overlaps Search! Tabs bottom: {cat_tabs['y']+cat_tabs['height']}, Search top: {search['y']}"
    assert search['y'] + search['height'] <= layout['y'] + 1, f"Search overlaps Layout! Search bottom: {search['y']+search['height']}, Layout top: {layout['y']}"
    
    gap_hint_tabs = cat_tabs['y'] - (hint['y'] + hint['height'])
    gap_tabs_search = search['y'] - (cat_tabs['y'] + cat_tabs['height'])
    gap_search_layout = layout['y'] - (search['y'] + search['height'])
    print(f"Gap Hint->Tabs: {gap_hint_tabs:.1f}px (positive = clean spacing)")
    print(f"Gap Tabs->Search: {gap_tabs_search:.1f}px (positive = clean spacing)")
    print(f"Gap Search->Layout: {gap_search_layout:.1f}px (positive = clean spacing)")
    
    # 2. Test clicking "Moons" category to test 2-row filter layout
    moons_tab = page.locator(".navmap-card .cat-tab:has-text('Moons')")
    await moons_tab.click()
    await page.wait_for_timeout(300)
    
    parent_tabs = await page.locator(".navmap-card .navmap-parent-tabs").bounding_box()
    search_after = await page.locator(".navmap-card .search").bounding_box()
    print(f"ParentTabs (Moons active): y={parent_tabs['y']:.1f}, h={parent_tabs['height']:.1f}, bottom={parent_tabs['y']+parent_tabs['height']:.1f}")
    print(f"Search (Moons active):     y={search_after['y']:.1f}, h={search_after['height']:.1f}")
    
    assert parent_tabs['height'] >= 26, f"ParentTabs height {parent_tabs['height']} is squashed!"
    assert cat_tabs['y'] + cat_tabs['height'] <= parent_tabs['y'] + 1, "CatTabs overlaps ParentTabs!"
    assert parent_tabs['y'] + parent_tabs['height'] <= search_after['y'] + 1, "ParentTabs overlaps Search!"
    
    # 3. Test Parent Moon click: "Mars"
    mars_chip = page.locator(".navmap-card .navmap-parent-tab:has-text('Mars')")
    await mars_chip.click()
    await page.wait_for_timeout(300)
    
    # Check that Phobos and Deimos are listed
    rows = await page.locator(".navmap-card .navmap-row").all_text_contents()
    print(f"Mars moons count: {len(rows)}")
    assert any("Phobos" in r for r in rows), "Phobos should be in Mars moons list"
    assert any("Deimos" in r for r in rows), "Deimos should be in Mars moons list"
    
    # 4. Test Search input
    search_input = page.locator(".navmap-card .search input")
    await search_input.fill("Ceres")
    await page.wait_for_timeout(300)
    # Reset category to all to see Ceres
    all_tab = page.locator(".navmap-card .cat-tab:has-text('All Destinations')")
    await all_tab.click()
    await page.wait_for_timeout(300)
    rows_search = await page.locator(".navmap-card .navmap-row").all_text_contents()
    print(f"Search 'Ceres' results: {len(rows_search)}")
    assert any("Ceres" in r for r in rows_search), "Ceres should appear in search results"
    
    # Clear search
    clear_btn = page.locator(".navmap-card .search-clear")
    if await clear_btn.count() > 0:
        await clear_btn.click()
        await page.wait_for_timeout(200)
    else:
        await search_input.fill("")
        
    await page.screenshot(path=f"navmap_{name}_fixed.png")
    print(f"PASS: Viewport {name} verified successfully!\n")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("http://localhost:5173/")
        await page.wait_for_timeout(2000)
        
        # Dismiss welcome modal
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

        # Press 'm' to open Nav Map modal
        await page.keyboard.press("m")
        await page.wait_for_timeout(1000)
        
        for name, w, h in VIEWPORTS:
            await verify_viewport(page, name, w, h)
            
        await browser.close()
        print("ALL VIEWPORT LAYOUT TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(main())
