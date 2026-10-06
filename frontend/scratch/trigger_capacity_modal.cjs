const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();

    let targetPage = null;
    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        const u = p.url();
        if (u.includes('3000')) {
          targetPage = p;
        }
      }
    }

    console.log('Current page:', targetPage.url());

    // 1. Click "Sự Kiện Tự Do" (Independent flow)
    const independentCard = await targetPage.$('text=Sự Kiện Tự Do');
    if (independentCard) {
      console.log('Clicking "Sự Kiện Tự Do"...');
      await independentCard.click();
      await targetPage.waitForTimeout(1000);
    }

    // 2. Click capacity edit pencil
    const editBtn = await targetPage.$('svg.lucide-pencil');
    if (editBtn) {
      console.log('Clicking pencil button...');
      await editBtn.click();
      await targetPage.waitForTimeout(600);
    }

    // 3. Fill 101 into capacity popover input
    const popoverInput = await targetPage.$('input[type="number"]');
    if (popoverInput) {
      console.log('Filling 101...');
      await popoverInput.fill('101');
      await popoverInput.dispatchEvent('input');
      await popoverInput.dispatchEvent('change');
      await targetPage.waitForTimeout(300);

      const confirmBtn = await targetPage.$('button:has-text("Xác nhận")');
      if (confirmBtn) {
        console.log('Clicking Xác nhận...');
        await confirmBtn.click();
      }
    }

    await targetPage.waitForTimeout(1500);

    const openPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_open_101.png';
    await targetPage.screenshot({ path: openPath, fullPage: false });
    console.log('SUCCESS: Saved real open modal 101 screenshot to:', openPath);

    // 4. Change capacity back to 90
    const editBtn2 = await targetPage.$('svg.lucide-pencil');
    if (editBtn2) {
      console.log('Re-clicking pencil button...');
      await editBtn2.click();
      await targetPage.waitForTimeout(600);
      const inputAgain = await targetPage.$('input[type="number"]');
      if (inputAgain) {
        console.log('Filling 90...');
        await inputAgain.fill('90');
        await inputAgain.dispatchEvent('input');
        await inputAgain.dispatchEvent('change');
        const confirmBtn = await targetPage.$('button:has-text("Xác nhận")');
        if (confirmBtn) await confirmBtn.click();
      }
    }

    await targetPage.waitForTimeout(1200);

    const closedPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_closed_90.png';
    await targetPage.screenshot({ path: closedPath, fullPage: false });
    console.log('SUCCESS: Saved real closed modal 90 screenshot to:', closedPath);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
