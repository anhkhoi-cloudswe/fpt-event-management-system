import React, { useState, useEffect, useRef } from 'react'
import GA4AnalyticsDashboard from '../components/analytics/GA4AnalyticsDashboard'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar,
  Users,
  User2,
  Download,
  Wallet,
  Lock,
  Sparkles,
  TrendingUp,
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  Clock,
  ArrowUpRight,
  Armchair,
  AlertTriangle,
  RefreshCw,
  LogOut,
  LogIn,
  CheckCircle2,
  Percent,
  Ticket,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import {
  reportService,
  EventFinancialOverview,
  EventCheckInItem,
  EventRealtimeSeatStatusResponse,
  EventAdvancedAnalyticsResponse,
} from '../services/reportService'
import { subscriptionService, CurrentSubscription } from '../services/subscriptionService'
import { UpgradePlanModal } from '../components/UpgradePlanModal'
import { formatVndShort, formatVndFull } from '../utils/currencyFormatter'

// ===================== DỮ LIỆU MẪU MINH HỌA (MOCK DATA FOR PAYWALL) =====================
const MOCK_ADVANCED_DATA: EventAdvancedAnalyticsResponse = {
  eventId: 0,
  title: 'Dữ liệu minh họa',
  totalGrossRevenue: 45000000,
  totalGrossFormatted: '45 triệu',
  totalPlatformFee: 2250000,
  totalPlatformFeeFormatted: '2,25 triệu',
  totalNetProfit: 42750000,
  totalNetFormatted: '42,75 triệu',
  totalTicketsSold: 350,
  checkedInTickets: 315,
  checkInRatePercent: 90.0,
  averageOrderValue: 128571,
  totalCapacity: 400,
  fillRatePercent: 87.5,
  timeline: [
    { date: '2026-10-01', ticketsSold: 45, grossRevenue: 6750000, platformFee: 337500, netProfit: 6412500, grossFormatted: '6,75 triệu', netFormatted: '6,41 triệu' },
    { date: '2026-10-02', ticketsSold: 80, grossRevenue: 12000000, platformFee: 600000, netProfit: 11400000, grossFormatted: '12 triệu', netFormatted: '11,4 triệu' },
    { date: '2026-10-03', ticketsSold: 120, grossRevenue: 18000000, platformFee: 900000, netProfit: 17100000, grossFormatted: '18 triệu', netFormatted: '17,1 triệu' },
    { date: '2026-10-04', ticketsSold: 65, grossRevenue: 9750000, platformFee: 487500, netProfit: 9262500, grossFormatted: '9,75 triệu', netFormatted: '9,26 triệu' },
    { date: '2026-10-05', ticketsSold: 40, grossRevenue: 6000000, platformFee: 300000, netProfit: 5700000, grossFormatted: '6 triệu', netFormatted: '5,7 triệu' },
  ],
  categoryBreakdown: [
    { categoryTicketId: 1, categoryName: 'Vé VIP', price: 300000, priceFormatted: '300k', totalCapacity: 100, soldSeats: 95, remainingSeats: 5, checkedInSeats: 90, grossRevenue: 28500000, grossFormatted: '28,5 triệu', platformFee: 1425000, netProfit: 27075000, netFormatted: '27,08 triệu', fillRatePercent: 95.0 },
    { categoryTicketId: 2, categoryName: 'Vé Tiêu chuẩn', price: 100000, priceFormatted: '100k', totalCapacity: 250, soldSeats: 230, remainingSeats: 20, checkedInSeats: 205, grossRevenue: 23000000, grossFormatted: '23 triệu', platformFee: 1150000, netProfit: 21850000, netFormatted: '21,85 triệu', fillRatePercent: 92.0 },
    { categoryTicketId: 3, categoryName: 'Vé Sinh viên', price: 50000, priceFormatted: '50k', totalCapacity: 50, soldSeats: 25, remainingSeats: 25, checkedInSeats: 20, grossRevenue: 1250000, grossFormatted: '1,25 triệu', platformFee: 62500, netProfit: 1187500, netFormatted: '1,19 triệu', fillRatePercent: 50.0 },
  ],
  hourlyCheckIns: [
    { hour: 8, count: 15 },
    { hour: 9, count: 45 },
    { hour: 10, count: 120 },
    { hour: 11, count: 85 },
    { hour: 13, count: 30 },
    { hour: 14, count: 20 },
  ],
  hasAdvancedReports: false,
}

// Bảng màu cho Chart
const DONUT_COLORS = ['#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#EAB308']

type EventOption = {
  id: number
  title: string
  startTime?: string
  endTime?: string
  status?: string
  organizerId?: number
  organizerName?: string
  organizerEmail?: string
}

// Helper định dạng lịch trình sự kiện: HH:mm (DD/MM/YYYY) - HH:mm (DD/MM/YYYY)
function formatEventSchedule(startStr?: string, endStr?: string): string {
  if (!startStr) return ''
  const s = new Date(startStr)
  if (isNaN(s.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')
  const sDate = `${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()}`
  const sTime = `${pad(s.getHours())}:${pad(s.getMinutes())}`

  if (!endStr) {
    return `${sTime} (${sDate})`
  }

  const e = new Date(endStr)
  if (isNaN(e.getTime())) {
    return `${sTime} (${sDate})`
  }

  return `${sTime} (${sDate}) - ${eTime} (${eDate})`
}

// Helper định dạng ngày giờ chuẩn: HH:MM (DD/MM/YYYY)
function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateFormatted = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  const timeFormatted = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${timeFormatted} (${dateFormatted})`
}

export default function Reports() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Tabs: basic = Báo cáo cơ bản | advanced = Báo cáo nâng cao
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'ga4'>('basic')

  // UI States
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Đóng dropdown khi click ra ngoài hoặc bấm Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen])

  // Basic Tab Data States
  const [financialOverview, setFinancialOverview] = useState<EventFinancialOverview | null>(null)
  const [checkIns, setCheckIns] = useState<EventCheckInItem[]>([])
  const [seatStatus, setSeatStatus] = useState<EventRealtimeSeatStatusResponse | null>(null)
  const [basicLoading, setBasicLoading] = useState(false)
  const [basicError, setBasicError] = useState<string | null>(null)
  const [basicErrorType, setBasicErrorType] = useState<'FORBIDDEN' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'GENERIC' | null>(null)

  // Advanced Tab Data States
  const [advancedData, setAdvancedData] = useState<EventAdvancedAnalyticsResponse | null>(null)
  const [isPaywallRequired, setIsPaywallRequired] = useState(false)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedError, setAdvancedError] = useState<string | null>(null)
  const [advancedErrorType, setAdvancedErrorType] = useState<'FORBIDDEN' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'GENERIC' | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)

  // Timeline Filter & Custom Date Range States for Pro Charts
  const [timelinePreset, setTimelinePreset] = useState<'ALL' | '7D' | '30D' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM'>('ALL')
  const [timelineStartDate, setTimelineStartDate] = useState<string>('')
  const [timelineEndDate, setTimelineEndDate] = useState<string>('')
  const [timelineGroupBy, setTimelineGroupBy] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY')

  // Hourly Check-In Filter States
  const [hourlyDateFilter, setHourlyDateFilter] = useState<string>('ALL')
  const [hourlyRangeFilter, setHourlyRangeFilter] = useState<'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT'>('ALL')

  // Pagination for Check-In list
  const [checkInPage, setCheckInPage] = useState<number>(1)
  const checkInLimit = 10

  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false)
  const [upgradeModalType, setUpgradeModalType] = useState<'REPORTS' | 'GA4'>('REPORTS')

  // Fetch current subscription
  useEffect(() => {
    const loadSub = async () => {
      try {
        const sub = await subscriptionService.getCurrentSubscription()
        setCurrentSub(sub)
      } catch (e) {
        // ignore
      }
    }
    loadSub()
  }, [])

  // 1. Fetch danh sách sự kiện (Admin xem tất cả, Organizer xem của chính họ)
  useEffect(() => {
    const fetchEvents = async () => {
      setEventsLoading(true)
      try {
        const res = await reportService.getEventOptions(user?.id, user?.role)
        if (res && res.length > 0) {
          // Lọc sắp xếp: Sự kiện sắp tới / đang diễn ra gần nhất lên đầu tiên, sau đó là sự kiện vừa qua gần nhất
          const now = Date.now()
          const sorted = [...res].sort((a, b) => {
            const timeA = a.startTime ? new Date(a.startTime).getTime() : 0
            const timeB = b.startTime ? new Date(b.startTime).getTime() : 0

            // Cả hai đều không có ngày giờ
            if (!timeA && !timeB) return b.id - a.id
            if (!timeA) return 1
            if (!timeB) return -1

            const diffA = timeA - now
            const diffB = timeB - now

            const isUpcomingA = diffA >= 0
            const isUpcomingB = diffB >= 0

            // Nếu một bên sắp diễn ra, một bên đã qua -> Sự kiện sắp diễn ra gần nhất xếp trước
            if (isUpcomingA && !isUpcomingB) return -1
            if (!isUpcomingA && isUpcomingB) return 1

            // Cả hai đều sắp diễn ra -> Sự kiện nào gần thời điểm hiện tại nhất xếp trước (tăng dần theo thời gian)
            if (isUpcomingA && isUpcomingB) {
              return diffA - diffB
            }

            // Cả hai đều đã qua -> Sự kiện nào vừa mới kết thúc gần đây nhất xếp trước (giảm dần theo thời gian)
            return timeB - timeA
          })

          setEvents(sorted)
          if (!selectedEventId) {
            // Mặc định chọn mục Toàn bộ sự kiện hoặc sự kiện đầu tiên
            setSelectedEventId('ALL')
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải danh sách sự kiện:', err)
      } finally {
        setEventsLoading(false)
      }
    }
    fetchEvents()
  }, [user?.id, user?.role])

  // 2. Load dữ liệu Báo Cáo Cơ Bản khi chọn event (hoặc Tổng Hợp 'ALL')
  useEffect(() => {
    if (!selectedEventId) return

    const loadBasicData = async () => {
      setBasicLoading(true)
      setBasicError(null)
      setBasicErrorType(null)

      // KỊCH BẢN 1: TỔNG HỢP TOÀN BỘ SỰ KIỆN (ALL)
      if (selectedEventId === 'ALL') {
        if (events.length === 0) {
          setBasicLoading(false)
          return
        }
        try {
          // Lấy song song dữ liệu cho tất cả sự kiện trong danh sách quyền
          const allPromises = events.map(async (ev) => {
            try {
              const [fin, chk, st] = await Promise.all([
                reportService.getFinancialOverview(ev.id).catch(() => null),
                reportService.getCheckInList(ev.id).catch(() => []),
                reportService.getSeatStatus(ev.id).catch(() => null),
              ])
              return { fin, chk: chk || [], st }
            } catch {
              return { fin: null, chk: [], st: null }
            }
          })

          const results = await Promise.all(allPromises)

          // Tổng hợp 3 cột tiền & vé
          let gross = 0
          let fee = 0
          let net = 0
          let sold = 0
          let refunded = 0
          let totalCapacity = 0
          let totalCheckedIn = 0
          let totalCheckedOut = 0
          let combinedCheckIns: EventCheckInItem[] = []
          const combinedCategoriesMap: Record<string, EventCategorySeatStatus> = {}

          results.forEach((r) => {
            if (r.fin) {
              gross += r.fin.totalGrossRevenue || 0
              fee += r.fin.totalPlatformFee || 0
              net += r.fin.totalNetProfit || 0
              sold += r.fin.totalTicketsSold || 0
              refunded += r.fin.totalTicketsRefunded || 0
            }
            if (r.chk && Array.isArray(r.chk)) {
              combinedCheckIns = combinedCheckIns.concat(r.chk)
            }
            if (r.st) {
              totalCapacity += r.st.totalCapacity || 0
              totalCheckedIn += r.st.totalCheckedIn || 0
              totalCheckedOut += r.st.totalCheckedOut || 0
              ;(r.st.categories || []).forEach((cat) => {
                const key = cat.categoryName.trim().toUpperCase()
                if (!combinedCategoriesMap[key]) {
                  combinedCategoriesMap[key] = {
                    categoryTicketId: cat.categoryTicketId,
                    categoryName: cat.categoryName,
                    price: cat.price,
                    priceFormatted: cat.priceFormatted,
                    totalCapacity: 0,
                    soldSeats: 0,
                    remainingSeats: 0,
                    checkedInSeats: 0,
                    checkedOutSeats: 0,
                    fillRatePercent: 0,
                  }
                }
                combinedCategoriesMap[key].totalCapacity += cat.totalCapacity || 0
                combinedCategoriesMap[key].soldSeats += cat.soldSeats || 0
                combinedCategoriesMap[key].remainingSeats += cat.remainingSeats || 0
                combinedCategoriesMap[key].checkedInSeats += cat.checkedInSeats || 0
                combinedCategoriesMap[key].checkedOutSeats += cat.checkedOutSeats || 0
              })
            }
          })

          // Tính lại fillRatePercent cho combined categories
          const combinedCats = Object.values(combinedCategoriesMap).map((c) => ({
            ...c,
            fillRatePercent: c.totalCapacity > 0 ? (c.soldSeats / c.totalCapacity) * 100 : 0,
          }))

          setFinancialOverview({
            eventId: 0,
            title: user?.role === 'ADMIN' ? 'Toàn bộ sự kiện trên hệ thống' : 'Toàn bộ sự kiện của bạn',
            totalGrossRevenue: gross,
            totalGrossFormatted: formatVndFull(gross),
            totalPlatformFee: fee,
            totalPlatformFeeFormatted: formatVndFull(fee),
            totalNetProfit: net,
            totalNetFormatted: formatVndFull(net),
            totalTicketsSold: sold,
            totalTicketsRefunded: refunded,
            currency: 'VND',
            isSettled: false,
            createdAt: new Date().toISOString(),
          })

          setCheckIns(combinedCheckIns)
          setSeatStatus({
            eventId: 0,
            title: user?.role === 'ADMIN' ? 'Toàn bộ sự kiện trên hệ thống' : 'Toàn bộ sự kiện của bạn',
            totalCapacity,
            totalSold: sold,
            totalRemaining: Math.max(0, totalCapacity - sold),
            totalCheckedIn,
            totalCheckedOut,
            categories: combinedCats,
          })
          setCheckInPage(1)
        } catch (err: any) {
          console.error('Lỗi tổng hợp báo cáo toàn bộ sự kiện:', err)
          setBasicError('Lỗi trong quá trình tổng hợp dữ liệu toàn bộ sự kiện.')
        } finally {
          setBasicLoading(false)
        }
        return
      }

      // KỊCH BẢN 2: CHỌN TỪNG SỰ KIỆN CỤ THỂ
      const eventIdNum = Number(selectedEventId)
      if (isNaN(eventIdNum) || eventIdNum <= 0) {
        setBasicLoading(false)
        return
      }

      try {
        const [finRes, checkInRes, seatRes] = await Promise.all([
          reportService.getFinancialOverview(eventIdNum),
          reportService.getCheckInList(eventIdNum),
          reportService.getSeatStatus(eventIdNum),
        ])
        setFinancialOverview(finRes)
        setCheckIns(checkInRes || [])
        setSeatStatus(seatRes)
        setCheckInPage(1)
      } catch (err: any) {
        console.error('Lỗi tải báo cáo cơ bản:', err)
        const status = err?.response?.status
        if (status === 403) {
          setBasicErrorType('FORBIDDEN')
          setBasicError('Bạn không có quyền xem báo cáo sự kiện này.')
        } else if (status === 404) {
          setBasicErrorType('NOT_FOUND')
          setBasicError('Sự kiện không tồn tại.')
        } else if (status === 503) {
          setBasicErrorType('SERVICE_UNAVAILABLE')
          setBasicError('Hệ thống dịch vụ báo cáo đang tạm thời gián đoạn.')
        } else {
          setBasicErrorType('GENERIC')
          setBasicError(err?.response?.data?.message || err?.message || 'Lỗi tải dữ liệu báo cáo cơ bản.')
        }
      } finally {
        setBasicLoading(false)
      }
    }

    loadBasicData()

    // 🔄 Tự động đồng bộ số liệu thời gian thực (Live Sync ngầm mỗi 15 giây không nhấp nháy UI)
    const liveInterval = setInterval(() => {
      // Chỉ load ngầm nếu không đang trong quá trình loading chính
      if (document.visibilityState === 'visible') {
        if (selectedEventId === 'ALL') {
          // Bỏ qua polling all để tiết kiệm network
        } else {
          const eventIdNum = Number(selectedEventId)
          if (!isNaN(eventIdNum) && eventIdNum > 0) {
            Promise.all([
              reportService.getFinancialOverview(eventIdNum).catch(() => null),
              reportService.getCheckInList(eventIdNum).catch(() => null),
              reportService.getSeatStatus(eventIdNum).catch(() => null),
            ]).then(([fin, chk, st]) => {
              if (fin) setFinancialOverview(fin)
              if (chk) setCheckIns(chk)
              if (st) setSeatStatus(st)
            })
          }
        }
      }
    }, 15000)

    return () => clearInterval(liveInterval)
  }, [selectedEventId, events, user?.role])

  // 3. Load dữ liệu Báo Cáo Nâng Cao khi tab=advanced (Hỗ trợ cả 'ALL' và từng event)
  useEffect(() => {
    if (activeTab !== 'advanced' || !selectedEventId) return

    const loadAdvancedData = async () => {
      setAdvancedLoading(true)
      setAdvancedError(null)
      setAdvancedErrorType(null)
      setIsPaywallRequired(false)

      // KỊCH BẢN 1: TỔNG HỢP TOÀN BỘ SỰ KIỆN CHO TAB ADVANCED
      if (selectedEventId === 'ALL') {
        if (events.length === 0) {
          setAdvancedLoading(false)
          return
        }
        try {
          const advPromises = events.map((ev) =>
            reportService.getAdvancedAnalytics(ev.id).catch(() => null)
          )
          const results = await Promise.all(advPromises)
          const validResults = results.filter((r): r is EventAdvancedAnalyticsResponse => r !== null)

          if (validResults.length === 0) {
            // Nếu không có báo cáo nào (hoặc bị paywall)
            if (currentSub && !currentSub.hasAdvancedReports && user?.role !== 'ADMIN') {
              setIsPaywallRequired(true)
              setAdvancedData(MOCK_ADVANCED_DATA)
            } else {
              setAdvancedData(null)
            }
            setAdvancedLoading(false)
            return
          }

          // Tổng hợp Timeline theo ngày
          const timelineMap: Record<string, { ticketsSold: number; grossRevenue: number; platformFee: number; netProfit: number }> = {}
          // Tổng hợp Category Breakdown
          const catBreakdownMap: Record<string, CategorySalesBreakdown> = {}
          // Tổng hợp Hourly Check-in & Check-out
          const hourlyCount: Record<number, number> = {}
          const hourlyOutCount: Record<number, number> = {}
          for (let h = 0; h < 24; h++) {
            hourlyCount[h] = 0
            hourlyOutCount[h] = 0
          }

          let totalGross = 0
          let totalFee = 0
          let totalNet = 0
          let totalSold = 0
          let totalCheckIn = 0
          let totalCapacity = 0

          validResults.forEach((adv) => {
            totalGross += adv.totalGrossRevenue || 0
            totalFee += adv.totalPlatformFee || 0
            totalNet += adv.totalNetProfit || 0
            totalSold += adv.totalTicketsSold || 0
            totalCheckIn += adv.checkedInTickets || 0
            totalCapacity += adv.totalCapacity || 0

            // Merge timeline
            ;(adv.timeline || []).forEach((pt) => {
              if (!timelineMap[pt.date]) {
                timelineMap[pt.date] = { ticketsSold: 0, grossRevenue: 0, platformFee: 0, netProfit: 0 }
              }
              timelineMap[pt.date].ticketsSold += pt.ticketsSold || 0
              timelineMap[pt.date].grossRevenue += pt.grossRevenue || 0
              timelineMap[pt.date].platformFee += pt.platformFee || 0
              timelineMap[pt.date].netProfit += pt.netProfit || 0
            })

            // Merge category breakdown
            ;(adv.categoryBreakdown || []).forEach((cat) => {
              const key = cat.categoryName.trim().toUpperCase()
              if (!catBreakdownMap[key]) {
                catBreakdownMap[key] = {
                  categoryTicketId: cat.categoryTicketId,
                  categoryName: cat.categoryName,
                  price: cat.price,
                  priceFormatted: cat.priceFormatted,
                  totalCapacity: 0,
                  soldSeats: 0,
                  remainingSeats: 0,
                  checkedInSeats: 0,
                  grossRevenue: 0,
                  grossFormatted: '',
                  platformFee: 0,
                  netProfit: 0,
                  netFormatted: '',
                  fillRatePercent: 0,
                }
              }
              catBreakdownMap[key].totalCapacity += cat.totalCapacity || 0
              catBreakdownMap[key].soldSeats += cat.soldSeats || 0
              catBreakdownMap[key].remainingSeats += cat.remainingSeats || 0
              catBreakdownMap[key].checkedInSeats += cat.checkedInSeats || 0
              catBreakdownMap[key].grossRevenue += cat.grossRevenue || 0
              catBreakdownMap[key].platformFee += cat.platformFee || 0
              catBreakdownMap[key].netProfit += cat.netProfit || 0
            })

            // Merge hourly check-in & check-out
            ;(adv.hourlyCheckIns || []).forEach((h) => {
              hourlyCount[h.hour] = (hourlyCount[h.hour] || 0) + h.count
            })
            ;(adv.hourlyCheckOuts || []).forEach((h) => {
              hourlyOutCount[h.hour] = (hourlyOutCount[h.hour] || 0) + h.count
            })
          })

          const combinedTimeline: DailySalesPoint[] = Object.keys(timelineMap)
            .sort()
            .map((date) => ({
              date,
              ticketsSold: timelineMap[date].ticketsSold,
              grossRevenue: timelineMap[date].grossRevenue,
              platformFee: timelineMap[date].platformFee,
              netProfit: timelineMap[date].netProfit,
              grossFormatted: formatVndFull(timelineMap[date].grossRevenue),
              netFormatted: formatVndFull(timelineMap[date].netProfit),
            }))

          const combinedCategoryBreakdown: CategorySalesBreakdown[] = Object.values(catBreakdownMap).map((cat) => ({
            ...cat,
            grossFormatted: formatVndFull(cat.grossRevenue),
            netFormatted: formatVndFull(cat.netProfit),
            fillRatePercent: cat.totalCapacity > 0 ? (cat.soldSeats / cat.totalCapacity) * 100 : 0,
          }))

          const combinedHourly: HourlyCheckInPoint[] = Object.keys(hourlyCount).map((h) => ({
            hour: Number(h),
            count: hourlyCount[Number(h)],
          }))
          const combinedHourlyOut: HourlyCheckInPoint[] = Object.keys(hourlyOutCount).map((h) => ({
            hour: Number(h),
            count: hourlyOutCount[Number(h)],
          }))

          setAdvancedData({
            eventId: 0,
            title: user?.role === 'ADMIN' ? 'Toàn bộ sự kiện trên hệ thống' : 'Toàn bộ sự kiện của bạn',
            totalGrossRevenue: totalGross,
            totalGrossFormatted: formatVndFull(totalGross),
            totalPlatformFee: totalFee,
            totalPlatformFeeFormatted: formatVndFull(totalFee),
            totalNetProfit: totalNet,
            totalNetFormatted: formatVndFull(totalNet),
            totalTicketsSold: totalSold,
            checkedInTickets: totalCheckIn,
            checkInRatePercent: totalSold > 0 ? (totalCheckIn / totalSold) * 100 : 0,
            averageOrderValue: totalSold > 0 ? Math.round(totalGross / totalSold) : 0,
            totalCapacity,
            fillRatePercent: totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0,
            timeline: combinedTimeline,
            categoryBreakdown: combinedCategoryBreakdown,
            hourlyCheckIns: combinedHourly,
            hourlyCheckOuts: combinedHourlyOut,
            hasAdvancedReports: true,
          })
        } catch (err) {
          console.error('Lỗi tổng hợp báo cáo nâng cao toàn bộ sự kiện:', err)
          setAdvancedError('Không thể tổng hợp báo cáo nâng cao cho toàn bộ sự kiện.')
        } finally {
          setAdvancedLoading(false)
        }
        return
      }

      // KỊCH BẢN 2: BÁO CÁO NÂNG CAO TỪNG SỰ KIỆN
      const eventIdNum = Number(selectedEventId)
      if (isNaN(eventIdNum) || eventIdNum <= 0) {
        setAdvancedLoading(false)
        return
      }

      try {
        const advRes = await reportService.getAdvancedAnalytics(eventIdNum)
        setAdvancedData(advRes)
      } catch (err: any) {
        console.error('Lỗi tải báo cáo nâng cao:', err)
        const status = err?.response?.status
        const errCode = err?.response?.data?.error || err?.response?.data?.message

        if (status === 403 && (errCode === 'PAYWALL_REQUIRED' || String(errCode).includes('gói'))) {
          // Kích hoạt Mock Data cho Paywall View
          setIsPaywallRequired(true)
          setAdvancedData(MOCK_ADVANCED_DATA)
        } else if (status === 403) {
          setAdvancedErrorType('FORBIDDEN')
          setAdvancedError('Bạn không có quyền truy cập báo cáo sự kiện này.')
        } else if (status === 404) {
          setAdvancedErrorType('NOT_FOUND')
          setAdvancedError('Sự kiện không tồn tại.')
        } else if (status === 503) {
          setAdvancedErrorType('SERVICE_UNAVAILABLE')
          setAdvancedError('Hệ thống dịch vụ báo cáo đang tạm thời gián đoạn.')
        } else {
          setAdvancedErrorType('GENERIC')
          setAdvancedError(err?.response?.data?.message || err?.message || 'Lỗi tải báo cáo nâng cao.')
        }
      } finally {
        setAdvancedLoading(false)
      }
    }

    loadAdvancedData()
  }, [activeTab, selectedEventId, events, user?.role, currentSub])

  // Lọc sự kiện cho combobox (Hỗ trợ tìm kiếm theo Tên hoặc ID)
  const filteredEvents = events.filter((ev) =>
    ev.title.toLowerCase().includes(searchInput.toLowerCase()) ||
    String(ev.id).includes(searchInput)
  )

  const selectedEventTitle =
    selectedEventId === 'ALL'
      ? user?.role === 'ADMIN'
        ? '📊 Toàn bộ sự kiện trên hệ thống (Tổng hợp)'
        : '📊 Toàn bộ sự kiện của bạn (Tổng hợp)'
      : events.find((ev) => String(ev.id) === selectedEventId)?.title || 'Chưa chọn sự kiện'

  const handleSelectEvent = (ev: EventOption | { id: string; title: string }) => {
    setSelectedEventId(String(ev.id))
    setSearchInput('')
    setIsDropdownOpen(false)
  }

  // Export CSV
  const handleExportCSV = async () => {
    if (!selectedEventId || selectedEventId === 'ALL') {
      alert('Vui lòng chọn một sự kiện cụ thể để xuất file CSV chi tiết.')
      return
    }
    const selectedEvent = events.find((ev) => String(ev.id) === selectedEventId)
    setExportingCsv(true)
    try {
      await reportService.exportEventCSV(Number(selectedEventId), selectedEvent?.title)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 403) {
        setShowUpgradeModal(true)
      } else {
        alert(err?.response?.data?.message || err?.message || 'Lỗi khi xuất file CSV.')
      }
    } finally {
      setExportingCsv(false)
    }
  }

  // Khử trùng lặp vé (Deduplicate) và lấy trạng thái mới nhất cho mỗi vé
  // Thứ tự ưu tiên trạng thái: Đã Check-out (cao nhất) > Đã Check-in > Đã Hoàn Vé > Đã Mua
  const uniqueCheckIns = useMemo(() => {
    const map = new Map<string, EventCheckInItem>()

    // Hàm chấm điểm độ ưu tiên của trạng thái
    const getStatusScore = (item: EventCheckInItem) => {
      if (item.status === 'CHECKED_OUT' || !!item.checkedOutAt) return 4
      if (item.status === 'CHECKED_IN' || !!item.checkedInAt) return 3
      if (item.status === 'REFUNDED') return 2
      return 1 // BOOKED, PAID, etc.
    }

    checkIns.forEach((item) => {
      // Khóa phân biệt: nếu có seatCode (ghế cố định) thì gom theo mã ghế + category + attendee, hoặc theo ticketId / ticketCode
      const key = item.seatCode
        ? `${item.seatCode}-${item.categoryName || ''}-${item.attendeeEmail || item.attendeeName || ''}`
        : item.ticketId
        ? String(item.ticketId)
        : item.ticketCode || `${item.attendeeEmail}-${item.categoryName}`

      if (!map.has(key)) {
        map.set(key, { ...item })
      } else {
        const existing = map.get(key)!
        const currentScore = getStatusScore(item)
        const existingScore = getStatusScore(existing)

        // Nếu bản ghi hiện tại có mức độ tiến triển cao hơn hoặc cập nhật mới hơn
        if (currentScore > existingScore) {
          map.set(key, {
            ...existing,
            ...item,
            // Giữ lại checkedInAt nếu bản ghi sau thiếu nhưng bản ghi trước có
            checkedInAt: item.checkedInAt || existing.checkedInAt,
            checkedOutAt: item.checkedOutAt || existing.checkedOutAt,
            seatCode: item.seatCode || existing.seatCode,
            ticketCode: item.ticketCode || existing.ticketCode,
          })
        } else {
          // Bổ sung các mốc thời gian nếu bản ghi hiện có đang bị thiếu
          if (!existing.checkedInAt && item.checkedInAt) {
            existing.checkedInAt = item.checkedInAt
          }
          if (!existing.checkedOutAt && item.checkedOutAt) {
            existing.checkedOutAt = item.checkedOutAt
          }
        }
      }
    })

    return Array.from(map.values())
  }, [checkIns])

  // Phân trang danh sách Check-In sau khi đã khử trùng lặp
  const totalCheckInPages = Math.ceil(uniqueCheckIns.length / checkInLimit) || 1
  const paginatedCheckIns = uniqueCheckIns.slice(
    (checkInPage - 1) * checkInLimit,
    checkInPage * checkInLimit
  )

  return (
    <div className="w-full space-y-6 text-slate-800 dark:text-slate-100 pb-12">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <span>Báo Cáo & Thống Kê Sự Kiện</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Theo dõi toàn diện hiệu quả doanh thu, tỷ lệ lấp đầy ghế và tiến độ check-in / check-out thời gian thực.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === 'ORGANIZER' && (
              <Link
                to="/dashboard/organizer/wallet"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs rounded-2xl border border-slate-200 dark:border-slate-800 transition shadow-sm"
              >
                <Wallet size={16} className="text-orange-500" />
                <span>Ví Organizer</span>
              </Link>
            )}
          </div>
        </div>

        {/* Event Selector Combobox */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl shadow-slate-200/40 dark:shadow-none">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 border border-orange-500/20 shadow-inner">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                Sự kiện đang chọn phân tích
              </p>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate max-w-xl mt-0.5">
                {selectedEventTitle}
              </h2>
              {/* Phụ đề Organizer cho Admin khi xem sự kiện đơn lẻ - Chỉ hiển thị tên Organizer */}
              {user?.role === 'ADMIN' && selectedEventId !== 'ALL' && (() => {
                const orgName = financialOverview?.organizerName || events.find((e) => String(e.id) === selectedEventId)?.organizerName
                if (!orgName) return null
                return (
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                    <span>Tổ chức bởi:</span>
                    <strong className="text-slate-700 dark:text-slate-300 font-semibold">{orgName}</strong>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Combobox Dropdown */}
          <div ref={dropdownRef} className="relative w-full md:w-[500px]">
            <input
              type="text"
              placeholder="🔍 Tìm kiếm sự kiện theo tên hoặc ID..."
              value={isDropdownOpen ? searchInput : selectedEventTitle}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setIsDropdownOpen(true)
              }}
              onFocus={() => {
                setSearchInput('')
                setIsDropdownOpen(true)
              }}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-inner placeholder:font-normal placeholder:text-slate-400"
            />
            {isDropdownOpen && (
              <div className="absolute z-30 left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {/* Mục 1: Toàn bộ sự kiện (Tổng hợp) */}
                <button
                  onClick={() => handleSelectEvent({ id: 'ALL', title: user?.role === 'ADMIN' ? 'Toàn bộ sự kiện trên hệ thống' : 'Toàn bộ sự kiện của bạn' })}
                  className={`w-full text-left px-4 py-3 hover:bg-orange-50/80 dark:hover:bg-orange-950/30 transition text-xs flex items-center justify-between cursor-pointer border-b border-orange-100 dark:border-slate-800 ${
                    selectedEventId === 'ALL'
                      ? 'bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 font-black border-l-4 border-l-orange-500'
                      : 'text-slate-800 dark:text-slate-200 font-bold'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span className="text-base">📊</span>
                    <span className="text-sm font-bold">{user?.role === 'ADMIN' ? 'Toàn bộ sự kiện trên hệ thống (Tổng hợp)' : 'Toàn bộ sự kiện của bạn (Tổng hợp)'}</span>
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-extrabold shrink-0 font-mono border border-orange-500/20">
                    ALL ({events.length})
                  </span>
                </button>

                {eventsLoading ? (
                  <div className="p-6 text-center text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                    <span>Đang tải danh sách sự kiện...</span>
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 font-medium">Không tìm thấy sự kiện phù hợp</div>
                ) : (
                  filteredEvents.map((ev) => {
                    const scheduleText = formatEventSchedule(ev.startTime, ev.endTime)
                    const isSelected = String(ev.id) === selectedEventId
                    const isEnded = ev.endTime && new Date(ev.endTime).getTime() < Date.now()

                    return (
                      <button
                        key={ev.id}
                        onClick={() => handleSelectEvent(ev)}
                        className={`w-full text-left px-4 py-3 transition-all duration-150 flex items-start justify-between gap-3 cursor-pointer group ${
                          isSelected
                            ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold border-l-4 border-l-orange-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          {/* 1. Tiêu đề sự kiện (Tăng độ tương phản, rõ nét) */}
                          <div className={`text-sm tracking-tight truncate leading-snug ${
                            isSelected ? 'font-black text-orange-600 dark:text-orange-400' : 'font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors'
                          }`}>
                            {ev.title}
                          </div>

                          {/* 2. Dòng thời gian diễn ra sự kiện */}
                          {scheduleText && (
                            <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                              <Clock size={12} className="text-orange-500 shrink-0" />
                              <span>{scheduleText}</span>
                            </div>
                          )}

                          {/* 3. Badge Organizer (Chỉ ADMIN): Luôn đồng bộ nằm ngay bên dưới thời gian */}
                          {user?.role === 'ADMIN' && ev.organizerName && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0">
                                <User2 size={11} className="text-slate-400 dark:text-slate-500" />
                                <span className="truncate max-w-[220px]">{ev.organizerName}</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 4. Cột bên phải: Mã ID và Trạng thái */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                            #{ev.id}
                          </span>
                          {ev.status === 'CANCELLED' ? (
                            <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/50 px-2 py-0.5 rounded-full">
                              Đã hủy
                            </span>
                          ) : ev.status === 'OPEN' && !isEnded ? (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">
                              Đang mở
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/90 border border-slate-200/50 dark:border-slate-700/50 px-2 py-0.5 rounded-full">
                              {ev.status === 'FINISHED' || isEnded ? 'Đã kết thúc' : ev.status === 'CLOSED' ? 'Đã đóng' : ev.status || 'Đã kết thúc'}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs (Basic vs Advanced) */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-8">
          <button
            onClick={() => setActiveTab('basic')}
            className={`pb-3.5 font-black text-sm tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'basic'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Báo Cáo Cơ Bản</span>
          </button>

          <button
            onClick={() => {
              if (currentSub && !currentSub.hasAdvancedReports && user?.role !== 'ADMIN') {
                setUpgradeModalType('REPORTS')
                setShowUpgradeModal(true)
                return
              }
              setActiveTab('advanced')
            }}
            className={`pb-3.5 font-black text-sm tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'advanced'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Báo Cáo Nâng Cao</span>
              {currentSub && !currentSub.hasAdvancedReports && user?.role !== 'ADMIN' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Lock size={10} /> PRO ONLY
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
                  PRO
                </span>
              )}
            </div>
          </button>

          {/* GA4 Analytics Tab */}
          <button
            onClick={() => {
              if (currentSub && currentSub.tierCode === 'FREE' && user?.role !== 'ADMIN') {
                setUpgradeModalType('GA4')
                setShowUpgradeModal(true)
                return
              }
              setActiveTab('ga4')
            }}
            className={`pb-3.5 font-black text-sm tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'ga4'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>📊</span>
              <span>GA4 Analytics</span>
              {currentSub && currentSub.tierCode === 'FREE' && user?.role !== 'ADMIN' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Lock size={10} /> PRO+
                </span>
              )}
              {currentSub && currentSub.tierCode === 'PRO' && user?.role !== 'ADMIN' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  PRO
                </span>
              )}
              {(currentSub?.tierCode === 'BUSINESS' || user?.role === 'ADMIN') && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
                  {user?.role === 'ADMIN' ? 'ADMIN' : 'BUSINESS'}
                </span>
              )}
            </div>
          </button>
        </div>

        {/* ===================== TAB GA4: GOOGLE ANALYTICS 4 ===================== */}
        {activeTab === 'ga4' && (
          <div className="space-y-4">
            <GA4AnalyticsDashboard
              eventId={
                selectedEventId && selectedEventId !== 'ALL'
                  ? Number(selectedEventId)
                  : null
              }
              tierCode={currentSub?.tierCode}
              role={user?.role}
            />
          </div>
        )}

        {/* ===================== TAB 1: BÁO CÁO CƠ BẢN ===================== */}
        {activeTab === 'basic' && (
          <div className="space-y-6">
            {basicLoading ? (
              <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-orange-500" />
                <p className="text-sm font-bold">Đang tổng hợp báo cáo và trạng thái ghế...</p>
              </div>
            ) : basicError ? (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-3xl p-6 text-red-700 dark:text-red-200 flex items-start gap-3 shadow-lg">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black">
                    {basicErrorType === 'FORBIDDEN'
                      ? '403 Truy cập bị từ chối'
                      : basicErrorType === 'NOT_FOUND'
                      ? '404 Không tìm thấy sự kiện'
                      : basicErrorType === 'SERVICE_UNAVAILABLE'
                      ? '503 Dịch vụ gián đoạn'
                      : 'Lỗi tải dữ liệu'}
                  </h3>
                  <p className="text-xs mt-1 text-red-600/90 dark:text-red-300/90">{basicError}</p>
                </div>
              </div>
            ) : (
              <>
                {/* 3 Cột Tiền Tài Chính Sự Kiện: Gross, Phí, Thực Nhận với Điểm Nhấn Cao Cấp */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Cột 1: Doanh thu thanh toán (Gross) */}
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border border-blue-500/30 p-5 shadow-lg shadow-blue-500/5">
                    <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                      <span className="text-xs font-bold uppercase tracking-wider">Doanh thu thanh toán (Gross)</span>
                      <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400">
                        <DollarSign size={20} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                        {formatVndShort(financialOverview?.totalGrossRevenue || 0)}
                      </div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 mt-1">
                        Chi tiết: {formatVndFull(financialOverview?.totalGrossRevenue || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Cột 2: Phí nền tảng */}
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/15 via-orange-500/5 to-transparent border border-amber-500/30 p-5 shadow-lg shadow-amber-500/5">
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                      <span className="text-xs font-bold uppercase tracking-wider">Phí Nền Tảng (Hoa hồng + Cố định)</span>
                      <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                        <TrendingUp size={20} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                        {formatVndShort(financialOverview?.totalPlatformFee || 0)}
                      </div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 mt-1">
                        {formatVndFull(financialOverview?.totalPlatformFee || 0)} (đã gồm phí cố định)
                      </p>
                    </div>
                  </div>

                  {/* Cột 3: Thực nhận (Net Profit) - ĐIỂM NHẤN QUAN TRỌNG NHẤT */}
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border-2 border-emerald-500/40 p-5 shadow-xl shadow-emerald-500/10">
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                      <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                        <Wallet size={16} /> Doanh Thu Thực Nhận (Net)
                      </span>
                      <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black text-xs">
                        NET
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                        {formatVndShort(financialOverview?.totalNetProfit || 0)}
                      </div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                        Thực nhận: {formatVndFull(financialOverview?.totalNetProfit || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5 Chỉ Số Tổng Quan Hoạt Động (Vé, Hoàn, Sức chứa, Check-in, Check-out) - Visual Hierarchy Pro Max */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* KPI 1: Vé đã bán */}
                  <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                        Vé Đã Bán
                      </span>
                      <div className="p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-slate-200 transition-colors">
                        <Ticket size={16} />
                      </div>
                    </div>
                    <div className="my-2">
                      <div className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                        {financialOverview?.totalTicketsSold || 0}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Loại vé:</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">Có phí & Miễn phí</span>
                    </div>
                  </div>

                  {/* KPI 2: Vé hoàn trả */}
                  <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-950/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-rose-500 dark:text-rose-400 uppercase">
                        Vé Hoàn Trả
                      </span>
                      <div className="p-2 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                        <RefreshCw size={16} />
                      </div>
                    </div>
                    <div className="my-2">
                      <div className="text-3xl sm:text-4xl font-black tracking-tight text-rose-600 dark:text-rose-400">
                        {financialOverview?.totalTicketsRefunded || 0}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Trạng thái:</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md">REFUNDED</span>
                    </div>
                  </div>

                  {/* KPI 3: Tổng sức chứa */}
                  <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-950/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-blue-600 dark:text-blue-400 uppercase">
                        Tổng Sức Chứa
                      </span>
                      <div className="p-2 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                        <Armchair size={16} />
                      </div>
                    </div>
                    <div className="my-2">
                      <div className="text-3xl sm:text-4xl font-black tracking-tight text-blue-600 dark:text-blue-400">
                        {seatStatus?.totalCapacity || 0}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Còn trống:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {seatStatus?.totalRemaining || 0} <span className="font-normal text-slate-400">chỗ</span>
                      </span>
                    </div>
                  </div>

                  {/* KPI 4: Đã Check-In */}
                  <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-950/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1">
                        Đã Check-In
                      </span>
                      <div className="p-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                        <LogIn size={16} />
                      </div>
                    </div>
                    <div className="my-2">
                      <div className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                        {seatStatus?.totalCheckedIn || 0}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Theo dõi:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Thời gian thực
                      </span>
                    </div>
                  </div>

                  {/* KPI 5: Đã Check-Out */}
                  <div className="col-span-2 lg:col-span-1 relative overflow-hidden bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-1">
                        Đã Check-Out
                      </span>
                      <div className="p-2 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                        <LogOut size={16} />
                      </div>
                    </div>
                    <div className="my-2">
                      <div className="text-3xl sm:text-4xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
                        {seatStatus?.totalCheckedOut || 0}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Tiến trình:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">Đã rời sự kiện</span>
                    </div>
                  </div>
                </div>

                {/* Trạng thái ghế / Đăng ký theo loại vé (Seat Status) - Giao diện Pro Max Visual */}
                {seatStatus && seatStatus.categories && seatStatus.categories.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                            <Armchair className="w-5 h-5" />
                          </div>
                          <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Trạng Thái Ghế & Tỷ Lệ Lấp Đầy Theo Hạng Vé
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 pl-9">
                          Chi tiết phân bổ sức chứa, số vé bán, lượng khách tham gia thực tế và tiến độ check-out theo từng hạng vé.
                        </p>
                      </div>
                      <span className="self-start sm:self-auto px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold text-xs border border-slate-200 dark:border-slate-700 shadow-xs">
                        {seatStatus.categories.length} Hạng vé
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {seatStatus.categories.map((cat, idx) => (
                        <div
                          key={cat.categoryTicketId}
                          className="relative overflow-hidden bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-5 space-y-5 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 transition-all group flex flex-col justify-between"
                        >
                          <div>
                            {/* Card Top: Tên Hạng & Giá */}
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-black text-base text-slate-900 dark:text-white uppercase tracking-wider block group-hover:text-orange-500 transition-colors">
                                  {cat.categoryName}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                  Sức chứa: <strong className="text-slate-700 dark:text-slate-200 font-bold">{cat.totalCapacity} chỗ</strong>
                                </span>
                              </div>
                              <span className="text-xs font-black text-orange-600 dark:text-orange-400 px-3 py-1 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 shadow-xs">
                                {formatVndShort(cat.price)}
                              </span>
                            </div>

                            {/* Card Body: 4 Ô Chỉ Số Nhấn Mạnh Số To - Nhãn Gọn */}
                            <div className="grid grid-cols-2 gap-2.5 pt-4">
                              {/* Ô Đã bán */}
                              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Đã Bán</span>
                                <div className="mt-1 flex items-baseline gap-1">
                                  <span className="text-xl font-black text-slate-900 dark:text-white">
                                    {cat.soldSeats}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-400">/ {cat.totalCapacity}</span>
                                </div>
                              </div>

                              {/* Ô Còn lại */}
                              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Còn Trống</span>
                                <div className="mt-1 flex items-baseline gap-1">
                                  <span className="text-xl font-black text-blue-600 dark:text-blue-400">
                                    {cat.remainingSeats}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-400">chỗ</span>
                                </div>
                              </div>

                              {/* Ô Check-in */}
                              <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 shadow-xs">
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider flex items-center gap-1">
                                  <LogIn size={11} /> Check-In
                                </span>
                                <div className="mt-1 flex items-baseline gap-1">
                                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                                    {cat.checkedInSeats}
                                  </span>
                                  <span className="text-[11px] font-semibold text-emerald-600/70">khách</span>
                                </div>
                              </div>

                              {/* Ô Check-out */}
                              <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 shadow-xs">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block uppercase tracking-wider flex items-center gap-1">
                                  <LogOut size={11} /> Check-Out
                                </span>
                                <div className="mt-1 flex items-baseline gap-1">
                                  <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                                    {cat.checkedOutSeats || 0}
                                  </span>
                                  <span className="text-[11px] font-semibold text-indigo-600/70">khách</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Card Footer: Thanh Lấp Đầy & Tỷ Lệ % Nổi Bật */}
                          <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-medium">Tỷ lệ lấp đầy:</span>
                              <span className="text-slate-900 dark:text-white font-black text-sm">
                                {cat.fillRatePercent.toFixed(1).replace('.', ',')}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700/80 rounded-full h-2.5 overflow-hidden p-0.5 shadow-inner">
                              <div
                                className={`h-full rounded-full transition-all duration-700 shadow-sm ${
                                  cat.fillRatePercent >= 80
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                    : cat.fillRatePercent >= 40
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                                    : 'bg-gradient-to-r from-orange-500 to-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, cat.fillRatePercent))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Danh sách Check-In thời gian thực (Hiển thị đầy đủ Giá vé, Check-in & Check-out) */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-orange-500" />
                        <span>Danh Sách Người Mua Vé & Check-In ({uniqueCheckIns.length} vé)</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Hiển thị chi tiết số tiền mua vé, vị trí ghế và lịch sử Check-In / Check-Out theo thời gian thực.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="py-3.5 px-4">#</th>
                          <th className="py-3.5 px-4">Mã vé</th>
                          <th className="py-3.5 px-4">Người tham dự</th>
                          <th className="py-3.5 px-4">Hạng vé</th>
                          <th className="py-3.5 px-4 text-right">Giá Tiền Đã Mua</th>
                          <th className="py-3.5 px-4 text-center">Mã ghế</th>
                          <th className="py-3.5 px-4 text-center">Trạng thái</th>
                          <th className="py-3.5 px-4">Thời gian Check-in</th>
                          <th className="py-3.5 px-4">Thời gian Check-out</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedCheckIns.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                              Chưa có lượt vé hoặc dữ liệu check-in nào cho sự kiện này.
                            </td>
                          </tr>
                        ) : (
                          paginatedCheckIns.map((item, idx) => {
                            const isCheckedOut = item.status === 'CHECKED_OUT' || !!item.checkedOutAt
                            const isCheckedIn = !isCheckedOut && (item.status === 'CHECKED_IN' || !!item.checkedInAt)
                            const isRefunded = item.status === 'REFUNDED'
                            return (
                              <tr key={item.ticketId || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
                                <td className="py-3.5 px-4 text-slate-400 font-bold">
                                  {(checkInPage - 1) * checkInLimit + idx + 1}
                                </td>
                                <td className="py-3.5 px-4 font-mono font-black text-orange-600 dark:text-orange-400">
                                  {item.ticketCode || '—'}
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="font-bold text-slate-900 dark:text-white">{item.attendeeName || 'Khách tham dự'}</div>
                                  <div className="text-[11px] text-slate-400">{item.attendeeEmail || '-'}</div>
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                  {item.categoryName || '-'}
                                </td>
                                <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">
                                  {item.priceVnd !== undefined && item.priceVnd > 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400">{formatVndFull(item.priceVnd)}</span>
                                  ) : (
                                    <span className="text-slate-400 font-normal">Miễn phí (0đ)</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {item.seatCode ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono font-black border border-orange-500/20">
                                      {item.seatCode}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  {isCheckedOut ? (
                                    <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] border border-indigo-500/30">
                                      Đã Check-out
                                    </span>
                                  ) : isCheckedIn ? (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] border border-emerald-500/30">
                                      Đã Check-in
                                    </span>
                                  ) : isRefunded ? (
                                    <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-bold text-[10px] border border-red-500/30">
                                      Đã Hoàn Tiền
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold text-[10px] border border-blue-500/30">
                                      Đã Mua
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-medium">
                                  {item.checkedInAt ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono text-[11px]">
                                      {formatDateTime(item.checkedInAt)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-medium">
                                  {item.checkedOutAt ? (
                                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold font-mono text-[11px]">
                                      {formatDateTime(item.checkedOutAt)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalCheckInPages > 1 && (
                    <div className="flex items-center justify-between text-xs pt-3">
                      <span className="text-slate-400 font-bold">
                        Trang {checkInPage} / {totalCheckInPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={checkInPage <= 1}
                          onClick={() => setCheckInPage((p) => Math.max(1, p - 1))}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition font-bold cursor-pointer"
                        >
                          Trang trước
                        </button>
                        <button
                          disabled={checkInPage >= totalCheckInPages}
                          onClick={() => setCheckInPage((p) => Math.min(totalCheckInPages, p + 1))}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition font-bold cursor-pointer"
                        >
                          Trang sau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================== TAB 2: BÁO CÁO NÂNG CAO ===================== */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            {advancedLoading ? (
              <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-orange-500" />
                <p className="text-sm font-bold">Đang tải và tổng hợp phân tích chuyên sâu...</p>
              </div>
            ) : advancedError && !isPaywallRequired ? (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-3xl p-6 text-red-700 dark:text-red-200 flex items-start gap-3 shadow-lg">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black">
                    {advancedErrorType === 'FORBIDDEN'
                      ? '403 Truy cập bị từ chối'
                      : advancedErrorType === 'NOT_FOUND'
                      ? '404 Không tìm thấy sự kiện'
                      : advancedErrorType === 'SERVICE_UNAVAILABLE'
                      ? '503 Dịch vụ gián đoạn'
                      : 'Lỗi tải dữ liệu'}
                  </h3>
                  <p className="text-xs mt-1 text-red-600/90 dark:text-red-300/90">{advancedError}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Paywall Banner khi API trả 403 PAYWALL_REQUIRED */}
                {isPaywallRequired && (
                  <div className="bg-gradient-to-r from-amber-50 dark:from-amber-950/80 via-orange-50/50 dark:via-neutral-900 to-amber-50 dark:to-orange-950/80 border border-amber-200 dark:border-amber-500/50 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                        <Lock className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-amber-950 dark:text-amber-300">
                            Tính Năng Phân Tích Chuyên Sâu Dành Riêng Cho Gói Pro & Business
                          </h3>
                          <span className="px-2.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white dark:text-black">
                            Dữ liệu mô phỏng
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-neutral-300 mt-1">
                          Bạn đang xem biểu đồ với dữ liệu mẫu. Nâng cấp gói ngay để mở khóa toàn bộ số liệu thực tế, xu hướng doanh thu và xuất file CSV.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate('/organizer/subscription')}
                      className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white dark:text-black font-black text-xs rounded-2xl shadow-lg shadow-orange-500/20 flex items-center gap-2 shrink-0 transition active:scale-95 cursor-pointer"
                    >
                      <span>Nâng Cấp Gói Ngay</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Top Action Bar: CSV Export */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <span>Phân Tích Đa Chiều Chuyên Sâu</span>
                    </h2>
                    {isPaywallRequired && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-bold">
                        * Ghi chú: Các biểu đồ dưới đây đang hiển thị dữ liệu minh họa.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={handleExportCSV}
                    disabled={exportingCsv}
                    className="px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs rounded-2xl border border-slate-200 dark:border-slate-800 transition flex items-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer active:scale-95"
                  >
                    <Download className="w-4 h-4 text-orange-500" />
                    <span>{exportingCsv ? 'Đang xuất CSV...' : 'Xuất File CSV Báo Cáo'}</span>
                  </button>
                </div>

                {/* 4 KPI Cards Báo Cáo Nâng Cao */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 p-5 shadow-lg">
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Doanh Thu Thực Nhận</p>
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                      {formatVndShort(advancedData?.totalNetProfit || 0)}
                    </p>
                    <p className="text-[11px] text-slate-400 font-semibold mt-1">
                      Chi tiết: {formatVndFull(advancedData?.totalNetProfit || 0)}
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border border-blue-500/30 p-5 shadow-lg">
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Giá Trị Đơn Trung Bình (AOV)</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                      {formatVndShort(advancedData?.averageOrderValue || 0)}
                    </p>
                    <p className="text-[11px] text-slate-400 font-semibold mt-1">
                      Trung bình mỗi lượt mua
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500/15 via-indigo-500/5 to-transparent border border-indigo-500/30 p-5 shadow-lg">
                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Tỷ Lệ Check-In</p>
                    <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
                      {(advancedData?.checkInRatePercent || 0).toFixed(1).replace('.', ',')}%
                    </p>
                    <p className="text-[11px] text-slate-400 font-semibold mt-1">
                      {advancedData?.checkedInTickets || 0} / {advancedData?.totalTicketsSold || 0} vé đã vào cổng
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500/15 via-orange-500/5 to-transparent border border-orange-500/30 p-5 shadow-lg">
                    <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Tỷ Lệ Lấp Đầy</p>
                    <p className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-2">
                      {(advancedData?.fillRatePercent || 0).toFixed(1).replace('.', ',')}%
                    </p>
                    <p className="text-[11px] text-slate-400 font-semibold mt-1">
                      {advancedData?.totalTicketsSold || 0} / {advancedData?.totalCapacity || 0} tổng ghế
                    </p>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Donut Chart: Cơ cấu vé bán theo loại với phần trăm */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-orange-500" />
                        <span>Cơ Cấu Tỷ Lệ Phân Bổ Vé Bán Ra</span>
                      </h3>
                      <span className="text-xs font-bold text-slate-400">Theo phần trăm %</span>
                    </div>

                    <div className="h-72 w-full my-2 flex items-center justify-center">
                      {(advancedData?.categoryBreakdown || []).every((c) => c.soldSeats === 0) ? (
                        <div className="text-center text-xs text-slate-400 font-medium py-12">
                          Chưa có lượt mua vé nào để phân tích cơ cấu.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                          <PieChart>
                            <Pie
                              data={advancedData?.categoryBreakdown || []}
                              dataKey="soldSeats"
                              nameKey="categoryName"
                              cx="50%"
                              cy="50%"
                              startAngle={90}
                              endAngle={-270}
                              innerRadius={60}
                              outerRadius={95}
                              paddingAngle={4}
                            >
                              {(advancedData?.categoryBreakdown || []).map((_, index) => (
                                <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '1rem',
                                color: '#fff',
                                fontSize: '12px',
                                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
                              }}
                              itemStyle={{ color: '#fff' }}
                              formatter={(value: any) => {
                                const total = (advancedData?.categoryBreakdown || []).reduce((acc, c) => acc + c.soldSeats, 0) || 1
                                const pct = ((Number(value) / total) * 100).toFixed(1)
                                return [`${value} vé (${pct}%)`, 'Số lượng']
                              }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                              iconType="circle"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      {(advancedData?.categoryBreakdown || []).map((cat, idx) => {
                        const total = (advancedData?.categoryBreakdown || []).reduce((acc, c) => acc + c.soldSeats, 0) || 1
                        const pct = total > 0 ? ((cat.soldSeats / total) * 100).toFixed(1) : '0.0'
                        return (
                          <div
                            key={cat.categoryTicketId}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs border-l-4 shadow-sm"
                            style={{ borderLeftColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                          >
                            <div className="font-bold text-slate-900 dark:text-white truncate">{cat.categoryName}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                              <span>{cat.soldSeats} vé</span>
                              <strong className="text-orange-500 font-black">({pct}%)</strong>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Bar Chart: Doanh thu theo loại vé */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-orange-500" />
                        <span>Doanh Thu Theo Hạng Vé (VND)</span>
                      </h3>
                      <span className="text-xs font-bold text-slate-400">Doanh thu Gross</span>
                    </div>

                    <div className="h-72 w-full my-2">
                      <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                        <BarChart
                          data={advancedData?.categoryBreakdown || []}
                          margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                          <XAxis dataKey="categoryName" stroke="#94a3b8" fontSize={11} fontStyle="bold" />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            domain={[0, 'auto']}
                            tickFormatter={(val) => formatVndShort(val)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              borderColor: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '1rem',
                              color: '#fff',
                              fontSize: '12px',
                              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
                            }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(val: any) => [formatVndFull(Number(val)), 'Doanh thu Gross']}
                          />
                          <Bar
                            dataKey="grossRevenue"
                            name="Doanh thu"
                            fill="#F97316"
                            radius={[8, 8, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      {(advancedData?.categoryBreakdown || []).map((cat) => (
                        <div
                          key={cat.categoryTicketId}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs shadow-sm flex flex-col justify-between"
                        >
                          <div className="font-bold text-slate-900 dark:text-white truncate">{cat.categoryName}</div>
                          <div className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 mt-1">
                            {formatVndShort(cat.grossRevenue || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Line Chart: Xu hướng doanh thu theo thời gian với Bộ lọc Ngày/Tháng/Năm & Tùy chọn */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 lg:col-span-2 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            <span>Xu Hướng Tăng Trưởng Doanh Thu</span>
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Biểu đồ doanh thu Gross và thực nhận Net theo chuỗi thời gian (*vé 0đ không phát sinh tiền).
                          </p>
                        </div>

                        {/* Group By: Ngày / Tháng / Năm */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                          <button
                            onClick={() => setTimelineGroupBy('DAY')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              timelineGroupBy === 'DAY'
                                ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm font-black'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            Theo Ngày
                          </button>
                          <button
                            onClick={() => setTimelineGroupBy('MONTH')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              timelineGroupBy === 'MONTH'
                                ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm font-black'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            Theo Tháng
                          </button>
                          <button
                            onClick={() => setTimelineGroupBy('YEAR')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              timelineGroupBy === 'YEAR'
                                ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm font-black'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            Theo Năm
                          </button>
                        </div>
                      </div>

                      {/* Presets & Custom Date Range Toolbar */}
                      <div className="flex flex-wrap items-center gap-2 pt-3 text-xs">
                        <div className="flex items-center gap-1 text-slate-400 font-bold mr-1">
                          <Calendar size={13} />
                          <span>Khoảng thời gian:</span>
                        </div>

                        {[
                          { id: 'ALL', label: 'Tất cả' },
                          { id: '7D', label: '7 ngày qua' },
                          { id: '30D', label: '30 ngày qua' },
                          { id: 'THIS_MONTH', label: 'Tháng này' },
                          { id: 'LAST_MONTH', label: 'Tháng trước' },
                          { id: 'THIS_YEAR', label: 'Năm nay' },
                          { id: 'CUSTOM', label: 'Tùy chọn...' },
                        ].map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => setTimelinePreset(preset.id as any)}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer border ${
                              timelinePreset === preset.id
                                ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40 shadow-sm'
                                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}

                        {/* Custom Date Inputs */}
                        {timelinePreset === 'CUSTOM' && (
                          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 mt-1 sm:mt-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400 font-medium">Từ:</span>
                              <input
                                type="date"
                                value={timelineStartDate}
                                onChange={(e) => setTimelineStartDate(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400 font-medium">Đến:</span>
                              <input
                                type="date"
                                value={timelineEndDate}
                                onChange={(e) => setTimelineEndDate(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dynamic Filtered Timeline Calculation & Render */}
                    {(() => {
                      const rawTimeline = advancedData?.timeline || []
                      const now = new Date()

                      const filteredTimeline = rawTimeline.filter((pt) => {
                        if (timelinePreset === 'ALL') return true
                        const ptDate = new Date(pt.date)

                        if (timelinePreset === '7D') {
                          const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                          return ptDate >= d7
                        }
                        if (timelinePreset === '30D') {
                          const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                          return ptDate >= d30
                        }
                        if (timelinePreset === 'THIS_MONTH') {
                          return ptDate.getFullYear() === now.getFullYear() && ptDate.getMonth() === now.getMonth()
                        }
                        if (timelinePreset === 'LAST_MONTH') {
                          const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
                          const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
                          return ptDate.getFullYear() === lastMonthYear && ptDate.getMonth() === lastMonth
                        }
                        if (timelinePreset === 'THIS_YEAR') {
                          return ptDate.getFullYear() === now.getFullYear()
                        }
                        if (timelinePreset === 'CUSTOM') {
                          if (timelineStartDate && pt.date < timelineStartDate) return false
                          if (timelineEndDate && pt.date > timelineEndDate) return false
                          return true
                        }
                        return true
                      })

                      // Group By: DAY, MONTH, YEAR
                      let displayTimeline: { date: string; grossRevenue: number; netProfit: number; ticketsSold: number }[] = []
                      if (timelineGroupBy === 'DAY') {
                        displayTimeline = filteredTimeline
                      } else if (timelineGroupBy === 'MONTH') {
                        const mapByMonth: Record<string, { grossRevenue: number; netProfit: number; ticketsSold: number }> = {}
                        filteredTimeline.forEach((pt) => {
                          const monthKey = pt.date.substring(0, 7) // 'YYYY-MM'
                          if (!mapByMonth[monthKey]) {
                            mapByMonth[monthKey] = { grossRevenue: 0, netProfit: 0, ticketsSold: 0 }
                          }
                          mapByMonth[monthKey].grossRevenue += pt.grossRevenue
                          mapByMonth[monthKey].netProfit += pt.netProfit
                          mapByMonth[monthKey].ticketsSold += pt.ticketsSold
                        })
                        displayTimeline = Object.keys(mapByMonth)
                          .sort()
                          .map((m) => ({ date: m, ...mapByMonth[m] }))
                      } else if (timelineGroupBy === 'YEAR') {
                        const mapByYear: Record<string, { grossRevenue: number; netProfit: number; ticketsSold: number }> = {}
                        filteredTimeline.forEach((pt) => {
                          const yearKey = pt.date.substring(0, 4) // 'YYYY'
                          if (!mapByYear[yearKey]) {
                            mapByYear[yearKey] = { grossRevenue: 0, netProfit: 0, ticketsSold: 0 }
                          }
                          mapByYear[yearKey].grossRevenue += pt.grossRevenue
                          mapByYear[yearKey].netProfit += pt.netProfit
                          mapByYear[yearKey].ticketsSold += pt.ticketsSold
                        })
                        displayTimeline = Object.keys(mapByYear)
                          .sort()
                          .map((y) => ({ date: y, ...mapByYear[y] }))
                      }

                      return (
                        <div className="h-72 w-full my-2">
                          {displayTimeline.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                              Không có dữ liệu doanh thu trong khoảng thời gian đã chọn.
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={displayTimeline}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} fontStyle="bold" />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={11}
                                  domain={[0, 'auto']}
                                  tickFormatter={(val) => formatVndShort(val)}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                    borderColor: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '1rem',
                                    color: '#fff',
                                    fontSize: '12px',
                                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
                                  }}
                                  formatter={(val: any, name: any) => [
                                    formatVndFull(Number(val)),
                                    name === 'grossRevenue' ? 'Doanh thu Gross' : 'Thực nhận Net',
                                  ]}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                <Line
                                  type="monotone"
                                  dataKey="grossRevenue"
                                  name="Doanh thu Gross"
                                  stroke="#3B82F6"
                                  strokeWidth={3}
                                  dot={{ r: 4 }}
                                  activeDot={{ r: 6 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="netProfit"
                                  name="Thực nhận Net"
                                  stroke="#10B981"
                                  strokeWidth={3}
                                  dot={{ r: 4 }}
                                  activeDot={{ r: 6 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Phân Tích Check-In & Check-Out: Biểu Đồ Khung Giờ (24h) & Biểu Đồ Tròn Tỷ Lệ */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:col-span-2">
                    {/* Cột 1 & 2: Bar Chart Phân Bố Khách Check-In & Check-Out Theo Khung Giờ */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 lg:col-span-2 shadow-xl flex flex-col justify-between">
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex flex-wrap items-center gap-1.5">
                              <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                              <span>Phân Bố Khách</span>
                              <span className="text-violet-600 dark:text-violet-400">Check-In</span>
                              <span className="text-slate-400">&</span>
                              <span className="text-emerald-600 dark:text-emerald-400">Check-Out</span>
                              <span>
                                {hourlyRangeFilter === 'ALL' && '(24h)'}
                                {hourlyRangeFilter === 'MORNING' && '(Sáng 6h-12h)'}
                                {hourlyRangeFilter === 'AFTERNOON' && '(Chiều 12h-18h)'}
                                {hourlyRangeFilter === 'EVENING' && '(Tối 18h-23h)'}
                                {hourlyRangeFilter === 'NIGHT' && '(Đêm 0h-6h)'}
                              </span>
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Tần suất khách quét mã vào cổng (Check-in) và ra về (Check-out) theo từng khung giờ trong ngày (GMT+7).
                            </p>
                          </div>

                          {/* Bộ lọc Buổi trong ngày */}
                          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                            {[
                              { key: 'ALL', label: 'Cả Ngày (24h)' },
                              { key: 'MORNING', label: 'Sáng (6h-12h)' },
                              { key: 'AFTERNOON', label: 'Chiều (12h-18h)' },
                              { key: 'EVENING', label: 'Tối (18h-23h)' },
                              { key: 'NIGHT', label: 'Đêm (0h-6h)' },
                            ].map((item) => (
                              <button
                                key={item.key}
                                onClick={() => setHourlyRangeFilter(item.key as any)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  hourlyRangeFilter === item.key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Filter Bar: Chọn ngày nếu có nhiều ngày */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-medium">Lọc theo ngày:</span>
                            <select
                              value={hourlyDateFilter}
                              onChange={(e) => setHourlyDateFilter(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/30"
                            >
                              <option value="ALL">Tất cả các ngày diễn ra</option>
                              {Array.from(
                                new Set(
                                  checkIns
                                    .filter((c) => c.checkedInAt || c.checkedOutAt)
                                    .map((c) => {
                                      const timeStr = c.checkedInAt || c.checkedOutAt
                                      if (!timeStr) return ''
                                      const d = new Date(timeStr)
                                      const pad = (n: number) => String(n).padStart(2, '0')
                                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                                    })
                                    .filter(Boolean)
                                )
                              ).map((d) => (
                                <option key={d} value={d}>
                                  Ngày {d}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-3 text-xs font-bold">
                            <span className="text-slate-400">
                              Lượt vào:{' '}
                              <strong className="text-violet-600 dark:text-violet-400 font-black">
                                {seatStatus?.totalCheckedIn || 0}
                              </strong>
                            </span>
                            <span className="text-slate-400">
                              Lượt ra:{' '}
                              <strong className="text-emerald-600 dark:text-emerald-400 font-black">
                                {seatStatus?.totalCheckedOut || 0}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Hourly Calculation based on Filter */}
                      {(() => {
                        let baseIn = advancedData?.hourlyCheckIns || []
                        let baseOut = advancedData?.hourlyCheckOuts || []

                        // Nếu lọc theo ngày cụ thể từ danh sách checkIns
                        if (hourlyDateFilter !== 'ALL') {
                          const countInByHour: Record<number, number> = {}
                          const countOutByHour: Record<number, number> = {}
                          for (let h = 0; h < 24; h++) {
                            countInByHour[h] = 0
                            countOutByHour[h] = 0
                          }

                          checkIns.forEach((c) => {
                            const pad = (n: number) => String(n).padStart(2, '0')
                            if (c.checkedInAt) {
                              const dIn = new Date(c.checkedInAt)
                              const inDateStr = `${dIn.getFullYear()}-${pad(dIn.getMonth() + 1)}-${pad(dIn.getDate())}`
                              if (inDateStr === hourlyDateFilter) {
                                countInByHour[dIn.getHours()] = (countInByHour[dIn.getHours()] || 0) + 1
                              }
                            }
                            if (c.checkedOutAt) {
                              const dOut = new Date(c.checkedOutAt)
                              const outDateStr = `${dOut.getFullYear()}-${pad(dOut.getMonth() + 1)}-${pad(dOut.getDate())}`
                              if (outDateStr === hourlyDateFilter) {
                                countOutByHour[dOut.getHours()] = (countOutByHour[dOut.getHours()] || 0) + 1
                              }
                            }
                          })

                          baseIn = Object.keys(countInByHour).map((h) => ({
                            hour: Number(h),
                            count: countInByHour[Number(h)],
                          }))
                          baseOut = Object.keys(countOutByHour).map((h) => ({
                            hour: Number(h),
                            count: countOutByHour[Number(h)],
                          }))
                        }

                        // Ghép dữ liệu cho từng giờ
                        const combinedHours = Array.from({ length: 24 }, (_, h) => {
                          const inItem = baseIn.find((x) => x.hour === h)
                          const outItem = baseOut.find((x) => x.hour === h)
                          return {
                            hour: h,
                            checkInCount: inItem ? inItem.count : 0,
                            checkOutCount: outItem ? outItem.count : 0,
                          }
                        })

                        // Lọc theo khung giờ / buổi
                        const filteredHourly = combinedHours.filter((item) => {
                          if (hourlyRangeFilter === 'ALL') return true
                          if (hourlyRangeFilter === 'MORNING') return item.hour >= 6 && item.hour < 12
                          if (hourlyRangeFilter === 'AFTERNOON') return item.hour >= 12 && item.hour < 18
                          if (hourlyRangeFilter === 'EVENING') return item.hour >= 18 && item.hour <= 23
                          if (hourlyRangeFilter === 'NIGHT') return item.hour >= 0 && item.hour < 6
                          return true
                        })

                        const totalInView = filteredHourly.reduce((acc, curr) => acc + curr.checkInCount + curr.checkOutCount, 0)

                        return (
                          <div className="h-64 w-full my-2">
                            {totalInView === 0 && (seatStatus?.totalCheckedIn || 0) === 0 && (seatStatus?.totalCheckedOut || 0) === 0 ? (
                              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                                Chưa có lượt khách nào thực hiện check-in hoặc check-out trong khung giờ này.
                              </div>
                            ) : (
                              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                                <BarChart
                                  data={filteredHourly}
                                  margin={{ top: 10, right: 10, left: -10, bottom: 10 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                  <XAxis
                                    dataKey="hour"
                                    stroke="#94a3b8"
                                    fontSize={10}
                                    tickFormatter={(hour) => `${hour}:00`}
                                  />
                                  <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#0f172a',
                                      borderColor: '#334155',
                                      borderRadius: '0.75rem',
                                      color: '#f8fafc',
                                      fontSize: '12px',
                                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                                    }}
                                    itemStyle={{ color: '#f8fafc' }}
                                    labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                                    formatter={(val: any, name: any, item: any) => {
                                      const isCheckIn = name === 'checkInCount' || name === 'Check-in (Vào)' || item?.dataKey === 'checkInCount'
                                      return [
                                        `${val} lượt`,
                                        isCheckIn ? 'Lượt Check-in (Vào)' : 'Lượt Check-out (Ra)',
                                      ]
                                    }}
                                    labelFormatter={(label) => `Khung giờ: ${label}:00 - ${Number(label) + 1}:00`}
                                  />
                                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                                  <Bar dataKey="checkInCount" name="Check-in (Vào)" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="checkOutCount" name="Check-out (Ra)" fill="#10B981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Cột 3: Biểu Đồ Tròn Tỷ Lệ Check-In vs Check-Out */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                      <div>
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-emerald-500" />
                            <span>Tỷ Lệ Check-In vs Check-Out</span>
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            So sánh tương quan khách đang có mặt và đã rời sự kiện.
                          </p>
                        </div>

                        {(() => {
                          const totalIn = seatStatus?.totalCheckedIn || 0
                          const totalOut = seatStatus?.totalCheckedOut || 0
                          const currentlyPresent = Math.max(0, totalIn - totalOut)

                          const pieData = [
                            { name: 'Đang có mặt tại sự kiện', value: currentlyPresent, fill: '#8B5CF6' },
                            { name: 'Đã check-out (Rời đi)', value: totalOut, fill: '#10B981' },
                          ]

                          const hasData = totalIn > 0 || totalOut > 0

                          return (
                            <div className="h-64 w-full my-2">
                              {!hasData ? (
                                <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                                  Chưa ghi nhận dữ liệu check-in / check-out.
                                </div>
                              ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={pieData}
                                      dataKey="value"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={55}
                                      outerRadius={85}
                                      paddingAngle={4}
                                    >
                                      {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#0f172a',
                                        borderColor: '#334155',
                                        borderRadius: '0.75rem',
                                        color: '#f8fafc',
                                        fontSize: '12px',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
                                      }}
                                      itemStyle={{ color: '#f8fafc' }}
                                      labelStyle={{ color: '#cbd5e1', fontWeight: 600 }}
                                      formatter={(val: any) => [`${val} người`, 'Số lượng']}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
                                  </PieChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                          )
                        })()}
                      </div>

                      {/* Stat summary cards */}
                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
                          <span className="text-[10px] font-bold text-indigo-500 uppercase block">Đang có mặt</span>
                          <span className="text-base font-black text-indigo-700 dark:text-indigo-300">
                            {Math.max(0, (seatStatus?.totalCheckedIn || 0) - (seatStatus?.totalCheckedOut || 0))}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50">
                          <span className="text-[10px] font-bold text-emerald-500 uppercase block">Đã check-out</span>
                          <span className="text-base font-black text-emerald-700 dark:text-emerald-300">
                            {seatStatus?.totalCheckedOut || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal Nâng Cấp Gói Cho Báo Cáo Nâng Cao & GA4 */}
      <UpgradePlanModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        type={upgradeModalType}
        currentTier={currentSub?.tierName || currentSub?.tierCode || 'FREE'}
      />
    </div>
  )
}
