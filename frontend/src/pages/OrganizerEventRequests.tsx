// Import Link để chuyển trang trong SPA, useNavigate để điều hướng bằng code
import { Link, useNavigate } from 'react-router-dom'

// Lấy thông tin user đăng nhập (role) từ AuthContext
import { useAuth } from '../contexts/AuthContext'

// ToastContext để hiển thị thông báo (success/error/warning)
import { useToast } from '../contexts/ToastContext'

// Import icon để hiển thị UI đẹp hơn
import {
  XCircle,
  FileClock,
  PlusCircle,
  Edit,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
} from 'lucide-react'

// useEffect để gọi API khi component mount / khi dependencies thay đổi
// useState để quản lý state dữ liệu
import { useEffect, useState } from 'react'

// Modal xem chi tiết request
import { EventRequestDetailModal } from '../components/events/EventRequestDetailModal'

const ITEMS_PER_PAGE = 10

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
  | 'CLOSED'
  | 'OPEN'

/**
 * Kiểu dữ liệu EventRequest
 */
type EventRequest = {
  requestId: number
  requesterId: number
  requesterName?: string
  title: string
  description?: string
  preferredStartTime?: string
  preferredEndTime?: string
  expectedCapacity?: number
  status: EventRequestStatus
  createdAt?: string
  processedBy?: number
  processedByName?: string
  processedAt?: string
  organizerNote?: string
  createdEventId?: number
  eventStatus?: string // Status of created Event (UPDATING, OPEN, CLOSED, etc.)
  bannerUrl?: string
  // ✅ NEW: Venue information (when APPROVED)
  venueName?: string
  areaName?: string
  floor?: string
  areaCapacity?: number
}

/**
 * Kiểu dữ liệu EventRequest cho EventRequestDetailModal
 * (all required fields)
 */
type EventRequestForModal = {
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
  eventStatus?: string // Status of created Event (UPDATING, OPEN, CLOSED, etc.)
  bannerUrl?: string
  // ✅ NEW: Venue information (when APPROVED)
  venueName?: string
  areaName?: string
  floor?: string
  areaCapacity?: number
}

/**
 * API Response type for active/archived requests
 */
type ApiTabResponse = {
  requests: EventRequest[]
  totalCount: number
}

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
    case 'CLOSED':
      return 'Đã đóng'
    case 'OPEN':
      return 'Đang mở'
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
    case 'CLOSED':
      return 'bg-gray-200 text-gray-900'
    case 'OPEN':
      return 'bg-green-50 text-green-700'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}

/**
 * convertToModalRequest - Ensure all required fields for EventRequestDetailModal
 */
const convertToModalRequest = (request: EventRequest): EventRequestForModal => {
  return {
    ...request,
    description: request.description || 'N/A',
    preferredStartTime: request.preferredStartTime || new Date().toISOString(),
    preferredEndTime: request.preferredEndTime || new Date().toISOString(),
    expectedCapacity: request.expectedCapacity || 0,
    createdAt: request.createdAt || new Date().toISOString(),
  }
}

/**
 * ============================================================
 * CLIENT-SIDE TAB FILTERING LOGIC FOR ABSOLUTE ACCURACY
 * ============================================================
 * Purpose: Ensure strict filtering even if backend returns edge cases
 * Priority: Always use event_request.status for display on Card badge
 */

/**
 * isRequestActiveTabEligible - Check if request should appear in "Chờ" (Active) tab
 * Rules:
 * 1. status = 'PENDING'
 * 2. OR (status = 'APPROVED' AND eventStatus = 'UPDATING')
 * Priority: Use event_request.status for badge display
 */
const isRequestActiveTabEligible = (request: EventRequest): boolean => {
  // PENDING requests always go to Active tab
  if (request.status === 'PENDING') {
    return true
  }

  // APPROVED requests with UPDATING event status go to Active tab
  if (request.status === 'APPROVED' && request.eventStatus === 'UPDATING') {
    return true
  }

  return false
}

/**
 * isRequestArchivedTabEligible - Check if request should appear in "Đã xử lý" (Archived) tab
 * Rules:
 * 1. status IN ('REJECTED', 'CANCELLED')
 * 2. OR (status = 'APPROVED' AND eventStatus IN ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED'))
 * Priority: Use event_request.status for badge display
 */
const isRequestArchivedTabEligible = (request: EventRequest): boolean => {
  // REJECTED or CANCELLED requests always go to Archived tab
  if (request.status === 'REJECTED' || request.status === 'CANCELLED') {
    return true
  }

  // APPROVED requests with finished event statuses go to Archived tab
  if (request.status === 'APPROVED') {
    const finishedStatuses = ['OPEN', 'CLOSED', 'CANCELLED', 'FINISHED']
    if (request.eventStatus && finishedStatuses.includes(request.eventStatus)) {
      return true
    }
  }

  return false
}

/**
 * getDisplayStatus - Get status to display on Card badge
 * Priority: Always use event_request.status, not event status
 */
const getDisplayStatus = (request: EventRequest): EventRequestStatus => {
  // Priority: Use event_request.status for display
  return request.status
}

/**
 * =============================================================================
 * ORGANIZER EVENT REQUESTS PAGE - REAL-TIME LIFECYCLE BASED
 * =============================================================================
 *
 * Features:
 * - Client-side filtering for absolute accuracy
 * - Backend filtering: Time-based, Auto-archiving
 * - Pagination: 10 items per page
 * - Tab "Chờ": PENDING + UPDATING
 * - Tab "Đã xử lý": CLOSED + CANCELLED + OPEN + APPROVED
 * - Status display priority: event_request.status > event status
 * =============================================================================
 */
export default function OrganizerEventRequests() {
  // Lấy user từ AuthContext
  const { user } = useAuth()

  // Hiển thị toast notification
  const { showToast } = useToast()

  // navigate để chuyển trang
  const navigate = useNavigate()

  // Pagination state (per tab)
  const [activeTabPage, setActiveTabPage] = useState(1)
  const [archivedTabPage, setArchivedTabPage] = useState(1)

  // Loading + error state
  const [activeLoading, setActiveLoading] = useState(true)
  const [archivedLoading, setArchivedLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ✅ NEW: Detail loading state - hiển thị spinner khi fetch chi tiết
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // Data state - holds paginated results + total count
  const [activeTabData, setActiveTabData] = useState<ApiTabResponse>({
    requests: [],
    totalCount: 0,
  })
  const [archivedTabData, setArchivedTabData] = useState<ApiTabResponse>({
    requests: [],
    totalCount: 0,
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Filter state (per tab)
  const [activeTabStatusFilter, setActiveTabStatusFilter] = useState<EventRequestStatus | 'ALL'>('ALL')
  const [archivedTabStatusFilter, setArchivedTabStatusFilter] = useState<EventRequestStatus | 'ALL'>('ALL')

  // Selected request for detail modal
  const [selectedRequest, setSelectedRequest] = useState<EventRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Cancel event modal states
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [eventToCancel, setEventToCancel] = useState<EventRequest | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  /**
   * useEffect: Load data when component mounts
   */
  useEffect(() => {
    fetchActiveRequests(1)
    fetchArchivedRequests(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * fetchActiveRequests: Call /api/event-requests/my/active
   * Tab "Chờ" (Active) = PENDING + UPDATING only
   * Supports: limit, offset, search
   */
  const fetchActiveRequests = async (page: number) => {
    try {
      setActiveLoading(true)
      const token = 'cookie-auth'
      const offset = (page - 1) * ITEMS_PER_PAGE

      let url = `/api/event-requests/my/active?limit=${ITEMS_PER_PAGE}&offset=${offset}`
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data: ApiTabResponse = await response.json()
        console.log('Active requests data:', data)
        // ✅ FIX: Ensure requests is always an array, never null
        const normalizedData: ApiTabResponse = {
          requests: data.requests || [],
          totalCount: data.totalCount || 0,
        }
        setActiveTabData(normalizedData)
        setActiveTabPage(page)
      } else {
        throw new Error('Failed to fetch active event requests')
      }
    } catch (error) {
      console.error('Error fetching active requests:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch active event requests')
    } finally {
      setActiveLoading(false)
    }
  }

  /**
   * fetchArchivedRequests: Call /api/event-requests/my/archived
   * Tab "Đã xử lý" (Archived) = CLOSED + CANCELLED + OPEN + APPROVED
   * Supports: limit, offset, search
   */
  const fetchArchivedRequests = async (page: number) => {
    try {
      setArchivedLoading(true)
      const token = 'cookie-auth'
      const offset = (page - 1) * ITEMS_PER_PAGE

      let url = `/api/event-requests/my/archived?limit=${ITEMS_PER_PAGE}&offset=${offset}`
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data: ApiTabResponse = await response.json()
        console.log('Archived requests data:', data)
        // ✅ FIX: Ensure requests is always an array, never null
        const normalizedData: ApiTabResponse = {
          requests: data.requests || [],
          totalCount: data.totalCount || 0,
        }
        setArchivedTabData(normalizedData)
        setArchivedTabPage(page)
      } else {
        throw new Error('Failed to fetch archived event requests')
      }
    } catch (error) {
      console.error('Error fetching archived requests:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch archived event requests')
    } finally {
      setArchivedLoading(false)
    }
  }

  /**
   * ✅ NEW: fetchEventRequestDetail
   * Gọi API GET /api/event-requests/{requestId} để lấy dữ liệu chi tiết
   * Dữ liệu được join với venue/area info đầy đủ (venueName, areaName, floor, areaCapacity)
   */
  const fetchEventRequestDetail = async (requestId: number) => {
    try {
      setIsDetailLoading(true)
      const token = 'cookie-auth'

      const response = await fetch(`/api/event-requests/${requestId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const detailedRequest: EventRequest = await response.json()
        console.log('Fetched detailed event request:', detailedRequest)
        // Update selectedRequest với dữ liệu chi tiết mới
        setSelectedRequest(detailedRequest)
      } else {
        throw new Error('Failed to fetch event request details')
      }
    } catch (error) {
      console.error('Error fetching event request detail:', error)
      showToast('error', 'Không thể tải chi tiết yêu cầu')
    } finally {
      setIsDetailLoading(false)
    }
  }

  /**
   * Click row -> open detail modal + fetch detailed data
   */
  const handleViewDetails = (request: EventRequest) => {
    // Mở modal với dữ liệu cơ bản trước
    setSelectedRequest(request)
    setIsModalOpen(true)

    // ✅ NEW: Gọi API fetch chi tiết (với venue info)
    fetchEventRequestDetail(request.requestId)
  }

  /**
   * Close detail modal
   */
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedRequest(null)
  }

  /**
   * isEventEligibleForUpdate
   */
  const isEventEligibleForUpdate = (
    request: EventRequest,
  ): { eligible: boolean; reason: string } => {
    if (!request.createdEventId) {
      return { eligible: false, reason: 'Sự kiện chưa được tạo' }
    }
    return { eligible: true, reason: '' }
  }

  /**
   * handleUpdateRequest
   */
  const handleUpdateRequest = (request: EventRequest) => {
    navigate(`/dashboard/event-requests/${request.requestId}/edit`)
  }

  /**
   * handleCancelClick
   */
  const handleCancelClick = (request: EventRequest) => {
    setEventToCancel(request)
    setShowCancelModal(true)
  }

  /**
   * confirmCancelEvent
   */
  const confirmCancelEvent = async () => {
    if (!eventToCancel) {
      showToast('error', 'Không tìm thấy yêu cầu/sự kiện để hủy')
      return
    }

    // ✅ FIX: Xác định dựa trên createdEventId thay vì status
    // Nếu có createdEventId -> event đã được tạo (APPROVED/OPEN/UPDATING)
    // Nếu không có createdEventId -> request chưa được duyệt (PENDING)
    const hasCreatedEvent = eventToCancel.createdEventId && eventToCancel.createdEventId > 0

    if (hasCreatedEvent && !eventToCancel.createdEventId) {
      showToast('error', 'Không tìm thấy sự kiện để hủy')
      return
    }

    try {
      const token = 'cookie-auth'
      const userIdStr = localStorage.getItem('userId')

      // ✅ FIX: Gửi đúng eventId/requestId dựa trên createdEventId
      const payload = {
        eventId: hasCreatedEvent ? eventToCancel.createdEventId : 0,
        requestId: hasCreatedEvent ? 0 : eventToCancel.requestId,
      }

      const response = await fetch('/api/organizer/events/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-User-Id': userIdStr || '',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        let successMessage = 'Hủy thành công'

        // ✅ FIX: Dựa trên createdEventId để xác định loại hủy
        if (!hasCreatedEvent) {
          successMessage = 'Yêu cầu đã được rút lại thành công. Yêu cầu đã được chuyển vào mục Đã xử lý'
        } else {
          successMessage = 'Sự kiện đã được hủy và hoàn tiền thành công. Yêu cầu đã được chuyển vào mục Đã xử lý'
        }

        showToast('success', successMessage)
        setShowCancelModal(false)
        setEventToCancel(null)
        // Reload both tabs
        if (activeTab === 'active') {
          fetchActiveRequests(1)
          fetchArchivedRequests(1)
        } else {
          fetchArchivedRequests(1)
          fetchActiveRequests(1)
        }
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
   * Handle tab change
   */
  const handleTabChange = (tab: 'active' | 'archived') => {
    setActiveTab(tab)
  }

  /**
   * Handle search input change (with debounce for better UX)
   */
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    // Reset to page 1 when searching
    setActiveTabPage(1)
    setArchivedTabPage(1)
  }

  /**
   * Handle search submit (trigger fetch)
   */
  const handleSearchSubmit = () => {
    if (activeTab === 'active') {
      fetchActiveRequests(1)
    } else {
      fetchArchivedRequests(1)
    }
  }

  /**
   * Nếu không phải ORGANIZER -> chặn truy cập
   */
  if (user?.role !== 'ORGANIZER') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Bạn không có quyền truy cập trang này.</p>
      </div>
    )
  }

  // Calculate pagination
  const activeTabTotalPages = Math.ceil(activeTabData.totalCount / ITEMS_PER_PAGE)
  const archivedTabTotalPages = Math.ceil(archivedTabData.totalCount / ITEMS_PER_PAGE)
  const currentData = activeTab === 'active' ? activeTabData : archivedTabData
  const currentPage = activeTab === 'active' ? activeTabPage : archivedTabPage
  const currentTotalPages = activeTab === 'active' ? activeTabTotalPages : archivedTabTotalPages
  const currentLoading = activeTab === 'active' ? activeLoading : archivedLoading

  /**
   * Apply client-side filtering based on active tab
   * This ensures absolute accuracy even if backend returns edge cases
   */
  const filteredRequests = (currentData?.requests || []).filter((req) => {
    // Apply tab eligibility check
    const tabValid =
      activeTab === 'active'
        ? isRequestActiveTabEligible(req)
        : isRequestArchivedTabEligible(req)

    if (!tabValid) return false

    // Apply status filter if not 'ALL'
    const statusFilter =
      activeTab === 'active' ? activeTabStatusFilter : archivedTabStatusFilter
    if (statusFilter !== 'ALL' && req.status !== statusFilter) {
      return false
    }

    return true
  })

  // ======================= RENDER =======================
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Yêu cầu sự kiện của tôi</h1>
          <p className="text-sm text-gray-500 mt-1">
            Theo dõi các yêu cầu tổ chức sự kiện bạn đã gửi.
          </p>
        </div>

        {/* Create new request button */}
        <Link
          to="/dashboard/event-requests/create"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Gửi yêu cầu mới
        </Link>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-100 text-red-800">{error}</div>
      )}

      {/* Toolbar: Search + Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search Input */}
        <div className="flex-1 flex gap-2 min-w-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tiêu đề sự kiện..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearchSubmit()
                }
              }}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSearchSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Tìm kiếm
          </button>
        </div>

        {/* Filter Dropdown */}
        <div className="flex gap-2 items-center">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={activeTab === 'active' ? activeTabStatusFilter : archivedTabStatusFilter}
            onChange={(e) => {
              if (activeTab === 'active') {
                setActiveTabStatusFilter(e.target.value as EventRequestStatus | 'ALL')
              } else {
                setArchivedTabStatusFilter(e.target.value as EventRequestStatus | 'ALL')
              }
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {activeTab === 'active' && (
              <>
                <option value="PENDING">Chờ duyệt</option>
                <option value="UPDATING">Chờ cập nhật</option>
                <option value="APPROVED">Đã duyệt</option>
              </>
            )}
            {activeTab === 'archived' && (
              <>
                <option value="REJECTED">Bị từ chối</option>
                <option value="CANCELLED">Đã hủy</option>
                <option value="FINISHED">Hoàn tất</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex space-x-8">
          <button
            onClick={() => handleTabChange('active')}
            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'active'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Chờ
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-yellow-500 rounded-full">
              {activeTabData.totalCount}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('archived')}
            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'archived'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Đã xử lý
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-gray-500 rounded-full">
              {archivedTabData.totalCount}
            </span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {currentLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {!currentLoading && (
        <>
          {/* Results info */}
          <div className="mb-3 text-xs text-gray-600 flex items-center gap-2">
            <span>
              Kết quả: {filteredRequests.length === 0 ? '0' : filteredRequests.length} / {currentData.totalCount}
            </span>
            {searchQuery && (
              <span className="text-blue-600">
                🔍 Tìm kiếm: "{searchQuery}"
                <button
                  onClick={() => {
                    setSearchQuery('')
                    if (activeTab === 'active') fetchActiveRequests(1)
                    else fetchArchivedRequests(1)
                  }}
                  className="ml-1 text-blue-600 hover:text-blue-700 underline"
                >
                  Xóa
                </button>
              </span>
            )}
            {(activeTab === 'active'
              ? activeTabStatusFilter !== 'ALL'
              : archivedTabStatusFilter !== 'ALL') && (
                <span className="text-blue-600">
                  📋 Lọc: {activeTab === 'active'
                    ? getStatusLabel(activeTabStatusFilter as EventRequestStatus)
                    : getStatusLabel(archivedTabStatusFilter as EventRequestStatus)}
                </span>
              )}
          </div>

          {/* Empty state */}
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <FileClock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {activeTab === 'active'
                  ? 'Không có yêu cầu hoạt động'
                  : 'Không có yêu cầu đã lưu trữ'}
              </p>
            </div>
          ) : (
            <>
              {/* Cards Grid */}
              <div className="grid grid-cols-1 gap-3 mb-6">
                {filteredRequests.map((req) => (
                  <div
                    key={req.requestId}
                    className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleViewDetails(req)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {req.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusClass(
                              getDisplayStatus(req),
                            )}`}
                          >
                            {getStatusLabel(getDisplayStatus(req))}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-1 mb-2">
                          {req.description}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-500">
                          {req.createdAt && (
                            <div>
                              <strong>Gửi:</strong> {new Date(req.createdAt).toLocaleDateString('vi-VN')}
                            </div>
                          )}
                          {req.expectedCapacity && (
                            <div>
                              <strong>Sức chứa:</strong> {req.expectedCapacity} người
                            </div>
                          )}
                          {req.preferredStartTime && (
                            <div>
                              <strong>Thời gian:</strong>{' '}
                              {new Date(req.preferredStartTime).toLocaleDateString('vi-VN')}
                            </div>
                          )}
                          {req.processedByName && (
                            <div>
                              <strong>Duyệt bởi:</strong> {req.processedByName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {activeTab === 'active' && (
                        <div
                          className="flex gap-2 ml-2 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* APPROVED: Cập nhật button */}
                          {req.status === 'APPROVED' && (() => {
                            const eligibility = isEventEligibleForUpdate(req)
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
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
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelClick(req)
                              }}
                              className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-all hover:brightness-90"
                              title="Hủy yêu cầu"
                            >
                              <XCircle size={24} />
                            </button>
                          )}

                          {/* APPROVED + createdEventId: Hủy sự kiện button */}
                          {req.status === 'APPROVED' && req.createdEventId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelClick(req)
                              }}
                              className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-all hover:brightness-90"
                              title="Hủy sự kiện"
                            >
                              <XCircle size={24} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {currentTotalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Trang <strong>{currentPage}</strong> trên <strong>{currentTotalPages}</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const newPage = Math.max(1, currentPage - 1)
                        if (activeTab === 'active') {
                          fetchActiveRequests(newPage)
                        } else {
                          fetchArchivedRequests(newPage)
                        }
                      }}
                      disabled={currentPage === 1}
                      className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {/* Page numbers */}
                    <div className="flex gap-1">
                      {Array.from({ length: currentTotalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => {
                            if (activeTab === 'active') {
                              fetchActiveRequests(page)
                            } else {
                              fetchArchivedRequests(page)
                            }
                          }}
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
                      onClick={() => {
                        const newPage = Math.min(currentTotalPages, currentPage + 1)
                        if (activeTab === 'active') {
                          fetchActiveRequests(newPage)
                        } else {
                          fetchArchivedRequests(newPage)
                        }
                      }}
                      disabled={currentPage === currentTotalPages}
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

      {/* Detail Modal */}
      {selectedRequest && (
        <EventRequestDetailModal
          request={convertToModalRequest(selectedRequest)}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          userRole={user?.role}
          loading={isDetailLoading}
        />
      )}

      {/* Cancel Confirmation Modal */}
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
                {eventToCancel.status === 'PENDING' ||
                  eventToCancel.status === 'UPDATING' ? (
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
                  {eventToCancel.status === 'PENDING' ||
                    eventToCancel.status === 'UPDATING' ? (
                    <>
                      • Hệ thống sẽ giải phóng slot
                      <br />
                      • Hành động này không thể hoàn tác
                    </>
                  ) : (
                    <>
                      • <strong>Hoàn lại tiền cho tất cả sinh viên</strong>
                      <br />
                      • Giải phóng địa điểm
                      <br />
                      • Không thể hoàn tác
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
                  Có, {eventToCancel.status === 'APPROVED' ? 'hủy sự kiện' : 'rút lại'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
