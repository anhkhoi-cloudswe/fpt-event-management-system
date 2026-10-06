const { chromium } = require('playwright');
const path = require('path');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1. Mock Auth
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

    // 2. Mock Subscription Tiers
    await page.route('**/api/v1/subscription/tiers', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            tierId: 1,
            tierCode: 'FREE',
            name: 'Gói Free (Mặc định)',
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
            priceVnd: 1000000,
            billingCycle: 'MONTHLY',
            commissionBps: 0,
            maxCapacityLimit: -1,
            hasAdvancedReports: true,
            isActive: true
          }
        ])
      });
    });

    // 3. Mock Current Subscription (Active Free)
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

    // Mock wallet balance hook endpoint /api/wallet/balance
    await page.route('**/api/wallet/balance', async route => {
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

    // Click 'Nâng Cấp Gói' on Pro
    const upgradeBtns = await page.$$('button:has-text("Nâng Cấp Gói")');
    if (upgradeBtns.length > 0) {
      await upgradeBtns[0].click();
      await page.waitForTimeout(600);
      const upgradeModalPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_upgrade_modal_with_tam_tinh.png';
      await page.screenshot({ path: upgradeModalPath, fullPage: true });
      console.log('Saved upgrade modal with tam tinh to:', upgradeModalPath);
    }

    // Mock subscribe API call success
    await page.route('**/api/v1/subscription/subscribe', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscriptionId: 55,
          tierCode: 'PRO',
          amountPaid: 299000,
          proratedCredit: 0,
          startDate: '2026-10-03T00:00:00Z',
          endDate: '2026-11-03T00:00:00Z',
          message: 'Kích hoạt thành công gói Gói Pro đến ngày 03/11/2026.'
        })
      });
    });

    // Mock current sub to PRO for after payment
    await page.route('**/api/v1/subscription/current', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organizerId: 10,
          role: 'ORGANIZER',
          tierCode: 'PRO',
          tierName: 'Gói Pro',
          maxCapacityLimit: -1,
          commissionBps: 250,
          hasAdvancedReports: true,
          feeSource: 'SUBSCRIPTION',
          status: 'ACTIVE',
          startDate: '2026-10-03T00:00:00Z',
          endDate: '2026-11-03T00:00:00Z',
          daysRemaining: 30,
          autoRenew: true
        })
      });
    });

    const confirmPayBtn = await page.$('button:has-text("Xác Nhận Thanh Toán")');
    if (confirmPayBtn) {
      await confirmPayBtn.click();
      await page.waitForTimeout(1000);
      const paymentSuccessPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_payment_success.png';
      await page.screenshot({ path: paymentSuccessPath, fullPage: true });
      console.log('Saved payment success screenshot to:', paymentSuccessPath);
    }

    await browser.close();
  } catch (err) {
    console.error('Error during modal capture:', err);
  }
})();
