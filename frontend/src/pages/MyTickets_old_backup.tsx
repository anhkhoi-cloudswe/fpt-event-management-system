// Import hook React để dùng state + lifecycle
import { useEffect, useState } from 'react'

// Import Link để điều hướng trong SPA mà không reload trang
import { Link } from 'react-router-dom'

// (Removed QRCodeSVG import - we now display Base64 images from backend)

// (Đang comment) Nếu cần lấy user từ AuthContext thì dùng dòng này
// import { useAuth } from '../contexts/AuthContext'

// Import icon từ lucide-react để làm UI đẹp + trực quan trạng thái vé
import {
  Ticket as TicketIcon, // Icon vé
  Calendar,             // Icon lịch
  MapPin,               // Icon địa điểm
  CheckCircle,          // Icon check-in thành công
  XCircle,              // Icon trạng thái lỗi/chưa checkin/hết hạn
  LogOut,               // Icon check-out
  Clock,                // Icon thời gian (checkin/checkout time)
  FileX,                // Icon hủy vé
} from 'lucide-react'

// Import component modal hủy vé
import CancelTicketModal from '../components/common/CancelTicketModal'

// Import format ngày giờ từ date-fns
import { format } from 'date-fns'

// Import locale tiếng Việt để format ngày theo định dạng VN
import { vi } from 'date-fns/locale'

/**
 * Kiểu dữ liệu MyTicket:
 * - Khớp với dữ liệu backend trả về (BE)
 * - Nhưng vì BE có thể đặt tên field khác nhau theo từng endpoint/version
 *   nên ta thêm nhiều field dự phòng (fallback)
 *
 * Mục tiêu:
 * - FE không bị lỗi khi BE trả eventName thay vì eventTitle...
 * - Các helper sẽ chọn field nào có dữ liệu trước để hiển thị
 */
type MyTicket = {
  // ID vé có thể là ticketId hoặc id
  ticketId?: number
  id?: number

  // eventId để tham chiếu sự kiện
  eventId?: number

  // Tên sự kiện: BE đang dùng eventName, nhưng FE dự phòng eventTitle/title
  eventName?: string         // BE đang dùng
  eventTitle?: string
  title?: string

  // Ảnh banner sự kiện có thể ở bannerUrl hoặc imageUrl
  bannerUrl?: string | null
  imageUrl?: string | null

  // Thời gian bắt đầu sự kiện có thể có nhiều key
  eventStartTime?: string
  startTime?: string         // BE đang dùng
  startDate?: string

  // Địa điểm có thể là venueName hoặc location
  venueName?: string | null  // BE đang dùng
  location?: string | null

  // Ghế: có thể trả seatCode hoặc seatNumber
  seatCode?: string | null
  seatNumber?: string | null

  // Trạng thái vé có thể trả ticketStatus hoặc status
  ticketStatus?: string
  status?: string

  // ticketCode: QR code dạng base64 PNG image (data:image/png;base64,...) BE trả về từ qr_code_value
  ticketCode?: string | null // Base64 PNG from backend qr_code_value column

  // Các trường check-in / check-out:
  checkedIn?: boolean
  checkInTime?: string | null // BE đang dùng
  checkinTime?: string | null // fallback nếu BE viết khác
  checkOutTime?: string | null // Thời gian check-out
  checkoutTime?: string | null // fallback
}

/**
 * Component MyTickets:
 * - Trang "Vé của tôi"
 * - Load danh sách vé của user từ backend
 * - Hiển thị danh sách vé dạng card
 * - Mỗi card có nút "Xem vé QR" để mở popup QR code
 * - Hiển thị trạng thái: chưa check-in / đã check-in / đã check-out / hết hạn
 */
export default function MyTickets() {
  // tickets: danh sách vé user lấy từ backend
  const [tickets, setTickets] = useState<MyTicket[]>([])

  // loading: đang tải dữ liệu vé
  const [loading, setLoading] = useState(true)

  // error: lưu lỗi nếu API fail hoặc user chưa login
  const [error, setError] = useState<string | null>(null)

  // qrTicket: vé đang được mở popup QR (null = không mở popup)
  const [qrTicket, setQrTicket] = useState<MyTicket | null>(null)

  // cancelTicket: vé đang được yêu cầu hủy (null = không mở modal)
  const [cancelTicket, setCancelTicket] = useState<MyTicket | null>(null)

  // pendingReports: danh sách ticketId đang có report pending
  const [pendingReports, setPendingReports] = useState<Set<number>>(new Set())

  /**
   * useEffect chạy 1 lần khi component mount (dependency [])
   * Nhiệm vụ:
   * - Lấy token JWT từ localStorage
   * - Gọi API /api/registrations/my-tickets để lấy danh sách vé của user
   * - Cập nhật state tickets / error / loading
   */
  useEffect(() => {
    // fetchTickets là hàm async gọi API lấy danh sách vé
    const fetchTickets = async () => {
      // Lấy JWT token từ localStorage
      const jwt = localStorage.getItem('token')

      // Nếu không có token => user chưa đăng nhập
      if (!jwt) {
        setError('Bạn cần đăng nhập để xem vé của mình.')
        setLoading(false)
        return
      }

      // Bắt đầu fetch: bật loading và reset error
      setLoading(true)
      setError(null)

      try {
        // Gọi API lấy vé của tôi
        const res = await fetch('/api/registrations/my-tickets', {
          headers: {
            'Content-Type': 'application/json',
            // Đính kèm JWT vào Authorization để BE xác thực user
            Authorization: `Bearer ${jwt}`,
          },
          // credentials: 'include' để gửi cookie (nếu BE dùng cookie session kèm theo)
          credentials: 'include',
        })

        // Nếu response không OK thì xử lý lỗi theo status code
        if (!res.ok) {
          if (res.status === 401) {
            // 401: token hết hạn / không hợp lệ
            setError('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.')
          } else {
            // Lỗi chung
            setError('Không thể tải danh sách vé. Vui lòng thử lại sau.')
          }
          // reset danh sách vé về rỗng
          setTickets([])
          return
        }

        // Parse JSON từ response, BE trả về array MyTicket[]
        const data: MyTicket[] = await res.json()

        // Log để debug dữ liệu từ API
        console.log('My tickets from API:', data)

        // Nếu data là array thì setTickets, nếu không thì set []
        setTickets(Array.isArray(data) ? data : [])
      } catch (err) {
        // Nếu lỗi network/cors/timeout
        console.error('Error loading tickets:', err)
        setError('Có lỗi xảy ra khi tải danh sách vé.')
        setTickets([])
      } finally {
        // Dù thành công hay lỗi đều tắt loading
        setLoading(false)
      }
    }

    // Gọi hàm fetchTickets ngay khi component mount
    fetchTickets()
  }, [])

  // Fetch pending ticket IDs for the logged-in student so we disable duplicate reports
  useEffect(() => {
    const fetchPendingIds = async () => {
      const jwt = localStorage.getItem('token')
      if (!jwt) return

      try {
        const res = await fetch('/api/student/reports/pending-ticket-ids', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
        })

        if (!res.ok) return

        const data = await res.json()
        // Expect { status: 'success', data: [ids] }
        const ids = Array.isArray(data) ? data : data?.data ?? []

        const pendingSet = new Set<number>()
        for (const id of ids) {
          pendingSet.add(Number(id))
        }

        setPendingReports(pendingSet)
      } catch (err) {
        console.error('Error fetching pending ticket ids:', err)
      }
    }

    fetchPendingIds()
  }, [])

  // ===================== Helpers map field =====================
  // Vì BE có thể trả field khác nhau, ta viết helper để lấy value hợp lệ nhất

  // Lấy tên sự kiện: ưu tiên eventName -> eventTitle -> title -> fallback
  const getEventTitle = (t: MyTicket) =>
    t.eventName || t.eventTitle || t.title || 'Sự kiện không tên'

  // Lấy thời gian bắt đầu: ưu tiên eventStartTime -> startTime -> startDate
  const getStartTime = (t: MyTicket) =>
    t.eventStartTime || t.startTime || t.startDate || ''

  // Lấy địa điểm: ưu tiên venueName -> location -> fallback
  const getLocation = (t: MyTicket) =>
    t.venueName || t.location || 'Đang cập nhật địa điểm'

  // Lấy thông tin ghế: seatCode hoặc seatNumber
  const getSeatLabel = (t: MyTicket) =>
    t.seatCode || t.seatNumber || ''

  // Lấy ảnh: bannerUrl hoặc imageUrl
  const getImageUrl = (t: MyTicket) =>
    t.bannerUrl || t.imageUrl || ''

  // Xác định đã check-in chưa:
  // - checkedIn boolean hoặc có checkInTime/checkinTime
  const isCheckedIn = (t: MyTicket) =>
    !!(t.checkedIn || t.checkInTime || t.checkinTime)

  // Xác định đã check-out chưa: có checkOutTime/checkoutTime
  const isCheckedOut = (t: MyTicket) =>
    !!(t.checkOutTime || t.checkoutTime)

  /**
   * getStatus:
   * - Nếu BE trả status/ticketStatus => dùng luôn
   * - Nếu BE không trả => tự suy ra dựa vào check-in/check-out
   *   + CHECKED_OUT nếu có checkout time
   *   + CHECKED_IN nếu có checkin time
   *   + BOOKED nếu chưa checkin
   */
  const getStatus = (t: MyTicket) => {
    const rawStatus = t.ticketStatus || t.status
    if (rawStatus) return rawStatus
    if (isCheckedOut(t)) return 'CHECKED_OUT'
    if (isCheckedIn(t)) return 'CHECKED_IN'
    return 'BOOKED'
  }

  // Lấy thời gian check-in (fallback giữa checkInTime và checkinTime)
  const getCheckInTime = (t: MyTicket) => t.checkInTime || t.checkinTime || null

  // Lấy thời gian check-out (fallback giữa checkOutTime và checkoutTime)
  const getCheckOutTime = (t: MyTicket) => t.checkOutTime || t.checkoutTime || null

  // Xử lý khi hủy vé thành công
  const handleCancelSuccess = () => {
    if (cancelTicket) {
      const ticketId = cancelTicket.ticketId ?? cancelTicket.id
      if (ticketId) {
        setPendingReports((prev) => new Set(prev).add(ticketId))
      }
    }
  }

  /**
   * formatTime:
   * - Nhận time string (ISO date) hoặc null
   * - Convert sang Date rồi format "dd/MM/yyyy HH:mm:ss" theo locale vi
   * - Nếu time invalid => return null
   */
  const formatTime = (time: string | null) => {
    if (!time) return null
    const d = new Date(time)
    if (isNaN(d.getTime())) return null
    return format(d, 'dd/MM/yyyy HH:mm:ss', { locale: vi })
  }

  /**
   * getTicketDisplayCode:
   * - Mã vé hiển thị để Organizer/staff gõ thủ công (dùng ticketId hoặc id)
   * - Trả về null nếu không có id hợp lệ
   */
  const getTicketDisplayCode = (t: MyTicket) =>
    t.ticketId ?? t.id ?? null

  // ===================== UI RENDER =====================

  /**
   * Nếu đang loading:
   * - Hiển thị UI loading đơn giản
   */
  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Vé của tôi</h1>
        <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
          Đang tải danh sách vé...
        </div>
      </div>
    )
  }

  /**
   * Nếu có error:
   * - Hiển thị thông báo lỗi
   * - Hiển thị link sang /events để user xem sự kiện (mua vé)
   */
  if (error) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Vé của tôi</h1>
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link
            to="/dashboard/events"
            className="inline-block text-blue-600 hover:text-blue-700"
          >
            Xem các sự kiện sắp tới →
          </Link>
        </div>
      </div>
    )
  }

  /**
   * Nếu không loading và không error:
   * - Render danh sách vé (hoặc empty state)
   */
  return (
    <div>
      {/* Tiêu đề trang */}
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Vé của tôi</h1>

      {/* Nếu không có vé nào -> empty state */}
      {tickets.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <TicketIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Bạn chưa có vé nào</p>
          <Link
            to="/dashboard/events"
            className="mt-4 inline-block text-blue-600 hover:text-blue-700"
          >
            Xem các sự kiện sắp tới →
          </Link>
        </div>
      ) : (
        <>
          {/* Grid hiển thị các vé dạng card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tickets.map((t) => {
              // id vé: ưu tiên ticketId, fallback id
              const id = t.ticketId ?? t.id

              // Nếu vé không có id thì bỏ qua (return null)
              if (!id) return null

              // Chuẩn hóa dữ liệu hiển thị bằng helper
              const title = getEventTitle(t)
              const start = getStartTime(t)
              const location = getLocation(t)
              const seat = getSeatLabel(t)
              const imageUrl = getImageUrl(t)
              const checkedIn = isCheckedIn(t)
              const status = getStatus(t)
              const isPendingRefund = pendingReports.has(id) || status === 'PENDING'

              // startText: text hiển thị thời gian bắt đầu event
              // default nếu chưa có data hoặc data lỗi
              let startText = 'Đang cập nhật thời gian'
              if (start) {
                const d = new Date(start)
                if (!isNaN(d.getTime())) {
                  startText = format(d, 'dd/MM/yyyy HH:mm', { locale: vi })
                }
              }

              // Render card vé
              return (
                <div
                  key={id} // key để React quản lý list
                  className="bg-white rounded-lg shadow-md overflow-hidden"
                >
                  {/* Nếu có ảnh -> hiển thị banner */}
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt={title}
                      className="w-full h-48 object-cover"
                    />
                  )}

                  {/* Nội dung card */}
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      {/* Cột trái: thông tin vé */}
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          {title}
                        </h3>

                        {/* Thông tin phụ: thời gian, địa điểm, ghế */}
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2" />
                            {startText}
                          </div>

                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 mr-2" />
                            {location}
                          </div>

                          {/* Nếu có seat -> hiển thị */}
                          {seat && (
                            <div className="flex items-center">
                              <span className="font-medium">Ghế: {seat}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cột phải: icon trạng thái */}
                      {status === 'EXPIRED' ? (
                        <XCircle className="w-6 h-6 text-red-500" />
                      ) : status === 'REFUNDED' ? (
                        <FileX className="w-6 h-6 text-indigo-500" />
                      ) : status === 'PENDING' ? (
                        <XCircle className="w-6 h-6 text-orange-500" />
                      ) : status === 'CHECKED_OUT' ? (
                        // Nếu đã check-out -> icon logout màu tím
                        <LogOut className="w-6 h-6 text-purple-500" />
                      ) : checkedIn ? (
                        // Nếu đã check-in -> icon xanh
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      ) : (
                        // Chưa check-in -> icon xám
                        <XCircle className="w-6 h-6 text-gray-400" />
                      )}
                    </div>

                    {/* Khối trạng thái dạng badge */}
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">Trạng thái:</p>

                      {/* Nếu đang chờ hoàn tiền */}
                      {isPendingRefund ? (
                        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                          Đang chờ hoàn tiền
                        </span>
                      ) : (
                        /* Badge màu theo trạng thái */
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${status === 'EXPIRED'
                              ? 'bg-red-100 text-red-800'
                              : status === 'REFUNDED'
                                ? 'bg-gray-100 text-gray-800'
                                : status === 'CHECKED_OUT'
                                  ? 'bg-purple-100 text-purple-800'
                                  : status === 'CHECKED_IN'
                                    ? 'bg-green-100 text-green-800'
                                    : status === 'PENDING'
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-yellow-100 text-yellow-800'
                            }`}
                        >
                          {/* Text trạng thái hiển thị tiếng Việt */}
                          {status === 'EXPIRED'
                            ? 'Hết hạn'
                            : status === 'REFUNDED'
                              ? 'Đã hoàn tiền'
                              : status === 'CHECKED_OUT'
                                ? 'Đã check-out'
                                : status === 'CHECKED_IN'
                                  ? 'Đã check-in'
                                  : status === 'PENDING'
                                    ? 'Đang chờ hoàn tiền'
                                    : 'Chưa check-in'}
                        </span>
                      )}

                      {/* Nếu có check-in time -> hiển thị (hiển thị cả khi đã refunded) */}
                      {getCheckInTime(t) && (
                        <div className="flex items-center text-sm text-gray-600 mt-2">
                          <Clock className={`w-4 h-4 mr-1 ${isCheckedOut(t) ? 'text-purple-500' : 'text-green-500'}`} />
                          <span>Lúc: {formatTime(getCheckInTime(t))}</span>
                        </div>
                      )}

                      {/* Nếu trạng thái CHECKED_OUT và có checkoutTime -> hiển thị thời điểm */}
                      {status === 'CHECKED_OUT' && getCheckOutTime(t) && (
                        <div className="flex items-center text-sm text-gray-600 mt-2">
                          <Clock className="w-4 h-4 mr-1 text-purple-500" />
                          <span>Lúc: {formatTime(getCheckOutTime(t))}</span>
                        </div>
                      )}
                    </div>

                    {/* Các nút action */}
                    <div className="flex gap-2">
                      {/* Nút Báo Cáo Lỗi - chỉ hiển thị cho vé CHECKED_IN */}
                      {!isPendingRefund && status === 'CHECKED_IN' && (
                        <button
                          type="button"
                          onClick={() => setCancelTicket(t)}
                          className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <FileX size={18} />
                          Báo Cáo Lỗi
                        </button>
                      )}

                      {/* Nút xem QR: bấm sẽ mở popup bằng cách setQrTicket(t) */}
                      {/* Không navigate sang trang khác */}
                      <button
                        type="button"
                        onClick={() => setQrTicket(t)}
                        className={`${!isPendingRefund && status === 'CHECKED_IN' ? 'flex-1' : 'w-full'
                          } text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors`}
                      >
                        Xem vé QR
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ===================== MODAL HỦY VÉ ===================== */}
          {cancelTicket && (
            <CancelTicketModal
              ticketId={cancelTicket.ticketId ?? cancelTicket.id ?? 0}
              eventName={getEventTitle(cancelTicket)}
              onClose={() => setCancelTicket(null)}
              onSuccess={handleCancelSuccess}
            />
          )}

          {/* ===================== POPUP QR CODE ===================== */}
          {/* Nếu qrTicket != null thì mở popup overlay */}
          {qrTicket && (
            // Overlay nền đen mờ phủ toàn màn hình
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              {/* Hộp popup */}
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
                <h2 className="text-xl font-semibold mb-2">Mã QR vé</h2>

                {/* Hiển thị tên sự kiện của vé đang mở */}
                <p className="text-sm text-gray-600 mb-1">
                  {getEventTitle(qrTicket)}
                </p>

                {/* ===== MÃ VÉ CHO ORGANIZER GÕ (ticketId/id) ===== */}
                {/* Nếu có ticketId hoặc id thì hiển thị để staff nhập thủ công */}
                {getTicketDisplayCode(qrTicket) && (
                  <p className="text-sm font-semibold text-gray-800 mb-3">
                    Mã vé:&nbsp;
                    <span className="text-blue-600">
                      {getTicketDisplayCode(qrTicket)}
                    </span>
                  </p>
                )}

                {/* 
                  Display QR code image from backend (Base64 PNG)
                  Backend generates QR as Base64 and stores in qr_code_value column
                  Format: "data:image/png;base64,iVBORw0KGgoAAAA..."
                  
                  Fallback: If no Base64 QR from backend, show ticketId as text
                  This ensures compatibility with old tickets that don't have QR yet
                */}
                {qrTicket.ticketCode && qrTicket.ticketCode.startsWith('data:image') ? (
                  <div className="mx-auto w-64 h-64 mb-4 flex items-center justify-center bg-white p-2 border border-gray-200 rounded-lg">
                    <img
                      src={qrTicket.ticketCode}
                      alt="Ticket QR Code"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : getTicketDisplayCode(qrTicket) ? (
                  <div className="mx-auto mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 mb-2">
                      ⚠️ QR chưa sẵn sàng (vé cũ)
                    </p>
                    <p className="text-xs text-gray-600 mb-2">
                      Vui lòng sử dụng mã vé để check-in:
                    </p>
                    <p className="font-mono text-lg font-bold text-blue-600">
                      {getTicketDisplayCode(qrTicket)}
                    </p>
                  </div>
                ) : (
                  // Nếu không có QR và không có ticketId -> hiển thị cảnh báo
                  <p className="text-red-500 text-sm mb-4">
                    Vé này chưa có mã QR. Vui lòng liên hệ hỗ trợ.
                  </p>
                )}

                {/* Nút đóng popup: setQrTicket(null) */}
                <button
                  type="button"
                  onClick={() => setQrTicket(null)}
                  className="mt-2 px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
