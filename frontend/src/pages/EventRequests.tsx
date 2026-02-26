// Import Link để chuyển trang trong SPA, useNavigate để điều hướng bằng code
import { Link, useNavigate } from 'react-router-dom'

// Lấy thông tin user đăng nhập (role) từ AuthContext
import { useAuth } from '../contexts/AuthContext'

// ToastContext để hiển thị thông báo (success/error/warning)
import { useToast } from '../contexts/ToastContext'

// Import icon để hiển thị UI đẹp hơn
import { CheckCircle2, XCircle, FileClock, PlusCircle, Edit } from 'lucide-react'

// useEffect để gọi API khi component mount / khi dependencies thay đổi
// useState để quản lý state dữ liệu
import { useEffect, useState } from 'react'

// Modal xem chi tiết request
import { EventRequestDetailModal } from '../components/events/EventRequestDetailModal'

// Modal xử lý request (Approve/Reject + chọn area + note)
import { ProcessRequestModal } from '../components/events/ProcessRequestModal'

/**
 * Enum kiểu trạng thái yêu cầu tổ chức sự kiện
 * - PENDING: chờ duyệt
 * - APPROVED: đã duyệt
 * - REJECTED: bị từ chối
 * - UPDATING: đã duyệt nhưng còn thiếu thông tin (VD banner) → yêu cầu organizer cập nhật
 * - CANCELLED: đã hủy
 * - EXPIRED: hết hạn (nếu có nghiệp vụ)
 */
type EventRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'UPDATING'
  | 'CANCELLED'
  | 'EXPIRED'

/**
 * Kiểu dữ liệu EventRequest (map theo BE trả về)
 * Lưu ý: có nhiều field optional vì có thể BE không luôn trả đủ
 */
type EventRequest = {
  requestId: number
  requesterId: number
  requesterName?: string
  title: string
  description: string
  preferredStartTime: string
  preferredEndTime: string
  expectedCapacity: number
  status: EventRequestStatus
  createdAt: string
  processedBy?: number
  processedByName?: string
  processedAt?: string
  organizerNote?: string
  createdEventId?: number
  bannerUrl?: string
}

/**
 * getStatusLabel:
 * Chuyển status code -> text tiếng Việt để hiển thị UI
 */
const getStatusLabel = (status: EventRequestStatus) => {
  switch (status) {
    case 'APPROVED':
      return 'Hoàn Thành'
    case 'REJECTED':
      return 'Bị từ chối'
    case 'UPDATING':
      return 'Chờ Cập Nhật Thông Tin'
    case 'CANCELLED':
      return 'Đã hủy'
    case 'EXPIRED':
      return 'Hết hạn'
    default:
      return 'Đang chờ duyệt'
  }
}

/**
 * getStatusClass:
 * Trả về class Tailwind khác nhau theo trạng thái
 * -> màu badge trạng thái
 */
const getStatusClass = (status: EventRequestStatus) => {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-800'
    case 'REJECTED':
      return 'bg-red-100 text-red-800'
    case 'UPDATING':
      return 'bg-blue-100 text-blue-800'
    case 'CANCELLED':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

/**
 * =============================================================================
 * EVENT REQUESTS PAGE - Trang quản lý yêu cầu tổ chức sự kiện
 * =============================================================================
 *
 * Trang này phục vụ 2 role:
 *
 * 1) STAFF:
 *  - Xem tất cả event request của sinh viên/organizer gửi lên
 *  - Tab "Chờ": gồm PENDING + UPDATING
 *  - Tab "Đã xử lý": gồm APPROVED + REJECTED
 *  - Có thể Approve / Reject request ở tab "Chờ"
 *
 * 2) ORGANIZER:
 *  - Chỉ xem request của chính mình (endpoint /my)
 *  - Có thể tạo request mới (nút "Gửi yêu cầu mới")
 *  - Nếu request ở trạng thái UPDATING thì có thể bấm sửa event (onEdit)
 *
 * Flow:
 * A) Vào trang -> useEffect gọi fetchEventRequests()
 * B) fetchEventRequests:
 *   - Gọi API lấy request list (staff/all hoặc organizer/my)
 *   - Gọi thêm API /events để lấy bannerUrl event (để check thiếu banner)
 *   - Nếu request APPROVED mà event chưa có banner -> đổi status thành UPDATING
 *   - Chia danh sách thành waitingRequests và processedRequests
 * C) User click 1 row -> mở modal EventRequestDetailModal xem chi tiết
 * D) Staff click Approve/Reject -> mở ProcessRequestModal -> submit -> gọi API process
 * =============================================================================
 */
export default function EventRequests() {
  // Lấy user từ AuthContext để check role
  const { user } = useAuth()

  // showToast dùng để hiển thị thông báo
  const { showToast } = useToast()

  // navigate để chuyển trang bằng code
  const navigate = useNavigate()

  // Role check
  const isStaff = user?.role === 'STAFF'
  const isOrganizer = user?.role === 'ORGANIZER'

  // requests: danh sách request tổng (có thể dùng cho fallback)
  const [requests, setRequests] = useState<EventRequest[]>([])

  // waitingRequests: danh sách request đang chờ (PENDING + UPDATING)
  const [waitingRequests, setWaitingRequests] = useState<EventRequest[]>([])

  // processedRequests: danh sách request đã xử lý (APPROVED + REJECTED)
  const [processedRequests, setProcessedRequests] = useState<EventRequest[]>([])

  // loading + error cho UI
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // selectedRequest: request đang được chọn để xem modal detail
  const [selectedRequest, setSelectedRequest] = useState<EventRequest | null>(
    null,
  )

  // isModalOpen: điều khiển mở/đóng modal detail
  const [isModalOpen, setIsModalOpen] = useState(false)

  // isProcessModalOpen: điều khiển mở/đóng modal approve/reject
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false)

  // processAction: action staff chọn (APPROVE hoặc REJECT)
  const [processAction, setProcessAction] = useState<'APPROVE' | 'REJECT'>(
    'APPROVE',
  )

  // requestToProcess: request staff đang chuẩn bị xử lý trong ProcessRequestModal
  const [requestToProcess, setRequestToProcess] = useState<EventRequest | null>(
    null,
  )

  // activeTab: tab đang chọn (waiting / processed)
  const [activeTab, setActiveTab] = useState<'waiting' | 'processed'>('waiting')

  // Cancel event modal states (for Organizer)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [eventToCancel, setEventToCancel] = useState<EventRequest | null>(null)

  /**
   * useEffect:
   * Khi vào trang hoặc khi role thay đổi (staff/organizer)
   * -> gọi fetchEventRequests để load dữ liệu
   */
  useEffect(() => {
    fetchEventRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, isOrganizer])

  /**
   * fetchEventRequests:
   * - Lấy token
   * - Chọn endpoint theo role:
   *   + Staff: /api/staff/event-requests (lấy tất cả)
   *   + Organizer: /api/event-requests/my (lấy của mình)
   * - Sau đó gọi /api/events để lấy bannerUrl của event
   * - Nếu request APPROVED mà event không có banner -> chuyển thành UPDATING
   * - Tách danh sách thành waiting và processed
   */
  const fetchEventRequests = async () => {
    try {
      const token = localStorage.getItem('token')

      // Staff thấy tất cả requests, Organizer chỉ thấy của mình
      const endpoint = isStaff
        ? '/api/staff/event-requests'
        : '/api/event-requests/my'

      // Call API lấy request list
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Event requests data:', data)

        // ===== BƯỚC 2: Fetch events để lấy bannerUrl (mapping eventId -> bannerUrl) =====
        const eventsResponse = await fetch('/api/events', {
          headers: {
            Authorization: `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true',
          },
        })

        let eventsMap = new Map()
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json()

          // BE trả cấu trúc {openEvents:[], closedEvents:[]}
          const allEvents = [
            ...(eventsData.openEvents || []),
            ...(eventsData.closedEvents || []),
          ]

          // Map eventId -> bannerUrl để check thiếu banner
          allEvents.forEach((event: any) => {
            eventsMap.set(event.eventId, event.bannerUrl)
          })
        }

        /**
         * updateRequestStatus:
         * Nếu req.status = APPROVED và có createdEventId:
         *  - lấy bannerUrl của event đó
         *  - attach bannerUrl vào req để modal hiển thị
         *  - CÓ KHÔNG thay đổi status (APPROVED requests phải ở tab "Đã xử lý")
         */
        const updateRequestStatus = (req: EventRequest): EventRequest => {
          if (req.status === 'APPROVED' && req.createdEventId) {
            const bannerUrl = eventsMap.get(req.createdEventId)
            return { ...req, bannerUrl: bannerUrl || undefined }
          }
          return req
        }

        /**
         * BE có thể trả theo 2 kiểu:
         * 1) New structure: { pending: [], approved: [], rejected: [] }
         * 2) Legacy: trả thẳng 1 mảng []
         */
        if (data.pending || data.approved || data.rejected) {
          // New structure
          const pending = Array.isArray(data.pending) ? data.pending : []
          const approved = Array.isArray(data.approved)
            ? data.approved.map(updateRequestStatus)
            : []
          const rejected = Array.isArray(data.rejected) ? data.rejected : []
          const cancelled = Array.isArray(data.cancelled) ? data.cancelled : []

          // Get UPDATING requests separately
          const updating = Array.isArray(data.updating) ? data.updating : []

          // ===== NEW TAB STRUCTURE =====
          // Waiting tab = PENDING + APPROVED + UPDATING (requests that can be updated)
          const waiting = [...pending, ...approved, ...updating]

          // Processed tab = REJECTED + CANCELLED (final decisions, no updates allowed)
          const processed = [...rejected, ...cancelled]

          // Update state để render tab
          setWaitingRequests(waiting)
          setProcessedRequests(processed)

          // requests tổng (nếu cần)
          setRequests([...waiting, ...processed])
        } else if (Array.isArray(data)) {
          // Legacy flat array
          const updatedData = data.map(updateRequestStatus)
          setRequests(updatedData)

          // ===== NEW TAB STRUCTURE - LEGACY PATH =====
          // Waiting tab: PENDING + APPROVED + UPDATING (requests that can be updated)
          setWaitingRequests(
            updatedData.filter(
              (req) => req.status === 'PENDING' || req.status === 'APPROVED' || req.status === 'UPDATING',
            ),
          )

          // Processed tab: REJECTED + CANCELLED (final decisions)
          setProcessedRequests(
            updatedData.filter(
              (req) => req.status === 'REJECTED' || req.status === 'CANCELLED',
            ),
          )
        }
      } else {
        // Nếu response không ok
        throw new Error('Failed to fetch event requests')
      }
    } catch (error) {
      // Lỗi network/BE
      console.error('Error fetching event requests:', error)
      setError(
        error instanceof Error ? error.message : 'Failed to fetch event requests',
      )
    } finally {
      // Dù ok/fail đều tắt loading
      setLoading(false)
    }
  }

  /**
   * Click row -> mở modal xem chi tiết
   */
  const handleViewDetails = (request: EventRequest) => {
    setSelectedRequest(request)
    setIsModalOpen(true)
  }

  /**
   * Đóng modal detail
   */
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedRequest(null)
  }

  /**
   * handleEditEvent:
   * - Chỉ cho phép sửa khi status = UPDATING
   * - Lấy createdEventId để navigate sang trang edit event
   */
  const handleEditEvent = () => {
    if (!selectedRequest) return

    // chỉ status UPDATING mới sửa
    if (selectedRequest.status !== 'UPDATING') return

    // Nếu BE tạo event từ request thì dùng createdEventId
    const eventId = selectedRequest.createdEventId || selectedRequest.requestId

    // Đóng modal trước khi navigate
    setIsModalOpen(false)

    // Navigate đến trang edit event
    navigate(`/dashboard/events/${eventId}/edit`)
  }

  /**
   * Staff bấm Approve -> mở Process modal
   */
  const handleApprove = (request: EventRequest) => {
    setRequestToProcess(request)
    setProcessAction('APPROVE')
    setIsProcessModalOpen(true)
  }

  /**
   * Staff bấm Reject -> mở Process modal
   */
  const handleReject = (request: EventRequest) => {
    setRequestToProcess(request)
    setProcessAction('REJECT')
    setIsProcessModalOpen(true)
  }

  /**
   * handleProcessRequest:
   * - Nhận dữ liệu từ ProcessRequestModal (areaId + organizerNote + rejectReason)
   * - Gọi API process để approve/reject
   * - Thành công -> toast + reload list
   */
  const handleProcessRequest = async (areaId: number, organizerNote: string, rejectReason?: string) => {
    if (!requestToProcess) return

    try {
      const token = localStorage.getItem('token')

      // payload gửi BE xử lý - Backend yêu cầu action phải là "APPROVED" hoặc "REJECTED" (có D)
      const payload = {
        requestId: requestToProcess.requestId,
        action: processAction === 'APPROVE' ? 'APPROVED' : 'REJECTED', // Convert APPROVE -> APPROVED, REJECT -> REJECTED
        organizerNote: processAction === 'APPROVE' ? organizerNote : null,
        rejectReason: processAction === 'REJECT' ? rejectReason : null, // ✅ NEW: Send rejection reason
        areaId: areaId,
      }
      console.log('Process payload:', payload)

      // Call API process
      const response = await fetch(
        '/api/event-requests/process',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      )

      if (response.ok) {
        // Thành công
        showToast(
          'success',
          processAction === 'APPROVE'
            ? 'Đã duyệt yêu cầu thành công!'
            : 'Đã từ chối yêu cầu.',
        )

        // Reload danh sách
        fetchEventRequests()
      } else {
        // Fail
        const errorData = await response.text()
        const errorMessage = errorData || 'Failed to process request'
        showToast('error', errorMessage)
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error('Error processing request:', error)
      showToast('error', 'Không thể xử lý yêu cầu. Vui lòng thử lại.')
    }
  }

  /**
   * handleCancelClick:
   * - Organizer bấm "Hủy sự kiện" -> mở modal xác nhận
   */
  const handleCancelClick = (request: EventRequest) => {
    setEventToCancel(request)
    setShowCancelModal(true)
  }

  /**
   * confirmCancelEvent:
   * - Gọi API /api/organizer/events/cancel
   * - Thông minh chia 2 trường hợp:
   *   + Nếu đang ở trạng thái chờ (PENDING/UPDATING): "rút lại yêu cầu" -> giải phóng slot
   *   + Nếu đã duyệt (APPROVED): "hủy sự kiện" -> giải phóng địa điểm
   */
  const confirmCancelEvent = async () => {
    if (!eventToCancel) {
      showToast('error', 'Không tìm thấy yêu cầu/sự kiện để hủy')
      return
    }

    // Determine if this is a request (waiting) or event (approved)
    const isWaitingRequest = eventToCancel.status === 'PENDING' || eventToCancel.status === 'UPDATING'
    const isApprovedEvent = eventToCancel.status === 'APPROVED'

    // For approved events, need createdEventId
    if (isApprovedEvent && !eventToCancel.createdEventId) {
      showToast('error', 'Không tìm thấy sự kiện để hủy')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const userIdStr = localStorage.getItem('userId')

      // Use eventId if available (for approved events), otherwise use requestId
      const payload = {
        eventId: isApprovedEvent ? eventToCancel.createdEventId : 0,
        requestId: isWaitingRequest ? eventToCancel.requestId : 0
      }

      const response = await fetch('/api/organizer/events/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-User-Id': userIdStr || '',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        // Determine success message based on request status
        let successMessage = 'Hủy thành công'

        if (isWaitingRequest) {
          successMessage = 'Yêu cầu đã được rút lại thành công'
        } else if (isApprovedEvent) {
          // APPROVED request that has been converted to event - includes refund
          successMessage = 'Sự kiện đã được hủy và hoàn tiền toàn bộ sinh viên mua vé thành công'
        }

        showToast('success', successMessage)
        setShowCancelModal(false)
        setEventToCancel(null)
        fetchEventRequests() // Reload list
      } else {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Không thể hủy')
      }
    } catch (error: any) {
      console.error('Error cancelling:', error)
      showToast('error', error.message || 'Lỗi hủy')
    }
  }

  /**
   * isEventEligibleForUpdate:
   * - Kiểm tra xem event request có thể cập nhật được không dựa trên:
   *   1. Event đã được tạo (createdEventId không null)
   *   2. Backend sẽ validate: Event status không phải CLOSED, CANCELLED
   *   3. Backend sẽ validate: Event start_time cách hiện tại >= 24 giờ
   * - Return: { eligible: boolean, reason: string }
   */
  const isEventEligibleForUpdate = (request: EventRequest): { eligible: boolean; reason: string } => {
    // Nếu chưa có sự kiện được tạo -> không cho update
    if (!request.createdEventId) {
      return { eligible: false, reason: 'Sự kiện chưa được tạo' }
    }

    // Frontend chỉ check createdEventId, backend sẽ check event status và thời gian
    return { eligible: true, reason: '' }
  }

  /**
   * handleUpdateRequest:
   * - Organizer bấm "Cập nhật" trên APPROVED request -> navigate sang trang edit
   */
  const handleUpdateRequest = (request: EventRequest) => {
    navigate(`/dashboard/event-requests/${request.requestId}/edit`)
  }

  /**
   * Nếu user không phải STAFF hoặc ORGANIZER -> chặn truy cập
   */
  if (!isStaff && !isOrganizer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Bạn không có quyền truy cập trang này.</p>
        <Link to="/dashboard" className="text-blue-600 mt-4 inline-block">
          Quay lại Dashboard
        </Link>
      </div>
    )
  }

  /**
   * filteredRequests:
   * - Nếu đang ở tab waiting -> hiển thị waitingRequests
   * - Nếu tab processed -> hiển thị processedRequests
   */
  const filteredRequests =
    isStaff || isOrganizer
      ? activeTab === 'waiting'
        ? waitingRequests
        : processedRequests
      : requests

  // Count số request cho badge tab
  const waitingCount = waitingRequests.length
  const processedCount = processedRequests.length

  // ======================= UI RENDER =======================
  return (
    <div>
      {/* Header trang */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isStaff ? 'Quản lý yêu cầu sự kiện' : 'Yêu cầu sự kiện của tôi'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isStaff
              ? 'Duyệt các yêu cầu tổ chức sự kiện do sinh viên gửi lên.'
              : 'Theo dõi các yêu cầu tổ chức sự kiện bạn đã gửi cho Ban tổ chức.'}
          </p>
        </div>

        {/* Organizer có thể tạo request mới */}
        {isOrganizer && (
          <Link
            to="/dashboard/event-requests/create"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Gửi yêu cầu mới
          </Link>
        )}
      </div>

      {/* Tabs chỉ áp dụng cho staff/organizer */}
      {(isStaff || isOrganizer) && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {/* Tab "Chờ" */}
              <button
                onClick={() => setActiveTab('waiting')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'waiting'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Chờ
                {/* Badge số lượng */}
                {waitingCount > 0 && (
                  <span className="ml-2 py-0.5 px-2 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                    {waitingCount}
                  </span>
                )}
              </button>

              {/* Tab "Đã xử lý" */}
              <button
                onClick={() => setActiveTab('processed')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'processed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Đã xử lý
                {/* Badge số lượng */}
                {processedCount > 0 && (
                  <span className="ml-2 py-0.5 px-2 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                    {processedCount}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Loading / Error / Empty / Table */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <p className="text-gray-500">Đang tải...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={fetchEventRequests}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Thử lại
          </button>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <FileClock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            {(isStaff || isOrganizer) && activeTab === 'waiting'
              ? 'Không có yêu cầu đang chờ'
              : (isStaff || isOrganizer) && activeTab === 'processed'
                ? 'Chưa có yêu cầu nào được xử lý'
                : 'Hiện chưa có yêu cầu sự kiện nào'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            {(isStaff || isOrganizer) && activeTab === 'waiting'
              ? 'Các yêu cầu đang chờ duyệt và chờ cập nhật thông tin sẽ hiển thị ở đây.'
              : (isStaff || isOrganizer) && activeTab === 'processed'
                ? 'Các yêu cầu đã hoàn thành hoặc bị từ chối sẽ hiển thị ở đây.'
                : 'Khi bạn gửi yêu cầu, dữ liệu sẽ xuất hiện tại đây.'}
          </p>
        </div>
      ) : (
        // Hiển thị bảng danh sách request
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tiêu đề
                </th>

                {/* Staff mới cần cột người gửi */}
                {isStaff && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Người gửi
                  </th>
                )}

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ngày gửi
                </th>

                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>

                {/* Staff + tab waiting mới có cột thao tác */}
                {isStaff && activeTab === 'waiting' && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                )}

                {/* Organizer + waiting tab: có cột thao tác cho PENDING/UPDATING */}
                {isOrganizer && activeTab === 'waiting' && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                )}

                {/* Organizer + processed tab: có cột thao tác cho APPROVED events */}
                {isOrganizer && activeTab === 'processed' && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRequests.map((req) => (
                <tr
                  key={req.requestId}
                  className="hover:bg-gray-50 cursor-pointer"
                  // Click cả row để mở modal detail
                  onClick={() => handleViewDetails(req)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {req.title}
                  </td>

                  {isStaff && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {req.requesterName || 'N/A'}
                    </td>
                  )}

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(req.createdAt).toLocaleString('vi-VN')}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(
                        req.status,
                      )}`}
                    >
                      {getStatusLabel(req.status)}
                    </span>
                  </td>

                  {/* Staff + waiting tab: có nút duyệt/từ chối (chỉ khi PENDING) */}
                  {isStaff && activeTab === 'waiting' && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      {req.status === 'PENDING' && (
                        // stopPropagation để click nút không trigger click row (không mở modal)
                        <div
                          className="flex justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleApprove(req)}
                            className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition-all hover:brightness-90"
                            title="Duyệt yêu cầu"
                          >
                            <CheckCircle2 size={24} />
                          </button>
                          <button
                            onClick={() => handleReject(req)}
                            className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-all hover:brightness-90"
                            title="Từ chối yêu cầu"
                          >
                            <XCircle size={24} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}

                  {/* Organizer + waiting tab: thao tác cho PENDING/UPDATING/APPROVED */}
                  {isOrganizer && activeTab === 'waiting' && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <div
                        className="flex justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* APPROVED: Cập nhật button - with eligibility check */}
                        {req.status === 'APPROVED' && (() => {
                          const eligibility = isEventEligibleForUpdate(req)
                          return (
                            <button
                              onClick={() => {
                                if (eligibility.eligible) {
                                  handleUpdateRequest(req)
                                } else {
                                  showToast('warning', eligibility.reason)
                                }
                              }}
                              disabled={!eligibility.eligible}
                              title={!eligibility.eligible ? eligibility.reason : 'Cập nhật sự kiện'}
                              className={`inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium transition-all ${eligibility.eligible
                                ? 'text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:brightness-90'
                                : 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed'
                                }`}
                            >
                              <Edit size={24} />
                            </button>
                          )
                        })()}

                        {/* PENDING/UPDATING: Hủy yêu cầu button */}
                        {(req.status === 'PENDING' || req.status === 'UPDATING') && (
                          <button
                            onClick={() => handleCancelClick(req)}
                            className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-all hover:brightness-90"
                            title="Hủy yêu cầu"
                          >
                            <XCircle size={24} />
                          </button>
                        )}

                        {/* APPROVED: Hủy sự kiện button (only if event has been created) */}
                        {req.status === 'APPROVED' && req.createdEventId && (
                          <button
                            onClick={() => handleCancelClick(req)}
                            className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-all hover:brightness-90"
                            title="Hủy sự kiện"
                          >
                            <XCircle size={24} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal xem chi tiết request */}
      <EventRequestDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        request={selectedRequest}
        userRole={user?.role}
        onEdit={handleEditEvent} // organizer sửa event khi UPDATING
        onCancel={() => {
          if (selectedRequest) {
            handleCancelClick(selectedRequest)
          }
        }}
      />

      {/* Modal duyệt/từ chối request */}
      <ProcessRequestModal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        onSubmit={handleProcessRequest} // submit process gọi API
        action={processAction} // APPROVE / REJECT
        request={requestToProcess}
      />

      {/* Modal xác nhận hủy sự kiện (Organizer) */}
      {showCancelModal && eventToCancel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                {eventToCancel.status === 'PENDING' || eventToCancel.status === 'UPDATING'
                  ? 'Xác nhận rút lại yêu cầu'
                  : 'Xác nhận hủy sự kiện'}
              </h3>
              <p className="text-gray-700 mb-4">
                {eventToCancel.status === 'PENDING' || eventToCancel.status === 'UPDATING' ? (
                  <>
                    Bạn có chắc chắn muốn rút lại yêu cầu{' '}
                    <strong className="text-gray-900">"{eventToCancel.title}"</strong>?
                  </>
                ) : (
                  <>
                    Bạn có chắc chắn muốn hủy sự kiện{' '}
                    <strong className="text-gray-900">"{eventToCancel.title}"</strong>?
                  </>
                )}
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800">
                  <span className="font-semibold">⚠️ Lưu ý:</span>
                  <br />
                  {eventToCancel.status === 'PENDING' || eventToCancel.status === 'UPDATING' ? (
                    <>
                      • Hệ thống sẽ giải phóng slot để các sự kiện khác có thể đăng ký vào ngày này
                      <br />
                      • Hành động này không thể hoàn tác
                      <br />
                      • Yêu cầu sẽ chuyển sang trạng thái "Đã hủy"
                    </>
                  ) : (
                    <>
                      • <strong>Hệ thống sẽ tự động hoàn lại tiền vé cho toàn bộ sinh viên đã đăng ký vào ví nội bộ của họ</strong>
                      <br />
                      • Địa điểm sẽ được giải phóng và có thể được sử dụng cho sự kiện khác
                      <br />
                      • Hành động này không thể hoàn tác
                      <br />
                      • Chỉ có thể hủy nếu còn ít nhất 24 giờ trước giờ diễn ra
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false)
                    setEventToCancel(null)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Không
                </button>
                <button
                  onClick={confirmCancelEvent}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  {eventToCancel.status === 'PENDING' || eventToCancel.status === 'UPDATING'
                    ? 'Có, rút lại'
                    : 'Có, hủy sự kiện'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
