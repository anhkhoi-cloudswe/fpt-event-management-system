// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import AdminFeeManagement from '../src/components/admin/AdminFeeManagement'
import * as ToastContext from '../src/contexts/ToastContext'

const mockShowToast = vi.fn()

describe('AdminFeeManagement RTL Tests (Item 4 Phase & Admin UI)', () => {
  const mockTiers = [
    {
      tierId: 1,
      tierCode: 'FREE',
      name: 'Gói Free',
      description: 'Gói cơ bản',
      priceVnd: 0,
      billingCycle: 'MONTHLY',
      commissionBps: 500,
      maxCapacityLimit: 100,
      hasAdvancedReports: false,
      isActive: true,
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      tierId: 2,
      tierCode: 'PRO',
      name: 'Gói Pro',
      description: 'Gói nâng cao',
      priceVnd: 299000,
      billingCycle: 'MONTHLY',
      commissionBps: 250,
      maxCapacityLimit: -1,
      hasAdvancedReports: true,
      isActive: true,
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ]

  const mockRolePolicies = [
    {
      roleCode: 'SCHOOL_ORGANIZER',
      name: 'Ban Tổ Chức Trường',
      description: 'Chính sách ưu đãi cho trường',
      commissionBps: 250,
      maxCapacityLimit: -1,
      hasAdvancedReports: true,
      isActive: true,
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ]

  const mockOverrides = [
    {
      overrideId: 101,
      organizerId: 42,
      organizerName: 'CLB Sự Kiện FPT',
      commissionBps: 150,
      reason: 'Tài trợ CLB xuất sắc',
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-12-31T23:59:59Z',
      createdBy: 1,
      createdAt: '2026-10-01T00:00:00Z',
    },
  ]

  const mockParams = [
    {
      paramKey: 'FIXED_FEE_PER_TICKET',
      paramValue: '1000',
      description: 'Phí cố định mỗi vé (VNĐ)',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      paramKey: 'FIXED_FEE_MIN_TICKET_PRICE',
      paramValue: '20000',
      description: 'Ngưỡng giá vé tối thiểu áp dụng phí cố định (VNĐ)',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ]

  const mockAuditLogs = {
    logs: [
      {
        logId: 1,
        targetEntity: 'SYSTEM_PARAM',
        targetId: 'FIXED_FEE_PER_TICKET',
        action: 'UPDATE',
        oldValue: '500',
        newValue: '1000',
        reason: 'Cập nhật trượt giá năm học mới',
        changedByName: 'Admin Hệ Thống',
        changedBy: 1,
        createdAt: '2026-10-02T10:00:00Z',
      },
    ],
    totalRecords: 1,
  }

  const mockFinance = {
    totalGrossRevenue: 50000000,
    totalCommissionCollected: 2500000,
    totalNetPaidToOrganizers: 47500000,
    totalReceiptsCount: 150,
    totalRefundedAmount: 0,
    totalSubscriptionRevenue: 598000,
    pendingPayoutAmount: 1200000,
    pendingPayoutCount: 3,
  }

  let originalFetch: typeof global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(ToastContext, 'useToast').mockReturnValue({
      showToast: mockShowToast,
    } as any)

    originalFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      const u = typeof url === 'string' ? url : ''
      const method = opts?.method || 'GET'

      if (u.includes('/api/v1/admin/subscription-tiers')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockTiers,
        } as Response)
      }
      if (u.includes('/api/v1/admin/role-policies')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRolePolicies,
        } as Response)
      }
      if (u.includes('/api/v1/admin/fee-overrides')) {
        if (method === 'POST') {
          const body = JSON.parse(opts?.body || '{}')
          if (body.commissionBps > 500 && !body.confirmHigher) {
            return Promise.resolve({
              ok: false,
              status: 400,
              json: async () => ({
                error: 'CONFIRMATION_REQUIRED: Mức phí 8.00% cao hơn mức chuẩn của gói hiện tại (5.00%). Vui lòng xác nhận.',
              }),
            } as Response)
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: 'Tạo ưu đãi thành công' }),
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockOverrides,
        } as Response)
      }
      if (u.includes('/api/v1/admin/system-parameters')) {
        if (method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: 'Cập nhật tham số thành công' }),
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockParams,
        } as Response)
      }
      if (u.includes('/api/v1/admin/fee-audit-logs')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAuditLogs,
        } as Response)
      }
      if (u.includes('/api/v1/admin/finance/overview')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockFinance,
        } as Response)
      }
      if (u.includes('/api/v1/admin/fee-sandbox/simulate')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            grossAmount: 100000,
            commissionAmount: 2500,
            fixedFeeTotal: 1000,
            netAmount: 96500,
            commissionBps: 250,
            feeSource: 'ROLE_POLICY: SCHOOL_ORGANIZER',
            tierCode: 'SCHOOL_ORGANIZER',
            configVersion: '1.0',
          }),
        } as Response)
      }
      if (u.includes('/api/v1/admin/users/school-role')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: 'Đã cấp quyền School Organizer' }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response)
    })
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  it('1. Hiển thị danh sách Gói Dịch Vụ và Phí Hoa Hồng chuẩn ban đầu', async () => {
    render(<AdminFeeManagement />)

    await waitFor(() => {
      expect(screen.getByText('Cấu hình Gói Dịch Vụ Organizer')).toBeInTheDocument()
      expect(screen.getByText('Gói Free')).toBeInTheDocument()
      expect(screen.getByText('Gói Pro')).toBeInTheDocument()
      expect(screen.getByText('5.00%')).toBeInTheDocument()
      expect(screen.getByText('2.50%')).toBeInTheDocument()
    })
  })

  it('2. Sửa tham số phí cố định (FIXED_FEE_PER_TICKET) và kiểm tra bắt buộc lý do (Audit Reason)', async () => {
    render(<AdminFeeManagement />)

    // Chuyển sang tab Tham số hệ thống
    const paramsTab = await screen.findByRole('button', { name: /Tham số hệ thống/i })
    fireEvent.click(paramsTab)

    await waitFor(() => {
      expect(screen.getByText('FIXED_FEE_PER_TICKET')).toBeInTheDocument()
      expect(screen.getByText('FIXED_FEE_MIN_TICKET_PRICE')).toBeInTheDocument()
    })

    // Bấm nút Chỉnh sửa cho FIXED_FEE_PER_TICKET
    const editBtns = screen.getAllByRole('button', { name: /Chỉnh sửa/i })
    expect(editBtns.length).toBeGreaterThan(0)
    fireEvent.click(editBtns[0])

    await waitFor(() => {
      expect(screen.getByText(/Cập nhật: FIXED_FEE_PER_TICKET/i)).toBeInTheDocument()
    })

    // Thử bấm Lưu thay đổi khi chưa nhập lý do
    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i })
    fireEvent.click(saveBtn)

    // Kiểm tra toast thông báo lỗi bắt buộc lý do
    expect(mockShowToast).toHaveBeenCalledWith('error', 'Vui lòng nhập lý do')

    // Nhập lý do hợp lệ và lưu
    const textarea = document.querySelector('textarea')
    expect(textarea).not.toBeNull()
    if (textarea) fireEvent.change(textarea, { target: { value: 'Điều chỉnh trượt giá năm 2026' } })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/system-parameters'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('Điều chỉnh trượt giá năm 2026'),
        })
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Cập nhật tham số thành công')
    })
  })

  it('3. Tab Override: Cảnh báo khi nhập phí override cao hơn mức của gói hiện tại', async () => {
    render(<AdminFeeManagement />)

    // Chuyển sang tab Ưu đãi Organizer
    const overrideTab = await screen.findByRole('button', { name: /Ʈu đãi Organizer/i })
    fireEvent.click(overrideTab)

    await waitFor(() => {
      expect(screen.getByText('Tài trợ CLB xuất sắc')).toBeInTheDocument()
      expect(screen.getByText('1.50%')).toBeInTheDocument()
    })

    // Bấm nút Tạo ưu đãi mới
    const addOverrideBtn = screen.getByRole('button', { name: /Tạo ưu đãi mới/i })
    fireEvent.click(addOverrideBtn)

    await waitFor(() => {
      expect(screen.getByText('Tạo ưu đãi hoa hồng riêng')).toBeInTheDocument()
    })

    // Nhập thông tin override với mức phí cao (800 BPS = 8%)
    const orgIdInput = screen.getByPlaceholderText('Ví dụ: 18')
    const bpsInput = screen.getByPlaceholderText('Ví dụ: 200 = 2%')
    const reasonInput = screen.getByPlaceholderText(/Ví dụ: Ʈu đãi đối tác chiến lược Q4/i)
    const dateInputs = document.querySelectorAll('input[type="datetime-local"]')

    fireEvent.change(orgIdInput, { target: { value: '42' } })
    fireEvent.change(bpsInput, { target: { value: '800' } })
    if (dateInputs.length >= 2) {
      fireEvent.change(dateInputs[0], { target: { value: '2026-10-01T00:00' } })
      fireEvent.change(dateInputs[1], { target: { value: '2026-12-31T23:59' } })
    }
    fireEvent.change(reasonInput, { target: { value: 'Cố ý đặt mức cao hơn' } })

    // Bấm Tạo ưu đãi
    const submitBtn = screen.getByRole('button', { name: 'Tạo ưu đãi' })
    fireEvent.click(submitBtn)

    // Kiểm tra cảnh báo xuất hiện trong modal
    await waitFor(() => {
      expect(screen.getByText('Yêu cầu xác nhận')).toBeInTheDocument()
      expect(screen.getByText(/cao hơn mức chuẩn của gói hiện tại/i)).toBeInTheDocument()
    })

    // Bấm nút Xác nhận tạo sau khi đã có cảnh báo
    const confirmHigherBtn = screen.getByRole('button', { name: /Xác nhận tạo/i })
    fireEvent.click(confirmHigherBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/fee-overrides'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"confirmHigher":true'),
        })
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Tạo ưu đãi hoa hồng thành công')
    })
  })

  it('4. Gán và Thu hồi vai trò School Organizer (2.5% commission, full report access)', async () => {
    render(<AdminFeeManagement />)

    // Chuyển sang tab Chính sách Role
    const roleTab = await screen.findByRole('button', { name: /Chính sách Role/i })
    fireEvent.click(roleTab)

    await waitFor(() => {
      expect(screen.getByText('Ban Tổ Chức Trường')).toBeInTheDocument()
    })

    // Bấm nút Cấp / Thu hồi Role
    const assignBtn = screen.getByRole('button', { name: /Cấp \/ Thu hồi Role/i })
    fireEvent.click(assignBtn)

    await waitFor(() => {
      expect(screen.getByText('Cấp / Thu hồi quyền School Organizer')).toBeInTheDocument()
    })

    // Nhập User ID và lý do
    const userIdInput = screen.getByPlaceholderText('Ví dụ: 18')
    const reasonInput = screen.getByPlaceholderText(/Ví dụ: Cấp quyền cho cán bộ phòng HSSV/i)

    fireEvent.change(userIdInput, { target: { value: '88' } })
    fireEvent.change(reasonInput, { target: { value: 'Bổ nhiệm Chủ nhiệm CLB F-Code' } })

    // Bấm Cấp quyền
    const confirmBtn = screen.getByRole('button', { name: /^Cấp quyền$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/users/school-role'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"userId":88'),
        })
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Đã cấp quyền School Organizer')
    })
  })

  it('5. Sandbox mô phỏng tính phí: Hiển thị Breakdown phí cố định + phần trăm chính xác', async () => {
    render(<AdminFeeManagement />)

    // Chuyển sang tab Sandbox
    const sandboxTab = await screen.findByRole('button', { name: /Sandbox phí/i })
    fireEvent.click(sandboxTab)

    await waitFor(() => {
      expect(screen.getByText('Sandbox Mô phỏng Tính Phí')).toBeInTheDocument()
    })

    // Nhập thông số tính thử
    const orgInput = screen.getByPlaceholderText('Ví dụ: 18')
    const grossInput = screen.getByPlaceholderText('Ví dụ: 500000')
    const ticketCountInput = screen.getByPlaceholderText('Ví dụ: 1')

    fireEvent.change(orgInput, { target: { value: '42' } })
    fireEvent.change(grossInput, { target: { value: '100000' } })
    fireEvent.change(ticketCountInput, { target: { value: '1' } })

    // Bấm nút Mô phỏng ngay
    const calcBtn = screen.getByRole('button', { name: /Mô phỏng ngay/i })
    fireEvent.click(calcBtn)

    // Kiểm tra kết quả hiển thị
    await waitFor(() => {
      expect(screen.getByText('Kết quả Sandbox')).toBeInTheDocument()
      expect(screen.getByText('96.500 ₫')).toBeInTheDocument() // Lợi nhuận thuần
      expect(screen.getByText('2.500 ₫')).toBeInTheDocument() // Phí sàn
      expect(screen.getByText('1.000 ₫')).toBeInTheDocument() // Phí cố định
    })
  })

  it('6. Tab Nhật Ký Audit Log: Hiển thị đầy đủ lịch sử thay đổi và phân loại', async () => {
    render(<AdminFeeManagement />)

    // Chuyển sang tab Nhật ký kiểm toán
    const auditTab = await screen.findByRole('button', { name: /Nhật ký kiểm toán/i })
    fireEvent.click(auditTab)

    await waitFor(() => {
      expect(screen.getByText('Nhật ký kiểm toán biểu phí')).toBeInTheDocument()
      expect(screen.getByText('Cập nhật trượt giá năm học mới')).toBeInTheDocument()
      expect(screen.getByText('Admin Hệ Thống')).toBeInTheDocument()
      expect(screen.getByText('SYSTEM PARAM')).toBeInTheDocument()
    })
  })
})
