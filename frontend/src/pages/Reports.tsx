// src/pages/Reports.tsx

// ===================== IMPORTS =====================

// React hooks:
// - useState: lưu state (selectedEventId, dateRange, stats...)
// - useEffect: chạy side-effect (fetch API khi token / selectedEventId thay đổi)
import { useState, useEffect } from 'react'

// Icon UI (dashboard) từ lucide-react
import { Calendar, Users, CheckCircle, XCircle, Download, Filter } from 'lucide-react'

// date-fns: format ngày giờ cho đẹp (dùng locale Việt Nam)
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

// recharts: vẽ biểu đồ cột & tròn (hiện file có chuẩn bị data nhưng chưa render chart ở dưới)
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
} from 'recharts'

// AuthContext: lấy thông tin user (phân quyền, role...)
// (Trong file này có lấy user nhưng hiện chưa dùng để chặn quyền)
import { useAuth } from '../contexts/AuthContext'

// ===================== TYPES (DTO phía FE) =====================

// EventOption: dạng gọn để hiển thị dropdown chọn event
type EventOption = {
  id: number
  title: string
  startTime?: string
  type?: string
}

// Registration: 1 vé / 1 lượt đăng ký (để hiển thị bảng danh sách vé)
type Registration = {
  id: number
  userName: string
  studentId?: string | null
  userEmail: string
  seatNumber?: string | null
  registeredAt: string
  purchaseDate?: string | null
  checkedIn: boolean
  checkedInAt?: string | null
  checkedOut?: boolean
  checkedOutAt?: string | null
  ticketType?: string | null
  ticketCode?: string | null
  status?: string | null
}

// EventStats: thống kê cho 1 event (hoặc dùng để tổng hợp)
// - totalTickets/totalRegistrations: tổng số vé/đăng ký
// - totalCheckedIn/out: tổng check-in/out
// - refunded: tổng hoàn tiền
// - registrations: danh sách vé chi tiết (nếu API trả về)
type EventStats = {
  eventId: number
  eventTitle: string
  startTime?: string
  totalTickets: number
  totalCheckedIn: number
  totalCheckedOut: number
  totalRegistrations?: number
  checkInRate?: string
  checkOutRate?: string
  eventType?: string
  totalRefunded?: number
  refundedRate?: string
  registrations?: Registration[]
}

export default function Reports() {
  // ===================== AUTH / TOKEN =====================

  // Lấy user từ context (phục vụ phân quyền nếu cần)
  const { user } = useAuth()

  // JWT token để gọi API (lấy từ localStorage; check window để tránh lỗi SSR)
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null

  // ===================== UI STATE =====================

  // Event đang chọn trong dropdown (string vì lấy từ <select>)
  const [selectedEventId, setSelectedEventId] = useState<string>('')

  // Khoảng thời gian lọc sự kiện (YYYY-MM-DD)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })

  // Danh sách event load từ API /api/events
  const [events, setEvents] = useState<EventOption[]>([])

  // Trạng thái loading/error cho việc load events
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  // Thống kê chi tiết của event đang chọn (API /api/events/stats)
  const [selectedStats, setSelectedStats] = useState<EventStats | null>(null)

  // Trạng thái loading/error cho việc load stats event
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  // Thống kê tổng hợp nhiều event theo dateRange (khi bấm “Lọc và tính tổng”)
  const [aggregatedStats, setAggregatedStats] = useState<{
    totalRegistrations: number
    totalCheckedIn: number
    totalCheckedOut: number
    totalNotCheckedIn: number
    totalRefunded: number
    eventsCount: number
  } | null>(null)

  // Loading trạng thái tổng hợp (gọi nhiều request /api/events/stats)
  const [aggregateLoading, setAggregateLoading] = useState(false)

  // ===================== SEARCHABLE COMBOBOX STATE =====================

  // Giá trị tìm kiếm trong ô input
  const [searchInput, setSearchInput] = useState<string>('')

  // Trạng thái dropdown (mở/đóng)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // ===================== HELPERS (CHUẨN HÓA DATA) =====================

  /**
   * resolveFirst:
   * - nhận obj và danh sách paths dạng "a.b.c"
   * - trả về giá trị đầu tiên tìm được (khác undefined/null)
   * - dùng để map dữ liệu từ nhiều kiểu DTO khác nhau của BE
   */
  const resolveFirst = (obj: any, paths: string[]) => {
    for (const p of paths) {
      const parts = p.split('.')
      let cur = obj
      let ok = true
      for (const part of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, part)) {
          cur = cur[part]
        } else {
          ok = false
          break
        }
      }
      if (ok && cur !== undefined && cur !== null) return cur
    }
    return undefined
  }

  /**
   * findDeepKey:
   * - DFS tìm sâu trong object để kiếm key “na ná” với candidates
   * - normalize key: lowercase + bỏ ký tự đặc biệt
   * - dùng khi BE trả dữ liệu lồng nhiều lớp hoặc key không ổn định
   */
  const findDeepKey = (obj: any, candidates: string[]) => {
    if (!obj || typeof obj !== 'object') return undefined
    const normalize = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
    const candNorm = candidates.map(normalize)
    const seen = new WeakSet<any>()

    const dfs = (node: any): any => {
      if (!node || typeof node !== 'object') return undefined
      if (seen.has(node)) return undefined
      seen.add(node)

      for (const key of Object.keys(node)) {
        try {
          const val = node[key]
          const kn = normalize(key)

          // match gần đúng: kn === cn hoặc kn chứa cn hoặc cn chứa kn
          for (const cn of candNorm) {
            if (kn === cn || kn.includes(cn) || cn.includes(kn)) return val
          }

          // nếu val là object -> đào sâu tiếp
          if (val && typeof val === 'object') {
            const deeper = dfs(val)
            if (deeper !== undefined) return deeper
          }
        } catch (e) {
          // ignore lỗi khi duyệt key
        }
      }
      return undefined
    }

    return dfs(obj)
  }

  /**
   * mapStatus:
   * - Chuẩn hóa label trạng thái để hiển thị trong bảng:
   *   CHECKED_IN / CHECKED_OUT giữ nguyên
   *   REFUNDED -> “Đã Hoàn Tiền”
   */
  const mapStatus = (s: any) => {
    if (s === undefined || s === null) return null
    const v = String(s).toUpperCase()
    switch (v) {
      case 'CHECKED_IN':
        return 'CHECKED_IN'
      case 'CHECKED_OUT':
        return 'CHECKED_OUT'
      case 'REFUNDED':
        return 'Đã Hoàn Tiền'
      default:
        return String(s)
    }
  }

  /**
   * getStatusClass:
   * - Trả về class Tailwind cho badge theo status (màu nền + chữ)
   */
  const getStatusClass = (s: any) => {
    if (s === undefined || s === null) return 'inline-block px-2 py-1 rounded text-xs bg-gray-100 text-gray-800'
    const v = String(s).toUpperCase()
    switch (v) {
      case 'CHECKED_IN':
        return 'inline-block px-2 py-1 rounded text-xs bg-green-100 text-green-800'
      case 'CHECKED_OUT':
        return 'inline-block px-2 py-1 rounded text-xs bg-purple-100 text-purple-800'
      case 'REFUNDED':
        return 'inline-block px-2 py-1 rounded text-xs bg-red-100 text-red-800'
      case 'PURCHASED':
      case 'BOOKED':
        return 'inline-block px-2 py-1 rounded text-xs bg-blue-100 text-blue-800'
      case 'CANCELLED':
        return 'inline-block px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800'
      default:
        return 'inline-block px-2 py-1 rounded text-xs bg-gray-100 text-gray-800'
    }
  }

  // ===================== 1) FETCH DANH SÁCH EVENT (/api/events) =====================
  useEffect(() => {
    /**
     * fetchEvents:
     * - gọi /api/events (có Bearer token)
     * - BE trả { openEvents: [...], closedEvents: [...] }
     * - gộp lại thành 1 list cho dropdown
     */
    const fetchEvents = async () => {
      if (!token) return

      setEventsLoading(true)
      setEventsError(null)

      try {
        const res = await fetch('/api/events', {
          headers: {
            Authorization: `Bearer ${token}`,
            'ngrok-skip-browser-warning': '1',
          },
          credentials: 'include',
        })

        const data = await res.json()
        console.log('API /events response = ', data)

        if (!res.ok) {
          throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
        }

        // gộp open + closed
        const rawEvents = [
          ...(data.openEvents ?? []),
          ...(data.closedEvents ?? []),
        ]

        // map dữ liệu BE -> EventOption
        const list: EventOption[] = rawEvents.map((e: any) => ({
          id: e.eventId ?? e.id,
          title: e.title,
          startTime: e.startTime,
          type: e.type || e.category || undefined,
        }))

        // ✅ ADD "All Events" option at the top
        const allEventsLabel = user?.role === 'ADMIN'
          ? '-- Tất cả sự kiện trên hệ thống --'
          : '-- Tất cả sự kiện của tôi --'

        const allEventsOption: EventOption = {
          id: 0,  // Special ID for "All Events"
          title: allEventsLabel,
          type: undefined
        }

        setEvents([allEventsOption, ...list])

        // ✅ CHANGED: Don't auto-select first event
        // User must explicitly choose event to see stats
        // (This enforces intentional selection & prevents accidental clicks)
      } catch (err: any) {
        console.error('Fetch events error', err)
        setEventsError(err?.message || 'Không tải được danh sách sự kiện')
      } finally {
        setEventsLoading(false)
      }
    }

    fetchEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role])

  // ===================== 2) FETCH STATS 1 EVENT (/api/events/stats) =====================
  useEffect(() => {
    /**
     * fetchStats:
     * - gọi /api/events/stats?eventId=...
     * - chuẩn hóa totalRegistered/totalRegistrations/totalTickets về 1 biến
     * - normalize danh sách registrations/tickets (nếu có)
     * - nếu không có registrations, fallback gọi /api/tickets/list
     * 
     * ✅ FIX: Nếu selectedEventId = '0' (Tất cả), không gọi API stats
     */
    const fetchStats = async () => {
      // ✅ Nếu selectedEventId = '0' hoặc không chọn, reset stats
      if (!selectedEventId || selectedEventId === '0') {
        setSelectedStats(null)
        return
      }

      if (!token) {
        setSelectedStats(null)
        return
      }

      setStatsLoading(true)
      setStatsError(null)

      try {
        const url = `/api/events/stats?eventId=${encodeURIComponent(selectedEventId)}`

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'ngrok-skip-browser-warning': '1',
          },
          credentials: 'include',
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
        }

        // totalReg: chuẩn hóa field tổng đăng ký từ BE (tùy BE đặt tên)
        const totalReg =
          data.totalRegistered ?? data.totalRegistrations ?? data.totalTickets ?? 0

        // mapped: object stats FE dùng thống nhất
        const mapped: EventStats = {
          eventId: data.eventId,
          eventTitle: data.eventTitle || data.title,
          startTime: data.startTime,
          totalTickets: totalReg,
          totalCheckedIn: data.totalCheckedIn ?? 0,
          totalCheckedOut: data.totalCheckedOut ?? 0,
          totalRegistrations: totalReg,
          checkInRate: data.checkInRate,
          checkOutRate: data.checkOutRate,
          eventType: data.eventType,

          // refund từ BE
          totalRefunded: data.totalRefunded ?? 0,
          refundedRate: data.refundedRate,

          registrations: [],
        }

        // Lấy danh sách vé nếu BE trả nhiều kiểu key khác nhau
        const rawRegs = data.registrations ?? data.tickets ?? data.items ?? data.data ?? []
        if (Array.isArray(rawRegs) && rawRegs.length > 0) {
          // normalize từng record (mỗi vé) về Registration
          mapped.registrations = rawRegs.map((r: any) => {
            const id = resolveFirst(r, ['id', 'ticketId', 'registrationId', 'code']) ?? 0
            const userName = resolveFirst(r, ['userName', 'name', 'fullName', 'buyerName']) ?? '-'

            // email có thể nằm ở nhiều key hoặc lồng sâu
            let userEmail = resolveFirst(r, ['userEmail', 'email', 'buyerEmail', 'purchaserEmail'])
            if (!userEmail) userEmail = findDeepKey(r, ['email', 'buyerEmail']) ?? '-'

            // seat có thể nhiều tên
            let seatNumber = resolveFirst(r, ['seatNumber', 'seat', 'seat_no', 'seatNo'])
            if (!seatNumber) seatNumber = findDeepKey(r, ['seat', 'assignedSeat']) ?? null

            // ticketType có thể nhiều key
            let ticketType = resolveFirst(r, ['ticketType', 'type', 'category'])
            if (!ticketType) ticketType = findDeepKey(r, ['ticketName', 'ticket_type']) ?? null

            const registeredAt = resolveFirst(r, ['registeredAt', 'createdAt', 'created_at']) ?? ''
            const purchaseDate =
              resolveFirst(r, [
                'purchaseDate',
                'purchasedAt',
                'purchase_at',
                'purchase_time',
                'purchased_at',
                'createdAt',
                'created_at',
                'registeredAt',
              ]) ?? null

            // checkedIn/checkedOut: boolean có thể đến từ cờ hoặc từ thời gian check-in/out
            const checkedIn =
              !!resolveFirst(r, ['checkedIn', 'isCheckedIn', 'checked_in']) ||
              !!findDeepKey(r, ['checkInTime', 'checkinTime'])

            const checkedOut =
              !!resolveFirst(r, ['checkedOut', 'isCheckedOut', 'checked_out']) ||
              !!findDeepKey(r, ['checkOutTime', 'checkoutTime'])

            return {
              id,
              userName,
              studentId: resolveFirst(r, ['studentId', 'student_id']) ?? null,
              userEmail: userEmail ?? '-',
              seatNumber: seatNumber ?? null,
              registeredAt,
              checkedIn,
              checkedInAt:
                resolveFirst(r, ['checkedInAt', 'checked_in_at', 'checkInTime', 'checkinTime']) ??
                null,
              checkedOut,
              checkedOutAt:
                resolveFirst(r, ['checkedOutAt', 'checked_out_at', 'checkOutTime', 'checkoutTime']) ??
                null,
              ticketType: ticketType ?? null,
              ticketCode: resolveFirst(r, ['ticketCode', 'code']) ?? null,
              purchaseDate,
              status:
                resolveFirst(r, ['status', 'ticketStatus', 'state']) ??
                findDeepKey(r, ['status', 'ticketStatus']) ??
                null,
            }
          })
        }

        // Nếu API stats không trả registrations -> fallback gọi /api/tickets/list
        if ((!mapped.registrations || mapped.registrations.length === 0) && token) {
          try {
            const ticketsRes = await fetch(
              `/api/tickets/list?eventId=${encodeURIComponent(selectedEventId)}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'ngrok-skip-browser-warning': '1',
                },
                credentials: 'include',
              },
            )

            if (ticketsRes.ok) {
              const ticketsData = await ticketsRes.json()
              const rawTickets =
                ticketsData.tickets ??
                ticketsData.registrations ??
                ticketsData.data ??
                ticketsData.items ??
                ticketsData

              if (Array.isArray(rawTickets)) {
                mapped.registrations = rawTickets.map((t: any) => {
                  const id = resolveFirst(t, ['id', 'ticketId', 'registrationId', 'code']) ?? 0
                  const userName = resolveFirst(t, ['userName', 'name', 'fullName', 'buyerName']) ?? '-'

                  let userEmail = resolveFirst(t, ['userEmail', 'email', 'buyerEmail', 'purchaserEmail'])
                  if (!userEmail) userEmail = findDeepKey(t, ['email', 'buyerEmail']) ?? '-'

                  let seatNumber = resolveFirst(t, ['seatNumber', 'seat', 'seat_no', 'seatNo'])
                  if (!seatNumber) seatNumber = findDeepKey(t, ['seat', 'assignedSeat']) ?? null

                  let ticketType = resolveFirst(t, ['ticketType', 'type', 'category'])
                  if (!ticketType) ticketType = findDeepKey(t, ['ticketName', 'ticket_type']) ?? null

                  const registeredAt = resolveFirst(t, ['registeredAt', 'createdAt', 'created_at']) ?? ''
                  const purchaseDate =
                    resolveFirst(t, [
                      'purchaseDate',
                      'purchasedAt',
                      'purchase_at',
                      'purchase_time',
                      'purchased_at',
                      'createdAt',
                      'created_at',
                      'registeredAt',
                    ]) ?? null

                  const checkedIn =
                    !!resolveFirst(t, ['checkedIn', 'isCheckedIn', 'checked_in']) ||
                    !!findDeepKey(t, ['checkInTime', 'checkinTime'])

                  const checkedOut =
                    !!resolveFirst(t, ['checkedOut', 'isCheckedOut', 'checked_out']) ||
                    !!findDeepKey(t, ['checkOutTime', 'checkoutTime'])

                  return {
                    id,
                    userName,
                    studentId: resolveFirst(t, ['studentId', 'student_id']) ?? null,
                    userEmail: userEmail ?? '-',
                    seatNumber: seatNumber ?? null,
                    registeredAt,
                    checkedIn,
                    checkedInAt:
                      resolveFirst(t, ['checkedInAt', 'checked_in_at', 'checkInTime', 'checkinTime']) ??
                      null,
                    checkedOut,
                    checkedOutAt:
                      resolveFirst(t, ['checkedOutAt', 'checked_out_at', 'checkOutTime', 'checkoutTime']) ??
                      null,
                    ticketType: ticketType ?? null,
                    ticketCode: resolveFirst(t, ['ticketCode', 'code']) ?? null,
                    purchaseDate,
                    status:
                      resolveFirst(t, ['status', 'ticketStatus', 'state']) ??
                      findDeepKey(t, ['status', 'ticketStatus']) ??
                      null,
                  }
                })
              }
            }
          } catch (e) {
            // ignore fallback errors
          }
        }

        setSelectedStats(mapped)
      } catch (err: any) {
        console.error('Fetch stats error', err)
        setStatsError(err?.message || 'Không tải được thống kê sự kiện')
        setSelectedStats(null)
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
  }, [token, selectedEventId])

  // selectedEvent: lấy object event đang chọn từ list để hiển thị fallback title
  const selectedEvent = events.find((e) => String(e.id) === String(selectedEventId))

  // ===================== FILTER EVENTS THEO DATE RANGE =====================
  // filteredEvents: danh sách event sau lọc theo dateRange (nếu không chọn ngày => giữ nguyên)
  //lọc để có danh sách event phục vụ việc tổng hợp thống kê nhiều event
  const filteredEvents = events.filter((event) => {
    if (!dateRange.start && !dateRange.end) return true
    if (!event.startTime) return true

    const eventDate = new Date(event.startTime)

    if (dateRange.start) {
      const startDate = new Date(dateRange.start)
      if (eventDate < startDate) return false
    }

    if (dateRange.end) {
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59, 999)
      if (eventDate > endDate) return false
    }

    return true
  })

  // ===================== SEARCHABLE COMBOBOX FILTER =====================
  /**
   * searchableFilteredEvents: lọc theo tìm kiếm text
   * - Ignore case-sensitive
   * - Match title hoặc type
   */
  const searchableFilteredEvents = filteredEvents.filter((event) => {
    if (!searchInput.trim()) return true

    const query = searchInput.toLowerCase()
    const matchTitle = event.title.toLowerCase().includes(query)
    const matchType = event.type && event.type.toLowerCase().includes(query)

    return matchTitle || matchType
  })

  // ===================== AGGREGATE STATS NHIỀU EVENT =====================
  /**
   * handleFilterAndAggregate:
   * - ✅ NEW: Nếu selectedEventId = '0' (Tất cả sự kiện), gọi /api/events/stats?eventId=0 để Backend tính tổng
   * - ✅ OLD: Fallback: Nếu có dateRange filter, gọi từng event trong filteredEvents rồi cộng dồn
   */
  const handleFilterAndAggregate = async () => {
    if (!token) return

    // ✅ FIX: Nếu selectedEventId != '0' (chọn event riêng), không gọi API tổng hợp
    // Vì useEffect fetchStats đã tự động load stats của event đó
    if (selectedEventId && selectedEventId !== '0') {
      // Event đã được load tự động từ useEffect, chỉ reset aggregatedStats
      setAggregatedStats(null)
      return
    }

    // ✅ Nếu selectedEventId = '0' (Tất cả sự kiện), gọi Backend aggregate API
    setAggregateLoading(true)

    try {
      // ✅ OPTIMIZED: Call Backend aggregate endpoint directly (eventId=0)
      const res = await fetch('/api/events/stats?eventId=0', {
        headers: {
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': '1',
        },
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()

      // Backend returns aggregate stats with all counts including refunded
      const totalReg = data.totalRegistered ?? data.totalRegistrations ?? data.totalTickets ?? 0
      const totalCheckedIn = data.totalCheckedIn ?? 0
      const totalCheckedOut = data.totalCheckedOut ?? 0
      const totalRefunded = data.totalRefunded ?? 0

      setAggregatedStats({
        totalRegistrations: totalReg,
        totalCheckedIn,
        totalCheckedOut,
        totalRefunded,
        totalNotCheckedIn: totalReg - totalCheckedIn,
        eventsCount: filteredEvents.length, // Count from filtered events for display
      })

      console.log('[AGGREGATE STATS] Received from Backend:', {
        totalReg,
        totalCheckedIn,
        totalCheckedOut,
        totalRefunded,
      })
    } catch (err) {
      console.error('Aggregate stats error:', err)
      // Fallback: If Backend aggregate fails, try summing individual events (old approach)
      await handleFilterAndAggregateManual()
    } finally {
      setAggregateLoading(false)
    }
  }

  /**
   * handleFilterAndAggregateManual:
   * - Fallback method: Loop through filteredEvents and sum stats manually
   * - Used when Backend aggregate endpoint is unavailable or when dateRange filter is applied
   */
  const handleFilterAndAggregateManual = async () => {
    if (!token || filteredEvents.length === 0) return

    try {
      const statsPromises = filteredEvents.map(async (event) => {
        const res = await fetch(`/api/events/stats?eventId=${event.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'ngrok-skip-browser-warning': '1',
          },
          credentials: 'include',
        })

        if (!res.ok) return null

        const data = await res.json()

        // Chuẩn hóa field để cộng dồn (backend trả totalTickets)
        return {
          totalRegistered: data.totalRegistered ?? data.totalRegistrations ?? data.totalTickets ?? 0,
          totalCheckedIn: data.totalCheckedIn ?? 0,
          totalCheckedOut: data.totalCheckedOut ?? 0,
          totalRefunded: data.totalRefunded ?? 0,
        }
      })

      const statsResults = await Promise.all(statsPromises)

      // ✅ RESET: Explicitly initialize accumulator variables to 0 before loop
      let totalRegistrations = 0
      let totalCheckedIn = 0
      let totalCheckedOut = 0
      let totalRefunded = 0

      // ✅ Accumulate stats from all filtered events
      for (const stat of statsResults) {
        if (stat) {
          totalRegistrations += stat.totalRegistered
          totalCheckedIn += stat.totalCheckedIn
          totalCheckedOut += stat.totalCheckedOut
          totalRefunded += stat.totalRefunded
        }
      }

      // ✅ Ensure non-negative values
      totalRegistrations = Math.max(0, totalRegistrations)
      totalCheckedIn = Math.max(0, Math.min(totalCheckedIn, totalRegistrations))
      totalCheckedOut = Math.max(0, Math.min(totalCheckedOut, totalRegistrations))
      totalRefunded = Math.max(0, Math.min(totalRefunded, totalRegistrations))

      setAggregatedStats({
        totalRegistrations,
        totalCheckedIn,
        totalCheckedOut,
        totalRefunded,
        totalNotCheckedIn: totalRegistrations - totalCheckedIn,
        eventsCount: filteredEvents.length,
      })
    } catch (err) {
      console.error('Manual aggregate stats error:', err)
    }
  }

  // ===================== DERIVED DATA CHO UI =====================

  // ✅ UNIFIED DATA SOURCE: Use aggregatedStats when available, otherwise use selectedStats
  // This ensures 4 top cards and summary table show same data
  const displayStats = aggregatedStats ? {
    totalRegistered: aggregatedStats.totalRegistrations,
    totalCheckedIn: aggregatedStats.totalCheckedIn,
    totalCheckedOut: aggregatedStats.totalCheckedOut,
    totalNotCheckedIn: aggregatedStats.totalNotCheckedIn,
    totalRefunded: aggregatedStats.totalRefunded,
  } : {
    totalRegistered: selectedStats?.totalRegistrations ?? selectedStats?.totalTickets ?? 0,
    totalCheckedIn: selectedStats?.totalCheckedIn ?? 0,
    totalCheckedOut: selectedStats?.totalCheckedOut ?? 0,
    totalNotCheckedIn: Math.max(0, (selectedStats?.totalRegistrations ?? selectedStats?.totalTickets ?? 0) - (selectedStats?.totalCheckedIn ?? 0)),
    totalRefunded: selectedStats?.totalRefunded ?? 0,
  }

  // registrations: danh sách vé của event đang chọn (chỉ hiện khi NOT aggregating)
  const registrations: Registration[] = !aggregatedStats ? (selectedStats?.registrations || []) : []

  const checkedInCount = displayStats.totalCheckedIn
  const checkedOutCount = displayStats.totalCheckedOut
  const totalRegistrations = displayStats.totalRegistered
  const notCheckedInCount = displayStats.totalNotCheckedIn

  // ✅ FIX: refunded count from unified displayStats (not just selectedStats)
  const refundedCount = displayStats.totalRefunded

  /**
   * formatPercent:
   * - Nếu BE đã trả chuỗi rate (ví dụ "12,3%") thì dùng luôn
   * - Nếu không có thì tự tính từ num/denom
   * - Định dạng 1 chữ số thập phân và dùng dấu phẩy theo kiểu VN
   */
  const formatPercent = (apiValue: any, num?: number, denom?: number) => {
    if (apiValue !== undefined && apiValue !== null && String(apiValue).trim() !== '') return String(apiValue)
    const n = Number(num ?? 0)  //Có thể là tổng checkin / tổng checkout / tổng hoàn tiền
    const d = Number(denom ?? 0) //tổng đăng ký
    if (!d || d === 0) return '0,0%'
    const val = (n / d) * 100
    return val.toFixed(1).replace('.', ',') + '%'
  }

  const formatDateTime = (s?: string | null) => {
    if (!s) return '-'
    try {
      const d = new Date(s)
      if (isNaN(d.getTime())) return '-'
      return format(d, 'Pp', { locale: vi })
    } catch (e) {
      return String(s)
    }
  }

  const refundedRate = formatPercent(selectedStats?.refundedRate, refundedCount, totalRegistrations)

  // Tổng event sau lọc (phục vụ card "Tổng sự kiện")
  const totalEvents = filteredEvents.length

  // 2 biến này được tính từ displayStats (unified source)
  const totalCheckedIn = checkedInCount
  const totalCheckedOut = checkedOutCount

  /**
   * eventAttendanceData:
   * - Data cho BarChart:
   *   + Nếu aggregatedStats có: hiển thị 1 cột “Tổng hợp (n sự kiện)”
   *   + Nếu không: hiển thị 1 cột cho event đang chọn
   */
  const eventAttendanceData = (aggregatedStats || selectedStats)
    ? [
      {
        name: aggregatedStats ? `Tổng hợp (${aggregatedStats.eventsCount} sự kiện)` : (selectedStats?.eventTitle || selectedEvent?.title),
        'Đã đăng ký': displayStats.totalRegistered,
        'Đã check-in': displayStats.totalCheckedIn,
        'Đã check-out': displayStats.totalCheckedOut,
      },
    ]
    : []

  /**
   * checkInPieData:
   * - Data cho PieChart: luôn dùng displayStats (unified source)
   * - Có kèm màu (hex) theo từng phần
   */
  const checkInPieData = [
    { name: 'Đã check-in', value: displayStats.totalCheckedIn, color: '#10b981' },
    { name: 'Đã check-out', value: displayStats.totalCheckedOut, color: '#8b5cf6' },
    { name: 'Chưa check-in', value: displayStats.totalNotCheckedIn, color: '#f59e0b' },
  ]

  /**
   * eventTypeChartData:
   * - Tạo data cho chart loại sự kiện (hiện chỉ set 1 loại của selectedStats)
   * - Lưu ý: file hiện chưa render chart này bên dưới
   */
  const eventTypeData: Record<string, number> = {}
  if (selectedStats?.eventType) {
    eventTypeData[selectedStats.eventType] = totalRegistrations
  }
  const eventTypeChartData = Object.entries(eventTypeData).map(([name, value]) => ({ name, value }))

  // ===================== RENDER UI =====================
  return (
    <div>
      {/* ===== Header ===== */}
      <div className="flex items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Báo cáo tham dự</h1>
      </div>

      {/* ===== Overall Statistics (5 cards) ===== */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        {/* Card: Tổng sự kiện (sau lọc dateRange) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng sự kiện</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalEvents}</p>
            </div>
            <Calendar className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        {/* Card: Tổng đăng ký (dùng displayStats - unified) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng đăng ký</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{displayStats.totalRegistered}</p>
            </div>
            <Users className="w-12 h-12 text-green-500" />
          </div>
        </div>

        {/* Card: Tổng check-in (dùng displayStats - unified) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng check-in</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{displayStats.totalCheckedIn}</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
        </div>

        {/* Card: Tổng check-out (dùng displayStats - unified) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng check-out</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{displayStats.totalCheckedOut}</p>
            </div>
            <XCircle className="w-12 h-12 text-purple-500" />
          </div>
        </div>

        {/* Card: Tổng hoàn tiền */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng Đã Hoàn Tiền</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{refundedCount}</p>
            </div>
            <XCircle className="w-12 h-12 text-red-500" />
          </div>
        </div>
      </div>

      {/* ===== Rate cards: check-in / check-out / refunded ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Rate: check-in (dùng displayStats - unified) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tỷ lệ check-in</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {displayStats.totalRegistered > 0
                  ? Math.round((displayStats.totalCheckedIn / displayStats.totalRegistered) * 100)
                  : 0}%
              </p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-full">
              <span className="text-2xl text-green-600">✓</span>
            </div>
          </div>
        </div>

        {/* Rate: check-out (dùng displayStats - unified) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tỷ lệ check-out</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {displayStats.totalRegistered > 0
                  ? Math.round((displayStats.totalCheckedOut / displayStats.totalRegistered) * 100)
                  : 0}%
              </p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-full">
              <span className="text-2xl text-purple-600">↩</span>
            </div>
          </div>
        </div>

        {/* Rate: refunded */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tỷ lệ hoàn tiền</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {displayStats.totalRegistered > 0
                  ? Math.round((refundedCount / displayStats.totalRegistered) * 100)
                  : 0}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Đã hoàn: {refundedCount}/{displayStats.totalRegistered}
              </p>
            </div>
            <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-full">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Filters: dropdown event + date range + aggregate button ===== */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Filter className="w-5 h-5 mr-2" />
          Lọc báo cáo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ✅ UPGRADED: Searchable Combobox Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chọn sự kiện</label>

            {/* Combobox Container */}
            <div className="relative">
              {/* Input field with search icon */}
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện... (nhập tên hoặc loại)"
                value={
                  selectedEventId && selectedEvent
                    ? selectedEvent.title
                    : searchInput
                }
                onChange={(e) => {
                  const input = e.target.value
                  setSearchInput(input)
                  setSelectedEventId('') // Clear selection when typing
                  setIsDropdownOpen(true)
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onBlur={() => {
                  // Delay to allow click on dropdown items
                  setTimeout(() => setIsDropdownOpen(false), 200)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
              />

              {/* Dropdown toggle icon */}
              <div className="absolute right-3 top-2.5 text-gray-400 pointer-events-none">
                {isDropdownOpen ? '▲' : '▼'}
              </div>

              {/* Dropdown list */}
              {isDropdownOpen && (
                <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-64 overflow-y-auto">
                  {eventsLoading && (
                    <div className="px-4 py-2 text-sm text-gray-500">Đang tải...</div>
                  )}

                  {!eventsLoading && searchableFilteredEvents.length === 0 && (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      {searchInput ? 'Không tìm thấy sự kiện' : 'Chưa có sự kiện nào'}
                    </div>
                  )}

                  {!eventsLoading &&
                    searchableFilteredEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => {
                          setSelectedEventId(String(event.id))
                          setSearchInput('')
                          setIsDropdownOpen(false)
                          // ✅ FIX: Reset aggregatedStats khi chọn event mới để tránh kẹt dữ liệu
                          setAggregatedStats(null)
                        }}
                        className={`px-4 py-2 cursor-pointer transition-colors ${String(selectedEventId) === String(event.id)
                          ? 'bg-blue-500 text-white'
                          : 'hover:bg-gray-100'
                          }`}
                      >
                        <div className="font-medium text-sm">{event.title}</div>
                        {event.type && (
                          <div className="text-xs opacity-75">{event.type}</div>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {eventsError && (
                <p className="mt-1 text-xs text-red-500">{eventsError}</p>
              )}
            </div>

            {/* ✅ INFO: Selected event indicator */}
            {selectedEventId && selectedEvent && (
              <p className="mt-2 text-xs text-green-600">
                ✓ Đã chọn: {selectedEvent.title}
              </p>
            )}
          </div>

          {/* Date start */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Từ ngày</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => {
                setDateRange({ ...dateRange, start: e.target.value })
                // ✅ FIX: Reset aggregatedStats khi thay đổi dateRange để tránh hiển thị dữ liệu cũ
                if (selectedEventId === '0') {
                  setAggregatedStats(null)
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date end */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Đến ngày</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => {
                setDateRange({ ...dateRange, end: e.target.value })
                // ✅ FIX: Reset aggregatedStats khi thay đổi dateRange để tránh hiển thị dữ liệu cũ
                if (selectedEventId === '0') {
                  setAggregatedStats(null)
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Aggregate button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleFilterAndAggregate}
            disabled={aggregateLoading || filteredEvents.length === 0}
            className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Filter className="w-5 h-5 mr-2" />
            {aggregateLoading ? 'Đang tính toán...' : 'Lọc và tính tổng'}
          </button>
        </div>
      </div>

      {/* ===== All Events Notice ===== */}
      {selectedStats && selectedEventId === '0' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                {user?.role === 'ADMIN' ? 'Thống kê toàn bộ hệ thống' : 'Thống kê tất cả sự kiện của bạn'}
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Danh sách vé không được hiển thị khi xem báo cáo tổng hợp của tất cả sự kiện.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Ticket List (chỉ hiện khi đang xem stats 1 event, không phải "Tất cả") ===== */}
      {selectedStats && selectedEventId && selectedEventId !== '0' && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Danh sách vé — {selectedStats.eventTitle || selectedEvent?.title}
          </h2>

          <p className="text-sm text-gray-600 mb-4">Tổng vé: {totalRegistrations}</p>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Ticket ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Tên</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Seat</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Loại vé</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Ngày mua</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {registrations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      Không có vé / đăng ký nào
                    </td>
                  </tr>
                ) : (
                  registrations.map((r, idx) => {
                    // Lấy ticketId/seat/ticketType từ nhiều nguồn key khác nhau
                    const ticketId = (r as any).ticketId ?? r.id ?? '-'
                    const seat = r.seatNumber ?? (r as any).seat ?? '-'
                    const seatType =
                      (r as any).seatType ?? (r as any).ticketType ?? (r as any).type ?? '-'

                    // Lấy time check-in/out
                    const checkInTime =
                      (r as any).checkedInAt ??
                      (r as any).checked_in_at ??
                      (r as any).checkInTime ??
                      (r as any).checkinTime ??
                      null

                    const checkOutTime =
                      (r as any).checkedOutAt ??
                      (r as any).checked_out_at ??
                      (r as any).checkOutTime ??
                      (r as any).checkoutTime ??
                      null

                    // Chuẩn hóa status và class badge
                    const statusRaw = resolveFirst(r, ['status', 'ticketStatus', 'state']) ?? (r as any).status ?? null
                    const statusLabel = mapStatus(statusRaw)
                    const statusBadgeClass = getStatusClass(statusRaw)

                    return (
                      <tr key={r.id ?? idx}>
                        <td className="px-4 py-3 text-sm text-gray-700">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{ticketId}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.userName ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{seat}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{seatType}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime((r as any).purchaseDate ?? r.purchaseDate ?? null)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="flex flex-col">
                            {statusLabel ? <span className={statusBadgeClass}>{statusLabel}</span> : null}
                            <span className="text-xs text-gray-500">
                              Check-in: {checkInTime ? new Date(checkInTime).toLocaleString() : '-'}
                            </span>
                            <span className="text-xs text-gray-500">
                              Check-out: {checkOutTime ? new Date(checkOutTime).toLocaleString() : '-'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Aggregated Results (chỉ hiện khi đã bấm tổng hợp và chọn "Tất cả sự kiện") ===== */}
      {aggregatedStats && selectedEventId === '0' && (
        <>
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 text-blue-600">
              Thống kê tổng hợp ({aggregatedStats.eventsCount} sự kiện)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Tổng đăng ký</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">
                      {displayStats.totalRegistered}
                    </p>
                  </div>
                  <Users className="w-10 h-10 text-blue-500" />
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Đã check-in</p>
                    <p className="text-3xl font-bold text-green-600 mt-2">
                      {displayStats.totalCheckedIn}
                    </p>
                  </div>
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Đã check-out</p>
                    <p className="text-3xl font-bold text-purple-600 mt-2">
                      {displayStats.totalCheckedOut}
                    </p>
                  </div>
                  <XCircle className="w-10 h-10 text-purple-500" />
                </div>
              </div>

              <div className="bg-orange-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Chưa check-in</p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">
                      {displayStats.totalNotCheckedIn}
                    </p>
                  </div>
                  <XCircle className="w-10 h-10 text-orange-500" />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 flex gap-8">
              <p className="text-sm text-gray-600">
                Tỷ lệ check-in:{' '}
                <span className="font-bold text-lg text-green-600">
                  {displayStats.totalRegistered > 0
                    ? Math.round((displayStats.totalCheckedIn / displayStats.totalRegistered) * 100)
                    : 0}
                  %
                </span>
              </p>

              <p className="text-sm text-gray-600">
                Tỷ lệ check-out:{' '}
                <span className="font-bold text-lg text-purple-600">
                  {displayStats.totalRegistered > 0
                    ? Math.round((displayStats.totalCheckedOut / displayStats.totalRegistered) * 100)
                    : 0}
                  %
                </span>
              </p>
            </div>
          </div>
        </>
      )}

      {/* ===== Hướng dẫn dùng (khi chưa có event được chọn và chưa tổng hợp) ===== */}
      {!selectedEvent && !aggregatedStats && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Hướng dẫn sử dụng</h2>

          <div className="space-y-2 text-sm text-gray-600">
            <p>
              • <strong>Chọn khoảng thời gian:</strong> Sử dụng "Từ ngày" và "Đến ngày" để lọc các sự kiện trong khoảng thời gian cụ thể
            </p>
            <p>
              • <strong>Xem tổng hợp:</strong> Nhấn nút "Lọc và tính tổng" để xem thống kê tổng hợp của tất cả sự kiện trong khoảng thời gian
            </p>
            <p>
              • <strong>Xem chi tiết:</strong> Chọn 1 sự kiện cụ thể để xem thống kê chi tiết cho sự kiện đó
            </p>
          </div>

          <p className="mt-4 text-sm text-gray-500 italic">
            Hiện tại: Đang hiển thị {filteredEvents.length} sự kiện
            {(dateRange.start || dateRange.end) && ' trong khoảng thời gian đã chọn'}
          </p>
        </div>
      )}
    </div>
  )
}
