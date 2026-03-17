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
import { CreditCard, ArrowLeft } from 'lucide-react'
// CreditCard: icon thẻ/ thanh toán
// ArrowLeft: icon mũi tên quay lại

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

  // payment method: 'vnpay' or 'wallet'
  const [paymentMethod, setPaymentMethod] = useState<'vnpay' | 'wallet'>('vnpay')

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
        const savedToken = token ?? 'cookie-auth'
        const userId = (user as any)?.userId ?? (user as any)?.id

        if (!userId || !savedToken) {
          setLoadingBalance(false)
          return
        }

        const response = await fetch(`/api/wallet/balance?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${savedToken}`
          }
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
            'Authorization': `Bearer ${token || 'cookie-auth'}`
          }
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
  const handlePay = async () => {
    // ===== BƯỚC 0: CHECK EVENT STATUS =====
    if (isEventExpired) {
      alert('Sự kiện đã bắt đầu hoặc kết thúc. Không thể tiếp tục đặt vé.')
      return
    }

    // ===== BƯỚC 1: VALIDATE DỮ LIỆU VÉ =====

    // Nếu thiếu eventId/categoryTicketId hoặc không có seatIds → báo lỗi + về dashboard
    // (tùy nghiệp vụ: nếu vé không có ghế thì seatIds có thể không bắt buộc, nhưng code hiện tại đang bắt buộc)
    if (
      !state.eventId ||
      !state.categoryTicketId ||
      !state.seatIds ||
      state.seatIds.length === 0
    ) {
      // alert: popup thông báo nhanh cho user
      alert('Thiếu thông tin vé, vui lòng chọn lại vé từ Dashboard.')

      // chuyển về /dashboard để user chọn lại vé
      navigate('/dashboard')
      return // dừng hàm tại đây
    }

    // ===== BƯỚC 2: KIỂM TRA ĐĂNG NHẬP =====

    /**
     * Lấy userId từ object user:
     * - Một số backend trả user.userId
     * - Một số backend trả user.id
     * -> dùng ?? để fallback nếu userId undefined/null thì lấy id
     */
    const userId = (user as any)?.userId ?? (user as any)?.id

    // Nếu không có userId → user chưa login hoặc context chưa có user
    if (!userId) {
      alert('Bạn cần đăng nhập trước khi thanh toán.')

      // điều hướng sang trang login
      navigate('/login')
      return
    }

    // ===== BƯỚC 3: TẠO URL VỚI QUERY PARAMS =====

    /**
     * URLSearchParams:
     * - Tạo query string chuẩn: key=value&key2=value2...
     * - Tự encode các ký tự đặc biệt (space, &, =,...)
     *
     * Mục tiêu: gửi dữ liệu cần thiết cho backend tạo đơn thanh toán VNPay
     */
    const params = new URLSearchParams({
      userId: String(userId), // ép về string để URLSearchParams nhận
      eventId: String(state.eventId),
      categoryTicketId: String(state.categoryTicketId),

      // seatIds: mảng id ghế → join thành chuỗi "1,2,3"
      seatIds: state.seatIds.join(','),
    })

    /**
     * paymentUrl:
     * - Gọi vào endpoint backend (thông qua proxy /api)
     * - Vite proxy sẽ chuyển /api/payment-ticket sang backend thật
     * - Tránh CORS khi dev
     */
    const apiUrl = `/api/payment-ticket?${params.toString()}`

    // ===== BƯỚC 4: GỌI API VÀ REDIRECT SANG VNPAY =====

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Không thể tạo link thanh toán')
      }

      const data = await response.json()

      // ✅ 0đ BYPASS: Vé miễn phí - backend đã tạo BOOKED trực tiếp, chuyển thẳng sang trang thành công
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

      window.location.replace(data.paymentUrl)

    } catch (error: any) {
      console.error('Payment error:', error)
      alert(error.message || 'Có lỗi xảy ra khi tạo thanh toán. Vui lòng thử lại.')
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
      const savedToken = token ?? 'cookie-auth'

      const response = await fetch('/api/wallet/pay-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(savedToken && { 'Authorization': `Bearer ${savedToken}` })
        },
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

        // Check for duplicate entry (seat already taken)
        if (errorText.includes('Duplicate entry') || errorText.includes('1062')) {
          console.log('🪑 [DUPLICATE_SEAT] Seat already taken')
          setErrorData({
            errorType: 'duplicate_entry',
          })
          setShowErrorModal(true)
          return
        }

        // Check for specific error messages from backend
        if (errorText.includes('wallet_not_enough') || errorText.includes('insufficient_balance')) {
          // Parse shortage if available
          try {
            const errorJson = JSON.parse(errorText)
            setErrorData({
              errorType: 'insufficient_balance',
              shortage: errorJson.shortage || 0,
              currentBalance: errorJson.current || walletBalance || 0,
              totalAmount: errorJson.required || totalAmount,
            })
          } catch {
            setErrorData({
              errorType: 'insufficient_balance',
              shortage: 0,
              currentBalance: walletBalance || 0,
              totalAmount: totalAmount,
            })
          }
          setShowErrorModal(true)
          return
        }

        // For other errors, show general error
        console.error('❌ [PAYMENT_ERROR]', errorText)
        setErrorData({
          errorType: 'general',
          errorMessage: errorText || 'Đã có lỗi xảy ra trong quá trình xử lý, vui lòng thử lại sau.',
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

      if (errorMsg.includes('Duplicate entry') || errorMsg.includes('1062')) {
        setErrorData({
          errorType: 'duplicate_entry',
        })
        setShowErrorModal(true)
        return
      }

      // Show general error modal
      setErrorData({
        errorType: 'general',
        errorMessage: errorMsg || 'Đã có lỗi xảy ra trong quá trình xử lý, vui lòng thử lại sau.',
      })
      setShowErrorModal(true)
    }
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
              <option value="vnpay">VNPay (Internet Banking / Thẻ)</option>
              <option value="wallet">Wallet (Ví nội bộ)</option>
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
                    <p>Sự kiện đã bắt đầu hoặc kến thúc lúc {eventStartTime ? formatVietnamDateTime(eventStartTime, 'dd/MM/yyyy HH:mm') : 'thời điểm xác định'}.  </p>
                    <p className="mt-1">Không thể tiếp tục đặt vé cho sự kiện này.</p>
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
                    💡 Vui lòng sử dụng <span className="font-semibold">VNPay</span> để thanh toán
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
            onClick={paymentMethod === 'vnpay' ? handlePay : handleWalletPay}
            disabled={(paymentMethod === 'wallet' && isWalletDisabled) || isEventExpired || checkingEventTime}
            className={`w-full inline-flex items-center justify-center px-4 py-3 rounded-lg font-semibold ${(paymentMethod === 'wallet' && isWalletDisabled) || isEventExpired || checkingEventTime
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            <CreditCard className="w-5 h-5 mr-2" />
            {checkingEventTime
              ? 'Đang kiểm tra...'
              : isEventExpired
                ? 'Ngừng bán vé'
                : paymentMethod === 'vnpay' ? 'Thanh toán qua VNPay' : 'Thanh toán bằng Wallet'}
          </button>

          {/* ----- Ghi chú ----- */}
          {/* &quot; là HTML entity cho dấu ngoặc kép " để JSX không lỗi */}
          <p className="text-xs text-gray-400 text-center">
            {isEventExpired ? (
              <>Sự kiện đã bắt đầu. Vui lòng quay lại trang chủ để xem các sự kiện khác.</>
            ) : checkingEventTime ? (
              <>Đang kiểm tra trạng thái sự kiện...</>
            ) : paymentMethod === 'vnpay' ? (
              <>Khi bấm "Thanh toán qua VNPay", bạn sẽ được chuyển sang cổng thanh toán VNPay để hoàn tất giao dịch.</>
            ) : (
              <>Khi bấm "Thanh toán bằng Wallet", hệ thống sẽ trừ tiền trong ví và chuyển bạn tới trang xác nhận.</>
            )}
          </p>
        </div>
      </div>

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
          setPaymentMethod('vnpay')
          setTimeout(() => handlePay(), 100)
        }}
        onReturnToSeats={() => {
          setShowErrorModal(false)
          navigate('/dashboard')
        }}
      />
    </div>
  )
}

// ======================== END OF FILE ========================


