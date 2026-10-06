const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    console.log('Found contexts:', contexts.length);

    let targetPage = null;
    for (const ctx of contexts) {
      const pages = ctx.pages();
      for (const p of pages) {
        const url = p.url();
        console.log('Page URL:', url);
        if (url.includes('3000') || url.includes('dashboard')) {
          targetPage = p;
          break;
        }
      }
      if (targetPage) break;
    }

    if (!targetPage) {
      console.error('Target page on port 3000 not found among CDP pages!');
      process.exit(1);
    }

    console.log('Using target page:', targetPage.url());

    // 1. Click 'Tạo sự kiện' if we are on dashboard
    if (targetPage.url().includes('/dashboard')) {
      console.log('Clicking "Tạo sự kiện"...');
      const createBtn = await targetPage.$('a[href*="create"], button:has-text("Tạo sự kiện"), div:has-text("Tạo sự kiện")');
      if (createBtn) {
        await createBtn.click();
      } else {
        await targetPage.goto('http://localhost:3000/events/create', { waitUntil: 'networkidle' });
      }
      await targetPage.waitForTimeout(1000);
    }

    console.log('Current page URL after navigation:', targetPage.url());

    // Find expected capacity input / popover button
    // Let's search for inputs
    const inputs = await targetPage.$$('input');
    console.log('Found total inputs:', inputs.length);

    // Let's find capacity input or button that sets capacity
    let capInput = await targetPage.$('input[name="expectedParticipants"], input[placeholder*="sức chứa"], input[placeholder*="quy mô"], input[type="number"]');
    
    // If not directly visible, click on capacity selector or choose flow
    // In EventRequestCreate, flow selection might be present: UNIVERSITY or INDEPENDENT
    const independentFlowBtn = await targetPage.$('button:has-text("Sự kiện độc lập"), div:has-text("Sự kiện độc lập"), button:has-text("Tự do")');
    if (independentFlowBtn) {
      console.log('Selecting INDEPENDENT flow...');
      await independentFlowBtn.click();
      await targetPage.waitForTimeout(500);
    }

    // Check again for capacity input
    capInput = await targetPage.$('input[name="expectedParticipants"], input[placeholder*="sức chứa"], input[placeholder*="quy mô"], input[type="number"]');

    if (capInput) {
      console.log('Filling 101 in capacity input...');
      await capInput.fill('101');
      await capInput.dispatchEvent('input');
      await capInput.dispatchEvent('change');
      await targetPage.waitForTimeout(800);
    } else {
      // Look for popover or button to enter capacity
      const popoverBtn = await targetPage.$('button:has-text("Nhập số khác"), button:has-text("Sức chứa")');
      if (popoverBtn) {
        await popoverBtn.click();
        await targetPage.waitForTimeout(400);
        const tempInput = await targetPage.$('input[type="number"]');
        if (tempInput) {
          await tempInput.fill('101');
          await tempInput.dispatchEvent('input');
          const applyBtn = await targetPage.$('button:has-text("Xác nhận"), button:has-text("Áp dụng")');
          if (applyBtn) await applyBtn.click();
        }
      }
    }

    await targetPage.waitForTimeout(1000);

    const openPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_open_101.png';
    await targetPage.screenshot({ path: openPath, fullPage: false });
    console.log('Successfully captured modal open 101 screenshot:', openPath);

    // Now change to 90
    capInput = await targetPage.$('input[name="expectedParticipants"], input[placeholder*="sức chứa"], input[placeholder*="quy mô"], input[type="number"]');
    if (capInput) {
      console.log('Filling 90 in capacity input...');
      await capInput.fill('90');
      await capInput.dispatchEvent('input');
      await capInput.dispatchEvent('change');
      await targetPage.waitForTimeout(800);
    }

    const closedPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_closed_90.png';
    await targetPage.screenshot({ path: closedPath, fullPage: false });
    console.log('Successfully captured modal closed 90 screenshot:', closedPath);

    process.exit(0);
  } catch (err) {
    console.error('Error in CDP script:', err);
    process.exit(1);
  }
})();
