// src/pages/Dashboard.tsx

// Import React hooks
import { useEffect, useState, useCallback, useRef } from 'react'
// useState: lưu state (events, loading, error, tab đang chọn, modal detail...)
// useEffect: chạy side-effect (gọi API load events) khi component mount / khi token đổi
// useCallback: memoize callbacks để tránh re-render không cần thiết
// useRef: lưu reference debounce timeout

// Import Link (hiện tại file này import nhưng chưa dùng trong JSX - có thể dùng để link sang trang khác)
import { Link, useSearchParams } from 'react-router-dom'
// Link: tạo link điều hướng trong SPA (không reload trang)
// useSearchParams: quản lý URL query parameters (tab, page, search)

// Import AuthContext để lấy user (nếu cần)
import { useAuth } from '../contexts/AuthContext'
// useAuth: lấy user từ context (thông tin đăng nhập)
// Lưu ý: trong code này user lấy ra nhưng token lại lấy từ localStorage

// Import icon Calendar để hiển thị placeholder / background khi không có banner
import { Calendar, Search } from 'lucide-react'

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
  const token = 'cookie-auth'

  // ===================== URL PARAMS MANAGEMENT =====================
  // Lấy search params từ URL
  const [searchParams, setSearchParams] = useSearchParams()

  // Đọc giá trị từ URL query params khi component mount
  // Nếu không có trong URL, dùng default value
  const getInitialActiveTab = (): 'open' | 'upcoming' | 'closed' => {
    const tab = searchParams.get('tab')
    if (tab === 'open' || tab === 'upcoming' || tab === 'closed') return tab
    return 'open'
  }

  const getInitialPage = (): number => {
    const page = parseInt(searchParams.get('page') || '1', 10)
    return page > 0 ? page : 1
  }

  const getInitialSearchQuery = (): string => {
    return searchParams.get('search') || ''
  }

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
  const [activeTab, setActiveTab] = useState<'open' | 'upcoming' | 'closed'>(getInitialActiveTab())

  // searchQuery: từ khóa tìm kiếm
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery())

  // currentPage: trang hiện tại trong phân trang
  const [currentPage, setCurrentPage] = useState(getInitialPage())

  // itemsPerPage: số sự kiện hiển thị trên mỗi trang (2 hàng x 4 cột = 8 sự kiện)
  const itemsPerPage = 8

  // totalItems: tổng số sự kiện từ API response
  const [totalItems, setTotalItems] = useState(0)

  // itemsPerPage: số sự kiện hiển thị trên mỗi trang (8 sự kiện)
  // totalPages: tính toán tổng số trang từ totalItems
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  // ===================== DEBOUNCE REFERENCE =====================
  // debounceTimerRef: lưu timeout ID cho debounce search
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ===================== STATE cho Event Detail Modal =====================
  // isDetailOpen: mở/đóng modal chi tiết
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // selectedEvent: dữ liệu chi tiết event đang được chọn để xem
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null)

  // loadingDetail: trạng thái đang tải chi tiết event
  const [loadingDetail, setLoadingDetail] = useState(false)

  // detailError: lỗi khi load chi tiết event
  const [detailError, setDetailError] = useState<string | null>(null)

  // ===================== SYNC STATE WITH URL PARAMS =====================
  // Effect: cập nhật URL khi tab, page, hoặc search thay đổi
  useEffect(() => {
    const newParams = new URLSearchParams()
    
    // Thêm tab vào URL (mặc định là 'open')
    if (activeTab !== 'open') {
      newParams.set('tab', activeTab)
    }
    
    // Thêm page vào URL (mặc định là '1')
    if (currentPage !== 1) {
      newParams.set('page', currentPage.toString())
    }
    
    // Thêm search vào URL (nếu có từ khóa)
    if (searchQuery.trim() !== '') {
      newParams.set('search', searchQuery)
    }
    
    // Cập nhật URL search params
    setSearchParams(newParams)
  }, [activeTab, currentPage, searchQuery, setSearchParams])

  // ===================== GỌI API: LẤY DANH SÁCH SỰ KIỆN (WITH PAGINATION + SEARCH) =====================
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

        // Tạo query params cho API
        const queryParams = new URLSearchParams()
        
        // Thêm status parameter (mapping tab name to API status)
        // Lưu ý: backend có thể cần map từ tab name (open/upcoming/closed) thành status API
        queryParams.append('status', activeTab)
        
        // Thêm search parameter nếu có
        if (searchQuery.trim() !== '') {
          queryParams.append('search', searchQuery)
        }
        
        // Thêm pagination parameters
        queryParams.append('page', currentPage.toString())
        queryParams.append('limit', itemsPerPage.toString())

        // Gọi API lấy danh sách event với pagination + search
        const apiUrl = `/api/v1/events?${queryParams.toString()}`
        const res = await fetch(apiUrl, {
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
         * Backend trả về có thể là:
         * - Array thuần: [event1, event2]
         * - Hoặc object: { data: [...], total: 100, page: 1, limit: 8 }
         * - Hoặc object: { openEvents: [...], closedEvents: [...] }
         *
         * => Code handle cả 3 case:
         * - Nếu data là array -> dùng luôn
         * - Nếu có data property -> lấy data property
         * - Nếu không -> gộp openEvents + closedEvents thành 1 mảng
         */
        let eventsArray: EventListItem[] = []
        let total = 0
        
        if (Array.isArray(data)) {
          eventsArray = data
          total = data.length || 0
        } else if (data.data && Array.isArray(data.data)) {
          // Nếu backend trả { data: [...], total: 100 }
          eventsArray = data.data
          total = data.total || 0
        } else {
          // Fallback: try merging openEvents và closedEvents
          eventsArray = [
            ...(Array.isArray(data.openEvents) ? data.openEvents : []),
            ...(Array.isArray(data.closedEvents) ? data.closedEvents : []),
          ]
          total = eventsArray.length || 0
        }

        // Lưu tổng số items từ API
        setTotalItems(total)

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

    // Gọi fetchEvents khi component mount hoặc khi token, activeTab, currentPage, searchQuery đổi
    fetchEvents()
  }, [token, activeTab, currentPage, searchQuery])

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
      const refreshToken = sessionStorage.getItem('force-event-detail-refresh')
      const detailUrl = refreshToken
        ? `/api/events/detail?id=${eventId}&refresh=${encodeURIComponent(refreshToken)}`
        : `/api/events/detail?id=${eventId}`

      // Gọi API lấy chi tiết event
      const res = await fetch(detailUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (refreshToken) {
        sessionStorage.removeItem('force-event-detail-refresh')
      }

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

  // ===================== HANDLERS: TAB CHANGE, SEARCH, PAGINATION =====================

  /**
   * handleTabChange(newTab):
   * - Đổi tab và reset page about 1
   * - useCallback để tránh re-render không cần thiết
   */
  const handleTabChange = useCallback((newTab: 'open' | 'upcoming' | 'closed') => {
    setActiveTab(newTab)
    setCurrentPage(1) // Reset về trang 1 khi đổi tab
  }, [])

  /**
   * handleSearchChange(newQuery):
   * - Update search query với debounce 500ms
   * - Debounce giúp tránh gọi API quá nhiều lần khi user gõ liên tục
   * - Reset page về 1 khi thay đổi search
   */
  const handleSearchChange = useCallback((newQuery: string) => {
    // Update local state ngay để UI responsive
    setSearchQuery(newQuery)
    
    // Nếu có timer debounce đang chạy, hủy nó
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Tạo timer mới sẽ chạy sau 500ms
    // Khi timer chạy xong, reset page về 1 để user thấy kết quả từ đầu
    debounceTimerRef.current = setTimeout(() => {
      setCurrentPage(1)
    }, 500)
  }, [])

  /**
   * handlePageChange(newPage):
   * - Đổi trang hiện tại
   * - Validate trang nằm trong phạm vi hợp lệ [1, totalPages]
   */
  const handlePageChange = useCallback((newPage: number) => {
    // Đảm bảo trang mới hợp lệ
    const validPage = Math.max(1, Math.min(newPage, totalPages || 1))
    setCurrentPage(validPage)
    // Cuộn lên đầu trang khi đổi trang (UX tốt)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [totalPages])

  // ===================== CLIENT-SIDE FILTERING (OPTIONAL - for backward compatibility) =====================
  // Note: 데이터는 이제 SERVER-SIDE에서 필터링되어 옵니다 (status, search, pagination)
  // 다음의 필터링은 필요한 경우에만 적용됩니다

  // today: đầu ngày hiện tại (00:00:00) để so sánh ngày
  const today = startOfDay(new Date())

  /**
   * OPTIONAL: Client-side filtering (if backend doesn't support all filters)
   * 만약 backend가 pagination만 지원하고 필터링은 하지 않는 경우,
   * 아래의 필터링을 사용할 수 있습니다.
   */

  // ===================== RENDER UI (JSX) =====================

  /**
   * paginatedEvents: API từ server trả về đã là dữ liệu của trang hiện tại
   * 단순히 API 응답을 직접 사용합니다
   */
  const displayedEvents = events

  /**
   * Tạo array số trang cho pagination UI
   * 
   * IMPORTANT: Backend cần trả về thông tin:
   *  - total: tổng số events
   *  - page: trang hiện tại
   *  - limit: số items per page
   * 
   * Hoặc bạn có thể hardcode totalPages dựa vào API response
   */

  // Tạo array số trang cho pagination UI
  const getPaginationItems = () => {
    const items: (number | string)[] = []
    const maxPagesToShow = 5

    if (totalPages <= maxPagesToShow) {
      // Nếu tổng số trang <= 5, hiển thị tất cả
      for (let i = 1; i <= totalPages; i++) {
        items.push(i)
      }
    } else {
      // Hiển thị trang đầu
      items.push(1)

      // Tính vị trí bắt đầu của "..." giữa
      const startOfMiddle = Math.max(2, currentPage - 1)
      const endOfMiddle = Math.min(totalPages - 1, currentPage + 1)

      if (startOfMiddle > 2) {
        items.push('...')
      }

      // Hiển thị các trang xung quanh trang hiện tại
      for (let i = startOfMiddle; i <= endOfMiddle; i++) {
        items.push(i)
      }

      if (endOfMiddle < totalPages - 1) {
        items.push('...')
      }

      // Hiển thị trang cuối
      items.push(totalPages)
    }

    return items
  }

  return (
    <div>
      {/* Tiêu đề + Tìm kiếm */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Sự kiện tại Thành phố Hồ Chí Minh
        </h1>

        {/* Search Input */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm kiếm sự kiện..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
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
              onClick={() => handleTabChange('open')}
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
              onClick={() => handleTabChange('upcoming')}
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
              onClick={() => handleTabChange('closed')}
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
          {events.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">Hiện chưa có sự kiện đang mở</p>
            </div>
          ) : (
            <>
              {/* Grid Sự kiện (hiển thị events từ API) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {displayedEvents.map((event) => {
                  // Parse ngày giờ event
                  const eventDate = new Date(event.startTime)

                  // Kiểm tra event có phải hôm nay không
                  const today = startOfDay(new Date())
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

              {/* Pagination - Only show if totalPages > 1 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  {/* Nút Trước */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Trước
                  </button>

                  {/* Số trang */}
                  <div className="flex gap-1">
                    {getPaginationItems().map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof item === 'number') {
                            handlePageChange(item)
                          }
                        }}
                        disabled={typeof item === 'string'}
                        className={`px-3 py-2 rounded-lg transition-colors ${
                          item === currentPage
                            ? 'bg-orange-500 text-white font-semibold'
                            : typeof item === 'number'
                              ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                              : 'text-gray-500 cursor-default'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  {/* Nút Sau */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Sau →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ===== TAB UPCOMING: Sự kiện sắp diễn ra ===== */}
      {activeTab === 'upcoming' && (
        <>
          {events.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">Hiện chưa có sự kiện sắp mở</p>
            </div>
          ) : (
            <>
              {/* Grid Sự kiện (hiển thị events từ API) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {displayedEvents.map((event) => {
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

              {/* Pagination - Only show if totalPages > 1 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  {/* Nút Trước */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Trước
                  </button>

                  {/* Số trang */}
                  <div className="flex gap-1">
                    {getPaginationItems().map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof item === 'number') {
                            handlePageChange(item)
                          }
                        }}
                        disabled={typeof item === 'string'}
                        className={`px-3 py-2 rounded-lg transition-colors ${
                          item === currentPage
                            ? 'bg-orange-500 text-white font-semibold'
                            : typeof item === 'number'
                              ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                              : 'text-gray-500 cursor-default'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  {/* Nút Sau */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Sau →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ===== TAB CLOSED: Sự kiện đã kết thúc ===== */}
      {activeTab === 'closed' && (
        <>
          {events.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">Chưa có sự kiện đã kết thúc</p>
            </div>
          ) : (
            <>
              {/* Grid Sự kiện (hiển thị events từ API) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {displayedEvents.map((event) => (
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

              {/* Pagination - Only show if totalPages > 1 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  {/* Nút Trước */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Trước
                  </button>

                  {/* Số trang */}
                  <div className="flex gap-1">
                    {getPaginationItems().map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof item === 'number') {
                            handlePageChange(item)
                          }
                        }}
                        disabled={typeof item === 'string'}
                        className={`px-3 py-2 rounded-lg transition-colors ${
                          item === currentPage
                            ? 'bg-orange-500 text-white font-semibold'
                            : typeof item === 'number'
                              ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                              : 'text-gray-500 cursor-default'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  {/* Nút Sau */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Sau →
                  </button>
                </div>
              )}
            </>
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
