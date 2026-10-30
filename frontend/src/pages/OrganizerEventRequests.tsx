import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
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
  User,
  Settings,
  Globe,
  Video,
  ExternalLink,
  Eye,
  Sparkles,
  GraduationCap
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { EventRequestDetailModal } from '../components/events/EventRequestDetailModal'
import { EventDetailModal } from '../components/events/EventDetailModal'
import { EventConfigModal } from '../components/events/EventConfigModal'
import { formatEventLocation } from '../utils/location'
import type { EventListItem, EventDetail } from '../types/event'

const ITEMS_PER_PAGE = 10

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
  eventStatus?: string
  bannerUrl?: string
  venueName?: string
  areaName?: string
  floor?: string
  areaCapacity?: number
  rejectReason?: string
  eventFormat?: string
  customVenueName?: string
  customLocation?: string
  orgType?: string
  privacyStatus?: string
  onlineMeetingUrl?: string
  onlineMeetingId?: string
  onlineMeetingSecret?: string
}

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
  rejectReason?: string
  eventFormat?: string
  customVenueName?: string
  customLocation?: string
  orgType?: string
  privacyStatus?: string
  onlineMeetingUrl?: string
  onlineMeetingId?: string
  onlineMeetingSecret?: string
}

type ApiTabResponse = {
  requests: EventRequest[]
  totalCount: number
}

const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object'

const getValidDateString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return /\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed : undefined
}

const formatSafeDate = (value: unknown): string => {
  const dateStr = getValidDateString(value)
  if (!dateStr) return '---'

  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return '---'

  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

const sanitizeEventRequest = (value: unknown): EventRequest | null => {
  if (!isRecord(value)) return null

  const requestId = Number(value.requestId ?? value.request_id ?? value.id)
  if (!Number.isFinite(requestId) || requestId <= 0) return null

  const status = String(value.status ?? 'PENDING').toUpperCase() as EventRequestStatus

  return {
    requestId,
    requesterId: Number(value.requesterId ?? value.requester_id ?? 0) || 0,
    requesterName: value.requesterName ?? value.requester_name ?? value.Organizer?.name,
    title: String(value.title ?? 'Yêu cầu sự kiện'),
    description: value.description ? String(value.description) : undefined,
    preferredStartTime: getValidDateString(value.preferredStartTime ?? value.preferred_start_time),
    preferredEndTime: getValidDateString(value.preferredEndTime ?? value.preferred_end_time),
    expectedCapacity: Number(value.expectedCapacity ?? value.expected_capacity ?? 0) || undefined,
    status,
    createdAt: getValidDateString(value.createdAt ?? value.created_at),
    processedBy: Number(value.processedBy ?? value.processed_by ?? 0) || undefined,
    processedByName: value.processedByName ?? value.processed_by_name,
    processedAt: getValidDateString(value.processedAt ?? value.processed_at),
    organizerNote: value.organizerNote ?? value.organizer_note,
    createdEventId: Number(value.createdEventId ?? value.created_event_id ?? 0) || undefined,
    eventStatus: value.eventStatus ?? value.event_status,
    bannerUrl: value.bannerUrl ?? value.banner_url,
    venueName: value.venueName ?? value.venue_name ?? value.Venue?.name,
    areaName: value.areaName ?? value.area_name,
    floor: value.floor,
    areaCapacity: Number(value.areaCapacity ?? value.area_capacity ?? 0) || undefined,
    rejectReason: value.rejectReason ?? value.reject_reason,
    eventFormat: value.eventFormat ?? value.event_format,
    customVenueName: value.customVenueName ?? value.custom_venue_name,
    customLocation: value.customLocation ?? value.custom_location,
    orgType: value.orgType ?? value.org_type,
    privacyStatus: value.privacyStatus ?? value.privacy_status,
    onlineMeetingUrl: value.onlineMeetingUrl ?? value.online_meeting_url,
    onlineMeetingId: value.onlineMeetingId ?? value.online_meeting_id,
    onlineMeetingSecret: value.onlineMeetingSecret ?? value.online_meeting_secret,
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

const convertToModalRequest = (request: EventRequest): EventRequestForModal => {
  return {
    ...request,
    description: request?.description || 'N/A',
    preferredStartTime: getValidDateString(request?.preferredStartTime) || '',
    preferredEndTime: getValidDateString(request?.preferredEndTime) || '',
    expectedCapacity: request?.expectedCapacity || 0,
    createdAt: getValidDateString(request?.createdAt) || '',
  }
}

export default function OrganizerEventRequests() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // 2 main categories: "Sự Kiện Trường Học" vs "Sự Kiện Tự Do"
  const [mainCategory, setMainCategory] = useState<'UNIVERSITY' | 'INDEPENDENT'>('UNIVERSITY')

  // Sub-tabs for "Sự Kiện Trường Học": UPDATING (Cập nhật), PENDING (Chờ duyệt), PROCESSED (Đã xử lý)
  const [schoolSubTab, setSchoolSubTab] = useState<'UPDATING' | 'PENDING' | 'PROCESSED'>('UPDATING')

  // Sub-tabs for "Sự Kiện Tự Do": UPDATING (Cập nhật), PROCESSED (Đã xử lý)
  const [indepSubTab, setIndepSubTab] = useState<'UPDATING' | 'PROCESSED'>('UPDATING')

  // Pagination page state
  const [currentPage, setCurrentPage] = useState(1)

  // Loading & error
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // Requests Data for University events
  const [schoolRequests, setSchoolRequests] = useState<EventRequest[]>([])

  // Requests Data for Independent events
  const [independentEvents, setIndependentEvents] = useState<EventListItem[]>([])

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Modals state
  const [selectedRequest, setSelectedRequest] = useState<EventRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [selectedDetailEvent, setSelectedDetailEvent] = useState<EventDetail | null>(null)
  const [isDetailEventModalOpen, setIsDetailEventModalOpen] = useState(false)
  const [loadingDetailEvent, setLoadingDetailEvent] = useState(false)

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [selectedConfigEventId, setSelectedConfigEventId] = useState<number>(0)
  const [selectedConfigEventTitle, setSelectedConfigEventTitle] = useState<string>('')

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [eventToCancel, setEventToCancel] = useState<EventRequest | null>(null)

  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const forceRefresh = () => setRefreshTrigger(prev => prev + 1)

  // Reset page to 1 when switching category or sub-tab
  useEffect(() => {
    setCurrentPage(1)
    setStatusFilter('ALL')
  }, [mainCategory, schoolSubTab, indepSubTab])

  // Fetch School Requests (both active and archived)
  const fetchSchoolRequests = useCallback(async () => {
    try {
      const [resActive, resArchived] = await Promise.all([
        fetch('/api/event-requests/my/active?limit=200&offset=0', { credentials: 'include' }),
        fetch('/api/event-requests/my/archived?limit=200&offset=0', { credentials: 'include' }),
      ])

      const list: EventRequest[] = []
      const seen = new Set<number>()

      if (resActive.ok) {
        const data = await resActive.json().catch(() => null)
        const parsed = normalizeTabResponse(data).requests
        parsed.forEach(r => {
          if (!seen.has(r.requestId)) {
            seen.add(r.requestId)
            list.push(r)
          }
        })
      }

      if (resArchived.ok) {
        const data = await resArchived.json().catch(() => null)
        const parsed = normalizeTabResponse(data).requests
        parsed.forEach(r => {
          if (!seen.has(r.requestId)) {
            seen.add(r.requestId)
            list.push(r)
          }
        })
      }

      setSchoolRequests(list)
    } catch (err: any) {
      console.error('Error fetching school requests:', err)
      setError(err.message || 'Lỗi tải hồ sơ sự kiện trường học')
    }
  }, [])

  // Fetch Independent Events
  const fetchIndependentEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/events?limit=200&page=1', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        const allEvts: EventListItem[] = data.data || []
        const myIndep = allEvts.filter(
          evt => (evt.organizerId === user?.id || !evt.organizerId) &&
                 (evt.orgType === 'FREE' || evt.eventFormat === 'ONLINE' || evt.customLocation || evt.customVenueName)
        )
        setIndependentEvents(myIndep)
      }
    } catch (err) {
      console.error('Error fetching independent events:', err)
    }
  }, [user?.id])

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      await Promise.all([fetchSchoolRequests(), fetchIndependentEvents()])
      setLoading(false)
    }
    void loadAll()
  }, [refreshTrigger, fetchSchoolRequests, fetchIndependentEvents])

  useEffect(() => {
    if (location.state && (location.state as any).refetch) {
      window.history.replaceState({}, document.title)
      forceRefresh()
    }
  }, [location.state])

  // Modals & Actions
  const handleOpenEventDetail = async (eventId: number) => {
    try {
      setLoadingDetailEvent(true)
      setIsDetailEventModalOpen(true)
      const res = await fetch(`/api/events/detail?id=${eventId}`, { credentials: 'include' })
      if (res.ok) {
        const detail = await res.json()
        setSelectedDetailEvent(detail)
      } else {
        showToast('error', 'Không thể tải chi tiết sự kiện')
      }
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi tải chi tiết sự kiện')
    } finally {
      setLoadingDetailEvent(false)
    }
  }

  const fetchEventRequestDetail = async (requestId: number) => {
    try {
      setIsDetailLoading(true)
      const response = await fetch(`/api/event-requests/${requestId}`, { credentials: 'include' })
      if (response.ok) {
        const detailedRequest = sanitizeEventRequest(await response.json().catch(() => null))
        if (detailedRequest) {
          setSelectedRequest(detailedRequest)
        }
      }
    } catch (err) {
      console.error('Error fetching detail:', err)
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

  // Handle click on "Chi tiết" button for a School Event Request
  const handleSchoolDetailButtonClick = async (req: EventRequest) => {
    // 1. Nếu đã có createdEventId hợp lệ -> Mở slide modal chi tiết sự kiện công khai (Hình 4)
    if (req.createdEventId && req.createdEventId > 0) {
      await handleOpenEventDetail(req.createdEventId)
      return
    }

    // 2. Nếu là hồ sơ chưa duyệt (PENDING) hoặc chưa được tạo event chính thức
    // thông báo nhẹ cho người dùng hiểu và mở popup chi tiết hồ sơ yêu cầu (Hình 2)
    const isPending = (req.status || '').toUpperCase() === 'PENDING'
    if (isPending) {
      showToast('info', 'Hồ sơ đang chờ duyệt, chưa có trang sự kiện công khai. Đang mở chi tiết đề xuất.')
    }
    handleViewDetails(req)
  }

  const confirmCancelEvent = async () => {
    if (!eventToCancel) return
    const hasCreatedEvent = Boolean(eventToCancel.createdEventId && eventToCancel.createdEventId > 0)

    try {
      const userIdStr = localStorage.getItem('userId')
      const payload = {
        eventId: hasCreatedEvent ? eventToCancel.createdEventId : 0,
        requestId: hasCreatedEvent ? 0 : eventToCancel.requestId,
      }

      const response = await fetch('/api/organizer/events/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userIdStr || '',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        showToast('success', hasCreatedEvent ? 'Sự kiện đã được hủy và hoàn tiền thành công' : 'Rút yêu cầu thành công')
        setShowCancelModal(false)
        setEventToCancel(null)
        forceRefresh()
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Không thể hủy')
      }
    } catch (error: any) {
      showToast('error', error.message || 'Lỗi hủy')
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

  // Helper filters for School Events
  // 1. Cập nhật sự kiện: status OPEN hoặc UPDATING
  const isSchoolUpdating = (req: EventRequest) => {
    const s = (req.status || '').toUpperCase()
    const es = (req.eventStatus || '').toUpperCase()
    return es === 'OPEN' || es === 'UPDATING' || s === 'UPDATING' || (s === 'APPROVED' && (!es || es === 'UPDATING' || es === 'OPEN'))
  }

  // 2. Hồ sơ đang chờ duyệt: status PENDING
  const isSchoolPending = (req: EventRequest) => {
    return (req.status || '').toUpperCase() === 'PENDING'
  }

  // 3. Sự kiện đã xử lý: CANCELLED, CLOSED, APPROVED (đã kết thúc), DENIED (REJECTED), EXPIRED
  const isSchoolProcessed = (req: EventRequest) => {
    const s = (req.status || '').toUpperCase()
    const es = (req.eventStatus || '').toUpperCase()
    if (s === 'REJECTED' || s === 'CANCELLED' || s === 'EXPIRED') return true
    if (es === 'CLOSED' || es === 'CANCELLED' || es === 'FINISHED') return true
    if (s === 'APPROVED' && (es === 'CLOSED' || es === 'FINISHED' || es === 'CANCELLED')) return true
    if (!isSchoolUpdating(req) && !isSchoolPending(req)) return true
    return false
  }

  // Helper filters for Independent Events
  // 1. Cập nhật sự kiện: status OPEN hoặc UPDATING
  const isIndepUpdating = (evt: EventListItem) => {
    const s = (evt.status || '').toUpperCase()
    return s === 'OPEN' || s === 'UPDATING'
  }

  // 2. Sự kiện đã xử lý: CANCELLED hoặc CLOSED (hoặc FINISHED)
  const isIndepProcessed = (evt: EventListItem) => {
    const s = (evt.status || '').toUpperCase()
    return s === 'CANCELLED' || s === 'CLOSED' || s === 'FINISHED' || !isIndepUpdating(evt)
  }

  // Counts for School sub-tabs
  const schoolUpdatingCount = schoolRequests.filter(isSchoolUpdating).length
  const schoolPendingCount = schoolRequests.filter(isSchoolPending).length
  const schoolProcessedCount = schoolRequests.filter(isSchoolProcessed).length
  const schoolTotalCount = schoolRequests.length

  // Counts for Independent sub-tabs
  const indepUpdatingCount = independentEvents.filter(isIndepUpdating).length
  const indepProcessedCount = independentEvents.filter(isIndepProcessed).length
  const independentTotalCount = independentEvents.length

  // Filtered items based on active sub-tab and search/status filter
  const q = searchQuery.toLowerCase().trim()

  const currentSchoolList = schoolRequests.filter((req) => {
    if (schoolSubTab === 'UPDATING' && !isSchoolUpdating(req)) return false
    if (schoolSubTab === 'PENDING' && !isSchoolPending(req)) return false
    if (schoolSubTab === 'PROCESSED' && !isSchoolProcessed(req)) return false

    if (q) {
      const matchTitle = req.title?.toLowerCase().includes(q)
      const matchDesc = req.description?.toLowerCase().includes(q)
      const matchVenue = (req.venueName || '').toLowerCase().includes(q)
      const matchArea = (req.areaName || '').toLowerCase().includes(q)
      if (!matchTitle && !matchDesc && !matchVenue && !matchArea) return false
    }

    if (statusFilter !== 'ALL') {
      const matchStatus = req.status === statusFilter || req.eventStatus === statusFilter
      if (!matchStatus) return false
    }

    return true
  })

  const currentIndepList = independentEvents.filter((evt) => {
    if (indepSubTab === 'UPDATING' && !isIndepUpdating(evt)) return false
    if (indepSubTab === 'PROCESSED' && !isIndepProcessed(evt)) return false

    if (q) {
      const matchTitle = evt.title?.toLowerCase().includes(q)
      const matchDesc = evt.description?.toLowerCase().includes(q)
      const matchLoc = (evt.customLocation || evt.customVenueName || evt.location || '').toLowerCase().includes(q)
      if (!matchTitle && !matchDesc && !matchLoc) return false
    }

    if (statusFilter !== 'ALL' && evt.status !== statusFilter) {
      return false
    }

    return true
  })

  // Pagination calculation
  const activeListLength = mainCategory === 'UNIVERSITY' ? currentSchoolList.length : currentIndepList.length
  const totalPages = Math.max(1, Math.ceil(activeListLength / ITEMS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedSchoolList = currentSchoolList.slice((safeCurrentPage - 1) * ITEMS_PER_PAGE, safeCurrentPage * ITEMS_PER_PAGE)
  const paginatedIndepList = currentIndepList.slice((safeCurrentPage - 1) * ITEMS_PER_PAGE, safeCurrentPage * ITEMS_PER_PAGE)

  return (
    <div className="w-full min-h-screen p-3 sm:p-4 md:p-6 text-slate-900 dark:text-slate-100 bg-transparent">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 sm:mb-5 gap-3 sm:gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-3 sm:pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
            Yêu Cầu Sự Kiện Của Tôi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl font-medium">
            Quản lý tập trung các đề xuất cơ sở vật chất trường FPT và sự kiện tự do.
          </p>
        </div>

        {/* Action buttons: side by side on mobile */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={forceRefresh}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400 border border-slate-200 dark:border-slate-800 hover:border-orange-500 rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all active:scale-95 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span>Làm mới</span>
          </button>

          <Link
            to="/dashboard/event-requests/create"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 transition-all active:scale-95 whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Gửi yêu cầu mới</span>
          </Link>
        </div>
      </div>

      {/* Top Stats Overview: 4 columns in 1 single row on all screen sizes */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-4 mb-3 sm:mb-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200/60 dark:border-slate-800 p-2 sm:p-4 shadow-sm min-w-0">
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 mb-0.5">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[8px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">Cập nhật</span>
          </div>
          <p className="text-base sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {mainCategory === 'UNIVERSITY' ? schoolUpdatingCount : indepUpdatingCount}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200/60 dark:border-slate-800 p-2 sm:p-4 shadow-sm min-w-0">
          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mb-0.5">
            <Inbox className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[8px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">
              {mainCategory === 'UNIVERSITY' ? 'Chờ duyệt' : 'Đang mở'}
            </span>
          </div>
          <p className="text-base sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {mainCategory === 'UNIVERSITY'
              ? schoolPendingCount
              : independentEvents.filter(e => e.status === 'OPEN').length}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200/60 dark:border-slate-800 p-2 sm:p-4 shadow-sm min-w-0">
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 mb-0.5">
            <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[8px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">Đã xử lý</span>
          </div>
          <p className="text-base sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {mainCategory === 'UNIVERSITY' ? schoolProcessedCount : indepProcessedCount}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200/60 dark:border-slate-800 p-2 sm:p-4 shadow-sm min-w-0">
          <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 mb-0.5">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[8px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">Tổng sự kiện</span>
          </div>
          <p className="text-base sm:text-2xl font-black text-slate-900 dark:text-white truncate">
            {mainCategory === 'UNIVERSITY' ? schoolTotalCount : independentTotalCount}
          </p>
        </div>
      </div>

      {/* 1. PRIMARY FILTER: 2 Bộ lọc riêng biệt (Equal 50%-50% on mobile) */}
      <div className="grid grid-cols-2 gap-1.5 w-full sm:flex sm:w-fit mb-3 sm:mb-4 bg-slate-200/60 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <button
          type="button"
          onClick={() => setMainCategory('UNIVERSITY')}
          className={`w-full sm:w-auto px-2 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-300 flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap min-w-0 ${
            mainCategory === 'UNIVERSITY'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-md shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-800/40'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="whitespace-nowrap">Sự Kiện Trường</span>
          <span className={`px-1.5 py-0.2 text-[10px] sm:text-xs font-bold rounded-full shrink-0 ${
            mainCategory === 'UNIVERSITY' ? 'bg-white/20 text-white' : 'bg-slate-300/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}>
            {schoolTotalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainCategory('INDEPENDENT')}
          className={`w-full sm:w-auto px-2 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-300 flex items-center justify-center gap-1 sm:gap-2 whitespace-nowrap min-w-0 ${
            mainCategory === 'INDEPENDENT'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-md shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-800/40'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="whitespace-nowrap">Sự Kiện Tự Do</span>
          <span className={`px-1.5 py-0.2 text-[10px] sm:text-xs font-bold rounded-full shrink-0 ${
            mainCategory === 'INDEPENDENT' ? 'bg-white/20 text-white' : 'bg-slate-300/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}>
            {independentTotalCount}
          </span>
        </button>
      </div>

      {/* 2. SECONDARY SUB-TABS (Horizontal scroll without breaking text on mobile) */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-900/60 p-1 rounded-2xl gap-1 w-full sm:w-fit mb-4 border border-slate-200/60 dark:border-slate-800 overflow-x-auto shadow-inner scrollbar-none">
        {mainCategory === 'UNIVERSITY' ? (
          <>
            {/* Sub-tab 1: Cập Nhật Sự Kiện (OPEN & UPDATING) */}
            <button
              type="button"
              onClick={() => setSchoolSubTab('UPDATING')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                schoolSubTab === 'UPDATING'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/60 dark:border-slate-700 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Cập Nhật Sự Kiện</span>
              <span className={`px-1.5 py-0.2 text-[10px] sm:text-[11px] rounded-full font-bold ${
                schoolSubTab === 'UPDATING'
                  ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {schoolUpdatingCount}
              </span>
            </button>

            {/* Sub-tab 2: Hồ sơ đang chờ duyệt (PENDING) */}
            <button
              type="button"
              onClick={() => setSchoolSubTab('PENDING')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                schoolSubTab === 'PENDING'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/60 dark:border-slate-700 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Hồ sơ đang chờ duyệt</span>
              <span className={`px-1.5 py-0.2 text-[10px] sm:text-[11px] rounded-full font-bold ${
                schoolSubTab === 'PENDING'
                  ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {schoolPendingCount}
              </span>
            </button>

            {/* Sub-tab 3: Sự Kiện đã xử lý (CANCELLED, CLOSED, APPROVED, DENIED) */}
            <button
              type="button"
              onClick={() => setSchoolSubTab('PROCESSED')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                schoolSubTab === 'PROCESSED'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/60 dark:border-slate-700 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Sự Kiện đã xử lý</span>
              <span className={`px-1.5 py-0.2 text-[10px] sm:text-[11px] rounded-full font-bold ${
                schoolSubTab === 'PROCESSED'
                  ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {schoolProcessedCount}
              </span>
            </button>
          </>
        ) : (
          <>
            {/* Sub-tab 1: Cập Nhật Sự Kiện (OPEN & UPDATING) */}
            <button
              type="button"
              onClick={() => setIndepSubTab('UPDATING')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                indepSubTab === 'UPDATING'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/60 dark:border-slate-700 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Cập Nhật Sự Kiện</span>
              <span className={`px-1.5 py-0.2 text-[10px] sm:text-[11px] rounded-full font-bold ${
                indepSubTab === 'UPDATING'
                  ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {indepUpdatingCount}
              </span>
            </button>

            {/* Sub-tab 2: Sự kiện đã xử lý (CANCELLED & CLOSED) */}
            <button
              type="button"
              onClick={() => setIndepSubTab('PROCESSED')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                indepSubTab === 'PROCESSED'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/60 dark:border-slate-700 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Sự kiện đã xử lý</span>
              <span className={`px-1.5 py-0.2 text-[10px] sm:text-[11px] rounded-full font-bold ${
                indepSubTab === 'PROCESSED'
                  ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {indepProcessedCount}
              </span>
            </button>
          </>
        )}
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="mb-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tiêu đề, địa điểm..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="relative flex items-center min-w-[160px] sm:min-w-[200px]">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-orange-500 transition-all appearance-none cursor-pointer font-medium"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="OPEN">Đang mở (OPEN)</option>
              <option value="UPDATING">Chờ cập nhật (UPDATING)</option>
              <option value="PENDING">Chờ duyệt (PENDING)</option>
              <option value="APPROVED">Đã duyệt (APPROVED)</option>
              <option value="CLOSED">Đã đóng (CLOSED)</option>
              <option value="CANCELLED">Đã hủy (CANCELLED)</option>
              <option value="REJECTED">Bị từ chối (REJECTED)</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
              <Filter className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 sm:p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400 text-xs sm:text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Main List Rendering */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-12 text-center shadow-sm">
          <div className="w-8 h-8 border-3 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Đang tải danh sách sự kiện...</p>
        </div>
      ) : mainCategory === 'UNIVERSITY' ? (
        /* ==================== SỰ KIỆN TRƯỜNG HỌC LIST ==================== */
        paginatedSchoolList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-12 text-center shadow-sm">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-full w-fit mx-auto mb-3">
              <FileClock className="w-8 h-8" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">Không có hồ sơ sự kiện trường học nào</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {schoolSubTab === 'UPDATING' && 'Chưa có sự kiện nào đang ở trạng thái OPEN hoặc UPDATING.'}
              {schoolSubTab === 'PENDING' && 'Hiện không có yêu cầu nào đang chờ Phòng Quản trị duyệt.'}
              {schoolSubTab === 'PROCESSED' && 'Chưa có hồ sơ sự kiện đã xử lý nào.'}
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-3 sm:gap-3.5 mb-4">
            {paginatedSchoolList.map((req, index) => {
              const displayStatus = (req.eventStatus || req.status || 'PENDING').toUpperCase()
              const isUpdatingTab = schoolSubTab === 'UPDATING'

              return (
                <div
                  key={req.requestId || index}
                  onClick={() => handleViewDetails(req)}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-orange-500/60 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4"
                >
                  {/* Left accent bar */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      displayStatus === 'PENDING' ? 'bg-amber-400' :
                      displayStatus === 'OPEN' ? 'bg-emerald-500' :
                      displayStatus === 'UPDATING' ? 'bg-blue-500' :
                      displayStatus === 'REJECTED' || displayStatus === 'CANCELLED' ? 'bg-rose-500' :
                      'bg-slate-400'
                    }`}
                  />

                  <div className="flex-1 min-w-0 pl-1.5">
                    {/* Header: Title and Badges */}
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-orange-600 transition-colors line-clamp-1">
                        {req.title}
                      </h3>

                      {displayStatus === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200/60 shrink-0">
                          <Clock className="w-3 h-3 animate-pulse" /> Chờ duyệt
                        </span>
                      ) : displayStatus === 'UPDATING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200/60 shrink-0">
                          <Clock className="w-3 h-3" /> Chờ cập nhật
                        </span>
                      ) : displayStatus === 'OPEN' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> Đang mở
                        </span>
                      ) : displayStatus === 'CLOSED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 shrink-0">
                          Đã đóng
                        </span>
                      ) : displayStatus === 'CANCELLED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200/60 shrink-0">
                          <XCircle className="w-3 h-3" /> Đã hủy
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 shrink-0">
                          {getStatusLabel(displayStatus as EventRequestStatus)}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200/50 shrink-0">
                        <GraduationCap className="w-3 h-3" /> Trường FPT
                      </span>
                    </div>

                    {req.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-2 font-medium">
                        {req.description}
                      </p>
                    )}

                    {/* Info rows: Single line on desktop, clean spaced on mobile */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span className="truncate">Thời gian: <strong className="text-slate-700 dark:text-slate-300">{formatSafeDate(req.preferredStartTime || req.createdAt)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">Sảnh: <strong className="text-slate-700 dark:text-slate-300">{req.areaName || req.venueName || 'FPT University'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Quy mô: <strong className="text-slate-700 dark:text-slate-300">{req.expectedCapacity || req.areaCapacity || 100} chỗ</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* ACTION BUTTONS: Mobile-optimized (Full width or neat 3 columns) */}
                  <div
                    className={`w-full sm:w-auto border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-100 dark:border-slate-800 shrink-0 ${
                      isUpdatingTab ? 'grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2' : 'flex'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleSchoolDetailButtonClick(req)}
                      className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] sm:text-xs font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap ${
                        !isUpdatingTab ? 'w-full sm:w-auto' : ''
                      }`}
                      title={req.createdEventId ? 'Xem chi tiết sự kiện' : 'Xem đề xuất yêu cầu'}
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Chi tiết</span>
                    </button>

                    {isUpdatingTab && (
                      <>
                        {req.createdEventId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedConfigEventId(req.createdEventId!)
                              setSelectedConfigEventTitle(req.title)
                              setIsConfigModalOpen(true)
                            }}
                            className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] sm:text-xs font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap"
                            title="Cấu hình Điểm danh"
                          >
                            <Settings className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>Cấu hình</span>
                          </button>
                        ) : <div className="hidden sm:block" />}

                        <button
                          type="button"
                          onClick={() => {
                            if (req.createdEventId) {
                              navigate(`/dashboard/events/${req.createdEventId}/edit`)
                            } else {
                              navigate(`/dashboard/event-requests/${req.requestId}/edit`)
                            }
                          }}
                          className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl text-[11px] sm:text-xs font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap"
                          title="Chỉnh sửa sự kiện"
                        >
                          <Edit className="w-3.5 h-3.5 shrink-0" />
                          <span>Chỉnh sửa</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* ==================== SỰ KIỆN TỰ DO LIST ==================== */
        paginatedIndepList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-12 text-center shadow-sm">
            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 text-orange-500 rounded-full w-fit mx-auto mb-3">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">Không có sự kiện tự do nào</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {indepSubTab === 'UPDATING'
                ? 'Chưa có sự kiện tự do nào đang ở trạng thái OPEN hoặc UPDATING.'
                : 'Chưa có sự kiện tự do nào đã đóng hoặc bị hủy.'}
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-3 sm:gap-3.5 mb-4">
            {paginatedIndepList.map((evt, index) => {
              const formatUpper = (evt.eventFormat || '').toUpperCase()
              const isOnline = formatUpper === 'ONLINE'
              const isHybrid = formatUpper === 'HYBRID'
              const isMeet = evt.onlineMeetingUrl?.includes('meet.google.com') || evt.customVenueName?.toLowerCase().includes('google meet')
              const platformName = isMeet ? 'Google Meet' : 'Zoom'
              const locationDisplay = formatEventLocation(evt, 'vi')
              const isUpdatingTab = indepSubTab === 'UPDATING'

              return (
                <div
                  key={evt.eventId || index}
                  onClick={() => handleOpenEventDetail(evt.eventId)}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-orange-500/60 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4"
                >
                  {/* Left accent bar */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      evt.status === 'UPDATING' ? 'bg-blue-500' :
                      evt.status === 'OPEN' ? 'bg-emerald-500' :
                      evt.status === 'CLOSED' ? 'bg-slate-400' :
                      evt.status === 'CANCELLED' ? 'bg-rose-500' : 'bg-orange-500'
                    }`}
                  />

                  <div className="flex-1 min-w-0 pl-1.5">
                    {/* Header: Title and Badges */}
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-orange-600 transition-colors line-clamp-1">
                        {evt.title}
                      </h3>

                      {evt.status === 'UPDATING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200/60 shrink-0">
                          <Clock className="w-3 h-3" /> Chờ cập nhật
                        </span>
                      ) : evt.status === 'OPEN' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> Đang mở
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 shrink-0">
                          {evt.status === 'CLOSED' ? 'Đã đóng' : evt.status === 'CANCELLED' ? 'Đã hủy' : evt.status}
                        </span>
                      )}

                      {isOnline ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 shrink-0">
                          <Video className="w-3 h-3" /> {platformName}
                        </span>
                      ) : isHybrid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-200 shrink-0">
                          <Globe className="w-3 h-3" /> Hybrid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 shrink-0">
                          <MapPin className="w-3 h-3" /> Tự thuê
                        </span>
                      )}
                    </div>

                    {evt.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-2 font-medium">
                        {evt.description}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span className="truncate">Thời gian: <strong className="text-slate-700 dark:text-slate-300">{formatSafeDate(evt.startTime)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate" title={locationDisplay}>Địa điểm: <strong className="text-slate-700 dark:text-slate-300">{locationDisplay}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Quy mô: <strong className="text-slate-700 dark:text-slate-300">{evt.capacity || 100} chỗ</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div
                    className={`w-full sm:w-auto border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-100 dark:border-slate-800 shrink-0 ${
                      isUpdatingTab ? 'grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2' : 'flex'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenEventDetail(evt.eventId)}
                      className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] sm:text-xs font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap ${
                        !isUpdatingTab ? 'w-full sm:w-auto' : ''
                      }`}
                      title="Xem chi tiết"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Chi tiết</span>
                    </button>

                    {isUpdatingTab && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedConfigEventId(evt.eventId)
                            setSelectedConfigEventTitle(evt.title)
                            setIsConfigModalOpen(true)
                          }}
                          className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] sm:text-xs font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap"
                          title="Cấu hình Điểm danh"
                        >
                          <Settings className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Cấu hình</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/events/${evt.eventId}/edit`)}
                          className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl text-[11px] sm:text-xs font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap"
                          title="Chỉnh sửa sự kiện"
                        >
                          <Edit className="w-3.5 h-3.5 shrink-0" />
                          <span>Chỉnh sửa</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* 5. UNIFIED PAGINATION BAR (Clean, wrapped safely on mobile) */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 mt-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3 sm:p-4 shadow-sm">
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold text-center sm:text-left">
            Trang <span className="text-orange-600 dark:text-orange-400 font-extrabold">{safeCurrentPage}</span> /{' '}
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">{totalPages}</span> ({activeListLength} sự kiện)
          </div>

          <div className="flex items-center justify-center gap-1 sm:gap-1.5 w-full sm:w-auto overflow-x-auto py-0.5 scrollbar-none">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              className="px-2.5 py-1.5 sm:px-3 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm shrink-0 whitespace-nowrap"
            >
              ← Trước
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-[11px] sm:text-xs font-bold transition-all border shrink-0 ${
                  safeCurrentPage === page
                    ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white border-transparent shadow-md shadow-orange-500/20 font-extrabold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-2.5 py-1.5 sm:px-3 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm shrink-0 whitespace-nowrap"
            >
              Sau →
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal for Request */}
      {selectedRequest && (
        <EventRequestDetailModal
          request={convertToModalRequest(selectedRequest)}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedRequest(null)
          }}
          userRole={user?.role}
          loading={isDetailLoading}
        />
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && eventToCancel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {eventToCancel?.status === 'PENDING' || eventToCancel?.status === 'UPDATING'
                    ? 'Rút yêu cầu đăng ký'
                    : 'Yêu cầu hủy sự kiện'}
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                {eventToCancel?.status === 'PENDING' || eventToCancel?.status === 'UPDATING' ? (
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

              <div className="flex gap-2 sm:gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCancelModal(false)
                    setEventToCancel(null)
                  }}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-xs sm:text-sm"
                >
                  Không, giữ lại
                </button>
                <button
                  onClick={confirmCancelEvent}
                  className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all active:scale-95 shadow-sm hover:shadow text-xs sm:text-sm"
                >
                  Có, xác nhận
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal for viewing event */}
      <EventDetailModal
        isOpen={isDetailEventModalOpen}
        onClose={() => {
          setIsDetailEventModalOpen(false)
          setSelectedDetailEvent(null)
        }}
        event={selectedDetailEvent}
        loading={loadingDetailEvent}
        error={null}
        userRole={user?.role}
      />

      {/* Event Config Modal for Check-in configuration */}
      <EventConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => {
          setIsConfigModalOpen(false)
          setSelectedConfigEventId(0)
        }}
        eventId={selectedConfigEventId}
        eventTitle={selectedConfigEventTitle}
      />
    </div>
  )
}
