// Import Link để điều hướng trong SPA, useNavigate để chuyển trang bằng code
import { Link, useNavigate } from 'react-router-dom'

// Import icon dùng cho UI (trang landing nhìn đẹp, có biểu tượng)
import {
  CalendarDays,
  Ticket,
  Users,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Award,
  ChevronLeft,
  ChevronRight,
  Home,
  LogIn,
  Menu,
  X,
  BookOpen
} from 'lucide-react'

// React hooks: useState (state), useEffect (chạy side-effect), useRef (tham chiếu DOM)
import { useState, useEffect, useRef } from 'react'

// Import RealtimeClock component
import { RealtimeClock } from '../components/RealtimeClock'

// Import EventDetailModal and EventDetail types
import { EventDetailModal } from '../components/events/EventDetailModal'
import type { EventDetail } from '../types/event'

// Import helper để format thời gian theo Vietnam timezone
import { formatVietnamDateTime } from '../utils/dateFormat'

// Import logo và logo loading từ assets
import fptLogo from '../assets/fpt-logo.png'
import fptLogoLoading from '../assets/fpt-logo-loading.png'

/**
 * stats:
 * - Dữ liệu thống kê hiển thị ở phần "Stats Section"
 * - label: tên hiển thị
 * - value: giá trị "mẫu" (string)
 * - icon: component icon tương ứng
 *
 * Lưu ý: Ở UI thật bạn đang dùng counters (đếm số tăng dần), không dùng value trực tiếp.
 */
const stats = [
  { label: 'Sự kiện đã tổ chức', value: '250+', icon: CalendarDays },
  { label: 'Sinh viên tham gia', value: '1.000+', icon: Users },
  { label: 'Đơn vị tổ chức', value: '35+', icon: Award }
]

/**
 * benefits:
 * - Dữ liệu cho phần "Features Section"
 * - Hiển thị các lợi ích/tính năng của hệ thống
 */
const benefits = [
  {
    icon: CalendarDays,
    title: 'Quản lý lịch trình',
    description:
      'Một bảng điều khiển hiện đại giúp tổ chức theo dõi từng hoạt động trong suốt vòng đời sự kiện.'
  },
  {
    icon: Ticket,
    title: 'Vé thông minh',
    description:
      'Tự động tạo vé, mã QR và quản lý check-in chỉ với một cú nhấp chuột.'
  },
  {
    icon: Users,
    title: 'Theo dõi người tham dự',
    description:
      'Nắm rõ số lượng đăng ký, tình trạng ghế ngồi và phản hồi của khách tham dự.'
  },
  {
    icon: ShieldCheck,
    title: 'Phân quyền an toàn',
    description:
      'Phù hợp cho Ban tổ chức, Bộ phận kiểm soát và Tình nguyện viên với các quyền hạn riêng biệt.'
  }
]

/**
 * =============================================================================
 * GUEST LANDING PAGE - Trang landing cho khách (chưa đăng nhập)
 * =============================================================================
 *
 * Trang này làm gì?
 * - Là trang giới thiệu hệ thống quản lý sự kiện FPT Education
 * - Có nút "Đăng nhập" -> chuyển sang /login
 * - Hiển thị:
 *   1) Hero section (giới thiệu)
 *   2) Stats section (đếm số liệu tăng dần khi kéo tới)
 *   3) Features section (tính năng)
 *   4) Events section: lấy danh sách sự kiện từ API (/api/events/open) -> hiển thị 6 sự kiện nổi bật
 *   5) CTA section -> kêu gọi đăng nhập
 *   6) Footer
 * - Có hiệu ứng:
 *   + Loading overlay 0.5s khi bấm "Đăng nhập"
 *   + Đếm số stats (IntersectionObserver)
 *   + Carousel ngang phần event nổi bật: kéo ngang bằng wheel + nút trái/phải
 *
 * Luồng hoạt động chính:
 * 1) Mount trang -> gọi fetchEvents() -> lấy data -> setHighlightedEvents
 * 2) Khi user scroll tới stats section -> IntersectionObserver trigger -> animateCounters()
 * 3) Ở events section:
 *    - Có thể scroll ngang bằng:
 *      + mouse wheel (chuyển scroll dọc thành scroll ngang)
 *      + nút trái/phải (Chevron)
 *    - Khi rê chuột vào events -> khóa scroll body (overflow hidden) để wheel chỉ scroll ngang danh sách
 * 4) User bấm nút "Đăng nhập" / click vào card event:
 *    - showLoading = true -> hiện loading overlay
 *    - sau 500ms -> navigate('/login')
 * =============================================================================
 */
export default function GuestLanding() {
  // Hook điều hướng bằng code
  const navigate = useNavigate()

  // showLoading: bật/tắt overlay loading khi bấm đăng nhập
  const [showLoading, setShowLoading] = useState(false)

  // isMobileMenuOpen: control drawer on mobile/tablet
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // States for Event Detail Modal in Guest Mode (Preserve Scroll Position)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  /**
   * openEventDetail:
   * - Fetch event detail from API and open modal in-place without routing
   */
  const openEventDetail = async (eventId: number) => {
    setIsDetailOpen(true)
    setSelectedEvent(null)
    setLoadingDetail(true)
    setDetailError(null)

    try {
      const response = await fetch(`/api/events/detail?id=${eventId}`, {
        headers: {
          'ngrok-skip-browser-warning': '1',
        },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch event details')
      }

      const data = await response.json()
      setSelectedEvent(data)
    } catch (err: any) {
      console.error('Error fetching event details:', err)
      setDetailError(err.message || 'Không thể tải thông tin chi tiết sự kiện')
    } finally {
      setLoadingDetail(false)
    }
  }

  const closeModal = () => {
    setIsDetailOpen(false)
    setSelectedEvent(null)
    setDetailError(null)
  }

  // highlightedEvents: danh sách event nổi bật (mảng lấy từ API)
  const [highlightedEvents, setHighlightedEvents] = useState<any[]>([])

  // loadingEvents: trạng thái đang tải events ở Events Section
  const [loadingEvents, setLoadingEvents] = useState(true)

  // counters: số đếm stats (đếm tăng dần khi user scroll tới Stats Section)
  const [counters, setCounters] = useState({
    events: 0,
    students: 0,
    organizers: 0
  })

  // hasAnimated: để đảm bảo animateCounters() chỉ chạy 1 lần (không chạy lại mỗi lần scroll)
  const [hasAnimated, setHasAnimated] = useState(false)

  // statsRef: ref trỏ tới vùng Stats Section để IntersectionObserver theo dõi
  const statsRef = useRef<HTMLElement>(null)

  // eventsScrollRef: ref trỏ tới div scroll ngang danh sách events
  const eventsScrollRef = useRef<HTMLDivElement>(null)

  // eventsSectionRef: ref trỏ tới section events (hiện tại chủ yếu để tham chiếu)
  const eventsSectionRef = useRef<HTMLElement>(null)

  // canScrollLeft / canScrollRight: điều khiển hiển thị nút trái/phải dựa trên vị trí scroll
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // hoveredEventId: eventId đang hover để scale card/ảnh
  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null)

  // isMouseInEvents: cờ đánh dấu đang hover vùng events (để khóa scroll body)
  const [isMouseInEvents, setIsMouseInEvents] = useState(false)

  /**
   * useEffect 1: fetchEvents khi mount
   * - Gọi GET /api/events/open với pagination
   * - Lấy data (sự kiện đang mở) để hiển thị
   */
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoadingEvents(true)

        // Gọi API với credentials (HttpOnly cookie tự động gửi)
        const headers: Record<string, string> = {
          'ngrok-skip-browser-warning': '1',
        }

        const queryParams = new URLSearchParams({
          page: '1',
          limit: '6'
        })

        const response = await fetch(`/api/events/open?${queryParams.toString()}`, {
          headers,
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Failed to fetch events')
        }

        const data = await response.json()

        const events = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : []

        setHighlightedEvents(events)
      } catch (error) {
        console.error('Error fetching events:', error)

        // Nếu API lỗi, set list rỗng để UI hiển thị "Chưa có sự kiện nào"
        setHighlightedEvents([])
      } finally {
        setLoadingEvents(false)
      }
    }

    fetchEvents()
  }, [])

  /**
   * useEffect 2: IntersectionObserver cho Stats Section
   * - Khi statsRef nằm trong viewport (>= 30%) và chưa animate
   *   -> animateCounters()
   */
  useEffect(() => {
    // IntersectionObserver giúp phát hiện element xuất hiện trong màn hình
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // entry.isIntersecting = true khi element "đi vào" vùng quan sát
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true)
            animateCounters()
          }
        })
      },
      { threshold: 0.3 } // 30% diện tích của element xuất hiện -> trigger
    )

    if (statsRef.current) {
      observer.observe(statsRef.current)
    }

    // Cleanup: ngắt observer khi unmount
    return () => observer.disconnect()
  }, [hasAnimated])

  /**
   * animateCounters:
   * - Tạo hiệu ứng số chạy từ 0 lên target trong 2 giây
   * - steps=60 -> ~60 frame
   */
  const animateCounters = () => {
    const duration = 2000 // 2s
    const targetValues = { events: 250, students: 1000, organizers: 35 }
    const steps = 60
    const stepDuration = duration / steps

    let currentStep = 0

    const interval = setInterval(() => {
      currentStep++
      const progress = currentStep / steps

      // Cập nhật counters theo tiến độ (progress)
      setCounters({
        events: Math.floor(targetValues.events * progress),
        students: Math.floor(targetValues.students * progress),
        organizers: Math.floor(targetValues.organizers * progress)
      })

      // Khi chạy đủ steps -> dừng interval và set đúng giá trị target
      if (currentStep >= steps) {
        clearInterval(interval)
        setCounters(targetValues)
      }
    }, stepDuration)
  }

  /**
   * checkScrollButtons:
   * - Kiểm tra xem hiện tại scroll ngang có thể scroll trái/phải không
   * - Dựa vào:
   *   scrollLeft: đang scroll tới đâu
   *   scrollWidth: tổng chiều dài nội dung
   *   clientWidth: chiều rộng vùng nhìn thấy
   */
  const checkScrollButtons = () => {
    if (eventsScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = eventsScrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      // -10 để tránh sai số nhỏ khi scroll tới gần cuối
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  /**
   * scrollEvents:
   * - Khi bấm nút trái/phải
   * - scroll ngang thêm/bớt 400px
   */
  const scrollEvents = (direction: 'left' | 'right') => {
    if (eventsScrollRef.current) {
      const scrollAmount = 400
      const newScrollLeft =
        direction === 'left'
          ? eventsScrollRef.current.scrollLeft - scrollAmount
          : eventsScrollRef.current.scrollLeft + scrollAmount

      // scrollTo với behavior smooth để mượt
      eventsScrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      })
    }
  }

  /**
   * handleEventsWheel:
   * - Chuyển wheel scroll dọc (deltaY) thành scroll ngang danh sách events
   * - preventDefault để tránh trang bị scroll dọc trong lúc wheel
   */
  const handleEventsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (eventsScrollRef.current) {
      e.preventDefault()
      e.stopPropagation()

      const { scrollLeft, scrollWidth, clientWidth } = eventsScrollRef.current
      const isAtEnd = scrollLeft >= scrollWidth - clientWidth - 10
      const isAtStart = scrollLeft === 0

      // deltaY > 0: lăn xuống -> scroll sang phải (nếu chưa tới cuối)
      if (e.deltaY > 0 && !isAtEnd) {
        eventsScrollRef.current.scrollLeft += 100
      }
      // deltaY < 0: lăn lên -> scroll sang trái (nếu chưa ở đầu)
      else if (e.deltaY < 0 && !isAtStart) {
        eventsScrollRef.current.scrollLeft -= 100
      }
    }
  }

  /**
   * handleMouseEnterEvents / handleMouseLeaveEvents:
   * - Khi chuột vào vùng events: khóa scroll body (overflow hidden)
   *   mục tiêu: user dùng wheel sẽ chỉ scroll ngang carousel, không làm trang chạy dọc
   * - Khi chuột rời: mở lại scroll body
   */
  const handleMouseEnterEvents = () => {
    setIsMouseInEvents(true)
    document.body.style.overflow = 'hidden'
  }

  const handleMouseLeaveEvents = () => {
    setIsMouseInEvents(false)
    document.body.style.overflow = 'auto'
  }

  /**
   * useEffect 3:
   * - Mỗi khi highlightedEvents thay đổi:
   *   + checkScrollButtons để update trạng thái nút trái/phải
   *   + add listener resize để update khi màn hình thay đổi
   * - cleanup: remove listener + reset overflow body
   */
  useEffect(() => {
    checkScrollButtons()

    const handleResize = () => checkScrollButtons()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.body.style.overflow = 'auto'
    }
  }, [highlightedEvents])

  /**
   * handleLoginClick:
   * - Dùng chung cho:
   *   + nút đăng nhập ở header
   *   + nút “Đăng nhập để bắt đầu”
   *   + click vào card event nổi bật (vì guest chưa login)
   * - show loading overlay 0.5s rồi navigate /login
   */
  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowLoading(true)

    setTimeout(() => {
      navigate('/login')
    }, 500)
  }

  /**
   * scrollToSection:
   * - Smooth scroll to target element with sticky header offset
   */
  const scrollToSection = (id: string) => {
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const element = document.getElementById(id)
    if (element) {
      const offset = 90
      const bodyRect = document.body.getBoundingClientRect().top
      const elementRect = element.getBoundingClientRect().top
      const elementPosition = elementRect - bodyRect
      const offsetPosition = elementPosition - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  const sidebarItems = [
    {
      id: 'top',
      label: 'Trang chủ',
      icon: Home,
      action: () => scrollToSection('top')
    },
    {
      id: 'events',
      label: 'Hoạt động nổi bật',
      icon: CalendarDays,
      action: () => scrollToSection('events')
    },
    {
      id: 'features',
      label: 'Tính năng chính',
      icon: ShieldCheck,
      action: () => scrollToSection('features')
    },
    {
      id: 'policy',
      label: 'Quy định & Chính sách',
      icon: BookOpen,
      action: () => navigate('/policy')
    },
    {
      id: 'login',
      label: 'Đăng nhập',
      icon: LogIn,
      action: (e: any) => handleLoginClick(e)
    }
  ]

  // =========================== JSX RENDER ===========================
  return (
    // Background gradient toàn trang
    <div id="top" className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 lg:pl-20 transition-all duration-500">

      {/* ===================== DESKTOP COLLAPSIBLE SIDEBAR ===================== */}
      <aside
        className="fixed inset-y-0 left-0 z-50 hidden lg:flex flex-col border-r border-slate-800/80 shadow-2xl text-slate-300 transition-all duration-500 ease-in-out w-20 hover:w-64 group/sidebar"
        style={{ backgroundColor: 'rgba(11, 15, 25, 0.95)', backdropFilter: 'blur(24px)' }}
      >
        {/* Top Logo / Bolt Marker */}
        <div className="h-20 flex items-center justify-start px-6 gap-4 border-b border-slate-800/60 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20">
            <img src="/favicon.svg" alt="FPT Event Logo" className="w-5 h-5 object-contain" />
          </div>
          <span className="font-black text-sm bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            FPT EVENT SYSTEM
          </span>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto overflow-x-hidden scrollbar-hide mt-4">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={item.action}
                className="flex items-center gap-4 py-3.5 px-4 rounded-2xl text-xs font-black transition-all duration-300 text-left w-full group/item text-slate-400 hover:text-white hover:bg-slate-800/50 hover:shadow-lg hover:shadow-orange-500/5 hover:translate-x-1"
              >
                <div className="p-2.5 rounded-xl bg-slate-800/30 text-slate-400 group-hover/item:bg-orange-500 group-hover/item:text-white group-hover/item:shadow-lg group-hover/item:shadow-orange-500/20 transition-all duration-300">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-sm opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* Footer info in Sidebar */}
        <div className="p-4 border-t border-slate-800/60 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-orange-500 flex-shrink-0 border border-slate-700/55">
              FE
            </div>
            <div className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              <p className="text-xs font-black text-slate-200">FPT Education</p>
              <p className="text-[10px] text-slate-500 font-semibold">Guest Mode</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ===================== MOBILE SIDEBAR DRAWER ===================== */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop blur */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity duration-300"
          ></div>

          {/* Sidebar Panel */}
          <aside
            className="fixed inset-y-0 left-0 w-72 text-slate-100 shadow-2xl flex flex-col p-6 z-50 transition-all duration-500 ease-in-out border-r border-slate-800/80 animate-fade-in-right"
            style={{ backgroundColor: 'rgba(11, 15, 25, 0.96)', backdropFilter: 'blur(24px)' }}
          >
            {/* Header of Drawer */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-800/60">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg">
                  <img src="/favicon.svg" alt="FPT Event Logo" className="w-5 h-5 object-contain" />
                </div>
                <span className="font-black text-sm bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
                  FPT EVENT
                </span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 flex flex-col gap-2 mt-6">
              {sidebarItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={(e) => {
                      setIsMobileMenuOpen(false)
                      item.action(e)
                    }}
                    className="group/item flex items-center gap-4 py-4 px-4 rounded-2xl text-xs font-black transition-all duration-300 text-left w-full hover:bg-slate-800/60 active:scale-98"
                  >
                    <div className="p-2.5 rounded-xl bg-slate-800/50 text-slate-300 group-hover/item:bg-orange-500 group-hover/item:text-white group-hover/item:shadow-lg group-hover/item:shadow-orange-500/20 transition-all duration-300">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-sm text-slate-200 group-hover/item:text-white transition-colors">
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </nav>

            {/* Footer of Drawer */}
            <div className="pt-6 border-t border-slate-800/60 text-xs text-slate-500 font-semibold space-y-1">
              <p>FPT Education Events</p>
              <p>© {new Date().getFullYear()} All rights reserved.</p>
            </div>
          </aside>
        </div>
      )}

      {/* ===================== HEADER ===================== */}
      {/* sticky header: luôn nằm trên top khi scroll */}
      <header className="sticky top-0 z-40 border-b border-orange-500/10 bg-white/70 backdrop-blur-md shadow-sm transition-all duration-300">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">

          {/* Mobile Menu Button + Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-655 hover:text-orange-600 hover:bg-orange-50 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Logo -> link về "/" */}
            <Link to="/" className="flex items-center gap-3">
              <img
                src={fptLogo}
                alt="FPT Education"
                className="h-10 sm:h-12 w-auto"
              />
            </Link>
          </div>

          {/* Clock and Nút đăng nhập */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <RealtimeClock />
            </div>
            <button
              onClick={handleLoginClick}
              className="rounded-full bg-gradient-to-r from-orange-600 to-orange-500 px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300 hover:-translate-y-0.5"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </header>

      {/* ===================== MAIN ===================== */}
      <main className="mx-auto max-w-7xl space-y-24 px-6 py-16">

        {/* ===================== HERO SECTION ===================== */}
        <section className="space-y-10 text-center pt-8 overflow-hidden">
          {/* Badge nhỏ phía trên */}
          <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-orange-400/35 bg-orange-50/80 backdrop-blur-sm px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-600 shadow-sm transition-all duration-300" style={{ animationDelay: '100ms' }}>
            <TrendingUp className="w-4 h-4 text-orange-500" />
            Nền tảng quản lý sự kiện
          </div>

          {/* Title */}
          <h1 className="animate-fade-in-up text-5xl font-extrabold leading-tight sm:text-6xl lg:text-7xl tracking-tight" style={{ animationDelay: '200ms' }}>
            <span className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 bg-clip-text text-transparent">
              Tổ chức
            </span>
            <br />
            <span className="text-gray-900">Sự Kiện FPT Education</span>
          </h1>

          {/* Subtitle */}
          <p className="animate-fade-in-up mx-auto max-w-3xl text-lg text-gray-600 sm:text-xl leading-relaxed" style={{ animationDelay: '300ms' }}>
            Dành cho Ban tổ chức, Bộ phận truyền thông và Câu lạc bộ trong hệ
            thống FPT Education. Dễ dàng đăng ký tham gia, quản lý sự kiện.
          </p>

          {/* CTA buttons */}
          <div className="animate-fade-in-up flex flex-wrap justify-center gap-5 pt-4" style={{ animationDelay: '400ms' }}>
            {/* Nút đăng nhập -> gọi handleLoginClick */}
            <button
              onClick={handleLoginClick}
              className="group rounded-full bg-gradient-to-r from-orange-600 to-orange-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-orange-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/50 hover:-translate-y-1 hover:scale-[1.02]"
            >
              <span className="flex items-center gap-2">
                Đăng nhập để bắt đầu
                <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </span>
            </button>

            {/* Link anchor xuống section #events */}
            <a
              href="#events"
              className="rounded-full border border-orange-200 bg-white/80 backdrop-blur-sm px-8 py-4 text-base font-bold text-gray-700 shadow-md transition-all duration-300 hover:border-orange-500 hover:text-orange-600 hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02]"
            >
              Xem sự kiện nổi bật
            </a>
          </div>
        </section>

        {/* ===================== STATS SECTION ===================== */}
        {/* ref={statsRef} để IntersectionObserver bắt được khi section vào viewport */}
        <section ref={statsRef} className="grid gap-6 sm:grid-cols-3">
          {/* Card 1 */}
          <div className="animate-fade-in-up group relative overflow-hidden rounded-3xl border border-white/85 bg-white/70 backdrop-blur-md p-8 shadow-lg transition-all duration-500 hover:shadow-2xl hover:shadow-orange-500/10 hover:-translate-y-2 hover:border-orange-500" style={{ animationDelay: '100ms' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative space-y-3">
              <CalendarDays className="w-12 h-12 text-orange-500 group-hover:scale-110 transition-transform duration-300" />
              <p className="text-5xl font-extrabold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent tracking-tight">
                {counters.events}+
              </p>
              <p className="text-sm font-bold uppercase tracking-wider text-gray-500">
                Sự kiện đã tổ chức
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="animate-fade-in-up group relative overflow-hidden rounded-3xl border border-white/85 bg-white/70 backdrop-blur-md p-8 shadow-lg transition-all duration-500 hover:shadow-2xl hover:shadow-orange-500/10 hover:-translate-y-2 hover:border-orange-500" style={{ animationDelay: '200ms' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative space-y-3">
              <Users className="w-12 h-12 text-orange-500 group-hover:scale-110 transition-transform duration-300" />
              <p className="text-5xl font-extrabold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent tracking-tight">
                {counters.students.toLocaleString('vi-VN')}+
              </p>
              <p className="text-sm font-bold uppercase tracking-wider text-gray-500">
                Sinh viên tham gia
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="animate-fade-in-up group relative overflow-hidden rounded-3xl border border-white/85 bg-white/70 backdrop-blur-md p-8 shadow-lg transition-all duration-500 hover:shadow-2xl hover:shadow-orange-500/10 hover:-translate-y-2 hover:border-orange-500" style={{ animationDelay: '300ms' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative space-y-3">
              <Award className="w-12 h-12 text-orange-500 group-hover:scale-110 transition-transform duration-300" />
              <p className="text-5xl font-extrabold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent tracking-tight">
                {counters.organizers}+
              </p>
              <p className="text-sm font-bold uppercase tracking-wider text-gray-500">
                Đơn vị tổ chức
              </p>
            </div>
          </div>
        </section>

        {/* ===================== FEATURES SECTION ===================== */}
        <section id="features" className="space-y-12">
          <header className="space-y-4 text-center">
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-orange-600">
              <Sparkles className="w-4 h-4 text-orange-500" />
              Tính năng
            </p>
            <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl tracking-tight">
              Tất cả trong một
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto font-medium">
              Thiết kế dành riêng cho nhu cầu vận hành sự kiện nội bộ FPT.
            </p>
          </header>

          {/* Render list benefits */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit, index) => (
              <div
                key={benefit.title}
                className="animate-fade-in-up group relative overflow-hidden rounded-2xl border border-white/85 bg-white/70 backdrop-blur-md p-6 shadow-lg transition-all duration-500 hover:shadow-2xl hover:shadow-orange-500/5 hover:-translate-y-2 hover:border-orange-500"
                style={{ animationDelay: `${(index + 2) * 150}ms` }}
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700"></div>
                <div className="relative space-y-4">
                  <div className="inline-flex rounded-2xl bg-gradient-to-br from-orange-600 to-orange-500 p-4 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <benefit.icon size={28} strokeWidth={2.5} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed font-medium">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== EVENTS SECTION ===================== */}
        {/* id="events" để anchor link #events kéo tới */}
        <section id="events" ref={eventsSectionRef} className="space-y-12">
          <header className="space-y-4 text-center">
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-orange-600">
              <CalendarDays className="w-4 h-4" />
              Sự kiện
            </p>
            <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
              Hoạt động nổi bật
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Một số chương trình đang thu hút đông đảo sinh viên.
            </p>
          </header>

          {/* 1) Loading */}
          {loadingEvents ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 mb-6 animate-pulse">
                <CalendarDays className="w-12 h-12 text-orange-600" />
              </div>
              <p className="text-xl font-semibold text-gray-500">Đang tải sự kiện...</p>
            </div>

            /* 2) Không có event */
          ) : highlightedEvents.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 mb-6">
                <CalendarDays className="w-12 h-12 text-orange-600" />
              </div>
              <p className="text-xl font-semibold text-gray-500">Chưa có sự kiện nào</p>
              <p className="text-gray-400 mt-2">Hãy quay lại sau để xem các sự kiện mới nhất</p>
            </div>

            /* 3) Có event -> hiển thị carousel ngang */
          ) : (
            <div
              className="relative"
              onWheel={handleEventsWheel} // wheel -> scroll ngang
              onMouseEnter={handleMouseEnterEvents} // khóa scroll body
              onMouseLeave={handleMouseLeaveEvents} // mở lại scroll body
            >
              {/* Nút trái */}
              {canScrollLeft && (
                <button
                  onClick={() => scrollEvents('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full hover:bg-orange-500 hover:text-white transition-all duration-300 group"
                >
                  <ChevronLeft className="w-6 h-6 text-orange-600 group-hover:text-white" />
                </button>
              )}

              {/* Nút phải */}
              {canScrollRight && (
                <button
                  onClick={() => scrollEvents('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full hover:bg-orange-500 hover:text-white transition-all duration-300 group"
                >
                  <ChevronRight className="w-6 h-6 text-orange-600 group-hover:text-white" />
                </button>
              )}

              {/* Container scroll ngang */}
              <div
                ref={eventsScrollRef}
                onScroll={checkScrollButtons} // cập nhật canScrollLeft/right khi user scroll
                className="flex gap-6 overflow-x-auto scrollbar-hide py-6 px-4 -my-6 -mx-4"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  scrollBehavior: 'smooth'
                }}
              >
                {/* Render từng event card */}
                {highlightedEvents.map((event: any) => (
                  <div
                    key={event.eventId}
                    onMouseEnter={() => setHoveredEventId(event.eventId)} // set hover
                    onMouseLeave={() => setHoveredEventId(null)}
                    onClick={() => openEventDetail(event.eventId)} // guest click event -> open details in-place
                    className="group relative flex-shrink-0 w-[380px] overflow-hidden rounded-3xl border border-white/85 bg-white/70 backdrop-blur-md shadow-lg hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-2 transition-all duration-500 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      {/* Banner */}
                      {event.bannerUrl ? (
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={event.bannerUrl}
                            alt={event.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-60"></div>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                          <CalendarDays className="w-12 h-12 text-gray-450" />
                        </div>
                      )}

                      {/* Blob decor */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-full -mr-16 -mt-16 transition-transform duration-700 group-hover:scale-150"></div>

                      {/* Nội dung card */}
                      <div className="relative p-6 space-y-4">
                        {/* Badge status */}
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-orange-600 border border-orange-100/60">
                          <Sparkles className="w-3.5 h-3.5" />
                          {event.status}
                        </div>

                        {/* Title */}
                        <h3 className="text-xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors duration-300 leading-snug line-clamp-2">
                          {event.title}
                        </h3>

                        {/* Description */}
                        <p className="text-sm text-gray-550 line-clamp-3 leading-relaxed font-medium">
                          {event.description}
                        </p>
                      </div>
                    </div>

                    {/* Bottom layout containing Info & Action */}
                    <div className="relative p-6 pt-0 space-y-4">
                      {/* Info */}
                      <div className="space-y-2.5 pt-4 border-t border-gray-100/60 text-sm text-gray-550 font-medium">
                        <p className="flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-orange-500" />
                          {formatVietnamDateTime(event.startTime, 'dd/MM/yyyy HH:mm')}
                        </p>

                        {/* venueName nếu có */}
                        {event.venueName && (
                          <p className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-orange-500" />
                            {event.venueName}
                          </p>
                        )}

                        {/* Số chỗ */}
                        <p className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-orange-500" />
                          {event.maxSeats} chỗ ngồi
                        </p>
                      </div>

                      {/* Bottom action bar */}
                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-orange-600 text-xs font-bold tracking-wider">XEM CHI TIẾT</p>
                        <svg className="w-4 h-4 text-orange-600 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ===================== CTA SECTION ===================== */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 p-12 text-center shadow-2xl shadow-orange-500/25 border border-white/10">
          {/* Background pattern trang trí */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>

          <div className="relative space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-4">
              <Sparkles className="w-10 h-10 text-white animate-pulse" />
            </div>

            <h2 className="text-4xl font-extrabold text-white sm:text-5xl tracking-tight leading-tight">
              Sẵn sàng nâng cấp trải nghiệm sự kiện?
            </h2>

            <p className="mt-4 text-xl text-orange-50 max-w-3xl mx-auto leading-relaxed font-medium">
              Đăng nhập bằng tài khoản nội bộ để truy cập bảng điều khiển dành
              cho Event Organizer, Staff và Volunteer.
            </p>

            {/* CTA login */}
            <button
              onClick={handleLoginClick}
              className="group inline-flex items-center gap-3 mt-8 rounded-full bg-white px-10 py-5 text-lg font-bold text-orange-600 shadow-xl transition-all duration-300 hover:shadow-2xl hover:shadow-white/30 hover:-translate-y-1 hover:scale-105"
            >
              Đăng nhập hệ thống
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            </button>
          </div>
        </section>
      </main>

      {/* ===================== FOOTER ===================== */}
      <footer className="border-t-2 border-white/50 bg-white/60 backdrop-blur-sm py-8 mt-24">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={fptLogo} alt="FPT Education" className="h-10 w-auto" />
          </div>

          {/* new Date().getFullYear() lấy năm hiện tại */}
          <div className="text-sm text-gray-500 space-y-3">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mb-3.5 font-extrabold">
              <Link to="/policy" className="text-orange-600 hover:text-orange-700 transition-colors">
                Điều Khoản & Chính Sách
              </Link>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <a href="mailto:support@fpt.edu.vn" className="text-slate-550 hover:text-orange-600 transition-colors">
                Hỗ Trợ Kỹ Thuật
              </a>
            </div>
            <p className="font-semibold text-xs text-slate-400">
              Person in charge of OJT project management: Nguyen Hoang Anh Khoi (SE194466)
            </p>
            <p className="font-semibold text-xs text-slate-400">
              © {new Date().getFullYear()} FPT Education Events Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* ===================== LOADING OVERLAY ===================== */}
      {/* Khi showLoading = true thì hiển thị overlay */}
      {showLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          <div className="flex flex-col items-center gap-6">
            {/* Logo loading */}
            <img
              src={fptLogoLoading}
              alt="FPT Education"
              className="h-24 w-auto animate-pulse"
            />

            {/* 3 chấm nhảy bounce */}
            <div className="flex gap-2">
              <div
                className="h-3 w-3 rounded-full bg-orange-600 dark:bg-orange-500 animate-bounce"
                style={{ animationDelay: '0ms' }}
              ></div>
              <div
                className="h-3 w-3 rounded-full bg-orange-600 dark:bg-orange-500 animate-bounce"
                style={{ animationDelay: '150ms' }}
              ></div>
              <div
                className="h-3 w-3 rounded-full bg-orange-600 dark:bg-orange-500 animate-bounce"
                style={{ animationDelay: '300ms' }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== EVENT DETAIL MODAL (In-place viewing) ===================== */}
      <EventDetailModal
        isOpen={isDetailOpen}
        onClose={closeModal}
        event={selectedEvent}
        loading={loadingDetail}
        error={detailError}
        userRole={undefined} // Guest has no role
      />
    </div>
  )
}

