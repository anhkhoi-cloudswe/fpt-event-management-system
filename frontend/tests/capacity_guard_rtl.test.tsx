// @vitest-environment jsdom
import React, { useState } from 'react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { UpgradePlanModal } from '../src/components/UpgradePlanModal'
import { useCapacityGuard } from '../src/hooks/useCapacityGuard'

// Mock react-router-dom useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock api client
vi.mock('../src/config/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

// Mock getOrganizerLimits service
vi.mock('../src/services/organizerLimitsService', () => ({
  getOrganizerLimits: vi.fn(),
}))

// Mock AuthContext
let mockUserRole = 'ORGANIZER'
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { role: mockUserRole },
  }),
}))

import { getOrganizerLimits } from '../src/services/organizerLimitsService'

// Helper Component simulating Event Creation/Edit Form with useCapacityGuard
function MockEventForm({
  onSuccessSubmit,
}: {
  onSuccessSubmit?: () => void
}) {
  const {
    limitsError,
    isSubmitBlocked,
    modalOpen,
    setModalOpen,
    modalState,
    checkCapacityExceeded,
    handleApiPlanRequiredError,
  } = useCapacityGuard()

  const [capacityInput, setCapacityInput] = useState('100')
  const [existingTickets] = useState(80)
  const [newTickets, setNewTickets] = useState(0)

  const handleCapacityChange = (val: string) => {
    setCapacityInput(val)
    const num = parseInt(val) || 0
    checkCapacityExceeded(num, existingTickets + newTickets, 0)
  }

  const handleNewTicketChange = (val: number) => {
    setNewTickets(val)
    const cap = parseInt(capacityInput) || 0
    checkCapacityExceeded(cap, existingTickets + val, 0)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitBlocked) return

    const cap = parseInt(capacityInput) || 0
    const totalTickets = existingTickets + newTickets
    if (checkCapacityExceeded(cap, totalTickets, 0)) return

    if (onSuccessSubmit) onSuccessSubmit()
  }

  const triggerApi403 = () => {
    handleApiPlanRequiredError({
      error: 'PLAN_REQUIRED',
      requested: 150,
      maxAllowed: 100,
      currentTier: 'FREE',
    })
  }

  return (
    <div>
      {limitsError && <div role="alert">{limitsError}</div>}
      <form onSubmit={handleSubmit}>
        <label htmlFor="capacity-input">Sức chứa sự kiện</label>
        <input
          id="capacity-input"
          type="number"
          value={capacityInput}
          onChange={(e) => handleCapacityChange(e.target.value)}
        />

        <label htmlFor="new-tickets-input">Vé mới bổ sung</label>
        <input
          id="new-tickets-input"
          type="number"
          value={newTickets}
          onChange={(e) => handleNewTicketChange(parseInt(e.target.value) || 0)}
        />

        <button type="submit" disabled={isSubmitBlocked}>
          Gửi thông tin
        </button>
      </form>

      <button type="button" onClick={triggerApi403}>
        Simulate API 403
      </button>

      <UpgradePlanModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        requestedCapacity={modalState.requestedCapacity}
        currentTier={modalState.currentTier}
        maxAllowed={modalState.maxAllowed}
      />
    </div>
  )
}

describe('React Testing Library Component Tests for Capacity Guard & Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserRole = 'ORGANIZER'
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('TC1: UpgradePlanModal renders accessibility attributes (role="dialog", aria-modal="true", Esc key, "Để sau" button)', () => {
    const handleClose = vi.fn()
    const { rerender } = render(
      <UpgradePlanModal
        isOpen={true}
        onClose={handleClose}
        requestedCapacity={120}
        currentTier="FREE"
        maxAllowed={100}
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    // Click "Để sau" button
    const deferButton = screen.getByText('Để sau')
    fireEvent.click(deferButton)
    expect(handleClose).toHaveBeenCalledTimes(1)

    // Press Esc key
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(2)

    // Rerender closed
    rerender(
      <UpgradePlanModal
        isOpen={false}
        onClose={handleClose}
        requestedCapacity={120}
        currentTier="FREE"
        maxAllowed={100}
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    console.log('✅ RTL TC1 Pass: UpgradePlanModal accessibility & close actions verified')
  })

  test('TC2: Free tier nhập 100 -> KHÔNG mở modal. Nhập 101 -> Modal MỞ', async () => {
    vi.mocked(getOrganizerLimits).mockResolvedValue({
      data: {
        organizerId: 1,
        role: 'ORGANIZER',
        tierCode: 'FREE',
        maxCapacityLimit: 100,
        hasAdvancedReports: false,
        commissionBps: 500,
        feeSource: 'TIER',
        feeConfigVersion: 1,
        gatingEnabled: true,
      },
      error: null,
    })

    render(<MockEventForm />)

    // Wait for /limits to finish loading
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Gửi thông tin/i })).not.toBeDisabled()
    })

    const input = screen.getByLabelText('Sức chứa sự kiện')

    // Type 100 -> Modal not present
    fireEvent.change(input, { target: { value: '100' } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Type 101 -> Modal appears
    fireEvent.change(input, { target: { value: '101' } })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/101/)).toBeInTheDocument()
    })

    console.log('✅ RTL TC2 Pass: Free nhập 100 (không modal), 101 (modal mở)')
  })

  test('TC3: Đang nhập 101 (modal mở), sửa lại thành 90 -> Modal TỰ ĐÓNG', async () => {
    vi.mocked(getOrganizerLimits).mockResolvedValue({
      data: {
        organizerId: 1,
        role: 'ORGANIZER',
        tierCode: 'FREE',
        maxCapacityLimit: 100,
        hasAdvancedReports: false,
        commissionBps: 500,
        feeSource: 'TIER',
        feeConfigVersion: 1,
        gatingEnabled: true,
      },
      error: null,
    })

    render(<MockEventForm />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Gửi thông tin/i })).not.toBeDisabled()
    })

    const input = screen.getByLabelText('Sức chứa sự kiện')

    // 101 -> Open
    fireEvent.change(input, { target: { value: '101' } })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Change to 90 -> Closed
    fireEvent.change(input, { target: { value: '90' } })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    console.log('✅ RTL TC3 Pass: Nhập 101 (modal hiện) -> sửa về 90 (modal tự đóng)')
  })

  test('TC4: SCHOOL_ORGANIZER nhập 1000 -> KHÔNG mở modal', async () => {
    mockUserRole = 'SCHOOL_ORGANIZER'
    vi.mocked(getOrganizerLimits).mockResolvedValue({
      data: {
        organizerId: 2,
        role: 'SCHOOL_ORGANIZER',
        tierCode: 'SCHOOL',
        maxCapacityLimit: -1,
        hasAdvancedReports: true,
        commissionBps: 0,
        feeSource: 'ROLE',
        feeConfigVersion: 1,
        gatingEnabled: true,
      },
      error: null,
    })

    render(<MockEventForm />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Gửi thông tin/i })).not.toBeDisabled()
    })

    const input = screen.getByLabelText('Sức chứa sự kiện')
    fireEvent.change(input, { target: { value: '1000' } })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    console.log('✅ RTL TC4 Pass: SCHOOL_ORGANIZER nhập 1000 -> không modal')
  })

  test('TC5: Mô phỏng API 403 PLAN_REQUIRED -> Modal MỞ', async () => {
    vi.mocked(getOrganizerLimits).mockResolvedValue({
      data: {
        organizerId: 1,
        role: 'ORGANIZER',
        tierCode: 'FREE',
        maxCapacityLimit: 100,
        hasAdvancedReports: false,
        commissionBps: 500,
        feeSource: 'TIER',
        feeConfigVersion: 1,
        gatingEnabled: true,
      },
      error: null,
    })

    render(<MockEventForm />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Gửi thông tin/i })).not.toBeDisabled()
    })

    const triggerBtn = screen.getByText('Simulate API 403')
    fireEvent.click(triggerBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/150/)).toBeInTheDocument()
    })

    console.log('✅ RTL TC5 Pass: API 403 PLAN_REQUIRED -> modal mở')
  })

  test('TC6: /limits bị lỗi -> Cảnh báo hiển thị & Nút Submit bị VÔ HIỆU', async () => {
    vi.mocked(getOrganizerLimits).mockResolvedValue({
      data: null,
      error: 'Network Timeout /limits',
    })

    render(<MockEventForm />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Không thể xác thực hạn mức/i)
      expect(screen.getByRole('button', { name: /Gửi thông tin/i })).toBeDisabled()
    })

    console.log('✅ RTL TC6 Pass: /limits lỗi -> alert hiển thị & submit button bị vô hiệu')
  })

  test('TC7: Kiểm tra sửa một phần (Vé hiện có 80 + vé mới 30 = 110 > 100) -> Modal MỞ', async () => {
    vi.mocked(getOrganizerLimits).mockResolvedValue({
      data: {
        organizerId: 1,
        role: 'ORGANIZER',
        tierCode: 'FREE',
        maxCapacityLimit: 100,
        hasAdvancedReports: false,
        commissionBps: 500,
        feeSource: 'TIER',
        feeConfigVersion: 1,
        gatingEnabled: true,
      },
      error: null,
    })

    render(<MockEventForm />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Gửi thông tin/i })).not.toBeDisabled()
    })

    const ticketInput = screen.getByLabelText('Vé mới bổ sung')
    fireEvent.change(ticketInput, { target: { value: '30' } }) // 80 existing + 30 new = 110 > 100

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/110/)).toBeInTheDocument()
    })

    console.log('✅ RTL TC7 Pass: Sửa một phần (80 vé hiện có + 30 vé mới = 110) -> modal mở')
  })

  test('TC8: Gõ 500 khi /limits đang tải => Submit bị CHẶN', async () => {
    // Return pending promise to keep /limits in loading state
    vi.mocked(getOrganizerLimits).mockImplementation(() => new Promise(() => {}))

    render(<MockEventForm />)

    // Button disabled immediately because isLoading === true
    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i })
    expect(submitBtn).toBeDisabled()

    const input = screen.getByLabelText('Sức chứa sự kiện')
    fireEvent.change(input, { target: { value: '500' } })

    // Button remains disabled while loading
    expect(submitBtn).toBeDisabled()
    console.log('✅ RTL TC8 Pass: Gõ 500 khi /limits đang tải -> submit button bị vô hiệu / bị chặn')
  })
})
