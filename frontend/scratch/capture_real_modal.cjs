const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    const outputPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_browser_screenshot.png';
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log('Saved screenshot to:', outputPath);

    await browser.close();
  } catch (err) {
    console.error('Error taking screenshot:', err);
  }
})();
