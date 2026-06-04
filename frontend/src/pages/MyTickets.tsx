// Import hook React để dùng state + lifecycle
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

// Import Link và useSearchParams để điều hướng và quản lý URL params
import { Link, useSearchParams } from 'react-router-dom'

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
  Search,               // Icon search
  Filter,               // Icon filter
} from 'lucide-react'

// Import component modal hủy vé
import CancelTicketModal from '../components/common/CancelTicketModal'

// Import format ngày giờ từ date-fns
import { format } from 'date-fns'

// Import locale tiếng Việt để format ngày theo định dạng VN
import { vi, enUS } from 'date-fns/locale'

// Import components
import Pagination from '../components/common/Pagination'
import TicketSkeleton from '../components/common/TicketSkeleton'
import placeholderBanner from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'

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

// Response type từ backend pagination
type PaginatedTicketsResponse = {
  tickets: MyTicket[]
  totalPages: number
  currentPage: number
  totalRecords: number
}

/**
 * Component MyTickets:
 * - Trang "Vé của tôi"
 * - Load danh sách vé của user từ backend với pagination, search, filter
 * - Hiển thị danh sách vé dạng card
 * - Mỗi card có nút "Xem vé QR" để mở popup QR code
 * - Hiển thị trạng thái: chưa check-in / đã check-in / đã check-out / hết hạn
 */
export default function MyTickets() {
  const { currentLanguage } = useAuth()
  // URL params management
  const [searchParams, setSearchParams] = useSearchParams()

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

  // reportsTicketIds: map ticketId → reportStatus (để hiển thị badge đúng trạng thái)
  const [reportsTicketIds, setReportsTicketIds] = useState<Map<number, string>>(new Map())

  // Pagination states - Initialize from URL params
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get('page')
    return page ? parseInt(page, 10) : 1
  })
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [limit] = useState(10)

  // Search & Filter states - Initialize from URL params
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '')

  // Debounce timer
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  /**
   * fetchTickets: Gọi API lấy danh sách vé với pagination và filter
   */
  const fetchTickets = useCallback(async (page: number, search: string, status: string) => {
    // Bắt đầu fetch: bật loading và reset error
    setLoading(true)
    setError(null)

    try {
      // Build query params
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })

      if (search) {
        params.append('search', search)
      }

      if (status) {
        params.append('status', status)
      }

      // Gọi API lấy vé của tôi
      const res = await fetch(`/api/registrations/my-tickets?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      // Nếu response không OK thì xử lý lỗi theo status code
      if (!res.ok) {
        if (res.status === 401) {
          // 401: token hết hạn / không hợp lệ
          setError(currentLanguage === 'en' ? 'Session expired. Please login again.' : 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.')
        } else {
          // Lỗi chung
          setError(currentLanguage === 'en' ? 'Failed to load tickets. Please try again later.' : 'Không thể tải danh sách vé. Vui lòng thử lại sau.')
        }
        // reset danh sách vé về rỗng
        setTickets([])
        return
      }

      // Parse JSON từ response
      const data: PaginatedTicketsResponse = await res.json()

      // Log để debug dữ liệu từ API
      console.log('Paginated tickets from API:', data)

      // Cập nhật state
      setTickets(Array.isArray(data.tickets) ? data.tickets : [])
      setTotalPages(data.totalPages || 1)
      setCurrentPage(data.currentPage || 1)
      setTotalRecords(data.totalRecords || 0)
    } catch (err) {
      // Nếu lỗi network/cors/timeout
      console.error('Error loading tickets:', err)
      setError(currentLanguage === 'en' ? 'An error occurred while loading tickets.' : 'Có lỗi xảy ra khi tải danh sách vé.')
      setTickets([])
    } finally {
      // Dù thành công hay lỗi đều tắt loading
      setLoading(false)
    }
  }, [limit])

  // Sync URL params khi state thay đổi
  useEffect(() => {
    const params = new URLSearchParams()

    if (currentPage > 1) {
      params.set('page', currentPage.toString())
    }

    if (searchQuery) {
      params.set('search', searchQuery)
    }

    if (statusFilter) {
      params.set('status', statusFilter)
    }

    // Use replace for search to avoid cluttering browser history
    setSearchParams(params, { replace: true })
  }, [currentPage, searchQuery, statusFilter, setSearchParams])

  // Fetch tickets khi component mount hoặc khi page/search/filter thay đổi
  useEffect(() => {
    fetchTickets(currentPage, searchQuery, statusFilter)
  }, [currentPage, searchQuery, statusFilter, fetchTickets])

  // Fetch ALL ticket IDs with reports (One Ticket - One Report vĩnh viễn)
  // This endpoint now returns tickets with PENDING, APPROVED, REJECTED reports
  useEffect(() => {
    const fetchReportTicketIds = async () => {
      try {
        const res = await fetch('/api/student/reports/pending-ticket-ids', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!res.ok) return

        const data = await res.json()
        // Expect { status: 'success', data: [ids] } or just [ids]
        const items = Array.isArray(data) ? data : data?.data ?? []

        // Support both legacy [id] format and new [{ticketId, reportStatus}] format
        const reportMap = new Map<number, string>()
        for (const item of items) {
          if (typeof item === 'object' && item !== null && 'ticketId' in item) {
            reportMap.set(Number(item.ticketId), String(item.reportStatus ?? 'PENDING'))
          } else {
            reportMap.set(Number(item), 'PENDING')
          }
        }

        setReportsTicketIds(reportMap)
      } catch (err) {
        console.error('Error fetching report ticket ids:', err)
      }
    }

    fetchReportTicketIds()
  }, [])

  // Handle search with debounce (500ms)
  const handleSearchChange = (value: string) => {
    setSearchInput(value)

    // Clear previous timer
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Set new timer
    const timer = setTimeout(() => {
      setSearchQuery(value)
      setCurrentPage(1) // Reset to first page on search (will sync to URL)
    }, 500)

    setDebounceTimer(timer)
  }

  // Handle status filter change
  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1) // Reset to first page on filter (will sync to URL)
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ===================== Helpers map field =====================
  // Vì BE có thể trả field khác nhau, ta viết helper để lấy value hợp lệ nhất

  // Lấy tên sự kiện: ưu tiên eventName -> eventTitle -> title -> fallback
  const getEventTitle = (t: MyTicket) =>
    t.eventName || t.eventTitle || t.title || (currentLanguage === 'en' ? 'Unnamed Event' : 'Sự kiện không tên')

  // Lấy thời gian bắt đầu: ưu tiên eventStartTime -> startTime -> startDate
  const getStartTime = (t: MyTicket) =>
    t.eventStartTime || t.startTime || t.startDate || ''

  // Lấy địa điểm: ưu tiên venueName -> location -> fallback
  const getLocation = (t: MyTicket) =>
    t.venueName || t.location || (currentLanguage === 'en' ? 'TBD' : 'Đang cập nhật địa điểm')

  // Lấy thông tin ghế: seatCode hoặc seatNumber
  const getSeatLabel = (t: MyTicket) =>
    t.seatCode || t.seatNumber || ''

  // Lấy ảnh: bannerUrl hoặc imageUrl
  const getImageUrl = (t: MyTicket) =>
    t.bannerUrl || t.imageUrl || (t as any).event?.banner_url || (t as any).event?.bannerUrl || placeholderBanner

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
        setReportsTicketIds((prev) => {
          const next = new Map(prev)
          next.set(Number(ticketId), 'PENDING')
          return next
        })
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
    return format(d, 'dd/MM/yyyy HH:mm:ss', { locale: currentLanguage === 'en' ? enUS : vi })
  }

  /**
   * getTicketDisplayCode:
   * - Mã vé hiển thị để Organizer/staff gõ thủ công (dùng ticketId hoặc id)
   * - Trả về null nếu không có id hợp lệ
   */
  const getTicketDisplayCode = (t: MyTicket) =>
    t.ticketId ?? t.id ?? null

  if (error) {
    return (
      <div className="bg-gradient-to-br from-orange-50/20 via-slate-50 to-amber-50/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center py-16 bg-white/70 backdrop-blur-md dark:bg-slate-900/70 border border-white/80 dark:border-slate-800 rounded-3xl p-8 max-w-md mx-auto my-12 shadow-md">
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-350 rounded-2xl w-fit mx-auto mb-4 border border-rose-100/50 dark:border-rose-900/30">
            <XCircle className="w-8 h-8 animate-pulse" />
          </div>
          <p className="text-slate-800 dark:text-white font-extrabold text-lg">{currentLanguage === 'en' ? 'An error occurred' : 'Đã xảy ra lỗi'}</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 font-medium leading-relaxed">{error}</p>
          <div className="mt-6">
            <Link
              to="/dashboard/events"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-orange-650 hover:bg-orange-600 text-white rounded-xl text-xs font-extrabold transition-all duration-300 shadow-md shadow-orange-500/10 hover:scale-[1.02] active:scale-95"
            >
              {currentLanguage === 'en' ? 'View upcoming events →' : 'Xem các sự kiện sắp tới →'}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /**
   * Render danh sách vé với search/filter/pagination
   */
  return (
    <div className="bg-gradient-to-br from-orange-50/20 via-slate-50 to-amber-50/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      {/* Tiêu đề trang */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-4xl">
            {currentLanguage === 'en' ? 'My Tickets' : 'Vé của tôi'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl font-medium">
            {currentLanguage === 'en' ? 'Manage, track attendance history and use QR tickets to participate in events at FPT University.' : 'Quản lý, theo dõi lịch sử tham dự và sử dụng vé QR tham gia sự kiện tại trường FPT.'}
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800/80 p-5 shadow-md mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search input */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder={currentLanguage === 'en' ? 'Search by event name...' : 'Tìm kiếm theo tên sự kiện...'}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800 dark:text-white font-semibold placeholder-slate-400 text-sm shadow-sm transition-all duration-300"
            />
          </div>

          {/* Status filter */}
          <div className="relative min-w-[220px]">
            <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-750 dark:text-slate-200 font-semibold text-sm shadow-sm appearance-none cursor-pointer transition-all duration-300"
            >
              <option value="">{currentLanguage === 'en' ? 'All Statuses' : 'Tất cả trạng thái'}</option>
              <option value="BOOKED">{currentLanguage === 'en' ? 'Not Checked In' : 'Chưa check-in'}</option>
              <option value="CHECKED_IN">{currentLanguage === 'en' ? 'Checked In' : 'Đã check-in'}</option>
              <option value="CHECKED_OUT">{currentLanguage === 'en' ? 'Checked Out' : 'Đã check-out'}</option>
              <option value="PENDING">{currentLanguage === 'en' ? 'Pending Refund' : 'Đang chờ hoàn tiền'}</option>
              <option value="REFUNDED">{currentLanguage === 'en' ? 'Refunded' : 'Đã hoàn tiền'}</option>
              <option value="EXPIRED">{currentLanguage === 'en' ? 'Expired' : 'Hết hạn'}</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <div className="mt-3.5 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider pl-1">
{currentLanguage === 'en' ? 'Found' : 'Tìm thấy'} <span className="text-orange-655 font-extrabold">{totalRecords}</span> {currentLanguage === 'en' ? 'tickets' : 'vé'}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <TicketSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && tickets.length === 0 && (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800/80 p-16 text-center shadow-md animate-fade-in-up">
          <div className="p-4 bg-orange-50 dark:bg-orange-950/20 text-orange-500 dark:text-orange-350 rounded-full w-fit mx-auto mb-4 border border-orange-100/50 dark:border-orange-900/30">
            <TicketIcon className="w-12 h-12 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
{searchQuery || statusFilter ? (currentLanguage === 'en' ? 'No matching tickets found' : 'Không tìm thấy vé phù hợp') : (currentLanguage === 'en' ? "You don't have any tickets yet" : 'Bạn chưa có vé nào')}
          </h3>
          <p className="text-sm text-slate-400 dark:text-slate-450 mt-2 max-w-sm mx-auto font-medium">
{searchQuery || statusFilter
              ? (currentLanguage === 'en' ? 'Please try again with a different keyword or clear filters.' : 'Vui lòng thử lại với từ khóa khác hoặc xóa bộ lọc.')
              : (currentLanguage === 'en' ? 'Explore interesting events and register for tickets to join now!' : 'Hãy khám phá các sự kiện thú vị và đăng ký vé tham gia ngay nhé!')}
          </p>
          {(searchQuery || statusFilter) && (
            <button
              onClick={() => {
                setSearchInput('')
                setSearchQuery('')
                setStatusFilter('')
                setCurrentPage(1)
              }}
              className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-extrabold transition-all duration-300 shadow-md shadow-orange-500/10 hover:scale-[1.02] active:scale-95"
            >
              {currentLanguage === 'en' ? 'Clear filters' : 'Xóa bộ lọc'}
            </button>
          )}
          {!searchQuery && !statusFilter && (
            <Link
              to="/dashboard/events"
              className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-extrabold transition-all duration-300 shadow-md shadow-orange-500/10 hover:scale-[1.02] active:scale-95"
            >
              {currentLanguage === 'en' ? 'Explore events now →' : 'Khám phá sự kiện ngay →'}
            </Link>
          )}
        </div>
      )}

      {/* Grid hiển thị các vé dạng card */}
      {!loading && tickets.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tickets.map((t, index) => {
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
              // Check if ticket already has ANY report (PENDING, APPROVED, REJECTED)
              const existingReportStatus = reportsTicketIds.get(id)
              const hasExistingReport = !!existingReportStatus || status === 'PENDING'

              // startText: text hiển thị thời gian bắt đầu event
              let startText = currentLanguage === 'en' ? 'TBD' : 'Đang cập nhật thời gian'
              if (start) {
                const d = new Date(start)
                if (!isNaN(d.getTime())) {
                  startText = format(d, 'dd/MM/yyyy HH:mm', { locale: currentLanguage === 'en' ? enUS : vi })
                }
              }

              return (
                <div
                  key={id}
                  className="animate-fade-in-up group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-md hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-1 transition-all duration-500"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {/* Decorative Ticket Punchout circles on left/right for passbook look */}
                  <div className="absolute left-0 top-[68%] -translate-y-1/2 w-4 h-8 bg-slate-50 dark:bg-slate-950 border-r border-slate-200/50 dark:border-slate-800 rounded-r-full z-10" />
                  <div className="absolute right-0 top-[68%] -translate-y-1/2 w-4 h-8 bg-slate-50 dark:bg-slate-950 border-l border-slate-200/50 dark:border-slate-800 rounded-l-full z-10" />

                  <div>
                    {/* Header Image/Banner */}
                    <div className="relative h-44 overflow-hidden bg-slate-100 dark:bg-slate-900">
                      <img
                        src={imageUrl}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-all duration-750"
                      />
                      {/* Gradient overlay on banner */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/10 to-transparent" />
                      
                      {/* Floating Indicator for Ticket Code */}
                      <div className="absolute top-4 right-4 bg-white/90 dark:bg-slate-800/90 border border-white/95 dark:border-slate-700 text-slate-800 dark:text-white font-extrabold text-[10px] uppercase tracking-wider py-1 px-3 rounded-full shadow-sm">
                        {currentLanguage === 'en' ? 'Code:' : 'Mã:'} #{id}
                      </div>

                      {/* Floating Status Badge */}
                      <div className="absolute bottom-4 left-4 flex flex-col gap-1">
                        {existingReportStatus === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/90 text-white backdrop-blur-sm border border-amber-400 shadow-sm shadow-amber-500/20">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                            {currentLanguage === 'en' ? 'Pending Refund' : 'Chờ hoàn tiền'}
                          </span>
                        ) : existingReportStatus === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/90 text-white backdrop-blur-sm border border-emerald-400 shadow-sm shadow-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {currentLanguage === 'en' ? 'Refunded' : 'Đã hoàn tiền'}
                          </span>
                        ) : existingReportStatus === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/90 text-white backdrop-blur-sm border border-rose-400 shadow-sm shadow-rose-500/20">
                            <XCircle className="w-3.5 h-3.5" />
                            {currentLanguage === 'en' ? 'Refund Rejected' : 'Từ chối hoàn tiền'}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm ${
                            status === 'EXPIRED' ? 'bg-rose-500/90 text-white border border-rose-400 shadow-rose-500/10' :
                            status === 'REFUNDED' ? 'bg-indigo-500/90 text-white border border-indigo-400 shadow-indigo-500/10' :
                            status === 'CHECKED_OUT' ? 'bg-purple-500/90 text-white border border-purple-400 shadow-purple-500/10' :
                            status === 'CHECKED_IN' ? 'bg-emerald-500/90 text-white border border-emerald-400 shadow-emerald-500/10' :
                            'bg-amber-500/90 text-white border border-amber-400 shadow-amber-500/10'
                          }`}>
                            {status === 'CHECKED_IN' && <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />}
                            {status === 'EXPIRED' ? (currentLanguage === 'en' ? 'Expired' : 'Hết hạn') :
                             status === 'REFUNDED' ? (currentLanguage === 'en' ? 'Refunded' : 'Đã hoàn tiền') :
                             status === 'CHECKED_OUT' ? (currentLanguage === 'en' ? 'Checked Out' : 'Đã check-out') :
                             status === 'CHECKED_IN' ? (currentLanguage === 'en' ? 'Checked In' : 'Đã check-in') :
                             (currentLanguage === 'en' ? 'Not Checked In' : 'Chưa check-in')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Main content body */}
                    <div className="p-6 pb-4">
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white line-clamp-1 group-hover:text-orange-600 transition-colors duration-300 mb-4">
                        {title}
                      </h3>

                      {/* Info details */}
                      <div className="space-y-2.5 text-xs text-slate-500 dark:text-slate-400 font-bold">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          <span>{currentLanguage === 'en' ? 'Time:' : 'Thời gian:'} <strong className="text-slate-700 dark:text-slate-200">{startText}</strong></span>
                        </div>

                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          <span className="truncate">{currentLanguage === 'en' ? 'Location:' : 'Địa điểm:'} <strong className="text-slate-700 dark:text-slate-200">{location}</strong></span>
                        </div>

                        {seat && (
                          <div className="flex items-center gap-2">
                            <TicketIcon className="w-4 h-4 text-orange-500 flex-shrink-0" />
                            <span>{currentLanguage === 'en' ? 'Seat:' : 'Số ghế:'} <strong className="text-slate-700 dark:text-slate-200">{seat}</strong></span>
                          </div>
                        )}

                        {existingReportStatus === 'REJECTED' && (
                          <div className="text-[11px] text-rose-500 font-semibold bg-rose-50/50 border border-rose-150 rounded-xl p-2.5 mt-2 flex items-center gap-1.5 animate-pulse">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{currentLanguage === 'en' ? 'Report/Refund request rejected by Staff' : 'Yêu cầu báo cáo/hoàn tiền bị từ chối bởi Staff'}</span>
                          </div>
                        )}

                        {/* Checkin checkout details if any */}
                        {getCheckInTime(t) && (
                          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-2.5">
                            <Clock className={`w-4 h-4 flex-shrink-0 ${isCheckedOut(t) ? 'text-purple-500' : 'text-emerald-500'}`} />
                            <span>{currentLanguage === 'en' ? 'Checked In At:' : 'Check-in:'} <strong className="text-slate-700 dark:text-slate-200">{formatTime(getCheckInTime(t))}</strong></span>
                          </div>
                        )}

                        {status === 'CHECKED_OUT' && getCheckOutTime(t) && (
                          <div className="flex items-center gap-2 pt-1">
                            <Clock className="w-4 h-4 text-purple-500 flex-shrink-0" />
                            <span>{currentLanguage === 'en' ? 'Checked Out At:' : 'Check-out:'} <strong className="text-slate-700 dark:text-slate-200">{formatTime(getCheckOutTime(t))}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tear-off Ticket Footer / Action Panel */}
                  <div className="px-6 pb-6 pt-4 border-t-2 border-dashed border-slate-200/80 dark:border-slate-800 mt-2 relative">
                    <div className="flex gap-3">
                      {/* Action Button: Báo cáo lỗi (Only for CHECKED_IN events with seat issues) */}
                      {!hasExistingReport && status === 'CHECKED_IN' && (
                        <button
                          type="button"
                          onClick={() => setCancelTicket(t)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all duration-300 shadow-sm hover:shadow hover:scale-[1.02] active:scale-95"
                        >
                          <FileX className="w-4 h-4" /> {currentLanguage === 'en' ? 'Report Issue' : 'Báo Cáo Lỗi'}
                        </button>
                      )}

                      {/* Action Button: Xem vé QR */}
                      <button
                        type="button"
                        onClick={() => setQrTicket(t)}
                        className={`${!hasExistingReport && status === 'CHECKED_IN' ? 'flex-1' : 'w-full'
                          } inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 rounded-xl hover:shadow-lg hover:shadow-orange-500/20 transition-all duration-300 hover:scale-[1.02] active:scale-95`}
                      >
                        <TicketIcon className="w-4 h-4" /> {currentLanguage === 'en' ? 'View QR Ticket' : 'Xem vé QR'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800/80 p-5 shadow-md">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}

          {/* ===================== MODAL HỦY VÉ ===================== */}
          {cancelTicket && (
            <CancelTicketModal
              ticketId={cancelTicket.ticketId ?? cancelTicket.id ?? 0}
              eventName={getEventTitle(cancelTicket)}
              onClose={() => setCancelTicket(null)}
              onSuccess={handleCancelSuccess}
            />
          )}

          {/* ===================== MODAL QR VÉ ===================== */}
          {qrTicket && (
            <div 
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
              onClick={() => setQrTicket(null)}
            >
              <div 
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-4 right-4">
                  <button 
                    onClick={() => setQrTicket(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-150 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-2.5 bg-orange-50 dark:bg-orange-950/30 text-orange-650 rounded-2xl w-fit mx-auto mb-4 border border-orange-100/50 animate-bounce">
                  <TicketIcon className="w-6 h-6" />
                </div>

                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1">{currentLanguage === 'en' ? 'Ticket QR Code' : 'Mã QR Vé'}</h2>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 px-4 truncate">
                  {getEventTitle(qrTicket)}
                </p>

                {getTicketDisplayCode(qrTicket) && (
                  <div className="mb-4 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100/40 dark:border-orange-900/30 rounded-2xl py-2.5 px-4 inline-block">
                    <p className="text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wide">
                      {currentLanguage === 'en' ? 'Your Ticket ID' : 'Mã số vé của bạn'}
                    </p>
                    <p className="text-base font-black text-orange-600 tracking-wider">
                      #{getTicketDisplayCode(qrTicket)}
                    </p>
                  </div>
                )}

                {/* Display QR code image from backend */}
                {qrTicket.ticketCode && qrTicket.ticketCode.startsWith('data:image') ? (
                  <div className="mx-auto w-60 h-60 mb-5 flex items-center justify-center bg-white p-3 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-inner relative overflow-hidden group">
                    <img
                      src={qrTicket.ticketCode}
                      alt="Ticket QR Code"
                      className="w-full h-full object-contain select-none"
                    />
                    <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  </div>
                ) : getTicketDisplayCode(qrTicket) ? (
                  <div className="mx-auto mb-5 p-5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl text-center">
                    <p className="text-sm font-bold text-amber-800 flex items-center justify-center gap-1 mb-1">
                      {currentLanguage === 'en' ? '⚠️ QR not ready (legacy ticket)' : '⚠️ QR chưa sẵn sàng (vé cũ)'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                      {currentLanguage === 'en' ? 'Use the ticket ID below to check-in at the event counter:' : 'Sử dụng mã vé dưới đây để check-in tại quầy sự kiện:'}
                    </p>
                    <div className="font-mono text-xl font-black bg-white dark:bg-slate-800 border border-amber-200/60 dark:border-slate-700 rounded-xl py-2 px-4 shadow-sm text-orange-600 tracking-widest inline-block animate-pulse">
                      {getTicketDisplayCode(qrTicket)}
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto mb-5 p-5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-center">
                    <p className="text-sm font-bold text-rose-800 mb-1">
                      {currentLanguage === 'en' ? 'QR Code Not Found' : 'Không tìm thấy QR'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {currentLanguage === 'en' ? 'This ticket does not have a valid QR code or ID. Please contact support.' : 'Vé này chưa có mã QR hoặc ID hợp lệ. Vui lòng liên hệ bộ phận hỗ trợ.'}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setQrTicket(null)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-2xl transition-all duration-300 shadow-sm active:scale-95"
                >
                  {currentLanguage === 'en' ? 'Close Window' : 'Đóng cửa sổ'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

