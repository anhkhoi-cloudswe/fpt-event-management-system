import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Calendar, Clock, CreditCard, MapPin, ShieldCheck, X, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { SeatGrid, type Seat } from '../../components/common/SeatGrid'
import type { EventDetail } from '../../types/event'

type Ticket = {
  categoryTicketId: number
  name: string
  description?: string | null
  price: number
  maxQuantity: number
  remaining?: number
  status: string
}

type ApiSeat = {
  seatId?: number | string
  seat_id?: number | string
  seatCode?: string
  seat_code?: string
  rowNo?: string
  row_no?: string
  seatRow?: string
  seat_row?: string
  colNo?: string | number
  col_no?: string | number
  seatColumn?: number | string
  seat_column?: number | string
  status?: string
  seatType?: string
  seat_type?: string
  categoryTicketId?: number | string | null
  category_ticket_id?: number | string | null
  categoryName?: string | null
  category_name?: string | null
  areaId?: number | string
  area_id?: number | string
}

type EventDetailExtras = EventDetail & {
  id?: number
  organizerAvatar?: string | null
  organizerAvatarUrl?: string | null
  organizer_avatar?: string | null
  organizer_avatar_url?: string | null
  bannerImg?: string | null
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const normalizeSeat = (rawSeat: ApiSeat, fallbackAreaId?: number): Seat | null => {
  const seatId = toNumber(rawSeat.seatId ?? rawSeat.seat_id)
  const seatCode = (rawSeat.seatCode ?? rawSeat.seat_code ?? '').toString()
  const areaId = toNumber(rawSeat.areaId ?? rawSeat.area_id) ?? fallbackAreaId

  if (!seatId || !seatCode || !areaId) return null

  const rawStatus = String(rawSeat.status ?? '').trim().toUpperCase()
  let status = 'ACTIVE'
  if (['BOOKED', 'CHECKED_IN', 'OCCUPIED'].includes(rawStatus)) status = 'BOOKED'
  if (['PENDING', 'HOLD', 'RESERVED'].includes(rawStatus)) status = 'PENDING'

  return {
    seatId,
    seatCode,
    rowNo: (rawSeat.rowNo ?? rawSeat.row_no) as string | undefined,
    seatRow: (rawSeat.seatRow ?? rawSeat.seat_row) as string | undefined,
    colNo: rawSeat.colNo != null ? String(rawSeat.colNo) : rawSeat.col_no != null ? String(rawSeat.col_no) : undefined,
    seatColumn: toNumber(rawSeat.seatColumn ?? rawSeat.seat_column),
    status,
    seatType: (rawSeat.seatType ?? rawSeat.seat_type) as string | undefined,
    categoryTicketId: toNumber(rawSeat.categoryTicketId ?? rawSeat.category_ticket_id),
    categoryName: (rawSeat.categoryName ?? rawSeat.category_name ?? undefined) as string | undefined,
    areaId,
  }
}

const formatDateTime = (value?: string, lang?: 'vi' | 'en') => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} đ`

const normalizeText = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
const normalizePhone = (value?: string | null) => (value || '').replace(/\D/g, '')
const isValidVietnamPhone = (value: string) => /^(0[35789])[0-9]{8}$/.test(normalizePhone(value))

const resolveWalletBalance = (user: ReturnType<typeof useAuth>['user']) => {
  if (!user) return 0
  if (typeof user.wallet === 'number') return user.wallet
  if (typeof user.wallet?.balance === 'number') return user.wallet.balance
  return user.balance ?? user.wallet_balance ?? 0
}

export default function PublicEventPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token, isAuthenticated, loading: authLoading, isRefreshing, refreshUser, currentLanguage } = useAuth()
  const pageLanguage = currentLanguage || 'en'

  const [pendingOrderDetails, setPendingOrderDetails] = useState<{
    pendingBillId: number
    seats: string[]
    seatIds: number[]
    eventId: number
    categoryTicketId: number
    remainingSeconds: number
    message: string
  } | null>(null)

  const t = {
    restoreTitle: pageLanguage === 'en' ? 'Restore payment?' : 'Khôi phục thanh toán?',
    restoreSubtitle: pageLanguage === 'en' ? 'System detected an incomplete transaction' : 'Hệ thống phát hiện giao dịch đang dở dang',
    restoreRemaining: pageLanguage === 'en' ? 'Remaining: {0}' : 'Còn lại: {0}',
    restoreWhatNext: pageLanguage === 'en' ? 'What would you like to do next?' : 'Bạn muốn làm gì tiếp theo?',
    restoreWarningTitle: pageLanguage === 'en' ? '⚠️ Safety notice:' : '⚠️ Lưu ý an toàn:',
    restoreWarningDesc: pageLanguage === 'en' ? '• Selecting "Cancel old & book new" will release your old seats and add a penalty point to your failed checkout count.' : '• Nhấn "Hủy đơn cũ & Đặt ghế mới" sẽ giải phóng ghế cũ của bạn và cộng 1 điểm phạt failed checkout count.',
    btnResumeOld: pageLanguage === 'en' ? 'Continue old payment' : 'Tiếp tục thanh toán đơn cũ',
    btnCancelAndNew: pageLanguage === 'en' ? 'Cancel old & book new' : 'Hủy bỏ đơn cũ & Đặt ghế mới',
    btnCloseDialog: pageLanguage === 'en' ? 'Close dialog' : 'Đóng hộp thoại',
    eventDetails: pageLanguage === 'en' ? 'Event details' : 'Chi tiết sự kiện',
    organizedBy: pageLanguage === 'en' ? 'Organized by' : 'Tổ chức bởi',
    ticketTiers: pageLanguage === 'en' ? 'Ticket tiers' : 'Hạng vé',
    seatSelection: pageLanguage === 'en' ? 'Seat selection' : 'Chọn vị trí ghế',
    reviewOrderTitle: pageLanguage === 'en' ? 'Review order' : 'Xác nhận đơn',
    attendeeInformation: pageLanguage === 'en' ? 'Attendee information' : 'Thông tin người tham dự',
    fullName: pageLanguage === 'en' ? 'Full name' : 'Họ và tên',
    fullNamePlaceholder: pageLanguage === 'en' ? 'Enter account full name' : 'Nhập đúng họ tên tài khoản',
    phone: pageLanguage === 'en' ? 'Phone' : 'Số điện thoại',
    phonePlaceholderSaved: pageLanguage === 'en' ? 'Enter saved phone number' : 'Nhập số điện thoại đã lưu',
    phonePlaceholderNew: pageLanguage === 'en' ? 'Enter new phone number' : 'Nhập số điện thoại mới',
    phoneMismatch: pageLanguage === 'en' ? 'Phone number does not match the saved one.' : 'Số điện thoại không khớp với số đã lưu.',
    phoneMismatchHint: pageLanguage === 'en' ? '({0} in system)' : '(hệ thống có {0})',
    updatePhoneCheckbox: pageLanguage === 'en' ? 'Update this new phone number to my account' : 'Cập nhật số điện thoại mới này vào tài khoản của tôi',
    noPhoneSaved: pageLanguage === 'en' ? '💡 Account has no registered phone number. This number will be automatically saved to your profile.' : '💡 Tài khoản chưa đăng ký số điện thoại. Số này sẽ được tự động lưu vào hồ sơ của bạn.',
    email: pageLanguage === 'en' ? 'Email' : 'Email',
    emailPlaceholder: pageLanguage === 'en' ? 'Enter system account email' : 'Nhập email tài khoản hệ thống',
    selectedSeats: pageLanguage === 'en' ? 'Selected seats' : 'Ghế đã chọn',
    payment: pageLanguage === 'en' ? 'Payment' : 'Thanh toán',
    paymentTitleLocalized: pageLanguage === 'en' ? 'Ticket Payment' : 'Thanh toán vé',
    paymentSubtitle: pageLanguage === 'en' ? 'SePay QR or FPT Wallet' : 'SePay QR hoặc FPT Wallet',
    transferSyntax: pageLanguage === 'en' ? 'Transfer syntax:' : 'Cú pháp chuyển khoản:',
    currentBalance: pageLanguage === 'en' ? 'Current balance' : 'Số dư hiện tại',
    walletSufficient: pageLanguage === 'en' ? 'Wallet has sufficient balance. You can confirm payment now.' : 'Ví đủ số dư. Bạn có thể xác nhận thanh toán ngay.',
    walletInsufficient: pageLanguage === 'en' ? 'Insufficient account balance' : 'Số dư tài khoản không đủ',
    orderSummary: pageLanguage === 'en' ? 'Order summary' : 'Thông tin đơn hàng',
    noSeatsSelected: pageLanguage === 'en' ? 'No seats selected' : 'Chưa chọn ghế',
    discountCode: pageLanguage === 'en' ? 'Discount code' : 'Mã giảm giá',
    subtotal: pageLanguage === 'en' ? 'Subtotal' : 'Tạm tính',
    discount: pageLanguage === 'en' ? 'Discount' : 'Giảm giá',
    total: pageLanguage === 'en' ? 'Total' : 'Tổng cộng',
    btnClosed: pageLanguage === 'en' ? 'Registration closed' : 'Đăng ký đã đóng',
    btnEnded: pageLanguage === 'en' ? 'Event ended' : 'Sự kiện đã kết thúc',
    btnReviewOrder: pageLanguage === 'en' ? 'Review order' : 'Xác nhận đơn',
    btnCompleteRegistration: pageLanguage === 'en' ? 'Complete registration' : 'Hoàn tất đăng ký',
    btnContinueToPayment: pageLanguage === 'en' ? 'Continue to payment' : 'Tiếp tục thanh toán',
    btnConfirmPayment: pageLanguage === 'en' ? 'Confirm payment' : 'Xác nhận thanh toán',
    shieldText: pageLanguage === 'en' ? 'Seats are held when the payment step creates an order successfully and automatically released when expired or canceled.' : 'Ghế được giữ khi bước thanh toán tạo đơn thành công và tự giải phóng khi hết hạn hoặc hủy giao dịch.',
    expiredTitle: pageLanguage === 'en' ? 'Transaction expired or canceled' : 'Giao dịch hết hạn hoặc bị hủy',
    failedTitle: pageLanguage === 'en' ? 'Unable to complete transaction' : 'Không thể hoàn tất giao dịch',
    expiredDescription: pageLanguage === 'en' ? 'Your seat-holding session has timed out (5 minutes) or has been actively canceled. Please go back to make a new transaction.' : 'Phiên giữ ghế của bạn đã hết thời gian giới hạn (5 phút) hoặc đã bị chủ động hủy. Vui lòng quay lại để thực hiện giao dịch mới.',
    e4001Description: pageLanguage === 'en' ? 'The selected seat is currently being paid for by someone else or has been successfully booked. Please return to the seating chart to select another seat.' : 'Ghế bạn chọn hiện tại đã có người khác đang thực hiện thanh toán hoặc đã được đặt thành công. Vui lòng quay lại sơ đồ để chọn ghế khác.',
    unknownError: pageLanguage === 'en' ? 'An unknown error occurred. Please try again.' : 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.',
    btnBackNew: pageLanguage === 'en' ? 'Go back to book new tickets' : 'Quay lại đặt vé mới',
    btnBackSeats: pageLanguage === 'en' ? 'Go back to select seats' : 'Quay lại chọn ghế',
    registrationClosedUpper: pageLanguage === 'en' ? 'REGISTRATION CLOSED' : 'ĐĂNG KÝ ĐÃ ĐÓNG',
    eventEndedUpper: pageLanguage === 'en' ? 'EVENT ENDED' : 'SỰ KIỆN ĐÃ KẾT THÚC',
    lockedBannerDesc: pageLanguage === 'en' ? 'This event has ended or registration has been closed. You can only view the seating chart and cannot make new ticket bookings.' : 'Sự kiện này đã kết thúc hoặc đóng cổng đăng ký vé. Bạn chỉ có thể xem sơ đồ ghế ngồi của sự kiện và không thể thực hiện các giao dịch đặt vé mới.',
    errNameRequired: pageLanguage === 'en' ? 'Please enter your full name.' : 'Vui lòng nhập họ tên.',
    errNameMismatch: pageLanguage === 'en' ? 'Full name must match the system account name.' : 'Họ tên phải khớp với tài khoản trên hệ thống.',
    errEmailInvalid: pageLanguage === 'en' ? 'Please enter a valid email address.' : 'Vui lòng nhập email hợp lệ.',
    errEmailMismatch: pageLanguage === 'en' ? 'Email must match the system account email.' : 'Email phải là email đang tồn tại trên tài khoản hệ thống.',
    errPhoneInvalid: pageLanguage === 'en' ? 'Please enter a valid Vietnamese phone number.' : 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.',
    holdingSeats: pageLanguage === 'en' ? 'Holding {0} · Order #{1}' : 'Đang giữ {0} · Đơn #{1}',
    free: pageLanguage === 'en' ? 'Free' : 'Miễn phí',
    cancel: pageLanguage === 'en' ? 'Cancel' : 'Hủy',
  }
  const [event, setEvent] = useState<EventDetailExtras | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])
  const [allSeats, setAllSeats] = useState<Seat[]>([])
  const [promoCode, setPromoCode] = useState('')
  const [currentStep, setCurrentStep] = useState(1)
  const [attendeeName, setAttendeeName] = useState('')
  const [attendeeEmail, setAttendeeEmail] = useState('')
  const [attendeePhone, setAttendeePhone] = useState('')
  const [activeMethod, setActiveMethod] = useState<'qr' | 'wallet'>('qr')
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [processingOrder, setProcessingOrder] = useState(false)
  const [attendeeErrors, setAttendeeErrors] = useState<{ name?: string; email?: string; phone?: string }>({})
  const [bankTransferOrder, setBankTransferOrder] = useState<any | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [pollingIntervalId, setPollingIntervalId] = useState<number | null>(null)
  const [updatePhoneProfile, setUpdatePhoneProfile] = useState(false)

  const eventClosed = event?.status !== 'OPEN'
  const eventEnded = event ? new Date(event.endTime).getTime() < Date.now() : false
  const isLocked = Boolean(event && (eventClosed || eventEnded))

  const hasActiveSession = Boolean(isAuthenticated || user || token || localStorage.getItem('token'))

  useEffect(() => {
    if (user) {
      if (!attendeeName && user.fullName) setAttendeeName(user.fullName)
      if (!attendeeEmail && user.email) setAttendeeEmail(user.email)
      if (!attendeePhone && user.phone) setAttendeePhone(user.phone)
    }
  }, [user])

  useEffect(() => {
    if (authLoading || isRefreshing) return
    if (!hasActiveSession) {
      navigate(`/login?redirect=${encodeURIComponent(`/events/${id}/payment`)}`, { replace: true })
    }
  }, [authLoading, hasActiveSession, id, isRefreshing, navigate])

  useEffect(() => {
    if (!id || !hasActiveSession) return

    const fetchEvent = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/events/detail?id=${id}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) throw new Error('Failed to fetch event details')
        setEvent(await res.json())
      } catch (err: any) {
        setError(err.message || 'Unable to load event details')
      } finally {
        setLoading(false)
      }
    }

    void fetchEvent()
  }, [hasActiveSession, id])

  useEffect(() => {
    if (!event || loading) return
    const seats = ((event.seats ?? []) as ApiSeat[])
      .map((seat) => normalizeSeat(seat, event.areaId))
      .filter((seat): seat is Seat => Boolean(seat))
    setAllSeats(seats)
    if (!selectedTicket && event.tickets && event.tickets.length > 0) {
      const firstAvailable = (event.tickets as Ticket[]).find((ticket) => ticket.status !== 'INACTIVE' && ticket.remaining !== 0)
      setSelectedTicket(firstAvailable || (event.tickets[0] as Ticket))
    }
  }, [event, loading, selectedTicket])

  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        window.clearInterval(pollingIntervalId)
      }
    }
  }, [pollingIntervalId])

  useEffect(() => {
    if (!pendingOrderDetails) return
    const timer = setInterval(() => {
      setPendingOrderDetails((prev) => {
        if (!prev) return null
        if (prev.remainingSeconds <= 1) {
          clearInterval(timer)
          return null
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [pendingOrderDetails])

  useEffect(() => {
    if (!bankTransferOrder) return
    const serverExpires = new Date(bankTransferOrder.expiresAt || bankTransferOrder.expire_at).getTime()
    const serverNow = new Date(bankTransferOrder.createdAt || bankTransferOrder.serverTime || Date.now()).getTime()
    const clockOffset = serverNow - Date.now()

    if (Number.isNaN(serverExpires)) return

    const tick = () => {
      const correctedNow = Date.now() + clockOffset
      const remaining = Math.max(0, Math.floor((serverExpires - correctedNow) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        setBankTransferOrder(null)
        setCurrentStep(1)
        setSelectedSeats([])
      }
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [bankTransferOrder])

  const isSeatAvailableForSelect = (seat: Seat) => {
    const status = String(seat.status ?? '').toUpperCase()
    return status === 'ACTIVE' || status === 'AVAILABLE'
  }

  const handleSeatSelect = (seat: Seat) => {
    if (!isSeatAvailableForSelect(seat)) return
    setSelectedSeats((prev) => {
      if (prev.some((selected) => selected.seatId === seat.seatId)) {
        return prev.filter((selected) => selected.seatId !== seat.seatId)
      }
      if (prev.length >= 4) return prev
      return [...prev, seat]
    })
  }

  const ticketForSeat = (seat: Seat) => {
    if (!event?.tickets) return selectedTicket
    return (event.tickets as Ticket[]).find((ticket) => ticket.categoryTicketId === seat.categoryTicketId) || selectedTicket
  }

  const subtotal = selectedSeats.reduce((sum, seat) => {
    const ticket = ticketForSeat(seat)
    return sum + (ticket?.price ?? 0)
  }, 0)
  const normalizedPromo = promoCode.trim().toUpperCase()
  const discountRate = normalizedPromo === 'FPT20' ? 0.2 : normalizedPromo === 'SAVE10' ? 0.1 : 0
  const discountAmount = Math.round(subtotal * discountRate)
  const totalAmount = Math.max(0, subtotal - discountAmount)
  const walletBalance = resolveWalletBalance(user)
  const walletCanPay = walletBalance >= totalAmount

  const ticketBreakdown = useMemo(() => {
    const map = new Map<number, { name: string; count: number; price: number }>()
    selectedSeats.forEach((seat) => {
      const ticket = ticketForSeat(seat)
      if (!ticket) return
      const existing = map.get(ticket.categoryTicketId)
      map.set(ticket.categoryTicketId, {
        name: ticket.name,
        price: ticket.price,
        count: (existing?.count ?? 0) + 1,
      })
    })
    return Array.from(map.values())
  }, [selectedSeats, selectedTicket, event])

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const validateAttendeeInformation = () => {
    const nextErrors: { name?: string; email?: string; phone?: string } = {}
    const accountName = normalizeText(user?.fullName)
    const accountEmail = normalizeText(user?.email)
    const accountPhone = normalizePhone(user?.phone)
    const typedEmail = normalizeText(attendeeEmail)
    const typedPhone = normalizePhone(attendeePhone)

    if (!normalizeText(attendeeName)) {
      nextErrors.name = t.errNameRequired
    } else if (accountName && normalizeText(attendeeName) !== accountName) {
      nextErrors.name = t.errNameMismatch
    }

    if (!typedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail)) {
      nextErrors.email = t.errEmailInvalid
    } else if (!accountEmail || typedEmail !== accountEmail) {
      nextErrors.email = t.errEmailMismatch
    }

    if (!typedPhone || !isValidVietnamPhone(typedPhone)) {
      nextErrors.phone = t.errPhoneInvalid
    } else if (accountPhone && typedPhone !== accountPhone && !updatePhoneProfile) {
      nextErrors.phone = 'mismatch_update'
    }

    setAttendeeErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const markSelectedSeatsPending = () => {
    const selectedIds = new Set(selectedSeats.map((seat) => seat.seatId))
    setAllSeats((prev) => prev.map((seat) => selectedIds.has(seat.seatId) ? { ...seat, status: 'PENDING' } : seat))
  }

  const startPaymentPolling = (order: any) => {
    if (!order?.order_id) return
    if (pollingIntervalId) {
      window.clearInterval(pollingIntervalId)
    }

    const authToken = token || localStorage.getItem('token') || ''
    const intervalId = window.setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/payment/check-status/${order.order_id}`, {
          credentials: 'include',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        })
        if (!statusRes.ok) return

        const statusData = await statusRes.json()
        if (statusData.status === 'PAID') {
          window.clearInterval(intervalId)
          setPollingIntervalId(null)
          const ticketIds = order.ticketIds || order.seatIds?.join(',') || selectedSeats.map((seat) => seat.seatId).join(',')
          navigate(`/payment-success?status=success&method=bank_transfer&billId=${order.order_id}&ticketIds=${encodeURIComponent(ticketIds)}`, { replace: true })
        }
        if (['CANCELED', 'EXPIRED', 'FAILED'].includes(statusData.status)) {
          window.clearInterval(intervalId)
          setPollingIntervalId(null)
          setBankTransferOrder(null)
          setCurrentStep(1)
          setSelectedSeats([])
          setError(pageLanguage === 'en' ? 'Transaction has expired or been canceled. Seats have been released.' : 'Giao dịch đã hết hạn hoặc bị hủy. Ghế đã được giải phóng.')
        }
      } catch (err) {
        console.error('Error checking payment status:', err)
      }
    }, 3000)

    setPollingIntervalId(intervalId)
  }

  const cancelCurrentOrder = async () => {
    if (!bankTransferOrder?.order_id) return
    const authToken = token || localStorage.getItem('token') || ''
    setProcessingOrder(true)
    try {
      await fetch('/api/payment/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ order_id: bankTransferOrder.order_id }),
      })
    } finally {
      if (pollingIntervalId) {
        window.clearInterval(pollingIntervalId)
        setPollingIntervalId(null)
      }
      setBankTransferOrder(null)
      setSelectedSeats([])
      const selectedIds = new Set(selectedSeats.map((seat) => seat.seatId))
      setAllSeats((prev) => prev.map((seat) => selectedIds.has(seat.seatId) ? { ...seat, status: 'ACTIVE' } : seat))
      setCurrentStep(1)
      setProcessingOrder(false)
    }
  }

  const buildPaymentPayload = () => {
    if (!event || selectedSeats.length === 0) return null
    const firstSeatTicket = ticketForSeat(selectedSeats[0])
    const categoryTicketId = firstSeatTicket?.categoryTicketId || selectedTicket?.categoryTicketId
    if (!categoryTicketId) return null

    return {
      eventId: Number(event.eventId || event.id || id),
      categoryTicketId: Number(categoryTicketId),
      seatIds: selectedSeats.map((seat) => Number(seat.seatId)),
    }
  }

  const createBackendOrder = async () => {
    const payload = buildPaymentPayload()
    if (!payload || processingOrder) return null

    const authToken = token || localStorage.getItem('token') || ''
    setProcessingOrder(true)
    setError(null)

    try {
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const rawText = await response.text()
      let data: any = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        data = { message: rawText }
      }

      if (!response.ok) {
        if (data.errorCode === 'E4002') {
          setPendingOrderDetails({
            pendingBillId: Number(data.pendingBillId),
            seats: Array.isArray(data.seats) ? data.seats : (data.seats ? String(data.seats).split(',') : []),
            seatIds: Array.isArray(data.seatIds) ? data.seatIds.map(Number) : (data.seatIds ? String(data.seatIds).split(',').map(Number) : []),
            eventId: Number(data.eventId),
            categoryTicketId: Number(data.categoryTicketId),
            remainingSeconds: Number(data.remainingSeconds || data.remaining_seconds || 0),
            message: data.message
          })
          return { errorType: 'E4002' }
        }
        throw new Error(data.message || data.error || 'Unable to create payment order')
      }

      return data
    } catch (err: any) {
      setError(err.message || 'Unable to create payment order')
      return null
    } finally {
      setProcessingOrder(false)
    }
  }

  const handleWalletPayment = async () => {
    const payload = buildPaymentPayload()
    if (!payload || processingOrder) return
    const authToken = token || localStorage.getItem('token') || ''
    setProcessingOrder(true)
    setError(null)
    try {
      const response = await fetch('/api/wallet/pay-ticket', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const rawText = await response.text()
      let data: any = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        data = { message: rawText }
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || (pageLanguage === 'en' ? 'Unable to pay using wallet.' : 'Không thể thanh toán bằng ví.'))
      }

      navigate(`/payment-success?status=success&method=wallet&ticketIds=${encodeURIComponent(data.ticketIds || '')}`, { replace: true })
    } catch (err: any) {
      setError(err.message || (pageLanguage === 'en' ? 'Unable to pay using wallet.' : 'Không thể thanh toán bằng ví.'))
    } finally {
      setProcessingOrder(false)
    }
  }

  const handleContinueToPayment = async () => {
    if (!event || selectedSeats.length === 0) return
    const firstSeatTicket = ticketForSeat(selectedSeats[0])
    if (!firstSeatTicket && !selectedTicket) return

    if (currentStep === 1) {
      setCurrentStep(2)
      return
    }

    if (currentStep === 2) {
      if (!validateAttendeeInformation()) return

      // Auto-update phone number in database if user has no phone saved or requested an update
      const needsPhoneUpdate = !user?.phone || (updatePhoneProfile && attendeePhone.trim() !== user?.phone)
      if (needsPhoneUpdate && attendeePhone) {
        try {
          const authToken = token || localStorage.getItem('token') || ''
          const updateRes = await fetch('/api/auth/update-phone', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({ phone: attendeePhone.trim() }),
          })
          if (updateRes.ok) {
            await refreshUser()
            setUpdatePhoneProfile(false) // reset update profile flag
          } else {
            console.error('Failed to update phone number')
          }
        } catch (err) {
          console.error('Error updating phone number:', err)
        }
      }

      if (totalAmount <= 0) {
        const data = await createBackendOrder()
        if (data?.free === true) {
          navigate(`/payment-success?status=success&method=free&ticketIds=${encodeURIComponent(data.ticketIds || '')}`, { replace: true })
        }
        return
      }
      const data = await createBackendOrder()
      if (!data) return
      if (data.errorType === 'E4002') return

      const orderWithSeats = { ...data, seatIds: selectedSeats.map((seat) => seat.seatId) }
      setBankTransferOrder(orderWithSeats)
      markSelectedSeatsPending()
      startPaymentPolling(orderWithSeats)
      setCurrentStep(3)
      return
    }

    if (activeMethod === 'wallet' && !walletCanPay) return
    if (activeMethod === 'wallet') {
      await handleWalletPayment()
      return
    }
    setConfirmationMessage(activeMethod === 'qr' 
      ? (pageLanguage === 'en' ? 'SePay transfer confirmation request recorded.' : 'Đã ghi nhận yêu cầu xác nhận chuyển khoản SePay.') 
      : (pageLanguage === 'en' ? 'FPT internal wallet payment request recorded.' : 'Đã ghi nhận yêu cầu thanh toán bằng Ví nội bộ FPT.'))
  }

  if (authLoading || isRefreshing || loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-blue-500 animate-spin" />
      </div>
    )
  }

  if (pendingOrderDetails) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[80px] -top-10 -left-10" />
        <div className="absolute w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] -bottom-10 -right-10" />

        <div className="relative z-10 max-w-md w-full bg-neutral-900/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6 text-white text-center relative">
            <div className="mx-auto w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3 animate-pulse">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold">{t.restoreTitle}</h3>
            <p className="text-blue-100 text-xs mt-1 font-medium">{t.restoreSubtitle}</p>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-4">
            <p className="text-neutral-300 text-sm leading-relaxed text-center leading-relaxed font-sans">
              {pendingOrderDetails.message}
              <br />
              <span className="inline-block mt-2 text-xs font-semibold text-neutral-400">
                {t.restoreRemaining.replace('{0}', '')}
                <span className="font-semibold text-red-400 font-mono bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded text-sm ml-1">
                  {formatTimeLeft(pendingOrderDetails.remainingSeconds)}
                </span>
              </span>
            </p>

            <p className="text-neutral-200 text-sm font-semibold text-center mt-2 font-sans">
              {t.restoreWhatNext}
            </p>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200 space-y-1 font-sans">
              <p className="font-semibold">{t.restoreWarningTitle}</p>
              <p>{t.restoreWarningDesc}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-6 pb-6 pt-2 space-y-2.5">
            {/* Button 1: Resume */}
            <button
              type="button"
              onClick={() => {
                const isSameEvent = pendingOrderDetails.eventId === Number(id)
                if (isSameEvent) {
                  const ticket = event?.tickets ? (event.tickets as Ticket[]).find(tick => tick.categoryTicketId === pendingOrderDetails.categoryTicketId) : undefined
                  const price = ticket ? ticket.price : 0
                  const calculatedAmount = price * pendingOrderDetails.seats.length

                  const seatsToSelect = allSeats.filter(s => pendingOrderDetails.seatIds.includes(Number(s.seatId)))
                  setSelectedSeats(seatsToSelect)

                  const orderObj = {
                    order_id: pendingOrderDetails.pendingBillId,
                    amount: calculatedAmount,
                    expiresAt: new Date(Date.now() + pendingOrderDetails.remainingSeconds * 1000).toISOString(),
                    seatIds: pendingOrderDetails.seatIds
                  }
                  setBankTransferOrder(orderObj)
                  startPaymentPolling(orderObj)
                  setPendingOrderDetails(null)
                  setCurrentStep(3)
                } else {
                  navigate(`/events/${pendingOrderDetails.eventId}/payment`, { replace: true })
                }
              }}
              className="w-full px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center text-xs uppercase tracking-wider font-sans"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {t.btnResumeOld}
            </button>

            {/* Button 2: Cancel & Reorder */}
            <button
              type="button"
              disabled={processingOrder}
              onClick={async () => {
                const authToken = token || localStorage.getItem('token') || ''
                setProcessingOrder(true)
                try {
                  await fetch('/api/payment/cancel', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                    },
                    body: JSON.stringify({ order_id: pendingOrderDetails.pendingBillId }),
                  })
                  setPendingOrderDetails(null)
                  setTimeout(() => {
                    void handleContinueToPayment()
                  }, 100)
                } catch (err: any) {
                  setError(err.message || 'Unable to cancel previous order')
                } finally {
                  setProcessingOrder(false)
                }
              }}
              className="w-full px-4 py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold rounded-xl transition-all duration-200 flex items-center justify-center text-xs uppercase tracking-wider disabled:opacity-50 font-sans"
            >
              <X className="w-4 h-4 mr-2" />
              {t.btnCancelAndNew}
            </button>

            {/* Close/Skip option */}
            <button
              type="button"
              onClick={() => {
                setPendingOrderDetails(null)
                setSelectedSeats([])
                setCurrentStep(1)
              }}
              className="w-full py-2 text-xs text-neutral-400 hover:text-white transition uppercase font-bold tracking-wider font-sans"
            >
              {t.btnBackSeats}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error || !event) {
    const isExpiredError = error?.includes('hết hạn') || error?.includes('bị hủy')
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute w-[300px] h-[300px] bg-red-500/10 rounded-full blur-[80px] -top-10 -left-10" />
        <div className="absolute w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[80px] -bottom-10 -right-10" />

        <div className="relative z-10 max-w-md w-full bg-neutral-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center space-y-6">
          <div className={`inline-flex p-4 rounded-full ${isExpiredError ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse' : 'bg-red-500/10 border border-red-500/20 text-red-400 animate-bounce'}`}>
            <AlertCircle className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black tracking-wide text-white">
              {isExpiredError ? t.expiredTitle : t.failedTitle}
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed px-2">
              {isExpiredError
                ? t.expiredDescription
                : error?.includes('[E4001]') 
                  ? t.e4001Description
                  : error || t.unknownError}
            </p>
            {!isExpiredError && error?.includes('[E4001]') && (
              <p className="text-xs font-mono text-neutral-500 bg-black/30 py-1.5 px-3 rounded-lg inline-block select-all">
                {error}
              </p>
            )}
          </div>
          <button
            onClick={() => navigate(`/events/${id}/page`, { replace: true })}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] uppercase text-xs tracking-wider"
          >
            {isExpiredError ? t.btnBackNew : t.btnBackSeats}
          </button>
        </div>
      </div>
    )
  }

  const banner = event.bannerUrl || event.bannerImg || ''
  const locationTitle = event.venueName || event.location || 'FPT location'
  const organizerAvatar =
    event.organizerAvatar ||
    event.organizerAvatarUrl ||
    event.organizer_avatar ||
    event.organizer_avatar_url ||
    ''
  const organizerName = event.organizerName || 'FPT Organizer'
  const eventKey = event.eventId || event.id || id || 'event'
  const userId = user?.id || 'GUEST'
  const transferMessage = bankTransferOrder?.order_id ? `FEMS_${eventKey}_DH${bankTransferOrder.order_id}` : `FEMS_${eventKey}_${userId || 'GUEST'}`
  const paymentAmount = Number(bankTransferOrder?.amount ?? totalAmount)
  const vietQrSrc = `https://qr.sepay.vn/img?acc=${import.meta.env.VITE_BANK_ACC || '2911121319'}&bank=${import.meta.env.VITE_BANK_NAME || 'MB'}&amount=${paymentAmount}&des=${encodeURIComponent(transferMessage)}`

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-blue-500/30">
      <div className="fixed inset-0 pointer-events-none bg-[#09090b]">
        {banner && (
          <div
            className="absolute -inset-[20%] blur-[90px] opacity-40 saturate-[220%]"
            style={{ backgroundImage: `url(${banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-neutral-950/75 to-neutral-950" />
      </div>

      <div className="relative z-10 max-w-[1380px] mx-auto px-5 sm:px-8 py-6">
        <button
          type="button"
          onClick={() => navigate(`/events/${id}/page`, { replace: true })}
          className="inline-flex items-center gap-2 text-sm font-bold text-neutral-300 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.eventDetails}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10">
          <main className="space-y-7">
            {isLocked && (
              <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
                <p className="font-black text-base uppercase text-red-400 mb-1">
                  {eventClosed ? t.registrationClosedUpper : t.eventEndedUpper}
                </p>
                {t.lockedBannerDesc}
              </div>
            )}
            <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 sm:p-7">
              <div className="w-full max-w-xl mx-auto mb-8 mt-2 px-2">
                <div className="flex items-center justify-between relative">
                  {/* Connecting line background */}
                  <div className="absolute top-5 left-0 right-0 h-[2px] bg-white/10 z-0 rounded-full" />
                  
                  {/* Active connecting line fill */}
                  <div 
                    className="absolute top-5 left-0 h-[2px] bg-gradient-to-r from-blue-600 to-blue-500 z-0 rounded-full transition-all duration-500 ease-in-out" 
                    style={{ 
                      width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' 
                    }}
                  />

                  {(pageLanguage === 'en' 
                    ? ['Choose seats', 'Review order', 'Payment'] 
                    : ['Chọn ghế', 'Xác nhận đơn', 'Thanh toán']
                  ).map((label, index) => {
                    const step = index + 1
                    const isCompleted = currentStep > step
                    const isActive = currentStep === step

                    return (
                      <div key={label} className="flex flex-col items-center relative z-10 flex-1">
                        <div 
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-500 ${
                            isCompleted 
                              ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                              : isActive 
                                ? 'bg-blue-500 text-white ring-4 ring-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-105' 
                                : 'bg-neutral-900 text-neutral-400 border border-white/10'
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="w-5 h-5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            step
                          )}
                        </div>
                        <span 
                          className={`mt-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-center transition-colors duration-300 ${
                            isActive ? 'text-blue-400' : isCompleted ? 'text-neutral-200' : 'text-neutral-500'
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
                <div>
                  <div className="aspect-video rounded-2xl overflow-hidden bg-black/30 border border-white/10">
                    {banner ? <img src={banner} alt={event.title} className="w-full h-full object-cover" /> : null}
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black leading-tight mt-5">{event.title}</h1>
                  <div className="flex items-center gap-3 mt-4">
                    {organizerAvatar ? (
                      <img src={organizerAvatar} alt={organizerName} className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm select-none"
                        style={{ background: 'linear-gradient(135deg, #f97316, #d97706)' }}
                      >
                        {organizerName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-neutral-400 font-medium">{t.organizedBy}</p>
                      <p className="text-sm font-semibold text-white">{organizerName}</p>
                    </div>
                  </div>
                  <div className="space-y-3 mt-5 text-sm text-neutral-300">
                    <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-400" /> {formatDateTime(event.startTime, pageLanguage)}</p>
                    <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" /> {locationTitle}</p>
                  </div>
                </div>

                <div className="space-y-5">
                  {currentStep === 1 && (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">{t.ticketTiers}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(event.tickets as Ticket[] | undefined)?.map((ticket) => {
                            const selected = selectedSeats.some((seat) => seat.categoryTicketId === ticket.categoryTicketId)
                            const soldOut = ticket.remaining === 0 || ticket.status === 'INACTIVE'
                            return (
                              <div
                                key={ticket.categoryTicketId}
                                className={`text-left rounded-2xl border p-4 select-none ${
                                  soldOut
                                    ? 'border-white/5 bg-white/5 opacity-50'
                                    : selected
                                      ? 'border-blue-500 bg-blue-500/15'
                                      : 'border-white/10 bg-white/5'
                                }`}
                              >
                                <p className="font-bold text-white">{ticket.name}</p>
                                <p className="text-sm text-blue-200 font-black mt-1">
                                  {ticket.price > 0 ? formatCurrency(ticket.price) : t.free}
                                </p>
                                <p className="text-xs text-neutral-400 mt-1">
                                  {pageLanguage === 'en' 
                                    ? `${ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity} available` 
                                    : `Còn lại ${ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity}`
                                  }
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 overflow-hidden">
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">{t.seatSelection}</p>
                        <SeatGrid
                          seats={allSeats}
                          selectedSeats={selectedSeats}
                          onSeatSelect={(seat) => seat && handleSeatSelect(seat)}
                          maxReached={selectedSeats.length >= 4}
                          allowSelect={!isLocked}
                        />
                      </div>
                    </>
                  )}

                  {currentStep === 2 && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-6 space-y-6">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-400">{t.reviewOrderTitle}</p>
                        <h2 className="text-2xl font-black mt-2">{t.attendeeInformation}</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase mb-2 block">{t.fullName}</span>
                          <input value={attendeeName} onChange={(event) => setAttendeeName(event.target.value)} placeholder={t.fullNamePlaceholder} className={`w-full rounded-xl border ${attendeeErrors.name ? 'border-red-500' : 'border-white/10'} bg-white/5 px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500`} />
                          {attendeeErrors.name && <p className="mt-1.5 text-xs font-semibold text-red-400">{attendeeErrors.name}</p>}
                        </label>
                         <label className="block">
                          <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase mb-2 block">{t.phone}</span>
                          <input 
                            value={attendeePhone} 
                            onChange={(event) => setAttendeePhone(event.target.value)} 
                            placeholder={user?.phone ? t.phonePlaceholderSaved : t.phonePlaceholderNew} 
                            className={`w-full rounded-xl border ${attendeeErrors.phone ? 'border-red-500' : 'border-white/10'} bg-white/5 px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500`} 
                          />
                          {attendeeErrors.phone && attendeeErrors.phone !== 'mismatch_update' && (
                            <p className="mt-1.5 text-xs font-semibold text-red-400">{attendeeErrors.phone}</p>
                          )}
                          {attendeeErrors.phone === 'mismatch_update' && (
                            <div className="mt-1.5 space-y-2">
                              <p className="text-xs font-semibold text-red-400">
                                {t.phoneMismatch} {t.phoneMismatchHint.replace('{0}', user?.phone || (pageLanguage === 'en' ? 'none' : 'chưa có'))}
                              </p>
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-400 hover:text-blue-300">
                                <input 
                                  type="checkbox" 
                                  checked={updatePhoneProfile} 
                                  onChange={(e) => setUpdatePhoneProfile(e.target.checked)} 
                                  className="rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-500" 
                                />
                                {t.updatePhoneCheckbox}
                              </label>
                            </div>
                          )}
                          {!user?.phone && !attendeeErrors.phone && (
                            <p className="mt-1.5 text-xs font-semibold text-amber-400">
                              {t.noPhoneSaved}
                            </p>
                          )}
                        </label>
                        <label className="block md:col-span-2">
                          <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase mb-2 block">{t.email}</span>
                          <input value={attendeeEmail} onChange={(event) => setAttendeeEmail(event.target.value)} placeholder={t.emailPlaceholder} className={`w-full rounded-xl border ${attendeeErrors.email ? 'border-red-500' : 'border-white/10'} bg-white/5 px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500`} />
                          {attendeeErrors.email && <p className="mt-1.5 text-xs font-semibold text-red-400">{attendeeErrors.email}</p>}
                        </label>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-3">{t.selectedSeats}</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedSeats.map((seat) => (
                            <span key={seat.seatId} className="rounded-full bg-blue-500/15 border border-blue-400/25 px-3 py-1 text-sm font-black text-blue-100">{seat.seatCode}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="bg-neutral-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 space-y-4 text-white shadow-[0_12px_40px_0_rgba(0,0,0,0.5)]">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-blue-400">{t.payment}</p>
                        <h2 className="text-xl font-black mt-1">{t.paymentTitleLocalized}</h2>
                        <p className="text-xs text-neutral-400 mt-0.5">{t.paymentSubtitle}</p>
                      </div>

                      {bankTransferOrder && (
                        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                            <span className="text-neutral-200 truncate">
                              {t.holdingSeats
                                .replace('{0}', selectedSeats.map((seat) => seat.seatCode).join(', '))
                                .replace('{1}', bankTransferOrder.order_id)
                              }
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="font-mono font-black text-amber-200 text-sm">{formatTimeLeft(timeLeft)}</span>
                            <button
                              type="button"
                              onClick={cancelCurrentOrder}
                              disabled={processingOrder}
                              className="text-red-400 hover:text-red-300 font-bold underline disabled:opacity-50"
                            >
                              {t.cancel}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveMethod('qr')}
                          className={`rounded-lg px-2 py-2 text-[11px] sm:text-xs font-black transition-all whitespace-nowrap ${
                            activeMethod === 'qr' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          VietQR SePay
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMethod('wallet')}
                          className={`rounded-lg px-2 py-2 text-[11px] sm:text-xs font-black transition-all whitespace-nowrap ${
                            activeMethod === 'wallet' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          FPT Wallet
                        </button>
                      </div>

                      {activeMethod === 'qr' ? (
                        <div className="flex flex-col items-center justify-center text-center py-1 space-y-3">
                          <div className="bg-white p-3 rounded-2xl border border-white/20 shadow-lg inline-block transform transition-transform hover:scale-105 duration-300">
                            <img
                              src={vietQrSrc}
                              alt="VietQR SePay Auto Payment"
                              className="w-44 h-44 object-contain"
                            />
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 flex items-center gap-2 text-xs font-mono text-neutral-300">
                            <span className="text-neutral-500">{t.transferSyntax}</span>
                            <span className="font-bold text-white select-all">{transferMessage}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs font-bold text-neutral-400">{t.currentBalance}</span>
                            <span className="text-lg font-black text-white">{formatCurrency(walletBalance)}</span>
                          </div>
                          {walletCanPay ? (
                            <p className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-lg text-xs font-medium">
                              {t.walletSufficient}
                            </p>
                          ) : (
                            <p className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-medium">
                              {t.walletInsufficient}
                            </p>
                          )}
                        </div>
                      )}

                      {confirmationMessage && (
                        <p className="rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 p-3 text-xs font-medium">
                          {confirmationMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </main>

          <aside className="lg:sticky lg:top-6 h-fit rounded-3xl border border-white/10 bg-neutral-950/85 backdrop-blur-xl p-6 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 mb-5">
              <CreditCard className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-black">{t.orderSummary}</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 text-neutral-300">
                <span>{t.selectedSeats}</span>
                <span className="font-bold text-white">{selectedSeats.length || 0}</span>
              </div>
              <div className="min-h-[44px] rounded-2xl bg-white/5 border border-white/10 p-3 text-neutral-300">
                {selectedSeats.length > 0 ? selectedSeats.map((seat) => seat.seatCode).join(', ') : t.noSeatsSelected}
              </div>

              {ticketBreakdown.length > 0 && (
                <div className="space-y-2 pt-2">
                  {ticketBreakdown.map((item) => (
                    <div key={item.name} className="flex justify-between gap-4 text-neutral-300">
                      <span>{item.name} x {item.count}</span>
                      <span className="font-bold text-white">{formatCurrency(item.price * item.count)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-white/10 space-y-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-widest text-neutral-500">{t.discountCode}</span>
                  <input
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    placeholder="SAVE10 or FPT20"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </label>
                <div className="flex justify-between gap-4 text-neutral-300">
                  <span>{t.subtotal}</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between gap-4 text-neutral-300">
                  <span>{t.discount}</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
                <div className="flex justify-between gap-4 text-lg font-black text-white">
                  <span>{t.total}</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinueToPayment}
              disabled={isLocked || processingOrder || selectedSeats.length === 0 || (currentStep === 3 && activeMethod === 'wallet' && !walletCanPay)}
              className={`mt-6 w-full rounded-xl py-4 text-sm font-black uppercase tracking-wide transition-all ${
                !isLocked && !processingOrder && selectedSeats.length > 0 && !(currentStep === 3 && activeMethod === 'wallet' && !walletCanPay)
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
              }`}
            >
              {isLocked 
                ? (eventClosed ? t.btnClosed : t.btnEnded) 
                : (currentStep === 1 
                  ? t.btnReviewOrder 
                  : currentStep === 2 
                    ? (totalAmount <= 0 ? t.btnCompleteRegistration : t.btnContinueToPayment) 
                    : t.btnConfirmPayment)}
            </button>

            <div className="mt-4 flex items-start gap-2 text-xs text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              {t.shieldText}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
