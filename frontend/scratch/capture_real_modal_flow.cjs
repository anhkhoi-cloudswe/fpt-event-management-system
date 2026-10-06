const { chromium } = require('playwright');
const path = require('path');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    console.log('Navigating to http://localhost:3000/events/create...');
    await page.goto('http://localhost:3000/events/create', { waitUntil: 'networkidle' });

    // Fill capacity 101
    const capInput = await page.$('#capacity-input, input[name="expectedParticipants"], input[type="number"]');
    if (capInput) {
      await capInput.fill('101');
      await capInput.dispatchEvent('input');
      await capInput.dispatchEvent('change');
      await page.waitForTimeout(500);
    }

    const openPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\modal_open_101.png';
    await page.screenshot({ path: openPath, fullPage: true });
    console.log('Captured open modal screenshot to:', openPath);

    // Refill capacity 90
    if (capInput) {
      await capInput.fill('90');
      await capInput.dispatchEvent('input');
      await capInput.dispatchEvent('change');
      await page.waitForTimeout(500);
    }

    const closedPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\modal_closed_90.png';
    await page.screenshot({ path: closedPath, fullPage: true });
    console.log('Captured closed modal screenshot to:', closedPath);

    await browser.close();
  } catch (err) {
    console.error('Error during screenshot flow:', err);
  }
})();
