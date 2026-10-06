const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    let targetPage = null;
    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        if (p.url().includes('3000')) targetPage = p;
      }
    }
    console.log('Page:', targetPage.url());

    // Step 1: Click capacity row to open popover
    await targetPage.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const capDiv = divs.find(d => d.textContent && d.textContent.includes('Sức chứa tối đa'));
      if (capDiv) {
        const clickable = capDiv.closest('.cursor-pointer') || capDiv;
        clickable.click();
      }
    });

    await targetPage.waitForTimeout(600);

    // Step 2: Fill 101 into number input and click confirm
    const res1 = await targetPage.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
      if (inputs.length === 0) return 'no inputs';
      const input = inputs[0];
      
      // Native setter to ensure React state triggers
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(input, '101');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const buttons = Array.from(document.querySelectorAll('button'));
      const confirmBtn = buttons.find(b => b.textContent && b.textContent.includes('Xác nhận'));
      if (confirmBtn) {
        confirmBtn.click();
        return 'confirmed 101';
      }
      return 'confirm btn not found';
    });
    console.log('Step 2 result:', res1);

    await targetPage.waitForTimeout(1500);

    const openPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_open_101.png';
    await targetPage.screenshot({ path: openPath, fullPage: false });
    console.log('Saved real open modal 101 screenshot to:', openPath);

    // Step 3: Close upgrade modal if open or click outside/reopen capacity row
    await targetPage.evaluate(() => {
      // Find 'Để sau' or close button on UpgradePlanModal
      const buttons = Array.from(document.querySelectorAll('button'));
      const deSauBtn = buttons.find(b => b.textContent && b.textContent.includes('Để sau'));
      if (deSauBtn) deSauBtn.click();
    });
    await targetPage.waitForTimeout(600);

    // Step 4: Reopen capacity row and enter 90
    await targetPage.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const capDiv = divs.find(d => d.textContent && d.textContent.includes('Sức chứa tối đa'));
      if (capDiv) {
        const clickable = capDiv.closest('.cursor-pointer') || capDiv;
        clickable.click();
      }
    });
    await targetPage.waitForTimeout(600);

    await targetPage.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
      if (inputs.length > 0) {
        const input = inputs[0];
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, '90');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => b.textContent && b.textContent.includes('Xác nhận'));
        if (confirmBtn) confirmBtn.click();
      }
    });

    await targetPage.waitForTimeout(1500);

    const closedPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\real_modal_closed_90.png';
    await targetPage.screenshot({ path: closedPath, fullPage: false });
    console.log('Saved real closed modal 90 screenshot to:', closedPath);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
