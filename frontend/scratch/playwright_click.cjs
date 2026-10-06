const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const page = browser.contexts()[0].pages().find(p => p.url().includes('3000'));
    
    // Click on the capacity row
    await page.locator('span:has-text("Sức chứa tối đa")').click();
    console.log('Clicked "Sức chứa tối đa"');
    await page.waitForTimeout(1000);

    // Check if modal/popover appeared
    const popoverTitle = await page.locator('h3:has-text("Sức chứa sự kiện")').isVisible();
    console.log('Popover visible:', popoverTitle);

    // Fill 101
    const numberInput = page.locator('input[type="number"]');
    await numberInput.fill('101');
    console.log('Filled 101');
    await page.waitForTimeout(300);

    // Click Xác nhận
    await page.locator('button:has-text("Xác nhận")').click();
    console.log('Clicked Xác nhận');
    await page.waitForTimeout(1500);

    // Screenshot open modal
    const openPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_open_101.png';
    await page.screenshot({ path: openPath });
    console.log('Saved open modal 101');

    // Click 'Để sau' to close modal
    const deSauBtn = page.locator('button:has-text("Để sau")');
    if (await deSauBtn.isVisible()) {
      await deSauBtn.click();
      console.log('Clicked Để sau');
      await page.waitForTimeout(800);
    }

    // Reopen capacity popover
    await page.locator('span:has-text("Sức chứa tối đa")').click();
    console.log('Reopened capacity popover');
    await page.waitForTimeout(600);

    // Fill 90
    await numberInput.fill('90');
    console.log('Filled 90');
    await page.waitForTimeout(300);

    // Click Xác nhận
    await page.locator('button:has-text("Xác nhận")').click();
    console.log('Clicked Xác nhận for 90');
    await page.waitForTimeout(1200);

    // Screenshot closed modal
    const closedPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_closed_90.png';
    await page.screenshot({ path: closedPath });
    console.log('Saved closed modal 90');

    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
