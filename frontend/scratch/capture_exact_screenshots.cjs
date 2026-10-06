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

    // Mock wallet balance on both /api/wallet/balance and /api/v1/wallet/balance
    await page.route('**/api/wallet/balance', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ balance: 2000000 })
      });
    });
    await page.route('**/api/v1/wallet/balance', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ balance: 2000000 })
      });
    });

    // Mock API responses for subscription with Business 1.000.000đ
    await page.route('**/api/v1/subscription/tiers', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            tierId: 1,
            tierCode: 'FREE',
            name: 'Gói Miễn Phí',
            description: 'Gói mặc định cho sự kiện quy mô <= 100 người',
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
            name: 'Gói Chuyên Nghiệp (Pro)',
            description: 'Sự kiện lớn không giới hạn, hoa hồng 2.5%, mở khóa báo cáo',
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
            name: 'Gói Doanh Nghiệp (Business)',
            description: '0% hoa hồng sàn, không giới hạn sức chứa, toàn quyền báo cáo',
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

    const futureEndDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await page.route('**/api/v1/subscription/current', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organizerId: 10,
          role: 'ORGANIZER',
          tierCode: 'PRO',
          tierName: 'Gói Chuyên Nghiệp (Pro)',
          maxCapacityLimit: -1,
          commissionBps: 250,
          hasAdvancedReports: true,
          feeSource: 'TIER',
          status: 'ACTIVE',
          startDate: new Date().toISOString(),
          endDate: futureEndDate,
          daysRemaining: 15,
          autoRenew: true
        })
      });
    });

    console.log('Navigating to http://localhost:3000/dashboard/organizer/subscription...');
    await page.goto('http://localhost:3000/dashboard/organizer/subscription', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Screenshot 1: Trang quản lý gói (Bật tự gia hạn, Business 1 triệu, ví đủ tiền 2 triệu)
    const page1Path = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_pro_active.png';
    await page.screenshot({ path: page1Path, fullPage: true });
    console.log('Saved page1 screenshot to:', page1Path);

    // Screenshot 2: Modal nâng cấp giữa kỳ (Ví đủ tiền, có dòng khấu trừ ngày chưa dùng, nút hoạt động)
    const upgradeBtns = await page.$$('button:has-text("Nâng Cấp Gói")');
    if (upgradeBtns.length > 0) {
      await upgradeBtns[0].click();
      await page.waitForTimeout(500);
      const upgradeModalPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_upgrade_prorated_modal.png';
      await page.screenshot({ path: upgradeModalPath, fullPage: true });
      console.log('Saved upgrade prorated modal screenshot to:', upgradeModalPath);
      
      const closeBtn = await page.$('button:has-text("Hủy")');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(400);
    }

    // Screenshot 3: Modal Hạ cấp gói
    const downgradeBtn = await page.$('button:has-text("Hạ về gói Free")');
    if (downgradeBtn) {
      await downgradeBtn.click();
      await page.waitForTimeout(500);
      const downgradeModalPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\organizer_subscription_downgrade_modal.png';
      await page.screenshot({ path: downgradeModalPath, fullPage: true });
      console.log('Saved downgrade modal screenshot to:', downgradeModalPath);
    }

    await browser.close();
  } catch (err) {
    console.error('Error during capture:', err);
  }
})();
