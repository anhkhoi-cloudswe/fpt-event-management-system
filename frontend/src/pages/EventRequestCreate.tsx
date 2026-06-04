// Import useState để quản lý state trong React
import { useState } from 'react'

// Import useNavigate để điều hướng trang bằng code
import { useNavigate } from 'react-router-dom'

// Import icon Send để hiển thị nút “Gửi yêu cầu” đẹp hơn
import { Send, AlertCircle } from 'lucide-react'

// Import toast context để hiện thông báo (success / error)
import { useToast } from '../contexts/ToastContext'

/**
 * Hàm validate thời gian sự kiện với các quy tắc chi tiết
 * - Giờ bắt đầu: 07:00 - 21:00
 * - Giờ kết thúc: trước 21:00
 * - Thời lượng: 60 - 1080 phút (60 min đến 18 giờ)
 * - Phải đặt trước 24 giờ
 * - Không quá 365 ngày
 * - Cùng ngày
 */
function validateEventDateTime(
  startTimeStr: string,
  endTimeStr: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Nếu không có cả 2 thời gian -> valid (không bắt buộc)
  if (!startTimeStr || !endTimeStr) {
    return { valid: true, errors: [] }
  }

  // Convert datetime-local sang Date (thêm :00 để parse được)
  const startTime = new Date(startTimeStr + ':00')
  const endTime = new Date(endTimeStr + ':00')

  // Kiểm tra parse thất bại
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    errors.push('Định dạng thời gian không hợp lệ')
    return { valid: false, errors }
  }

  const now = new Date()

  // 1. Kiểm tra thời gian bắt đầu không được trong quá khứ
  if (startTime <= now) {
    errors.push('Thời gian bắt đầu không được trong quá khứ')
  }

  // 2. Kiểm tra thời gian kết thúc phải sau thời gian bắt đầu
  if (endTime <= startTime) {
    errors.push('Thời gian kết thúc phải sau thời gian bắt đầu')
  }

  // 3. Kiểm tra cùng ngày
  const startDate = startTime.toLocaleDateString('en-CA') // YYYY-MM-DD
  const endDate = endTime.toLocaleDateString('en-CA')
  if (startDate !== endDate) {
    errors.push('Sự kiện phải diễn ra trong cùng một ngày')
  }

  // 4. Kiểm tra thời lượng tối thiểu 60 phút
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  if (durationMinutes < 60) {
    errors.push('Sự kiện phải kéo dài ít nhất 60 phút')
  }

  // 5. Kiểm tra thời lượng tối đa 18 tiếng
  if (durationMinutes > 18 * 60) {
    errors.push('Sự kiện không được kéo dài quá 18 giờ trong một ngày')
  }

  // 6. Kiểm tra đặt trước ít nhất 24 giờ
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  if (hoursUntilStart < 24) {
    errors.push(
      `Sự kiện phải được lên lịch trước ít nhất 24 giờ (còn ${Math.floor(hoursUntilStart)} giờ)`,
    )
  }

  // 7. Kiểm tra không quá xa (365 ngày)
  const daysUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (daysUntilStart > 365) {
    errors.push('Sự kiện không được lên lịch quá 365 ngày từ hiện tại')
  }

  // 8. Kiểm tra giờ bắt đầu: 07:00 - 21:00
  const startHour = startTime.getHours()
  const startMinute = startTime.getMinutes()
  if (startHour < 7 || startHour > 21 || (startHour === 21 && startMinute > 0)) {
    errors.push('Sự kiện phải bắt đầu trước 21:00 (giờ bắt đầu sớm nhất: 07:00)')
  }

  // 9. Kiểm tra giờ kết thúc: trước 21:00
  const endHour = endTime.getHours()
  const endMinute = endTime.getMinutes()
  if (endHour > 21 || (endHour === 21 && endMinute > 0)) {
    errors.push('Sự kiện cần kết thúc trước 21:00 để dọn dẹp')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Hàm xử lý auto-focus khi nhập đủ năm (4 chữ số)
 * Datetime-local format: "YYYY-MM-DDTHH:mm"
 * - Year is at position 0-3
 * - Month is at position 5-6
 * - Day is at position 8-9
 * - Hour is at position 11-12
 * - Minute is at position 14-15
 *
 * Logic: Khi user đã gõ 4 chữ số năm, tự động di chuyển con trỏ sang phần tháng
 */
function handleDateTimeInput(
  e: React.SyntheticEvent<HTMLInputElement>,
): void {
  const input = e.currentTarget
  const cursorPos = input.selectionStart || 0
  const value = input.value

  // Nếu con trỏ đang ở vị trí năm (0-3) và user đã gõ 4 chữ số
  // tự động chuyển sang phần tháng
  if (cursorPos >= 4 && value.length >= 4) {
    const yearPart = value.substring(0, 4)
    // Kiểm tra 4 chữ số đầu đều là số
    if (/^\d{4}$/.test(yearPart) && cursorPos <= 4) {
      // Chuyển con trỏ đến phần tháng (vị trí 5)
      input.setSelectionRange(5, 5)
    }
  }

  // Nếu con trỏ đang ở vị trí tháng (5-6) và user đã gõ tháng
  // tự động chuyển sang phần ngày
  if (cursorPos >= 7 && value.length >= 7) {
    const monthPart = value.substring(5, 7)
    if (/^\d{2}$/.test(monthPart) && cursorPos <= 7) {
      // Chuyển con trỏ đến phần ngày (vị trí 8)
      input.setSelectionRange(8, 8)
    }
  }

  // Nếu con trỏ đang ở vị trí ngày (8-9) và user đã gõ ngày
  // tự động chuyển sang phần giờ
  if (cursorPos >= 10 && value.length >= 10) {
    const dayPart = value.substring(8, 10)
    if (/^\d{2}$/.test(dayPart) && cursorPos <= 10) {
      // Chuyển con trỏ đến phần giờ (vị trí 11)
      input.setSelectionRange(11, 11)
    }
  }

  // Nếu con trỏ đang ở vị trí giờ (11-12) và user đã gõ giờ
  // tự động chuyển sang phần phút
  if (cursorPos >= 13 && value.length >= 13) {
    const hourPart = value.substring(11, 13)
    if (/^\d{2}$/.test(hourPart) && cursorPos <= 13) {
      // Chuyển con trỏ đến phần phút (vị trí 14)
      input.setSelectionRange(14, 14)
    }
  }
}

/**
 * =============================================================================
 * EVENT REQUEST CREATE PAGE - Trang gửi yêu cầu tổ chức sự kiện
 * =============================================================================
 *
 * Trang này dùng cho (thường là Organizer/Staff):
 * - Nhập thông tin đề xuất sự kiện (title, description, reason, thời gian mong muốn, số lượng dự kiến)
 * - Validate dữ liệu (bắt buộc, và expectedParticipants phải là bội số của 10)
 * - Gọi API POST /api/event-requests để gửi yêu cầu về Backend
 * - Thành công -> toast success + điều hướng về trang danh sách yêu cầu
 *
 * Flow:
 * 1) User nhập form
 * 2) Validate realtime (onChange) và validate khi submit
 * 3) Submit -> gọi BE -> nếu ok thì về trang /dashboard/event-requests
 * =============================================================================
 */

export default function EventRequestCreate() {
  // navigate: điều hướng route trong SPA bằng code
  const navigate = useNavigate()

  // showToast: hiển thị thông báo toast
  const { showToast } = useToast()

  /**
   * formData: lưu toàn bộ dữ liệu input của form
   * Lưu ý: reason hiện tại có trong formData nhưng requestBody gửi BE đang chưa gửi reason
   * (tức BE hiện chỉ nhận title, description, preferredStartTime, preferredEndTime, expectedCapacity)
   */
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reason: '',
    preferredStart: '',
    preferredEnd: '',
    expectedParticipants: '',
  })

  // isSubmitting: trạng thái đang submit form -> disable nút
  const [isSubmitting, setIsSubmitting] = useState(false)

  // error: lỗi tổng (khi submit fail hoặc validate fail)
  const [error, setError] = useState<string | null>(null)

  // validationError: lỗi validate realtime (đang dùng cho expectedParticipants)
  const [validationError, setValidationError] = useState<string | null>(null)

  // timeValidationErrors: lỗi validate thời gian (có thể có nhiều lỗi)
  const [timeValidationErrors, setTimeValidationErrors] = useState<string[]>([])

  /**
   * fieldErrors: dùng để tô đỏ các field bắt buộc nếu trống
   * - title, description, reason: bắt buộc
   * - expectedParticipants: validate riêng theo bội số 10
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({
    title: false,
    description: false,
    reason: false,
    expectedParticipants: false,
  })

  /**
   * handleChange:
   * - Chạy khi user gõ/đổi giá trị input hoặc textarea
   * - Update formData theo name của input
   * - Validate realtime:
   *   + Nếu field bắt buộc (title/description/reason) -> check rỗng để set fieldErrors
   *   + Nếu expectedParticipants -> check >=10 và bội số 10
   *   + Nếu thời gian (preferredStart/preferredEnd) -> validate thời gian
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target

    // Update formData: giữ nguyên field cũ và cập nhật field đang thay đổi
    setFormData((prev) => ({ ...prev, [name]: value }))

    // ===== Validate rỗng cho các field bắt buộc =====
    if (['title', 'description', 'reason'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: value.trim() === '' }))
    }

    // ===== Validate thời gian (khi thay đổi start hoặc end) =====
    if (name === 'preferredStart' || name === 'preferredEnd') {
      const newFormData = { ...formData, [name]: value }
      const validation = validateEventDateTime(
        newFormData.preferredStart,
        newFormData.preferredEnd,
      )
      setTimeValidationErrors(validation.errors)
    }

    // ===== Validate realtime cho expectedParticipants =====
    if (name === 'expectedParticipants' && value) {
      const participants = parseInt(value)

      // Nếu không phải số hoặc < 10 -> lỗi
      if (isNaN(participants) || participants < 10) {
        setValidationError('Số lượng phải tối thiểu là 10')
        setFieldErrors((prev) => ({ ...prev, expectedParticipants: true }))

        // Nếu không chia hết cho 10 -> lỗi
      } else if (participants % 10 !== 0) {
        setValidationError('Số lượng phải là bội số của 10 (10, 20, 30, ...)')
        setFieldErrors((prev) => ({ ...prev, expectedParticipants: true }))

        // Hợp lệ -> clear lỗi
      } else {
        setValidationError(null)
        setFieldErrors((prev) => ({ ...prev, expectedParticipants: false }))
      }

      // Nếu user xóa trống expectedParticipants -> clear lỗi
    } else if (name === 'expectedParticipants' && !value) {
      setValidationError(null)
      setFieldErrors((prev) => ({ ...prev, expectedParticipants: false }))
    }
  }

  /**
   * handleBlur:
   * - Chạy khi user rời khỏi input/textarea
   * - Mục tiêu: nếu field bắt buộc bị bỏ trống -> show lỗi đỏ
   */
  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target

    // Các field bắt buộc: check rỗng
    if (['title', 'description', 'reason'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: value.trim() === '' }))
    }
  }

  /**
   * handleSubmit:
   * - Chạy khi submit form
   * Flow:
   * 1) preventDefault để không reload trang
   * 2) validate expectedParticipants lần cuối
   * 3) validate thời gian lần cuối
   * 4) setSubmitting true
   * 5) build requestBody theo format BE yêu cầu
   * 6) gọi API POST /api/event-requests
   * 7) ok -> toast success + navigate
   * 8) fail -> toast error + show error
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // ===== Validate expectedParticipants lần cuối trước khi gửi =====
    const participants = parseInt(formData.expectedParticipants)

    // Nếu có nhập expectedParticipants mà không hợp lệ -> báo lỗi và dừng
    if (
      formData.expectedParticipants &&
      (isNaN(participants) || participants < 10 || participants % 10 !== 0)
    ) {
      setError(
        'Số lượng người tham gia dự kiến phải là bội số của 10 (10, 20, 30, ...)',
      )
      return
    }

    // ===== Validate thời gian lần cuối =====
    const timeValidation = validateEventDateTime(
      formData.preferredStart,
      formData.preferredEnd,
    )
    if (!timeValidation.valid && timeValidation.errors.length > 0) {
      setError(timeValidation.errors.join('\n'))
      return
    }

    // Bắt đầu submit
    setIsSubmitting(true)

    try {
      /**
       * formatDateTimeLocal:
       * - input datetime-local trả về dạng: "YYYY-MM-DDTHH:mm"
       * - BE thường muốn: "YYYY-MM-DDTHH:mm:ss"
       * -> nối thêm ":00"
       */
      const formatDateTimeLocal = (dateTimeStr: string) => {
        if (!dateTimeStr) return null
        return dateTimeStr + ':00'
      }

      /**
       * requestBody:
       * - map từ formData sang format BE cần
       * - preferredStartTime / preferredEndTime: convert format
       * - expectedCapacity: BE đang dùng key này
       *
       * Lưu ý:
       * - reason đang chưa gửi lên BE (tùy yêu cầu nghiệp vụ)
       */
      const requestBody = {
        title: formData.title,
        description: formData.description,
        preferredStartTime: formData.preferredStart
          ? formatDateTimeLocal(formData.preferredStart)
          : null,
        preferredEndTime: formData.preferredEnd
          ? formatDateTimeLocal(formData.preferredEnd)
          : null,
        expectedCapacity: parseInt(formData.expectedParticipants) || 0,
      }

      console.log('Submitting event request:', requestBody)

      // ===== Gọi API tạo event request =====
      const response = await fetch('/api/event-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      // ===== Nếu ok -> thông báo + chuyển trang =====
      if (response.ok) {
        showToast('success', 'Yêu cầu tổ chức sự kiện đã được gửi thành công!')
        navigate('/dashboard/event-requests')
      } else {
        // Nếu lỗi -> đọc message BE trả về để show
        const errorData = await response.json()
        const errorMsg = errorData.message || errorData.error || 'Failed to submit event request'
        console.error('API Error Response:', errorData)
        throw new Error(errorMsg)
      }
    } catch (error) {
      // Handle lỗi network / lỗi BE
      console.error('Error submitting event request:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to submit event request'
      setError(errorMessage)
      showToast('error', errorMessage)
    } finally {
      // Dù ok hay fail -> tắt submitting
      setIsSubmitting(false)
    }
  }

  // ======================= UI RENDER =======================
  return (
    <div className="flex justify-center pb-12">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl border border-gray-100 dark:border-slate-800/80 shadow-xl p-8 md:p-10 max-w-4xl w-full transition-colors duration-500">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-slate-50 tracking-tight">
            Đề xuất <span className="bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">Yêu cầu Sự kiện</span>
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-2 text-sm font-medium">Vui lòng điền thông tin đề xuất chi tiết để chuyển đến Ban quản lý phê duyệt.</p>
        </div>

        {/* Form submit */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SECTION 1: THÔNG TIN CHUNG */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800/80 pb-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-transparent dark:border-orange-900/40 text-sm font-bold">1</span>
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50">Thông tin sự kiện cơ bản</h2>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Tiêu đề sự kiện đề xuất *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                placeholder="Nhập tên sự kiện thu hút người tham gia..."
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${fieldErrors.title
                  ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                  : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-300 dark:hover:border-orange-800/60 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                  }`}
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-red-650 dark:text-red-400 font-medium">
                  ⚠ Vui lòng nhập tiêu đề sự kiện
                </p>
              )}
            </div>


            {/* Description */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Mô tả chi tiết *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                rows={4}
                placeholder="Mô tả các nội dung chính, diễn giả, hoạt động đặc sắc của sự kiện..."
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${fieldErrors.description
                  ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                  : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-300 dark:hover:border-orange-800/60 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                  }`}
              />
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-red-650 dark:text-red-400 font-medium">
                  ⚠ Vui lòng nhập mô tả chi tiết
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Lý do / mục tiêu tổ chức *
              </label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                rows={3}
                placeholder="Nêu rõ mục tiêu của chương trình và lợi ích dành cho sinh viên tham gia..."
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${fieldErrors.reason
                  ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                  : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-300 dark:hover:border-orange-800/60 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                  }`}
              />
              {fieldErrors.reason && (
                <p className="mt-1 text-xs text-red-650 dark:text-red-400 font-medium">
                  ⚠ Vui lòng nhập lý do / mục tiêu tổ chức
                </p>
              )}
            </div>
          </div>

          {/* SECTION 2: KẾ HOẠCH & SỐ LƯỢNG */}
          <div className="space-y-6 pt-4">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800/80 pb-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-transparent dark:border-orange-900/40 text-sm font-bold">2</span>
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-50">Kế hoạch thời gian & Sức chứa</h2>
            </div>

            {/* Preferred time range */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* preferredStart */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                    Thời gian bắt đầu mong muốn
                  </label>
                  <input
                    type="datetime-local"
                    name="preferredStart"
                    value={formData.preferredStart}
                    onChange={handleChange}
                    onInput={handleDateTimeInput}
                    max="9999-12-31T23:59"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${timeValidationErrors.length > 0
                      ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                      : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-300 dark:hover:border-orange-850 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                      }`}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
                    📅 Khung giờ hoạt động: 07:00 - 21:00 (Kéo dài tối thiểu 60 phút)
                  </p>
                </div>

                {/* preferredEnd */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                    Thời gian kết thúc mong muốn
                  </label>
                  <input
                    type="datetime-local"
                    name="preferredEnd"
                    value={formData.preferredEnd}
                    onChange={handleChange}
                    onInput={handleDateTimeInput}
                    max="9999-12-31T23:59"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${timeValidationErrors.length > 0
                      ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                      : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-300 dark:hover:border-orange-850 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                      }`}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
                    ⏰ Sự kiện cần kết thúc trước 21:00 để dọn dẹp địa điểm
                  </p>
                </div>
              </div>

              {/* Time Validation Errors */}
              {timeValidationErrors.length > 0 && (
                <div className="p-5 bg-red-50/80 dark:bg-red-950/20 backdrop-blur-sm border border-red-200 dark:border-red-900/35 rounded-2xl shadow-sm">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-650 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-bold text-red-900 dark:text-red-400 mb-2">
                        Vui lòng điều chỉnh thời gian sự kiện:
                      </h4>
                      <ul className="space-y-1">
                        {timeValidationErrors.map((error, index) => (
                          <li key={index} className="text-sm text-red-700 dark:text-red-300 font-medium">
                            • {error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Expected Participants */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Số lượng người tham gia dự kiến
              </label>
              <input
                type="number"
                name="expectedParticipants"
                value={formData.expectedParticipants}
                onChange={handleChange}
                min="10"
                step="10"
                placeholder="Nhập bội số của 10: 50, 100, 200..."
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${validationError
                  ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                  : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-300 dark:hover:border-orange-850 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                  }`}
              />
              {validationError && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">⚠ {validationError}</p>
              )}
            </div>
          </div>

          {/* ===== Error tổng khi submit fail / validate fail ===== */}
          {error && (
            <div className="p-5 bg-red-50/80 dark:bg-red-950/20 backdrop-blur-sm border border-red-200 dark:border-red-900/35 rounded-2xl shadow-sm">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-650 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-red-900 dark:text-red-400 mb-1">Gửi yêu cầu không thành công:</h4>
                  <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line font-medium leading-relaxed">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* ===== Action Buttons ===== */}
          <div className="pt-6 border-t border-gray-100 dark:border-slate-800/80 flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard/event-requests')}
              className="px-6 py-3 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 transition-colors duration-300 font-bold"
              disabled={isSubmitting}
            >
              Hủy
            </button>

            <button
              type="submit"
              className="inline-flex items-center px-8 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 text-white font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/35 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={isSubmitting}
            >
              <Send className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu ngay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

