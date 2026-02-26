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
  status: string
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
  const [vipTotal, setVipTotal] = useState<number>(0)

  // Tổng số ghế STANDARD của khu vực + event (API trả total)
  const [standardTotal, setStandardTotal] = useState<number>(0)

  // Loading khi fetch danh sách ghế
  const [loadingSeats, setLoadingSeats] = useState(false)

  // ===================== HELPER: CHECK TRẠNG THÁI GHẾ =====================

  /**
   * check ghế có cho click chọn được không
   * BE trả status ghế: 'AVAILABLE' | 'BOOKED' | 'CHECKED_IN' | 'PENDING'
   * => chỉ cho click khi 'AVAILABLE'
   */
  const isSeatAvailableForSelect = (seat: Seat) => {
    return seat.status === 'AVAILABLE'
  }

  /**
   * check ghế để đếm số "còn lại" theo loại VIP/STANDARD
   * chỉ đếm ghế AVAILABLE
   */
  const isSeatAvailableForCount = (seat: Seat, isVIP: boolean) => {
    const seatIsVIP = seat.seatType === 'VIP'
    return seatIsVIP === isVIP && seat.status === 'AVAILABLE'
  }

  // ===================== EFFECT: LOAD SEAT LAYOUT =====================
  useEffect(() => {
    const fetchSeats = async () => {
      // Chỉ fetch khi có event + có areaId + có token
      if (!event || !event.areaId || !token) return

      setLoadingSeats(true)

      try {
        // 1) Gọi API lấy tất cả ghế theo areaId + eventId (để vẽ SeatGrid)
        const seatsRes = await fetch(
          `/api/seats?areaId=${event.areaId}&eventId=${event.eventId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        )

        // Nếu OK => parse JSON và set allSeats
        if (seatsRes.ok) {
          const seatsData = await seatsRes.json()
          console.log('All seats data:', seatsData)
          setAllSeats(seatsData.seats || [])
        }

        /**
         * 2) Đồng thời gọi 2 API để lấy tổng ghế VIP và tổng ghế STANDARD
         * Dùng Promise.all để chạy song song cho nhanh
         */
        const [vipRes, standardRes] = await Promise.all([
          fetch(
            `/api/seats?areaId=${event.areaId}&eventId=${event.eventId}&seatType=VIP`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            },
          ),
          fetch(
            `/api/seats?areaId=${event.areaId}&eventId=${event.eventId}&seatType=STANDARD`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            },
          ),
        ])

        // Nếu OK => setVipTotal / setStandardTotal (API trả { total: ... })
        if (vipRes.ok) {
          const vipData = await vipRes.json()
          console.log('VIP total:', vipData.total)
          setVipTotal(vipData.total || 0)
        }

        if (standardRes.ok) {
          const standardData = await standardRes.json()
          console.log('STANDARD total:', standardData.total)
          setStandardTotal(standardData.total || 0)
        }
      } catch (err: any) {
        console.error('Error loading seats:', err)
      } finally {
        setLoadingSeats(false)
      }
    }

    // Chỉ fetch seat khi đã có event và event detail không còn loading
    if (event && !loading) {
      fetchSeats()
    }
  }, [event, loading, token])

  // ✅ NEW: useEffect to listen for ticket changes and re-generate seats
  // Purpose: When organizer updates ticket data (30 VIP + 60 STANDARD), 
  // automatically re-fetch seats from backend to generate correct seat map
  useEffect(() => {
    if (!event || !event.tickets || !token) return

    console.log('[EventDetailModal] Tickets updated, re-fetching seats...')
    console.log('[EventDetailModal] Tickets:', event.tickets)

    setLoadingSeats(true)

    const refetchSeatsForTickets = async () => {
      try {
        if (!event.areaId) return

        // Re-fetch all seats (will be re-generated based on new ticket counts)
        const seatsRes = await fetch(
          `/api/seats?areaId=${event.areaId}&eventId=${event.eventId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        )

        if (seatsRes.ok) {
          const seatsData = await seatsRes.json()
          console.log('[EventDetailModal] Seats re-fetched after ticket update:', seatsData)
          setAllSeats(seatsData.seats || [])
          // Reset selection when re-generating seats
          setSelectedSeats([])
          setSelectedTicket(null)
        }

        // Also re-fetch ticket totals
        const [vipRes, standardRes] = await Promise.all([
          fetch(
            `/api/seats?areaId=${event.areaId}&eventId=${event.eventId}&seatType=VIP`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            },
          ),
          fetch(
            `/api/seats?areaId=${event.areaId}&eventId=${event.eventId}&seatType=STANDARD`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            },
          ),
        ])

        if (vipRes.ok) {
          const vipData = await vipRes.json()
          setVipTotal(vipData.total || 0)
          console.log('[EventDetailModal] VIP total updated:', vipData.total)
        }

        if (standardRes.ok) {
          const standardData = await standardRes.json()
          setStandardTotal(standardData.total || 0)
          console.log('[EventDetailModal] STANDARD total updated:', standardData.total)
        }
      } catch (err: any) {
        console.error('[EventDetailModal] Error re-fetching seats for tickets:', err)
      } finally {
        setLoadingSeats(false)
      }
    }

    refetchSeatsForTickets()
  }, [event?.tickets?.length, event?.areaId, event?.eventId, token])

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

    selectedSeats.forEach((seat) => {
      if (seat.seatType === 'VIP' && vipTicket) {
        totalAmount += vipTicket.price
        vipCount++
      } else if (seat.seatType === 'STANDARD' && standardTicket) {
        totalAmount += standardTicket.price
        standardCount++
      }
    })

    /**
     * ticketToUse: categoryTicketId truyền sang payment.
     * - Nếu user đã click chọn vé (selectedTicket) => ưu tiên dùng vé đó
     * - Nếu chưa, tự map theo seatType của ghế đầu tiên
     *
     * (Trong thực tế, vì bạn có thể chọn cả VIP + STANDARD trong 1 lần,
     * việc dùng 1 categoryTicketId có thể là constraint của BE.
     * Nhưng code đang chọn 1 ticket đại diện.)
     */
    const ticketToUse =
      selectedTicket ||
      (selectedSeats[0]?.seatType === 'VIP' ? vipTicket : standardTicket)

    if (!ticketToUse) {
      alert('Không tìm thấy loại vé phù hợp')
      return
    }

    // seatIds/seatCodes gửi sang payment
    const seatIds = selectedSeats.map((s) => s.seatId)
    const seatCodes = selectedSeats.map((s) => s.seatCode)

    // ticketBreakdown: dữ liệu để trang payment hiển thị chi tiết từng loại vé
    const ticketBreakdown: Array<{ name: string; count: number; price: number }> = []
    if (vipCount > 0 && vipTicket) {
      ticketBreakdown.push({ name: vipTicket.name, count: vipCount, price: vipTicket.price })
    }
    if (standardCount > 0 && standardTicket) {
      ticketBreakdown.push({ name: standardTicket.name, count: standardCount, price: standardTicket.price })
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
    setVipTotal(0)
    setStandardTotal(0)
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
  let totalAmount = 0
  if (event && selectedSeats.length > 0) {
    const vipTicket = event.tickets?.find((t) => t.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((t) => !t.name.toUpperCase().includes('VIP'))

    selectedSeats.forEach((seat) => {
      if (seat.seatType === 'VIP' && vipTicket) totalAmount += vipTicket.price
      else if (seat.seatType === 'STANDARD' && standardTicket) totalAmount += standardTicket.price
    })
  }

  // Chuỗi ghế đã chọn để hiển thị: "A1, A2, B3"
  const selectedSeatCodesText =
    selectedSeats.length > 0 ? selectedSeats.map((s) => s.seatCode).join(', ') : ''

  // ===================== UI RENDER =====================
  return (
    <>
      {/* Overlay nền đen */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
        {/* Container modal */}
        <div
          className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()} // chặn click lan ra overlay (để không đóng khi click trong modal)
        >
          {/* ===== HEADER ===== */}
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
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

                {/* ===== GIÁ VÉ ===== */}
                {event.tickets && event.tickets.length > 0 && (
                  <div className="border-t pt-6 mb-6">
                    <h3 className="text-lg font-semibold mb-4">Giá vé</h3>

                    <div className="space-y-2">
                      {event.tickets.map((ticket) => {
                        // ✅ FIX: Use organizer's ticket.maxQuantity instead of venue capacity
                        // This shows the actual number of tickets available per category (e.g., 30 VIP, 60 Standard)
                        const total = ticket.maxQuantity

                        // ✅ FIX: Count seats by categoryTicketId instead of seatType
                        // Only count AVAILABLE seats that are assigned to this specific ticket category
                        const availableCount = allSeats.filter(
                          (s: Seat) => s.categoryTicketId === ticket.categoryTicketId && s.status === 'AVAILABLE'
                        ).length

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
                            className={`flex items-center justify-between gap-4 py-2 px-3 rounded-lg border cursor-pointer tra
nsition
                              ${isSelectedTicket
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
    </>
  )
}
