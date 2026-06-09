// src/components/events/EventRequestDetailModal.tsx

// Import icon tÃ¡Â»Â« lucide-react Ã„â€˜Ã¡Â»Æ’ hiÃ¡Â»Æ’n thÃ¡Â»â€¹ UI
import { X, Calendar, Users, FileText, User, Clock, Edit, XCircle, MapPin } from 'lucide-react'

// format: format ngÃƒÂ y giÃ¡Â»Â theo pattern (dd/MM/yyyy HH:mm)
import { formatWallClockTimeFromRFC3339 } from '../../utils/dateFormat'

// ===================== TYPE DEFINITIONS =====================

type EventRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'UPDATING' | 'CANCELLED' | 'FINISHED' | 'EXPIRED' | 'CLOSED' | 'OPEN'

interface EventRequestDetailModalProps {
  isOpen: boolean
  onClose: () => void
  request: {
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
    venueName?: string
    areaName?: string
    floor?: string
    areaCapacity?: number
    rejectReason?: string
  } | null
  userRole?: string
  onEdit?: () => void
  onCancel?: () => void
  loading?: boolean
}

// ===================== HELPER FUNCTIONS =====================

const getStatusLabel = (status: EventRequestStatus) => {
  switch (status) {
    case 'APPROVED':
      return 'Ã„ÂÃƒÂ£ duyÃ¡Â»â€¡t'
    case 'REJECTED':
      return 'BÃ¡Â»â€¹ tÃ¡Â»Â« chÃ¡Â»â€˜i'
    case 'UPDATING':
      return 'ChÃ¡Â»Â CÃ¡ÂºÂ­p NhÃ¡ÂºÂ­t ThÃƒÂ´ng Tin'
    case 'CANCELLED':
      return 'Ã„ÂÃƒÂ£ hÃ¡Â»Â§y'
    case 'EXPIRED':
      return 'HÃ¡ÂºÂ¿t hÃ¡ÂºÂ¡n'
    case 'CLOSED':
      return 'Ã„ÂÃƒÂ£ Ã„â€˜ÃƒÂ³ng'
    case 'OPEN':
      return 'Ã„Âang mÃ¡Â»Å¸'
    default:
      return 'Ã„Âang chÃ¡Â»Â duyÃ¡Â»â€¡t'
  }
}

const getStatusClass = (status: EventRequestStatus) => {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-800 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border dark:border-emerald-900/50'
    case 'REJECTED':
      return 'bg-red-100 text-red-800 dark:bg-rose-950/20 dark:text-rose-400 dark:border dark:border-rose-900/50'
    case 'UPDATING':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400 dark:border dark:border-blue-900/50'
    case 'CANCELLED':
      return 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-400 dark:border dark:border-slate-700'
    case 'CLOSED':
      return 'bg-gray-200 text-gray-900 dark:bg-slate-800 dark:text-slate-300'
    case 'OPEN':
      return 'bg-green-50 text-green-700 dark:bg-emerald-950/20 dark:text-emerald-400'
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-amber-950/20 dark:text-amber-400'
  }
}

const safeFormatWallClock = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return '---'
  const formatted = formatWallClockTimeFromRFC3339(value)
  return formatted || '---'
}

// ===================== MAIN COMPONENT =====================

export function EventRequestDetailModal({
  isOpen,
  onClose,
  request,
  userRole,
  onEdit,
  onCancel,
  loading = false
}: EventRequestDetailModalProps) {

  if (!isOpen || !request) return null

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/45 backdrop-blur-sm dark:bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      {/* Centering wrapper */}
      <div className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        {/* Modal Card: responsive width + scrollable */}
        <div
          className="flex w-full max-w-5xl max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800/80 dark:bg-slate-950"
          onMouseDown={(event) => event.stopPropagation()}
        >

          {/* ===================== HEADER ===================== */}
          <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800/80 dark:bg-slate-950 sm:px-6">
            <h2 className="min-w-0 truncate text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">{request.title}</h2>

            {/* NÃƒÂºt Ã„â€˜ÃƒÂ³ng modal */}
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Dong modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* ===================== CONTENT ===================== */}
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">

            {/* Loading Spinner */}
            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="inline-flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-200 border-t-blue-600"></div>
                  <span className="text-slate-500 dark:text-slate-400">Ã„Âang tÃ¡ÂºÂ£i thÃƒÂ´ng tin chi tiÃ¡ÂºÂ¿t...</span>
                </div>
              </div>
            )}

            {/* Badge trÃ¡ÂºÂ¡ng thÃƒÂ¡i */}
            <div className="mb-6">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusClass(
                  request.status,
                )}`}
              >
                {getStatusLabel(request.status)}
              </span>
            </div>

            {/* MÃƒÂ´ tÃ¡ÂºÂ£ (Description) */}
            {request.description && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2 flex items-center text-slate-900 dark:text-slate-200">
                  <FileText className="w-5 h-5 mr-2 text-blue-600" />
                  MÃƒÂ´ tÃ¡ÂºÂ£
                </h3>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{request.description}</p>
              </div>
            )}

            {/* LÃƒÂ DO TÃ¡Â»Âª CHÃ¡Â»ÂI (Rejection Reason) */}
            {request.status === 'REJECTED' && request.rejectReason && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/50">
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center">
                  <XCircle className="w-5 h-5 mr-2 text-red-600" />
                  LÃƒÂ½ do tÃ¡Â»Â« chÃ¡Â»â€˜i tÃ¡Â»Â« Staff
                </h3>
                <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap">{request.rejectReason}</p>
              </div>
            )}

            {/* Ã„ÂÃ¡Â»â€¹a Ã„â€˜iÃ¡Â»Æ’m tÃ¡Â»â€¢ chÃ¡Â»Â©c (Venue) */}
            {request.status === 'APPROVED' && (
              <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-900/50">
                <h3 className="text-lg font-semibold mb-3 flex items-center text-slate-900 dark:text-slate-100">
                  <MapPin className="w-5 h-5 mr-2 text-indigo-600" />
                  Ã„ÂÃ¡Â»â€¹a Ã„â€˜iÃ¡Â»Æ’m tÃ¡Â»â€¢ chÃ¡Â»Â©c
                </h3>
                {request.areaName || request.venueName ? (
                  <div className="space-y-2">
                    {request.venueName && (
                      <div className="flex justify-between">
                        <span className="text-sm text-indigo-700 dark:text-indigo-400 font-medium">Ã„ÂÃ¡Â»â€¹a Ã„â€˜iÃ¡Â»Æ’m:</span>
                        <span className="text-sm text-indigo-900 dark:text-indigo-200 font-semibold">{request.venueName}</span>
                      </div>
                    )}
                    {request.areaName && (
                      <div className="flex justify-between">
                        <span className="text-sm text-indigo-700 dark:text-indigo-400 font-medium">Khu vÃ¡Â»Â±c:</span>
                        <span className="text-sm text-indigo-900 dark:text-indigo-200 font-semibold">
                          {request.areaName}
                          {request.floor && ` (TÃ¡ÂºÂ§ng ${request.floor})`}
                        </span>
                      </div>
                    )}
                    {request.areaCapacity && (
                      <div className="flex justify-between">
                        <span className="text-sm text-indigo-700 dark:text-indigo-400 font-medium">SÃ¡Â»Â©c chÃ¡Â»Â©a khu vÃ¡Â»Â±c:</span>
                        <span className="text-sm text-indigo-900 dark:text-indigo-200 font-semibold">{request.areaCapacity} chÃ¡Â»â€”</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-indigo-600 dark:text-indigo-400 italic">ThÃƒÂ´ng tin Ã„â€˜Ã¡Â»â€¹a Ã„â€˜iÃ¡Â»Æ’m Ã„â€˜ang Ã„â€˜Ã†Â°Ã¡Â»Â£c cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t...</p>
                )}
              </div>
            )}

            {/* Grid thÃƒÂ´ng tin request */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

              {/* NgÃ†Â°Ã¡Â»Âi Ã„â€˜Ã¡Â»Â xuÃ¡ÂºÂ¥t */}
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-purple-100 dark:bg-purple-950/30 rounded-lg flex items-center justify-center mr-3">
                  <User className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">NgÃ†Â°Ã¡Â»Âi Ã„â€˜Ã¡Â»Â xuÃ¡ÂºÂ¥t</p>
                  <p className="font-medium text-slate-900 dark:text-slate-200">
                    {request.requesterName || 'KhÃƒÂ´ng cÃƒÂ³ thÃƒÂ´ng tin'}
                  </p>
                </div>
              </div>

              {/* SÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng dÃ¡Â»Â± kiÃ¡ÂºÂ¿n */}
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-950/30 rounded-lg flex items-center justify-center mr-3">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">SÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng dÃ¡Â»Â± kiÃ¡ÂºÂ¿n</p>
                  <p className="font-medium text-slate-900 dark:text-slate-200">{request.expectedCapacity} ngÃ†Â°Ã¡Â»Âi</p>
                </div>
              </div>

              {/* ThÃ¡Â»Âi gian bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u mong muÃ¡Â»â€˜n */}
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-950/30 rounded-lg flex items-center justify-center mr-3">
                  <Calendar className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">ThÃ¡Â»Âi gian bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u mong muÃ¡Â»â€˜n</p>
                  <p className="font-medium text-slate-900 dark:text-slate-200">
                    {safeFormatWallClock(request?.preferredStartTime)}
                  </p>
                </div>
              </div>

              {/* ThÃ¡Â»Âi gian kÃ¡ÂºÂ¿t thÃƒÂºc mong muÃ¡Â»â€˜n */}
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-orange-100 dark:bg-orange-950/30 rounded-lg flex items-center justify-center mr-3">
                  <Calendar className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">ThÃ¡Â»Âi gian kÃ¡ÂºÂ¿t thÃƒÂºc mong muÃ¡Â»â€˜n</p>
                  <p className="font-medium text-slate-900 dark:text-slate-200">
                    {safeFormatWallClock(request?.preferredEndTime)}
                  </p>
                </div>
              </div>

              {/* NgÃƒÂ y tÃ¡ÂºÂ¡o request */}
              <div className="flex items-start">
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center mr-3">
                  <Clock className="w-5 h-5 text-slate-500 dark:text-slate-300" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">NgÃƒÂ y tÃ¡ÂºÂ¡o</p>
                  <p className="font-medium text-slate-900 dark:text-slate-200">
                    {safeFormatWallClock(request?.createdAt)}
                  </p>
                </div>
              </div>

              {/* NgÃƒÂ y xÃ¡Â»Â­ lÃƒÂ½ */}
              {request.processedAt && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center mr-3">
                    <Clock className="w-5 h-5 text-slate-500 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">NgÃƒÂ y xÃ¡Â»Â­ lÃƒÂ½</p>
                    <p className="font-medium text-slate-900 dark:text-slate-200">
                      {safeFormatWallClock(request?.processedAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* NgÃ†Â°Ã¡Â»Âi xÃ¡Â»Â­ lÃƒÂ½ */}
              {request.processedByName && (
                <div className="flex items-start">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 dark:bg-indigo-950/30 rounded-lg flex items-center justify-center mr-3">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">NgÃ†Â°Ã¡Â»Âi xÃ¡Â»Â­ lÃƒÂ½</p>
                    <p className="font-medium text-slate-900 dark:text-slate-200">{request.processedByName}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Ghi chÃƒÂº tÃ¡Â»Â« ban tÃ¡Â»â€¢ chÃ¡Â»Â©c */}
            {request.organizerNote && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900/50">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-400 mb-2">
                  Ghi chÃƒÂº tÃ¡Â»Â« ban tÃ¡Â»â€¢ chÃ¡Â»Â©c
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">
                  {request.organizerNote}
                </p>
              </div>
            )}

            {/* HiÃ¡Â»Æ’n thÃ¡Â»â€¹ createdEventId nÃ¡ÂºÂ¿u request Ã„â€˜ÃƒÂ£ APPROVED */}
            {request.status === 'APPROVED' && request.createdEventId && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900/50">
                <p className="text-sm text-green-800 dark:text-green-300">
                  <span className="font-semibold">SÃ¡Â»Â± kiÃ¡Â»â€¡n Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c tÃ¡ÂºÂ¡o vÃ¡Â»â€ºi ID:</span> {request.createdEventId}
                </p>
              </div>
            )}

            {/* ===================== ACTION BUTTONS ===================== */}
            <div className="sticky bottom-0 -mx-5 mt-6 flex justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800/80 dark:bg-slate-950 sm:-mx-6 sm:px-6">

              {userRole === 'ORGANIZER' &&
                request.status === 'UPDATING' &&
                request.createdEventId &&
                onEdit && (
                  <button
                    onClick={onEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t thÃƒÂ´ng tin
                  </button>
                )}

              {/* NÃƒÂºt Ã„â€˜ÃƒÂ³ng modal */}
              <button
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Ã„ÂÃƒÂ³ng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
