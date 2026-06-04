// Import Link để chuyển trang trong SPA, useNavigate để điều hướng bằng code
import { useNavigate } from 'react-router-dom'

// Lấy thông tin user đăng nhập (role) từ AuthContext
import { useAuth } from '../contexts/AuthContext'

// ToastContext để hiển thị thông báo (success/error/warning)
import { useToast } from '../contexts/ToastContext'

// Import icon để hiển thị UI đẹp hơn
import { 
  CheckCircle2, 
  XCircle, 
  FileClock, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Clock, 
  User, 
  Users, 
  Calendar, 
  RefreshCw, 
  Inbox, 
  AlertCircle,
  FileText
} from 'lucide-react'

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

const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object'

const sanitizeEventRequest = (value: unknown): EventRequest | null => {
  if (!isRecord(value)) return null

  const requestId = Number(value.requestId ?? value.request_id ?? value.id)
  if (!Number.isFinite(requestId) || requestId <= 0) return null

  return {
    requestId,
    requesterId: Number(value.requesterId ?? value.requester_id ?? 0) || 0,
    requesterName: value.requesterName ?? value.requester_name ?? value.Organizer?.name,
    title: String(value.title ?? 'Yêu cầu sự kiện'),
    description: String(value.description ?? 'N/A'),
    preferredStartTime: String(value.preferredStartTime ?? value.preferred_start_time ?? ''),
    preferredEndTime: String(value.preferredEndTime ?? value.preferred_end_time ?? ''),
    expectedCapacity: Number(value.expectedCapacity ?? value.expected_capacity ?? 0) || 0,
    status: String(value.status ?? 'PENDING').toUpperCase() as EventRequestStatus,
    createdAt: String(value.createdAt ?? value.created_at ?? new Date().toISOString()),
    processedBy: Number(value.processedBy ?? value.processed_by ?? 0) || undefined,
    processedByName: value.processedByName ?? value.processed_by_name,
    processedAt: value.processedAt ?? value.processed_at,
    organizerNote: value.organizerNote ?? value.organizer_note,
    createdEventId: Number(value.createdEventId ?? value.created_event_id ?? 0) || undefined,
    bannerUrl: value.bannerUrl ?? value.banner_url,
  }
}

const normalizeEventRequestsPayload = (payload: unknown): EventRequest[] => {
  const source = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  const buckets = ['pending', 'approved', 'rejected', 'cancelled', 'updating', 'finished']

  if (isRecord(source) && buckets.some((bucket) => Array.isArray(source[bucket]))) {
    return buckets
      .flatMap((bucket) => (Array.isArray(source[bucket]) ? source[bucket] : []))
      .map(sanitizeEventRequest)
      .filter((req): req is EventRequest => req !== null)
  }

  const rawRequests = isRecord(source) ? source.requests ?? source.data ?? source.items : source
  return Array.isArray(rawRequests)
    ? rawRequests.map(sanitizeEventRequest).filter((req): req is EventRequest => req !== null)
    : []
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
    default:
      return 'Chờ duyệt'
  }
}

/**
 * =============================================================================
 * STAFF EVENT REQUESTS PAGE - UPGRADED WITH DASHBOARD VISUALS
 * =============================================================================
 */
export default function StaffEventRequests() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [allWaitingRequests, setAllWaitingRequests] = useState<EventRequest[]>([])
  const [allProcessedRequests, setAllProcessedRequests] = useState<EventRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<EventRequestStatus | ''>('')
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7days' | '30days'>('all')

  const [selectedRequest, setSelectedRequest] = useState<EventRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false)
  const [processAction, setProcessAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [requestToProcess, setRequestToProcess] = useState<EventRequest | null>(null)

  const [activeTab, setActiveTab] = useState<'waiting' | 'processed'>('waiting')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    fetchEventRequests()
  }, [refreshTrigger])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, dateRangeFilter])

  const fetchEventRequests = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/staff/event-requests', {
        headers: {
          credentials: 'include',
        },
      })

      if (response.ok) {
        const data = await response.json().catch(() => null)
        const allRequests = normalizeEventRequestsPayload(data)

        const waiting = (Array.isArray(allRequests) ? allRequests : []).filter(
          (req) => req?.status === 'PENDING' || req?.status === 'UPDATING',
        )

        const processed = (Array.isArray(allRequests) ? allRequests : []).filter(
          (req) =>
            req?.status === 'APPROVED' ||
            req?.status === 'REJECTED' ||
            req?.status === 'CANCELLED' ||
            req?.status === 'FINISHED',
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

  const applyFilters = (requests: EventRequest[]): EventRequest[] => {
    let filtered = Array.isArray(requests) ? requests.filter(Boolean) : []

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (req) =>
          (req?.title ?? '').toLowerCase().includes(query) ||
          (req?.requesterName?.toLowerCase().includes(query) ?? false),
      )
    }

    if (statusFilter) {
      filtered = filtered.filter((req) => req?.status === statusFilter)
    }

    if (dateRangeFilter !== 'all') {
      const now = new Date()
      const daysAgo = dateRangeFilter === '7days' ? 7 : 30
      const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)

      filtered = filtered.filter((req) => {
        const createdDate = new Date(req?.createdAt ?? '')
        return createdDate >= cutoffDate
      })
    }

    return filtered
  }

  const currentRequests = activeTab === 'waiting' ? allWaitingRequests : allProcessedRequests
  const filteredRequests = applyFilters(Array.isArray(currentRequests) ? currentRequests : [])
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE))
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  const handleViewDetails = (request: EventRequest | null | undefined) => {
    if (!request?.requestId) return
    setSelectedRequest(request)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedRequest(null)
  }

  const handleApprove = (request: EventRequest | null | undefined) => {
    if (!request?.requestId) return
    setRequestToProcess(request)
    setProcessAction('APPROVE')
    setIsProcessModalOpen(true)
  }

  const handleReject = (request: EventRequest | null | undefined) => {
    if (!request?.requestId) return
    setRequestToProcess(request)
    setProcessAction('REJECT')
    setIsProcessModalOpen(true)
  }

  const handleProcessRequest = async (
    areaId: number,
    organizerNote: string,
    rejectReason?: string,
  ) => {
    if (!requestToProcess) return

    try {
      const payload = {
        requestId: requestToProcess?.requestId,
        action: processAction === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        organizerNote: processAction === 'APPROVE' ? organizerNote : null,
        rejectReason: processAction === 'REJECT' ? rejectReason : null,
        areaId: areaId,
      }

      const response = await fetch('/api/event-requests/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          credentials: 'include',
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

  if (user?.role !== 'STAFF') {
    return (
      <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl p-8 max-w-md mx-auto my-12 shadow-sm">
        <div className="p-3.5 bg-rose-50 text-rose-500 rounded-2xl w-fit mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <p className="text-slate-800 font-bold text-lg">Từ chối truy cập</p>
        <p className="text-slate-500 text-sm mt-1.5">Bạn không có quyền truy cập chức năng dành cho Nhân viên này.</p>
      </div>
    )
  }

  const waitingCount = allWaitingRequests.length
  const processedCount = allProcessedRequests.length
  const canRenderRequestList =
    Array.isArray(filteredRequests) &&
    Array.isArray(paginatedRequests) &&
    Number.isFinite(currentPage) &&
    Number.isFinite(totalPages)

  if (!canRenderRequestList) {
    return (
      <div className="min-h-[60vh] bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          <p className="text-base font-bold text-slate-900">Dang tai danh sach yeu cau</p>
          <p className="mt-2 text-sm text-slate-500">Du lieu dang duoc khoi tao lai an toan.</p>
        </div>
      </div>
    )
  }

  const forceRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
    showToast('info', 'Đã cập nhật danh sách yêu cầu')
  }

  return (
    <div className="bg-gradient-to-br from-orange-50/20 via-slate-50 to-amber-50/10 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 border-b border-slate-200/60 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            Duyệt Yêu Cầu Sự Kiện
          </h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl font-medium">
            Hệ thống quản lý, thẩm định hồ sơ và cấp phép tổ chức sự kiện từ Ban tổ chức sinh viên.
          </p>
        </div>
        <button
          onClick={forceRefresh}
          className="self-start md:self-auto inline-flex items-center gap-2 px-5 py-2.5 bg-white text-slate-700 hover:text-orange-600 border border-slate-200 hover:border-orange-500 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-300 active:scale-95 animate-in fade-in duration-200"
        >
          <RefreshCw className="w-4 h-4 text-orange-500" /> Làm mới
        </button>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-6 flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-500">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100/50">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chờ thẩm định</p>
            <p className="text-3xl font-extrabold text-slate-950 mt-0.5 tracking-tight">{waitingCount}</p>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-6 flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-500">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100/50">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đã giải quyết</p>
            <p className="text-3xl font-extrabold text-slate-950 mt-0.5 tracking-tight">{processedCount}</p>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-6 flex items-center gap-4 shadow-md hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-500">
          <div className="p-3.5 bg-orange-50 text-orange-600 rounded-2xl border border-orange-100/50">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng số hồ sơ</p>
            <p className="text-3xl font-extrabold text-slate-950 mt-0.5 tracking-tight">{waitingCount + processedCount}</p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Main Tabs Segmented Floating Control */}
      <div className="flex bg-slate-200/40 backdrop-blur-sm p-1 rounded-2xl gap-1.5 w-fit mb-8 border border-slate-200/10 shadow-inner">
        <button
          onClick={() => {
            setActiveTab('waiting')
            setCurrentPage(1)
          }}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'waiting'
              ? 'bg-white text-orange-600 shadow-md font-extrabold scale-102 border border-slate-100'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'
          }`}
        >
          Hồ sơ chờ xử lý
          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'waiting' ? 'bg-orange-100 text-orange-850' : 'bg-slate-300/50 text-slate-500'
          }`}>
            {waitingCount}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('processed')
            setCurrentPage(1)
          }}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'processed'
              ? 'bg-white text-orange-600 shadow-md font-extrabold scale-102 border border-slate-100'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/20'
          }`}
        >
          Hồ sơ đã giải quyết
          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full transition-colors ${
            activeTab === 'processed' ? 'bg-orange-100 text-orange-850' : 'bg-slate-300/50 text-slate-500'
          }`}>
            {processedCount}
          </span>
        </button>
      </div>

      {/* Toolbar: Search & Filters */}
      <div className="mb-6 bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-5 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm theo tiêu đề, ban tổ chức..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all font-medium text-slate-800 shadow-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EventRequestStatus | '')}
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200/80 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all appearance-none cursor-pointer font-medium shadow-sm"
            >
              <option value="">Tất cả trạng thái</option>
              {activeTab === 'waiting' && (
                <>
                  <option value="PENDING">Chờ duyệt (PENDING)</option>
                  <option value="UPDATING">Chờ cập nhật (UPDATING)</option>
                </>
              )}
              {activeTab === 'processed' && (
                <>
                  <option value="APPROVED">Đã duyệt (APPROVED)</option>
                  <option value="REJECTED">Từ chối (REJECTED)</option>
                  <option value="CANCELLED">Đã hủy (CANCELLED)</option>
                  <option value="FINISHED">Hoàn tất (FINISHED)</option>
                </>
              )}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
              <Filter className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Date range filter */}
          <div className="relative">
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value as typeof dateRangeFilter)}
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200/80 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all appearance-none cursor-pointer font-medium shadow-sm"
            >
              <option value="all">Tất cả thời gian</option>
              <option value="7days">7 ngày qua</option>
              <option value="30days">30 ngày qua</option>
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Loading Block */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-500">Đang tải danh sách yêu cầu sự kiện...</p>
        </div>
      )}

      {/* Main List view */}
      {!loading && (
        <>
          <div className="mb-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Hiển thị <span className="text-blue-600 font-bold">{paginatedRequests.length}</span> trên{' '}
            <span className="font-bold text-slate-700">{filteredRequests.length}</span> hồ sơ
          </div>

          {/* Empty state */}
          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
              <div className="p-4 bg-slate-50 text-slate-300 rounded-full w-fit mx-auto mb-4">
                <FileClock className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Không tìm thấy hồ sơ nào</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
                {activeTab === 'waiting'
                  ? 'Tuyệt vời! Hiện không có hồ sơ yêu cầu tổ chức sự kiện nào đang chờ xử lý.'
                  : 'Chưa ghi nhận lịch sử xử lý cấp phép nào.'}
              </p>
            </div>
          ) : (
            <>
              {/* Cards Grid */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                {Array.isArray(paginatedRequests) ? paginatedRequests.map((req, index) => (
                  <div
                    key={req?.requestId ?? `request-${index}`}
                    className="animate-fade-in-up group relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 backdrop-blur-md p-6 shadow-md hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500 hover:-translate-y-1 transition-all duration-500 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-5"
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => handleViewDetails(req)}
                  >
                    {/* Visual left accent bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      req?.status === 'PENDING' ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]' :
                      req?.status === 'APPROVED' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' :
                      req?.status === 'REJECTED' ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]' :
                      req?.status === 'UPDATING' ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 'bg-slate-450'
                    }`} />

                    <div className="flex-1 min-w-0 pl-1.5">
                      <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                        <h3 className="text-lg font-bold text-slate-900 truncate group-hover:text-orange-600 transition-colors duration-300">
                          {req?.title || 'Yêu cầu sự kiện'}
                        </h3>
                        
                        {/* Status Badges with Custom Styles */}
                        {req?.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60 shadow-sm shadow-amber-500/5">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            Chờ duyệt
                          </span>
                        ) : req?.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm shadow-emerald-500/5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Đã duyệt
                          </span>
                        ) : req?.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60 shadow-sm shadow-rose-500/5">
                            <XCircle className="w-3.5 h-3.5" />
                            Từ chối
                          </span>
                        ) : req?.status === 'UPDATING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60 shadow-sm shadow-blue-500/5">
                            <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                            Chờ cập nhật
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200/60">
                            {getStatusLabel(req?.status ?? 'PENDING')}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-500 line-clamp-2 mb-4 leading-relaxed font-medium">
                        {req?.description || 'N/A'}
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-500 font-bold">
                        <div className="flex items-center gap-1.5">
                          <User className="w-4 h-4 text-orange-500" />
                          <span>Ban tổ chức: <strong className="text-slate-700">{req?.requesterName || 'N/A'}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-orange-500" />
                          <span>Dự kiến: <strong className="text-slate-700">{req?.expectedCapacity ?? 0} người</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-orange-500" />
                          <span>Ngày gửi: <strong className="text-slate-700">{req?.createdAt ? new Date(req.createdAt).toLocaleDateString('vi-VN') : 'N/A'}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-orange-500" />
                          <span>Tổ chức: <strong className="text-slate-700">{req?.preferredStartTime ? new Date(req.preferredStartTime).toLocaleDateString('vi-VN') : 'N/A'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons panel */}
                    {activeTab === 'waiting' && (
                      <div
                        className="flex gap-2 self-end md:self-center ml-auto flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleReject(req)}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-600 hover:text-white transition-all duration-300 shadow-sm active:scale-95 hover:scale-[1.02]"
                          title="Từ chối yêu cầu"
                        >
                          <XCircle className="w-4 h-4" /> Từ chối
                        </button>
                        <button
                          onClick={() => handleApprove(req)}
                          className="inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-orange-650 via-orange-600 to-orange-500 border border-transparent rounded-xl hover:shadow-lg hover:shadow-orange-500/20 transition-all duration-300 active:scale-95 hover:scale-[1.02]"
                          title="Duyệt yêu cầu"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Duyệt cấp phép
                        </button>
                      </div>
                    )}
                  </div>
                )) : null}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-5 shadow-md">
                  <div className="text-sm text-slate-500 font-semibold">
                    Trang <span className="text-orange-600 font-extrabold">{currentPage}</span> /{' '}
                    <span className="text-slate-800 font-extrabold">{totalPages}</span> ({filteredRequests.length} hồ sơ)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-650 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-all duration-300 shadow-sm"
                    >
                      ← Trước
                    </button>

                    {/* Page numbers */}
                    <div className="flex gap-1.5">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-9 h-9 rounded-xl text-xs font-bold transition-all duration-300 border ${
                            currentPage === page
                              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white border-transparent shadow-lg shadow-orange-500/20 scale-102 font-extrabold'
                              : 'border-slate-200 text-slate-600 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-650 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-all duration-300 shadow-sm"
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

      {/* Event Request Detail Modal */}
      {selectedRequest && (
        <EventRequestDetailModal
          request={selectedRequest}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      {/* Process Request Modal */}
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
