/**
 * =============================================================================
 * PAYMENT PAGE - Trang thanh toán vé sự kiện qua VNPay
 * =============================================================================
 *
 * Mô tả:
 * - Trang này nhận dữ liệu vé đã chọn từ trang trước (EventDetail / Dashboard)
 * - Hiển thị thông tin vé cho user kiểm tra lại
 * - Khi bấm “Thanh toán qua VNPay” → redirect sang Backend
 * - Backend tạo URL VNPay (có checksum) → đưa user sang VNPay thanh toán
 * - VNPay xong sẽ callback/redirect về trang success hoặc failed
 *
 * Flow hoạt động:
1.Student vào EventDetail.tsx → chọn ghế trong SeatGrid
2.Bấm mua/tiếp tục → navigate('/dashboard/payment', { state: {...} }) truyền eventId, categoryTicketId, seatIds, thông tin hiển thị
3.Trang Payment.tsx đọc location.state → hiển thị xác nhận → bấm “Thanh toán”
4.Payment tạo query params và redirect full page sang backend: /api/payment-ticket?...
5.Backend validate seat/event/ticket + tạo VNPay payment URL + ký vnp_SecureHash → redirect user sang VNPay
6.VNPay xử lý xong → redirect về backend ReturnURL/IPN → backend verify chữ ký + check vnp_ResponseCode
Backend cập nhật đơn/vé → redirect về FE PaymentSuccess hoặc PaymentFailed (kèm query params như status, ticketIds, vnp_ResponseCode…)
 *
 * Author: Group 3 - SWP391
 * =============================================================================
 */

// ======================== IMPORTS ========================

// Import hook điều hướng và đọc state của React Router
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'

// Import helper để format thời gian theo Vietnam timezone
import { formatVietnamDateTime } from '../utils/dateFormat'
// useNavigate: Hook để điều hướng programmatically (bằng code) trong React Router
// useLocation: Hook để lấy thông tin URL hiện tại + state truyền từ trang trước
// useEffect: Hook để fetch wallet balance khi component mount

// Import icon để trang đẹp hơn
import { CreditCard, ArrowLeft, Clock, X } from 'lucide-react'
// CreditCard: icon thẻ/ thanh toán
// ArrowLeft: icon mũi tên quay lại
// Clock: icon đồng hồ đếm ngược

// Import Link để tạo link chuyển trang không reload
import { Link } from 'react-router-dom'
// Link: chuyển route trong SPA (Single Page App) mà không reload toàn trang

// Import AuthContext để lấy user đang đăng nhập
import { useAuth } from '../contexts/AuthContext'
// useAuth: custom hook lấy user (thông tin đăng nhập) từ context toàn app

// Import emitWalletRefresh để refresh balance khi thanh toán thành công
import { emitWalletRefresh } from '../hooks/useWallet'

// Import PaymentErrorModal component
import PaymentErrorModal from '../components/PaymentErrorModal'
// PaymentErrorModal: Modal để hiển thị lỗi thanh toán với lựa chọn hành động

// Import VietQRModal component
import VietQRModal from '../components/VietQRModal'

// ======================== TYPE DEFINITIONS ========================

/**
 * PaymentState - Định nghĩa cấu trúc dữ liệu được truyền từ trang chọn vé
 *
 * Dữ liệu này được truyền qua location.state khi navigate từ EventDetail/Dashboard.
 * Mục tiêu: giúp trang Payment biết user chọn vé nào, ghế nào, tiền bao nhiêu...
 */
type PaymentState = {
  eventId: number // ID của sự kiện (bắt buộc)
  categoryTicketId: number // ID loại vé đã chọn (bắt buộc)

  seatIds?: number[] // Mảng ID các ghế đã chọn (bắt buộc nếu vé có ghế)
  eventTitle?: string // Tên sự kiện (để hiển thị)
  ticketName?: string // Tên loại vé (để hiển thị)

  ticketBreakdown?: Array<{
    // Chi tiết từng loại vé nếu user chọn nhiều loại
    name: string // tên loại vé
    count: number // số lượng vé loại đó
    price: number // giá 1 vé loại đó
  }>

  seatCodes?: string[] // Mã ghế hiển thị (A1, A2, ...)
  rowNo?: string // số hàng ghế hiển thị

  pricePerTicket?: number // giá mỗi vé (để hiển thị)
  quantity?: number // số lượng vé (để hiển thị)
  totalAmount?: number // tổng tiền (để hiển thị)
}

// ======================== HELPERS ========================

function cleanEventTitleForTransfer(title: string): string {
  let cleaned = title.toUpperCase();
  // Normalize and remove Vietnamese accents/diacritics
  cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Replace specialized Vietnamese characters (Đ -> D)
  cleaned = cleaned.replace(/Đ/g, "D");
  // Keep only alphanumeric characters and spaces
  cleaned = cleaned.replace(/[^A-Z0-9 ]/g, "");
  // Replace multiple spaces with a single space
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Limit length to 18 characters
  if (cleaned.length > 18) {
    cleaned = cleaned.slice(0, 18).trim();
  }
  return cleaned || "EVENT";
}

// ======================== MAIN COMPONENT ========================

export default function Payment() {
  // -------------------- HOOKS --------------------

  // navigate dùng để chuyển trang bằng code (vd: về dashboard, sang login...)
  const navigate = useNavigate()

  // location chứa thông tin route hiện tại, bao gồm location.state từ trang trước
  // nếu copy url trực tiếp thì location.state sẽ undefined nên frontend sẽ detect 
  // thiếu dữ liệu và điều hướng về Dashboard để chọn lại vé.
  const location = useLocation()

  // lấy user + token từ AuthContext (user/token có thể null nếu chưa đăng nhập)
  const { user, token } = useAuth()

  // -------------------- LẤY DỮ LIỆU TỪ STATE --------------------

  /**
   * state: chính là dữ liệu vé được trang trước truyền sang.
   *
   * Nếu user truy cập thẳng URL /dashboard/payment (không đi từ flow chọn vé)
   * thì location.state sẽ undefined → fallback {} để tránh crash.
   *
   * "as PaymentState": type assertion để TypeScript hiểu biến state theo kiểu PaymentState.
   */
  const state = (location.state || {}) as PaymentState

  // payment method: 'momo' or 'wallet' or 'bank_transfer'
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'wallet' | 'bank_transfer'>('momo')

  // State for Bank Transfer modal and polling
  const [showBankTransferModal, setShowBankTransferModal] = useState(false)
  const [bankTransferOrder, setBankTransferOrder] = useState<{ order_id: number; amount: number } | null>(null)
  const [pollingIntervalId, setPollingIntervalId] = useState<number | null>(null)
  const [creatingOrder, setCreatingOrder] = useState(false)
  
  // ⚡ Smart Resume states
  const [showResumeModal, setShowResumeModal] = useState(false)
  const [resumeData, setResumeData] = useState<{
    pendingBillId: number
    seats: string[]
    seatIds: number[]
    eventId: number
    categoryTicketId: number
    remainingSeconds: number
  } | null>(null)

  // Dynamic transfer description for SePay VietQR
  const cleanTitle = cleanEventTitleForTransfer(state.eventTitle || 'Sự kiện demo (mock)')
  const transferDescription = bankTransferOrder ? `${cleanTitle} HD${bankTransferOrder.order_id}` : ''

  // ⏳ SePay Bank Transfer Countdown (Dynamic from Server expire_at)
  const [timeLeft, setTimeLeft] = useState<number>(300)

  useEffect(() => {
    if (!bankTransferOrder || !(bankTransferOrder as any).expire_at) {
      return
    }

    const expireTime = new Date((bankTransferOrder as any).expiresAt || (bankTransferOrder as any).expire_at).getTime()

    const calculateTimeLeft = () => {
      const difference = expireTime - Date.now()
      return Math.max(0, Math.floor(difference / 1000))
    }

    // Set initial
    setTimeLeft(calculateTimeLeft())

    const timer = window.setInterval(() => {
      const remaining = calculateTimeLeft()
      setTimeLeft(remaining)

      if (remaining <= 0) {
        window.clearInterval(timer)
        // Handle timeout
        if (pollingIntervalId) {
          window.clearInterval(pollingIntervalId)
          setPollingIntervalId(null)
        }

        // Active cancellation call on timeout
        if (bankTransferOrder?.order_id) {
          fetch('/api/payment/cancel', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ order_id: bankTransferOrder.order_id })
          }).catch((err) => console.error('Error during automatic timeout cancellation:', err))
        }

        setShowBankTransferModal(false)
        alert('Thời gian giữ chỗ thanh toán đã hết hạn (5 phút). Ghế giữ chỗ của bạn đã được giải phóng.')
        navigate('/dashboard')
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [bankTransferOrder, pollingIntervalId, token, navigate])

  const serializedSeatIds = state.seatIds ? state.seatIds.map(Number).sort().join(',') : ''

  // Load active pending order for this seat selection from Backend API on mount
  useEffect(() => {
    if (!serializedSeatIds || !token) {
      return
    }

    let activePollingIntervalId: number | null = null

    const fetchActiveOrder = async () => {
      try {
        const response = await fetch(`/api/payment/active-order?seatIds=${serializedSeatIds}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (!response.ok) {
          return
        }

        const data = await response.json()
        if (data.active && data.order) {
          const order = data.order
          setBankTransferOrder(order)

          // Pre-calculate initial timeLeft
          const expireTime = new Date(order.expiresAt || order.expire_at).getTime()
          const difference = expireTime - Date.now()
          setTimeLeft(Math.max(0, Math.floor(difference / 1000)))

          setShowBankTransferModal(true)

          // Start checking payment status
          const intervalId = window.setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/payment/check-status/${order.order_id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              })
              if (statusRes.ok) {
                const statusData = await statusRes.json()
                if (statusData.status === 'PAID') {
                  window.clearInterval(intervalId)
                  setShowBankTransferModal(false)
                  const seatIdsParam = order.seatIds?.join(',') || state.seatIds?.join(',') || ''
                  navigate(
                    `/dashboard/payment/success?status=success&method=bank_transfer&billId=${order.order_id}&ticketIds=${seatIdsParam}`
                  )
                } else if (statusData.status === 'CANCELED' || statusData.status === 'EXPIRED' || statusData.status === 'FAILED') {
                  window.clearInterval(intervalId)
                  setShowBankTransferModal(false)
                  alert('Giao dịch chuyển khoản đã hết hạn giữ chỗ (5 phút) và bị hủy trên hệ thống.')
                  navigate('/dashboard')
                }
              }
            } catch (pollErr) {
              console.error('Lỗi check status:', pollErr)
            }
          }, 3000)

          activePollingIntervalId = intervalId
          setPollingIntervalId(intervalId)
        } else {
          // No active order found on Backend, ensure states are clean
          setBankTransferOrder(null)
          setShowBankTransferModal(false)
          setTimeLeft(0)
        }
      } catch (err) {
        console.error('Lỗi lấy active order từ Backend:', err)
      }
    }

    fetchActiveOrder()

    return () => {
      if (activePollingIntervalId) {
        window.clearInterval(activePollingIntervalId)
      }
    }
  }, [token, navigate, serializedSeatIds])

  // Automatically clear active bank transfer polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        window.clearInterval(pollingIntervalId)
      }
    }
  }, [pollingIntervalId])

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Dynamic countdown for the resume modal (E4002)
  useEffect(() => {
    if (!showResumeModal || !resumeData || resumeData.remainingSeconds <= 0) {
      return
    }

    const timer = setInterval(() => {
      setResumeData((prev) => {
        if (!prev) return null
        const newSecs = prev.remainingSeconds - 1
        if (newSecs <= 0) {
          clearInterval(timer)
          setShowResumeModal(false)
          alert('Đơn hàng giữ chỗ cũ đã hết hạn và tự động giải phóng.')
          return null
        }
        return {
          ...prev,
          remainingSeconds: newSecs
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [showResumeModal])

  const handleCancelAndReorder = async () => {
    if (!resumeData) return

    setShowResumeModal(false)

    try {
      const response = await fetch('/api/payment/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ order_id: resumeData.pendingBillId })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Không thể hủy đơn hàng cũ')
      }

      // Successfully canceled old bill, now trigger creation of new bill
      if (paymentMethod === 'momo') {
        await handleMoMoPay()
      } else if (paymentMethod === 'wallet') {
        await handleWalletPay()
      } else if (paymentMethod === 'bank_transfer') {
        await handleBankTransferPay()
      }
    } catch (err: any) {
      console.error('Error during cancel and reorder:', err)
      alert('Có lỗi xảy ra khi hủy đơn hàng cũ: ' + (err.message || 'Vui lòng thử lại.'))
    }
  }

  // ⭐ NEW: Event time validation state
  const [isEventExpired, setIsEventExpired] = useState(false)
  const [eventStartTime, setEventStartTime] = useState<string | null>(null)
  const [checkingEventTime, setCheckingEventTime] = useState(true)

  // Wallet state management
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorData, setErrorData] = useState<{
    errorType: 'insufficient_balance' | 'duplicate_entry' | 'general'
    shortage?: number
    currentBalance?: number
    totalAmount?: number
    errorMessage?: string
  } | null>(null)

  // Fetch wallet balance on component mount
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        const userId = (user as any)?.userId ?? (user as any)?.id

        if (!userId) {
          setLoadingBalance(false)
          return
        }

        const response = await fetch(`/api/wallet/balance?userId=${userId}`, {
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        if (response.ok) {
          const data = await response.json()
          setWalletBalance(data.balance || 0)
        }
      } catch (error) {
        console.error('Error fetching wallet balance:', error)
      } finally {
        setLoadingBalance(false)
      }
    }

    fetchWalletBalance()
  }, [user, token])

  // ⭐ NEW: Check event start time at mount
  useEffect(() => {
    const checkEventStartTime = async () => {
      try {
        setCheckingEventTime(true)

        // If no eventId in state, can't check
        if (!state.eventId) {
          setCheckingEventTime(false)
          return
        }

        // Fetch event details from API
        const response = await fetch(`/api/events/${state.eventId}`, {
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        if (!response.ok) {
          console.warn('Failed to fetch event details')
          setCheckingEventTime(false)
          return
        }

        const eventData = await response.json()
        const startTime = new Date(eventData.startTime || eventData.start_time)
        const now = new Date()

        // Check if event has already started
        if (now >= startTime) {
          setIsEventExpired(true)
          setEventStartTime(eventData.startTime || eventData.start_time)
        }
      } catch (error) {
        console.error('Error checking event time:', error)
      } finally {
        setCheckingEventTime(false)
      }
    }

    checkEventStartTime()
  }, [state.eventId, token])

  // Check if wallet payment should be disabled
  const totalAmount = state.totalAmount || 0
  const isWalletDisabled = walletBalance !== null && walletBalance < totalAmount
  const insufficientAmount = isWalletDisabled ? totalAmount - walletBalance! : 0

  // -------------------- XỬ LÝ THANH TOÁN --------------------

  /**
   * handlePay - chạy khi user bấm nút “Thanh toán qua VNPay”
   * Phần code xử lí khi ấn thanh toán
   * Nhiệm vụ:
   * 1) Validate dữ liệu bắt buộc (eventId, categoryTicketId, seatIds)
   * 2) Check login: lấy userId để backend biết ai đang mua
   * 3) Gọi API backend để lấy VNPay URL
   * 4) Redirect sang VNPay để thanh toán
   */
  const handleMoMoPay = async () => {
    // ===== BƯỚC 0: CHECK EVENT STATUS =====
    if (isEventExpired) {
      alert('Sự kiện đã bắt đầu hoặc kết thúc. Không thể tiếp tục đặt vé.')
      return
    }

    // ===== BƯỚC 1: VALIDATE DỮ LIỆU VÉ =====
    if (
      !state.eventId ||
      !state.categoryTicketId ||
      !state.seatIds ||
      state.seatIds.length === 0
    ) {
      alert('Thiếu thông tin vé, vui lòng chọn lại vé từ Dashboard.')
      navigate('/dashboard')
      return
    }

    // ===== BƯỚC 2: KIỂM TRA ĐĂNG NHẬP =====
    const userId = (user as any)?.userId ?? (user as any)?.id
    if (!userId) {
      alert('Bạn cần đăng nhập trước khi thanh toán.')
      navigate('/login')
      return
    }

    // ===== BƯỚC 3: GỬI REQUEST MO-MO THANH TOÁN =====
    const payload = {
      eventId: Number(state.eventId),
      categoryTicketId: Number(state.categoryTicketId),
      seatIds: state.seatIds.map(id => Number(id)),
    }

    try {
      const response = await fetch('/api/payment/momo-init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorMsgRaw = await response.text()
        let cleanMsg = 'Không thể tạo link thanh toán MoMo'
        let errCode = ''
        let remSecs = 0
        let pendingBillId = 0
        let seats: string[] = []
        let seatIds: number[] = []
        let eventId = 0
        let categoryTicketId = 0

        try {
          const jsonErr = JSON.parse(errorMsgRaw)
          cleanMsg = jsonErr.message || jsonErr.error || 'Không thể tạo link thanh toán MoMo'
          errCode = jsonErr.errorCode || ''
          remSecs = jsonErr.remainingSeconds || 0
          pendingBillId = Number(jsonErr.pendingBillId) || 0
          seats = jsonErr.seats || []
          seatIds = jsonErr.seatIds || []
          eventId = jsonErr.eventId || 0
          categoryTicketId = jsonErr.categoryTicketId || 0
        } catch {}

        if (errCode === 'E4002') {
          setResumeData({
            pendingBillId,
            seats,
            seatIds,
            eventId,
            categoryTicketId,
            remainingSeconds: remSecs
          })
          setShowResumeModal(true)
          return
        }

        if (errCode === 'E4003' || cleanMsg.includes('E4003')) {
          const minutes = Math.floor(remSecs / 60)
          const seconds = remSecs % 60
          const formattedMinutes = minutes.toString().padStart(2, '0')
          const formattedSeconds = seconds.toString().padStart(2, '0')
          cleanMsg = `Tài khoản của bạn đã bị tạm khóa tính năng đặt vé. Vui lòng thử lại sau: ${formattedMinutes} phút ${formattedSeconds} giây do có hành vi giữ chỗ rác liên tục.`
        }
        throw new Error(cleanMsg)
      }

      const data = await response.json()

      // 0đ BYPASS
      if (data.free === true) {
        console.log('🎉 [FREE_TICKET] Vé miễn phí! TicketIds:', data.ticketIds)
        navigate(
          `/dashboard/payment/success?status=success&method=free&ticketIds=${encodeURIComponent(data.ticketIds || '')}`
        )
        return
      }

      if (!data.paymentUrl) {
        throw new Error('Backend không trả về payment URL')
      }

      // Redirect sang cổng thanh toán MoMo Sandbox
      window.location.replace(data.paymentUrl)

    } catch (error: any) {
      console.error('MoMo payment error:', error)
      alert(error.message || 'Có lỗi xảy ra khi tạo thanh toán MoMo. Vui lòng thử lại.')
    }
  }

  // ======================
  // XỬ LÝ THANH TOÁN BẰNG VÍ (WALLET)
  // Updated to handle insufficient balance with user-friendly UI
  // ======================
  const handleWalletPay = async () => {

    // ======================================================
    // (0) CHECK EVENT STATUS
    // ======================================================
    if (isEventExpired) {
      alert('Sự kiện đã bắt đầu hoặc kết thúc. Không thể tiếp tục đặt vé.')
      return
    }

    // ======================================================
    // (1) KIỂM TRA THÔNG TIN VÉ CẦN THIẾT
    // ======================================================
    if (
      !state.eventId ||
      !state.categoryTicketId ||
      !state.seatIds ||
      state.seatIds.length === 0
    ) {
      alert('Missing ticket information. Please select ticket from Dashboard.')
      navigate('/dashboard')
      return
    }

    // ======================================================
    // (2) LẤY USER ID TỪ CONTEXT ĐĂNG NHẬP
    // ======================================================
    const userId = (user as any)?.userId ?? (user as any)?.id

    if (!userId) {
      alert('Please login before payment.')
      navigate('/login')
      return
    }

    // ======================================================
    // (3) VALIDATE VÀ CHUẨN BỊ DỮ LIỆU PAYLOAD
    // ======================================================
    const eventId = Number(state.eventId)
    const categoryTicketId = Number(state.categoryTicketId)
    const seatIds = state.seatIds.map(id => Number(id))
    const amount = totalAmount

    // Validate all required fields
    if (!eventId || isNaN(eventId)) {
      alert('❌ Lỗi: EventID không hợp lệ')
      console.error('[PAYMENT_ERROR] Invalid eventId:', state.eventId)
      return
    }

    if (!categoryTicketId || isNaN(categoryTicketId)) {
      alert('❌ Lỗi: CategoryTicketID không hợp lệ')
      console.error('[PAYMENT_ERROR] Invalid categoryTicketId:', state.categoryTicketId)
      return
    }

    if (!seatIds || seatIds.length === 0 || seatIds.some(isNaN)) {
      alert('❌ Lỗi: SeatIDs không hợp lệ')
      console.error('[PAYMENT_ERROR] Invalid seatIds:', state.seatIds)
      return
    }

    // Log payload before sending
    const payload = {
      eventId,
      categoryTicketId,
      seatIds,
    }
    console.log('🚀 [WALLET_PAYMENT] PAYLOAD SENDING:', payload)
    console.log('🚀 [WALLET_PAYMENT] Total Amount:', amount)
    console.log('🚀 [WALLET_PAYMENT] User ID:', userId)

    // ======================================================
    // (4) GỬI REQUEST WALLET PAYMENT QUA FETCH API
    // ======================================================
    try {
      const response = await fetch('/api/wallet/pay-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        redirect: 'manual' // Don't auto-follow redirects, handle manually
      })

      // ======================================================
      // (5) XỬ LÝ LỖI KHÔNG ĐỦ SỐ DƯ (402 Payment Required)
      // ======================================================
      if (response.status === 402) {
        try {
          const errorData = await response.json()

          // Extract shortage information from backend response
          const shortage = errorData.shortage || 0
          const required = errorData.required || totalAmount
          const current = errorData.current || walletBalance || 0

          console.log('💳 [INSUFFICIENT_BALANCE] Shortage:', shortage, 'Required:', required, 'Current:', current)

          // Show error modal with shortage information
          setErrorData({
            errorType: 'insufficient_balance',
            shortage: shortage,
            currentBalance: current,
            totalAmount: required,
          })
          setShowErrorModal(true)
        } catch (parseError) {
          // Fallback if JSON parsing fails
          const errorText = await response.text()
          setErrorData({
            errorType: 'insufficient_balance',
            shortage: 0,
            currentBalance: walletBalance || 0,
            totalAmount: totalAmount,
            errorMessage: errorText
          })
          setShowErrorModal(true)
        }
        return
      }

      // ======================================================
      // (6) XỬ LÝ REDIRECT (SUCCESS) - Status 302/303
      // ======================================================
      if (response.type === 'opaqueredirect' || response.status === 302 || response.status === 303) {
        // Backend đã redirect, follow nó
        const redirectUrl = response.headers.get('Location')
        if (redirectUrl) {
          window.location.href = redirectUrl
        } else {
          // Fallback: assume success          emitWalletRefresh() // Refresh wallet balance khi thanh toán thành công          navigate('/dashboard/payment/success?status=success&method=wallet')
        }
        return
      }

      // ======================================================
      // (7) XỬ LÝ CÁC LỖI KHÁC
      // ======================================================
      if (!response.ok) {
        const errorText = await response.text()
        let cleanMsg = errorText
        let errCode = ''
        let remSecs = 0
        let pendingBillId = 0
        let seats: string[] = []
        let seatIds: number[] = []
        let eventId = 0
        let categoryTicketId = 0

        try {
          const jsonErr = JSON.parse(errorText)
          cleanMsg = jsonErr.message || jsonErr.error || errorText
          errCode = jsonErr.errorCode || ''
          remSecs = jsonErr.remainingSeconds || 0
          pendingBillId = Number(jsonErr.pendingBillId) || 0
          seats = jsonErr.seats || []
          seatIds = jsonErr.seatIds || []
          eventId = jsonErr.eventId || 0
          categoryTicketId = jsonErr.categoryTicketId || 0
        } catch {}

        if (errCode === 'E4002') {
          setResumeData({
            pendingBillId,
            seats,
            seatIds,
            eventId,
            categoryTicketId,
            remainingSeconds: remSecs
          })
          setShowResumeModal(true)
          return
        }

        if (errCode === 'E4003' || cleanMsg.includes('E4003')) {
          const minutes = Math.floor(remSecs / 60)
          const seconds = remSecs % 60
          const formattedMinutes = minutes.toString().padStart(2, '0')
          const formattedSeconds = seconds.toString().padStart(2, '0')
          cleanMsg = `Tài khoản của bạn đã bị tạm khóa tính năng đặt vé. Vui lòng thử lại sau: ${formattedMinutes} phút ${formattedSeconds} giây do có hành vi giữ chỗ rác liên tục.`
          setErrorData({
            errorType: 'general',
            errorMessage: cleanMsg
          })
          setShowErrorModal(true)
          return
        }

        // Check for duplicate entry (seat already taken)
        if (
          cleanMsg.includes('Duplicate entry') || 
          cleanMsg.includes('1062') || 
          cleanMsg.includes('trạng thái xử lý thanh toán') || 
          cleanMsg.includes('violates unique constraint') ||
          cleanMsg.includes('Ghế đặt hiện đang nằm')
        ) {
          console.log('🪑 [DUPLICATE_SEAT] Seat already taken or processing')
          setErrorData({
            errorType: 'duplicate_entry',
            errorMessage: cleanMsg
          })
          setShowErrorModal(true)
          return
        }

        // Check for specific error messages from backend
        if (cleanMsg.includes('wallet_not_enough') || cleanMsg.includes('insufficient_balance')) {
          // Parse shortage if available
          try {
            const errorJson = JSON.parse(errorText)
            setErrorData({
              errorType: 'insufficient_balance',
              shortage: errorJson.shortage || 0,
              currentBalance: errorJson.current || walletBalance || 0,
              totalAmount: errorJson.required || totalAmount,
              errorMessage: cleanMsg
            })
          } catch {
            setErrorData({
              errorType: 'insufficient_balance',
              shortage: 0,
              currentBalance: walletBalance || 0,
              totalAmount: totalAmount,
              errorMessage: cleanMsg
            })
          }
          setShowErrorModal(true)
          return
        }

        // For other errors, show general error
        console.error('❌ [PAYMENT_ERROR]', cleanMsg)
        setErrorData({
          errorType: 'general',
          errorMessage: cleanMsg || 'Đã có lỗi xảy ra trong quá trình xử lý, vui lòng thử lại sau.',
        })
        setShowErrorModal(true)
        return
      }

      // ======================================================
      // (8) WALLET PAYMENT SUCCESS — đọc ticketIds từ JSON response
      // ======================================================
      try {
        const successData = await response.json()
        const ids = successData?.ticketIds ?? ''
        // emailFailed=1 nếu backend báo gửi mail thất bại (field emailFailed)
        const emailFailedFlag = successData?.emailFailed ? '&emailFailed=1' : ''
        emitWalletRefresh()
        navigate(
          `/dashboard/payment/success?status=success&method=wallet${ids ? `&ticketIds=${encodeURIComponent(ids)}` : ''}${emailFailedFlag}`
        )
      } catch {
        // Nếu parse JSON thất bại, dùng fallback không có ticketIds
        emitWalletRefresh()
        navigate('/dashboard/payment/success?status=success&method=wallet')
      }

    } catch (error: any) {
      console.error('Wallet payment error:', error)

      // Check if error is a duplicate entry error
      const errorMsg = error.message || error.toString()
      let cleanMsg = errorMsg
      try {
        const jsonErr = JSON.parse(errorMsg)
        cleanMsg = jsonErr.message || jsonErr.error || errorMsg
      } catch {}

      if (
        cleanMsg.includes('Duplicate entry') || 
        cleanMsg.includes('1062') || 
        cleanMsg.includes('trạng thái xử lý thanh toán') || 
        cleanMsg.includes('violates unique constraint') ||
        cleanMsg.includes('Ghế đặt hiện đang nằm')
      ) {
        setErrorData({
          errorType: 'duplicate_entry',
          errorMessage: cleanMsg
        })
        setShowErrorModal(true)
        return
      }

      // Show general error modal
      setErrorData({
        // For processing seats, trigger duplicate entry, otherwise general error
        errorType: 'general',
        errorMessage: cleanMsg || 'Đã có lỗi xảy ra trong quá trình xử lý, vui lòng thử lại sau.',
      })
      setShowErrorModal(true)
    }
  }

  const handleBankTransferPay = async () => {
    if (isEventExpired) {
      alert('Sự kiện đã bắt đầu hoặc kết thúc. Không thể tiếp tục đặt vé.')
      return
    }

    if (
      !state.eventId ||
      !state.categoryTicketId ||
      !state.seatIds ||
      state.seatIds.length === 0
    ) {
      alert('Thiếu thông tin vé, vui lòng chọn lại vé từ Dashboard.')
      navigate('/dashboard')
      return
    }

    const userId = (user as any)?.userId ?? (user as any)?.id
    if (!userId) {
      alert('Bạn cần đăng nhập trước khi thanh toán.')
      navigate('/login')
      return
    }

    // Nếu đã có order chuyển khoản đang hoạt động cho ghế này trong state (lấy từ backend lúc mount), hiển thị lại modal
    if (bankTransferOrder) {
      setShowBankTransferModal(true)
      
      if (pollingIntervalId) {
        window.clearInterval(pollingIntervalId)
      }

      const intervalId = window.setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/payment/check-status/${bankTransferOrder.order_id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          if (statusRes.ok) {
            const statusData = await statusRes.json()
            if (statusData.status === 'PAID') {
              window.clearInterval(intervalId)
              setShowBankTransferModal(false)
              const seatIdsParam = (bankTransferOrder as any).seatIds?.join(',') || state.seatIds?.join(',') || ''
              navigate(
                `/dashboard/payment/success?status=success&method=bank_transfer&billId=${bankTransferOrder.order_id}&ticketIds=${seatIdsParam}`
              )
            } else if (statusData.status === 'CANCELED' || statusData.status === 'EXPIRED' || statusData.status === 'FAILED') {
              window.clearInterval(intervalId)
              setShowBankTransferModal(false)
              setPollingIntervalId(null)
              alert('Giao dịch chuyển khoản đã hết hạn giữ chỗ (5 phút) và bị hủy trên hệ thống.')
              navigate('/dashboard')
            }
          }
        } catch (pollErr) {
          console.error('Lỗi check status:', pollErr)
        }
      }, 3000)
      setPollingIntervalId(intervalId)
      return
    }

    setCreatingOrder(true)

    try {
      const payload = {
        eventId: Number(state.eventId),
        categoryTicketId: Number(state.categoryTicketId),
        seatIds: state.seatIds.map(id => Number(id))
      }

      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorMsgRaw = await response.text()
        let cleanMsg = errorMsgRaw
        let errCode = ''
        let remSecs = 0
        let pendingBillId = 0
        let seats: string[] = []
        let seatIds: number[] = []
        let eventId = 0
        let categoryTicketId = 0

        try {
          const jsonErr = JSON.parse(errorMsgRaw)
          cleanMsg = jsonErr.message || jsonErr.error || errorMsgRaw
          errCode = jsonErr.errorCode || ''
          remSecs = jsonErr.remainingSeconds || 0
          pendingBillId = Number(jsonErr.pendingBillId) || 0
          seats = jsonErr.seats || []
          seatIds = jsonErr.seatIds || []
          eventId = jsonErr.eventId || 0
          categoryTicketId = jsonErr.categoryTicketId || 0
        } catch {}

        if (errCode === 'E4002') {
          setResumeData({
            pendingBillId,
            seats,
            seatIds,
            eventId,
            categoryTicketId,
            remainingSeconds: remSecs
          })
          setShowResumeModal(true)
          return
        }

        if (errCode === 'E4003' || cleanMsg.includes('E4003')) {
          const minutes = Math.floor(remSecs / 60)
          const seconds = remSecs % 60
          const formattedMinutes = minutes.toString().padStart(2, '0')
          const formattedSeconds = seconds.toString().padStart(2, '0')
          cleanMsg = `Tài khoản của bạn đã bị tạm khóa tính năng đặt vé. Vui lòng thử lại sau: ${formattedMinutes} phút ${formattedSeconds} giây do có hành vi giữ chỗ rác liên tục.`
        }
        throw new Error(cleanMsg || 'Không thể tạo đơn hàng chuyển khoản')
      }

      const data = await response.json()
      const orderWithState = { ...data, seatIds: state.seatIds }
      setBankTransferOrder(orderWithState)

      // Pre-calculate initial timeLeft to prevent visual flash
      const expireTime = new Date(orderWithState.expiresAt || orderWithState.expire_at).getTime()
      const initialSeconds = Math.max(0, Math.floor((expireTime - Date.now()) / 1000))
      setTimeLeft(initialSeconds)

      setShowBankTransferModal(true)

      // Bắt đầu polling mỗi 3 giây
      const intervalId = window.setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/payment/check-status/${data.order_id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          if (statusRes.ok) {
            const statusData = await statusRes.json()
            if (statusData.status === 'PAID') {
              window.clearInterval(intervalId)
              setShowBankTransferModal(false)
              navigate(
                `/dashboard/payment/success?status=success&method=bank_transfer&billId=${data.order_id}&ticketIds=${state.seatIds?.join(',')}`
              )
            } else if (statusData.status === 'CANCELED' || statusData.status === 'EXPIRED' || statusData.status === 'FAILED') {
              window.clearInterval(intervalId)
              setShowBankTransferModal(false)
              setPollingIntervalId(null)
              alert('Giao dịch chuyển khoản đã hết hạn giữ chỗ (5 phút) và bị hủy trên hệ thống.')
              navigate('/dashboard')
            }
          }
        } catch (pollErr) {
          console.error('Lỗi khi gọi API check payment status:', pollErr)
        }
      }, 3000)

      setPollingIntervalId(intervalId)

    } catch (error: any) {
      console.error('Bank transfer order creation failed:', error)
      alert(error.message || 'Không thể tạo đơn hàng chuyển khoản. Vui lòng thử lại.')
    } finally {
      setCreatingOrder(false)
    }
  }

  const handleCancelBankTransfer = async () => {
    if (pollingIntervalId) {
      window.clearInterval(pollingIntervalId)
      setPollingIntervalId(null)
    }

    // Chủ động gửi yêu cầu hủy đơn hàng lên backend để giải phóng ghế ngay lập tức
    if (bankTransferOrder?.order_id) {
      try {
        const response = await fetch('/api/payment/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ order_id: bankTransferOrder.order_id })
        })

        if (!response.ok) {
          const errorMsg = await response.text()
          throw new Error(errorMsg || 'Không thể hủy giao dịch')
        }

        // Hủy thành công dưới Database
        setShowBankTransferModal(false)
        navigate('/dashboard')
      } catch (err: any) {
        console.error('Error during active order cancellation:', err)
        alert('Có lỗi xảy ra khi hủy giao dịch: ' + (err.message || 'Vui lòng thử lại.'))
      }
    } else {
      setShowBankTransferModal(false)
      navigate('/dashboard')
    }
  }

  const handleCloseBankTransferModal = () => {
    if (pollingIntervalId) {
      window.clearInterval(pollingIntervalId)
      setPollingIntervalId(null)
    }
    setShowBankTransferModal(false)
  }


  // ======================== RENDER UI ========================

  return (
    // Container căn giữa, giới hạn độ rộng
    <div className="max-w-2xl mx-auto">
      {/* -------------------- NÚT QUAY LẠI -------------------- */}
      {/* Link về dashboard, chuyển trang trong SPA, không reload */}
      <Link
        to="/dashboard" // route dashboard
        className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        {/* Icon mũi tên */}
        <ArrowLeft className="w-4 h-4 mr-2" />
        {/* Text */}
        Quay lại Dashboard
      </Link>

      {/* -------------------- CARD CHÍNH -------------------- */}
      {/* Card nền trắng + shadow */}
      <div className="bg-white rounded-lg shadow-md p-8">
        {/* ========== HEADER ========== */}
        <div className="flex items-center mb-6">
          {/* Icon tròn xanh nhạt */}
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>

          {/* Tiêu đề + mô tả */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Thanh toán vé</h1>
            <p className="text-sm text-gray-500">
              Xác nhận thông tin và tiến hành thanh toán qua VNPay.
            </p>
          </div>
        </div>

        {/* ⏳ Page-Level Countdown Timer & Active Cancel Button */}
        {bankTransferOrder && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-red-700 w-full sm:w-auto">
              <Clock className="w-5 h-5 flex-shrink-0 text-red-600 animate-pulse" />
              <div>
                <p className="text-sm font-bold">Giao dịch đang được xử lý (Giữ ghế tạm thời)</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Thời gian giữ vé còn lại: <span className="font-mono font-bold text-sm bg-red-100 px-2 py-0.5 rounded text-red-800 ml-1">{formatTimeLeft(timeLeft)}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelBankTransfer}
              className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shadow-sm"
            >
              Hủy giao dịch & Giải phóng ghế
            </button>
          </div>
        )}

        {/* ========== THÔNG TIN VÉ ========== */}
        {/* Box hiển thị thông tin vé để user xác nhận trước khi trả tiền */}
        <div className="border rounded-lg p-4 mb-6 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Thông tin vé
          </h2>

          {/* Danh sách thông tin vé */}
          <div className="space-y-1 text-sm text-gray-600">
            {/* ----- Tên sự kiện ----- */}
            <p>
              Sự kiện:{' '}
              <span className="font-medium">
                {/* Nếu state.eventTitle không có thì hiển thị fallback */}
                {state.eventTitle || 'Sự kiện demo (mock)'}
              </span>
            </p>

            {/* ----- Loại vé ----- */}
            {/* 
              Conditional rendering:
              - Nếu có ticketBreakdown (nhiều loại vé) → hiển thị từng loại
              - Nếu chỉ có ticketName → hiển thị tên 1 loại
              - Nếu không có gì → không render
            */}
            {state.ticketBreakdown && state.ticketBreakdown.length > 0 ? (
              <p>
                Loại vé:{' '}
                <span className="font-medium">
                  {/* Duyệt qua từng loại vé và hiển thị: "Tên x Số lượng" */}
                  {state.ticketBreakdown.map((t, idx) => (
                    <span key={idx}>
                      {t.name} x{t.count}
                      {/* Nếu chưa phải item cuối → thêm dấu phẩy */}
                      {idx < state.ticketBreakdown!.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              </p>
            ) : state.ticketName ? (
              <p>
                Loại vé:{' '}
                <span className="font-medium">{state.ticketName}</span>
              </p>
            ) : null}

            {/* ----- Vị trí ghế ----- */}
            {/* Chỉ hiển thị nếu có rowNo hoặc seatCodes */}
            {(state.rowNo ||
              (state.seatCodes && state.seatCodes.length > 0)) && (
                <p>
                  Vị trí ghế:{' '}
                  <span className="font-medium">
                    {/* Nếu có rowNo thì hiển thị "Hàng X" */}
                    {state.rowNo ? `Hàng ${state.rowNo}` : ''}

                    {/* Nếu có cả hàng và ghế thì thêm dấu phẩy ngăn cách */}
                    {state.rowNo &&
                      state.seatCodes &&
                      state.seatCodes.length > 0
                      ? ', '
                      : ''}

                    {/* Nếu có seatCodes thì hiển thị "Ghế A1, A2" */}
                    {state.seatCodes && state.seatCodes.length > 0
                      ? `Ghế ${state.seatCodes.join(', ')}`
                      : ''}
                  </span>
                </p>
              )}

            {/* ----- Số tiền ----- */}
            <p>
              Số tiền:{' '}
              <span className="font-semibold text-gray-900">
                {/*
                  toLocaleString('vi-VN'): format số theo chuẩn VN
                  Ví dụ: 1000000 → "1.000.000"
                  Fallback: ưu tiên totalAmount, nếu không có thì dùng pricePerTicket, nếu vẫn không có thì 0
                */}
                {(state.totalAmount || state.pricePerTicket || 0).toLocaleString(
                  'vi-VN',
                )}{' '}
                đ
              </span>
            </p>

            {/* ----- Chi tiết tính tiền (nếu có) ----- */}
            {/* Nếu có quantity và pricePerTicket → hiển thị "SL x giá" */}
            {state.quantity && state.pricePerTicket && (
              <p className="text-xs text-gray-500">
                {state.quantity} x {state.pricePerTicket.toLocaleString('vi-VN')}{' '}
                đ
              </p>
            )}
          </div>
        </div>

        {/* ========== PHƯƠNG THỨC THANH TOÁN & NÚT BẤM ========== */}
        <div className="space-y-4">
          {/* ----- Dropdown chọn phương thức ----- */}
          {/* 
            Hiện tại chỉ có VNPay
            Dùng <select> để sau này dễ mở rộng (Momo, ZaloPay...)
          */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phương thức thanh toán
            </label>

            {/* select cho phép chọn VNPay hoặc Wallet */}
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              disabled={isEventExpired || checkingEventTime}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="momo">Ví điện tử MoMo</option>
              <option value="wallet">Wallet (Ví nội bộ)</option>
              <option value="bank_transfer">Chuyển khoản Ngân hàng (VietQR / SePay)</option>
            </select>
          </div>

          {/* ⭐ NEW: Event Expired Warning */}
          {isEventExpired && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-red-800">
                    Ngừng bán vé
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>Cổng bán vé đã đóng vì sự kiện đã bắt đầu hoặc đã kết thúc (vào lúc {eventStartTime ? formatVietnamDateTime(eventStartTime, 'dd/MM/yyyy HH:mm') : 'thời điểm xác định'}). Vui lòng chọn sự kiện khác.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ----- Wallet Balance Warning ----- */}
          {paymentMethod === 'wallet' && isWalletDisabled && !isEventExpired && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-amber-800">
                    Số dư ví không đủ
                  </h3>
                  <div className="mt-2 text-sm text-amber-700">
                    <p>Số dư hiện tại: <span className="font-bold">{(walletBalance || 0).toLocaleString('vi-VN')} đ</span></p>
                    <p>Số tiền cần thanh toán: <span className="font-bold">{totalAmount.toLocaleString('vi-VN')} đ</span></p>
                    <p className="mt-1">Thiếu: <span className="font-bold text-amber-900">{insufficientAmount.toLocaleString('vi-VN')} đ</span></p>
                  </div>
                  <p className="mt-3 text-sm text-amber-700">
                    💡 Vui lòng sử dụng <span className="font-semibold">Ví điện tử MoMo</span> để thanh toán
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ----- Nút thanh toán ----- */}
          {/* 
            type="button": tránh submit (nếu nằm trong form)
            onClick={handlePay}: gọi hàm tạo URL và redirect sang backend
          */}
          <button
            type="button"
            onClick={
              paymentMethod === 'momo'
                ? handleMoMoPay
                : paymentMethod === 'wallet'
                  ? handleWalletPay
                  : handleBankTransferPay
            }
            disabled={
              (paymentMethod === 'wallet' && isWalletDisabled) ||
              isEventExpired ||
              checkingEventTime ||
              creatingOrder
            }
            className={`w-full inline-flex items-center justify-center px-4 py-3 rounded-lg font-semibold ${(paymentMethod === 'wallet' && isWalletDisabled) ||
              isEventExpired ||
              checkingEventTime ||
              creatingOrder
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            <CreditCard className="w-5 h-5 mr-2" />
            {checkingEventTime
              ? 'Đang kiểm tra...'
              : creatingOrder
                ? 'Đang xử lý...'
                : isEventExpired
                  ? 'Ngừng bán vé'
                  : paymentMethod === 'momo'
                    ? 'Thanh toán qua ví MoMo'
                    : paymentMethod === 'wallet'
                      ? 'Thanh toán bằng Wallet'
                      : 'Thanh toán chuyển khoản'}
          </button>

          {/* ----- Ghi chú ----- */}
          {/* &quot; là HTML entity cho dấu ngoặc kép " để JSX không lỗi */}
          <p className="text-xs text-gray-400 text-center">
            {isEventExpired ? (
              <>Sự kiện đã bắt đầu. Vui lòng quay lại trang chủ để xem các sự kiện khác.</>
            ) : checkingEventTime ? (
              <>Đang kiểm tra trạng thái sự kiện...</>
            ) : paymentMethod === 'momo' ? (
              <>Khi bấm "Thanh toán qua ví MoMo", bạn sẽ được chuyển sang cổng thanh toán MoMo để hoàn tất giao dịch.</>
            ) : paymentMethod === 'wallet' ? (
              <>Khi bấm "Thanh toán bằng Wallet", hệ thống sẽ trừ tiền trong ví và chuyển bạn tới trang xác nhận.</>
            ) : (
              <>Khi bấm "Thanh toán chuyển khoản", một mã VietQR sẽ hiển thị để bạn quét mã thanh toán.</>
            )}
          </p>
        </div>
      </div>

      {/* SePay Bank Transfer Modal */}
      <VietQRModal
        isOpen={showBankTransferModal}
        timeLeft={timeLeft}
        bankTransferOrder={bankTransferOrder}
        transferDescription={transferDescription}
        onClose={handleCloseBankTransferModal}
        onCancel={handleCancelBankTransfer}
      />

      {/* Payment Error Modal */}
      <PaymentErrorModal
        isOpen={showErrorModal}
        errorType={errorData?.errorType || 'general'}
        totalAmount={errorData?.totalAmount || totalAmount}
        currentBalance={errorData?.currentBalance || walletBalance || 0}
        shortage={errorData?.shortage || 0}
        errorMessage={errorData?.errorMessage}
        onClose={() => setShowErrorModal(false)}
        onRetryWithVNPay={() => {
          setShowErrorModal(false)
          setPaymentMethod('momo')
          setTimeout(() => handleMoMoPay(), 100)
        }}
        onReturnToSeats={() => {
          setShowErrorModal(false)
          navigate('/dashboard')
        }}
      />

      {/* ⚡ Smart Resume Modal (E4002) */}
      {showResumeModal && resumeData && (
        <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto backdrop-blur-sm transition-all duration-300 flex items-center justify-center">
          {/* Centering wrapper */}
          <div className="flex items-center justify-center min-h-screen p-4 w-full">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 transform scale-100 transition-all duration-300">
              {/* Header with cool blue gradient */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6 text-white text-center relative">
                <div className="mx-auto w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3 animate-pulse">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold">Khôi phục thanh toán?</h3>
                <p className="text-blue-100 text-xs mt-1 font-medium">Hệ thống phát hiện giao dịch đang dở dang</p>
              </div>

              {/* Body */}
              <div className="px-6 py-6 space-y-4">
                <p className="text-gray-700 text-sm leading-relaxed text-center">
                  Bạn đang có một đơn hàng giữ chỗ chưa hoàn tất cho ghế{' '}
                  <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                    [{resumeData.seats.join(', ')}]
                  </span>{' '}
                  (Còn lại <span className="font-semibold text-red-600 font-mono bg-red-50 px-1.5 py-0.5 rounded text-sm">{formatTimeLeft(resumeData.remainingSeconds)}</span>).
                  <br />
                  Bạn muốn làm gì tiếp theo?
                </p>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">⚠️ Lưu ý an toàn:</p>
                  <p>• Nhấn <strong>Hủy bỏ đơn cũ & Đặt ghế mới</strong> sẽ giải phóng ghế cũ của bạn và cộng 1 điểm phạt failed checkout count.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-6 pb-6 pt-2 space-y-2.5">
                {/* Button 1: Resume */}
                <button
                  type="button"
                  onClick={() => {
                    setShowResumeModal(false)
                    navigate('/dashboard/payment', {
                      state: {
                        eventId: resumeData.eventId,
                        categoryTicketId: resumeData.categoryTicketId,
                        seatIds: resumeData.seatIds,
                        seatCodes: resumeData.seats,
                        eventTitle: state.eventTitle || 'Sự kiện',
                        ticketName: state.ticketName,
                        pricePerTicket: state.pricePerTicket,
                        quantity: resumeData.seats.length,
                        totalAmount: state.pricePerTicket ? state.pricePerTicket * resumeData.seats.length : state.totalAmount
                      }
                    })
                  }}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center text-sm"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Tiếp tục thanh toán đơn cũ
                </button>

                {/* Button 2: Cancel & Reorder */}
                <button
                  type="button"
                  onClick={handleCancelAndReorder}
                  className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl border border-red-200 transition-all duration-200 flex items-center justify-center text-sm"
                >
                  <X className="w-4 h-4 mr-2" />
                  Hủy bỏ đơn cũ & Đặt ghế mới
                </button>

                {/* Close/Skip option */}
                <button
                  type="button"
                  onClick={() => setShowResumeModal(false)}
                  className="w-full py-1 text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  Đóng hộp thoại
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ======================== END OF FILE ========================


