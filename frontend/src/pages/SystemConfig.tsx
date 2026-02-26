import { useState, useEffect } from 'react'
import { Settings, Save, RefreshCw, Search } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { EventConfigModal } from '../components/events/EventConfigModal'

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
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null

  /**
   * useEffect: chạy khi component mount hoặc khi token thay đổi
   * → gọi API để lấy cấu hình hệ thống hiện tại từ backend
   * ✅ Updated: Dùng API mới /api/events/config?eventId=-1
   */
  useEffect(() => {
    const fetchConfig = async () => {
      // Nếu không có token thì không gọi API
      if (!token) return

      setLoading(true)
      setError(null)

      try {
        // ✅ NEW API: GET /api/events/config?eventId=-1 (global config)
        const res = await fetch('/api/events/config?eventId=-1', {
          headers: {
            Authorization: `Bearer ${token}`,
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
  }, [token])

  /**
   * fetchEvents:
   * - Lấy danh sách events để Admin có thể cấu hình từng event
   */
  const fetchEvents = async () => {
    if (!token) return

    setLoadingEvents(true)
    try {
      const response = await fetch('/api/events', {
        headers: {
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': '1'
        },
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()

        // Handle both array (legacy) and object structure (new API)
        const eventsArray = Array.isArray(data)
          ? data
          : [
            ...(Array.isArray(data.openEvents) ? data.openEvents : []),
            ...(Array.isArray(data.closedEvents) ? data.closedEvents : [])
          ]

        setEvents(eventsArray)
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
   */
  useEffect(() => {
    if (!loading && token) {
      fetchEvents()
    }
  }, [loading, token])

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
    if (!token) return

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
          Authorization: `Bearer ${token}`,
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
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/events/config?eventId=-1', {
        headers: {
          Authorization: `Bearer ${token}`,
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

  /**
   * UI loading khi đang fetch config
   */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
          <p className="text-gray-500">Đang tải cấu hình...</p>
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
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="flex border-b border-gray-200">
          {/* Tab 1: System Config - ✅ Only show for ADMIN */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('system')}
              className={`flex-1 px-6 py-4 font-medium transition-all ${activeTab === 'system'
                  ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50'
                  : 'text-gray-600 hover:text-gray-900 bg-white'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Settings className="w-5 h-5" />
                Cấu hình hệ thống
              </div>
            </button>
          )}

          {/* Tab 2: Events Config */}
          <button
            onClick={() => setActiveTab('events')}
            className={`flex-1 px-6 py-4 font-medium transition-all ${activeTab === 'events'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900 bg-white'
              }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Settings className="w-5 h-5" />
              Cấu hình sự kiện
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content: System Config - ✅ Only show for ADMIN */}
      {isAdmin && activeTab === 'system' && (
        <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl w-full mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="w-8 h-8 text-orange-600" />
              Cấu hình hệ thống
            </h1>

            {/* Nút reload config */}
            <button
              onClick={handleReload}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
              title="Tải lại cấu hình"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Hiển thị lỗi nếu có */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* checkinAllowedBeforeStartMinutes - Check-in */}
            <div className="border border-green-200 bg-green-50/30 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <label className="block text-lg font-semibold text-gray-900">
                  Thời gian cho phép Check-in trước sự kiện (phút)
                </label>
              </div>

              <p className="text-sm text-gray-500 mb-4">
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
                  className="w-32 px-4 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-center text-lg font-medium"
                />
                <span className="text-gray-600">phút trước khi bắt đầu</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-400">Gợi ý:</span>
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
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${config.checkinAllowedBeforeStartMinutes === val
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600'
                      }`}
                  >
                    {val} phút
                  </button>
                ))}
              </div>
            </div>

            {/* minMinutesAfterStart - Check-out */}
            <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <label className="block text-lg font-semibold text-gray-900">
                  Thời gian tối thiểu sau khi sự kiện bắt đầu để Check-out (phút)
                </label>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Số phút tối thiểu sau khi sự kiện bắt đầu mà người dùng mới có thể
                check-out. Giá trị từ 0 đến 600 phút (10 giờ).
              </p>

              <div className="flex items-center gap-4">
                <input
                  type="number"
                  name="minMinutesAfterStart"
                  value={config.minMinutesAfterStart}
                  onChange={handleChange}
                  min="0"
                  max="600"
                  className="w-32 px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center text-lg font-medium"
                />
                <span className="text-gray-600">phút sau khi bắt đầu</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-400">Gợi ý:</span>
                {[15, 30, 60, 120].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setConfig(prev => ({ ...prev, minMinutesAfterStart: val }))
                    }
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${config.minMinutesAfterStart === val
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-purple-100 hover:text-purple-600'
                      }`}
                  >
                    {val} phút
                  </button>
                ))}
              </div>
            </div>

            {/* Info box: giải thích ý nghĩa cấu hình */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">Hướng dẫn</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></span>
                  <span>
                    <strong>Check-in</strong>: Người dùng có thể check-in trước
                    thời gian bắt đầu sự kiện theo số phút đã cấu hình
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"></span>
                  <span>
                    <strong>Check-out</strong>: Người dùng chỉ có thể check-out
                    sau khi sự kiện đã bắt đầu được số phút đã cấu hình
                  </span>
                </li>
                <li className="mt-2 pt-2 border-t border-blue-200">
                  <strong>Ví dụ:</strong> Sự kiện bắt đầu lúc 14:00
                  <ul className="ml-4 mt-1">
                    <li>• Check-in = 60 phút → Có thể check-in từ 13:00</li>
                    <li>• Check-out = 30 phút → Có thể check-out từ 14:30</li>
                  </ul>
                </li>
              </ul>
            </div>

            {/* Save button */}
            <div className="pt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
              >
                <Save className="w-5 h-5 mr-2" />
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Events Config */}
      {activeTab === 'events' && (
        <div className="bg-white rounded-lg shadow-md p-8 max-w-7xl w-full mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3 mb-2">
              <Settings className="w-7 h-7 text-purple-600" />
              Cấu hình riêng cho từng sự kiện
            </h2>
            <p className="text-sm text-gray-500">
              Tùy chỉnh thời gian check-in/check-out cho từng sự kiện cụ thể.
              Cấu hình riêng sẽ ghi đè lên cấu hình toàn hệ thống.
            </p>
          </div>

          {/* Search and Filter Bar */}
          <div className="mb-6 flex gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="OPEN">🟢 Đang mở</option>
              <option value="CLOSED">⚫ Đã đóng</option>
            </select>
          </div>

          {/* Events Table */}
          {loadingEvents ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">
                {searchQuery || statusFilter !== 'ALL'
                  ? 'Không tìm thấy sự kiện phù hợp'
                  : 'Chưa có sự kiện nào'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên sự kiện
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thời gian bắt đầu
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Địa điểm
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEvents.map(event => (
                    <tr
                      key={event.eventId}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* Event Title */}
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {event.title}
                        </div>
                      </td>

                      {/* Start Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
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
                        <div className="text-sm text-gray-500">
                          {event.venueLocation ? (
                            <span className="flex items-center gap-1">
                              📍 {event.venueLocation}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">Chưa có địa điểm</span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${event.status === 'OPEN'
                              ? 'bg-green-100 text-green-800'
                              : event.status === 'CLOSED'
                                ? 'bg-gray-100 text-gray-800'
                                : event.status === 'CANCELLED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
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
                            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                            title="Cấu hình Check-in Gate"
                          >
                            <Settings className="w-4 h-4" />
                            Cấu hình
                          </button>
                        ) : (
                          <button
                            disabled
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-400 rounded-lg cursor-not-allowed font-medium text-sm"
                            title="Chỉ có thể cấu hình sự kiện đang mở"
                          >
                            <Settings className="w-4 h-4" />
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
          fetchEvents()
        }}
        eventId={selectedEventId}
        eventTitle={selectedEventTitle}
      />
    </div>
  )
}
