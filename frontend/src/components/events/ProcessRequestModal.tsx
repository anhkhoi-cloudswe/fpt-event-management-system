// ===================== IMPORTS =====================

import { X, Calendar, Users, MapPin, User, Info, FileText } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { useAvailableAreas, AvailableArea } from '../../hooks/useAvailableAreas'
import { formatWallClockTimeFromRFC3339 } from '../../utils/dateFormat'

// ===================== MESSAGE TEMPLATES =====================
const TEMPLATES = {
  approve: [
    'Yêu cầu của bạn đã được duyệt. Vui lòng kiểm tra thông tin khu vực đã được phân bổ.',
    'Sự kiện của bạn đã được phê duyệt. Chúc bạn tổ chức sự kiện thành công!',
    'Yêu cầu hợp lệ và đã được chấp nhận. Hãy chuẩn bị các tài liệu cần thiết cho sự kiện.',
    'Phê duyệt thành công. Vui lòng liên hệ với ban quản lý để xác nhận các chi tiết cuối cùng.'
  ],
  reject: [
    'Yêu cầu của bạn bị từ chối do xung đột lịch với sự kiện khác.',
    'Đáy đủ sức chứa không đáp ứng yêu cầu. Vui lòng chọn thời gian khác.',
    'Yêu cầu không phù hợp với chính sách của tổ chức. Vui lòng liên hệ để biết chi tiết.',
    'Thời gian yêu cầu không khả dụng. Xin vui lòng chọn ngày khác.'
  ]
}

// ===================== TYPES =====================

type CheckDailyQuotaResponse = {
  eventDate: string
  currentCount: number
  maxAllowed: number
  quotaExceeded: boolean
  canApproveMore: boolean
  warningMessage: string
}

type ProcessRequestModalProps = {
  isOpen: boolean
  onClose: () => void
  onSubmit: (areaId: number, organizerNote: string, rejectReason?: string) => void
  action: 'APPROVE' | 'REJECT'
  request: {
    requestId: number
    title: string
    preferredStartTime?: string
    preferredEndTime?: string
    expectedCapacity?: number
    requesterName?: string
    description?: string
    eventFormat?: string
    customVenueName?: string
    customLocation?: string
    orgType?: string
    privacyStatus?: string
    onlineMeetingUrl?: string
    onlineMeetingId?: string
    onlineMeetingSecret?: string
    bannerUrl?: string
  } | null
}

// ===================== HELPER FUNCTIONS =====================

const findMatchingArea = (areas: AvailableArea[], customVenue: string, customLoc?: string): AvailableArea | null => {
  if (!customVenue) return null
  const venueLower = customVenue.toLowerCase().trim()
  const locLower = customLoc?.toLowerCase().trim() || ''

  // 1. Try exact or substring match on areaName/venueName
  const candidates = areas.filter(area => {
    const areaNameLower = area.areaName.toLowerCase()
    return areaNameLower.includes(venueLower) || venueLower.includes(areaNameLower)
  })

  if (candidates.length === 1) {
    return candidates[0]
  }

  if (candidates.length > 1) {
    // If we have multiple candidates, filter by location if possible
    if (locLower) {
      const locCandidates = candidates.filter(area => {
        const areaVenueLower = area.venueName.toLowerCase()
        return areaVenueLower.includes(locLower) || locLower.includes(areaVenueLower)
      })
      if (locCandidates.length > 0) {
        return locCandidates[0]
      }
    }
    return candidates[0]
  }

  // 2. Loose match combining venue name and area name
  const looseCandidates = areas.filter(area => {
    const combined = `${area.venueName} ${area.areaName}`.toLowerCase()
    return combined.includes(venueLower) || venueLower.includes(combined)
  })

  if (looseCandidates.length > 0) {
    return looseCandidates[0]
  }

  return null
}

// ===================== COMPONENT =====================

export function ProcessRequestModal({
  isOpen,
  onClose,
  onSubmit,
  action,
  request
}: ProcessRequestModalProps) {

  const { showToast } = useToast()

  const [selectedAreaId, setSelectedAreaId] = useState<number>(0)
  const [organizerNote, setOrganizerNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [quotaInfo, setQuotaInfo] = useState<CheckDailyQuotaResponse | null>(null)
  const [loadingQuota, setLoadingQuota] = useState(false)

  const {
    areas,
    loading,
    error
  } = useAvailableAreas(
    isOpen && action === 'APPROVE' && request?.preferredStartTime ? request.preferredStartTime : null,
    isOpen && action === 'APPROVE' && request?.preferredEndTime ? request.preferredEndTime : null,
    isOpen && action === 'APPROVE' && request?.expectedCapacity ? request.expectedCapacity : 0
  )

  useEffect(() => {
    if (!isOpen || action !== 'APPROVE' || !request?.preferredStartTime) {
      setQuotaInfo(null)
      return
    }

    const fetchQuota = async () => {
      try {
        setLoadingQuota(true)
        const eventDate = request?.preferredStartTime?.split('T')[0]
        if (!eventDate) return

        const response = await fetch(
          `/api/events/daily-quota?date=${eventDate}`,
          { credentials: 'include' }
        )

        if (response.ok) {
          const data: CheckDailyQuotaResponse = await response.json()
          setQuotaInfo(data)
        }
      } catch (error) {
        console.error('[ProcessRequestModal] Error fetching daily quota:', error)
      } finally {
        setLoadingQuota(false)
      }
    }

    fetchQuota()
  }, [isOpen, action, request?.preferredStartTime])

  useEffect(() => {
    if (areas.length > 0) {
      const matched = request?.customVenueName
        ? findMatchingArea(areas, request.customVenueName, request.customLocation)
        : null
      
      if (matched) {
        setSelectedAreaId(matched.areaId)
      } else {
        setSelectedAreaId(areas[0].areaId)
      }
    } else {
      setSelectedAreaId(0)
    }
  }, [areas, request])

  const truncateVenueName = (venueName: string, maxLength: number = 30): string => {
    if (venueName.length <= maxLength) return venueName

    const abbreviations: Record<string, string> = {
      'Nhà văn hóa sinh viên': 'NVH Sinh viên',
      'Nhà văn hóa': 'NVH',
      'Đại học Quốc gia': 'ĐHQG',
      'Trường Đại học': 'Trường ĐH',
      'Quốc gia TP HCM': 'QGTP',
      'TP HCM': 'TPHCM',
      'FPT University': 'FPT Uni',
      'FPT Campus': 'FPT'
    }

    let abbreviated = venueName
    for (const [full, abbrev] of Object.entries(abbreviations)) {
      abbreviated = abbreviated.replace(full, abbrev)
    }

    if (abbreviated.length > maxLength) {
      return abbreviated.substring(0, maxLength - 3) + '...'
    }
    return abbreviated
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (action === 'APPROVE' && selectedAreaId === 0) {
      showToast('warning', 'Vui lòng chọn khu vực cho sự kiện')
      return
    }

    if (action === 'REJECT' && rejectReason.trim() === '') {
      showToast('warning', 'Vui lòng nhập lý do từ chối')
      return
    }

    onSubmit(selectedAreaId, organizerNote, action === 'REJECT' ? rejectReason : undefined)
    handleClose()
  }

  const handleClose = () => {
    setSelectedAreaId(0)
    setOrganizerNote('')
    setRejectReason('')
    setIsDropdownOpen(false)
    onClose()
  }

  if (!isOpen || !request) return null

  return (
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-10 flex-shrink-0">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-50">
            {action === 'APPROVE' ? '✓ Duyệt yêu cầu sự kiện' : '✗ Từ chối yêu cầu sự kiện'}
          </h2>

          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors inline-flex p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 flex-1 space-y-4">
          
          {/* Section 1: Thông tin yêu cầu chi tiết (Compact Top Panel) */}
          <div className="bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-3">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Chi tiết sự kiện yêu cầu
            </h3>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              {request.bannerUrl && (
                <div className="w-full md:w-48 aspect-video md:h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm flex-shrink-0">
                  <img
                    src={request.bannerUrl}
                    alt="Event Banner"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 w-full space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-slate-700 dark:text-slate-350">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Tên sự kiện</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{request.title}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Người đề xuất</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {request.requesterName || 'Không rõ'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Thời gian mong muốn</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {request.preferredStartTime ? formatWallClockTimeFromRFC3339(request.preferredStartTime) : '---'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Hình thức & Địa điểm</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 animate-bounce" />
                      {request.eventFormat === 'ONLINE' ? 'Trực tuyến (ONLINE)' :
                       request.eventFormat === 'ONSITE' ? `${request.customVenueName || 'Tại chỗ'} (${request.customLocation || 'Campus'})` :
                       request.eventFormat === 'HYBRID' ? `${request.customVenueName || 'Kết hợp'} & ONLINE` : 'Chưa chọn'}
                    </p>
                  </div>
                  {request.orgType && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Đơn vị tổ chức</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-200">
                        {request.orgType === 'SCHOOL' ? '🏫 Trường học (SCHOOL)' : '👤 Tự do (FREE)'}
                      </p>
                    </div>
                  )}
                  {request.privacyStatus && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Hiển thị</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-200">
                        {request.privacyStatus === 'PUBLIC' ? '🌐 Công khai (PUBLIC)' : '🔒 Riêng tư (PRIVATE)'}
                      </p>
                    </div>
                  )}
                </div>
                
                {request.description && request.description !== 'N/A' && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2 text-[11px] text-slate-550 dark:text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase mr-1">Mô tả:</span>
                    <span className="line-clamp-2">{request.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Trọng tâm phê duyệt */}
          {action === 'APPROVE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Cột Trái */}
              <div className="space-y-3 flex flex-col justify-between">
                
                {request.expectedCapacity ? (
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200 dark:border-blue-900/40 flex-1 flex flex-col justify-center shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">
                          Sức chứa yêu cầu
                        </p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-extrabold text-blue-900 dark:text-blue-200">
                            {request.expectedCapacity}
                          </span>
                          <span className="text-xs text-blue-700 dark:text-blue-300 font-bold">người</span>
                        </div>
                      </div>
                      <div className="text-2xl dark:opacity-90 bg-blue-100 dark:bg-blue-900/50 p-2.5 rounded-xl">👥</div>
                    </div>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      Hệ thống lọc các phòng có sức chứa ≥ {request.expectedCapacity} người
                    </p>
                  </div>
                ) : null}

                {quotaInfo && !loadingQuota && (() => {
                  const isFull = quotaInfo.currentCount >= quotaInfo.maxAllowed
                  const isLastSlot = !isFull && quotaInfo.currentCount === quotaInfo.maxAllowed - 1

                  return (
                    <div
                      className={`p-3 rounded-xl border text-xs font-semibold shadow-sm ${
                        isFull
                          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
                          : isLastSlot
                            ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-250 dark:border-yellow-900/50 text-yellow-850 dark:text-yellow-350'
                            : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-300'
                      }`}
                    >
                      <p className="flex items-center gap-1.5">
                        {isFull ? (
                          <>
                            <span className="text-base flex-shrink-0">🚫</span>
                            <span>Đã hết suất tổ chức trong ngày ({quotaInfo.currentCount}/{quotaInfo.maxAllowed})</span>
                          </>
                        ) : isLastSlot ? (
                          <>
                            <span className="text-base flex-shrink-0">⚠️</span>
                            <span>{quotaInfo.warningMessage || `Còn 1 suất trống trong ngày (${quotaInfo.currentCount}/{quotaInfo.maxAllowed})`}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-base flex-shrink-0">✅</span>
                            <span>Còn {quotaInfo.maxAllowed - quotaInfo.currentCount} slot trống cho ngày này ({quotaInfo.currentCount}/{quotaInfo.maxAllowed})</span>
                          </>
                        )}
                      </p>
                    </div>
                  )
                })()}
              </div>

              {/* Cột Phải */}
              <div className="space-y-3 flex flex-col justify-start">
                <div className="bg-slate-50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 flex-1">
                  <div>
                    <label htmlFor="area" className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider mb-2">
                      Chọn khu vực bố trí <span className="text-red-500">*</span>
                    </label>

                    {loading ? (
                      <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-700 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Đang tìm phòng khả dụng...</p>
                      </div>
                    ) : error ? (
                      <div className="p-2.5 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/50">
                        <p className="text-xs text-red-700 dark:text-red-300">⚠️ {error}</p>
                      </div>
                    ) : areas.length === 0 ? (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-250 dark:border-yellow-900/50 text-xs text-yellow-800 dark:text-yellow-300">
                        <p className="font-bold">❌ Không tìm thấy phòng trống phù hợp!</p>
                        <p className="mt-1 text-[11px]">Không có phòng trống nào có sức chứa đủ lớn ({request.expectedCapacity} người) vào khung giờ này.</p>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-left bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-105 hover:bg-slate-50 dark:hover:bg-slate-800/80 flex justify-between items-center transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        >
                          <span className="font-semibold text-xs truncate">
                            {selectedAreaId === 0
                              ? '-- Chọn khu vực --'
                              : (() => {
                                const selected = areas.find(a => a.areaId === selectedAreaId)
                                return selected ? `[${selected.capacity} chỗ] - ${selected.areaName}` : '-- Chọn khu vực --'
                              })()}
                          </span>
                          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ml-1 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl z-50 max-h-40 overflow-y-auto">
                            {areas.map((area: AvailableArea) => {
                              const expectedCap = request?.expectedCapacity ?? 0
                              const capacity = area.capacity ?? 0
                              const isMuchLarger = expectedCap > 0 && capacity > expectedCap * 3
                              const isSelected = area.areaId === selectedAreaId
                              const truncatedVenue = truncateVenueName(area.venueName, 25)

                              return (
                                <button
                                  key={area.areaId}
                                  type="button"
                                  onClick={() => {
                                    setSelectedAreaId(area.areaId)
                                    setIsDropdownOpen(false)
                                  }}
                                  className={`w-full px-3 py-2 text-left border-b last:border-b-0 border-slate-100 dark:border-slate-800/80 transition-colors flex flex-col gap-0.5 ${
                                    isSelected
                                      ? 'bg-slate-50 dark:bg-slate-800 border-l-4 border-l-blue-500'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                      [{area.capacity} chỗ] - {area.areaName}
                                    </span>
                                    {isMuchLarger && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 flex-shrink-0">
                                        Rộng
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-550 truncate">
                                    {truncatedVenue} {area.floor && `• Tầng ${area.floor}`}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {isDropdownOpen && (
                          <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                        )}
                      </div>
                    )}
                  </div>

                  {!loading && !error && areas.length > 0 && (
                    <div className="space-y-1.5 text-[11px]">
                      <p className="text-slate-500 dark:text-slate-400">
                        📍 Tìm thấy <span className="font-bold text-slate-800 dark:text-slate-200">{areas.length} khu vực</span> phù hợp
                      </p>
                      {request?.customVenueName && (() => {
                        const matched = findMatchingArea(areas, request.customVenueName, request.customLocation)
                        if (matched) {
                          const isSelectedMatched = selectedAreaId === matched.areaId
                          return (
                            <div className={`p-2 rounded border ${
                              isSelectedMatched 
                                ? 'bg-green-55 dark:bg-green-950/20 border-green-200 dark:border-green-900/45 text-green-800 dark:text-green-300'
                                : 'bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-350'
                            }`}>
                              <p className="font-semibold flex items-center gap-1">
                                <span>✨</span>
                                <span>
                                  {isSelectedMatched 
                                    ? `Đã tự động chọn phòng "${matched.areaName}" khớp với yêu cầu của BTC.`
                                    : `Phòng khớp với mong muốn của BTC là "${matched.areaName}" đang khả dụng.`}
                                </span>
                              </p>
                            </div>
                          )
                        } else {
                          return (
                            <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-250 dark:border-yellow-900/45 rounded text-yellow-850 dark:text-yellow-350">
                              <p className="font-semibold flex items-center gap-1">
                                <span>⚠️</span>
                                <span>Hiện không có phòng trống nào khớp với địa điểm mong muốn của BTC ("${request.customVenueName}"). Vui lòng phân bổ một khu vực khác.</span>
                              </p>
                            </div>
                          )
                        }
                      })()}
                      {selectedAreaId > 0 && (() => {
                        const selectedArea = areas.find(a => a.areaId === selectedAreaId)
                        const expectedCap = request?.expectedCapacity ?? 0
                        const selectedCapacity = selectedArea?.capacity ?? 0
                        const isMuchLarger = expectedCap > 0 && selectedCapacity > expectedCap * 3

                        if (isMuchLarger) {
                          return (
                            <div className="p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/45 rounded text-orange-800 dark:text-orange-300">
                              <p className="font-bold flex items-center gap-1">
                                ⚠️ Phòng được chọn quá rộng ({selectedCapacity} chỗ), gấp {Math.floor(selectedCapacity / expectedCap)} lần yêu cầu ({expectedCap} người).
                              </p>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Textarea inputs & Suggestions */}
          
          {action === 'REJECT' && (
            <div className="space-y-2">
              <label htmlFor="rejectReason" className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">
                Lý do từ chối <span className="text-red-500">*</span>
              </label>
              <textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-105 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 resize-none"
                placeholder="Nhập lý do từ chối cụ thể để gửi ban tổ chức (bắt buộc)..."
              />

              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">💡 Điền nhanh mẫu có sẵn:</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.reject.map((template, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setRejectReason(template)}
                      className="bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] px-2.5 py-1 rounded-full transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
                      title={template}
                    >
                      📝 {template.substring(0, 35)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {action === 'APPROVE' && (
            <div className="space-y-2">
              <label htmlFor="note" className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">
                Ghi chú cho ban tổ chức sự kiện
              </label>
              <textarea
                id="note"
                value={organizerNote}
                onChange={(e) => setOrganizerNote(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-105 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 resize-none"
                placeholder="Nhập hướng dẫn, nhắc nhở hoặc lưu ý thêm cho ban tổ chức (không bắt buộc)..."
              />

              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">💡 Điền nhanh mẫu có sẵn:</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.approve.map((template, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setOrganizerNote(template)}
                      className="bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] px-2.5 py-1 rounded-full transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm"
                      title={template}
                    >
                      📝 {template.substring(0, 35)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Modal Action Buttons */}
          <div className="flex gap-3 pt-2 mt-4 border-t border-slate-200 dark:border-slate-800/80 sticky bottom-0 bg-white dark:bg-slate-950 py-3 flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all font-extrabold text-sm shadow-sm active:scale-95"
            >
              Quay lại
            </button>

            <button
              type="submit"
              disabled={
                action === 'APPROVE' &&
                (loading || areas.length === 0 || (quotaInfo?.currentCount ?? 0) >= 2)
              }
              title={
                action === 'APPROVE' && (quotaInfo?.currentCount ?? 0) >= 2
                  ? 'Không thể duyệt do đã hết giới hạn sự kiện trong ngày'
                  : undefined
              }
              className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-all font-extrabold text-sm active:scale-95 shadow-md ${
                action === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {action === 'APPROVE' ? '✓ Phê duyệt & Cấp phòng' : '✗ Từ chối yêu cầu'}
            </button>
          </div>

          {action === 'APPROVE' && quotaInfo && (quotaInfo.currentCount ?? 0) >= 2 && (
            <p className="text-[11px] text-red-800 dark:text-red-300 text-center font-bold bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-1.5 mt-2 flex items-center justify-center gap-1 shadow-sm">
              🚫 Không thể phê duyệt đơn này vì ngày {quotaInfo.eventDate} đã đạt số lượng tối đa ({quotaInfo.currentCount}/{quotaInfo.maxAllowed} sự kiện).
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
