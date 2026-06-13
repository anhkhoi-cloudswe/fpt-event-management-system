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
  AlignLeft,
  RefreshCw,
  Lock,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { uploadEventBanner, deleteEventBanner, validateImageFile } from '../utils/imageUpload'

/* ─────────────────────────────────────────────────────────────
   DateTime format helpers
───────────────────────────────────────────────────────────── */
function padZ(n: number) { return String(n).padStart(2, '0') }
function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${padZ(d.getMonth()+1)}-${padZ(d.getDate())}T${padZ(d.getHours())}:${padZ(d.getMinutes())}`
}

/* ─────────────────────────────────────────────────────────────
   Validation — flow-type-aware
   UNIVERSITY : same-day, 07:00–21:00, min 60 min, max 18 h, 24 h lead
   INDEPENDENT: flexible hours, max 30-day span, min 60 min
───────────────────────────────────────────────────────────── */
function validateEventDateTime(
  startStr: string,
  endStr: string,
  flowType: 'UNIVERSITY' | 'INDEPENDENT' | null,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!startStr || !endStr) return { valid: true, errors: [] }

  const start = new Date(startStr + ':00')
  const end   = new Date(endStr   + ':00')
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    errors.push('Định dạng thời gian không hợp lệ')
    return { valid: false, errors }
  }

  const now  = new Date()
  const mins = (end.getTime() - start.getTime()) / 60000

  if (start <= now) errors.push('Thời gian bắt đầu không được trong quá khứ')
  if (end   <= start) errors.push('Thời gian kết thúc phải sau thời gian bắt đầu')
  if (mins  <  30)   errors.push('Sự kiện phải kéo dài ít nhất 30 phút')

  if (flowType === 'UNIVERSITY') {
    const sd = start.toLocaleDateString('en-CA')
    const ed = end.toLocaleDateString('en-CA')
    if (sd !== ed) errors.push('Sự kiện trường học phải diễn ra trong cùng một ngày')

    const sh = start.getHours(), sm = start.getMinutes()
    if (sh < 7 || sh > 21 || (sh === 21 && sm > 0))
      errors.push('Giờ bắt đầu: 07:00 – 21:00')

    const eh = end.getHours(), em = end.getMinutes()
    if (eh > 21 || (eh === 21 && em > 0))
      errors.push('Cần kết thúc trước 21:00')

    if (mins > 18 * 60) errors.push('Sự kiện không được kéo dài quá 18 giờ')

    const hoursAway = (start.getTime() - now.getTime()) / 3600000
    if (hoursAway < 24) errors.push('Cần lên lịch trước ít nhất 24 giờ')
    if (hoursAway > 365 * 24) errors.push('Không được lên lịch quá 365 ngày')

  } else if (flowType === 'INDEPENDENT') {
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (days > 30) errors.push('Sự kiện tự do không được kéo dài quá 30 ngày liên tiếp')
  }

  return { valid: errors.length === 0, errors }
}

/* ─────────────────────────────────────────────────────────────
   Cinema full-page CSS — transparent shell so backdrop bleeds
   through header + sidebar regardless of Layout theme mode.
───────────────────────────────────────────────────────────── */
const ERC_STYLE_ID = 'erc-cinema-fullpage-style'
const ERC_CSS = `
  html.erc-cinema body { background: #0c0c0d !important; }

  html.erc-cinema body > div > div[class*="min-h-screen"],
  html.erc-cinema body > div[class*="min-h-screen"],
  html.erc-cinema body > div > div > div[class*="min-h-screen"] {
    background: transparent !important;
  }

  html.erc-cinema header {
    background: rgba(12,12,13,0.75) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-bottom-color: rgba(255,255,255,0.055) !important;
    box-shadow: none !important;
  }
  
  /* Force dark-mode texts on header items */
  html.erc-cinema header [class*="text-slate-"],
  html.erc-cinema header [class*="text-neutral-"] {
    color: rgba(255,255,255,0.60) !important;
  }
  html.erc-cinema header p,
  html.erc-cinema header span:not([class*="bg-"]):not([class*="from-"]),
  html.erc-cinema header h4,
  html.erc-cinema header svg {
    color: rgba(255,255,255,0.90) !important;
  }
  
  /* Style wallet balance specifically to avoid white-on-white text */
  html.erc-cinema header div.bg-gradient-to-r,
  html.erc-cinema header div.bg-slate-800,
  html.erc-cinema header div[class*="bg-gradient-to-r"],
  html.erc-cinema header div[class*="bg-slate-800"] {
    background: rgba(255,255,255,0.06) !important;
    background-image: none !important;
    border-color: rgba(255,255,255,0.12) !important;
  }
  html.erc-cinema header div.bg-gradient-to-r *,
  html.erc-cinema header div.bg-slate-800 *,
  html.erc-cinema header div[class*="bg-gradient-to-r"] *,
  html.erc-cinema header div[class*="bg-slate-800"] * {
    color: #fb923c !important;
  }
  
  /* Style profile details popover trigger to clear light mode styling */
  html.erc-cinema header div[class*="hover:bg-orange-55"],
  html.erc-cinema header div[class*="hover:bg-orange-50"] {
    color: rgba(255,255,255,0.90) !important;
  }
  html.erc-cinema header div[class*="hover:bg-orange-55"]:hover,
  html.erc-cinema header div[class*="hover:bg-orange-50"]:hover {
    background-color: rgba(255,255,255,0.07) !important;
  }

  html.erc-cinema header button:not([class*="bg-gradient"]):not([class*="from-orange"]),
  html.erc-cinema header select {
    background-color: rgba(255,255,255,0.09) !important;
    border-color: rgba(255,255,255,0.13) !important;
    color: rgba(255,255,255,0.92) !important;
  }
  html.erc-cinema header button:not([class*="bg-gradient"]):not([class*="from-orange"]):hover {
    background-color: rgba(255,255,255,0.15) !important;
  }
  html.erc-cinema header button[class*="from-orange"],
  html.erc-cinema header button[class*="bg-gradient"] {
    background: linear-gradient(to bottom right,#ea580c,#f97316) !important;
  }
  html.erc-cinema header [class*="text-orange"],
  html.erc-cinema header [class*="text-fpt"] { color: rgba(255,165,40,0.95) !important; }

  html.erc-cinema aside {
    background: rgba(12,12,13,0.62) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-right-color: rgba(255,255,255,0.055) !important;
    box-shadow: none !important;
  }
  html.erc-cinema aside,
  html.erc-cinema aside * { color: rgba(255,255,255,0.60) !important; }
  html.erc-cinema aside a,
  html.erc-cinema aside button { background: transparent !important; border-color: transparent !important; }
  html.erc-cinema aside a:hover,
  html.erc-cinema aside button:hover { background: rgba(255,255,255,0.07) !important; }
  html.erc-cinema aside a:hover *,
  html.erc-cinema aside button:hover * { color: rgba(255,255,255,0.90) !important; }
  html.erc-cinema aside a[class*="bg-orange"],
  html.erc-cinema aside a[class*="bg-gradient"] {
    background: rgba(234,88,12,0.20) !important;
    border-color: rgba(234,88,12,0.26) !important;
  }
  html.erc-cinema aside a[class*="bg-orange"] *,
  html.erc-cinema aside a[class*="bg-gradient"] * { color: rgba(251,146,60,0.95) !important; }

  html.erc-cinema main { overflow: hidden !important; }
  html.erc-cinema main > div {
    background: transparent !important;
    padding: 0 !important;
    max-width: 100% !important;
    height: 100% !important;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px !important;
    height: 6px !important;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.02) !important;
    border-radius: 10px !important;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.15) !important;
    border-radius: 10px !important;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.30) !important;
  }
`

/* ─────────────────────────────────────────────────────────────
   DateTime Formatter helper
───────────────────────────────────────────────────────────── */
function formatDateVietnamese(dateStr: string) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const y = parts[0]
  const m = parseInt(parts[1])
  const d = parseInt(parts[2])
  
  const dateObj = new Date(parseInt(y), m - 1, d)
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  const dayName = days[dateObj.getDay()]
  return `${dayName}, ${d} thg ${m}`
}

/* ─────────────────────────────────────────────────────────────
   Custom Date / Time Pickers
───────────────────────────────────────────────────────────── */
interface CalendarPopoverProps {
  value: string
  onChange: (date: string) => void
  onClose: () => void
  minDate?: string
}

function CalendarPopover({ value, onChange, onClose, minDate }: CalendarPopoverProps) {
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const parts = value.split('-')
      if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1)
      }
    }
    return new Date()
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ]

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1))
  }
  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1))
  }

  const totalDays = new Date(year, month + 1, 0).getDate()
  const startDay = new Date(year, month, 1).getDay()
  const prevMonthTotalDays = new Date(year, month, 0).getDate()

  const daysGrid: { day: number; isCurrentMonth: boolean; dateStr: string }[] = []

  // Prev month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevMonthTotalDays - i
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    daysGrid.push({
      day: d,
      isCurrentMonth: false,
      dateStr: `${prevYear}-${padZ(prevMonth + 1)}-${padZ(d)}`
    })
  }

  // Current month
  for (let d = 1; d <= totalDays; d++) {
    daysGrid.push({
      day: d,
      isCurrentMonth: true,
      dateStr: `${year}-${padZ(month + 1)}-${padZ(d)}`
    })
  }

  // Next month padding
  const remaining = 42 - daysGrid.length
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    daysGrid.push({
      day: d,
      isCurrentMonth: false,
      dateStr: `${nextYear}-${padZ(nextMonth + 1)}-${padZ(d)}`
    })
  }

  const todayStr = toLocalISO(new Date()).split('T')[0]

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 md:left-0 z-50 mt-2 bg-[#18181b] border border-white/[0.08] rounded-2xl p-5 shadow-2xl w-[320px] select-none animate-fadeIn">
        {/* Header matching Luma style */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-sm font-black text-white">
            {monthNames[month]}, {year}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-white/70 hover:text-white transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-white/70 hover:text-white transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 gap-1 text-center mb-3">
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((wd, idx) => (
            <span key={wd} className={`text-[10px] font-bold tracking-wider ${idx === 0 ? 'text-red-400' : 'text-neutral-500'}`}>
              {wd}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {daysGrid.map(({ day, isCurrentMonth, dateStr }, index) => {
            const isSelected = value === dateStr
            const isToday = todayStr === dateStr
            const isBeforeMin = minDate ? dateStr < minDate : false
            return (
              <button
                key={index}
                type="button"
                disabled={isBeforeMin}
                onClick={() => {
                  onChange(dateStr)
                  onClose()
                }}
                className={`w-9 h-9 text-xs font-bold rounded-full flex items-center justify-center transition cursor-pointer ${
                  isSelected
                    ? 'bg-[#fb923c] text-white shadow-lg shadow-orange-500/20'
                    : isToday
                    ? 'bg-white/[0.08] text-[#fb923c] border border-[#fb923c]/30'
                    : isCurrentMonth
                    ? 'text-white hover:bg-white/[0.08]'
                    : 'text-neutral-600 opacity-40 hover:bg-white/[0.02]'
                } ${isBeforeMin ? 'opacity-20 cursor-not-allowed hover:bg-transparent text-neutral-650' : ''}`}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

interface TimePopoverProps {
  value: string
  onChange: (time: string) => void
  onClose: () => void
}

function TimePopover({ value, onChange, onClose }: TimePopoverProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const timeSlots: string[] = []
  for (let h = 0; h < 24; h++) {
    const hs = padZ(h)
    timeSlots.push(`${hs}:00`)
    timeSlots.push(`${hs}:30`)
  }

  useEffect(() => {
    if (listRef.current && value) {
      const selectedEl = listRef.current.querySelector('[data-selected="true"]')
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'center' })
      }
    }
  }, [value])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={listRef}
        className="absolute right-0 z-50 mt-2 bg-[#18181b] border border-white/[0.08] rounded-2xl shadow-2xl w-[130px] max-h-60 overflow-y-auto py-1.5 custom-scrollbar animate-fadeIn"
      >
        {timeSlots.map(t => {
          const isSelected = value === t
          return (
            <button
              key={t}
              type="button"
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => {
                onChange(t)
                onClose()
              }}
              className={`w-full text-center py-2.5 text-xs font-bold transition cursor-pointer ${
                isSelected
                  ? 'bg-[#fb923c] text-white font-black'
                  : 'text-white/85 hover:bg-white/[0.08]'
              }`}
            >
              {t}
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
export default function EventRequestCreate() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [flowType, setFlowType] = useState<'UNIVERSITY' | 'INDEPENDENT' | null>(null)
  const [eventFormat, setEventFormat] = useState<'ONLINE' | 'ONSITE' | 'HYBRID'>('ONSITE')
  const [isPublic, setIsPublic] = useState(true)
  const [descOpen, setDescOpen] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    preferredStart: '',
    preferredEnd: '',
    expectedParticipants: '',
    customVenueName: '',
    customLocation: '',
  })

  // Date and Time split fields for easy picker configuration
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')

  // Date/Time custom popover visibility
  const [showStartCalendar, setShowStartCalendar] = useState(false)
  const [showStartTimeList, setShowStartTimeList] = useState(false)
  const [showEndCalendar, setShowEndCalendar] = useState(false)
  const [showEndTimeList, setShowEndTimeList] = useState(false)

  const [bannerUrl, setBannerUrl] = useState('')
  const [sampleBanners, setSampleBanners] = useState<any[]>([])
  
  // Unified cover modal states
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const modalFileInputRef = useRef<HTMLInputElement>(null)
  
  // Public/Private dropdown state
  const [showPublicDropdown, setShowPublicDropdown] = useState(false)

  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeErrors, setTimeErrors] = useState<string[]>([])

  /* ── Auto-init suggestions based on flowType ── */
  useEffect(() => {
    if (!flowType) return
    const now = new Date()
    // For UNIVERSITY, suggest now + 24.5 hours to clear the 24h lead validation safety margin.
    // For INDEPENDENT, suggest now + 30 minutes.
    const startOffset = flowType === 'UNIVERSITY' ? (24 * 60 + 30) * 60000 : 30 * 60000
    const start = new Date(now.getTime() + startOffset)
    const end = new Date(start.getTime() + 60 * 60000) // start + 1 hour
    
    const sy = start.getFullYear()
    const sm = padZ(start.getMonth() + 1)
    const sd = padZ(start.getDate())
    const sh = padZ(start.getHours())
    const smin = padZ(start.getMinutes())
    
    const ey = end.getFullYear()
    const em = padZ(end.getMonth() + 1)
    const ed = padZ(end.getDate())
    const eh = padZ(end.getHours())
    const emin = padZ(end.getMinutes())
    
    setStartDate(`${sy}-${sm}-${sd}`)
    setStartTime(`${sh}:${smin}`)
    setEndDate(`${ey}-${em}-${ed}`)
    setEndTime(`${eh}:${emin}`)
  }, [flowType])

  /* ── Sync and advance end date/time suggestions when start values change ── */
  const handleStartDateChange = (newDate: string) => {
    setStartDate(newDate)
    if (newDate && startTime) {
      const startObj = new Date(`${newDate}T${startTime}`)
      if (!isNaN(startObj.getTime())) {
        const endObj = new Date(startObj.getTime() + 60 * 60 * 1000) // start + 1 hour
        const ey = endObj.getFullYear()
        const em = padZ(endObj.getMonth() + 1)
        const ed = padZ(endObj.getDate())
        const eh = padZ(endObj.getHours())
        const emin = padZ(endObj.getMinutes())
        setEndDate(`${ey}-${em}-${ed}`)
        setEndTime(`${eh}:${emin}`)
      }
    }
  }

  const handleStartTimeChange = (newTime: string) => {
    setStartTime(newTime)
    if (startDate && newTime) {
      const startObj = new Date(`${startDate}T${newTime}`)
      if (!isNaN(startObj.getTime())) {
        const endObj = new Date(startObj.getTime() + 60 * 60 * 1000) // start + 1 hour
        const ey = endObj.getFullYear()
        const em = padZ(endObj.getMonth() + 1)
        const ed = padZ(endObj.getDate())
        const eh = padZ(endObj.getHours())
        const emin = padZ(endObj.getMinutes())
        setEndDate(`${ey}-${em}-${ed}`)
        setEndTime(`${eh}:${emin}`)
      }
    }
  }

  /* ── Sync split date/time fields to formData ── */
  useEffect(() => {
    const startStr = startDate && startTime ? `${startDate}T${startTime}` : ''
    const endStr = endDate && endTime ? `${endDate}T${endTime}` : ''
    setFormData(p => ({
      ...p,
      preferredStart: startStr,
      preferredEnd: endStr
    }))
    setTimeErrors(validateEventDateTime(startStr, endStr, flowType).errors)
  }, [startDate, startTime, endDate, endTime, flowType])

  /* ── Sample banners ── */
  useEffect(() => {
    fetch('/api/sample-banners')
      .then(r => (r.ok ? r.json() : null))
      .then((data: any[] | null) => {
        if (data?.length) {
          setSampleBanners(data)
          setBannerUrl(data[Math.floor(Math.random() * data.length)].url)
        }
      })
      .catch(() => {})
  }, [])

  /* ── Cinema mode ── */
  useEffect(() => {
    if (flowType) {
      if (!document.getElementById(ERC_STYLE_ID)) {
        const s = document.createElement('style')
        s.id = ERC_STYLE_ID
        s.textContent = ERC_CSS
        document.head.appendChild(s)
      }
      document.documentElement.classList.add('erc-cinema')
    } else {
      document.documentElement.classList.remove('erc-cinema')
      document.getElementById(ERC_STYLE_ID)?.remove()
    }
    return () => {
      document.documentElement.classList.remove('erc-cinema')
      document.getElementById(ERC_STYLE_ID)?.remove()
    }
  }, [flowType])

  /* ── Shuffle banner ── */
  const handleShuffleBanner = () => {
    if (sampleBanners.length === 0) return
    const pool = sampleBanners.filter(b => b.url !== bannerUrl)
    const next = pool.length > 0 ? pool : sampleBanners
    setBannerUrl(next[Math.floor(Math.random() * next.length)].url)
  }

  /* ── Banner Upload Processing ── */
  const processUploadedFile = async (file: File) => {
    const v = validateImageFile(file)
    if (!v.valid) {
      showToast('error', v.error || 'Ảnh không hợp lệ')
      return
    }
    setIsUploading(true)
    try {
      if (bannerUrl?.includes('/uploads/')) {
        await deleteEventBanner(bannerUrl)
      }
      const newUrl = await uploadEventBanner(file)
      setBannerUrl(newUrl)
      showToast('success', 'Đã tải lên ảnh bìa!')
      setIsCoverModalOpen(false)
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi tải ảnh')
    } finally {
      setIsUploading(false)
    }
  }

  const handleModalBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processUploadedFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      await processUploadedFile(file)
    }
  }

  const handleSelectSampleBanner = async (url: string) => {
    if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    setBannerUrl(url)
    setIsCoverModalOpen(false)
  }

  const handleRemoveBanner = async () => {
    if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    setBannerUrl('')
  }

  const handleCancel = async () => {
    if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    navigate('/dashboard/event-requests')
  }

  /* ── Field change ── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(p => {
      const nd = { ...p, [name]: value }
      return nd
    })
  }

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cap = parseInt(formData.expectedParticipants)
    if (formData.expectedParticipants && (isNaN(cap) || cap < 10 || cap % 10 !== 0)) {
      setError('Số lượng phải tối thiểu 10 và là bội số của 10')
      return
    }
    const tv = validateEventDateTime(formData.preferredStart, formData.preferredEnd, flowType)
    if (!tv.valid) {
      setError(tv.errors.join(' · '))
      tv.errors.forEach(msg => showToast('error', msg))
      return
    }

    setIsSubmitting(true)
    try {
      const fmt = (s: string) => (s ? s + ':00' : null)
      const body = {
        title: formData.title,
        description: formData.description || null,
        preferredStartTime: fmt(formData.preferredStart),
        preferredEndTime:   fmt(formData.preferredEnd),
        expectedCapacity:   cap || 0,
        eventFormat,
        customVenueName: eventFormat !== 'ONLINE' ? formData.customVenueName || null : null,
        customLocation:  eventFormat !== 'ONLINE' ? formData.customLocation  || null : null,
        bannerUrl: bannerUrl || null,
        isPublic,
      }
      const url = flowType === 'UNIVERSITY' ? '/api/event-requests' : '/api/events/independent'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const ed = await res.json()
        throw new Error(ed.message || ed.error || 'Thất bại')
      }
      showToast('success', flowType === 'UNIVERSITY' ? 'Đã gửi đề xuất thành công!' : 'Sự kiện đã được tạo thành công!')
      navigate('/dashboard/event-requests')
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally { setIsSubmitting(false) }
  }

  const categories      = ['ALL', ...Array.from(new Set(sampleBanners.map(b => b.category).filter(Boolean)))]
  const filteredBanners = selectedCategory === 'ALL' ? sampleBanners : sampleBanners.filter(b => b.category === selectedCategory)

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="h-full">

      {/* ══════════════════════════════════════════════
          STEP 1 — Flow type selector (native theme)
      ══════════════════════════════════════════════ */}
      {!flowType && (
        <div className="relative flex items-center justify-center h-[calc(100vh-140px)] w-full px-8 py-4 overflow-hidden">
          {/* Vibrant ambient background glow bubbles */}
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-500/10 dark:bg-orange-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

          <div className="relative w-full max-w-3xl z-10">
            <div className="text-center mb-10">
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full">
                Bước 1
              </span>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white mt-4 mb-3">
                Tạo sự kiện mới
              </h1>
              <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 max-w-lg mx-auto font-medium leading-relaxed">
                Chọn loại hình sự kiện phù hợp để tiếp tục thiết lập biểu mẫu thông tin chi tiết
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              {[
                { type: 'UNIVERSITY' as const, icon: Building2, label: 'Sự Kiện Trường Học', sub: 'Gửi đề xuất phê duyệt đến ban giám hiệu nhà trường. Phù hợp cho các sự kiện học thuật, câu lạc bộ, hội thảo chính quy.' },
                { type: 'INDEPENDENT' as const, icon: Globe, label: 'Sự Kiện Tự Do', sub: 'Tự chủ hoàn toàn về thời gian, địa điểm và quy trình phê duyệt. Phù hợp cho hội nhóm, workshop, giao lưu tự phát.' },
              ].map(({ type, icon: Icon, label, sub }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFlowType(type)}
                  className="group cursor-pointer p-8 rounded-3xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 hover:border-orange-500/50 dark:hover:border-orange-500/40 shadow-2xl hover:shadow-orange-500/[0.05] hover:bg-white/90 dark:hover:bg-slate-900/90 transition-all duration-500 hover:-translate-y-1 text-center flex flex-col items-center gap-6"
                >
                  <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 group-hover:bg-orange-600 group-hover:text-white transition-all duration-550 shadow-md">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div className="space-y-2.5">
                    <h3 className="text-lg font-black text-slate-800 dark:text-white group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors">
                      {label}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed px-2">
                      {sub}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/dashboard/event-requests')}
                className="inline-flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 hover:text-orange-500 dark:hover:text-orange-450 font-black tracking-wider uppercase transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Quay lại danh sách
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 2 — Cinema form
      ══════════════════════════════════════════════ */}
      {flowType && (
        <>
          {/* ── Fixed cinema backdrop ── */}
          <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden">
            <div className="absolute inset-0 bg-[#0c0c0d]" />
            {bannerUrl && (
              <div
                className="absolute -inset-[30%] opacity-[0.12] saturate-[100%] blur-[180px] scale-110 transition-all duration-[2000ms]"
                style={{ backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}
            <div className="absolute inset-0 bg-black/87" />
          </div>

          {/* ══════════════════════════════════════════════
              Main two-column form — locked single viewport
          ══════════════════════════════════════════════ */}
          <form
            onSubmit={handleSubmit}
            className="relative z-10 h-full overflow-hidden flex items-start px-6 md:px-12 lg:px-16 max-w-[950px] mx-auto gap-10 w-full pt-10 pb-4"
          >

            {/* ══════════════════════════════════════════
                LEFT COLUMN — Square cover + controls
            ══════════════════════════════════════════ */}
            <div className="w-[300px] md:w-[340px] lg:w-[360px] shrink-0 flex flex-col gap-3 overflow-hidden mt-0 pt-0">

              {/* ── Square cover image ── */}
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/70 group">
                {bannerUrl ? (
                  <img src={bannerUrl} alt="Event banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/[0.04] border border-white/[0.07] flex flex-col items-center justify-center gap-2">
                    <ImageIcon className="w-10 h-10 text-white/10" />
                    <p className="text-[11px] text-white/20 font-medium">Chưa có ảnh bìa</p>
                  </div>
                )}

                {/* Upload spinner */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="w-8 h-8 rounded-full border-2 border-white/15 border-t-orange-400 animate-spin" />
                  </div>
                )}

                {/* Subtle bottom vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent pointer-events-none" />

                {/* Camera icon — bottom-right; opens unified modal */}
                <div className="absolute bottom-3 right-3 z-10">
                  <button
                    type="button"
                    onClick={() => setIsCoverModalOpen(true)}
                    aria-label="Quản lý ảnh bìa"
                    className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-md text-neutral-800 shadow-xl flex items-center justify-center hover:bg-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ── Banner footer controls: Left = Back button, Right = Shuffle icon button ── */}
              <div className="flex items-center justify-between mt-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setFlowType(null); setError(null); setTimeErrors([]) }}
                  className="flex items-center gap-1.5 text-white/50 hover:text-white text-[11px] font-bold transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Thay đổi
                </button>

                <button
                  type="button"
                  onClick={handleShuffleBanner}
                  disabled={sampleBanners.length === 0}
                  aria-label="Ảnh ngẫu nhiên"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════════
                RIGHT COLUMN — Floating form canvas
            ══════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col justify-between py-0 overflow-hidden h-full min-w-0 mt-0 pt-0">

              {/* ── Header metadata row: flow label + visibility toggle ── */}
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/50">
                    Loại đơn tổ chức:
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-orange-400/80">
                    {flowType === 'UNIVERSITY' ? 'Trường học' : 'Tự do'}
                  </span>
                </div>

                {/* Public / Private Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPublicDropdown(v => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold text-white hover:bg-white/[0.08] transition-all duration-200 cursor-pointer"
                  >
                    {isPublic ? (
                      <><Globe className="w-3.5 h-3.5 text-orange-400" /> Công khai</>
                    ) : (
                      <><Lock className="w-3.5 h-3.5 text-orange-400" /> Riêng tư</>
                    )}
                    <ChevronDown className="w-3 h-3 text-white/50" />
                  </button>
                  {showPublicDropdown && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowPublicDropdown(false)} />
                      <div className="absolute right-0 mt-1.5 z-30 bg-[#141416]/98 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden shadow-2xl w-80 py-1.5 animate-fadeIn">
                        <button
                          type="button"
                          onClick={() => { setIsPublic(true); setShowPublicDropdown(false) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] flex items-start gap-3 transition cursor-pointer"
                        >
                          <Globe className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold ${isPublic ? 'text-white' : 'text-neutral-300'}`}>Công khai</p>
                            <p className="text-[10px] text-neutral-400 font-medium mt-0.5 leading-normal">Hiển thị trên lịch của bạn và có đủ điều kiện được đề xuất.</p>
                          </div>
                          {isPublic && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsPublic(false); setShowPublicDropdown(false) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] flex items-start gap-3 transition cursor-pointer border-t border-white/[0.05]"
                        >
                          <Lock className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold ${!isPublic ? 'text-white' : 'text-neutral-300'}`}>Riêng tư</p>
                            <p className="text-[10px] text-neutral-400 font-medium mt-0.5 leading-normal">Không liệt kê. Chỉ những người có liên kết mới có thể đăng ký.</p>
                          </div>
                          {!isPublic && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Event name ── */}
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                autoComplete="off"
                placeholder="Tên sự kiện..."
                className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-b border-white/[0.09] focus:border-orange-500/55 text-white placeholder-neutral-500 py-2 focus:outline-none w-full mb-2 transition-colors leading-tight flex-shrink-0"
              />

              {/* ── Time — borderless rows ── */}
              <div className="mb-2 flex-shrink-0">
                {/* Start */}
                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.07]">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Bắt đầu</span>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowStartCalendar(v => !v)
                        setShowStartTimeList(false)
                        setShowEndCalendar(false)
                        setShowEndTimeList(false)
                      }}
                      className="bg-white/[0.05] hover:bg-white/[0.10] px-3 py-1.5 rounded-lg border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer"
                    >
                      {startDate ? formatDateVietnamese(startDate) : 'Chọn ngày'}
                    </button>
                    {showStartCalendar && (
                      <CalendarPopover
                        value={startDate}
                        onChange={handleStartDateChange}
                        onClose={() => setShowStartCalendar(false)}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowStartTimeList(v => !v)
                        setShowStartCalendar(false)
                        setShowEndCalendar(false)
                        setShowEndTimeList(false)
                      }}
                      className="bg-white/[0.05] hover:bg-white/[0.10] px-3 py-1.5 rounded-lg border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer"
                    >
                      {startTime || 'Chọn giờ'}
                    </button>
                    {showStartTimeList && (
                      <TimePopover
                        value={startTime}
                        onChange={handleStartTimeChange}
                        onClose={() => setShowStartTimeList(false)}
                      />
                    )}
                  </div>
                </div>

                {/* End */}
                <div className="flex items-center justify-between py-1.5 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full border border-white/22 flex-shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Kết thúc</span>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEndCalendar(v => !v)
                        setShowStartCalendar(false)
                        setShowStartTimeList(false)
                        setShowEndTimeList(false)
                      }}
                      className="bg-white/[0.05] hover:bg-white/[0.10] px-3 py-1.5 rounded-lg border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer"
                    >
                      {endDate ? formatDateVietnamese(endDate) : 'Chọn ngày'}
                    </button>
                    {showEndCalendar && (
                      <CalendarPopover
                        value={endDate}
                        onChange={setEndDate}
                        onClose={() => setShowEndCalendar(false)}
                        minDate={startDate}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowEndTimeList(v => !v)
                        setShowStartCalendar(false)
                        setShowStartTimeList(false)
                        setShowEndCalendar(false)
                      }}
                      className="bg-white/[0.05] hover:bg-white/[0.10] px-3 py-1.5 rounded-lg border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer"
                    >
                      {endTime || 'Chọn giờ'}
                    </button>
                    {showEndTimeList && (
                      <TimePopover
                        value={endTime}
                        onChange={setEndTime}
                        onClose={() => setShowEndTimeList(false)}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* UX suggestion notice about Staff review safety margin */}
              {flowType === 'UNIVERSITY' && (
                <div className="mb-2 px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-2 flex-shrink-0 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-neutral-350 font-medium leading-normal">
                    <span className="text-orange-400 font-bold">Khuyên dùng:</span> Sự kiện trường cần Staff duyệt. Hãy cân nhắc đặt cách hiện tại <span className="text-white font-bold">36h - 48h</span> trở lên để Staff kịp tiếp nhận duyệt.
                  </p>
                </div>
              )}

              {/* ── Event format — translucent pill dock ── */}
              <div className="mb-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MapPin className="w-3 h-3 text-white/40" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">Hình thức</span>
                </div>
                <div className="w-full bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-xl p-1 flex gap-1">
                  {(['ONLINE', 'ONSITE', 'HYBRID'] as const).map(fmt => (
                    <button key={fmt} type="button" onClick={() => setEventFormat(fmt)}
                      className={`flex-1 text-center py-2 text-xs rounded-lg transition-all duration-200 cursor-pointer ${
                        eventFormat === fmt
                          ? 'font-semibold text-white bg-white/[0.12] backdrop-blur-lg border border-white/[0.10] shadow-lg'
                          : 'font-medium text-neutral-400 hover:text-white bg-transparent'
                      }`}
                    >
                      {fmt === 'ONLINE' ? 'Trực tuyến' : fmt === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                    </button>
                  ))}
                </div>

                {/* Location rows — borderless */}
                {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                  <div className="mt-1 animate-fadeIn">
                    <div className="py-1 border-b border-white/[0.07]">
                      <input type="text" name="customVenueName" value={formData.customVenueName} onChange={handleChange}
                        placeholder="Tên địa điểm tổ chức..."
                        className="w-full bg-transparent text-white/85 text-sm font-medium placeholder-neutral-500 focus:outline-none" />
                    </div>
                    <div className="py-1 border-b border-white/[0.05]">
                      <input type="text" name="customLocation" value={formData.customLocation} onChange={handleChange}
                        placeholder="Địa chỉ chi tiết..."
                        className="w-full bg-transparent text-white/60 text-xs font-medium placeholder-neutral-500 focus:outline-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Description — borderless expandable ── */}
              <div className="mb-2 flex-shrink-0">
                {!descOpen ? (
                  <button type="button" onClick={() => setDescOpen(true)}
                    className="w-full flex items-center gap-2.5 py-1.5 border-b border-white/[0.07] text-white/50 hover:text-white/80 transition-colors text-left cursor-pointer">
                    <AlignLeft className="w-3.5 h-3.5 flex-shrink-0 text-white/40" />
                    <span className="text-sm font-medium">Thêm mô tả sự kiện...</span>
                  </button>
                ) : (
                  <div className="py-1.5 border-b border-white/[0.07]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlignLeft className="w-3 h-3 text-white/40" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">Mô tả</span>
                    </div>
                    <textarea name="description" value={formData.description} onChange={handleChange}
                      rows={2} autoFocus placeholder="Nội dung, diễn giả, hoạt động nổi bật..."
                      className="w-full bg-transparent text-white/80 text-sm font-medium placeholder-neutral-500 focus:outline-none resize-none leading-relaxed" />
                  </div>
                )}
              </div>

              {/* ── Capacity — borderless row ── */}
              <div className="mb-2 flex items-center justify-between py-1.5 border-b border-white/[0.07] flex-shrink-0">
                <div className="flex items-center gap-2.5 text-white/50">
                  <Users className="w-3.5 h-3.5 flex-shrink-0 text-white/40" />
                  <span className="text-sm font-medium">Sức chứa tối đa</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="number" name="expectedParticipants" value={formData.expectedParticipants}
                    onChange={handleChange} min="10" step="10" placeholder="Không giới hạn"
                    className="w-32 text-right bg-transparent text-white/80 text-sm font-semibold placeholder-neutral-500 focus:outline-none border-b border-transparent focus:border-orange-500/40 transition-colors pb-0.5" />
                  {formData.expectedParticipants && (
                    <span className="text-[10px] text-white/40 font-medium">người</span>
                  )}
                </div>
              </div>

              {/* ── Validation errors ── */}
              {(timeErrors.length > 0 || error) && (
                <div className="mb-2 px-3.5 py-2 bg-red-950/30 border border-red-800/22 rounded-xl flex items-start gap-2 flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400/80 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {timeErrors.slice(0, 2).map((e, i) => (
                      <p key={i} className="text-[11px] text-red-300/80 font-medium leading-snug">{e}</p>
                    ))}
                    {error && <p className="text-[11px] text-red-300/80 font-medium leading-snug">{error}</p>}
                  </div>
                </div>
              )}

              {/* Spacer */}
              <div className="flex-1 min-h-[4px]" />

              {/* ── Submit bar ── */}
              <div className="space-y-1.5 pt-1.5 border-t border-white/[0.06] flex-shrink-0">
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-bold text-sm transition-all shadow-lg shadow-orange-950/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting
                    ? 'Đang xử lý...'
                    : flowType === 'UNIVERSITY'
                    ? 'Gửi đề xuất lên trường'
                    : 'Tạo sự kiện ngay'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  className="w-full py-2 rounded-xl text-white/50 hover:text-white transition-colors font-medium text-sm cursor-pointer"
                >
                  Hủy và quay lại
                </button>
              </div>
            </div>
          </form>
        </>
      )}

      {/* ══════════════════════════════════════════════
          Unified Cover Modal (Upload + Sample Grid)
      ══════════════════════════════════════════════ */}
      {isCoverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#141416] border border-white/[0.09] rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-black text-white">Ảnh bìa sự kiện</h3>
                <p className="text-[10px] text-neutral-400 mt-0.5">Tải lên từ thiết bị hoặc chọn từ thư viện mẫu</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsCoverModalOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-neutral-400 hover:text-white transition cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              
              {/* Top Area: Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => modalFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-orange-500 bg-orange-500/5 text-orange-400'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                <input
                  ref={modalFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleModalBannerUpload}
                />
                <Upload className="w-6 h-6 text-orange-400" />
                <span className="text-xs font-bold text-white/90">Drag & Drop or Click Here to Upload</span>
                <span className="text-[10px] text-neutral-500 font-medium">Hỗ trợ JPG, PNG, WEBP (Tối đa 5MB)</span>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.05]"></div></div>
                <span className="relative px-3 bg-[#141416] text-[9px] font-black uppercase tracking-[0.2em] text-white/25">Hoặc chọn ảnh mẫu</span>
              </div>

              {/* Category Selector */}
              {categories.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 flex-shrink-0 scrollbar-thin">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-orange-600 text-white'
                          : 'bg-white/[0.05] text-neutral-400 hover:bg-white/[0.09] hover:text-white'
                      }`}
                    >
                      {cat === 'ALL' ? 'Tất cả' : cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Bottom Area: Sample Grid (1:1 aspect-square) */}
              <div className="flex-1 min-h-[200px]">
                {filteredBanners.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <ImageIcon className="w-9 h-9 text-neutral-600" />
                    <p className="text-xs text-neutral-500 font-medium">Không có ảnh trong danh mục này</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {filteredBanners.map(banner => (
                      <div
                        key={banner.bannerId}
                        onClick={() => handleSelectSampleBanner(banner.url)}
                        className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-white/[0.07] hover:border-orange-500/60 transition-all duration-200 shadow-sm"
                      >
                        <img
                          src={banner.url}
                          alt={banner.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                          <span className="text-white text-[9px] font-black truncate">{banner.title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  )
}
