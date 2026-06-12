import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Trash2,
  Globe,
  MapPin,
  Building2,
  X,
  LayoutGrid,
  ChevronLeft,
  Camera,
  Users,
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { uploadEventBanner, deleteEventBanner, validateImageFile } from '../utils/imageUpload'

/* ─────────────────────────────────────────────────────────────
   DateTime Validation helpers (unchanged)
───────────────────────────────────────────────────────────── */
function validateEventDateTime(
  startTimeStr: string,
  endTimeStr: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!startTimeStr || !endTimeStr) return { valid: true, errors: [] }

  const startTime = new Date(startTimeStr + ':00')
  const endTime = new Date(endTimeStr + ':00')

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    errors.push('Định dạng thời gian không hợp lệ')
    return { valid: false, errors }
  }

  const now = new Date()
  if (startTime <= now) errors.push('Thời gian bắt đầu không được trong quá khứ')
  if (endTime <= startTime) errors.push('Thời gian kết thúc phải sau thời gian bắt đầu')

  const startDate = startTime.toLocaleDateString('en-CA')
  const endDate = endTime.toLocaleDateString('en-CA')
  if (startDate !== endDate) errors.push('Sự kiện phải diễn ra trong cùng một ngày')

  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  if (durationMinutes < 60) errors.push('Sự kiện phải kéo dài ít nhất 60 phút')
  if (durationMinutes > 18 * 60) errors.push('Sự kiện không được kéo dài quá 18 giờ trong một ngày')

  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  if (hoursUntilStart < 24) errors.push(`Cần lên lịch trước ít nhất 24 giờ (còn ${Math.floor(hoursUntilStart)} giờ)`)

  const daysUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (daysUntilStart > 365) errors.push('Sự kiện không được lên lịch quá 365 ngày từ hiện tại')

  const startHour = startTime.getHours()
  const startMinute = startTime.getMinutes()
  if (startHour < 7 || startHour > 21 || (startHour === 21 && startMinute > 0))
    errors.push('Giờ bắt đầu phải từ 07:00 đến 21:00')

  const endHour = endTime.getHours()
  const endMinute = endTime.getMinutes()
  if (endHour > 21 || (endHour === 21 && endMinute > 0))
    errors.push('Sự kiện cần kết thúc trước 21:00')

  return { valid: errors.length === 0, errors }
}

/* ─────────────────────────────────────────────────────────────
   Format date-time for display (like Quickom: "Fri, 13 Jun · 23:00")
───────────────────────────────────────────────────────────── */
function formatDisplayDateTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso + ':00')
  if (isNaN(d.getTime())) return { date: iso, time: '' }
  const date = d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { date, time }
}

/* ─────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────── */
export default function EventRequestCreate() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [flowType, setFlowType] = useState<'UNIVERSITY' | 'INDEPENDENT' | null>(null)
  const [eventFormat, setEventFormat] = useState<'ONLINE' | 'ONSITE' | 'HYBRID'>('ONSITE')

  const [formData, setFormData] = useState({
    title: '',
    description: '',
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

  /* ── Fetch sample banners and pick a random one ── */
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

  /* ── Inject transparent-panel style override when form step is active ── */
  useEffect(() => {
    const styleId = 'event-create-cinema-override'
    if (flowType) {
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `
          html.event-create-canvas > body > div,
          html.event-create-canvas [class*="bg-gradient-to-br"],
          html.event-create-canvas main > div { background: transparent !important; }
        `
        document.head.appendChild(style)
      }
      document.documentElement.classList.add('event-create-canvas')
    } else {
      document.documentElement.classList.remove('event-create-canvas')
      document.getElementById(styleId)?.remove()
    }
    return () => {
      document.documentElement.classList.remove('event-create-canvas')
      document.getElementById(styleId)?.remove()
    }
  }, [flowType])

  /* ── Banner Handlers ── */
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validation = validateImageFile(file)
    if (!validation.valid) { showToast('error', validation.error || 'Ảnh không hợp lệ'); return }
    setIsUploading(true)
    setError(null)
    try {
      if (bannerUrl && bannerUrl.includes('/uploads/')) await deleteEventBanner(bannerUrl)
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
    if (bannerUrl && bannerUrl.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    setBannerUrl(url)
    setIsBannersModalOpen(false)
  }

  const handleRemoveBanner = async () => {
    if (bannerUrl && bannerUrl.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    setBannerUrl('')
  }

  const handleCancel = async () => {
    if (bannerUrl && bannerUrl.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    navigate('/dashboard/event-requests')
  }

  /* ── Form field handlers ── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    if (['title', 'description'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: value.trim() === '' }))
    }

    if (name === 'preferredStart' || name === 'preferredEnd') {
      const newFormData = { ...formData, [name]: value }
      const validation = validateEventDateTime(newFormData.preferredStart, newFormData.preferredEnd)
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

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (['title', 'description'].includes(name)) {
      setFieldErrors((prev) => ({ ...prev, [name]: value.trim() === '' }))
    }
  }

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const participants = parseInt(formData.expectedParticipants)
    if (formData.expectedParticipants && (isNaN(participants) || participants < 10 || participants % 10 !== 0)) {
      setError('Số lượng người tham gia dự kiến phải là bội số của 10')
      return
    }

    const timeValidation = validateEventDateTime(formData.preferredStart, formData.preferredEnd)
    if (!timeValidation.valid && timeValidation.errors.length > 0) {
      setError(timeValidation.errors.join('\n'))
      return
    }

    setIsSubmitting(true)
    try {
      const formatDateTimeLocal = (dateTimeStr: string) => (!dateTimeStr ? null : dateTimeStr + ':00')

      const requestBody = {
        title: formData.title,
        description: formData.description || null,
        preferredStartTime: formData.preferredStart ? formatDateTimeLocal(formData.preferredStart) : null,
        preferredEndTime: formData.preferredEnd ? formatDateTimeLocal(formData.preferredEnd) : null,
        expectedCapacity: parseInt(formData.expectedParticipants) || 0,
        eventFormat,
        customVenueName: (eventFormat === 'ONSITE' || eventFormat === 'HYBRID') ? (formData.customVenueName || null) : null,
        customLocation: (eventFormat === 'ONSITE' || eventFormat === 'HYBRID') ? (formData.customLocation || null) : null,
        bannerUrl: bannerUrl || null,
      }

      const url = flowType === 'UNIVERSITY' ? '/api/event-requests' : '/api/events/independent'
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        showToast(
          'success',
          flowType === 'UNIVERSITY'
            ? 'Yêu cầu tổ chức sự kiện đã được gửi thành công'
            : 'Sự kiện tự do đã được tạo trực tiếp thành công',
        )
        navigate('/dashboard/event-requests')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.error || 'Thao tác thất bại')
      }
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  const categories = ['ALL', ...Array.from(new Set(sampleBanners.map((b) => b.category).filter(Boolean)))]
  const filteredBanners = selectedCategory === 'ALL' ? sampleBanners : sampleBanners.filter((b) => b.category === selectedCategory)

  /* ─────────────────────────────────────────────────────────────
     Date/time display helpers
  ───────────────────────────────────────────────────────────── */
  const startDisplay = formData.preferredStart ? formatDisplayDateTime(formData.preferredStart) : null
  const endDisplay = formData.preferredEnd ? formatDisplayDateTime(formData.preferredEnd) : null

  /* ─────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="relative min-h-[calc(100vh-80px)] flex items-center justify-center py-4 px-4 overflow-hidden">

      {/* ── Cinema backdrop: ONLY when flowType is selected ── */}
      {flowType && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#09090b]">
          <div
            className="absolute -inset-[18%] blur-[80px] opacity-90 saturate-[220%] scale-110 origin-center pointer-events-none select-none transition-all duration-1000"
            style={{
              backgroundImage: bannerUrl ? `url(${bannerUrl})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/70 pointer-events-none" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 1 — Option Selector (theme-aware, no backdrop)
      ══════════════════════════════════════════════════════ */}
      {!flowType ? (
        <div className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-8 flex flex-col items-center animate-fadeIn text-slate-900 dark:text-white">
          <h1 className="text-2xl font-black mb-1.5 tracking-tight text-center">Tạo sự kiện mới</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-8 text-center font-medium">
            Chọn loại hình sự kiện để tiếp tục
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
            {/* University Event */}
            <button
              type="button"
              onClick={() => setFlowType('UNIVERSITY')}
              className="group cursor-pointer p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:bg-orange-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-orange-400 dark:hover:border-orange-500/60 shadow-sm transition-all duration-300 transform hover:-translate-y-1 text-center flex flex-col items-center justify-center gap-3 w-full"
            >
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 transition duration-300 shadow-sm">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-black mb-1 text-slate-800 dark:text-white">Sự Kiện Trường Học</h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal max-w-[140px] mx-auto font-medium">
                  Cần phê duyệt từ ban quản lý
                </p>
              </div>
            </button>

            {/* Independent Event */}
            <button
              type="button"
              onClick={() => setFlowType('INDEPENDENT')}
              className="group cursor-pointer p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:bg-orange-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-orange-400 dark:hover:border-orange-500/60 shadow-sm transition-all duration-300 transform hover:-translate-y-1 text-center flex flex-col items-center justify-center gap-3 w-full"
            >
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 transition duration-300 shadow-sm">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-black mb-1 text-slate-800 dark:text-white">Sự Kiện Tự Do</h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal max-w-[140px] mx-auto font-medium">
                  Tự chọn địa điểm, duyệt ngay
                </p>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard/event-requests')}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 font-bold transition flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Quay lại danh sách
          </button>
        </div>

      ) : (
        /* ══════════════════════════════════════════════════════
            STEP 2 — Quickom-style Compact Form (cinema backdrop)
        ══════════════════════════════════════════════════════ */
        <div className="relative z-10 w-full max-w-[880px] animate-fadeIn">

          {/* Top bar: back link + badge */}
          <div className="flex justify-between items-center mb-4 px-1">
            <button
              type="button"
              onClick={() => { setFlowType(null); setError(null) }}
              className="text-[11px] text-white/60 hover:text-white font-bold transition flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Thay đổi loại hình
            </button>
            <span className="text-[10px] font-extrabold uppercase tracking-widest bg-white/10 text-white px-2.5 py-1 rounded-lg border border-white/10">
              {flowType === 'UNIVERSITY' ? 'Sự Kiện Trường Học' : 'Sự Kiện Tự Do'}
            </span>
          </div>

          {/* Main card */}
          <div
            className="bg-neutral-950/70 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            style={{ minHeight: 480, maxHeight: 'calc(100vh - 140px)' }}
          >
            <form
              onSubmit={handleSubmit}
              className="flex flex-col md:flex-row h-full"
              style={{ minHeight: 'inherit', maxHeight: 'inherit' }}
            >

              {/* ── LEFT: Square Banner Image ── */}
              <div className="md:w-[320px] flex-shrink-0 relative" style={{ minWidth: 240 }}>
                <div className="relative w-full h-full" style={{ minHeight: 280 }}>

                  {/* Banner image */}
                  {bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt="Banner"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center gap-2">
                      <ImageIcon className="w-10 h-10 text-neutral-600" />
                      <p className="text-[11px] text-neutral-500 font-medium">Chưa có ảnh bìa</p>
                    </div>
                  )}

                  {/* Gradient overlay at bottom to fade into card */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none md:hidden" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/30 pointer-events-none hidden md:block" />

                  {/* Uploading overlay */}
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" />
                    </div>
                  )}

                  {/* Camera button bottom-right */}
                  <div className="absolute bottom-4 right-4 z-10">
                    <button
                      type="button"
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="w-10 h-10 rounded-full bg-white text-neutral-900 flex items-center justify-center shadow-xl hover:scale-105 transition active:scale-95 cursor-pointer"
                      title="Quản lý ảnh bìa"
                    >
                      <Camera className="w-4 h-4" />
                    </button>

                    {/* Popover menu */}
                    {isMenuOpen && (
                      <div className="absolute bottom-12 right-0 bg-neutral-950 border border-white/10 rounded-2xl py-1.5 shadow-2xl w-40 backdrop-blur-md z-30">
                        <button
                          type="button"
                          onClick={() => { setIsBannersModalOpen(true); setIsMenuOpen(false) }}
                          className="w-full text-left px-4 py-2 text-[11px] text-neutral-300 hover:bg-white/10 hover:text-white font-bold flex items-center gap-2 transition"
                        >
                          <LayoutGrid className="w-3.5 h-3.5 text-orange-400" /> Chọn ảnh mẫu
                        </button>
                        <label className="w-full text-left px-4 py-2 text-[11px] text-neutral-300 hover:bg-white/10 hover:text-white font-bold flex items-center gap-2 cursor-pointer transition">
                          <Upload className="w-3.5 h-3.5 text-orange-400" /> Tải ảnh lên
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => { handleBannerUpload(e); setIsMenuOpen(false) }}
                            className="hidden"
                          />
                        </label>
                        {bannerUrl && (
                          <button
                            type="button"
                            onClick={() => { handleRemoveBanner(); setIsMenuOpen(false) }}
                            className="w-full text-left px-4 py-2 text-[11px] text-red-400 hover:bg-red-500/10 font-bold flex items-center gap-2 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xóa ảnh
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* ── RIGHT: Fields column ── */}
              <div
                className="flex-1 flex flex-col overflow-y-auto p-5 md:p-6 gap-0"
                style={{ maxHeight: 'calc(100vh - 180px)' }}
              >

                {/* ── Event Name — borderless large input like Quickom ── */}
                <div className="mb-4">
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    required
                    placeholder="Tên sự kiện..."
                    className={`w-full bg-transparent border-0 border-b pb-2 text-xl font-black text-white placeholder-white/25 focus:outline-none focus:border-orange-500 transition-colors ${
                      fieldErrors.title ? 'border-red-500' : 'border-white/10'
                    }`}
                  />
                </div>

                {/* ── Date / Time — Quickom vertical-dot timeline ── */}
                <div className="mb-3 bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                  {/* Start row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col items-center gap-0.5 w-4 flex-shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">Bắt đầu</p>
                      {startDisplay ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-black text-white">{startDisplay.date}</span>
                          <span className="text-base font-black text-orange-400">{startDisplay.time}</span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          name="preferredStart"
                          value={formData.preferredStart}
                          onChange={handleChange}
                          max="9999-12-31T23:59"
                          className="w-full bg-transparent border-0 text-white/70 text-sm font-semibold focus:ring-0 outline-none p-0"
                        />
                      )}
                    </div>
                    {startDisplay && (
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, preferredStart: '' }))}
                        className="text-white/30 hover:text-white/60 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!startDisplay && (
                      <span className="text-[10px] text-white/30 font-medium">Chọn ngày & giờ</span>
                    )}
                  </div>

                  {/* Connector line */}
                  <div className="flex items-start gap-3 px-4">
                    <div className="flex flex-col items-center w-4 flex-shrink-0">
                      <div className="w-px h-5 bg-white/10" />
                    </div>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  {/* End row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col items-center gap-0.5 w-4 flex-shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-white/30 bg-transparent flex-shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">Kết thúc</p>
                      {endDisplay ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-black text-white">{endDisplay.date}</span>
                          <span className="text-base font-black text-white/60">{endDisplay.time}</span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          name="preferredEnd"
                          value={formData.preferredEnd}
                          onChange={handleChange}
                          max="9999-12-31T23:59"
                          className="w-full bg-transparent border-0 text-white/70 text-sm font-semibold focus:ring-0 outline-none p-0"
                        />
                      )}
                    </div>
                    {endDisplay && (
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, preferredEnd: '' }))}
                        className="text-white/30 hover:text-white/60 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!endDisplay && (
                      <span className="text-[10px] text-white/30 font-medium">Chọn ngày & giờ</span>
                    )}
                  </div>
                </div>

                {/* ── Event Format segmented tabs ── */}
                <div className="mb-3 bg-white/5 border border-white/8 rounded-2xl p-3">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">Hình thức sự kiện</p>
                  <div className="grid grid-cols-3 bg-black/30 rounded-xl p-0.5 border border-white/5">
                    {(['ONLINE', 'ONSITE', 'HYBRID'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setEventFormat(fmt)}
                        className={`py-2 text-center rounded-lg font-black text-[11px] transition duration-200 ${
                          eventFormat === fmt
                            ? 'bg-orange-600 text-white shadow-sm shadow-orange-900/50'
                            : 'text-white/40 hover:text-white/80'
                        }`}
                      >
                        {fmt === 'ONLINE' ? 'Trực tuyến' : fmt === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Location (conditional) ── */}
                {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                  <div className="mb-3 bg-white/5 border border-white/8 rounded-2xl p-3 animate-fadeIn">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Địa điểm tổ chức</span>
                    </div>
                    <input
                      type="text"
                      name="customVenueName"
                      value={formData.customVenueName}
                      onChange={handleChange}
                      placeholder="Tên địa điểm..."
                      className="w-full bg-transparent border-0 border-b border-white/10 text-white text-sm font-semibold placeholder-white/25 focus:outline-none focus:border-orange-500 transition-colors pb-1.5 mb-2"
                    />
                    <input
                      type="text"
                      name="customLocation"
                      value={formData.customLocation}
                      onChange={handleChange}
                      placeholder="Địa chỉ chi tiết..."
                      className="w-full bg-transparent border-0 text-white/70 text-xs font-medium placeholder-white/20 focus:outline-none p-0"
                    />
                  </div>
                )}

                {/* ── Expected Capacity row ── */}
                <div className="mb-3 bg-white/5 border border-white/8 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-xs font-bold text-white/70">Sức chứa tối đa</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      name="expectedParticipants"
                      value={formData.expectedParticipants}
                      onChange={handleChange}
                      min="10"
                      step="10"
                      placeholder="100"
                      className={`w-20 text-right bg-transparent border-b text-white text-sm font-black focus:outline-none focus:border-orange-500 transition-colors p-0 pb-0.5 ${
                        fieldErrors.expectedParticipants ? 'border-red-500' : 'border-white/10'
                      }`}
                    />
                    <span className="text-[10px] text-white/30 font-medium">người</span>
                  </div>
                </div>

                {/* ── Description ── */}
                <div className="mb-3 bg-white/5 border border-white/8 rounded-2xl p-3">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Mô tả sự kiện</p>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    required
                    rows={2}
                    placeholder="Nêu nội dung chính, diễn giả, hoạt động đặc sắc..."
                    className={`w-full bg-transparent border-0 text-white text-xs font-medium placeholder-white/20 focus:ring-0 outline-none resize-none leading-relaxed ${
                      fieldErrors.description ? 'text-red-400' : ''
                    }`}
                  />
                </div>

                {/* ── Time Validation errors ── */}
                {timeValidationErrors.length > 0 && (
                  <div className="mb-3 p-2.5 bg-red-950/30 border border-red-900/40 rounded-xl">
                    <div className="flex gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-400 text-[10px]">Thời gian không hợp lệ:</p>
                        <ul className="list-disc pl-3 text-[9px] text-red-300 font-medium leading-relaxed">
                          {timeValidationErrors.slice(0, 2).map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Generic submit error ── */}
                {(error || validationError) && (
                  <div className="mb-3 p-2.5 bg-red-950/30 border border-red-900/40 rounded-xl flex gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-400 text-[10px]">Lỗi</p>
                      <p className="text-[9px] text-red-300 font-medium leading-relaxed">{error || validationError}</p>
                    </div>
                  </div>
                )}

                {/* ── Action buttons — pushed to bottom ── */}
                <div className="mt-auto pt-3 border-t border-white/5 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-1.5 border border-white/10 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition font-bold text-[11px]"
                    disabled={isSubmitting}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black transition-all text-[12px] shadow-lg shadow-orange-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting || isUploading}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSubmitting
                      ? 'Đang gửi...'
                      : flowType === 'UNIVERSITY'
                      ? 'Gửi đề xuất'
                      : 'Tạo sự kiện'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SAMPLE BANNERS GALLERY MODAL
      ══════════════════════════════════════════════════════ */}
      {isBannersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[78vh] overflow-hidden shadow-2xl flex flex-col animate-fadeIn">

            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-white">Thư viện ảnh bìa mẫu</h3>
                <p className="text-[10px] text-neutral-400 font-medium">Chọn một hình ảnh thiết kế sẵn</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBannersModalOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2 border-b border-white/10 bg-black/20 flex gap-2 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-orange-600 text-white'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {cat === 'ALL' ? 'Tất cả' : cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {filteredBanners.length === 0 ? (
                <div className="text-center py-10 flex flex-col items-center">
                  <ImageIcon className="w-10 h-10 text-neutral-700 mb-2" />
                  <p className="text-xs text-neutral-400 font-medium">Không có ảnh trong danh mục này</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredBanners.map((banner) => (
                    <div
                      key={banner.bannerId}
                      onClick={() => handleSelectSampleBanner(banner.url)}
                      className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer border border-white/10 hover:border-orange-500 shadow-sm transition duration-300"
                    >
                      <img
                        src={banner.url}
                        alt={banner.title}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <span className="text-white text-[9px] font-black truncate w-full">{banner.title}</span>
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
