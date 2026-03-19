// ===================== FILE: src/components/events/EventDetailModal.tsx =====================
// Component Modal hiển thị chi tiết sự kiện + cho người dùng chọn ghế + chuyển sang trang thanh toán

// React hooks
import { useState, useEffect } from 'react'

// Điều hướng sang trang khác (payment)
import { useNavigate } from 'react-router-dom'

// Icon UI
import { Calendar, Users, Clock, MapPin, X } from 'lucide-react'

// Format ngày giờ
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

// Kiểu dữ liệu chi tiết event (định nghĩa trong types)
import type { EventDetail } from '../../types/event'

// SeatGrid: component hiển thị layout ghế, Seat là type ghế
import { SeatGrid, type Seat } from '../common/SeatGrid'

// ===================== TYPE: Ticket =====================
// Dữ liệu vé theo API BE / FE dùng
type Ticket = {
  categoryTicketId: number
  name: string
  description?: string | null
  price: number
  maxQuantity: number
  remaining?: number // ✅ FIX: số vé còn lại từ backend (maxQuantity - sold)
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

// ===================== PROPS =====================
// Props mà component cha truyền vào
interface EventDetailModalProps {
  isOpen: boolean                 // modal mở hay chưa
  onClose: () => void             // callback đóng modal
  event: EventDetail | null       // dữ liệu event (null nếu chưa load)
  loading: boolean                // trạng thái load event detail
  error: string | null            // lỗi khi load event detail
  token: string | null            // token auth để gọi API seat
  userRole?: string               // role user (ORGANIZER / STAFF / STUDENT / ...)
  onEdit?: () => void             // callback edit (dành cho organizer)
}

// ===================== COMPONENT =====================
export function EventDetailModal({
  isOpen,
  onClose,
  event,
  loading,
  error,
  token,
  userRole,
  onEdit,
}: EventDetailModalProps) {
  // Dùng để chuyển sang /dashboard/payment
  const navigate = useNavigate()

  // Nếu user là Organizer/Staff/Admin (cố gắng nhận diện các biến thể như
  // 'STAFF ADMIN', 'ORGENIZER'...) -> chỉ chặn đặt ghế, vẫn cho xem sơ đồ
  const isManager = !!(
    userRole &&
    /(?:ORGAN|ORGEN|STAFF|ADMIN)/i.test(String(userRole).trim())
  )

  // DEBUG: Log userRole and isManager to console
  console.log('EventDetailModal - userRole:', userRole, '- isManager:', isManager)
  console.log('DEBUG MODAL DATA:', event)

  // ===================== STATE =====================

  // Vé đang được user "chọn" (click vào dòng vé ở phần giá vé)
  // Thực tế logic chọn ghế không phụ thuộc 100% vào selectedTicket,
  // vì seatType (VIP/STANDARD) tự map giá.
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  // Danh sách ghế user đã chọn (tối đa 4 ghế)
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])

  // Tất cả ghế của event (vẽ lên SeatGrid)
  const [allSeats, setAllSeats] = useState<Seat[]>([])

  // Tổng số ghế VIP của khu vực + event (API trả total)
  const [loadingSeats, setLoadingSeats] = useState(false)

  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return undefined
  }

  const normalizeSeat = (rawSeat: ApiSeat): Seat | null => {
    const seatId = toNumber(rawSeat.seatId ?? rawSeat.seat_id)
    const seatCode = (rawSeat.seatCode ?? rawSeat.seat_code ?? '').toString()
    const areaId = toNumber(rawSeat.areaId ?? rawSeat.area_id ?? event?.areaId)

    if (!seatId || !seatCode || !areaId) {
      return null
    }

    const categoryTicketId = toNumber(
      rawSeat.categoryTicketId ?? rawSeat.category_ticket_id,
    )

    const rawStatus = String(rawSeat.status ?? '').trim().toUpperCase()
    let mappedStatus = 'ACTIVE'
    if (rawStatus === 'BOOKED' || rawStatus === 'CHECKED_IN' || rawStatus === 'OCCUPIED') {
      mappedStatus = 'BOOKED'
    } else if (rawStatus === 'PENDING' || rawStatus === 'HOLD' || rawStatus === 'RESERVED') {
      mappedStatus = 'PENDING'
    } else if (rawStatus === 'ACTIVE' || rawStatus === 'AVAILABLE' || rawStatus === '') {
      mappedStatus = 'ACTIVE'
    }

    const normalized: Seat = {
      seatId,
      seatCode,
      rowNo: (rawSeat.rowNo ?? rawSeat.row_no) as string | undefined,
      seatRow: (rawSeat.seatRow ?? rawSeat.seat_row) as string | undefined,
      colNo: rawSeat.colNo != null ? String(rawSeat.colNo) : rawSeat.col_no != null ? String(rawSeat.col_no) : undefined,
      seatColumn: toNumber(rawSeat.seatColumn ?? rawSeat.seat_column),
      status: mappedStatus,
      seatType: (rawSeat.seatType ?? rawSeat.seat_type) as string | undefined,
      categoryTicketId,
      categoryName: (rawSeat.categoryName ?? rawSeat.category_name ?? undefined) as string | undefined,
      areaId,
    }

    return normalized
  }

  // ===================== HELPER: CHECK TRẠNG THÁI GHẾ =====================

  /**
   * check ghế có cho click chọn được không
   * BE trả status ghế: 'AVAILABLE' | 'BOOKED' | 'CHECKED_IN' | 'PENDING'
   * => chỉ cho click khi 'AVAILABLE'
   */
  const isSeatAvailableForSelect = (seat: Seat) => {
    const status = String(seat.status ?? '').toUpperCase()
    return status === 'ACTIVE' || status === 'AVAILABLE'
  }

  /**
   * check ghế để đếm số "còn lại" theo loại VIP/STANDARD
   * chỉ đếm ghế AVAILABLE
   */
  const isSeatAvailableForCount = (seat: Seat, isVIP: boolean) => {
    const seatIsVIP = seat.seatType === 'VIP'
    const status = String(seat.status ?? '').toUpperCase()
    return seatIsVIP === isVIP && (status === 'ACTIVE' || status === 'AVAILABLE')
  }

  // ===================== EFFECT: LOAD SEAT LAYOUT =====================
  useEffect(() => {
    if (!event || loading) return

    setLoadingSeats(true)
    try {
      const rawSeats = (event.seats ?? []) as ApiSeat[]
      const normalizedSeats = rawSeats
        .map((seat) => normalizeSeat(seat))
        .filter((seat): seat is Seat => seat !== null)

      console.log('[EventDetailModal] Seats from event detail:', normalizedSeats.length)
      setAllSeats(normalizedSeats)
    } catch (err: any) {
      console.error('Error mapping event seats:', err)
      setAllSeats([])
    } finally {
      setLoadingSeats(false)
    }
  }, [event, loading])

  // ===================== HANDLE: CHỌN LOẠI VÉ =====================
  const handleSelectTicket = (ticket: Ticket) => {
    // Giữ nguyên ghế đã chọn, chỉ update selectedTicket để UI highlight
    setSelectedTicket(ticket)
  }

  // ===================== HANDLE: CHỌN/BỎ CHỌN GHẾ =====================
  const handleSeatSelect = (seat: Seat) => {
    if (!event) return

    // Không cho chọn nếu ghế không AVAILABLE
    if (!isSeatAvailableForSelect(seat)) {
      // Nếu PENDING (đang giữ chỗ khi thanh toán) => báo rõ cho user
      if (seat.status === 'PENDING') {
        alert(
          `Ghế ${seat.seatCode} đang được giữ chỗ trong quá trình thanh toán. Vui lòng chọn ghế khác.`,
        )
      }
      return
    }

    // setSelectedSeats theo kiểu "toggle"
    setSelectedSeats((prev) => {
      // Nếu ghế đã tồn tại => bỏ chọn
      const exists = prev.some((s) => s.seatId === seat.seatId)
      if (exists) {
        return prev.filter((s) => s.seatId !== seat.seatId)
      }

      // Giới hạn tối đa 4 ghế => nếu đủ rồi thì chặn thêm
      if (prev.length >= 4) {
        return prev
      }

      // Thêm ghế mới
      return [...prev, seat]
    })
  }

  // ===================== CONFIRM: TÍNH TIỀN + NAVIGATE SANG PAYMENT =====================
  const confirmSeats = () => {
    if (!event || selectedSeats.length === 0) return

    /**
     * Tính tiền dựa theo seatType:
     * - seatType VIP => lấy giá vé VIP
     * - seatType STANDARD => lấy giá vé STANDARD
     *
     * Lưu ý: code này tìm vé VIP bằng cách name có chứa 'VIP'
     * và vé standard là vé còn lại (không chứa VIP).
     */
    let totalAmount = 0
    const vipTicket = event.tickets?.find((t) => t.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((t) => !t.name.toUpperCase().includes('VIP'))

    // Đếm số ghế VIP và STANDARD (để hiển thị breakdown)
    let vipCount = 0
    let standardCount = 0

    // ✅ FIX: Map breakdown theo categoryTicketId trước, fallback seatType
    const breakdownMap = new Map<number, { ticket: typeof vipTicket; count: number }>()

    selectedSeats.forEach((seat) => {
      // Primary: match by categoryTicketId (exact matching, giá chính xác nhất)
      const matchedTicket = event.tickets?.find((t) => t.categoryTicketId === seat.categoryTicketId)
      if (matchedTicket) {
        totalAmount += matchedTicket.price
        const existing = breakdownMap.get(matchedTicket.categoryTicketId)
        if (existing) existing.count++
        else breakdownMap.set(matchedTicket.categoryTicketId, { ticket: matchedTicket, count: 1 })
      } else if (seat.seatType === 'VIP' && vipTicket) {
        // Fallback: match theo seatType và tên vé có 'VIP'
        totalAmount += vipTicket.price
        vipCount++
      } else if (standardTicket) {
        totalAmount += standardTicket.price
        standardCount++
      }
    })

    /**
     * ticketToUse: categoryTicketId truyền sang payment.
     * ✅ FIX: ưu tiên match theo categoryTicketId từ ghế đầu tiên đã chọn
     */
    const firstSeatTicket = event.tickets?.find(
      (t) => t.categoryTicketId === selectedSeats[0]?.categoryTicketId
    )
    const ticketToUse =
      selectedTicket ||
      firstSeatTicket ||
      (selectedSeats[0]?.seatType === 'VIP' ? vipTicket : standardTicket)

    if (!ticketToUse) {
      alert('Không tìm thấy loại vé phù hợp')
      return
    }

    // seatIds/seatCodes gửi sang payment
    const seatIds = selectedSeats.map((s) => s.seatId)
    const seatCodes = selectedSeats.map((s) => s.seatCode)

    // ticketBreakdown: dữ liệu để trang payment hiển thị chi tiết từng loại vé
    // ✅ FIX: Dùng breakdownMap từ categoryTicketId trước, sau đó fallback vipCount/standardCount
    const ticketBreakdown: Array<{ name: string; count: number; price: number }> = []
    if (breakdownMap.size > 0) {
      breakdownMap.forEach(({ ticket: t, count }) => {
        if (t) ticketBreakdown.push({ name: t.name, count, price: t.price })
      })
    }
    // Fallback: nếu không có breakdownMap (seats không có categoryTicketId)
    if (ticketBreakdown.length === 0) {
      if (vipCount > 0 && vipTicket) {
        ticketBreakdown.push({ name: vipTicket.name, count: vipCount, price: vipTicket.price })
      }
      if (standardCount > 0 && standardTicket) {
        ticketBreakdown.push({ name: standardTicket.name, count: standardCount, price: standardTicket.price })
      }
    }

    // Navigate sang trang payment và truyền state (React Router)
    navigate('/dashboard/payment', {
      state: {
        eventId: event.eventId,
        categoryTicketId: ticketToUse.categoryTicketId,

        seatIds,
        seatCodes,

        eventTitle: event.title,
        ticketName: ticketToUse.name,

        ticketBreakdown,      // chi tiết vé theo loại ghế
        pricePerTicket: ticketToUse.price,

        quantity: selectedSeats.length,
        totalAmount,
      },
    })
  }

  // ===================== CLOSE MODAL: RESET STATE =====================
  const handleClose = () => {
    // reset state để lần mở sau không bị dính dữ liệu cũ
    setSelectedTicket(null)
    setSelectedSeats([])
    setAllSeats([])
    onClose()
  }

  // Nếu modal chưa mở => không render gì
  if (!isOpen) return null

  // ===================== CHECK EVENT STATUS: ONGOING vs ENDED =====================
  // ⭐ DISTINGUISH: Sự kiện đang diễn ra vs Sự kiện đã kết thúc
  // - eventOngoing: currentTime >= startTime AND currentTime < endTime
  //   → Hiển thị ghế (read-only), không cho chọn/ confirm
  // - eventEnded: currentTime > endTime
  //   → Hiển thị ghế (read-only), không cho chọn/ confirm
  const now = new Date()
  const eventStart = event ? new Date(event.startTime) : null
  const eventEnd = event ? new Date(event.endTime) : null

  const eventOngoing = event && eventStart && eventEnd
    ? (now >= eventStart && now < eventEnd)
    : false

  const eventEnded = event && eventEnd
    ? (now > eventEnd)
    : false

  // ===================== CHECK EVENT CLOSED =====================
  // Nếu event.status === 'CLOSED' => event đã đóng => disable chọn ghế/confirm
  const eventClosed = event ? event.status === 'CLOSED' : false

  // ===================== TÍNH TỔNG TIỀN HIỂN THỊ Ở FOOTER =====================
  // ✅ FIX: Match theo categoryTicketId trước, fallback seatType
  let totalAmount = 0
  if (event && selectedSeats.length > 0) {
    const vipTicket = event.tickets?.find((t) => t.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((t) => !t.name.toUpperCase().includes('VIP'))

    selectedSeats.forEach((seat) => {
      // Primary: match by categoryTicketId
      const matchedTicket = event.tickets?.find((t) => t.categoryTicketId === seat.categoryTicketId)
      if (matchedTicket) {
        totalAmount += matchedTicket.price
      } else if (seat.seatType === 'VIP' && vipTicket) {
        totalAmount += vipTicket.price
      } else if (standardTicket) {
        totalAmount += standardTicket.price
      }
    })
  }

  // Chuỗi ghế đã chọn để hiển thị: "A1, A2, B3"
  const selectedSeatCodesText =
    selectedSeats.length > 0 ? selectedSeats.map((s) => s.seatCode).join(', ') : ''

  // ===================== UI RENDER =====================
  return (
    <>
      {/* ⭐ ABSOLUTE CENTERING: Fixed overlay + centered container */}
      <div className="fixed inset-0 bg-black/50 z-40 overflow-y-auto">
        {/* Centering wrapper */}
        <div className="flex items-center justify-center min-h-screen p-4">
          {/* Modal Card: responsive width + scrollable */}
          <div
            className="bg-white rounded-lg shadow-xl max-w-[90vw] w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()} // chặn click lan ra overlay (để không đóng khi click trong modal)
          >
            {/* ===== HEADER ===== */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-gray-900">
                {event?.title ?? 'Chi tiết sự kiện'}
              </h2>

              {/* Nút đóng */}
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

          {/* ===== CONTENT ===== */}
          <div className="p-6">
            {/* Khi đang load event detail */}
            {loading && (
              <p className="text-gray-500 text-center py-4">Đang tải chi tiết...</p>
            )}

            {/* Khi có lỗi */}
            {error && <p className="text-red-500 text-center py-4">Lỗi: {error}</p>}

            {/* Khi đã có event detail */}
            {!loading && !error && event && (
              <>
                {/* ===== BANNER CẢNH BÁO SỰ KIỆN ĐÃ ĐÓNG ===== */}
                {eventClosed && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg flex items-start gap-3">
                    <div className="text-red-600 text-2xl">⚠️</div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-red-800">Sự kiện này đã đóng</h4>
                      <p className="text-red-700 text-sm mt-1">
                        Bạn không thể thực hiện đặt vé vào lúc này. Vui lòng quay lại sau hoặc liên hệ ban tổ chức để biết thêm thông tin.
                      </p>
                    </div>
                  </div>
                )}

                {/* ===== BANNER ===== */}
                {event.bannerUrl && (
                  <div className="mb-6">
                    <img
                      src={event.bannerUrl}
                      alt={event.title}
                      className="w-full h-40 sm:h-64 object-cover rounded-lg"
                    />
                  </div>
                )}

                {/* ===== MÔ TẢ ===== */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Mô tả</h3>
                  <p className="text-gray-700">{event.description}</p>
                </div>

                {/* ===== THÔNG TIN EVENT ===== */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Thời gian */}
                  <div className="flex items-start">
                    <Calendar className="w-5 h-5 mr-2 mt-0.5 text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-600">Thời gian</p>
                      <p className="font-medium">
                        {format(new Date(event.startTime), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </p>
                      <p className="text-sm text-gray-600">đến</p>
                      <p className="font-medium">
                        {format(new Date(event.endTime), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </p>
                    </div>
                  </div>

                  {/* venueName + areaName */}
                  {event.venueName && (
                    <div className="flex items-start">
                      <MapPin className="w-5 h-5 mr-2 mt-0.5 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Địa điểm</p>
                        <p className="font-medium">{event.venueName}</p>

                        {/* Khu vực + tầng */}
                        {event.areaName && (
                          <p className="text-sm text-gray-700 mt-1">
                            Khu vực: <span className="font-medium">{event.areaName}</span>
                            {event.floor && (
                              <span className="text-gray-600"> (Tầng {event.floor})</span>
                            )}
                          </p>
                        )}

                        {/* Sức chứa khu vực */}
                        {event.areaCapacity != null && (
                          <p className="text-xs text-gray-500 mt-1">
                            Sức chứa khu vực: {event.areaCapacity} chỗ
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* location (nếu có) */}
                  {event.location && (
                    <div className="flex items-start">
                      <MapPin className="w-5 h-5 mr-2 mt-0.5 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Vị trí</p>
                        <p className="font-medium">{event.location}</p>
                      </div>
                    </div>
                  )}

                  {/* số chỗ */}
                  <div className="flex items-start">
                    <Users className="w-5 h-5 mr-2 mt-0.5 text-purple-600" />
                    <div>
                      <p className="text-sm text-gray-600">Số chỗ</p>
                      <p className="font-medium">Tối đa {event.maxSeats} người</p>
                      {event.currentParticipants != null && (
                        <p className="text-sm text-gray-600">Đã đăng ký: {event.currentParticipants}</p>
                      )}
                    </div>
                  </div>

                  {/* trạng thái */}
                  <div className="flex items-start">
                    <Clock className="w-5 h-5 mr-2 mt-0.5 text-orange-600" />
                    <div>
                      <p className="text-sm text-gray-600">Trạng thái</p>
                      <p className="font-medium">{event.status}</p>
                    </div>
                  </div>

                  {/* speaker (bio ngắn) */}
                  {event.speakerName && (!event.speakerBio || event.speakerBio.length <= 50) && (
                    <div className="flex items-start">
                      {event.speakerAvatarUrl ? (
                        <img
                          src={event.speakerAvatarUrl}
                          alt={event.speakerName}
                          className="w-10 h-10 sm:w-16 sm:h-16 rounded-full object-cover mr-3 mt-0.5"
                        />
                      ) : (
                        <span className="text-3xl mr-3">👤</span>
                      )}
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Diễn giả</p>
                        <p className="font-semibold text-base sm:text-lg">{event.speakerName}</p>
                        {event.speakerBio && (
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">{event.speakerBio}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Speaker Bio dài -> hiển thị block riêng full width */}
                {event.speakerName && event.speakerBio && event.speakerBio.length > 50 && (
                  <div className="mb-6 pb-6 border-b bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg">
                    <div className="flex items-start gap-6">
                      {event.speakerAvatarUrl && (
                        <img
                          src={event.speakerAvatarUrl}
                          alt={event.speakerName || 'Speaker'}
                          className="w-20 h-20 sm:w-32 sm:h-32 rounded-full object-cover shadow-lg flex-shrink-0"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg sm:text-2xl font-bold mb-3 flex items-center text-gray-900">
                          {!event.speakerAvatarUrl && <span className="mr-2 text-2xl sm:text-3xl">👤</span>}
                          Về diễn giả{event.speakerName && `: ${event.speakerName}`}
                        </h3>
                        <p className="text-gray-700 text-sm sm:text-base leading-relaxed">
                          {event.speakerBio}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===== LÝ DO TỪ CHỐI ===== */}
                {event.status === 'REJECTED' && event.rejectReason && (
                  <div className="mb-6 border-t pt-6">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h3 className="text-base font-semibold text-red-700 mb-2 flex items-center gap-2">
                        <span>🚫</span> Lý do từ chối từ Staff
                      </h3>
                      <p className="text-sm text-red-800 leading-relaxed whitespace-pre-wrap">
                        {event.rejectReason}
                      </p>
                    </div>
                  </div>
                )}

                {/* ===== GIÁ VÉ ===== */}
                {event.tickets && event.tickets.length > 0 && (
                  <div className="border-t pt-6 mb-6">
                    <h3 className="text-lg font-semibold mb-4">Giá vé</h3>

                    <div className="space-y-2">
                      {event.tickets.map((ticket) => {
                        // ✅ FIX: Số vé tống theo maxQuantity
                        const total = ticket.maxQuantity

                        // ✅ FIX: Ư u tiên dùng ticket.remaining từ BE (maxQuantity - sold)
                        // Fallback: đếm ghế ACTIVE theo categoryTicketId trong allSeats
                        const seatsAvailable = allSeats.filter(
                          (s: Seat) => {
                            const status = String(s.status ?? '').toUpperCase()
                            return s.categoryTicketId === ticket.categoryTicketId && (status === 'ACTIVE' || status === 'AVAILABLE')
                          }
                        ).length
                        const availableCount =
                          ticket.remaining !== undefined
                            ? ticket.remaining
                            : seatsAvailable > 0
                              ? seatsAvailable
                              : total // nếu không có thông tin, hiển thị tổng

                        // đang được chọn không? (để highlight UI)
                        const isSelectedTicket =
                          selectedTicket?.categoryTicketId === ticket.categoryTicketId

                        return (
                          <div
                            key={ticket.categoryTicketId}
                            onClick={() =>
                              handleSelectTicket({
                                categoryTicketId: ticket.categoryTicketId,
                                name: ticket.name,
                                price: ticket.price,
                                maxQuantity: ticket.maxQuantity,
                                status: ticket.status,
                              })
                            }
                            className={`flex items-center justify-between gap-4 py-2 px-3 rounded-lg border cursor-pointer transition ${
                              isSelectedTicket
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-transparent hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{ticket.name}</p>

                              {ticket.description && (
                                <p className="text-xs text-gray-500 line-clamp-2">
                                  {ticket.description}
                                </p>
                              )}

                              {/* Hiển thị ghế còn lại */}
                              <p className="text-sm text-gray-600">
                                Còn lại: {availableCount}/{total}
                              </p>
                            </div>

                            {/* Giá vé */}
                            <p className="font-semibold text-lg text-gray-900 whitespace-nowrap flex-shrink-0">
                              {ticket.price.toLocaleString('vi-VN')} đ
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ===== SEAT GRID ===== */}
                {/* Cho mọi role đều xem sơ đồ ghế, chỉ chặn đặt ghế cho manager hoặc event closed */}
                {event.areaId && (
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Chọn ghế</h3>
                    <SeatGrid
                      seats={allSeats}
                      loading={loadingSeats}
                      selectedSeats={selectedSeats}
                      onSeatSelect={(seat) => seat && handleSeatSelect(seat)}
                      maxReached={selectedSeats.length >= 4}
                      // disable if event ended OR event closed; allow viewing for managers but prevent selecting
                      disabled={eventEnded || eventClosed || eventOngoing}
                      allowSelect={!isManager && !eventClosed && !eventOngoing}
                    />
                  </div>
                )}

                {/* ===== FOOTER ACTIONS ===== */}
                <div className="border-t mt-6 pt-6 flex justify-between items-center">
                  {/* Bên trái: tổng tiền + ghế đã chọn */}
                  <div>
                    {selectedSeats.length > 0 && (
                      <div className="text-left">
                        <p className="text-sm text-gray-600">Tổng tiền</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {totalAmount.toLocaleString('vi-VN')} đ
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Ghế: {selectedSeatCodesText || 'Chưa chọn'}
                          {' · '}Số lượng: {selectedSeats.length}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bên phải: các nút / thông báo */}
                  <div className="flex flex-col items-end gap-3">
                    {/* ONGOING EVENT: Show message instead of button */}
                    {eventOngoing && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 max-w-xs">
                        Sự kiện đang diễn ra - Chỉ hiển thị sơ đồ chỗ ngồi
                      </div>
                    )}

                    <div className="flex gap-3">
                      {/* Nút cập nhật (dành cho organizer) */}
                      {userRole === 'ORGANIZER' &&
                        event.status === 'APPROVED' &&
                        onEdit && (
                          <button
                            onClick={onEdit}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Cập nhật thông tin
                          </button>
                        )}

                      {/* Đóng modal */}
                      <button
                        onClick={handleClose}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Đóng
                      </button>

                      {/* Chỉ hiện nút xác nhận khi đã chọn ít nhất 1 ghế và không phải organizer/staff/admin, event not ongoing, event not ended */}
                      {selectedSeats.length > 0 && !isManager && !eventOngoing && (
                        <button
                          onClick={confirmSeats}
                          disabled={eventEnded || eventClosed}
                          className={`px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${eventEnded || eventClosed ? 'opacity-50 cursor-not-allowed bg-gray-400' : ''
                            }`}
                        >
                          {eventClosed ? 'Sự kiện đã kết thúc' : eventEnded ? 'Sự kiện đã kết thúc' : 'Xác nhận đặt ghế'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
