// Import Link để chuyển trang trong SPA, useNavigate để điều hướng bằng code
import { Link, useNavigate } from 'react-router-dom'

// Lấy thông tin user (role) từ AuthContext
import { useAuth } from '../contexts/AuthContext'

// Import icon dùng trong UI
import {
  Calendar,
  MapPin,
  Users,
  Edit,
  Trash2,
  List,
  CalendarDays,
  Clock,
  Settings
} from 'lucide-react'

// date-fns: format ngày giờ + startOfDay + isAfter để phân loại sự kiện sắp tới/đã qua
import { format, startOfDay, isAfter } from 'date-fns'
import { vi } from 'date-fns/locale'

// React hooks
import { useState, useEffect, useCallback } from 'react'

// Toast để hiện thông báo
import { useToast } from '../contexts/ToastContext'

// Modal xác nhận (xóa/disable event)
import ConfirmModal from '../components/common/ConfirmModal'

// Calendar component hiển thị event theo lịch
import { EventCalendar } from '../components/events/EventCalendar'

// Modal xem chi tiết event
import { EventDetailModal } from '../components/events/EventDetailModal'

// Modal cấu hình check-in/check-out cho từng event
import { EventConfigModal } from '../components/events/EventConfigModal'

// Type định nghĩa dữ liệu event list và event detail
import type { EventListItem, EventDetail } from '../types/event'

// Kiểu hiển thị: list hoặc calendar
type ViewMode = 'list' | 'calendar'

/**
 * =============================================================================
 * EVENTS PAGE - Trang danh sách sự kiện (cho Organizer/Staff)
 * =============================================================================
 *
 * Chức năng chính:
 * - Load danh sách sự kiện từ BE (/api/events) với pagination
 * - Chỉ hiển thị các event đang OPEN (đang mở)
 * - Cho người dùng xem theo 2 chế độ:
 *   1) Calendar view: hiển thị trên lịch
 *   2) List view: hiển thị dạng card theo nhóm
 *      - Sự kiện sắp tới (startTime > hôm nay)
 *      - Sự kiện đã qua (startTime <= hôm nay)
 *
 * Quyền theo role:
 * - Organizer: có nút "Tạo sự kiện mới", có thể bấm Edit sự kiện
 * - Staff: có thể "vô hiệu hóa/đóng" sự kiện (disable) → gọi API /api/event/disable
 *
 * Luồng hoạt động:
 * 1) Mount component → useEffect gọi fetchEvents()
 * 2) fetchEvents gọi BE lấy danh sách events phân trang (data[])
 * 3) setEvents -> tính openEvents/upcoming/past để render
 * 4) Click event -> gọi fetchEventDetail -> mở EventDetailModal
 * 5) Staff bấm disable -> mở ConfirmModal -> confirm -> performDisableEvent() -> gọi API disable -> reload danh sách
 * =============================================================================
 */
export default function Events() {
  // Lấy user từ AuthContext
  const { user, currentLanguage } = useAuth()

  // Hook điều hướng
  const navigate = useNavigate()

  // Role check
  const isOrganizer = user?.role === 'ORGANIZER'
  const isStaff = user?.role === 'STAFF'

  // viewMode mặc định là "calendar"
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')

  // events: danh sách event list
  const [events, setEvents] = useState<EventListItem[]>([])

  // loading và error để render UI trạng thái
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // selectedEvent: data chi tiết event để đưa vào modal
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null)

  // isModalOpen: điều khiển modal event detail
  const [isModalOpen, setIsModalOpen] = useState(false)

  // loadingDetail: trạng thái loading khi gọi API chi tiết event
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Toast để show thông báo
  const { showToast } = useToast()

  // disablingIds: lưu danh sách eventId đang disable để disable nút (tránh double click)
  const [disablingIds, setDisablingIds] = useState<number[]>([])

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  // Config modal state
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<number>(0)
  const [selectedEventTitle, setSelectedEventTitle] = useState<string>('')

  /**
   * useEffect chạy 1 lần khi component mount
   * → gọi fetchEvents để lấy danh sách sự kiện
   */
  useEffect(() => {
    fetchEvents()
  }, [])

  /**
   * fetchEvents:
   * - Lấy token từ localStorage
   * - Gọi API /api/events với pagination
   * - BE trả: { data: [...], total, page, limit, totalPages }
   */
  const fetchEvents = async () => {
    try {
      const queryParams = new URLSearchParams({
        page: '1',
        limit: '100'
      })

      const response = await fetch(`/api/events?${queryParams.toString()}`, {
        headers: {
          'Content-Type': 'application/json'
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
      } else {
        throw new Error('Failed to fetch events')
      }
    } catch (error) {
      console.error('Error fetching events:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }

  /**
   * fetchEventDetail:
   * - Gọi API /api/events/detail?id=...
   * - Thành công -> setSelectedEvent + open modal
   */
  const fetchEventDetail = async (eventId: number) => {
    setLoadingDetail(true)
    try {
      const response = await fetch(
        `/api/events/detail?id=${eventId}`,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        }
      )

      if (response.ok) {
        const data = await response.json()
        setSelectedEvent(data)
        setIsModalOpen(true)
      } else {
        throw new Error('Failed to fetch event details')
      }
    } catch (error) {
      console.error('Error fetching event details:', error)
    } finally {
      setLoadingDetail(false)
    }
  }

  /**
   * handleEventClick:
   * - Khi user click event (ở calendar hoặc list)
   * - Gọi fetchEventDetail để mở modal
   */
  const handleEventClick = (event: EventListItem) => {
    fetchEventDetail(event.eventId)
  }

  /**
   * performDisableEvent:
   * - Gọi API /api/event/disable để vô hiệu hóa (đóng) event
   * - Có dùng disablingIds để chặn bấm nhiều lần
   * - Sau khi disable thành công -> reload list bằng fetchEvents()
   * - Có xử lý mã lỗi:
   *   + 409: đã có vé -> không cho disable
   *   + 404: event không tồn tại
   */
  const performDisableEvent = async (eventId: number) => {
    try {
      // Thêm eventId vào list disabling để UI disable nút
      setDisablingIds(prev => [...prev, eventId])

      const res = await fetch('/api/event/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ eventId: Number(eventId) })
      })

      // Thử đọc JSON response (nếu BE trả JSON)
      let payload: any = null
      try {
        payload = await res.json()
      } catch (e) {
        payload = null
      }

      // Xử lý status
      if (res.ok) {
        showToast('success', payload?.message || 'Vô hiệu hóa event thành công')
        await fetchEvents()
      } else if (res.status === 409) {
        showToast('error', payload?.message || 'Không thể vô hiệu hóa: đã có vé')
      } else if (res.status === 404) {
        showToast('error', payload?.message || 'Event không tồn tại')
      } else {
        showToast('error', payload?.message || 'Lỗi khi vô hiệu hóa event')
      }
    } catch (error) {
      console.error('Disable event error', error)
      showToast('error', error instanceof Error ? error.message : 'Lỗi hệ thống')
    } finally {
      // Xóa eventId khỏi disablingIds khi xong
      setDisablingIds(prev => prev.filter(id => id !== eventId))

      // Đóng confirm modal
      setConfirmOpen(false)
      setConfirmAction(null)
    }
  }

  /**
   * handleDisableEvent:
   * - Khi staff bấm icon thùng rác
   * - Mở ConfirmModal
   * - Nếu confirm thì chạy performDisableEvent(eventId)
   */
  const handleDisableEvent = (eventId: number) => {
    setConfirmMessage(
      currentLanguage === 'en'
        ? 'Are you sure you want to disable (close) this event?'
        : 'Bạn có chắc chắn muốn vô hiệu hóa (đóng) sự kiện này?'
    )
    setConfirmAction(() => () => performDisableEvent(eventId))
    setConfirmOpen(true)
  }

  /**
   * handleManageConfig:
   * - Khi admin/organizer bấm icon Settings
   * - Mở EventConfigModal để cấu hình check-in/check-out
   */
  const handleManageConfig = (eventId: number, eventTitle: string) => {
    setSelectedEventId(eventId)
    setSelectedEventTitle(eventTitle)
    setIsConfigModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedEvent(null)
  }

  const getCountdownText = useCallback((startTimeStr: string) => {
    try {
      const start = new Date(startTimeStr)
      const now = new Date()
      const diffMs = start.getTime() - now.getTime()

      if (diffMs <= 0) return null

      const diffMins = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays > 0) {
        return currentLanguage === 'en'
          ? `${diffDays} day${diffDays > 1 ? 's' : ''} left`
          : `Còn ${diffDays} ngày`
      } else if (diffHours > 0) {
        return currentLanguage === 'en'
          ? `Starts in ${diffHours} hour${diffHours > 1 ? 's' : ''}`
          : `Bắt đầu sau ${diffHours} giờ`
      } else if (diffMins > 0) {
        return currentLanguage === 'en'
          ? `Starts in ${diffMins} min${diffMins > 1 ? 's' : ''}`
          : `Bắt đầu sau ${diffMins} phút`
      }
      return null
    } catch (e) {
      return null
    }
  }, [currentLanguage])

  // ===== Filter chỉ lấy các sự kiện đang OPEN và chưa kết thúc =====
  const nowTime = new Date().getTime()

  // openEvents: Chỉ lấy các sự kiện có status là OPEN và chưa qua endTime
  const openEvents = events.filter(
    e => e.status === 'OPEN' && new Date(e.endTime).getTime() > nowTime
  )

  // upcomingEvents: Sắp xếp các sự kiện đang mở theo thời gian bắt đầu
  const upcomingEvents = [...openEvents].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  // pastEvents: Trống vì không hiển thị sự kiện đã kết thúc/hủy ở đây nữa
  const pastEvents: EventListItem[] = []

  // ======================= RENDER UI =======================
  return (
    <div>
      {/* Header + nút toggle view */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-4xl">
            {currentLanguage === 'en' ? 'Event List' : 'Danh sách sự kiện'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl font-medium">
            {currentLanguage === 'en' ? 'Explore and participate in events, scientific seminars, and extracurricular activities at FPT University.' : 'Khám phá và tham gia các sự kiện, hội thảo khoa học và hoạt động ngoại khóa tại trường FPT.'}
          </p>

          {/* Toggle Calendar/List */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 shadow-inner border border-slate-200/40 dark:border-slate-700/30 w-fit mt-4">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${viewMode === 'calendar'
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-800'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <CalendarDays className="w-4 h-4" />
              {currentLanguage === 'en' ? 'Calendar' : 'Lịch'}
            </button>

            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${viewMode === 'list'
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-800'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <List className="w-4 h-4" />
              {currentLanguage === 'en' ? 'List' : 'Danh sách'}
            </button>
          </div>
        </div>

        {/* Organizer có quyền tạo event */}
        {isOrganizer && (
          <Link
            to="/dashboard/events/create"
            className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-md hover:shadow-lg active:scale-95 transition-all"
          >
            {currentLanguage === 'en' ? 'Create New Event' : 'Tạo sự kiện mới'}
          </Link>
        )}
      </div>

      {/* Loading / Error / Empty / Content */}
      {loading ? (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-16 text-center shadow-md animate-fade-in-up">
<p className="text-slate-500 dark:text-slate-400 text-sm font-bold animate-pulse">{currentLanguage === 'en' ? 'Loading event list...' : 'Đang tải danh sách sự kiện...'}</p>
        </div>
      ) : error ? (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-rose-100 dark:border-rose-950/20 p-16 text-center shadow-md animate-fade-in-up">
          <p className="text-rose-600 dark:text-rose-450 text-sm font-extrabold">{currentLanguage === 'en' ? 'An error occurred: ' : 'Đã xảy ra lỗi: '}{error}</p>
        </div>
      ) : openEvents.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-16 text-center shadow-md animate-fade-in-up">
          <div className="p-4 bg-orange-50 dark:bg-orange-950/20 text-orange-500 dark:text-orange-350 rounded-full w-fit mx-auto mb-4 border border-orange-100/50 dark:border-orange-900/30">
            <CalendarDays className="w-12 h-12" />
          </div>
<h3 className="text-lg font-black text-slate-800 dark:text-white">{currentLanguage === 'en' ? 'No open events' : 'Chưa có sự kiện đang mở'}</h3>
          <p className="text-sm text-slate-400 dark:text-slate-450 mt-2 max-w-sm mx-auto font-medium">
            {currentLanguage === 'en' ? 'There are currently no public events open for registration. Please check back later.' : 'Hiện tại không có sự kiện công khai nào đang mở đăng ký vé. Vui lòng quay lại sau.'}
          </p>
        </div>
      ) : (
        <>
          {/* ===== Calendar View ===== */}
          {viewMode === 'calendar' && (
            <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-6 shadow-md overflow-hidden animate-fade-in-up">
              <EventCalendar events={openEvents} onEventClick={handleEventClick} />
            </div>
          )}

          {/* ===== List View ===== */}
          {viewMode === 'list' && (
            <div className="space-y-12 animate-fade-in-up">
              {/* ---------- Upcoming events ---------- */}
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6 pl-1 tracking-tight">
                  {currentLanguage === 'en' ? 'Upcoming Events' : 'Sự kiện sắp tới'}
                </h2>

                {upcomingEvents.length === 0 ? (
                  <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-12 text-center shadow-md animate-fade-in-up">
<p className="text-slate-500 dark:text-slate-400 text-sm font-bold">{currentLanguage === 'en' ? 'No upcoming events' : 'Không có sự kiện sắp tới nào'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcomingEvents.map(event => (
                      <div
                        key={event.eventId}
                        className="bg-white dark:bg-slate-900 border border-white/80 dark:border-slate-800/80 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full"
                      >
                        {/* Banner */}
                        {event.bannerUrl && (
                          <img
                            src={event.bannerUrl}
                            alt={event.title}
                            className="w-full h-48 object-cover"
                          />
                        )}

                        {/* Content */}
                        <div className="p-6 flex flex-col flex-grow">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex-1 line-clamp-2 min-h-[3.5rem]">
                              {event.title}
                            </h3>

                            {/* Admin/Organizer/Staff có icon thao tác */}
                            {(isOrganizer || isStaff) && (
                              <div className="flex space-x-2 ml-2 flex-shrink-0">
                                {/* Admin/Organizer được quản lý cấu hình */}
                                {(user?.role === 'ADMIN' || isOrganizer) && (
                                  <button
                                    onClick={() => handleManageConfig(event.eventId, event.title)}
                                    className="p-1 text-purple-650 hover:bg-purple-50 rounded"
                                    title={currentLanguage === 'en' ? 'Manage Check-in Gate' : 'Quản lý Check-in Gate'}
                                  >
                                    <Settings size={18} />
                                  </button>
                                )}

                                {/* Organizer được edit */}
                                {isOrganizer && (
                                  <Link
                                    to={`/dashboard/events/${event.eventId}/edit`}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    title={currentLanguage === 'en' ? 'Edit' : 'Chỉnh sửa'}
                                  >
                                    <Edit size={18} />
                                  </Link>
                                )}

                                {/* Staff được disable */}
                                {isStaff && (
                                  <button
                                    onClick={() => handleDisableEvent(event.eventId)}
                                    className={`p-1 ${disablingIds.includes(event.eventId)
                                      ? 'text-gray-400'
                                      : 'text-red-600 hover:bg-red-50'
                                      } rounded`}
                                    title={currentLanguage === 'en' ? 'Delete' : 'Xóa'}
                                    disabled={disablingIds.includes(event.eventId)}
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Mô tả */}
                          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
                            {event.description}
                          </p>

                          {/* Thông tin ngày/địa điểm/số chỗ */}
                          <div className="space-y-2 mb-4 flex-grow">
                            <div className="flex items-center text-sm text-gray-650 dark:text-gray-350">
                              <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                              {format(new Date(event.startTime), 'dd/MM/yyyy HH:mm', {
                                locale: vi
                              })}
                            </div>

                            <div className="flex items-center text-sm text-gray-650 dark:text-gray-350">
                              <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="line-clamp-1">
{event.venueLocation || event.location || (currentLanguage === 'en' ? 'TBD' : 'Chưa xác định')}
                              </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-650 dark:text-gray-350">
                              <Users className="w-4 h-4 mr-2 flex-shrink-0" />
{event.maxSeats} {currentLanguage === 'en' ? 'seats' : 'chỗ'}
                            </div>
                          </div>

                          {/* Footer: badge trạng thái + nút xem chi tiết */}
                          <div className="mt-auto">
                            <div className="flex items-center justify-between mb-4">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${event.status === 'OPEN'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300'
                                  : event.status === 'CLOSED'
                                    ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                    : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-300'
                                  }`}
                              >
                                {event.status === 'OPEN'
                                  ? (currentLanguage === 'en' ? 'Open' : 'Đang mở')
                                  : event.status === 'CLOSED'
                                    ? (currentLanguage === 'en' ? 'Closed' : 'Đã đóng')
                                    : event.status}
                              </span>

                              {event.status === 'OPEN' && getCountdownText(event.startTime) && (
                                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse flex items-center gap-1">
                                  ⏱️ {getCountdownText(event.startTime)}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => handleEventClick(event)}
                              className="w-full text-center bg-blue-600 dark:bg-orange-600 hover:bg-blue-700 dark:hover:bg-orange-500 text-white py-2 rounded-lg transition-colors font-bold"
                            >
                              {currentLanguage === 'en' ? 'View details' : 'Xem chi tiết'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---------- Past events ---------- */}
              {pastEvents.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-500 mb-6 flex items-center">
                    <Clock className="w-6 h-6 mr-2" />
                    {currentLanguage === 'en' ? 'Past Events' : 'Sự kiện đã qua'}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pastEvents.map(event => (
                      <div
                        key={event.eventId}
                        className="bg-gray-50 rounded-lg shadow-sm overflow-hidden opacity-75 hover:opacity-90 transition-opacity flex flex-col h-full"
                      >
                        {event.bannerUrl && (
                          <img
                            src={event.bannerUrl}
                            alt={event.title}
                            className="w-full h-48 object-cover"
                          />
                        )}

                        <div className="p-6 flex flex-col flex-grow">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-xl font-semibold text-gray-600 flex-1 line-clamp-2 min-h-[3.5rem]">
                              {event.title}
                            </h3>

                            {/* Icon thao tác: vẫn render nhưng style nhạt */}
                            {(isOrganizer || isStaff) && (
                              <div className="flex space-x-2 ml-2 flex-shrink-0">
                                {(user?.role === 'ADMIN' || isOrganizer) && (
                                  <button
                                    onClick={() => handleManageConfig(event.eventId, event.title)}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                    title={currentLanguage === 'en' ? 'Manage Check-in Gate' : 'Quản lý Check-in Gate'}
                                    disabled
                                  >
                                    <Settings size={18} />
                                  </button>
                                )}
                                {isOrganizer && (
                                  <Link
                                    to={`/dashboard/events/${event.eventId}/edit`}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                    title={currentLanguage === 'en' ? 'Edit' : 'Chỉnh sửa'}
                                  >
                                    <Edit size={18} />
                                  </Link>
                                )}
                                {isStaff && (
                                  <button
                                    onClick={() => handleDisableEvent(event.eventId)}
                                    className={`p-1 ${disablingIds.includes(event.eventId)
                                      ? 'text-gray-400'
                                      : 'text-gray-400 hover:bg-gray-100'
                                      } rounded`}
                                    title={currentLanguage === 'en' ? 'Delete' : 'Xóa'}
                                    disabled={disablingIds.includes(event.eventId)}
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Mô tả */}
                          <p className="text-gray-500 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
                            {event.description}
                          </p>

                          {/* Info */}
                          <div className="space-y-2 mb-4 flex-grow">
                            <div className="flex items-center text-sm text-gray-500">
                              <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                              {format(new Date(event.startTime), 'dd/MM/yyyy HH:mm', {
                                locale: vi
                              })}
                            </div>

                            <div className="flex items-center text-sm text-gray-500">
                              <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="line-clamp-1">
{event.venueLocation || event.location || (currentLanguage === 'en' ? 'TBD' : 'Chưa xác định')}
                              </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-500">
                              <Users className="w-4 h-4 mr-2 flex-shrink-0" />
{event.maxSeats} {currentLanguage === 'en' ? 'seats' : 'chỗ'}
                            </div>
                          </div>

                          {/* Footer: đã kết thúc + disable nút xem chi tiết */}
                          <div className="mt-auto">
                            <div className="flex items-center justify-between mb-4">
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                                {currentLanguage === 'en' ? 'Ended' : 'Đã kết thúc'}
                              </span>
                            </div>

                            <button
                              onClick={() => handleEventClick(event)}
                              className="w-full text-center bg-gray-400 text-white py-2 rounded-lg opacity-50 cursor-not-allowed"
                              disabled
                            >
                              {currentLanguage === 'en' ? 'View details' : 'Xem chi tiết'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal chi tiết event */}
      <EventDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        event={selectedEvent}
        loading={loadingDetail}
        error={null}
        userRole={user?.role}        // truyền role để ẩn chọn ghế cho ORGANIZER/STAFF/ADMIN
      />

      {/* Confirm modal xác nhận vô hiệu hóa event */}
      <ConfirmModal
        isOpen={confirmOpen}
        message={confirmMessage}
        onConfirm={() => confirmAction && confirmAction()}
        onClose={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
      />

      {/* Config modal - cấu hình check-in/check-out */}
      <EventConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => {
          setIsConfigModalOpen(false)
          setSelectedEventId(0)
          setSelectedEventTitle('')
        }}
        eventId={selectedEventId}
        eventTitle={selectedEventTitle}
      />
    </div>
  )
}
