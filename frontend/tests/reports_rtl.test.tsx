// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowserRouter } from 'react-router-dom'
import Reports from '../src/pages/Reports'
import { reportService } from '../src/services/reportService'

// Mock ResizeObserver for Recharts in jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver

// Mock useAuth
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      userId: 10,
      fullName: 'Test Organizer',
      email: 'organizer@test.com',
      role: 'ORGANIZER',
    },
  }),
}))

describe('Reports.tsx Phase 7 Section 3 RTL Tests', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: [
                { eventId: 101, title: 'Workshop AI Chuyên Sâu', status: 'OPEN' },
                { eventId: 102, title: 'Hội Thảo Công Nghệ FPT', status: 'CLOSED' },
              ],
            }),
        })
      })
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('2. Tab Báo Cáo Cơ Bản displays 3 columns of money (Gross, Fee, Net) and check-in table (excluding PENDING)', async () => {
    vi.spyOn(reportService, 'getFinancialOverview').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalGrossRevenue: 10000000,
      totalGrossFormatted: '10 triệu',
      totalPlatformFee: 500000,
      totalPlatformFeeFormatted: '500k',
      totalNetProfit: 9500000,
      totalNetFormatted: '9,5 triệu',
      totalTicketsSold: 100,
      totalTicketsRefunded: 2,
      currency: 'VND',
      isSettled: false,
      createdAt: '2026-10-01T00:00:00Z',
    })

    vi.spyOn(reportService, 'getCheckInList').mockResolvedValue([
      {
        ticketId: 1,
        ticketCode: 'TK-12345678',
        categoryTicketId: 1,
        categoryName: 'VIP',
        userId: 201,
        attendeeName: 'Nguyen Van A',
        attendeeEmail: 'a@gmail.com',
        seatCode: 'A-01',
        status: 'CHECKED_IN',
        checkedInAt: '2026-10-03T08:30:00Z',
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        ticketId: 2,
        ticketCode: 'TK-87654321',
        categoryTicketId: 2,
        categoryName: 'Standard',
        userId: 202,
        attendeeName: 'Tran Thi B',
        attendeeEmail: 'b@gmail.com',
        seatCode: 'B-02',
        status: 'PENDING', // Phải bị ẩn
        createdAt: '2026-10-01T00:00:00Z',
      },
    ])

    vi.spyOn(reportService, 'getSeatStatus').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalCapacity: 200,
      totalSold: 100,
      totalRemaining: 100,
      totalCheckedIn: 50,
      categories: [
        {
          categoryTicketId: 1,
          categoryName: 'VIP',
          price: 500000,
          priceFormatted: '500k',
          totalCapacity: 50,
          soldSeats: 40,
          remainingSeats: 10,
          checkedInSeats: 30,
          fillRatePercent: 80,
        },
      ],
    })

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    )

    // Check financial 3 columns
    await waitFor(
      () => {
        expect(screen.getByText('Doanh thu thanh toán (Gross)')).toBeInTheDocument()
        expect(screen.getByText('10 triệu')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
    expect(screen.getAllByText('500k').length).toBeGreaterThan(0)
    expect(screen.getByText('9,5 triệu')).toBeInTheDocument()

    // Check check-in list & hidden PENDING
    expect(screen.getByText('Nguyen Van A')).toBeInTheDocument()
    expect(screen.queryByText('Tran Thi B')).not.toBeInTheDocument() // PENDING status was filtered out
  })

  it('3. Tab Báo Cáo Nâng Cao: Free organizer triggers 403 PAYWALL_REQUIRED -> shows mock data banner and mock charts', async () => {
    vi.spyOn(reportService, 'getFinancialOverview').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalGrossRevenue: 0,
      totalGrossFormatted: '0k',
      totalPlatformFee: 0,
      totalPlatformFeeFormatted: '0k',
      totalNetProfit: 0,
      totalNetFormatted: '0k',
      totalTicketsSold: 0,
      totalTicketsRefunded: 0,
      currency: 'VND',
      isSettled: false,
      createdAt: '2026-10-01T00:00:00Z',
    })
    vi.spyOn(reportService, 'getCheckInList').mockResolvedValue([])
    vi.spyOn(reportService, 'getSeatStatus').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalCapacity: 0,
      totalSold: 0,
      totalRemaining: 0,
      totalCheckedIn: 0,
      categories: [],
    })

    const paywallErr: any = new Error('Paywall required')
    paywallErr.response = {
      status: 403,
      data: {
        error: 'PAYWALL_REQUIRED',
        message: 'Gói hiện tại không có quyền truy cập báo cáo nâng cao',
      },
    }
    const advSpy = vi.spyOn(reportService, 'getAdvancedAnalytics').mockRejectedValue(paywallErr)

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    )

    // Switch to Advanced Tab
    const advTabBtn = screen.getByText('Báo Cáo Nâng Cao')
    fireEvent.click(advTabBtn)

    await waitFor(() => {
      expect(advSpy).toHaveBeenCalled()
      // Check Paywall UI
      expect(screen.getByText('Tính Năng Dành Riêng Cho Gói Pro & Business')).toBeInTheDocument()
      expect(screen.getByText('Dữ liệu minh họa')).toBeInTheDocument()
      expect(screen.getByText('Nâng cấp ngay')).toBeInTheDocument()
    })
  })

  it('4. Tab Báo Cáo Nâng Cao: Pro organizer gets live data without paywall banner', async () => {
    vi.spyOn(reportService, 'getFinancialOverview').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalGrossRevenue: 20000000,
      totalGrossFormatted: '20 triệu',
      totalPlatformFee: 1000000,
      totalPlatformFeeFormatted: '1 triệu',
      totalNetProfit: 19000000,
      totalNetFormatted: '19 triệu',
      totalTicketsSold: 200,
      totalTicketsRefunded: 0,
      currency: 'VND',
      isSettled: false,
      createdAt: '2026-10-01T00:00:00Z',
    })
    vi.spyOn(reportService, 'getCheckInList').mockResolvedValue([])
    vi.spyOn(reportService, 'getSeatStatus').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalCapacity: 200,
      totalSold: 200,
      totalRemaining: 0,
      totalCheckedIn: 180,
      categories: [],
    })

    vi.spyOn(reportService, 'getAdvancedAnalytics').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalGrossRevenue: 20000000,
      totalGrossFormatted: '20 triệu',
      totalPlatformFee: 1000000,
      totalPlatformFeeFormatted: '1 triệu',
      totalNetProfit: 19000000,
      totalNetFormatted: '19 triệu',
      totalTicketsSold: 200,
      checkedInTickets: 180,
      checkInRatePercent: 90.0,
      averageOrderValue: 100000,
      totalCapacity: 200,
      fillRatePercent: 100.0,
      timeline: [{ date: '2026-10-01', ticketsSold: 200, grossRevenue: 20000000, platformFee: 1000000, netProfit: 19000000, grossFormatted: '20 triệu', netFormatted: '19 triệu' }],
      categoryBreakdown: [],
      hourlyCheckIns: [],
      hasAdvancedReports: true,
    })

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    )

    // Switch to Advanced Tab
    const advTabBtn = screen.getByText('Báo Cáo Nâng Cao')
    fireEvent.click(advTabBtn)

    await waitFor(() => {
      expect(screen.getByText('Phân Tích Đa Chiều Chuyên Sâu')).toBeInTheDocument()
      expect(screen.queryByText('Tính Năng Dành Riêng Cho Gói Pro & Business')).not.toBeInTheDocument()
    })
  })

  it('5. Handles 503 Service Unavailable gracefully with specific error banner', async () => {
    const error503: any = new Error('Service Unavailable')
    error503.response = { status: 503, data: { message: 'Database connection failed' } }
    vi.spyOn(reportService, 'getFinancialOverview').mockRejectedValue(error503)

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('503 Dịch vụ gián đoạn')).toBeInTheDocument()
    })
  })

  it('6. CSV Export triggers reportService.exportEventCSV via API blob', async () => {
    vi.spyOn(reportService, 'getFinancialOverview').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalGrossRevenue: 10000000,
      totalGrossFormatted: '10 triệu',
      totalPlatformFee: 500000,
      totalPlatformFeeFormatted: '500k',
      totalNetProfit: 9500000,
      totalNetFormatted: '9,5 triệu',
      totalTicketsSold: 100,
      totalTicketsRefunded: 0,
      currency: 'VND',
      isSettled: false,
      createdAt: '2026-10-01T00:00:00Z',
    })
    vi.spyOn(reportService, 'getCheckInList').mockResolvedValue([])
    vi.spyOn(reportService, 'getSeatStatus').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalCapacity: 100,
      totalSold: 100,
      totalRemaining: 0,
      totalCheckedIn: 50,
      categories: [],
    })
    vi.spyOn(reportService, 'getAdvancedAnalytics').mockResolvedValue({
      eventId: 101,
      title: 'Workshop AI Chuyên Sâu',
      totalGrossRevenue: 10000000,
      totalGrossFormatted: '10 triệu',
      totalPlatformFee: 500000,
      totalPlatformFeeFormatted: '500k',
      totalNetProfit: 9500000,
      totalNetFormatted: '9,5 triệu',
      totalTicketsSold: 100,
      checkedInTickets: 50,
      checkInRatePercent: 50.0,
      averageOrderValue: 100000,
      totalCapacity: 100,
      fillRatePercent: 100.0,
      timeline: [],
      categoryBreakdown: [],
      hourlyCheckIns: [],
      hasAdvancedReports: true,
    })

    const exportSpy = vi.spyOn(reportService, 'exportEventCSV').mockResolvedValue(undefined)

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    )

    // Switch to Advanced Tab
    const advTabBtn = screen.getByText('Báo Cáo Nâng Cao')
    fireEvent.click(advTabBtn)

    await waitFor(() => {
      const exportBtn = screen.getByText('Xuất Báo Cáo CSV')
      fireEvent.click(exportBtn)
      expect(exportSpy).toHaveBeenCalledWith(101, 'Workshop AI Chuyên Sâu')
    })
  })
})
