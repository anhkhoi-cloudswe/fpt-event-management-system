// Import Link để chuyển trang trong SPA, useNavigate để điều hướng bằng code
import { useNavigate } from 'react-router-dom'

// Lấy thông tin user đăng nhập (role) từ AuthContext
import { useAuth } from '../contexts/AuthContext'

// ToastContext để hiển thị thông báo (success/error/warning)
import { useToast } from '../contexts/ToastContext'

// Import icon để hiển thị UI đẹp hơn
import { CheckCircle2, XCircle, FileClock, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'

// useEffect để gọi API khi component mount / khi dependencies thay đổi
// useState để quản lý state dữ liệu
import { useEffect, useState } from 'react'

// Modal xem chi tiết request
import { EventRequestDetailModal } from '../components/events/EventRequestDetailModal'

// Modal xử lý request (Approve/Reject + chọn area + note)
import { ProcessRequestModal } from '../components/events/ProcessRequestModal'

/**
 * Enum kiểu trạng thái yêu cầu tổ chức sự kiện
 */
type EventRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'UPDATING'
  | 'CANCELLED'
  | 'FINISHED'
  | 'EXPIRED'

/**
 * Kiểu dữ liệu EventRequest
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

const ITEMS_PER_PAGE = 10

/**
 * getStatusLabel - Chuyển status code -> text tiếng Việt
 */
const getStatusLabel = (status: EventRequestStatus) => {
  switch (status) {
    case 'APPROVED':
      return 'Đã duyệt'
    case 'REJECTED':
      return 'Bị từ chối'
    case 'UPDATING':
      return 'Chờ cập nhật'
    case 'CANCELLED':
      return 'Đã hủy'
    case 'FINISHED':
      return 'Hoàn tất'
    case 'EXPIRED':
      return 'Hết hạn'
    default:
      return 'Chờ duyệt'
  }
}

/**
 * getStatusClass - Tailwind class cho badge status
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
    case 'FINISHED':
      return 'bg-purple-100 text-purple-800'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

/**
 * =============================================================================
 * STAFF EVENT REQUESTS PAGE - UPGRADED
 * =============================================================================
 *
 * Features:
 * - Pagination: 10 items per page
 * - Search: by title or requester name
 * - Filter: by status and date range
 * - Tab "Chờ xử lý": PENDING + UPDATING only
 * - Tab "Đã xử lý": APPROVED + REJECTED + CANCELLED + FINISHED
 * =============================================================================
 */
export default function StaffEventRequests() {
  // Lấy user từ AuthContext
  const { user } = useAuth()

  // Hiển thị toast notification
  const { showToast } = useToast()

  // navigate để chuyển trang
  const navigate = useNavigate()

  // All requests data
  const [allWaitingRequests, setAllWaitingRequests] = useState<EventRequest[]>([])
  const [allProcessedRequests, setAllProcessedRequests] = useState<EventRequest[]>([])

  // Loading + error state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<EventRequestStatus | ''>('')
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7days' | '30days'>('all')

  // Selected request for detail modal
  const [selectedRequest, setSelectedRequest] = useState<EventRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Process modal (Approve/Reject) states
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false)
  const [processAction, setProcessAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [requestToProcess, setRequestToProcess] = useState<EventRequest | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<'waiting' | 'processed'>('waiting')

  /**
   * useEffect: Load data khi component mount
   */
  useEffect(() => {
    fetchEventRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Reset pagination khi search/filter thay đổi
   */
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, dateRangeFilter])

  /**
   * fetchEventRequests:
   * - Call /api/staff/event-requests để lấy tất cả request
   * - Chia thành 2 tab:
   *   - Waiting: PENDING + UPDATING
   *   - Processed: APPROVED + REJECTED + CANCELLED + FINISHED
   */
  const fetchEventRequests = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch('/api/staff/event-requests', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Staff event requests data:', data)

        // ===== Parse response =====
        let allRequests: EventRequest[] = []

        if (data.pending || data.approved || data.rejected) {
          const pending = Array.isArray(data.pending) ? data.pending : []
          const approved = Array.isArray(data.approved) ? data.approved : []
          const rejected = Array.isArray(data.rejected) ? data.rejected : []
          const cancelled = Array.isArray(data.cancelled) ? data.cancelled : []
          const updating = Array.isArray(data.updating) ? data.updating : []
          const finished = Array.isArray(data.finished) ? data.finished : []

          allRequests = [
            ...pending,
            ...approved,
            ...rejected,
            ...cancelled,
            ...updating,
            ...finished,
          ]
        } else if (Array.isArray(data)) {
          allRequests = data
        }

        // ===== STAFF TAB STRUCTURE (Fixed) =====
        // Tab "Chờ xử lý": PENDING + UPDATING ONLY (not APPROVED)
        const waiting = allRequests.filter(
          (req) => req.status === 'PENDING' || req.status === 'UPDATING',
        )

        // Tab "Đã xử lý": APPROVED + REJECTED + CANCELLED + FINISHED
        const processed = allRequests.filter(
          (req) =>
            req.status === 'APPROVED' ||
            req.status === 'REJECTED' ||
            req.status === 'CANCELLED' ||
            req.status === 'FINISHED',
        )

        setAllWaitingRequests(waiting)
        setAllProcessedRequests(processed)
      } else {
        throw new Error('Failed to fetch event requests')
      }
    } catch (error) {
      console.error('Error fetching event requests:', error)
      setError(
        error instanceof Error ? error.message : 'Failed to fetch event requests',
      )
    } finally {
      setLoading(false)
    }
  }

  /**
   * filterRequests: Apply search and filter logic
   */
  const applyFilters = (requests: EventRequest[]): EventRequest[] => {
    let filtered = [...requests]

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (req) =>
          req.title.toLowerCase().includes(query) ||
          (req.requesterName?.toLowerCase().includes(query) ?? false),
      )
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter((req) => req.status === statusFilter)
    }

    // Date range filter
    if (dateRangeFilter !== 'all') {
      const now = new Date()
      const daysAgo = dateRangeFilter === '7days' ? 7 : 30
      const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)

      filtered = filtered.filter((req) => {
        const createdDate = new Date(req.createdAt)
        return createdDate >= cutoffDate
      })
    }

    return filtered
  }

  /**
   * Get filtered and paginated data
   */
  const currentRequests = activeTab === 'waiting' ? allWaitingRequests : allProcessedRequests
  const filteredRequests = applyFilters(currentRequests)
  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE)
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

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
   * handleProcessRequest
   */
  const handleProcessRequest = async (
    areaId: number,
    organizerNote: string,
    rejectReason?: string,
  ) => {
    if (!requestToProcess) return

    try {
      const token = localStorage.getItem('token')

      const payload = {
        requestId: requestToProcess.requestId,
        action: processAction === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        organizerNote: processAction === 'APPROVE' ? organizerNote : null,
        rejectReason: processAction === 'REJECT' ? rejectReason : null,
        areaId: areaId,
      }

      const response = await fetch('/api/event-requests/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        showToast(
          'success',
          processAction === 'APPROVE'
            ? 'Đã duyệt yêu cầu thành công!'
            : 'Đã từ chối yêu cầu.',
        )
        setIsProcessModalOpen(false)
        fetchEventRequests()
      } else {
        const errorData = await response.text()
        throw new Error(errorData || 'Failed to process request')
      }
    } catch (error) {
      console.error('Error processing request:', error)
      showToast('error', 'Không thể xử lý yêu cầu. Vui lòng thử lại.')
    }
  }

  /**
   * Nếu không phải STAFF -> chặn truy cập
   */
  if (user?.role !== 'STAFF') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Bạn không có quyền truy cập trang này.</p>
      </div>
    )
  }

  const waitingCount = allWaitingRequests.length
  const processedCount = allProcessedRequests.length

  // ======================= RENDER =======================
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý yêu cầu sự kiện</h1>
        <p className="text-sm text-gray-500 mt-1">
          Duyệt các yêu cầu tổ chức sự kiện từ sinh viên.
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-100 text-red-800">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {!loading && (
        <>
          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('waiting')}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'waiting'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                Chờ xử lý
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-yellow-500 rounded-full">
                  {waitingCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('processed')}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'processed'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                Đã xử lý
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-gray-500 rounded-full">
                  {processedCount}
                </span>
              </button>
            </div>
          </div>

          {/* Toolbar: Search & Filter */}
          <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Search className="w-4 h-4 inline mr-2" />
                  Tìm kiếm
                </label>
                <input
                  type="text"
                  placeholder="Tiêu đề hoặc người gửi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter className="w-4 h-4 inline mr-2" />
                  Trạng thái
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as EventRequestStatus | '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Tất cả</option>
                  {activeTab === 'waiting' && (
                    <>
                      <option value="PENDING">Chờ duyệt</option>
                      <option value="UPDATING">Chờ cập nhật</option>
                    </>
                  )}
                  {activeTab === 'processed' && (
                    <>
                      <option value="APPROVED">Đã duyệt</option>
                      <option value="REJECTED">Bị từ chối</option>
                      <option value="CANCELLED">Đã hủy</option>
                      <option value="FINISHED">Hoàn tất</option>
                    </>
                  )}
                </select>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thời gian
                </label>
                <select
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value as typeof dateRangeFilter)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Tất cả</option>
                  <option value="7days">7 ngày qua</option>
                  <option value="30days">30 ngày qua</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results info */}
          <div className="mb-4 text-sm text-gray-600">
            Hiển thị <strong>{paginatedRequests.length}</strong> trên <strong>{filteredRequests.length}</strong> yêu cầu
          </div>

          {/* Empty state */}
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <FileClock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Không tìm thấy yêu cầu nào</p>
            </div>
          ) : (
            <>
              {/* Cards Grid */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                {paginatedRequests.map((req) => (
                  <div
                    key={req.requestId}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleViewDetails(req)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold text-gray-900 truncate">
                            {req.title}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusClass(
                              req.status,
                            )}`}
                          >
                            {getStatusLabel(req.status)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                          {req.description}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                          <div>
                            <strong>Tác giả:</strong> {req.requesterName || 'N/A'}
                          </div>
                          <div>
                            <strong>Sức chứa:</strong> {req.expectedCapacity} người
                          </div>
                          <div>
                            <strong>Ngày gửi:</strong>{' '}
                            {new Date(req.createdAt).toLocaleDateString('vi-VN')}
                          </div>
                          <div>
                            <strong>Thời gian:</strong>{' '}
                            {req.preferredStartTime
                              ? new Date(req.preferredStartTime).toLocaleDateString('vi-VN')
                              : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      {activeTab === 'waiting' && (
                        <div
                          className="flex gap-2 ml-4 flex-shrink-0"
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
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Trang <strong>{currentPage}</strong> trên <strong>{totalPages}</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {/* Page numbers */}
                    <div className="flex gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === page
                              ? 'bg-blue-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Modal */}
      {selectedRequest && (
        <EventRequestDetailModal
          request={selectedRequest}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      {/* Process Modal */}
      {requestToProcess && (
        <ProcessRequestModal
          isOpen={isProcessModalOpen}
          onClose={() => {
            setIsProcessModalOpen(false)
            setRequestToProcess(null)
          }}
          action={processAction}
          request={requestToProcess}
          onSubmit={handleProcessRequest}
        />
      )}
    </div>
  )
}
