import { chromium } from 'playwright';

(async () => {
    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

        await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle' });

        // Login
        await page.fill('input[type="email"]', 'Charlie.nilsson@live.com');
        await page.fill('input[type="password"]', 'bajsechalle9');
        await page.click('button[type="submit"]');

        await page.waitForTimeout(2000);

        // Click the first valid trip card inside the grid (usually My Trips)
        const tripCards = await page.$$('.card');
        if (tripCards.length > 1) {
            await tripCards[1].click(); // usually the second one is a trip, first might be User Info
        } else if (tripCards.length === 1) {
            await tripCards[0].click();
        }

        await page.waitForTimeout(2000);

        // Look for Add Activity and click it
        const buttons = await page.$$('button');
        let addActBtn = null;
        for (const btn of buttons) {
            const text = await btn.textContent();
            if (text && text.includes('Add Activity')) {
                addActBtn = btn;
                break;
            }
        }

        if (addActBtn) {
            console.log('Found Add Activity button. Clicking...');
            await addActBtn.click();
            await page.waitForTimeout(1000);
            console.log('Waited 1 second after click.');
        } else {
            console.log('Add Activity button not found.');
        }

        await browser.close();
    } catch (e) {
        console.error('Script failed:', e);
    }
})();
