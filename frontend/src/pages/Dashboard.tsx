// src/pages/Dashboard.tsx

// Import React hooks
import { useEffect, useState } from 'react'
// useState: lưu state (events, loading, error, tab đang chọn, modal detail...)
// useEffect: chạy side-effect (gọi API load events) khi component mount / khi token đổi

// Import Link (hiện tại file này import nhưng chưa dùng trong JSX - có thể dùng để link sang trang khác)
import { Link } from 'react-router-dom'
// Link: tạo link điều hướng trong SPA (không reload trang)

// Import AuthContext để lấy user (nếu cần)
import { useAuth } from '../contexts/AuthContext'
// useAuth: lấy user từ context (thông tin đăng nhập)
// Lưu ý: trong code này user lấy ra nhưng token lại lấy từ localStorage

// Import icon Calendar để hiển thị placeholder / background khi không có banner
import { Calendar } from 'lucide-react'

// Import hàm xử lý ngày giờ từ date-fns
import { format, isSameDay, startOfDay } from 'date-fns'
// format: format Date -> string hiển thị
// isSameDay: kiểm tra 2 ngày có cùng ngày không
// startOfDay: đưa Date về đầu ngày (00:00:00) để so sánh ngày chính xác

// Import locale Việt Nam cho date-fns
import { vi } from 'date-fns/locale'

// Import type dữ liệu event
import type { EventListItem, EventDetail } from '../types/event'
// EventListItem: kiểu dữ liệu item sự kiện hiển thị trong list (danh sách)
// EventDetail: kiểu dữ liệu chi tiết sự kiện (dùng trong modal detail)

// Import component modal xem chi tiết sự kiện
import { EventDetailModal } from '../components/events/EventDetailModal'
// EventDetailModal: modal popup hiển thị chi tiết event khi click vào 1 event card

export default function Dashboard() {
  // Lấy user từ AuthContext (hiện tại user chưa dùng trong UI)
  const { user } = useAuth()

  // Lấy token từ localStorage để gọi API có Authorization
  // (comment trong code: "Get token from localStorage instead of user object")
  const token = localStorage.getItem('token')

  // events: danh sách sự kiện load từ API /api/events
  const [events, setEvents] = useState<EventListItem[]>([])

  // loading: trạng thái đang tải danh sách sự kiện
  const [loading, setLoading] = useState(true)

  // error: lưu lỗi nếu gọi API fail
  const [error, setError] = useState<string | null>(null)

  // activeTab: tab hiện tại của dashboard
  // - open: sự kiện hôm nay
  // - upcoming: sự kiện sắp diễn ra
  // - closed: sự kiện đã kết thúc
  const [activeTab, setActiveTab] = useState<'open' | 'upcoming' | 'closed'>('open')

  // ===================== STATE cho Event Detail Modal =====================
  // isDetailOpen: mở/đóng modal chi tiết
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // selectedEvent: dữ liệu chi tiết event đang được chọn để xem
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null)

  // loadingDetail: trạng thái đang tải chi tiết event
  const [loadingDetail, setLoadingDetail] = useState(false)

  // detailError: lỗi khi load chi tiết event
  const [detailError, setDetailError] = useState<string | null>(null)

  // ===================== GỌI API: LẤY DANH SÁCH SỰ KIỆN =====================
  useEffect(() => {
    // fetchEvents: hàm async gọi /api/events để lấy danh sách sự kiện
    const fetchEvents = async () => {
      // Nếu không có token -> user chưa đăng nhập -> báo lỗi và dừng
      if (!token) {
        setError('Chưa đăng nhập')
        setLoading(false)
        return
      }

      try {
        // Bật loading và reset error trước khi gọi API
        setLoading(true)
        setError(null)

        // Gọi API lấy danh sách event
        const res = await fetch('/api/events', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // Gửi Bearer token để BE xác thực
            Authorization: `Bearer ${token}`,
          },
        })

        // Nếu HTTP status không ok -> xử lý theo status code
        if (!res.ok) {
          // 401: token sai/hết hạn -> throw error
          if (res.status === 401) {
            throw new Error('Token không hợp lệ hoặc đã hết hạn')
          }

          // 404: backend không tìm thấy resource (ở đây code custom message)
          if (res.status === 404) {
            // Thông báo cụ thể
            setError('Sự kiện này chưa diễn ra hoặc đã đóng. Xin bạn thử lại sau.')
            setEvents([])
            setLoading(false)
            return
          }

          // Các lỗi khác: throw chung
          throw new Error(`HTTP ${res.status}`)
        }

        // Parse JSON từ backend
        const data = await res.json()

        /**
         * Backend có thể trả:
         * - Array thuần: [event1, event2]
         * - Hoặc object: { openEvents: [...], closedEvents: [...] }
         *
         * => Code handle cả 2 case:
         * - Nếu data là array -> dùng luôn
         * - Nếu không -> gộp openEvents + closedEvents thành 1 mảng
         */
        const eventsArray = Array.isArray(data)
          ? data
          : [
              ...(Array.isArray(data.openEvents) ? data.openEvents : []),
              ...(Array.isArray(data.closedEvents) ? data.closedEvents : []),
            ]

        // Lưu events vào state để render UI
        setEvents(eventsArray)
      } catch (err: any) {
        // Bắt lỗi network / throw error phía trên
        console.error('Lỗi load events:', err)
        setError(err.message ?? 'Không thể tải danh sách sự kiện')
      } finally {
        // Tắt loading dù thành công hay lỗi
        setLoading(false)
      }
    }

    // Gọi fetchEvents khi component mount hoặc khi token đổi
    fetchEvents()
  }, [token])

  // ===================== MỞ MODAL CHI TIẾT + GỌI API DETAIL =====================
  /**
   * openEventDetail(eventId):
   * - Khi user click vào 1 event card -> mở modal detail
   * - Đồng thời gọi API /api/events/detail?id=... để lấy chi tiết event
   */
  const openEventDetail = async (eventId: number) => {
    // Nếu không có token thì không call API
    if (!token) return

    // Mở modal trước để UI phản hồi nhanh
    setIsDetailOpen(true)

    // Reset selectedEvent để tránh hiển thị data cũ
    setSelectedEvent(null)

    // Bật loading detail
    setLoadingDetail(true)

    // Reset lỗi detail
    setDetailError(null)

    try {
      // Gọi API lấy chi tiết event
      const res = await fetch(`/api/events/detail?id=${eventId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      // Xử lý lỗi HTTP
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Token không hợp lệ hoặc đã hết hạn')
        }
        if (res.status === 404) {
          // Nếu event không còn hợp lệ (đã đóng hoặc chưa diễn ra)
          setDetailError('Sự kiện này chưa diễn ra hoặc đã đóng. Xin bạn thử lại sau.')
          setSelectedEvent(null)
          setLoadingDetail(false)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }

      // Parse JSON thành EventDetail
      const data: EventDetail = await res.json()

      // Lưu vào state để modal hiển thị
      setSelectedEvent(data)
    } catch (err: any) {
      console.error('Lỗi load event detail:', err)
      setDetailError(err.message ?? 'Không thể tải chi tiết sự kiện')
    } finally {
      // Tắt loading detail
      setLoadingDetail(false)
    }
  }

  /**
   * closeModal:
   * - Đóng modal
   * - Reset selectedEvent và lỗi detail
   */
  const closeModal = () => {
    setIsDetailOpen(false)
    setSelectedEvent(null)
    setDetailError(null)
  }

  // ===================== PHÂN LOẠI EVENT THEO NGÀY + STATUS =====================

  // today: đầu ngày hiện tại (00:00:00) để so sánh ngày
  const today = startOfDay(new Date())

  /**
   * openEvents (Sự kiện hôm nay):
   * - status phải là OPEN
   * - ngày startTime phải trùng với today
   * - sort theo thời gian tăng dần (gần nhất trước)
   */
  const openEvents = (Array.isArray(events) ? events : [])
    .filter((e) => {
      // lọc status OPEN
      if (e.status !== 'OPEN') return false

      // so sánh ngày bắt đầu event với today
      const eventStartDate = startOfDay(new Date(e.startTime))
      return isSameDay(eventStartDate, today)
    })
    .sort((a, b) => {
      // sort theo thời gian tăng dần
      const dateA = new Date(a.startTime)
      const dateB = new Date(b.startTime)
      return dateA.getTime() - dateB.getTime()
    })

  /**
   * upcomingEvents (Sự kiện sắp diễn ra):
   * - status phải OPEN
   * - ngày startTime > today
   * - sort tăng dần
   */
  const upcomingEvents = (Array.isArray(events) ? events : [])
    .filter((e) => {
      if (e.status !== 'OPEN') return false
      const eventStartDate = startOfDay(new Date(e.startTime))
      return eventStartDate > today
    })
    .sort((a, b) => {
      const dateA = new Date(a.startTime)
      const dateB = new Date(b.startTime)
      return dateA.getTime() - dateB.getTime()
    })

  /**
   * closedEvents (Sự kiện đã kết thúc):
   * - status phải CLOSED
   * - bannerUrl phải tồn tại (không null)
   * - sort giảm dần (mới nhất trước)
   */
  const closedEvents = (Array.isArray(events) ? events : [])
    .filter((e) => {
      if (e.status !== 'CLOSED') return false
      if (!e.bannerUrl) return false
      return true
    })
    .sort((a, b) => {
      const dateA = new Date(a.startTime)
      const dateB = new Date(b.startTime)
      // sort giảm dần: event mới hơn lên trước
      return dateB.getTime() - dateA.getTime()
    })

  // ===================== RENDER UI (JSX) =====================
  return (
    <div>
      {/* Tiêu đề dashboard */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900">
          Sự kiện tại Thành phố Hồ Chí Minh
        </h1>
      </div>

      {/* Hiển thị loading/error */}
      {loading && <p className="text-gray-500 mb-4">Đang tải dữ liệu sự kiện...</p>}
      {error && <p className="text-red-500 mb-4">Lỗi: {error}</p>}

      {/* ===================== TAB PANEL ===================== */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {/* Tab 1: Sự kiện hôm nay */}
            <button
              onClick={() => setActiveTab('open')}
              className={`py-4 px-1 border-b-2 font-medium text-base transition-colors ${
                activeTab === 'open'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex flex-col items-start">
                <span>Sự kiện hôm nay</span>
              </div>
            </button>

            {/* Tab 2: Sự kiện sắp diễn ra */}
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`py-4 px-1 border-b-2 font-medium text-base transition-colors ${
                activeTab === 'upcoming'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex flex-col items-start">
                <span>Sự kiện sắp diễn ra</span>
              </div>
            </button>

            {/* Tab 3: Sự kiện đã kết thúc */}
            <button
              onClick={() => setActiveTab('closed')}
              className={`py-4 px-1 border-b-2 font-medium text-base transition-colors ${
                activeTab === 'closed'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex flex-col items-start">
                <span>Sự kiện đã kết thúc</span>
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* ===================== EVENTS GRID THEO TAB ===================== */}

      {/* ===== TAB OPEN: Sự kiện hôm nay ===== */}
      {activeTab === 'open' && (
        <>
          {/* Nếu không có event -> show empty */}
          {openEvents.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">Hiện chưa có sự kiện đang mở</p>
            </div>
          ) : (
            // Có event -> render grid
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {openEvents.map((event) => {
                // Parse ngày giờ event
                const eventDate = new Date(event.startTime)

                // Kiểm tra event có phải hôm nay không (dù đã lọc openEvents rồi, vẫn check để highlight UI)
                const isToday = isSameDay(eventDate, today)

                return (
                  // Event card: dùng button để click mở modal detail
                  <button
                    key={event.eventId}
                    onClick={() => openEventDetail(event.eventId)} // click -> mở modal + fetch detail
                    className={`text-left block rounded-lg overflow-hidden hover:shadow-xl transition-all cursor-pointer bg-white ${
                      // Nếu hôm nay -> highlight đỏ + scale
                      isToday 
                        ? 'border-4 border-red-500 shadow-2xl shadow-red-500/50 transform scale-105' 
                        : 'border border-gray-200'
                    }`}
                  >
                    {/* Banner Image */}
                    {event.bannerUrl ? (
                      <div className="relative">
                        <img
                          src={event.bannerUrl}
                          alt={event.title}
                          className="w-full h-48 object-cover"
                        />
                        {/* Nếu hôm nay -> show badge "🔥 HÔM NAY" */}
                        {isToday && (
                          <span className="absolute top-3 right-3 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg shadow-lg animate-pulse">
                            🔥 HÔM NAY
                          </span>
                        )}
                      </div>
                    ) : (
                      // Nếu không có bannerUrl -> hiển thị background + icon Calendar
                      <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center relative">
                        <Calendar className="w-16 h-16 text-blue-400" />
                        {isToday && (
                          <span className="absolute top-3 right-3 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg shadow-lg animate-pulse">
                            🔥 HÔM NAY
                          </span>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="p-4">
                      {/* Title */}
                      <h3 className={`text-lg font-bold mb-2 line-clamp-2 min-h-[56px] ${
                        isToday ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {event.title}
                      </h3>

                      {/* Date & Time */}
                      <p className={`text-sm mb-1 font-semibold ${
                        isToday ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {format(eventDate, 'dd/MM/yyyy • EEEE • h:mm a', { locale: vi })}
                      </p>

                      {/* Location */}
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {event.venueLocation || event.location || 'Trực tuyến'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ===== TAB UPCOMING: Sự kiện sắp diễn ra ===== */}
      {activeTab === 'upcoming' && (
        <>
          {upcomingEvents.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">Hiện chưa có sự kiện sắp mở</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {upcomingEvents.map((event) => {
                const eventDate = new Date(event.startTime)
                const isToday = isSameDay(eventDate, today)

                return (
                  <button
                    key={event.eventId}
                    onClick={() => openEventDetail(event.eventId)} // click -> modal + fetch detail
                    className="text-left block rounded-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer bg-white border border-gray-200"
                  >
                    {/* Banner */}
                    {event.bannerUrl ? (
                      <div className="relative">
                        <img
                          src={event.bannerUrl}
                          alt={event.title}
                          className="w-full h-48 object-cover"
                        />
                        {/* Badge (đoạn này hiện tại chỉ show nếu isToday, nhưng upcoming đã lọc > today nên thường không xảy ra) */}
                        {isToday && (
                          <span className="absolute top-3 right-3 px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded">
                            SẮP MỞ
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-yellow-50 to-yellow-100 flex items-center justify-center relative">
                        <Calendar className="w-16 h-16 text-yellow-400" />
                        {isToday && (
                          <span className="absolute top-3 right-3 px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded">
                            SẮP MỞ
                          </span>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 min-h-[56px]">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-1 font-semibold">
                        {format(eventDate, 'dd/MM/yyyy • EEEE • h:mm a', { locale: vi })}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {event.venueLocation || event.location || 'Trực tuyến'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ===== TAB CLOSED: Sự kiện đã kết thúc ===== */}
      {activeTab === 'closed' && (
        <>
          {closedEvents.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">Chưa có sự kiện đã kết thúc</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {closedEvents.map((event) => (
                <button
                  key={event.eventId}
                  onClick={() => openEventDetail(event.eventId)} // click -> modal + fetch detail
                  className="text-left block rounded-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer bg-white border border-gray-200 opacity-75"
                >
                  {/* Banner */}
                  {event.bannerUrl ? (
                    <img
                      src={event.bannerUrl}
                      alt={event.title}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <Calendar className="w-16 h-16 text-gray-400" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-4">
                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded mb-3">
                      Đã kết thúc
                    </span>

                    <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 min-h-[56px]">
                      {event.title}
                    </h3>

                    <p className="text-sm text-gray-600 mb-1 font-semibold">
                      {format(new Date(event.startTime), 'dd/MM/yyyy • EEEE • h:mm a', { locale: vi })}
                    </p>

                    <p className="text-sm text-gray-600 line-clamp-1">
                      {event.venueLocation || event.location || 'Trực tuyến'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===================== MODAL CHI TIẾT EVENT ===================== */}
      <EventDetailModal
        isOpen={isDetailOpen}        // mở/đóng modal
        onClose={closeModal}         // callback đóng modal
        event={selectedEvent}        // dữ liệu chi tiết event
        loading={loadingDetail}      // loading khi fetch detail
        error={detailError}          // lỗi fetch detail
        token={token}                // token để modal gọi API tiếp nếu cần (vd: đăng ký/đặt ghế)
        userRole={user?.role}        // truyền role để ẩn chọn ghế cho ORGANIZER/STAFF/ADMIN
      />
    </div>
  )
}
