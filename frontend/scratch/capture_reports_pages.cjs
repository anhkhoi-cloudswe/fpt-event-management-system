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

    // 2. Mock Events List
    await page.route('**/api/events*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { eventId: 101, title: 'Workshop Trí Tuệ Nhân Tạo & Điện Toán Đám Mây 2026', status: 'OPEN' },
            { eventId: 102, title: 'Hội Thảo Công Nghệ Blockchain FPT', status: 'CLOSED' }
          ]
        })
      });
    });

    // 3. Mock Financial Overview (Basic Report)
    await page.route('**/api/v1/organizer/events/101/financial-overview', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          eventId: 101,
          title: 'Workshop Trí Tuệ Nhân Tạo & Điện Toán Đám Mây 2026',
          totalGrossRevenue: 45000000,
          totalGrossFormatted: '45 triệu',
          totalPlatformFee: 2250000,
          totalPlatformFeeFormatted: '2,25 triệu',
          totalNetProfit: 42750000,
          totalNetFormatted: '42,75 triệu',
          totalTicketsSold: 350,
          totalTicketsRefunded: 5,
          currency: 'VND',
          isSettled: false,
          createdAt: '2026-10-01T00:00:00Z'
        })
      });
    });

    // 4. Mock Check-In List
    await page.route('**/api/v1/organizer/events/101/check-in-list', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ticketId: 1001, ticketCode: 'TK-1001****9821', categoryTicketId: 1, categoryName: 'VIP', attendeeName: 'Nguyễn Văn An', attendeeEmail: 'annv@fpt.edu.vn', seatCode: 'A-01', status: 'CHECKED_IN', checkedInAt: '2026-10-03T08:30:00Z', createdAt: '2026-10-01T08:00:00Z' },
          { ticketId: 1002, ticketCode: 'TK-1002****4412', categoryTicketId: 1, categoryName: 'VIP', attendeeName: 'Trần Thị Bình', attendeeEmail: 'binhtt@fpt.edu.vn', seatCode: 'A-02', status: 'CHECKED_IN', checkedInAt: '2026-10-03T08:45:00Z', createdAt: '2026-10-01T08:15:00Z' },
          { ticketId: 1003, ticketCode: 'TK-1003****7721', categoryTicketId: 2, categoryName: 'Tiêu chuẩn', attendeeName: 'Lê Hoàng Long', attendeeEmail: 'longlh@fpt.edu.vn', seatCode: 'B-05', status: 'BOOKED', createdAt: '2026-10-01T09:00:00Z' },
          { ticketId: 1004, ticketCode: 'TK-1004****3319', categoryTicketId: 2, categoryName: 'Tiêu chuẩn', attendeeName: 'Phạm Minh Đức', attendeeEmail: 'ducpm@fpt.edu.vn', seatCode: 'B-06', status: 'REFUNDED', createdAt: '2026-10-01T09:30:00Z' }
        ])
      });
    });

    // 5. Mock Seat Status
    await page.route('**/api/v1/organizer/events/101/seat-status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          eventId: 101,
          title: 'Workshop Trí Tuệ Nhân Tạo & Điện Toán Đám Mây 2026',
          totalCapacity: 400,
          totalSold: 350,
          totalRemaining: 50,
          totalCheckedIn: 315,
          categories: [
            { categoryTicketId: 1, categoryName: 'Vé VIP', price: 300000, priceFormatted: '300k', totalCapacity: 100, soldSeats: 95, remainingSeats: 5, checkedInSeats: 90, fillRatePercent: 95.0 },
            { categoryTicketId: 2, categoryName: 'Vé Tiêu chuẩn', price: 100000, priceFormatted: '100k', totalCapacity: 250, soldSeats: 230, remainingSeats: 20, checkedInSeats: 205, fillRatePercent: 92.0 },
            { categoryTicketId: 3, categoryName: 'Vé Sinh viên', price: 50000, priceFormatted: '50k', totalCapacity: 50, soldSeats: 25, remainingSeats: 25, checkedInSeats: 20, fillRatePercent: 50.0 }
          ]
        })
      });
    });

    // 6. Mock Advanced Analytics (403 PAYWALL_REQUIRED simulation for Free organizer)
    await page.route('**/api/v1/organizer/events/101/advanced-analytics', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'PAYWALL_REQUIRED',
          message: 'Gói Free không có quyền truy cập báo cáo nâng cao. Vui lòng nâng cấp lên gói Pro hoặc Business.',
          currentTier: 'FREE',
          requiresUpgrade: true
        })
      });
    });

    console.log('Navigating to http://localhost:3000/dashboard/reports...');
    await page.goto('http://localhost:3000/dashboard/reports', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Capture Tab 1: Báo cáo cơ bản
    const basicScreenshotPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\reports_basic_tab.png';
    await page.screenshot({ path: basicScreenshotPath, fullPage: true });
    console.log('Saved basic report screenshot to:', basicScreenshotPath);

    // Switch to Tab 2: Báo cáo nâng cao
    const advTabBtn = await page.$('button:has-text("Báo Cáo Nâng Cao")');
    if (advTabBtn) {
      await advTabBtn.click();
      await page.waitForTimeout(1000);
      const advScreenshotPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e50878b2-09e7-48bd-931b-4c331813a604\\reports_advanced_paywall_tab.png';
      await page.screenshot({ path: advScreenshotPath, fullPage: true });
      console.log('Saved advanced paywall report screenshot to:', advScreenshotPath);
    }

    await browser.close();
  } catch (err) {
    console.error('Error during capture:', err);
  }
})();
