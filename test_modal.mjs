import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'Charlie.nilsson@live.com');
    await page.fill('input[type="password"]', 'bajsechalle9');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    // Usually Trip Admin is on the "Admin" or "Profile" page. Let's go to /trip-admin or Home?
    // Wait, let's see which buttons exist...
    
    // First, snapshot the home page to find out how to get to Trip Admin.
    await page.screenshot({ path: 'artifacts/modal-debug-01-home.png' });
    
    // Try to click Admin tab if it exists
    const adminLink = await page.$('a[href="/admin"], button:has-text("Admin"), a:has-text("Admin")');
    if (adminLink) {
        await adminLink.click();
    } else {
        // Just go direct to /admin or wherever TripAdmin renders
        await page.goto('http://localhost:5173/'); // wait, Home rendered TripAdmin conditionally? No, App.tsx routes.
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'artifacts/modal-debug-02-admin.png' });
    
    await browser.close();
})();
