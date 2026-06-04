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
  RefreshCw,
  Clock,
  Calendar,
  Users,
  MapPin,
  CheckCircle2,
  Inbox,
  AlertCircle,
  FileText,
  User
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
  venueName?: string
  areaName?: string
  floor?: string
  areaCapacity?: number
}

/**
 * Kiểu dữ liệu EventRequest cho EventRequestDetailModal
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
  eventStatus?: string
  bannerUrl?: string
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

const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object'

const sanitizeEventRequest = (value: unknown): EventRequest | null => {
  if (!isRecord(value)) return null

  const requestId = Number(value.requestId ?? value.request_id ?? value.id)
  if (!Number.isFinite(requestId) || requestId <= 0) return null

  const status = String(value.status ?? 'PENDING').toUpperCase() as EventRequestStatus

  return {
    requestId,
    requesterId: Number(value.requesterId ?? value.requester_id ?? 0) || 0,
    requesterName: value.requesterName ?? value.requester_name ?? value.Organizer?.name,
    title: String(value.title ?? 'Yeu cau su kien'),
    description: value.description ? String(value.description) : undefined,
    preferredStartTime: value.preferredStartTime ?? value.preferred_start_time,
    preferredEndTime: value.preferredEndTime ?? value.preferred_end_time,
    expectedCapacity: Number(value.expectedCapacity ?? value.expected_capacity ?? 0) || undefined,
    status,
    createdAt: value.createdAt ?? value.created_at,
    processedBy: Number(value.processedBy ?? value.processed_by ?? 0) || undefined,
    processedByName: value.processedByName ?? value.processed_by_name,
    processedAt: value.processedAt ?? value.processed_at,
    organizerNote: value.organizerNote ?? value.organizer_note,
    createdEventId: Number(value.createdEventId ?? value.created_event_id ?? 0) || undefined,
    eventStatus: value.eventStatus ?? value.event_status,
    bannerUrl: value.bannerUrl ?? value.banner_url,
    venueName: value.venueName ?? value.venue_name ?? value.Venue?.name,
    areaName: value.areaName ?? value.area_name,
    floor: value.floor,
    areaCapacity: Number(value.areaCapacity ?? value.area_capacity ?? 0) || undefined,
  }
}

const normalizeTabResponse = (payload: unknown): ApiTabResponse => {
  const source = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  const rawRequests = isRecord(source) ? source.requests ?? source.data ?? source.items : source
  const requests = Array.isArray(rawRequests)
    ? rawRequests.map(sanitizeEventRequest).filter((req): req is EventRequest => req !== null)
    : []

  const rawTotal = isRecord(source) ? source.totalCount ?? source.total_count ?? source.total : undefined
  const totalCount = Number(rawTotal)

  return {
    requests,
    totalCount: Number.isFinite(totalCount) ? totalCount : requests.length,
  }
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
 * convertToModalRequest - Ensure all required fields for EventRequestDetailModal
 */
const convertToModalRequest = (request: EventRequest): EventRequestForModal => {
  return {
    ...request,
    description: request?.description || 'N/A',
    preferredStartTime: request?.preferredStartTime || new Date().toISOString(),
    preferredEndTime: request?.preferredEndTime || new Date().toISOString(),
    expectedCapacity: request?.expectedCapacity || 0,
    createdAt: request?.createdAt || new Date().toISOString(),
  }
}

/**
 * isRequestActiveTabEligible - Check if request should appear in "Chờ" (Active) tab
 */
const isRequestActiveTabEligible = (request: EventRequest): boolean => {
  if (request?.status === 'PENDING') {
    return true
  }
  if (request?.status === 'APPROVED' && request?.eventStatus === 'UPDATING') {
    return true
  }
  return false
}

/**
 * isRequestArchivedTabEligible - Check if request should appear in "Đã xử lý" (Archived) tab
 */
const isRequestArchivedTabEligible = (request: EventRequest): boolean => {
  if (request?.status === 'REJECTED' || request?.status === 'CANCELLED') {
    return true
  }
  if (request?.status === 'APPROVED') {
    const finishedStatuses = ['OPEN', 'CLOSED', 'CANCELLED', 'FINISHED']
    if (request?.eventStatus && finishedStatuses.includes(request.eventStatus)) {
      return true
    }
  }
  return false
}

/**
 * getDisplayStatus - Get status to display on Card badge
 */
const getDisplayStatus = (request: EventRequest): EventRequestStatus => {
  return request?.status ?? 'PENDING'
}

/**
 * =============================================================================
 * ORGANIZER EVENT REQUESTS PAGE - UPGRADED WITH DASHBOARD VISUALS
 * =============================================================================
 */
export default function OrganizerEventRequests() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [activeTabPage, setActiveTabPage] = useState(1)
  const [archivedTabPage, setArchivedTabPage] = useState(1)

  const [activeLoading, setActiveLoading] = useState(true)
  const [archivedLoading, setArchivedLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  const [activeTabData, setActiveTabData] = useState<ApiTabResponse>({
    requests: [],
    totalCount: 0,
  })
  const [archivedTabData, setArchivedTabData] = useState<ApiTabResponse>({
    requests: [],
    totalCount: 0,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTabStatusFilter, setActiveTabStatusFilter] = useState<EventRequestStatus | 'ALL'>('ALL')
  const [archivedTabStatusFilter, setArchivedTabStatusFilter] = useState<EventRequestStatus | 'ALL'>('ALL')

  const [selectedRequest, setSelectedRequest] = useState<EventRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [eventToCancel, setEventToCancel] = useState<EventRequest | null>(null)

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    fetchActiveRequests(1)
    fetchArchivedRequests(1)
  }, [refreshTrigger])

  const fetchActiveRequests = async (page: number) => {
    try {
      setActiveLoading(true)
      const offset = (page - 1) * ITEMS_PER_PAGE
      let url = `/api/event-requests/my/active?limit=${ITEMS_PER_PAGE}&offset=${offset}`
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`
      }

      const response = await fetch(url, {
        headers: {
          credentials: 'include',
        },
      })

      if (response.ok) {
        const data = await response.json().catch(() => null)
        setActiveTabData(normalizeTabResponse(data))
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

  const fetchArchivedRequests = async (page: number) => {
    try {
      setArchivedLoading(true)
      const offset = (page - 1) * ITEMS_PER_PAGE
      let url = `/api/event-requests/my/archived?limit=${ITEMS_PER_PAGE}&offset=${offset}`
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`
      }

      const response = await fetch(url, {
        headers: {
          credentials: 'include',
        },
      })

      if (response.ok) {
        const data = await response.json().catch(() => null)
        setArchivedTabData(normalizeTabResponse(data))
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

  const fetchEventRequestDetail = async (requestId: number) => {
    try {
      setIsDetailLoading(true)
      const response = await fetch(`/api/event-requests/${requestId}`, {
        headers: {
          credentials: 'include',
        },
      })

      if (response.ok) {
        const detailedRequest = sanitizeEventRequest(await response.json().catch(() => null))
        if (detailedRequest) {
          setSelectedRequest(detailedRequest)
        }
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

  const handleViewDetails = (request: EventRequest | null | undefined) => {
    if (!request?.requestId) return
    setSelectedRequest(request)
    setIsModalOpen(true)
    fetchEventRequestDetail(request.requestId)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedRequest(null)
  }

  const isEventEligibleForUpdate = (
    request: EventRequest | null | undefined,
  ): { eligible: boolean; reason: string } => {
    if (!request?.createdEventId) {
      return { eligible: false, reason: 'Sự kiện chưa được tạo' }
    }
    return { eligible: true, reason: '' }
  }

  const handleUpdateRequest = (request: EventRequest | null | undefined) => {
    if (!request?.requestId) return
    navigate(`/dashboard/event-requests/${request.requestId}/edit`)
  }

  const handleCancelClick = (request: EventRequest | null | undefined) => {
    if (!request?.requestId) return
    setEventToCancel(request)
    setShowCancelModal(true)
  }

  const confirmCancelEvent = async () => {
    if (!eventToCancel) {
      showToast('error', 'Không tìm thấy yêu cầu/sự kiện để hủy')
      return
    }

    const hasCreatedEvent = Boolean(eventToCancel?.createdEventId && eventToCancel.createdEventId > 0)

    if (hasCreatedEvent && !eventToCancel?.createdEventId) {
      showToast('error', 'Không tìm thấy sự kiện để hủy')
      return
    }

    try {
      const userIdStr = localStorage.getItem('userId')
      const payload = {
        eventId: hasCreatedEvent ? eventToCancel?.createdEventId : 0,
        requestId: hasCreatedEvent ? 0 : eventToCancel?.requestId,
      }

      const response = await fetch('/api/organizer/events/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          credentials: 'include',
          'X-User-Id': userIdStr || '',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        let successMessage = 'Hủy thành công'

        if (!hasCreatedEvent) {
          successMessage = 'Yêu cầu đã được rút lại thành công. Yêu cầu đã được chuyển vào mục Đã xử lý'
        } else {
          successMessage = 'Sự kiện đã được hủy và hoàn tiền thành công. Yêu cầu đã được chuyển vào mục Đã xử lý'
        }

        showToast('success', successMessage)
        setShowCancelModal(false)
        setEventToCancel(null)
        setRefreshTrigger(prev => prev + 1)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Không thể hủy')
      }
    } catch (error: any) {
      console.error('Error cancelling:', error)
      showToast('error', error.message || 'Lỗi hủy')
    }
  }

  const handleTabChange = (tab: 'active' | 'archived') => {
    setActiveTab(tab)
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    setActiveTabPage(1)
    setArchivedTabPage(1)
  }

  const handleSearchSubmit = () => {
    if (activeTab === 'active') {
      fetchActiveRequests(1)
    } else {
      fetchArchivedRequests(1)
    }
  }

  if (user?.role !== 'ORGANIZER') {
    return (
      <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 max-w-md mx-auto my-12 shadow-sm">
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 rounded-2xl w-fit mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <p className="text-slate-800 dark:text-slate-200 font-bold text-lg">Từ chối truy cập</p>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">Bạn không có quyền truy cập chức năng dành cho Ban tổ chức này.</p>
      </div>
    )
  }

  const activeRequests = Array.isArray(activeTabData?.requests) ? activeTabData.requests : []
  const archivedRequests = Array.isArray(archivedTabData?.requests) ? archivedTabData.requests : []
  const activeCount = Number.isFinite(Number(activeTabData?.totalCount)) ? Number(activeTabData.totalCount) : activeRequests.length
  const archivedCount = Number.isFinite(Number(archivedTabData?.totalCount)) ? Number(archivedTabData.totalCount) : archivedRequests.length
  const activeTabTotalPages = Math.max(1, Math.ceil(activeCount / ITEMS_PER_PAGE))
  const archivedTabTotalPages = Math.max(1, Math.ceil(archivedCount / ITEMS_PER_PAGE))
  const currentPage = activeTab === 'active' ? activeTabPage : archivedTabPage
  const currentTotalPages = activeTab === 'active' ? activeTabTotalPages : archivedTabTotalPages
  const currentLoading = activeTab === 'active' ? activeLoading : archivedLoading
  const currentRequests = activeTab === 'active' ? activeRequests : archivedRequests
  const currentTotalCount = activeTab === 'active' ? activeCount : archivedCount

  const filteredRequests = (Array.isArray(currentRequests) ? currentRequests : []).filter((req) => {
    if (!req) return false
    const tabValid =
      activeTab === 'active'
        ? isRequestActiveTabEligible(req)
        : isRequestArchivedTabEligible(req)

    if (!tabValid) return false

    const statusFilter =
      activeTab === 'active' ? activeTabStatusFilter : archivedTabStatusFilter
    if (statusFilter !== 'ALL' && req?.status !== statusFilter) {
      return false
    }

    return true
  })
  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen py-4 px-4 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight sm:text-4xl">Yêu Cầu Sự Kiện Của Tôi</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl font-medium">
            Theo dõi, cập nhật và quản lý trạng thái hồ sơ đăng ký tổ chức sự kiện của bạn.
          </p>
        </div>

        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={forceRefresh}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-orange-605 dark:hover:text-orange-400 border border-slate-200 dark:border-slate-800 hover:border-orange-500 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-300 active:scale-95"
          >
            <RefreshCw className="w-4 h-4 text-orange-500" /> Làm mới
          </button>
          
          <Link
            to="/dashboard/event-requests/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 active:scale-95 hover:scale-[1.02]"
          >
            <PlusCircle className="w-4 h-4" /> Gửi yêu cầu mới
          </Link>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-4">
        <div className="bg-white dark:bg-slate-900 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800 p-6 flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-500">
          <div className="p-3.5 bg-amber-50 dark:bg-amber-955/20 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-100/50 dark:border-amber-900/30">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hồ sơ chờ duyệt</p>
            <p className="text-3xl font-extrabold text-slate-950 dark:text-slate-50 mt-0.5 tracking-tight">{activeCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800 p-6 flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-500">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hồ sơ đã xử lý</p>
            <p className="text-3xl font-extrabold text-slate-950 dark:text-slate-50 mt-0.5 tracking-tight">{archivedCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800 p-6 flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-500">
          <div className="p-3.5 bg-orange-50 dark:bg-orange-955/20 text-orange-600 dark:text-orange-400 rounded-2xl border border-orange-100/50 dark:border-orange-900/30">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng cộng đã gửi</p>
            <p className="text-3xl font-extrabold text-slate-950 dark:text-slate-50 mt-0.5 tracking-tight">{activeCount + archivedCount}</p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Main Tabs Segmented Floating Control */}
      <div className="flex bg-slate-200/40 dark:bg-slate-900 backdrop-blur-sm p-1 rounded-2xl gap-1.5 w-fit mb-4 border border-slate-200/10 dark:border-slate-800 shadow-inner">
        <button
          onClick={() => handleTabChange('active')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'active'
              ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-md font-extrabold scale-102 border border-slate-100 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/40'
          }`}
        >
          Hồ sơ đang chờ duyệt
          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'active' ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-850 dark:text-orange-405' : 'bg-slate-300/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            {activeCount}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('archived')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'archived'
              ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-md font-extrabold scale-102 border border-slate-100 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/40'
          }`}
        >
          Lịch sử đã xử lý
          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'archived' ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-850 dark:text-orange-405' : 'bg-slate-300/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            {archivedCount}
          </span>
        </button>
      </div>

      {/* Filters & Toolbar Section */}
      <div className="mb-4 bg-white dark:bg-slate-900 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800 p-5 shadow-md">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
          {/* Search bar */}
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm kiếm hồ sơ theo tiêu đề..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearchSubmit()
                }
              }}
              className="w-full pl-10 pr-16 py-2.5 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm placeholder:text-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all font-medium text-slate-800 dark:text-slate-100 shadow-sm"
            />
            <button
              onClick={handleSearchSubmit}
              className="absolute right-2 px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-orange-600 hover:text-white dark:hover:bg-orange-600 dark:hover:text-white rounded-lg text-xs font-bold transition-all duration-300"
            >
              Tìm
            </button>
          </div>

          {/* Status select */}
          <div className="relative flex items-center min-w-[200px]">
            <select
              value={activeTab === 'active' ? activeTabStatusFilter : archivedTabStatusFilter}
              onChange={(e) => {
                if (activeTab === 'active') {
                  setActiveTabStatusFilter(e.target.value as EventRequestStatus | 'ALL')
                } else {
                  setArchivedTabStatusFilter(e.target.value as EventRequestStatus | 'ALL')
                }
              }}
              className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm text-slate-700 dark:text-slate-205 outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all appearance-none cursor-pointer font-medium shadow-sm"
            >
              <option value="ALL" className="dark:bg-slate-950">Tất cả trạng thái</option>
              {activeTab === 'active' && (
                <>
                  <option value="PENDING" className="dark:bg-slate-950">Chờ duyệt (PENDING)</option>
                  <option value="UPDATING" className="dark:bg-slate-950">Chờ cập nhật (UPDATING)</option>
                  <option value="APPROVED" className="dark:bg-slate-950">Đã duyệt (APPROVED)</option>
                </>
              )}
              {activeTab === 'archived' && (
                <>
                  <option value="REJECTED" className="dark:bg-slate-950">Bị từ chối (REJECTED)</option>
                  <option value="CANCELLED" className="dark:bg-slate-950">Đã hủy (CANCELLED)</option>
                  <option value="FINISHED" className="dark:bg-slate-950">Hoàn tất (FINISHED)</option>
                </>
              )}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
              <Filter className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Loading Block */}
      {currentLoading && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-16 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Đang tải hồ sơ của bạn...</p>
        </div>
      )}

      {/* Main List */}
      {!currentLoading && (
        <>
          {/* Metadata */}
          <div className="mb-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex justify-between items-center flex-wrap gap-2">
            <span>
              Tìm thấy <span className="text-blue-600 dark:text-blue-400 font-bold">{filteredRequests.length}</span> hồ sơ trên{' '}
              <span className="font-bold text-slate-700 dark:text-slate-300">{currentTotalCount}</span> yêu cầu
            </span>

            {searchQuery && (
              <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-lg text-[10px] font-bold border border-blue-100 dark:border-blue-900/35">
                Tìm: "{searchQuery}"
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setRefreshTrigger(prev => prev + 1)
                  }}
                  className="hover:text-red-650 dark:hover:text-red-400 font-black ml-1"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {/* Empty state */}
          {filteredRequests.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-16 text-center shadow-sm">
              <div className="p-4 bg-slate-50 dark:bg-slate-950/50 text-slate-300 dark:text-slate-655 rounded-full w-fit mx-auto mb-4">
                <FileClock className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Không tìm thấy yêu cầu nào</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 max-w-sm mx-auto">
                {activeTab === 'active'
                  ? 'Hiện bạn không có yêu cầu tổ chức sự kiện nào đang chờ xử lý.'
                  : 'Danh sách lịch sử xử lý của bạn trống.'}
              </p>
            </div>
          ) : (
            <>
              {/* Cards Grid */}
              <div className="grid grid-cols-1 gap-4 mb-4">
                {Array.isArray(filteredRequests) ? filteredRequests.map((req, index) => (
                  <div
                    key={req?.requestId ?? `request-${index}`}
                    className="animate-fade-in-up group relative overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white dark:bg-slate-900 backdrop-blur-md p-6 shadow-md hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-1 transition-all duration-500 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-5"
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => handleViewDetails(req)}
                  >
                    {/* Color Accent left bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      req?.status === 'PENDING' ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]' :
                      req?.status === 'APPROVED' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(10,185,129,0.5)]' :
                      req?.status === 'REJECTED' ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]' :
                      req?.status === 'UPDATING' ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 'bg-slate-450'
                    }`} />

                    <div className="flex-1 min-w-0 pl-1.5">
                      <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-orange-600 transition-colors duration-300">
                          {req?.title || 'Yêu cầu sự kiện'}
                        </h3>

                        {/* Status Badges with custom visual tags */}
                        {req?.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 shadow-sm shadow-amber-500/5">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            Chờ duyệt
                          </span>
                        ) : req?.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-450 border border-emerald-200/60 dark:border-emerald-900/40 shadow-sm shadow-emerald-500/5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã duyệt
                          </span>
                        ) : req?.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-455 border border-rose-200/60 dark:border-rose-900/40 shadow-sm shadow-rose-500/5">
                            <XCircle className="w-3.5 h-3.5" />
                            Từ chối
                          </span>
                        ) : req?.status === 'UPDATING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/40 shadow-sm shadow-blue-500/5">
                            <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                            Chờ cập nhật
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-350 border border-slate-200/60 dark:border-slate-700">
                            {getStatusLabel(req?.status ?? 'PENDING')}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mb-4 leading-relaxed font-medium">
                        {req?.description || 'N/A'}
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-500 dark:text-slate-400 font-bold">
                        {req?.createdAt && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-orange-500" />
                            <span>Gửi: <strong className="text-slate-700 dark:text-slate-300">{new Date(req.createdAt).toLocaleDateString('vi-VN')}</strong></span>
                          </div>
                        )}
                        {req?.expectedCapacity && (
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-orange-500" />
                            <span>Sức chứa: <strong className="text-slate-700 dark:text-slate-300">{req?.expectedCapacity} người</strong></span>
                          </div>
                        )}
                        {req?.preferredStartTime && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-orange-500" />
                            <span>Dự kiến: <strong className="text-slate-700 dark:text-slate-300">{new Date(req.preferredStartTime).toLocaleDateString('vi-VN')}</strong></span>
                          </div>
                        )}
                        {req?.processedByName && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-4 h-4 text-orange-500" />
                            <span>Duyệt bởi: <strong className="text-slate-700 dark:text-slate-300">{req?.processedByName}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons panel */}
                    {activeTab === 'active' && (
                      <div
                        className="flex gap-2 self-end sm:self-center ml-auto flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* APPROVED: Cập nhật button */}
                        {req?.status === 'APPROVED' && (() => {
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
                              title={!eligibility.eligible ? eligibility.reason : 'Cập nhật thông tin sự kiện'}
                              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-extrabold rounded-xl border transition-all duration-300 active:scale-95 ${
                                eligibility.eligible
                                  ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-600 hover:text-white dark:hover:bg-orange-600 dark:hover:text-white border-orange-200 dark:border-orange-900/50 shadow-sm hover:scale-[1.02]'
                                  : 'text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 cursor-not-allowed'
                              }`}
                            >
                              <Edit className="w-4 h-4" /> Cập nhật
                            </button>
                          )
                        })()}

                        {/* PENDING/UPDATING: Hủy yêu cầu button */}
                        {(req?.status === 'PENDING' || req?.status === 'UPDATING') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCancelClick(req)
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all duration-300 shadow-sm hover:shadow hover:scale-[1.02] active:scale-95"
                            title="Hủy/rút lại yêu cầu"
                          >
                            <XCircle className="w-4 h-4" /> Rút yêu cầu
                          </button>
                        )}

                        {/* APPROVED + createdEventId: Hủy sự kiện button */}
                        {req?.status === 'APPROVED' && req?.createdEventId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCancelClick(req)
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all duration-300 shadow-sm hover:shadow hover:scale-[1.02] active:scale-95"
                            title="Hủy/dừng sự kiện và hoàn tiền"
                          >
                            <XCircle className="w-4 h-4" /> Hủy sự kiện
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )) : null}
              </div>

              {/* Pagination controls */}
              {currentTotalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 bg-white dark:bg-slate-900 backdrop-blur-md rounded-3xl border border-white/80 dark:border-slate-800 p-5 shadow-md">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
                    Trang <span className="text-orange-600 dark:text-orange-400 font-extrabold">{currentPage}</span> /{' '}
                    <span className="text-slate-800 dark:text-slate-300 font-extrabold">{currentTotalPages}</span> ({currentTotalCount} hồ sơ)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newPage = Math.max(1, currentPage - 1)
                        if (activeTab === 'active') fetchActiveRequests(newPage)
                        else fetchArchivedRequests(newPage)
                      }}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-655 dark:text-slate-350 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 transition-all duration-300 shadow-sm"
                    >
                      ← Trước
                    </button>

                    {/* Page numbers */}
                    <div className="flex gap-1.5">
                      {Array.from({ length: currentTotalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => {
                            if (activeTab === 'active') fetchActiveRequests(page)
                            else fetchArchivedRequests(page)
                          }}
                          className={`w-9 h-9 rounded-xl text-xs font-bold transition-all duration-300 border ${
                            currentPage === page
                              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white border-transparent shadow-lg shadow-orange-500/20 scale-102 font-extrabold'
                              : 'border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-850 bg-white dark:bg-slate-900'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        const newPage = Math.min(currentTotalPages, currentPage + 1)
                        if (activeTab === 'active') fetchActiveRequests(newPage)
                        else fetchArchivedRequests(newPage)
                      }}
                      disabled={currentPage === currentTotalPages}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-655 dark:text-slate-350 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 transition-all duration-300 shadow-sm"
                    >
                      Sau →
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-55 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 rounded-xl">
                  <AlertCircle className="w-6 h-6 animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {eventToCancel?.status === 'PENDING' || eventToCancel?.status === 'UPDATING'
                    ? 'Rút yêu cầu đăng ký'
                    : 'Yêu cầu hủy sự kiện'}
                </h3>
              </div>

              <p className="text-sm text-slate-655 dark:text-slate-300 mb-4 leading-relaxed">
                {eventToCancel?.status === 'PENDING' ||
                eventToCancel?.status === 'UPDATING' ? (
                  <>
                    Bạn có chắc chắn muốn rút lại yêu cầu đăng ký{' '}
                    <strong className="text-slate-900 dark:text-slate-200">"{eventToCancel?.title || 'Yêu cầu sự kiện'}"</strong>?
                  </>
                ) : (
                  <>
                    Bạn có chắc chắn muốn dừng/hủy sự kiện{' '}
                    <strong className="text-slate-900 dark:text-slate-200">"{eventToCancel?.title || 'Yêu cầu sự kiện'}"</strong>?
                  </>
                )}
              </p>

              <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-xl p-4 mb-6 text-xs text-amber-800 dark:text-amber-400 space-y-2">
                <p className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wide">
                  ⚠️ Lưu ý quan trọng:
                </p>
                {eventToCancel?.status === 'PENDING' ||
                eventToCancel?.status === 'UPDATING' ? (
                  <ul className="list-disc pl-4 space-y-1 font-medium text-slate-600 dark:text-slate-400">
                    <li>Hệ thống sẽ lập tức giải phóng sảnh và lịch đã giữ chỗ.</li>
                    <li>Yêu cầu này sẽ được hủy và không thể khôi phục lại trạng thái.</li>
                  </ul>
                ) : (
                  <ul className="list-disc pl-4 space-y-1 font-medium text-slate-600 dark:text-slate-400">
                    <li>Hệ thống sẽ <strong>tự động hoàn tiền 100%</strong> trực tiếp vào ví của tất cả sinh viên đã mua vé.</li>
                    <li>Sảnh sự kiện và cấu hình vé của sự kiện sẽ lập tức được giải phóng.</li>
                    <li>Hành động hủy sự kiện này hoàn toàn không thể đảo ngược.</li>
                  </ul>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCancelModal(false)
                    setEventToCancel(null)
                  }}
                  className="px-4.5 py-2.5 border border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-350 font-semibold hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-sm"
                >
                  Không, giữ lại
                </button>
                <button
                  onClick={confirmCancelEvent}
                  className="px-5 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all active:scale-95 shadow-sm hover:shadow text-sm"
                >
                  Có, {eventToCancel?.status === 'APPROVED' ? 'hủy sự kiện' : 'rút lại'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
