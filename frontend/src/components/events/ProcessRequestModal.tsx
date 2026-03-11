// ===================== IMPORTS =====================

// Icon X dùng cho nút đóng modal
import { X } from 'lucide-react'

// useState/useEffect dùng quản lý state & lifecycle React
import { useState, useEffect } from 'react'

// ToastContext để hiển thị thông báo (warning/success/error)
import { useToast } from '../../contexts/ToastContext'

// useAvailableAreas hook để fetch khu vực trống theo thời gian & sức chứa
import { useAvailableAreas, AvailableArea } from '../../hooks/useAvailableAreas'

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

// CheckDailyQuotaResponse: Response từ API /api/events/daily-quota
type CheckDailyQuotaResponse = {
  eventDate: string
  currentCount: number
  maxAllowed: number
  quotaExceeded: boolean
  canApproveMore: boolean
  warningMessage: string
}

// Props của modal xử lý request
type ProcessRequestModalProps = {
  // isOpen: modal có đang mở không
  isOpen: boolean

  // onClose: callback đóng modal (component cha truyền xuống)
  onClose: () => void

  // onSubmit: callback gửi dữ liệu duyệt/từ chối lên cha
  // areaId: khu vực được chọn (khi APPROVE)
  // organizerNote: ghi chú cho organizer
  // rejectReason: lý do từ chối (bắt buộc khi REJECT)
  onSubmit: (areaId: number, organizerNote: string, rejectReason?: string) => void

  // action: hành động đang xử lý: APPROVE (duyệt) hoặc REJECT (từ chối)
  action: 'APPROVE' | 'REJECT'

  // request: request đang được xử lý (có thể null nếu chưa chọn request)
  request: {
    requestId: number
    title: string
    preferredStartTime?: string
    preferredEndTime?: string
    expectedCapacity?: number
  } | null
}

// ===================== COMPONENT =====================

export function ProcessRequestModal({
  isOpen,
  onClose,
  onSubmit,
  action,
  request
}: ProcessRequestModalProps) {

  // Lấy hàm showToast để hiển thị thông báo nhỏ trên UI
  const { showToast } = useToast()

  // selectedAreaId: id khu vực đang được chọn
  // mặc định 0 = chưa chọn/không hợp lệ
  const [selectedAreaId, setSelectedAreaId] = useState<number>(0)

  // organizerNote: ghi chú staff gửi cho organizer
  const [organizerNote, setOrganizerNote] = useState('')

  // rejectReason: lý do từ chối (bắt buộc khi action === 'REJECT')
  const [rejectReason, setRejectReason] = useState('')

  // isDropdownOpen: state để control custom dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // quotaInfo: Thông tin hạn ngạch hàng ngày (tối đa 2 sự kiện/ngày)
  const [quotaInfo, setQuotaInfo] = useState<CheckDailyQuotaResponse | null>(null)
  const [loadingQuota, setLoadingQuota] = useState(false)

  /**
   * ======================== HOOK: Get AVAILABLE AREAS ========================
   * useAvailableAreas:
   * - Truyền: startTime, endTime, expectedCapacity
   * - Return: areas[], loading, error
   * 
   * Cách hoạt động:
   * 1. Modal mở + action = APPROVE -> pass thời gian + capacity vào hook
   * 2. Hook tự động gọi API /api/events/available-areas?startTime=...&endTime=...&expectedCapacity=...
   * 3. Kết quả trả về tự động update state
   * 4. UI render danh sách areas sorted by capacity (ASC)
   * 
   * Backend đảm bảo:
   * - Filter: COALESCE(va.capacity, 0) >= expectedCapacity
   * - Sort: ORDER BY COALESCE(va.capacity, 0) ASC (nhỏ nhất trước)
   */
  const {
    areas,
    loading,
    error
  } = useAvailableAreas(
    // startTime: ISO format từ request.preferredStartTime
    // null nếu modal chưa mở hoặc action != APPROVE
    isOpen && action === 'APPROVE' && request?.preferredStartTime ? request.preferredStartTime : null,

    // endTime: ISO format từ request.preferredEndTime
    // null nếu modal chưa mở hoặc action != APPROVE
    isOpen && action === 'APPROVE' && request?.preferredEndTime ? request.preferredEndTime : null,

    // expectedCapacity: số người dự kiến
    // 0 (default) = show tất cả areas, 
    // > 0 = chỉ show areas có capacity >= expectedCapacity
    isOpen && action === 'APPROVE' && request?.expectedCapacity ? request.expectedCapacity : 0
  )

  /**
   * ======================== HOOK: FETCH DAILY QUOTA ========================
   * useEffect:
   * - Khi modal mở + action = APPROVE + có preferredStartTime
   * - Gọi API /api/events/daily-quota?date=YYYY-MM-DD
   * - Hiển thị cảnh báo nếu hết slot (2 sự kiện/ngày)
   */
  useEffect(() => {
    if (!isOpen || action !== 'APPROVE' || !request?.preferredStartTime) {
      setQuotaInfo(null)
      return
    }

    const fetchQuota = async () => {
      try {
        setLoadingQuota(true)
        // Extract YYYY-MM-DD from ISO timestamp
        const eventDate = request?.preferredStartTime?.split('T')[0]
        if (!eventDate) {
          console.warn('Unable to extract event date from request')
          return
        }

        const token = localStorage.getItem('token')

        const response = await fetch(
          `/api/events/daily-quota?date=${eventDate}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        )

        if (response.ok) {
          const data: CheckDailyQuotaResponse = await response.json()
          setQuotaInfo(data)
          console.log('[ProcessRequestModal] Daily quota:', data)
        } else {
          console.error('[ProcessRequestModal] Failed to fetch quota')
        }
      } catch (error) {
        console.error('[ProcessRequestModal] Error fetching daily quota:', error)
      } finally {
        setLoadingQuota(false)
      }
    }

    fetchQuota()
  }, [isOpen, action, request?.preferredStartTime])

  // ===================== EFFECT: AUTO SELECT FIRST AREA IF AVAILABLE =====================
  useEffect(() => {
    /**
     * Khi danh sách areas thay đổi (từ hook):
     * - Nếu có areas -> auto select cái đầu tiên (optimize UX)
     * - Hook đã sort by capacity ASC => cái đầu là phòng nhỏ nhất thoả điều kiện
     * - Nếu không có areas -> selected = 0
     */
    if (areas.length > 0) {
      setSelectedAreaId(areas[0].areaId)
      console.log('[ProcessRequestModal] Auto-selected first area:', {
        areaId: areas[0].areaId,
        areaName: areas[0].areaName,
        capacity: areas[0].capacity,
        totalOptions: areas.length
      })
    } else {
      setSelectedAreaId(0)
    }
  }, [areas])

  // ===================== HELPER: TRUNCATE VENUE NAME =====================
  /**
   * Smart truncation for long venue names
   * Example: "Nhà văn hóa sinh viên Đại học Quốc gia Tp HCM" → "NVH Sinh viên ĐHQG"
   */
  const truncateVenueName = (venueName: string, maxLength: number = 30): string => {
    if (venueName.length <= maxLength) return venueName

    // Map common long venue names to abbreviations
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

    // If still too long, truncate with ellipsis
    if (abbreviated.length > maxLength) {
      return abbreviated.substring(0, maxLength - 3) + '...'
    }
    return abbreviated
  }

  // ===================== HELPER: FORMAT AREA OPTION TEXT =====================
  /**
   * Helper function to format area dropdown option text
   * Format: [capacity] - areaName (venueName)
   * With warning if oversized: (Quá rộng) in orange
   */
  const formatAreaOption = (area: AvailableArea): string => {
    const expectedCap = request?.expectedCapacity ?? 0
    const capacity = area.capacity ?? 0
    const isMuchLarger = expectedCap > 0 && capacity > expectedCap * 3

    let text = `[${capacity}] - ${area.areaName} (${area.venueName})`
    if (isMuchLarger) {
      text += ' (Quá rộng)'
    }
    return text
  }

  // ===================== SUBMIT FORM =====================
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    /**
     * Nếu APPROVE thì bắt buộc phải có selectedAreaId != 0
     * Nếu không có -> toast warning và return
     */
    if (action === 'APPROVE' && selectedAreaId === 0) {
      showToast('warning', 'Vui lòng chọn khu vực cho sự kiện')
      return
    }

    /**
     * Nếu REJECT thì bắt buộc phải có lý do từ chối
     * Nếu không có -> toast warning và return
     */
    if (action === 'REJECT' && rejectReason.trim() === '') {
      showToast('warning', 'Vui lòng nhập lý do từ chối')
      return
    }

    // Gửi dữ liệu lên cha
    // Với REJECT: chuyển rejectReason thay vì organizerNote
    onSubmit(selectedAreaId, organizerNote, action === 'REJECT' ? rejectReason : undefined)

    // Đóng modal và reset state
    handleClose()
  }

  // ===================== CLOSE MODAL + RESET STATE =====================
  const handleClose = () => {
    // reset các state về mặc định
    setSelectedAreaId(0)
    setOrganizerNote('')
    setRejectReason('')
    setIsDropdownOpen(false)

    // gọi callback đóng modal
    onClose()
  }

  // Nếu modal không mở hoặc request null => không render
  if (!isOpen || !request) return null

  // ===================== UI RENDER =====================
  return (
    // Overlay modal
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {/* Box modal - wider for better dropdown display */}
      <div className="bg-white rounded-lg shadow-xl w-full" style={{ maxWidth: '600px' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b bg-gradient-to-r from-gray-50 to-white">
          <h2 className="text-xl font-semibold text-gray-900">
            {/* Title đổi theo action */}
            {action === 'APPROVE' ? 'Duyệt yêu cầu' : 'Từ chối yêu cầu'}
          </h2>

          {/* Nút đóng */}
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">

          {/* Hiển thị tên sự kiện */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sự kiện
            </label>
            <p className="text-sm text-gray-600 font-medium">{request.title}</p>
          </div>

          {/* Hiển thị số lượng dự kiến nếu có */}
          {request.expectedCapacity && (
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">
                    Sức chứa yêu cầu
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-blue-700">
                      {request.expectedCapacity}
                    </span>
                    <span className="text-sm text-blue-600">người</span>
                  </div>
                </div>
                <div className="text-2xl">👥</div>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                💡 Hệ thống gợi ý phòng có sức chứa ≥ {request.expectedCapacity} người
              </p>
            </div>
          )}

          {/* Daily Quota Warning - Chỉ hiện khi APPROVE */}
          {action === 'APPROVE' && quotaInfo && !loadingQuota && (() => {
            // Dùng currentCount >= 2 trực tiếp để đảm bảo đồng bộ với backend lock.
            // KHÔNG dùng quotaExceeded (server-side flag) vì có thể lỗi thời nếu
            // server đếm sai (cũ: chỉ đếm OPEN+APPROVED, giờ: NOT IN CANCELLED/REJECTED).
            const isFull = quotaInfo.currentCount >= quotaInfo.maxAllowed
            const isLastSlot = !isFull && quotaInfo.currentCount === quotaInfo.maxAllowed - 1

            return (
              <div
                className={`p-4 rounded-lg border ${isFull
                    ? 'bg-red-50 border-red-300'
                    : isLastSlot
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-green-50 border-green-200'
                  }`}
              >
                <p
                  className={`text-sm font-semibold ${isFull
                      ? 'text-red-800'
                      : isLastSlot
                        ? 'text-yellow-700'
                        : 'text-green-700'
                    }`}
                >
                  {isFull ? (
                    <>
                      <span className="text-lg">🚫</span>{' '}
                      Ngày này đã hết suất tổ chức ({quotaInfo.currentCount}/{quotaInfo.maxAllowed})
                    </>
                  ) : isLastSlot ? (
                    <>
                      <span className="text-lg">⚠️</span>{' '}
                      {quotaInfo.warningMessage || `Còn 1 suất trống trong ngày (${quotaInfo.currentCount}/${quotaInfo.maxAllowed})`}
                    </>
                  ) : (
                    <>
                      <span className="text-lg">✅</span> Còn{' '}
                      {quotaInfo.maxAllowed - quotaInfo.currentCount} slot trống cho ngày này
                      (Tổng: {quotaInfo.currentCount}/{quotaInfo.maxAllowed})
                    </>
                  )}
                </p>
              </div>
            )
          })()}

          {/* Nếu action là APPROVE => bắt buộc chọn khu vực */}
          {action === 'APPROVE' && (
            <div>
              <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-2">
                Chọn khu vực <span className="text-red-500">*</span>
              </label>

              {/* Loading trạng thái */}
              {loading ? (
                <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
                  <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
                  <p className="text-sm text-gray-600">Đang tải danh sách khu vực khả dụng...</p>
                </div>

              ) : error ? (
                // Nếu lỗi => show error text
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700">
                    ⚠️ {error}
                  </p>
                </div>

              ) : areas.length === 0 ? (
                // Không có area nào phù hợp
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-700 font-medium">
                    ❌ Không tìm thấy phòng trống phù hợp với {request.expectedCapacity} chỗ ngồi
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Vui lòng thay đổi thời gian hoặc số lượng người tham gia
                  </p>
                </div>

              ) : (
                // Custom dropdown with rich rendering
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left bg-white hover:bg-gray-50 flex justify-between items-center"
                  >
                    <span className="text-gray-900 font-medium">
                      {selectedAreaId === 0
                        ? '-- Chọn khu vực --'
                        : (() => {
                          const selected = areas.find(a => a.areaId === selectedAreaId)
                          return selected ? `[${selected.capacity}] - ${selected.areaName}` : '-- Chọn khu vực --'
                        })()}
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                      {areas.map((area: AvailableArea) => {
                        const expectedCap = request?.expectedCapacity ?? 0
                        const capacity = area.capacity ?? 0
                        const isMuchLarger = expectedCap > 0 && capacity > expectedCap * 3
                        const isSelected = area.areaId === selectedAreaId
                        const truncatedVenue = truncateVenueName(area.venueName)

                        return (
                          <button
                            key={area.areaId}
                            type="button"
                            onClick={() => {
                              setSelectedAreaId(area.areaId)
                              setIsDropdownOpen(false)
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-blue-50 border-b last:border-b-0 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                              }`}
                          >
                            {/* Row 1: Capacity - Area Name, with warning badge if needed */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900">
                                  [{area.capacity}] - {area.areaName}
                                </p>
                              </div>
                              {isMuchLarger && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 whitespace-nowrap">
                                  Quá rộng
                                </span>
                              )}
                            </div>

                            {/* Row 2: Venue name and floor - smaller gray text */}
                            <p className="text-xs text-gray-500 mt-1">
                              {truncatedVenue}
                              {area.floor && ` - Tầng ${area.floor}`}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Close dropdown when clicking outside */}
              {isDropdownOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsDropdownOpen(false)}
                />
              )}

              {/* Info: Số lượng phòng trống */}
              {!loading && !error && areas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-600">
                    📍 Tìm thấy <span className="font-bold text-gray-900">{areas.length} khu vực</span> phù hợp (sorted by capacity)
                  </p>
                  {areas.some((a: AvailableArea) => {
                    const expectedCap = request?.expectedCapacity ?? 0
                    const capacity = a.capacity ?? 0
                    return expectedCap > 0 && capacity > expectedCap * 3
                  }) && (
                      <p className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                        ⚠️ Phòng có dấu (Quá rộng) sức chứa {'>'} 3 lần yêu cầu
                      </p>
                    )}
                </div>
              )}

              {/* ⚠️ 3x CAPACITY WARNING - Show prominent warning if selected room is too large */}
              {!loading && !error && selectedAreaId > 0 && (() => {
                const selectedArea = areas.find(a => a.areaId === selectedAreaId)
                const expectedCap = request?.expectedCapacity ?? 0
                const selectedCapacity = selectedArea?.capacity ?? 0
                const isMuchLarger = expectedCap > 0 && selectedCapacity > expectedCap * 3

                if (isMuchLarger) {
                  return (
                    <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-sm font-semibold text-orange-800 flex items-start gap-2">
                        <span className="text-lg flex-shrink-0">⚠️</span>
                        <span>
                          Hệ thống gợi ý phòng có sức chứa gần với {expectedCap} người hơn để tối ưu tài nguyên
                        </span>
                      </p>
                      <p className="text-xs text-orange-700 mt-1 ml-7">
                        Phòng được chọn có sức chứa {selectedCapacity}, lớn hơn {Math.floor(selectedCapacity / expectedCap)}x so với yêu cầu.
                      </p>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          )}

          {/* Lý do từ chối (required khi REJECT) */}
          {action === 'REJECT' && (
            <div>
              <label htmlFor="rejectReason" className="block text-sm font-medium text-gray-700 mb-2">
                Lý do từ chối <span className="text-red-500">*</span>
              </label>
              <textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-gray-900 text-sm"
                placeholder="Nhập lý do từ chối (bắt buộc)..."
              />

              {/* Template suggestions for reject reason */}
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">💡 Gợi ý:</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.reject.map((template, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setRejectReason(template)}
                      className="bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-700 text-xs px-3 py-1.5 rounded-full transition-colors border border-gray-200 hover:border-red-300 cursor-pointer"
                      title="Click để điền nội dung"
                    >
                      📝 {template.substring(0, 35)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Ghi chú cho organizer (optional, chỉ hiện khi APPROVE) */}
          {action === 'APPROVE' && (
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                Ghi chú cho người tổ chức
              </label>
              <textarea
                id="note"
                value={organizerNote}
                onChange={(e) => setOrganizerNote(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 text-sm"
                placeholder="Nhập ghi chú (không bắt buộc)..."
              />

              {/* Template suggestions for approval note */}
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">💡 Gợi ý:</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.approve.map((template, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setOrganizerNote(template)}
                      className="bg-gray-100 hover:bg-green-100 text-gray-700 hover:text-green-700 text-xs px-3 py-1.5 rounded-full transition-colors border border-gray-200 hover:border-green-300 cursor-pointer"
                      title="Click để điền nội dung"
                    >
                      📝 {template.substring(0, 35)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            {/* Hủy */}
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Hủy
            </button>

            {/* Submit */}
            {/* Khóa cứng: nếu currentCount >= 2 → disable nút Duyệt, buộc staff phải từ chối */}
            <button
              type="submit"
              // Nếu APPROVE mà đang loading, không có area, hoặc đã đủ 2 sự kiện/ngày => disable
              disabled={
                action === 'APPROVE' &&
                (loading || areas.length === 0 || (quotaInfo?.currentCount ?? 0) >= 2)
              }
              title={
                action === 'APPROVE' && (quotaInfo?.currentCount ?? 0) >= 2
                  ? 'Vui lòng từ chối đơn này vì đã hết suất trong ngày'
                  : undefined
              }
              className={`flex-1 px-4 py-3 text-white rounded-lg transition-colors font-medium text-sm ${action === 'APPROVE'
                ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
                }`}
            >
              {action === 'APPROVE' ? '✓ Duyệt' : '✗ Từ chối'}
            </button>
          </div>

          {/* Thông báo khóa cứng khi đã đạt giới hạn 2 sự kiện/ngày */}
          {action === 'APPROVE' && quotaInfo && (quotaInfo.currentCount ?? 0) >= 2 && (
            <p className="text-xs text-red-600 text-center font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              🚫 Vui lòng từ chối đơn này vì đã hết suất trong ngày ({quotaInfo.currentCount}/{quotaInfo.maxAllowed} sự kiện)
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
