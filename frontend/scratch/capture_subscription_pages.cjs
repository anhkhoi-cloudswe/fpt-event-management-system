const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Mock auth /me
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 10,
          fullName: 'Organizer Demo',
          email: 'organizer@fpt.edu.vn',
          role: 'ORGANIZER',
          status: 'ACTIVE',
          wallet: { balance: 2000000 },
          wallet_balance: 2000000
        })
      });
    });

    // Mock API responses for subscription
    await page.route('**/api/v1/subscription/tiers', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            tierId: 1,
            tierCode: 'FREE',
            name: 'Gói Free (Mặc định)',
            description: 'Gói tiêu chuẩn cho cá nhân và ban tổ chức nhỏ',
            priceVnd: 0,
            billingCycle: 'MONTHLY',
            commissionBps: 500,
            maxCapacityLimit: 100,
            hasAdvancedReports: false,
            isActive: true
          },
          {
            tierId: 2,
            tierCode: 'PRO',
            name: 'Gói Pro',
            description: 'Dành cho đơn vị tổ chức sự kiện vừa & thường xuyên',
            priceVnd: 299000,
            billingCycle: 'MONTHLY',
            commissionBps: 250,
            maxCapacityLimit: -1,
            hasAdvancedReports: true,
            isActive: true
          },
          {
            tierId: 3,
            tierCode: 'BUSINESS',
            name: 'Gói Business',
            description: 'Dành cho doanh nghiệp tổ chức quy mô lớn',
            priceVnd: 1500000,
            billingCycle: 'MONTHLY',
            commissionBps: 0,
            maxCapacityLimit: -1,
            hasAdvancedReports: true,
            isActive: true
          }
        ])
      });
    });

    await page.route('**/api/v1/subscription/current', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organizerId: 10,
          role: 'ORGANIZER',
          tierCode: 'FREE',
          tierName: 'Gói Miễn Phí (Free)',
          maxCapacityLimit: 100,
          commissionBps: 500,
          hasAdvancedReports: false,
          feeSource: 'FREE',
          status: 'ACTIVE',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T23:59:59Z',
          daysRemaining: 0,
          autoRenew: false
        })
      });
    });

    await page.route('**/api/v1/wallet/balance', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          balance: 2000000
        })
      });
    });

    console.log('Navigating to http://localhost:3000/dashboard/organizer/subscription...');
    await page.goto('http://localhost:3000/dashboard/organizer/subscription', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const subScreenshotPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_real.png';
    await page.screenshot({ path: subScreenshotPath, fullPage: true });
    console.log('Saved subscription page screenshot to:', subScreenshotPath);

    // Click 'Nâng Cấp Gói' on Pro card to show modal
    const upgradeBtns = await page.$$('button:has-text("Nâng Cấp Gói")');
    if (upgradeBtns.length > 0) {
      await upgradeBtns[0].click();
      await page.waitForTimeout(600);
      const modalScreenshotPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_upgrade_modal_real.png';
      await page.screenshot({ path: modalScreenshotPath, fullPage: true });
      console.log('Saved upgrade modal screenshot to:', modalScreenshotPath);
    }

    await browser.close();
  } catch (err) {
    console.error('Error during capture:', err);
  }
})();
