const { chromium } = require('playwright');

(async () => {
  try {
    console.log('Connecting to browser on http://127.0.0.1:9222...');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    const context = contexts[0] || (await browser.newContext());
    const pages = context.pages();
    const page = pages[0] || (await context.newPage());

    console.log('Navigating to http://localhost:3000/dashboard/organizer/subscription...');
    await page.goto('http://localhost:3000/dashboard/organizer/subscription', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const subScreenshotPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_real.png';
    await page.screenshot({ path: subScreenshotPath, fullPage: true });
    console.log('Saved subscription page screenshot to:', subScreenshotPath);

    // Try clicking 'Nâng Cấp Gói' to capture the Upgrade Modal
    const upgradeBtns = await page.$$('button:has-text("Nâng Cấp Gói")');
    if (upgradeBtns.length > 0) {
      await upgradeBtns[0].click();
      await page.waitForTimeout(800);
      const modalScreenshotPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_upgrade_modal_real.png';
      await page.screenshot({ path: modalScreenshotPath, fullPage: true });
      console.log('Saved upgrade modal screenshot to:', modalScreenshotPath);
    }

    await browser.close();
  } catch (err) {
    console.error('Error taking real subscription screenshots:', err);
  }
})();
