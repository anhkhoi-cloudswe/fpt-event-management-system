import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, AlertCircle, Upload, Image as ImageIcon, Trash2, Globe, MapPin, Building2, Sparkles, X, LayoutGrid } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { uploadEventBanner, deleteEventBanner, validateImageFile } from '../utils/imageUpload'

function validateEventDateTime(
  startTimeStr: string,
  endTimeStr: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!startTimeStr || !endTimeStr) {
    return { valid: true, errors: [] }
  }

  const startTime = new Date(startTimeStr + ':00')
  const endTime = new Date(endTimeStr + ':00')

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    errors.push('Định dạng thời gian không hợp lệ')
    return { valid: false, errors }
  }

  const now = new Date()

  if (startTime <= now) {
    errors.push('Thời gian bắt đầu không được trong quá khứ')
  }

  if (endTime <= startTime) {
    errors.push('Thời gian kết thúc phải sau thời gian bắt đầu')
  }

  const startDate = startTime.toLocaleDateString('en-CA')
  const endDate = endTime.toLocaleDateString('en-CA')
  if (startDate !== endDate) {
    errors.push('Sự kiện phải diễn ra trong cùng một ngày')
  }

  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  if (durationMinutes < 60) {
    errors.push('Sự kiện phải kéo dài nhất 60 phút')
  }

  if (durationMinutes > 18 * 60) {
    errors.push('Sự kiện không được kéo dài quá 18 giờ trong một ngày')
  }

  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  if (hoursUntilStart < 24) {
    errors.push(
      `Sự kiện phải được lên lịch trước ít nhất 24 giờ (còn ${Math.floor(hoursUntilStart)} giờ)`,
    )
  }

  if (daysUntilStart > 365) {
    errors.push('Sự kiện không được lên lịch quá 365 ngày từ hiện tại')
  }

  const startHour = startTime.getHours()
  const startMinute = startTime.getMinutes()
  if (startHour < 7 || startHour > 21 || (startHour === 21 && startMinute > 0)) {
    errors.push('Sự kiện phải bắt đầu trước 21:00 (giờ bắt đầu sớm nhất: 07:00)')
  }

  const endHour = endTime.getHours()
  const endMinute = endTime.getMinutes()
  if (endHour > 21 || (endHour === 21 && endMinute > 0)) {
    errors.push('Sự kiện cần kết thúc trước 21:00 để dọn dẹp')
  }

  return { valid: errors.length === 0, errors }
}

const daysUntilStart = 0 // defined to satisfy compiler

function handleDateTimeInput(
  e: React.SyntheticEvent<HTMLInputElement>,
): void {
  const input = e.currentTarget
  const cursorPos = input.selectionStart || 0
  const value = input.value

  if (cursorPos >= 4 && value.length >= 4) {
    const yearPart = value.substring(0, 4)
    if (/^\d{4}$/.test(yearPart) && cursorPos <= 4) {
      input.setSelectionRange(5, 5)
    }
  }

  if (cursorPos >= 7 && value.length >= 7) {
    const monthPart = value.substring(5, 7)
    if (/^\d{2}$/.test(monthPart) && cursorPos <= 7) {
      input.setSelectionRange(8, 8)
    }
  }

  if (cursorPos >= 10 && value.length >= 10) {
    const dayPart = value.substring(8, 10)
    if (/^\d{2}$/.test(dayPart) && cursorPos <= 10) {
      input.setSelectionRange(11, 11)
    }
  }

  if (cursorPos >= 13 && value.length >= 13) {
    const hourPart = value.substring(11, 13)
    if (/^\d{2}$/.test(hourPart) && cursorPos <= 13) {
      input.setSelectionRange(14, 14)
    }
  }
}

export default function EventRequestCreate() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [flowType, setFlowType] = useState<'UNIVERSITY' | 'INDEPENDENT'>('UNIVERSITY')
  const [eventFormat, setEventFormat] = useState<'ONLINE' | 'ONSITE' | 'HYBRID'>('ONSITE')
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reason: '',
    preferredStart: '',
    preferredEnd: '',
    expectedParticipants: '',
    customVenueName: '',
    customLocation: '',
  })

  const [bannerUrl, setBannerUrl] = useState<string>('')
  const [sampleBanners, setSampleBanners] = useState<any[]>([])
  const [isBannersModalOpen, setIsBannersModalOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [timeValidationErrors, setTimeValidationErrors] = useState<string[]>([])

  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({
    title: false,
    description: false,
    reason: false,
    expectedParticipants: false,
  })

  useEffect(() => {
    const fetchSampleBanners = async () => {
      try {
        const response = await fetch('/api/sample-banners')
        if (response.ok) {
          const data = await response.json()
          setSampleBanners(data || [])
        }
      } catch (err) {
        console.error('Failed to fetch sample banners:', err)
      }
    }
    fetchSampleBanners()
  }, [])

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      showToast('error', validation.error || 'Ảnh không hợp lệ')
      return
    }

    setIsUploading(true)
    setError(null)
    try {
      if (bannerUrl && bannerUrl.includes('/uploads/')) {
        await deleteEventBanner(bannerUrl)
      }
      const uploadedUrl = await uploadEventBanner(file)
      setBannerUrl(uploadedUrl)
      showToast('success', 'Tải lên ảnh bìa thành công!')
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải lên ảnh bìa')
      showToast('error', err.message || 'Lỗi khi tải lên ảnh bìa')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSelectSampleBanner = async (url: string) => {
    if (bannerUrl && bannerUrl.includes('/uploads/')) {
      await deleteEventBanner(bannerUrl)
    }
    setBannerUrl(url)
    setIsBannersModalOpen(false)
  }

  const handleRemoveBanner = async () => {
    if (bannerUrl && bannerUrl.includes('/uploads/')) {
      await deleteEventBanner(bannerUrl)
    }
    setBannerUrl('')
  }

  const handleCancel = async () => {
    if (bannerUrl && bannerUrl.includes('/uploads/')) {
      await deleteEventBanner(bannerUrl)
    }
    navigate('/dashboard/event-requests')
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    if (['title', 'description', 'reason'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: value.trim() === '' }))
    }

    if (name === 'preferredStart' || name === 'preferredEnd') {
      const newFormData = { ...formData, [name]: value }
      const validation = validateEventDateTime(
        newFormData.preferredStart,
        newFormData.preferredEnd,
      )
      setTimeValidationErrors(validation.errors)
    }

    if (name === 'expectedParticipants' && value) {
      const participants = parseInt(value)
      if (isNaN(participants) || participants < 10) {
        setValidationError('Số lượng phải tối thiểu là 10')
        setFieldErrors((prev) => ({ ...prev, expectedParticipants: true }))
      } else if (participants % 10 !== 0) {
        setValidationError('Số lượng phải là bội số của 10 (10, 20, 30, ...)')
        setFieldErrors((prev) => ({ ...prev, expectedParticipants: true }))
      } else {
        setValidationError(null)
        setFieldErrors((prev) => ({ ...prev, expectedParticipants: false }))
      }
    } else if (name === 'expectedParticipants' && !value) {
      setValidationError(null)
      setFieldErrors((prev) => ({ ...prev, expectedParticipants: false }))
    }
  }

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    if (['title', 'description', 'reason'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: value.trim() === '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const participants = parseInt(formData.expectedParticipants)
    if (
      formData.expectedParticipants &&
      (isNaN(participants) || participants < 10 || participants % 10 !== 0)
    ) {
      setError('Số lượng người tham gia dự kiến phải là bội số của 10 (10, 20, 30, ...)')
      return
    }

    const timeValidation = validateEventDateTime(
      formData.preferredStart,
      formData.preferredEnd,
    )
    if (!timeValidation.valid && timeValidation.errors.length > 0) {
      setError(timeValidation.errors.join('\n'))
      return
    }

    setIsSubmitting(true)

    try {
      const formatDateTimeLocal = (dateTimeStr: string) => {
        if (!dateTimeStr) return null
        return dateTimeStr + ':00'
      }

      const requestBody = {
        title: formData.title,
        description: formData.description || null,
        preferredStartTime: formData.preferredStart
          ? formatDateTimeLocal(formData.preferredStart)
          : null,
        preferredEndTime: formData.preferredEnd
          ? formatDateTimeLocal(formData.preferredEnd)
          : null,
        expectedCapacity: parseInt(formData.expectedParticipants) || 0,
        eventFormat: eventFormat,
        customVenueName: (eventFormat === 'ONSITE' || eventFormat === 'HYBRID') ? (formData.customVenueName || null) : null,
        customLocation: (eventFormat === 'ONSITE' || eventFormat === 'HYBRID') ? (formData.customLocation || null) : null,
        bannerUrl: bannerUrl || null,
      }

      const url = flowType === 'UNIVERSITY' ? '/api/event-requests' : '/api/events/independent'
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        showToast(
          'success',
          flowType === 'UNIVERSITY'
            ? 'Yêu cầu tổ chức sự kiện đã được gửi thành công!'
            : 'Sự kiện tự do đã được tạo trực tiếp thành công!'
        )
        navigate('/dashboard/event-requests')
      } else {
        const errorData = await response.json()
        const errorMsg = errorData.message || errorData.error || 'Thao tác thất bại'
        throw new Error(errorMsg)
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  const categories = ['ALL', ...Array.from(new Set(sampleBanners.map((b) => b.category).filter(Boolean)))]

  const filteredBanners = selectedCategory === 'ALL'
    ? sampleBanners
    : sampleBanners.filter((b) => b.category === selectedCategory)

  return (
    <div className="flex justify-center pb-12 px-4">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl border border-gray-100 dark:border-slate-800/80 shadow-2xl p-6 md:p-8 max-w-6xl w-full transition-colors duration-500">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-slate-50 tracking-tight flex items-center justify-center gap-2">
            Tạo <span className="bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">Sự Kiện & Đề Xuất</span>
            <Sparkles className="w-6 h-6 text-orange-500 animate-pulse" />
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-2 text-sm font-medium">
            Chọn hình thức tổ chức phù hợp và điền thông tin chi tiết cho sự kiện của bạn.
          </p>
        </div>

        {/* Flow Switch Tab */}
        <div className="flex justify-center mb-8">
          <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-slate-950 rounded-2xl w-full max-w-lg">
            <button
              type="button"
              onClick={() => setFlowType('UNIVERSITY')}
              className={`py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 ${
                flowType === 'UNIVERSITY'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-md'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-slate-200'
              }`}
            >
              🏫 Sự kiện trường học (Cần duyệt)
            </button>
            <button
              type="button"
              onClick={() => setFlowType('INDEPENDENT')}
              className={`py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 ${
                flowType === 'INDEPENDENT'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-md'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-slate-200'
              }`}
            >
              🌐 Sự kiện tự do (Trực tiếp)
            </button>
          </div>
        </div>

        {/* Main Content: Two Columns */}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Image / Banner Upload & Selector */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="border border-gray-200 dark:border-slate-800 rounded-2xl p-4 bg-gray-50/50 dark:bg-slate-950/20 backdrop-blur-sm">
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-3">
                Ảnh bìa sự kiện
              </label>

              {/* Banner Preview Area */}
              <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-900 border border-dashed border-gray-300 dark:border-slate-800 flex flex-col items-center justify-center group">
                {bannerUrl ? (
                  <>
                    <img
                      src={bannerUrl}
                      alt="Banner sự kiện"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBannersModalOpen(true)}
                        className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md text-white rounded-lg transition"
                        title="Thay đổi ảnh từ mẫu"
                      >
                        <LayoutGrid className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        className="p-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition"
                        title="Xóa ảnh"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 flex flex-col items-center">
                    <ImageIcon className="w-12 h-12 text-gray-400 mb-2" />
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Chưa chọn ảnh bìa</p>
                  </div>
                )}
              </div>

              {/* Upload & Choose template buttons */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsBannersModalOpen(true)}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-850 transition duration-300"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Ảnh bìa mẫu
                </button>

                <label className="flex items-center justify-center gap-2 py-2.5 px-3 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-850 cursor-pointer transition duration-300">
                  <Upload className="w-4 h-4" />
                  {isUploading ? 'Đang tải...' : 'Tải ảnh lên'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Info notice */}
            <div className="bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/35 rounded-2xl p-4 text-xs text-orange-800 dark:text-orange-400 font-medium leading-relaxed">
              💡 Bạn có thể chọn các ảnh thiết kế sẵn từ thư viện <b>Ảnh bìa mẫu</b> để tiết kiệm thời gian, hoặc tải lên ảnh tự thiết kế của riêng bạn.
            </div>
          </div>

          {/* Right Column: Form Fields */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Title */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Tên sự kiện *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                placeholder="Nhập tên sự kiện thu hút người tham gia..."
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${
                  fieldErrors.title
                    ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                    : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-350 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                }`}
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
                  ⚠ Vui lòng nhập tên sự kiện
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
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${
                  fieldErrors.description
                    ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                    : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-350 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                }`}
              />
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-red-650 dark:text-red-400 font-medium">
                  ⚠ Vui lòng nhập mô tả chi tiết
                </p>
              )}
            </div>

            {/* Event Format Selector */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Hình thức sự kiện
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['ONSITE', 'ONLINE', 'HYBRID'] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setEventFormat(format)}
                    className={`py-3 px-3 rounded-xl border font-bold text-xs transition duration-300 flex items-center justify-center gap-1.5 ${
                      eventFormat === format
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 text-orange-650 dark:text-orange-400'
                        : 'border-gray-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-350 hover:bg-gray-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    {format === 'ONLINE' && <Globe className="w-4 h-4" />}
                    {format === 'ONSITE' && <Building2 className="w-4 h-4" />}
                    {format === 'HYBRID' && <MapPin className="w-4 h-4" />}
                    {format === 'ONLINE' ? 'Trực tuyến' : format === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Location Input (conditional) */}
            {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                    Tên địa điểm (tự do)
                  </label>
                  <input
                    type="text"
                    name="customVenueName"
                    value={formData.customVenueName}
                    onChange={handleChange}
                    placeholder="Ví dụ: Tòa nhà Alpha, Sân bóng..."
                    className="w-full px-4 py-3 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                    Vị trí chi tiết / Địa chỉ
                  </label>
                  <input
                    type="text"
                    name="customLocation"
                    value={formData.customLocation}
                    onChange={handleChange}
                    placeholder="Ví dụ: Phòng 102, Tầng trệt..."
                    className="w-full px-4 py-3 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-medium"
                  />
                </div>
              </div>
            )}

            {/* Date time preferred range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                  Bắt đầu dự kiến
                </label>
                <input
                  type="datetime-local"
                  name="preferredStart"
                  value={formData.preferredStart}
                  onChange={handleChange}
                  onInput={handleDateTimeInput}
                  max="9999-12-31T23:59"
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${
                    timeValidationErrors.length > 0
                      ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                      : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-350 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                  Kết thúc dự kiến
                </label>
                <input
                  type="datetime-local"
                  name="preferredEnd"
                  value={formData.preferredEnd}
                  onChange={handleChange}
                  onInput={handleDateTimeInput}
                  max="9999-12-31T23:59"
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${
                    timeValidationErrors.length > 0
                      ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                      : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-350 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                  }`}
                />
              </div>
            </div>

            {/* Time Validation Messages */}
            {timeValidationErrors.length > 0 && (
              <div className="p-4 bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-900/35 rounded-2xl">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-650 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-red-900 dark:text-red-400 text-xs mb-1">Thời gian không hợp lệ:</h4>
                    <ul className="space-y-0.5 list-disc pl-4 text-xs text-red-750 dark:text-red-300 font-medium">
                      {timeValidationErrors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Expected Participants */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">
                Sức chứa / Số người tham gia dự kiến
              </label>
              <input
                type="number"
                name="expectedParticipants"
                value={formData.expectedParticipants}
                onChange={handleChange}
                min="10"
                step="10"
                placeholder="Nhập số lượng (bội số của 10): 50, 100, 200..."
                className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 font-medium ${
                  validationError
                    ? 'border-red-500 focus:ring-red-500 focus:border-transparent bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-100'
                    : 'border-gray-200 dark:border-slate-800 focus:ring-orange-500 dark:focus:ring-orange-500/20 focus:border-transparent hover:border-orange-350 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                }`}
              />
              {validationError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">⚠ {validationError}</p>
              )}
            </div>

            {/* Error tổng khi submit fail */}
            {error && (
              <div className="p-4 bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-900/35 rounded-2xl flex gap-2">
                <AlertCircle className="w-5 h-5 text-red-650 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-900 dark:text-red-400 text-xs">Thất bại:</h4>
                  <p className="text-xs text-red-750 dark:text-red-300 whitespace-pre-line font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Submit & Cancel Buttons */}
            <div className="pt-6 border-t border-gray-100 dark:border-slate-800/85 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-3 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 transition font-bold text-sm"
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="inline-flex items-center px-8 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 text-white font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/35 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting || isUploading}
              >
                <Send className="w-4 h-4 mr-2" />
                {isSubmitting ? 'Đang gửi...' : flowType === 'UNIVERSITY' ? 'Gửi đề xuất' : 'Tạo sự kiện'}
              </button>
            </div>

          </div>

        </form>

      </div>

      {/* SAMPLE BANNERS GALLERY MODAL */}
      {isBannersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col transition-all duration-500">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-xl text-gray-900 dark:text-white">Thư viện ảnh bìa mẫu</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Chọn một hình ảnh thiết kế sẵn cho sự kiện của bạn</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBannersModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-500 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Categories filter tabs */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800/80 bg-gray-50/50 dark:bg-slate-950/20 flex gap-2 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/10'
                      : 'bg-white dark:bg-slate-850 text-gray-600 dark:text-slate-300 border border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'Tất cả' : cat}
                </button>
              ))}
            </div>

            {/* Gallery Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredBanners.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <ImageIcon className="w-16 h-16 text-gray-300 dark:text-slate-800 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-slate-400">Không có ảnh mẫu nào trong danh mục này.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredBanners.map((banner) => (
                    <div
                      key={banner.bannerId}
                      onClick={() => handleSelectSampleBanner(banner.url)}
                      className="group relative aspect-[16/9] rounded-xl overflow-hidden cursor-pointer border border-gray-200 dark:border-slate-800 hover:border-orange-500 dark:hover:border-orange-500 shadow-sm transition duration-300"
                    >
                      <img
                        src={banner.url}
                        alt={banner.title}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <span className="text-white text-xs font-bold truncate w-full">{banner.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}


