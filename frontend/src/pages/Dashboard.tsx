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

// ✅ Import timezone-safe date formatter
import { formatWallClockDateTimeWithDayOfWeek } from '../utils/dateFormat'
// formatWallClockDateTimeWithDayOfWeek: Extract date/time via pure strings + safe Date usage for day-of-week only
// Returns: "18/04/2026 • Thứ Năm • 14:00"

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

  // itemsPerPage: số sự kiện hiển thị trên mỗi trang (3 hàng x 4 cột = 12 sự kiện)
  const itemsPerPage = 12

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
          },
          credentials: 'include',
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

    // Gọi fetchEvents кси component mount hoặc khi activeTab, currentPage, searchQuery đổi
    fetchEvents()
  }, [activeTab, currentPage, searchQuery])

  // ===================== MỞ MODAL CHI TIẾT + GỌI API DETAIL =====================
  /**
   * openEventDetail(eventId):
   * - Khi user click vào 1 event card -> mở modal detail
   * - Đồng thời gọi API /api/events/detail?id=... để lấy chi tiết event
   */
  const openEventDetail = async (eventId: number) => {
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
        },
        credentials: 'include',
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

  const isEventClosedOrEnded = (event: EventListItem, tab: string): boolean => {
    if (tab === 'closed' || event.status === 'CLOSED') {
      return true
    }
    if (event.endTime && new Date(event.endTime) < new Date()) {
      return true
    }
    return false
  }

  const getStatusBadge = (event: EventListItem, tab: string): string => {
    if (tab === 'closed' || event.status === 'CLOSED') {
      return 'Đã kết thúc'
    }
    if (tab === 'upcoming' || event.status === 'UPCOMING') {
      return 'Sắp diễn ra'
    }
    return 'Hôm nay'
  }

  const renderLoadingSkeletons = () => (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div key={idx} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-md animate-pulse flex flex-col h-full">
          <div className="w-full h-44 bg-gray-200"></div>
          <div className="p-5 flex-1 flex flex-col space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-full mt-auto"></div>
          </div>
        </div>
      ))}
    </div>
  )

  const renderEmptyState = (title: string, subtitle: string) => (
    <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-3xl border-2 border-dashed border-gray-200 dark:border-slate-800 p-16 text-center shadow-lg max-w-lg mx-auto my-12 transition-all duration-300 hover:border-orange-300">
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-orange-100 rounded-full scale-150 opacity-40 blur-md animate-pulse"></div>
          <svg className="w-20 h-20 text-orange-500 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
      <h3 className="text-2xl font-extrabold text-gray-900 dark:text-slate-50 mb-2">{title}</h3>
      <p className="text-gray-500 dark:text-slate-400 text-sm leading-relaxed max-w-xs mx-auto mb-6">{subtitle}</p>
    </div>
  )

  return (
    <div className="w-full mx-auto pb-12">
      {/* Tiêu đề + Tìm kiếm */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight sm:text-5xl">
            Sự kiện tại <span className="bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">Thành phố Hồ Chí Minh</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm md:text-base font-medium">Khám phá và đăng ký tham gia các hoạt động nổi bật nhất tại campus.</p>
        </div>

        {/* Search Input */}
        <div className="relative max-w-md w-full md:w-80">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm kiếm sự kiện..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300 bg-white/50 backdrop-blur-sm hover:border-orange-300 focus:bg-white text-gray-800 placeholder-gray-400 font-semibold"
          />
        </div>
      </div>

      {/* Hiển thị lỗi nếu có */}
      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-semibold">Lỗi: {error}</span>
        </div>
      )}

      {/* ===================== TAB PANEL ===================== */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {/* Tab 1: Sự kiện hôm nay */}
            <button
              onClick={() => handleTabChange('open')}
              className={`py-4 px-1 border-b-2 font-bold text-base transition-all duration-300 relative ${activeTab === 'open'
                ? 'border-orange-500 text-orange-600 scale-105'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span>Sự kiện hôm nay</span>
              {activeTab === 'open' && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-full animate-pulse"></span>
              )}
            </button>

            {/* Tab 2: Sự kiện sắp diễn ra */}
            <button
              onClick={() => handleTabChange('upcoming')}
              className={`py-4 px-1 border-b-2 font-bold text-base transition-all duration-300 relative ${activeTab === 'upcoming'
                ? 'border-orange-500 text-orange-600 scale-105'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span>Sự kiện sắp diễn ra</span>
              {activeTab === 'upcoming' && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-full animate-pulse"></span>
              )}
            </button>

            {/* Tab 3: Sự kiện đã kết thúc */}
            <button
              onClick={() => handleTabChange('closed')}
              className={`py-4 px-1 border-b-2 font-bold text-base transition-all duration-300 relative ${activeTab === 'closed'
                ? 'border-orange-500 text-orange-600 scale-105'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <span>Sự kiện đã kết thúc</span>
              {activeTab === 'closed' && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-orange-500 rounded-full animate-pulse"></span>
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* ===================== EVENTS GRID THEO TAB ===================== */}

      {/* ===== TAB OPEN: Sự kiện hôm nay ===== */}
      {activeTab === 'open' && (
        <>
          {loading ? (
            renderLoadingSkeletons()
          ) : events.length === 0 && totalItems === 0 ? (
            renderEmptyState("Hôm nay chưa có sự kiện nào", "Hãy đón chờ các sự kiện tiếp theo trong ngày hôm nay nhé!")
          ) : (
            <>
              {/* Results Count */}
              <div className="mb-6 text-sm text-gray-600 font-medium">
                <p>Hiển thị <span className="text-orange-600 font-bold">{displayedEvents.length}</span> trên tổng số <span className="text-orange-600 font-bold">{totalItems}</span> sự kiện</p>
              </div>

              {/* Grid Sự kiện - đúng 4 cột trên Desktop */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {displayedEvents.map((event) => {
                  const showTodayBadge = activeTab === 'open' && event.status === 'OPEN'

                  return (
                    <button
                      key={event.eventId}
                      onClick={() => openEventDetail(event.eventId)}
                      className={`text-left block rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-1.5 transition-all duration-500 cursor-pointer bg-white dark:bg-slate-900 h-full flex flex-col border-2 ${showTodayBadge
                        ? 'border-red-500 shadow-xl shadow-red-500/20 transform scale-[1.02]'
                        : 'border-white/80 dark:border-slate-800/80 shadow-md hover:border-orange-500 dark:hover:border-orange-500'
                        }`}
                    >
                      {/* Banner Image */}
                      {event.bannerUrl ? (
                        <div className="relative overflow-hidden group h-44">
                          <img
                            src={event.bannerUrl}
                            alt={event.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          {showTodayBadge && (
                            <span className="absolute top-3 right-3 px-3 py-1.5 bg-gradient-to-r from-red-600 to-orange-600 text-white text-xs font-bold rounded-lg shadow-lg animate-pulse">
                              🔥 HÔM NAY
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-44 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center relative">
                          <Calendar className="w-12 h-12 text-blue-400 dark:text-blue-500" />
                          {showTodayBadge && (
                            <span className="absolute top-3 right-3 px-3 py-1.5 bg-gradient-to-r from-red-600 to-orange-600 text-white text-xs font-bold rounded-lg shadow-lg animate-pulse">
                              🔥 HÔM NAY
                            </span>
                          )}
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col">
                        {/* Status Badge */}
                        <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg mb-3 w-fit tracking-wide ${isEventClosedOrEnded(event, activeTab)
                          ? 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                          }`}>
                          {getStatusBadge(event, activeTab)}
                        </span>

                        {/* Title */}
                        <h3 className={`text-base font-bold mb-2 line-clamp-2 leading-snug ${showTodayBadge ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                          }`}>
                          {event.title}
                        </h3>

                        {/* Date & Time */}
                        <p className={`text-xs mb-3 font-semibold line-clamp-1 ${showTodayBadge ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
                          }`}>
                          {formatWallClockDateTimeWithDayOfWeek(event.startTime)}
                        </p>

                        {/* Location */}
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-auto leading-relaxed">
                          📍 {event.venueLocation || event.location || 'Trực tuyến'}
                        </p>

                        {/* View Details Button Spacer */}
                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                          <p className="text-orange-600 dark:text-orange-500 text-xs font-bold tracking-wide">XEM CHI TIẾT</p>
                          <svg className="w-4 h-4 text-orange-600 dark:text-orange-500 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="w-full flex justify-center items-center gap-2 mt-10">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
                  >
                    ← Trước
                  </button>

                  <div className="flex gap-1.5">
                    {getPaginationItems().map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof item === 'number') {
                            handlePageChange(item)
                          }
                        }}
                        disabled={typeof item === 'string'}
                        className={`px-3.5 py-2 rounded-xl transition-all duration-300 font-semibold ${item === currentPage
                          ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20'
                          : typeof item === 'number'
                            ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'text-gray-400 cursor-default'
                          }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
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
          {loading ? (
            renderLoadingSkeletons()
          ) : events.length === 0 && totalItems === 0 ? (
            renderEmptyState("Chưa có sự kiện nào sắp tới", "Các chương trình hấp dẫn đang được chuẩn bị chu đáo và sẽ sớm xuất hiện!")
          ) : (
            <>
              {/* Results Count */}
              <div className="mb-6 text-sm text-gray-600 font-medium">
                <p>Hiển thị <span className="text-orange-600 font-bold">{displayedEvents.length}</span> trên tổng số <span className="text-orange-600 font-bold">{totalItems}</span> sự kiện</p>
              </div>

              {/* Grid Sự kiện - đúng 4 cột trên Desktop */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {displayedEvents.map((event) => {
                  return (
                    <button
                      key={event.eventId}
                      onClick={() => openEventDetail(event.eventId)}
                      className="text-left block rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-1.5 transition-all duration-500 cursor-pointer bg-white dark:bg-slate-900 border border-white/80 dark:border-slate-800/80 shadow-md h-full flex flex-col"
                    >
                      {/* Banner */}
                      {event.bannerUrl ? (
                        <div className="relative overflow-hidden group h-44">
                          <img
                            src={event.bannerUrl}
                            alt={event.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-44 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center relative">
                          <Calendar className="w-12 h-12 text-yellow-400 dark:text-yellow-500" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col">
                        {/* Status Badge */}
                        <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg mb-3 w-fit tracking-wide ${isEventClosedOrEnded(event, activeTab)
                          ? 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          }`}>
                          {getStatusBadge(event, activeTab)}
                        </span>

                        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 leading-snug">
                          {event.title}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 font-semibold line-clamp-1">
                          {formatWallClockDateTimeWithDayOfWeek(event.startTime)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-auto leading-relaxed">
                          📍 {event.venueLocation || event.location || 'Trực tuyến'}
                        </p>

                        {/* View Details Button Spacer */}
                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                          <p className="text-orange-600 dark:text-orange-500 text-xs font-bold tracking-wide">XEM CHI TIẾT</p>
                          <svg className="w-4 h-4 text-orange-600 dark:text-orange-500 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="w-full flex justify-center items-center gap-2 mt-10">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
                  >
                    ← Trước
                  </button>

                  <div className="flex gap-1.5">
                    {getPaginationItems().map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof item === 'number') {
                            handlePageChange(item)
                          }
                        }}
                        disabled={typeof item === 'string'}
                        className={`px-3.5 py-2 rounded-xl transition-all duration-300 font-semibold ${item === currentPage
                          ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20'
                          : typeof item === 'number'
                            ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'text-gray-400 cursor-default'
                          }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
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
          {loading ? (
            renderLoadingSkeletons()
          ) : events.length === 0 && totalItems === 0 ? (
            renderEmptyState("Chưa có sự kiện nào khép lại", "Tất cả thông tin sự kiện đã kết thúc sẽ hiển thị chi tiết tại đây.")
          ) : (
            <>
              {/* Results Count */}
              <div className="mb-6 text-sm text-gray-600 font-medium">
                <p>Hiển thị <span className="text-orange-600 font-bold">{displayedEvents.length}</span> trên tổng số <span className="text-orange-600 font-bold">{totalItems}</span> sự kiện</p>
              </div>

              {/* Grid Sự kiện - đúng 4 cột trên Desktop */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {displayedEvents.map((event) => (
                  <button
                    key={event.eventId}
                    onClick={() => openEventDetail(event.eventId)}
                    className="text-left block rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-1.5 transition-all duration-500 cursor-pointer bg-white dark:bg-slate-900 border border-white/80 dark:border-slate-800/80 shadow-md opacity-85 hover:opacity-100 transition-opacity h-full flex flex-col"
                  >
                    {/* Banner */}
                    {event.bannerUrl ? (
                      <div className="relative overflow-hidden group h-44">
                        <img
                          src={event.bannerUrl}
                          alt={event.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-44 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center relative">
                        <Calendar className="w-12 h-12 text-gray-450 dark:text-gray-500" />
                      </div>
                    )}
 
                    {/* Content */}
                    <div className="p-5 flex-1 flex flex-col">
                      <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300 text-xs font-bold rounded-lg mb-3 w-fit tracking-wide">
                        {getStatusBadge(event, activeTab)}
                      </span>

                      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 leading-snug">
                        {event.title}
                      </h3>

                      <p className="text-xs text-gray-650 dark:text-gray-300 mb-3 font-semibold line-clamp-1">
                        {formatWallClockDateTimeWithDayOfWeek(event.startTime)}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-auto leading-relaxed">
                        📍 {event.venueLocation || event.location || 'Trực tuyến'}
                      </p>

                      {/* View Details Button Spacer */}
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                        <p className="text-orange-600 dark:text-orange-500 text-xs font-bold tracking-wide">XEM CHI TIẾT</p>
                        <svg className="w-4 h-4 text-orange-600 dark:text-orange-500 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="w-full flex justify-center items-center gap-2 mt-10">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
                  >
                    ← Trước
                  </button>

                  <div className="flex gap-1.5">
                    {getPaginationItems().map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (typeof item === 'number') {
                            handlePageChange(item)
                          }
                        }}
                        disabled={typeof item === 'string'}
                        className={`px-3.5 py-2 rounded-xl transition-all duration-300 font-semibold ${item === currentPage
                          ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20'
                          : typeof item === 'number'
                            ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'text-gray-400 cursor-default'
                          }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
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
        userRole={user?.role}        // truyền role để ẩn chọn ghế cho ORGANIZER/STAFF/ADMIN
      />
    </div>
  )
}
