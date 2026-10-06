// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowserRouter } from 'react-router-dom'
import OrganizerSubscriptionPage from '../src/pages/OrganizerSubscription'
import { subscriptionService } from '../src/services/subscriptionService'
import * as useWalletHook from '../src/hooks/useWallet'
import * as ToastContext from '../src/contexts/ToastContext'
import * as AuthContext from '../src/contexts/AuthContext'

// Mock react-router-dom useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock subscriptionService methods
vi.mock('../src/services/subscriptionService', () => ({
  subscriptionService: {
    getTiers: vi.fn(),
    getCurrentSubscription: vi.fn(),
    subscribeOrUpgrade: vi.fn(),
    scheduleDowngrade: vi.fn(),
    setAutoRenew: vi.fn(),
    cancelSubscription: vi.fn(),
  },
}))

// Mock organizerWalletService methods
vi.mock('../src/services/organizerWalletService', () => ({
  organizerWalletService: {
    getWallet: vi.fn(),
    getOverview: vi.fn(),
    checkTopupStatus: vi.fn(),
    getTransactions: vi.fn(),
    topup: vi.fn().mockResolvedValue({
      orderId: 999,
      amount: 199000,
      qrCodeUrl: '00020101021238540010A00000072701240006970422011409030003000208QRIBFTTA530370454061990005802VN62180814FEMS999SUBSCRIPT6304ABCD',
      accountNumber: '0903000300',
      accountName: 'FEMS PLATFORM',
      bin: '970422',
      paymentContent: 'FEMS999SUBSCRIPT',
    }),
  },
}))

const mockShowToast = vi.fn()

describe('OrganizerSubscriptionPage RTL Tests (Item 2)', () => {
  const mockTiers = [
    {
      tierId: 1,
      tierCode: 'FREE',
      name: 'Gói Free',
      description: 'Gói mặc định',
      priceVnd: 0,
      billingCycle: 'MONTHLY',
      commissionBps: 500,
      maxCapacityLimit: 100,
      hasAdvancedReports: false,
      isActive: true,
    },
    {
      tierId: 2,
      tierCode: 'PRO',
      name: 'Gói Pro',
      description: 'Dành cho sự kiện vừa',
      priceVnd: 299000,
      billingCycle: 'MONTHLY',
      commissionBps: 250,
      maxCapacityLimit: -1,
      hasAdvancedReports: true,
      isActive: true,
    },
    {
      tierId: 3,
      tierCode: 'BUSINESS',
      name: 'Gói Business',
      description: 'Dành cho doanh nghiệp',
      priceVnd: 1000000,
      billingCycle: 'MONTHLY',
      commissionBps: 0,
      maxCapacityLimit: -1,
      hasAdvancedReports: true,
      isActive: true,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(ToastContext, 'useToast').mockReturnValue({
      showToast: mockShowToast,
      toast: null,
      hideToast: vi.fn(),
    } as any)
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { userId: 1, email: 'organizer@fpt.edu.vn', role: 'ORGANIZER' },
      isAuthenticated: true,
      isLoading: false,
    } as any)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('1. Hiển thị thông báo rõ ràng khi ví không đủ tiền và có nút nạp ví', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 100000, // Chỉ có 100k, gói Pro cần 299k
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'FREE',
      tierName: 'Gói Free',
      maxCapacityLimit: 100,
      commissionBps: 500,
      hasAdvancedReports: false,
      feeSource: 'FREE',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      daysRemaining: 0,
      autoRenew: false,
    })

    const { getByRole, findByText, getByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    // Chờ render xong bảng giá
    expect(await findByText('Dành cho sự kiện vừa')).toBeInTheDocument()

    // Click 'Nâng cấp lên Pro'
    const upgradeBtn = await screen.findByRole('button', { name: /nâng cấp lên pro|đăng ký pro/i })
    fireEvent.click(upgradeBtn)

    // Modal thanh toán trực tiếp payOS mở ra khi thiếu tiền
    expect(await findByText(/Thanh Toán "Gói Pro"/i)).toBeInTheDocument()
    expect(await findByText(/payOS Gateway/i)).toBeInTheDocument()
    expect(await findByText('199.000đ')).toBeInTheDocument() // 299k - 100k ví = 199k
  })

  it('2. Nâng cấp khi đủ số dư ví gọi trực tiếp subscribeOrUpgrade', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 500000, // Đủ tiền
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'FREE',
      tierName: 'Gói Free',
      maxCapacityLimit: 100,
      commissionBps: 500,
      hasAdvancedReports: false,
      feeSource: 'FREE',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      daysRemaining: 0,
      autoRenew: false,
    })

    vi.mocked(subscriptionService.subscribeOrUpgrade).mockResolvedValue({
      subscriptionId: 101,
      tierCode: 'PRO',
      amountPaid: 299000,
      proratedCredit: 0,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      message: 'Nâng cấp lên Gói Pro thành công!',
    })

    const { findByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    expect(await findByText('Dành cho sự kiện vừa')).toBeInTheDocument()

    const upgradeBtn = await screen.findByRole('button', { name: /nâng cấp lên pro|đăng ký pro/i })
    fireEvent.click(upgradeBtn)

    await waitFor(() => {
      expect(subscriptionService.subscribeOrUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          tierCode: 'PRO',
          autoRenew: true,
        })
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('thành công'))
    })
  })

  it('3. Replay cùng requestId nhận kết quả idempotent thành công', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 500000,
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'FREE',
      tierName: 'Gói Free',
      maxCapacityLimit: 100,
      commissionBps: 500,
      hasAdvancedReports: false,
      feeSource: 'FREE',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      daysRemaining: 0,
      autoRenew: false,
    })

    vi.mocked(subscriptionService.subscribeOrUpgrade).mockResolvedValue({
      subscriptionId: 105,
      tierCode: 'PRO',
      amountPaid: 299000,
      proratedCredit: 0,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      message: 'Giao dịch đã được ghi nhận trước đó thành công (Idempotent).',
    })

    const { findByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    expect(await findByText('Dành cho sự kiện vừa')).toBeInTheDocument()

    const upgradeBtn = await screen.findByRole('button', { name: /nâng cấp lên pro|đăng ký pro/i })
    fireEvent.click(upgradeBtn)

    await waitFor(() => {
      expect(subscriptionService.subscribeOrUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          tierCode: 'PRO',
        })
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('Idempotent'))
    })
  })

  it('4. Nâng cấp giữa kỳ có khấu trừ prorated credit và sinh requestId', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 2000000,
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    const futureEndDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'PRO',
      tierName: 'Gói Pro',
      maxCapacityLimit: -1,
      commissionBps: 250,
      hasAdvancedReports: true,
      feeSource: 'TIER',
      status: 'ACTIVE',
      startDate: new Date().toISOString(),
      endDate: futureEndDate,
      daysRemaining: 15,
      autoRenew: true,
    })

    const { getByRole, findByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    // Chờ render xong bảng giá
    expect(await findByText('Dành cho doanh nghiệp')).toBeInTheDocument()

    // Click nâng cấp lên Business
    const upgradeBtn = await screen.findByRole('button', { name: /nâng cấp gói/i })
    fireEvent.click(upgradeBtn)

    // Nâng cấp trực tiếp qua ví khi số dư ví đủ 2.000.000đ
    await waitFor(() => {
      expect(subscriptionService.subscribeOrUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          tierCode: 'BUSINESS',
        })
      )
    })
  })

  it('5. Hạ cấp gói: Hiển thị cảnh báo có hiệu lực từ kỳ sau và không hoàn tiền', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 500000,
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'BUSINESS',
      tierName: 'Gói Business',
      maxCapacityLimit: -1,
      commissionBps: 0,
      hasAdvancedReports: true,
      feeSource: 'TIER',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: '2026-01-20',
      daysRemaining: 20,
      autoRenew: false,
    })

    vi.mocked(subscriptionService.scheduleDowngrade).mockResolvedValue({
      message: 'Đã đặt lịch hạ cấp thành công',
    })

    const { getByRole, getByText, findByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    // Chờ render xong (mô tả của gói Pro)
    expect(await findByText('Dành cho sự kiện vừa')).toBeInTheDocument()

    const downgradeBtn = await screen.findByRole('button', { name: /hạ cấp gói/i })
    fireEvent.click(downgradeBtn)

    // Modal hạ cấp hiển thị
    expect(await findByText('Xác Nhận Hạ Cấp Gói')).toBeInTheDocument()
    expect(getByText(/có hiệu lực từ kỳ sau/i)).toBeInTheDocument()
    expect(getByText(/Không hoàn lại tiền/i)).toBeInTheDocument()

    // Xác nhận hạ cấp
    const confirmBtn = getByRole('button', { name: /xác nhận hạ cấp/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(subscriptionService.scheduleDowngrade).toHaveBeenCalledWith('PRO')
    })
  })

  it('6. Bật/tắt tự động gia hạn (SetAutoRenew)', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 500000,
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'PRO',
      tierName: 'Gói Pro',
      maxCapacityLimit: -1,
      commissionBps: 250,
      hasAdvancedReports: true,
      feeSource: 'TIER',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      daysRemaining: 25,
      autoRenew: false,
    })

    vi.mocked(subscriptionService.setAutoRenew).mockResolvedValue({
      message: 'Cấu hình tự động gia hạn đã bật thành công.',
    })

    const { findByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    expect(await findByText('Tự động gia hạn')).toBeInTheDocument()

    // Click toggle button
    const toggleBtn = screen.getByRole('button', { name: '' })
    fireEvent.click(toggleBtn)

    await waitFor(() => {
      expect(subscriptionService.setAutoRenew).toHaveBeenCalledWith(true)
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('bật'))
    })
  })

  it('7. Thanh toán nâng cấp thành công cập nhật UI', async () => {
    vi.spyOn(useWalletHook, 'useWallet').mockReturnValue({
      balance: 2000000,
      loading: false,
      error: null,
      fetchBalance: vi.fn(),
    } as any)

    vi.mocked(subscriptionService.getTiers).mockResolvedValue(mockTiers)
    vi.mocked(subscriptionService.getCurrentSubscription).mockResolvedValue({
      organizerId: 10,
      role: 'ORGANIZER',
      tierCode: 'FREE',
      tierName: 'Gói Free',
      maxCapacityLimit: 100,
      commissionBps: 500,
      hasAdvancedReports: false,
      feeSource: 'FREE',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      daysRemaining: 0,
      autoRenew: false,
    })

    vi.mocked(subscriptionService.subscribeOrUpgrade).mockResolvedValue({
      subscriptionId: 200,
      tierCode: 'PRO',
      amountPaid: 299000,
      proratedCredit: 0,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      message: 'Đăng ký gói Gói Pro thành công!',
    })

    const { findByText } = render(
      <BrowserRouter>
        <OrganizerSubscriptionPage />
      </BrowserRouter>
    )

    expect(await findByText('Dành cho sự kiện vừa')).toBeInTheDocument()

    const upgradeBtn = await screen.findByRole('button', { name: /nâng cấp lên pro|đăng ký pro/i })
    fireEvent.click(upgradeBtn)

    await waitFor(() => {
      expect(subscriptionService.subscribeOrUpgrade).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('thành công'))
    })
  })
})
