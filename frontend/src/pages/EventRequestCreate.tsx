import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, AlertCircle, Upload, Image as ImageIcon, Trash2, Globe, MapPin, Building2, X, LayoutGrid, ChevronLeft } from 'lucide-react'
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
    errors.push('Sự kiện phải kéo dài ít nhất 60 phút')
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

  const daysUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
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

  const [flowType, setFlowType] = useState<'UNIVERSITY' | 'INDEPENDENT' | null>(null)
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [timeValidationErrors, setTimeValidationErrors] = useState<string[]>([])

  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({
    title: false,
    description: false,
    expectedParticipants: false,
  })

  // Fetch sample banners and set a random one initially
  useEffect(() => {
    const fetchSampleBanners = async () => {
      try {
        const response = await fetch('/api/sample-banners')
        if (response.ok) {
          const data = await response.json()
          setSampleBanners(data || [])
          if (data && data.length > 0) {
            const randomIndex = Math.floor(Math.random() * data.length)
            setBannerUrl(data[randomIndex].url)
          }
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

    if (['title', 'description'].includes(name)) {
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
        setValidationError('Số lượng phải là bội số của 10')
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
    if (['title', 'description'].includes(name)) {
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
      setError('Số lượng người tham gia dự kiến phải là bội số của 10')
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
            ? 'Yêu cầu tổ chức sự kiện đã được gửi thành công'
            : 'Sự kiện tự do đã được tạo trực tiếp thành công'
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
    <div className="relative min-h-[calc(100vh-80px)] flex items-center justify-center py-4 px-4 overflow-hidden">
      
      {/* Dynamic blurred cinema background matching selected banner */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#09090b]">
        <div
          className="absolute -inset-[18%] blur-[100px] opacity-25 dark:opacity-40 saturate-[180%] scale-110 origin-center pointer-events-none select-none transition-all duration-1000"
          style={{
            backgroundImage: bannerUrl ? `url(${bannerUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/60 pointer-events-none" />
      </div>

      {!flowType ? (
        /* Step 1: Option selector UI with clean card design */
        <div className="relative z-10 w-full max-w-xl bg-slate-950/75 dark:bg-slate-900/65 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 flex flex-col items-center animate-fadeIn">
          <h1 className="text-2xl font-black text-white mb-2 tracking-tight text-center">
            Tạo sự kiện mới
          </h1>
          <p className="text-slate-400 text-xs mb-8 text-center font-medium">
            Chọn loại hình sự kiện để tiếp tục
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
            <button
              type="button"
              onClick={() => setFlowType('UNIVERSITY')}
              className="group cursor-pointer p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 shadow-xl transition-all duration-350 transform hover:-translate-y-1 text-center flex flex-col items-center justify-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 group-hover:scale-110 transition duration-300">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Sự Kiện Trường Học</h2>
                <p className="text-[10px] text-slate-400 leading-normal max-w-[150px] mx-auto">
                  Cần phê duyệt từ ban quản lý
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFlowType('INDEPENDENT')}
              className="group cursor-pointer p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 shadow-xl transition-all duration-350 transform hover:-translate-y-1 text-center flex flex-col items-center justify-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 group-hover:scale-110 transition duration-300">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Sự Kiện Tự Do</h2>
                <p className="text-[10px] text-slate-400 leading-normal max-w-[150px] mx-auto">
                  Tự chọn địa điểm, duyệt ngay
                </p>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard/event-requests')}
            className="text-[11px] text-slate-400 hover:text-white font-bold transition flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Quay lại danh sách
          </button>
        </div>
      ) : (
        /* Step 2: Compact Form Card designed to fit screen height without scrolling */
        <div className="relative z-10 w-full max-w-4xl bg-slate-950/75 dark:bg-slate-900/65 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-5 md:p-6 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
          
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
            <button
              type="button"
              onClick={() => { setFlowType(null); setError(null); }}
              className="text-[11px] text-slate-400 hover:text-white font-bold transition flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Thay đổi loại hình
            </button>
            <h1 className="text-sm font-black text-white uppercase tracking-wider">
              {flowType === 'UNIVERSITY' ? 'Đề xuất sự kiện trường' : 'Tạo sự kiện tự do'}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-6 overflow-y-auto pr-1">
            
            {/* Left Column: Image Area */}
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="border border-white/10 rounded-2xl p-2 bg-white/5 backdrop-blur-sm relative">
                
                {/* Image Preview Container */}
                <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-slate-900 border border-white/10 flex flex-col items-center justify-center group">
                  {bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt="Banner"
                      className="w-full h-full object-cover transition-transform duration-500"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <ImageIcon className="w-8 h-8 text-slate-500 mb-1 mx-auto" />
                      <p className="text-[10px] text-slate-400">Không có ảnh bìa</p>
                    </div>
                  )}

                  {/* Absolute positioning of image management menu button inside image box */}
                  <div className="absolute bottom-2 right-2">
                    <button
                      type="button"
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg hover:scale-105 transition active:scale-95 cursor-pointer"
                      title="Quản lý ảnh bìa"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    
                    {isMenuOpen && (
                      <div className="absolute bottom-10 right-0 bg-slate-950 border border-white/10 rounded-xl py-1 shadow-2xl w-36 backdrop-blur-md z-30">
                        <button
                          type="button"
                          onClick={() => { setIsBannersModalOpen(true); setIsMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white font-bold flex items-center gap-1.5"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" /> Chọn ảnh mẫu
                        </button>
                        <label className="w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white font-bold flex items-center gap-1.5 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" /> Tải ảnh lên
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => { handleBannerUpload(e); setIsMenuOpen(false); }}
                            className="hidden"
                          />
                        </label>
                        {bannerUrl && (
                          <button
                            type="button"
                            onClick={() => { handleRemoveBanner(); setIsMenuOpen(false); }}
                            className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10 font-bold flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xóa ảnh
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Fields */}
            <div className="md:col-span-7 flex flex-col gap-3">
              
              {/* Event Title */}
              <div>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  placeholder="Tên sự kiện..."
                  className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 transition font-medium ${
                    fieldErrors.title
                      ? 'border-red-500 bg-slate-950/40 text-white'
                      : 'border-white/10 bg-slate-950/40 text-white focus:ring-orange-500 focus:border-transparent'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  rows={2}
                  placeholder="Mô tả sự kiện chi tiết..."
                  className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 transition font-medium resize-none ${
                    fieldErrors.description
                      ? 'border-red-500 bg-slate-950/40 text-white'
                      : 'border-white/10 bg-slate-950/40 text-white focus:ring-orange-500 focus:border-transparent'
                  }`}
                />
              </div>

              {/* Format Select tabs */}
              <div className="grid grid-cols-3 gap-2">
                {(['ONSITE', 'ONLINE', 'HYBRID'] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setEventFormat(format)}
                    className={`py-1 px-2 rounded-lg border font-bold text-[10px] transition duration-200 flex items-center justify-center gap-1 ${
                      eventFormat === format
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-white/10 bg-slate-950/20 text-slate-400 hover:bg-slate-950/40'
                    }`}
                  >
                    {format === 'ONLINE' && <Globe className="w-3.5 h-3.5" />}
                    {format === 'ONSITE' && <Building2 className="w-3.5 h-3.5" />}
                    {format === 'HYBRID' && <MapPin className="w-3.5 h-3.5" />}
                    {format === 'ONLINE' ? 'Trực tuyến' : format === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                  </button>
                ))}
              </div>

              {/* Custom Venue inputs side-by-side */}
              {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                <div className="grid grid-cols-2 gap-2 animate-fadeIn">
                  <input
                    type="text"
                    name="customVenueName"
                    value={formData.customVenueName}
                    onChange={handleChange}
                    placeholder="Tên địa điểm..."
                    className="w-full px-3 py-1.5 text-xs border border-white/10 bg-slate-950/40 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                  <input
                    type="text"
                    name="customLocation"
                    value={formData.customLocation}
                    onChange={handleChange}
                    placeholder="Địa chỉ..."
                    className="w-full px-3 py-1.5 text-xs border border-white/10 bg-slate-950/40 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>
              )}

              {/* Datetime preferred range side-by-side */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-450 mb-1">
                    Bắt đầu
                  </label>
                  <input
                    type="datetime-local"
                    name="preferredStart"
                    value={formData.preferredStart}
                    onChange={handleChange}
                    onInput={handleDateTimeInput}
                    max="9999-12-31T23:59"
                    className="w-full px-3 py-1.5 text-xs border border-white/10 bg-slate-950/40 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-450 mb-1">
                    Kết thúc
                  </label>
                  <input
                    type="datetime-local"
                    name="preferredEnd"
                    value={formData.preferredEnd}
                    onChange={handleChange}
                    onInput={handleDateTimeInput}
                    max="9999-12-31T23:59"
                    className="w-full px-3 py-1.5 text-xs border border-white/10 bg-slate-950/40 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
                  />
                </div>
              </div>

              {/* Expected Participants */}
              <div>
                <input
                  type="number"
                  name="expectedParticipants"
                  value={formData.expectedParticipants}
                  onChange={handleChange}
                  min="10"
                  step="10"
                  placeholder="Sức chứa (bội số của 10)..."
                  className={`w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 transition font-medium ${
                    validationError
                      ? 'border-red-500 bg-slate-950/40 text-white'
                      : 'border-white/10 bg-slate-950/40 text-white focus:ring-orange-500 focus:border-transparent'
                  }`}
                />
                {validationError && (
                  <p className="mt-1 text-[10px] text-red-400 font-medium">{validationError}</p>
                )}
              </div>

              {/* Time Validation errors block */}
              {timeValidationErrors.length > 0 && (
                <div className="p-2 bg-red-950/20 border border-red-900/35 rounded-xl">
                  <div className="flex gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-400 text-[10px]">Thời gian không hợp lệ:</p>
                      <ul className="list-disc pl-3 text-[9px] text-red-300 font-medium leading-normal">
                        {timeValidationErrors.slice(0, 2).map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Generic Submit/API error */}
              {error && (
                <div className="p-2 bg-red-950/20 border border-red-900/35 rounded-xl flex gap-1.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-400 text-[10px]">Thất bại</p>
                    <p className="text-[9px] text-red-350 font-medium leading-normal">{error}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/5 flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-1.5 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5 bg-transparent transition font-bold text-[11px]"
                  disabled={isSubmitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center px-6 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition-all text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting || isUploading}
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  {isSubmitting ? 'Đang gửi...' : flowType === 'UNIVERSITY' ? 'Gửi đề xuất' : 'Tạo sự kiện'}
                </button>
              </div>

            </div>

          </form>

        </div>
      )}

      {/* SAMPLE BANNERS GALLERY MODAL */}
      {isBannersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[75vh] overflow-hidden shadow-2xl flex flex-col animate-fadeIn">
            
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-white">Thư viện ảnh bìa mẫu</h3>
                <p className="text-[10px] text-slate-400 font-medium">Chọn một hình ảnh thiết kế sẵn cho sự kiện</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBannersModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2 border-b border-white/15 bg-slate-950/40 flex gap-2 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-orange-600 text-white'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {cat === 'ALL' ? 'Tất cả' : cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {filteredBanners.length === 0 ? (
                <div className="text-center py-8 flex flex-col items-center">
                  <ImageIcon className="w-10 h-10 text-slate-700 mb-1" />
                  <p className="text-xs text-slate-400">Không có ảnh mẫu nào trong danh mục này</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredBanners.map((banner) => (
                    <div
                      key={banner.bannerId}
                      onClick={() => handleSelectSampleBanner(banner.url)}
                      className="group relative aspect-[16/10] rounded-xl overflow-hidden cursor-pointer border border-white/10 hover:border-orange-500 shadow-sm transition duration-300"
                    >
                      <img
                        src={banner.url}
                        alt={banner.title}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <span className="text-white text-[9px] font-bold truncate w-full">{banner.title}</span>
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


