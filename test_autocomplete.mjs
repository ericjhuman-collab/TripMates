import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:5173/login');
    // Login
    await page.fill('input[type="email"]', 'Charlie.nilsson@live.com');
    await page.fill('input[type="password"]', 'bajsechalle9');
    await page.click('button[type="submit"]');
    
    // Wait for home page
    await page.waitForTimeout(5000);
    
    // Switch to calendar/schedule tab or go straight to URL if trip admin is accessible
    // Wait, let's open the profile to get to trip admin
    await page.goto('http://localhost:5173/profile');
    await page.waitForTimeout(3000);
    
    // Click edit trip
    await page.click('button:has-text("Edit Trip")');
    await page.waitForTimeout(3000);
    
    // Click add activity
    await page.click('button:has-text("Add Activity")');
    await page.waitForTimeout(2000);
    
    // Type in Location / Company Name
    await page.fill('input[title="Location Name"]', 'Colosseum');
    await page.waitForTimeout(2000); // Wait for autocomplete to show options
    
    // Let's capture a screenshot to see if the dropdown appears
    await page.screenshot({ path: 'artifacts/autocomplete_test.png', fullPage: true });

    await browser.close();
})();
