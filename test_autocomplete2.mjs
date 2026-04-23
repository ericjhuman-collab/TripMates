import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.goto('http://localhost:5173/login');
    // Login
    await page.fill('input[type="email"]', 'Charlie.nilsson@live.com');
    await page.fill('input[type="password"]', 'bajsechalle9');
    await page.click('button[type="submit"]');
    
    await page.waitForTimeout(3000);
    await page.goto('http://localhost:5173/profile');
    await page.waitForTimeout(2000);
    
    await page.click('button:has-text("Edit Trip")');
    await page.waitForTimeout(2000);
    
    await page.click('button:has-text("Add Activity")');
    await page.waitForTimeout(2000);
    
    await page.fill('input[title="Location Name"]', 'Colos');
    
    // Wait for network idle to see if google maps fires
    await page.waitForTimeout(3000);
    
    await browser.close();
})();
