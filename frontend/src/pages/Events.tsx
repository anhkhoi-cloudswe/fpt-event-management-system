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
import { useState, useEffect } from 'react'

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
 * - Load danh sách sự kiện từ BE (/api/events)
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
 * 2) fetchEvents gọi BE lấy danh sách openEvents + closedEvents (hoặc mảng legacy)
 * 3) setEvents -> tính openEvents/upcoming/past để render
 * 4) Click event -> gọi fetchEventDetail -> mở EventDetailModal
 * 5) Staff bấm disable -> mở ConfirmModal -> confirm -> performDisableEvent() -> gọi API disable -> reload danh sách
 * =============================================================================
 */
export default function Events() {
  // Lấy user từ AuthContext
  const { user } = useAuth()

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
   * - Gọi API /api/events
   * - BE có thể trả:
   *   + mảng [] (legacy)
   *   + object {openEvents:[], closedEvents:[]} (new)
   * - Map về eventsArray rồi setEvents
   */
  const fetchEvents = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch('/api/events', {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
      const token = localStorage.getItem('token')

      const response = await fetch(
        `/api/events/detail?id=${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
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

      const token = localStorage.getItem('token')

      // Dùng application/x-www-form-urlencoded nên tạo URLSearchParams
      const body = new URLSearchParams()
      body.append('eventId', String(eventId))

      const res = await fetch('/api/event/disable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
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
    setConfirmMessage('Bạn có chắc chắn muốn vô hiệu hóa (đóng) sự kiện này?')
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

  /**
   * handleCloseModal:
   * - Đóng EventDetailModal
   */
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedEvent(null)
  }

  // ===== Filter chỉ lấy event OPEN và phân loại upcoming/past =====
  const now = new Date()
  const todayStart = startOfDay(now) // đầu ngày hôm nay 00:00

  // Chỉ hiển thị event có status OPEN
  const openEvents = events.filter(e => e.status === 'OPEN')

  // upcomingEvents: event startTime > hôm nay
  const upcomingEvents = openEvents
    .filter(e => isAfter(new Date(e.startTime), todayStart))
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )

  // pastEvents: event startTime <= hôm nay
  const pastEvents = openEvents
    .filter(e => !isAfter(new Date(e.startTime), todayStart))
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    ) // giảm dần: mới nhất lên trước

  // ======================= RENDER UI =======================
  return (
    <div>
      {/* Header + nút toggle view */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Danh sách sự kiện
          </h1>

          {/* Toggle Calendar/List */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'calendar'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <CalendarDays className="w-4 h-4" />
              Lịch
            </button>

            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'list'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <List className="w-4 h-4" />
              Danh sách
            </button>
          </div>
        </div>

        {/* Organizer có quyền tạo event */}
        {isOrganizer && (
          <Link
            to="/dashboard/events/create"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Tạo sự kiện mới
          </Link>
        )}
      </div>

      {/* Loading / Error / Empty / Content */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500">Đang tải...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-red-500">{error}</p>
        </div>
      ) : openEvents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500 text-lg">Chưa có sự kiện đang mở</p>
        </div>
      ) : (
        <>
          {/* ===== Calendar View ===== */}
          {viewMode === 'calendar' && (
            <EventCalendar events={openEvents} onEventClick={handleEventClick} />
          )}

          {/* ===== List View ===== */}
          {viewMode === 'list' && (
            <div className="space-y-12">
              {/* ---------- Upcoming events ---------- */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Sự kiện sắp tới
                </h2>

                {upcomingEvents.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-md p-12 text-center">
                    <p className="text-gray-500">Không có sự kiện sắp tới</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcomingEvents.map(event => (
                      <div
                        key={event.eventId}
                        className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full"
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
                            <h3 className="text-xl font-semibold text-gray-900 flex-1 line-clamp-2 min-h-[3.5rem]">
                              {event.title}
                            </h3>

                            {/* Admin/Organizer/Staff có icon thao tác */}
                            {(isOrganizer || isStaff) && (
                              <div className="flex space-x-2 ml-2 flex-shrink-0">
                                {/* Admin/Organizer được quản lý cấu hình */}
                                {(user?.role === 'ADMIN' || isOrganizer) && (
                                  <button
                                    onClick={() => handleManageConfig(event.eventId, event.title)}
                                    className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                                    title="Quản lý Check-in Gate"
                                  >
                                    <Settings size={18} />
                                  </button>
                                )}

                                {/* Organizer được edit */}
                                {isOrganizer && (
                                  <Link
                                    to={`/dashboard/events/${event.eventId}/edit`}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    title="Chỉnh sửa"
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
                                    title="Xóa"
                                    disabled={disablingIds.includes(event.eventId)}
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Mô tả */}
                          <p className="text-gray-600 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
                            {event.description}
                          </p>

                          {/* Thông tin ngày/địa điểm/số chỗ */}
                          <div className="space-y-2 mb-4 flex-grow">
                            <div className="flex items-center text-sm text-gray-600">
                              <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                              {format(new Date(event.startTime), 'dd/MM/yyyy HH:mm', {
                                locale: vi
                              })}
                            </div>

                            <div className="flex items-center text-sm text-gray-600">
                              <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="line-clamp-1">
                                {event.venueLocation || event.location || 'Chưa xác định'}
                              </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-600">
                              <Users className="w-4 h-4 mr-2 flex-shrink-0" />
                              {event.maxSeats} chỗ
                            </div>
                          </div>

                          {/* Footer: badge trạng thái + nút xem chi tiết */}
                          <div className="mt-auto">
                            <div className="flex items-center justify-between mb-4">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${event.status === 'OPEN'
                                  ? 'bg-green-100 text-green-800'
                                  : event.status === 'CLOSED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                                  }`}
                              >
                                {event.status === 'OPEN'
                                  ? 'Đang mở'
                                  : event.status === 'CLOSED'
                                    ? 'Đã đóng'
                                    : event.status}
                              </span>
                            </div>

                            <button
                              onClick={() => handleEventClick(event)}
                              className="w-full text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Xem chi tiết
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
                    Sự kiện đã qua
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
                                    title="Quản lý Check-in Gate"
                                    disabled
                                  >
                                    <Settings size={18} />
                                  </button>
                                )}
                                {isOrganizer && (
                                  <Link
                                    to={`/dashboard/events/${event.eventId}/edit`}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                    title="Chỉnh sửa"
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
                                    title="Xóa"
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
                                {event.venueLocation || event.location || 'Chưa xác định'}
                              </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-500">
                              <Users className="w-4 h-4 mr-2 flex-shrink-0" />
                              {event.maxSeats} chỗ
                            </div>
                          </div>

                          {/* Footer: đã kết thúc + disable nút xem chi tiết */}
                          <div className="mt-auto">
                            <div className="flex items-center justify-between mb-4">
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                                Đã kết thúc
                              </span>
                            </div>

                            <button
                              onClick={() => handleEventClick(event)}
                              className="w-full text-center bg-gray-400 text-white py-2 rounded-lg opacity-50 cursor-not-allowed"
                              disabled
                            >
                              Xem chi tiết
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
        token={localStorage.getItem('token')}
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
