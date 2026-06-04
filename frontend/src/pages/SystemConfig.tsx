import { useState, useEffect } from 'react'
import { Settings, Save, RefreshCw, Search } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams } from 'react-router-dom'
import { EventConfigModal } from '../components/events/EventConfigModal'
import Pagination from '../components/common/Pagination'

/**
 * Kiểu dữ liệu cấu hình hệ thống
 * - minMinutesAfterStart: số phút tối thiểu sau khi sự kiện bắt đầu mới được check-out
 * - checkinAllowedBeforeStartMinutes: số phút trước khi sự kiện bắt đầu được check-in
 */
type SystemConfigData = {
  minMinutesAfterStart: number
  checkinAllowedBeforeStartMinutes: number
}

type EventListItem = {
  eventId: number
  title: string
  startTime: string
  status: string
  venueLocation?: string
  organizerId?: number
}

export default function SystemConfig() {
  // Hàm hiển thị toast (success / error)
  const { showToast } = useToast()

  // ✅ NEW: Get user info for role-based filtering
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isOrganizer = user?.role === 'ORGANIZER'

  // ✅ NEW: URL Search Params for pagination
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPage = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = 10

  /**
   * State lưu cấu hình hệ thống
   * Mặc định khởi tạo là 60 phút cho cả check-in và check-out
   * Đây chưa phải là dữ liệu cuối, set mặc định để tránh state undefined ban đầu
   * → sẽ gọi API lấy dữ liệu thật từ backend trong useEffect bên dưới
   */
  const [config, setConfig] = useState<SystemConfigData>({
    minMinutesAfterStart: 60,
    checkinAllowedBeforeStartMinutes: 60
  })

  // Trạng thái loading khi đang gọi API lấy config
  const [loading, setLoading] = useState(true)

  // Trạng thái saving khi đang lưu config
  const [saving, setSaving] = useState(false)

  // Lưu message lỗi nếu có
  const [error, setError] = useState<string | null>(null)

  // Event list management state
  const [events, setEvents] = useState<EventListItem[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL') // ✅ New: Status filter

  // ✅ NEW: Pagination state
  const [paginationData, setPaginationData] = useState({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    pageSize: pageSize
  })

  // Config modal state
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<number>(0)
  const [selectedEventTitle, setSelectedEventTitle] = useState<string>('')
  // ✅ UPDATED: Default to 'events' for ORGANIZER, 'system' for ADMIN
  const [activeTab, setActiveTab] = useState<'system' | 'events'>(isOrganizer ? 'events' : 'system')

  /**
   * Lấy token từ localStorage
   * typeof window !== 'undefined' để tránh lỗi khi render phía server (SSR)
   */

  /**
   * useEffect: chạy khi component mount hoặc khi token thay đổi
   * → gọi API để lấy cấu hình hệ thống hiện tại từ backend
   * ✅ Updated: Dùng API mới /api/events/config?eventId=-1
   */
  useEffect(() => {
    const fetchConfig = async () => {

      setLoading(true)
      setError(null)

      try {
        // ✅ NEW API: GET /api/events/config?eventId=-1 (global config)
        const res = await fetch('/api/events/config?eventId=-1', {
          headers: {
            credentials: 'include',
            'ngrok-skip-browser-warning': '1'
          },
          credentials: 'include'
        })

        // Parse JSON
        const data = await res.json()

        // Nếu response lỗi thì throw để catch xử lý
        if (!res.ok) {
          throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
        }

        // ✅ Backend trả: { eventId, checkinAllowedBeforeStartMinutes, minMinutesAfterStart }
        setConfig({
          minMinutesAfterStart: data.minMinutesAfterStart ?? 60,
          checkinAllowedBeforeStartMinutes:
            data.checkinAllowedBeforeStartMinutes ?? 60
        })
      } catch (err: any) {
        console.error('Fetch config error:', err)
        setError(err?.message || 'Không tải được cấu hình hệ thống')
      } finally {
        // Kết thúc loading
        setLoading(false)
      }
    }

    fetchConfig()
  }, [])

  /**
   * fetchEvents:
   * - Lấy danh sách events với phân trang từ URL parameter
   * ✅ NOW WITH PAGINATION SUPPORT
   */
  const fetchEvents = async (page: number = 1) => {
    setLoadingEvents(true)
    try {
      // ✅ NEW: Include page and limit in API call
      const url = `/api/events?page=${page}&limit=${pageSize}`
      const response = await fetch(url, {
        headers: {
          credentials: 'include',
          'ngrok-skip-browser-warning': '1'
        },
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()

        const eventsArray = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : []

        setEvents(eventsArray)

        if (!Array.isArray(data)) {
          setPaginationData({
            totalItems: data.total ?? eventsArray.length,
            totalPages: data.totalPages ?? 1,
            currentPage: data.page ?? page,
            pageSize: data.limit ?? pageSize
          })
          console.log('[PAGINATION] Received pagination data:', data)
        } else {
          setPaginationData({
            totalItems: eventsArray.length,
            totalPages: 1,
            currentPage: 1,
            pageSize: eventsArray.length
          })
        }
      } else {
        throw new Error('Failed to fetch events')
      }
    } catch (error) {
      console.error('Error fetching events:', error)
      showToast('error', 'Không thể tải danh sách sự kiện')
    } finally {
      setLoadingEvents(false)
    }
  }

  /**
   * Load events sau khi load config
   * ✅ NOW: Monitors URL page parameter and refetches when it changes
   */
  useEffect(() => {
    if (!loading) {
      fetchEvents(currentPage)
      // ✅ NEW: Scroll table into view when page changes
      setTimeout(() => {
        const tableElement = document.querySelector('[data-event-table]')
        if (tableElement) {
          tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }, [loading, currentPage])

  /**
   * handleManageEventConfig:
   * - Mở EventConfigModal cho event được chọn
   */
  const handleManageEventConfig = (eventId: number, eventTitle: string) => {
    setSelectedEventId(eventId)
    setSelectedEventTitle(eventTitle)
    setIsConfigModalOpen(true)
  }

  /**
   * ✅ NEW: handlePageChange
   * - Update URL parameter when user clicks pagination button
   * - Reset search when changing pages to avoid confusion
   */
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= paginationData.totalPages) {
      setSearchParams({ page: String(newPage) })
    }
  }

  /**
   * ✅ NEW: handleSearch with pagination reset
   * - Reset to page 1 when user types in search box
   */
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    // Reset to page 1 when searching
    setSearchParams({ page: '1' })
  }

  /**
   * ✅ NEW: handleStatusFilterChange with pagination reset
   */
  const handleStatusFilterChange = (status: 'ALL' | 'OPEN' | 'CLOSED') => {
    setStatusFilter(status)
    // Reset to page 1 when filtering
    setSearchParams({ page: '1' })
  }

  /**
   * Filter events theo search query, status, và role
   * ✅ FIXED: Cast both organizerId and user.id to String for safe comparison
   */
  const filteredEvents = events.filter(event => {
    const matchSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchStatus =
      statusFilter === 'ALL' ||
      event.status === statusFilter ||
      (statusFilter === 'CLOSED' && (event.status === 'CLOSED' || event.status === 'CANCELLED'))

    // ✅ FIXED: String conversion for safe comparison (String(a) === String(b))
    const isOwner = String(event.organizerId) === String(user?.id)
    const matchRole = isAdmin || (isOrganizer && isOwner)

    return matchSearch && matchStatus && matchRole
  })

  /**
   * handleChange
   * Xử lý khi người dùng thay đổi giá trị trong ô input
   * - Chỉ cho phép số từ 0 đến 600
   * - Nếu hợp lệ → cập nhật state config
   * - Nếu không hợp lệ → không update state
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const numValue = parseInt(value, 10)

    // Chỉ xử lý đúng 2 field cấu hình
    if (
      name === 'minMinutesAfterStart' ||
      name === 'checkinAllowedBeforeStartMinutes'
    ) {
      // Validate: số từ 0 đến 600
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 600) {
        setConfig(prev => ({ ...prev, [name]: numValue }))
      }
      // Trường hợp user xoá hết input
      else if (value === '') {
        setConfig(prev => ({ ...prev, [name]: 0 }))
      }
    }
  }

  /**
   * handleSave
   * Gọi API POST để lưu cấu hình hệ thống lên backend
   * ✅ Sau khi lưu thành công → tự động reload để đảm bảo data khớp
   */
  const handleSave = async () => {

    // Validate lần cuối trước khi gửi lên backend
    if (config.minMinutesAfterStart < 0 || config.minMinutesAfterStart > 600) {
      showToast('error', 'Thời gian check-out phải từ 0 đến 600')
      return
    }
    if (
      config.checkinAllowedBeforeStartMinutes < 0 ||
      config.checkinAllowedBeforeStartMinutes > 600
    ) {
      showToast('error', 'Thời gian check-in phải từ 0 đến 600')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // ✅ NEW API: POST /api/events/update-config
      const res = await fetch('/api/events/update-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          credentials: 'include',
          'ngrok-skip-browser-warning': '1'
        },
        credentials: 'include',
        body: JSON.stringify({
          eventId: -1, // ✅ -1 = global config (Admin only)
          checkinAllowedBeforeStartMinutes:
            config.checkinAllowedBeforeStartMinutes,
          minMinutesAfterStart: config.minMinutesAfterStart
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      }

      showToast('success', 'Cập nhật cấu hình thành công!')

      // ✅ RELOAD: Sau khi lưu, reload lại dữ liệu để đảm bảo UI khớp
      setTimeout(() => {
        handleReload()
      }, 500)
    } catch (err: any) {
      console.error('Save config error:', err)
      const errorMsg = err?.message || 'Không thể lưu cấu hình'
      setError(errorMsg)
      showToast('error', errorMsg)
    } finally {
      setSaving(false)
    }
  }

  /**
   * handleReload
   * Gọi lại API để lấy cấu hình mới nhất từ backend
   * ✅ Updated: Dùng API mới /api/events/config?eventId=-1
   */
  const handleReload = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/events/config?eventId=-1', {
        headers: {
          credentials: 'include',
          'ngrok-skip-browser-warning': '1'
        },
        credentials: 'include'
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      }

      setConfig({
        minMinutesAfterStart: data.minMinutesAfterStart ?? 60,
        checkinAllowedBeforeStartMinutes:
          data.checkinAllowedBeforeStartMinutes ?? 60
      })
      showToast('success', 'Đã tải lại cấu hình')
    } catch (err: any) {
      console.error('Reload config error:', err)
      setError(err?.message || 'Không tải được cấu hình hệ thống')
      showToast('error', 'Không tải được cấu hình')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800/80 p-8 shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
          <p className="text-slate-655 dark:text-slate-300 font-extrabold text-sm">Đang tải cấu hình...</p>
        </div>
      </div>
    )
  }

  /**
   * UI chính của trang cấu hình hệ thống - Dạng TABS
   */
  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-white/70 border border-white/80 dark:bg-slate-900/70 dark:border-slate-800/80 backdrop-blur-md rounded-3xl p-2 shadow-md mb-8 grid grid-cols-2 gap-1 max-w-2xl mx-auto animate-fade-in-up">
        {/* Tab 1: System Config - ✅ Only show for ADMIN */}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-sm font-extrabold transition-all duration-300 active:scale-95 ${
              activeTab === 'system'
                ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20 scale-[1.02]'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Settings className="w-4 h-4" />
            Cấu hình hệ thống
          </button>
        )}

        {/* Tab 2: Events Config */}
        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-sm font-extrabold transition-all duration-300 active:scale-95 ${
            activeTab === 'events'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-500/20 scale-[1.02]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-slate-800/40'
          }`}
          style={!isAdmin ? { gridColumn: 'span 2' } : undefined}
        >
          <Settings className="w-4 h-4" />
          Cấu hình sự kiện
        </button>
      </div>

      {/* Tab Content: System Config - ✅ Only show for ADMIN */}
      {isAdmin && activeTab === 'system' && (
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800/80 p-8 max-w-2xl w-full mx-auto shadow-xl hover:shadow-orange-500/5 transition-all duration-500 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <Settings className="w-6 h-6 text-orange-655" />
              Cấu hình hệ thống
            </h1>

            {/* Nút reload config */}
            <button
              onClick={handleReload}
              disabled={loading}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-orange-650 dark:hover:text-orange-500 hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-800 transition-all duration-300 active:scale-95 shadow-sm"
              title="Tải lại cấu hình"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Hiển thị lỗi nếu có */}
          {error && (
            <div className="mb-6 p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl flex items-center gap-2 text-sm text-red-600 dark:text-red-400 font-semibold shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* checkinAllowedBeforeStartMinutes - Check-in */}
            <div className="border border-emerald-100 dark:border-emerald-950/50 bg-emerald-50/20 dark:bg-emerald-950/10 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <label className="block text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Thời gian cho phép Check-in trước sự kiện (phút)
                </label>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-4 leading-relaxed">
                Số phút trước khi sự kiện bắt đầu mà người dùng có thể check-in.
                Giá trị từ 0 đến 600 phút (10 giờ).
              </p>

              <div className="flex items-center gap-4">
                <input
                  type="number"
                  name="checkinAllowedBeforeStartMinutes"
                  value={config.checkinAllowedBeforeStartMinutes}
                  onChange={handleChange}
                  min="0"
                  max="600"
                  className="w-32 px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-center text-lg font-bold text-slate-900 dark:text-slate-100 shadow-sm transition-all duration-300"
                />
                <span className="text-sm font-bold text-slate-655 dark:text-slate-300">phút trước khi bắt đầu</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-slate-400">Gợi ý nhanh:</span>
                {[15, 30, 60, 120].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setConfig(prev => ({
                        ...prev,
                        checkinAllowedBeforeStartMinutes: val
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all duration-300 active:scale-95 ${
                      config.checkinAllowedBeforeStartMinutes === val
                        ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-md shadow-orange-500/10'
                        : 'bg-white border border-slate-150 text-slate-600 hover:bg-orange-550 hover:text-orange-600 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-orange-950/20 dark:hover:text-orange-400'
                    }`}
                  >
                    {val} phút
                  </button>
                ))}
              </div>
            </div>

            {/* minMinutesAfterStart - Check-out */}
            <div className="border border-purple-100 dark:border-purple-950/50 bg-purple-50/20 dark:bg-purple-950/10 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></div>
                <label className="block text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Thời gian tối thiểu TRƯỚC KHI kết thúc để cho phép Check-out (phút)
                </label>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-4 leading-relaxed">
                Số phút trước khi sự kiện kết thúc mà người dùng mới có thể check-out.
                Giá trị từ 0 đến 600 phút (10 giờ).
              </p>

              <div className="flex items-center gap-4">
                <input
                  type="number"
                  name="minMinutesAfterStart"
                  value={config.minMinutesAfterStart}
                  onChange={handleChange}
                  min="0"
                  max="600"
                  className="w-32 px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-center text-lg font-bold text-slate-900 dark:text-slate-100 shadow-sm transition-all duration-300"
                />
                <span className="text-sm font-bold text-slate-655 dark:text-slate-300">phút trước khi kết thúc</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-slate-400">Gợi ý nhanh:</span>
                {[15, 30, 60, 120].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setConfig(prev => ({ ...prev, minMinutesAfterStart: val }))
                    }
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all duration-300 active:scale-95 ${
                      config.minMinutesAfterStart === val
                        ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-md shadow-orange-500/10'
                        : 'bg-white border border-slate-150 text-slate-600 hover:bg-orange-550 hover:text-orange-600 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-orange-950/20 dark:hover:text-orange-400'
                    }`}
                  >
                    {val} phút
                  </button>
                ))}
              </div>
            </div>

            {/* Info box: giải thích ý nghĩa cấu hình */}
            <div className="bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-5 shadow-sm text-slate-700 dark:text-slate-350 leading-relaxed font-semibold text-xs sm:text-sm">
              <h3 className="font-extrabold text-blue-900 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Hướng dẫn vận hành
              </h3>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0"></span>
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Check-in</strong>: Người dùng có thể check-in trước thời gian bắt đầu sự kiện theo số phút đã cấu hình.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 flex-shrink-0"></span>
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Check-out</strong>: Người dùng chỉ có thể check-out trước thời gian kết thúc sự kiện theo số phút đã cấu hình.
                  </span>
                </li>
                <li className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                  <strong className="text-slate-800 dark:text-slate-200">Ví dụ thực tế:</strong> Sự kiện kết thúc lúc 17:00
                  <ul className="ml-4 mt-1 space-y-1 text-slate-550 dark:text-slate-400 text-xs">
                    <li>• Check-in = 60 phút → Có thể check-in mở từ 13:00</li>
                    <li>• Check-out = 30 phút → Có thể check-out trước 16:30</li>
                  </ul>
                </li>
              </ul>
            </div>

            {/* Save button */}
            <div className="pt-4 flex justify-end border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 text-white rounded-2xl shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/35 transition-all duration-300 active:scale-95 hover:scale-[1.02] font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Events Config */}
      {activeTab === 'events' && (
        <div className="bg-white/70 dark:bg-slate-900/70 border border-white/80 dark:border-slate-800/80 backdrop-blur-md rounded-3xl p-8 max-w-7xl w-full mx-auto shadow-xl hover:shadow-orange-500/5 transition-all duration-500 animate-fade-in-up">
          <div className="mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 mb-2">
              <Settings className="w-6 h-6 text-orange-655" />
              Cấu hình riêng cho từng sự kiện
            </h2>
            <p className="text-xs text-slate-550 dark:text-slate-400 font-semibold leading-relaxed">
              Tùy chỉnh thời gian check-in/check-out cho từng sự kiện cụ thể. Cấu hình riêng sẽ ghi đè lên cấu hình toàn hệ thống.
            </p>
          </div>

          {/* Search and Filter Bar */}
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white/50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800 dark:text-slate-100 font-semibold placeholder-slate-400 dark:placeholder-slate-500 text-sm shadow-sm transition-all duration-300"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => handleStatusFilterChange(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')}
                className="w-full pl-4 pr-10 py-3 bg-white/50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-755 dark:text-slate-200 font-semibold text-sm shadow-sm cursor-pointer transition-all duration-300 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%25236b7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.75rem_center] bg-no-repeat bg-[length:1rem_1rem]"
              >
                <option value="ALL" className="dark:bg-slate-950">Tất cả trạng thái</option>
                <option value="OPEN" className="dark:bg-slate-950">🟢 Đang mở</option>
                <option value="CLOSED" className="dark:bg-slate-950">⚫ Đã đóng</option>
              </select>
            </div>
          </div>

          {/* Events Table */}
          {loadingEvents ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 bg-white/40 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-inner">
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">
                {searchQuery || statusFilter !== 'ALL'
                  ? 'Không tìm thấy sự kiện phù hợp'
                  : 'Chưa có sự kiện nào'}
              </p>
            </div>
          ) : (
            <div className="bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800/80 overflow-hidden shadow-md animate-fade-in-up mt-6 overflow-x-auto" data-event-table>
              <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                <thead className="bg-slate-50/50 dark:bg-slate-950/50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Tên sự kiện
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Thời gian bắt đầu
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Địa điểm
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th scope="col" className="px-6 py-4 text-center text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white/40 dark:bg-slate-900/20 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEvents.map(event => (
                    <tr
                      key={event.eventId}
                      className="hover:bg-slate-50/30 dark:hover:bg-slate-850/30 transition-colors"
                    >
                      {/* Event Title */}
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200 max-w-xs md:max-w-md truncate">
                          {event.title}
                        </div>
                      </td>

                      {/* Start Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-550 dark:text-slate-400">
                          {new Date(event.startTime).toLocaleDateString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>

                      {/* Venue Location */}
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {event.venueLocation ? (
                            <span className="flex items-center gap-1">
                              📍 {event.venueLocation}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-550 italic font-semibold">Chưa có địa điểm</span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2.5 py-1 text-[11px] font-extrabold rounded-full border shadow-sm ${
                            event.status === 'OPEN'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/50'
                              : event.status === 'CLOSED'
                                ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-350 dark:border-slate-700'
                                : event.status === 'CANCELLED'
                                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50'
                                  : 'bg-blue-50 text-blue-755 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50'
                          }`}
                        >
                          {event.status === 'OPEN' && '🟢 Đang mở'}
                          {event.status === 'CLOSED' && '⚫ Đã đóng'}
                          {event.status === 'CANCELLED' && '🔴 Đã hủy'}
                          {!['OPEN', 'CLOSED', 'CANCELLED'].includes(event.status) && event.status}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {event.status === 'OPEN' ? (
                          <button
                            onClick={() =>
                              handleManageEventConfig(event.eventId, event.title)
                            }
                            className="inline-flex items-center gap-1.5 px-4.5 py-2.5 bg-gradient-to-r from-orange-655 via-orange-600 to-orange-500 border border-transparent rounded-xl text-xs font-bold text-white hover:shadow-lg hover:shadow-orange-500/20 transition-all duration-300 active:scale-95 hover:scale-[1.02]"
                            title="Cấu hình Check-in Gate"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Cấu hình
                          </button>
                        ) : (
                          <button
                            disabled
                            className="inline-flex items-center gap-1.5 px-4.5 py-2.5 bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-bold text-slate-400 dark:text-slate-600 cursor-not-allowed"
                            title="Chỉ có thể cấu hình sự kiện đang mở"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Đã đóng
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ✅ NEW: Pagination Component */}
          {!loadingEvents && events.length > 0 && (
            <Pagination
              currentPage={paginationData.currentPage}
              totalPages={paginationData.totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      )}

      {/* Config modal */}
      <EventConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => {
          setIsConfigModalOpen(false)
          setSelectedEventId(0)
          setSelectedEventTitle('')
          // Reload events sau khi đóng modal để cập nhật changes
          fetchEvents(currentPage)
        }}
        eventId={selectedEventId}
        eventTitle={selectedEventTitle}
      />
    </div>
  )
}

