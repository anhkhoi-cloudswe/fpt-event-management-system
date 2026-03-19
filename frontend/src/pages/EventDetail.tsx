// Import useParams + useNavigate từ react-router-dom
import { useParams, useNavigate } from 'react-router-dom'
// useParams: lấy param trên URL (vd: /dashboard/events/:id -> lấy id)
// useNavigate: điều hướng trang bằng code (programmatically)


// Import AuthContext để lấy user + token (thông tin đăng nhập)
import { useAuth } from '../contexts/AuthContext'
// useAuth: custom hook lấy user (role...) từ context


// Import React hooks
import { useState, useEffect } from 'react'
// useState: lưu state event, loading, error
// useEffect: gọi API lấy detail event khi component mount hoặc khi id đổi


// Import type dữ liệu event detail (để TypeScript check)
import type { EventDetail as EventDetailType } from '../types/event'
// EventDetailType: kiểu dữ liệu chi tiết sự kiện (title, startTime, seat map, ticket types, ...)


// Import EventDetailModal để hiển thị chi tiết event dưới dạng modal
import { EventDetailModal } from '../components/events/EventDetailModal'
// EventDetailModal: component modal popup hiển thị thông tin sự kiện + thao tác (đặt vé/ghế, edit...)


export default function EventDetail() {
  /**
   * useParams() lấy id từ URL
   * Ví dụ route: /dashboard/events/:id
   * URL: /dashboard/events/12
   * => id = "12"
   */
  const { id } = useParams()

  /**
  * Lấy user từ AuthContext
   * user: chứa role (STUDENT, STAFF, ORGANIZER...)
   */
  const { user } = useAuth()

  // DEBUG: Log user object
  console.log('EventDetail - user from useAuth:', user)

  // Hook điều hướng trang
  const navigate = useNavigate()

  // event: lưu dữ liệu chi tiết sự kiện lấy từ API
  const [event, setEvent] = useState<EventDetailType | null>(null)

  // loading: trạng thái đang tải detail event
  const [loading, setLoading] = useState(true)

  // error: lưu lỗi nếu gọi API thất bại
  const [error, setError] = useState<string | null>(null)

  /**
   * isOrganizer:
   * - Nếu user có role ORGANIZER hoặc STAFF -> coi như có quyền quản lý
   * - Dùng để quyết định có show nút Edit trong modal hay không
   */
  const isOrganizer = user?.role === 'ORGANIZER' || user?.role === 'STAFF'

  // ===================== LOAD EVENT DETAILS (GỌI API CHI TIẾT) =====================
  useEffect(() => {
    // fetchEvent: hàm async gọi API lấy event detail
    const fetchEvent = async () => {
      /**
      * Nếu không có id:
       * - không thể gọi API detail
       * - return để tránh lỗi
       */
          if (!id) return

      // bật loading + reset error trước khi gọi API
      setLoading(true)
      setError(null)

      try {
        const refreshToken = sessionStorage.getItem('force-event-detail-refresh')
        const detailUrl = refreshToken
          ? `/api/events/detail?id=${id}&refresh=${encodeURIComponent(refreshToken)}`
          : `/api/events/detail?id=${id}`

        /**
         * Gọi API lấy chi tiết event:
         * - Dùng relative path /api/events/detail?id=... để đi qua Vite proxy
         * - credentials include để gửi HttpOnly cookie cho backend xác thực
         */
        const response = await fetch(
          detailUrl,
          {
            cache: 'no-store',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )

        if (refreshToken) {
          sessionStorage.removeItem('force-event-detail-refresh')
        }

        /**
         * Nếu response không ok (HTTP status 4xx/5xx)
         * -> throw error để nhảy vào catch
         */
        if (!response.ok) {
          throw new Error('Failed to fetch event details')
        }

        // Parse JSON body
        const data = await response.json()

        // Lưu data vào state event để render modal
        setEvent(data)
      } catch (err: any) {
        // Lỗi network / lỗi throw ở trên
        console.error('Error fetching event:', err)

        // setError để UI hiển thị message lỗi
        setError(err.message || 'Không thể tải thông tin sự kiện')
      } finally {
        // Dù thành công hay lỗi cũng tắt loading
        setLoading(false)
      }
    }

    // Gọi fetchEvent khi component mount hoặc khi id/token thay đổi
    fetchEvent()

    // ===== AUTO-REFRESH: Đảm bảo load dữ liệu mới nhất =====
    // Nếu event status thay đổi (vd: Scheduler closed event), user sẽ thấy ngay
    const refreshInterval = setInterval(() => {
      fetchEvent()
    }, 10000) // Refresh mỗi 10 giây

    // Cleanup interval khi component unmount
    return () => clearInterval(refreshInterval)
  }, [id])

  /**
   * handleEdit:
   * - Chạy khi organizer/staff bấm nút edit trong modal
   * - Điều hướng tới trang edit event
   */
  const handleEdit = () => {
    navigate(`/dashboard/events/${id}/edit`)
  }

  /**
   * handleModalClose:
   * - Khi user đóng modal (click X hoặc click overlay tùy modal)
   * - Điều hướng về danh sách event (/dashboard/events)
   */
  const handleModalClose = () => {
    navigate('/dashboard/events')
  }

  /**
   * ===================== RENDER UI =====================
   * Trang EventDetail thực chất:
   * - Là 1 page dùng route /dashboard/events/:id
   * - Nhưng UI chính là hiển thị EventDetailModal luôn ở trạng thái mở (isOpen={true})
   * - Dữ liệu event lấy từ API sẽ truyền vào modal để modal hiển thị
   */
  return (
    // Container full màn hình với nền gradient
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 p-4">
      {/* Giới hạn chiều rộng và căn giữa */}
      <div className="max-w-5xl mx-auto">
        {/* Modal chi tiết sự kiện */}
        <EventDetailModal
          isOpen={true}                 // luôn mở modal (vì đây là trang detail)
          onClose={handleModalClose}    // đóng modal -> về /dashboard/events
          event={event}                 // data event lấy từ API
          loading={loading}             // đang tải event -> modal có thể show skeleton/spinner
          error={error}                 // lỗi -> modal hiển thị message lỗi
          token={null}                  // xác thực hiện tại dùng HttpOnly cookie
          userRole={user?.role}         // render theo role trusted từ AuthContext
          onEdit={isOrganizer ? handleEdit : undefined}
        // nếu organizer/staff -> truyền handleEdit (cho phép nút Edit)
        // nếu student -> undefined (không có quyền edit)
        />
      </div>
    </div>
  )
}
