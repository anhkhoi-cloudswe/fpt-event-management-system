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
  Ticket,
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { uploadEventBanner, deleteEventBanner, validateImageFile } from '../utils/imageUpload'
import LocationAutocomplete from '../components/events/LocationAutocomplete'

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
  html.dark.erc-cinema body { background: #0c0c0d !important; }
  html:not(.dark).erc-cinema body { background: #f8fafc !important; }

  html.erc-cinema body > div > div[class*="min-h-screen"],
  html.erc-cinema body > div[class*="min-h-screen"],
  html.erc-cinema body > div > div > div[class*="min-h-screen"] {
    background: transparent !important;
  }

  /* Header theme support */
  html.dark.erc-cinema header {
    background: rgba(12,12,13,0.75) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-bottom-color: rgba(255,255,255,0.055) !important;
    box-shadow: none !important;
  }
  html:not(.dark).erc-cinema header {
    background: rgba(255,255,255,0.75) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-bottom-color: rgba(0,0,0,0.055) !important;
    box-shadow: none !important;
  }
  
  /* Force dark-mode texts on header items */
  html.dark.erc-cinema header [class*="text-slate-"]:not([class*="rounded-3xl"] *),
  html.dark.erc-cinema header [class*="text-neutral-"]:not([class*="rounded-3xl"] *) {
    color: rgba(255,255,255,0.60) !important;
  }
  html.dark.erc-cinema header p:not([class*="rounded-3xl"] *),
  html.dark.erc-cinema header span:not([class*="bg-"]):not([class*="from-"]):not([class*="rounded-3xl"] *),
  html.dark.erc-cinema header h4:not([class*="rounded-3xl"] *),
  html.dark.erc-cinema header svg:not([class*="rounded-3xl"] *) {
    color: rgba(255,255,255,0.90) !important;
  }

  /* Force light-mode texts on header items */
  html:not(.dark).erc-cinema header [class*="text-slate-"]:not([class*="rounded-3xl"] *),
  html:not(.dark).erc-cinema header [class*="text-neutral-"]:not([class*="rounded-3xl"] *) {
    color: rgba(15,23,42,0.60) !important;
  }
  html:not(.dark).erc-cinema header p:not([class*="rounded-3xl"] *),
  html:not(.dark).erc-cinema header span:not([class*="bg-"]):not([class*="from-"]):not([class*="rounded-3xl"] *),
  html:not(.dark).erc-cinema header h4:not([class*="rounded-3xl"] *),
  html:not(.dark).erc-cinema header svg:not([class*="rounded-3xl"] *) {
    color: rgba(15,23,42,0.90) !important;
  }
  
  /* Style wallet balance specifically */
  html.dark.erc-cinema header div.bg-gradient-to-r,
  html.dark.erc-cinema header div.bg-slate-800,
  html.dark.erc-cinema header div[class*="bg-gradient-to-r"],
  html.dark.erc-cinema header div[class*="bg-slate-800"] {
    background: rgba(255,255,255,0.06) !important;
    background-image: none !important;
    border-color: rgba(255,255,255,0.12) !important;
  }
  html.dark.erc-cinema header div.bg-gradient-to-r *,
  html.dark.erc-cinema header div.bg-slate-800 *,
  html.dark.erc-cinema header div[class*="bg-gradient-to-r"] *,
  html.dark.erc-cinema header div[class*="bg-slate-800"] * {
    color: #fb923c !important;
  }

  html:not(.dark).erc-cinema header div.bg-gradient-to-r,
  html:not(.dark).erc-cinema header div.bg-slate-800,
  html:not(.dark).erc-cinema header div[class*="bg-gradient-to-r"],
  html:not(.dark).erc-cinema header div[class*="bg-slate-800"] {
    background: rgba(251,146,60,0.1) !important;
    background-image: none !important;
    border-color: rgba(251,146,60,0.2) !important;
  }
  html:not(.dark).erc-cinema header div.bg-gradient-to-r *,
  html:not(.dark).erc-cinema header div.bg-slate-800 *,
  html:not(.dark).erc-cinema header div[class*="bg-gradient-to-r"] *,
  html:not(.dark).erc-cinema header div[class*="bg-slate-800"] * {
    color: #ea580c !important;
  }
  
  /* Style profile details popover trigger */
  html.dark.erc-cinema header div[class*="hover:bg-orange-55"],
  html.dark.erc-cinema header div[class*="hover:bg-orange-50"] {
    color: rgba(255,255,255,0.90) !important;
  }
  html.dark.erc-cinema header div[class*="hover:bg-orange-55"]:hover,
  html.dark.erc-cinema header div[class*="hover:bg-orange-50"]:hover {
    background-color: rgba(255,255,255,0.07) !important;
  }

  html:not(.dark).erc-cinema header div[class*="hover:bg-orange-55"],
  html:not(.dark).erc-cinema header div[class*="hover:bg-orange-50"] {
    color: rgba(15,23,42,0.90) !important;
  }
  html:not(.dark).erc-cinema header div[class*="hover:bg-orange-55"]:hover,
  html:not(.dark).erc-cinema header div[class*="hover:bg-orange-50"]:hover {
    background-color: rgba(0,0,0,0.05) !important;
  }
  
  /* Header buttons */
  html.dark.erc-cinema header button:not([class*="bg-gradient"]):not([class*="from-orange"]):not([class*="rounded-3xl"] *),
  html.dark.erc-cinema header select {
    background-color: rgba(255,255,255,0.09) !important;
    border-color: rgba(255,255,255,0.13) !important;
    color: rgba(255,255,255,0.92) !important;
  }
  html.dark.erc-cinema header button:not([class*="bg-gradient"]):not([class*="from-orange"]):not([class*="rounded-3xl"] *):hover {
    background-color: rgba(255,255,255,0.15) !important;
  }

  html:not(.dark).erc-cinema header button:not([class*="bg-gradient"]):not([class*="from-orange"]):not([class*="rounded-3xl"] *),
  html:not(.dark).erc-cinema header select {
    background-color: rgba(0,0,0,0.05) !important;
    border-color: rgba(0,0,0,0.1) !important;
    color: rgba(15,23,42,0.92) !important;
  }
  html:not(.dark).erc-cinema header button:not([class*="bg-gradient"]):not([class*="from-orange"]):not([class*="rounded-3xl"] *):hover {
    background-color: rgba(0,0,0,0.08) !important;
  }

  html.erc-cinema header button[class*="from-orange"],
  html.erc-cinema header button[class*="bg-gradient"] {
    background: linear-gradient(to bottom right,#ea580c,#f97316) !important;
  }
  html.erc-cinema header [class*="text-orange"],
  html.erc-cinema header [class*="text-fpt"] { color: rgba(255,165,40,0.95) !important; }

  /* Sidebar (Aside) */
  html.dark.erc-cinema aside {
    background: rgba(12,12,13,0.62) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-right-color: rgba(255,255,255,0.055) !important;
    box-shadow: none !important;
  }
  html.dark.erc-cinema aside,
  html.dark.erc-cinema aside * { color: rgba(255,255,255,0.60) !important; }

  html:not(.dark).erc-cinema aside {
    background: rgba(255,255,255,0.62) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-right-color: rgba(0,0,0,0.055) !important;
    box-shadow: none !important;
  }
  html:not(.dark).erc-cinema aside,
  html:not(.dark).erc-cinema aside * { color: rgba(15,23,42,0.60) !important; }

  html.erc-cinema aside a,
  html.erc-cinema aside button { background: transparent !important; border-color: transparent !important; }
  
  html.dark.erc-cinema aside a:hover,
  html.dark.erc-cinema aside button:hover { background: rgba(255,255,255,0.07) !important; }
  html.dark.erc-cinema aside a:hover *,
  html.dark.erc-cinema aside button:hover * { color: rgba(255,255,255,0.90) !important; }

  html:not(.dark).erc-cinema aside a:hover,
  html:not(.dark).erc-cinema aside button:hover { background: rgba(0,0,0,0.05) !important; }
  html:not(.dark).erc-cinema aside a:hover *,
  html:not(.dark).erc-cinema aside button:hover * { color: rgba(15,23,42,0.90) !important; }

  html.dark.erc-cinema aside a[class*="bg-orange"],
  html.dark.erc-cinema aside a[class*="bg-gradient"] {
    background: rgba(234,88,12,0.20) !important;
    border-color: rgba(234,88,12,0.26) !important;
  }
  html.dark.erc-cinema aside a[class*="bg-orange"] *,
  html.dark.erc-cinema aside a[class*="bg-gradient"] * { color: rgba(251,146,60,0.95) !important; }

  html:not(.dark).erc-cinema aside a[class*="bg-orange"],
  html:not(.dark).erc-cinema aside a[class*="bg-gradient"] {
    background: rgba(234,88,12,0.10) !important;
    border-color: rgba(234,88,12,0.16) !important;
  }
  html:not(.dark).erc-cinema aside a[class*="bg-orange"] *,
  html:not(.dark).erc-cinema aside a[class*="bg-gradient"] * { color: rgba(234,88,12,0.95) !important; }

  html.erc-cinema main { overflow: hidden !important; }
  html.erc-cinema main > div {
    background: transparent !important;
    padding: 0 !important;
    max-width: 100% !important;
    height: 100% !important;
  }
  
  /* Profile settings popover card */
  html.dark.erc-cinema header div[class*="rounded-3xl"] {
    background-color: #18181b !important;
    border-color: rgba(255,255,255,0.1) !important;
    color: rgba(255,255,255,0.9) !important;
  }
  html.dark.erc-cinema header div[class*="rounded-3xl"] label { color: rgba(255,255,255,0.5) !important; }
  html.dark.erc-cinema header div[class*="rounded-3xl"] h4 { color: rgba(255,255,255,0.9) !important; }
  html.dark.erc-cinema header div[class*="rounded-3xl"] p { color: rgba(255,255,255,0.5) !important; }
  html.dark.erc-cinema header div[class*="rounded-3xl"] input {
    background-color: #09090b !important;
    border-color: rgba(255,255,255,0.15) !important;
    color: rgba(255,255,255,0.9) !important;
  }
  html.dark.erc-cinema header div[class*="rounded-3xl"] input::placeholder { color: rgba(255,255,255,0.3) !important; }
  html.dark.erc-cinema header div[class*="rounded-3xl"] button:not([class*="bg-gradient"]) {
    background-color: rgba(255,255,255,0.06) !important;
    border-color: rgba(255,255,255,0.12) !important;
    color: rgba(255,255,255,0.9) !important;
  }
  html.dark.erc-cinema header div[class*="rounded-3xl"] button:not([class*="bg-gradient"]):hover {
    background-color: rgba(255,255,255,0.12) !important;
  }
  html.dark.erc-cinema header div[class*="rounded-3xl"] a,
  html.dark.erc-cinema header div[class*="rounded-3xl"] button[class*="text-left"] {
    color: rgba(255,255,255,0.7) !important;
  }
  html.dark.erc-cinema header div[class*="rounded-3xl"] a:hover,
  html.dark.erc-cinema header div[class*="rounded-3xl"] button[class*="text-left"]:hover {
    background-color: rgba(255,255,255,0.06) !important;
    color: rgba(255,255,255,0.9) !important;
  }
  html.dark.erc-cinema header div[class*="rounded-3xl"] svg { color: rgba(255,255,255,0.5) !important; }

  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] {
    background-color: #ffffff !important;
    border-color: rgba(0,0,0,0.1) !important;
    color: rgba(15,23,42,0.9) !important;
  }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] label { color: rgba(15,23,42,0.5) !important; }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] h4 { color: rgba(15,23,42,0.9) !important; }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] p { color: rgba(15,23,42,0.5) !important; }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] input {
    background-color: #f1f5f9 !important;
    border-color: rgba(0,0,0,0.1) !important;
    color: rgba(15,23,42,0.9) !important;
  }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] input::placeholder { color: rgba(15,23,42,0.3) !important; }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] button:not([class*="bg-gradient"]) {
    background-color: rgba(0,0,0,0.06) !important;
    border-color: rgba(0,0,0,0.12) !important;
    color: rgba(15,23,42,0.9) !important;
  }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] button:not([class*="bg-gradient"]):hover {
    background-color: rgba(0,0,0,0.1) !important;
  }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] a,
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] button[class*="text-left"] {
    color: rgba(15,23,42,0.7) !important;
  }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] a:hover,
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] button[class*="text-left"]:hover {
    background-color: rgba(0,0,0,0.06) !important;
    color: rgba(15,23,42,0.9) !important;
  }
  html:not(.dark).erc-cinema header div[class*="rounded-3xl"] svg { color: rgba(15,23,42,0.5) !important; }
  
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
   Fallback Campus Areas data
───────────────────────────────────────────────────────────── */
const FALLBACK_CAMPUS_AREAS = [
  { areaId: 101, areaName: 'Delta Hall', floor: 'Tầng 1', capacity: 150 },
  { areaId: 102, areaName: 'Library', floor: 'Tầng 2', capacity: 100 },
  { areaId: 103, areaName: 'Innovation Lab', floor: 'Tầng 3', capacity: 50 },
  { areaId: 104, areaName: 'Hall A', floor: 'Tầng 1', capacity: 200 },
  { areaId: 105, areaName: 'Hall B', floor: 'Tầng 1', capacity: 120 }
]

/* ─────────────────────────────────────────────────────────────
   Custom Date / Time Pickers
───────────────────────────────────────────────────────────── */
interface CalendarPopoverProps {
  value: string
  onChange: (date: string) => void
  onClose: () => void
  minDate?: string
  isDark: boolean
}

function CalendarPopover({ value, onChange, onClose, minDate, isDark }: CalendarPopoverProps) {
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
      <div className={`absolute right-0 top-full mt-1.5 z-50 origin-top-right border rounded-2xl p-5 shadow-2xl w-[320px] select-none animate-fadeIn ${
        isDark ? 'bg-[#18181b] border-white/[0.08] text-white' : 'bg-white border-neutral-200 text-neutral-850'
      }`}>
        {/* Header matching Luma style */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-neutral-800'}`}>
            {monthNames[month]}, {year}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition cursor-pointer ${
                isDark ? 'hover:bg-white/[0.08] text-white/70 hover:text-white' : 'hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition cursor-pointer ${
                isDark ? 'hover:bg-white/[0.08] text-white/70 hover:text-white' : 'hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
              }`}
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
                    ? isDark 
                      ? 'bg-white/[0.08] text-[#fb923c] border border-[#fb923c]/30'
                      : 'bg-orange-50 text-[#ea580c] border border-[#fb923c]/40'
                    : isCurrentMonth
                    ? isDark ? 'text-white hover:bg-white/[0.08]' : 'text-neutral-800 hover:bg-neutral-100'
                    : isDark ? 'text-neutral-650 opacity-40 hover:bg-white/[0.02]' : 'text-neutral-400 opacity-40 hover:bg-neutral-50'
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
  showDuration?: boolean
  startDateTimeStr?: string
  endDateStr?: string
  isDark: boolean
}

function TimePopover({ value, onChange, onClose, showDuration, startDateTimeStr, endDateStr, isDark }: TimePopoverProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const timeSlots: string[] = []
  for (let h = 0; h < 24; h++) {
    const hs = padZ(h)
    timeSlots.push(`${hs}:00`)
    timeSlots.push(`${hs}:30`)
  }

  useEffect(() => {
    if (listRef.current && value) {
      const activeTimeItem = listRef.current.querySelector('[data-selected="true"]') as HTMLElement
      if (activeTimeItem) {
        activeTimeItem.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
      }
    }
  }, [])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={listRef}
        className={`absolute right-0 top-full mt-1.5 z-50 origin-top-right border rounded-2xl shadow-2xl w-[170px] max-h-60 overflow-y-auto py-1.5 custom-scrollbar animate-fadeIn ${
          isDark ? 'bg-[#18181b] border-white/[0.08] text-white' : 'bg-white border-neutral-200 text-neutral-850'
        }`}
      >
        {timeSlots.map(t => {
          const isSelected = value === t
          let durationText = ''
          
          if (showDuration && startDateTimeStr && endDateStr) {
            try {
              const start = new Date(startDateTimeStr)
              const end = new Date(`${endDateStr}T${t}`)
              if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMins = Math.round((end.getTime() - start.getTime()) / 60000)
                if (diffMins > 0) {
                  const h = Math.floor(diffMins / 60)
                  const m = diffMins % 60
                  if (h > 0 && m > 0) {
                    durationText = ` ${h}h ${m}m`
                  } else if (h > 0) {
                    durationText = ` ${h}h`
                  } else {
                    durationText = ` ${m}m`
                  }
                }
              }
            } catch (e) {}
          }

          return (
            <button
              key={t}
              type="button"
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => {
                onChange(t)
                onClose()
              }}
              className={`w-full text-center py-2.5 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                isSelected
                  ? 'bg-[#fb923c] text-white font-black'
                  : isDark ? 'text-white/85 hover:bg-white/[0.08]' : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>{t}</span>
              {durationText && <span className="opacity-75 text-[10px] font-normal">{durationText}</span>}
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
  const { user, currentLanguage } = useAuth()

  const [flowType, setFlowType] = useState<'UNIVERSITY' | 'INDEPENDENT' | null>(null)
  const [eventFormat, setEventFormat] = useState<'ONLINE' | 'ONSITE' | 'HYBRID'>('ONSITE')

  // Campus Areas States and helpers (moved up to avoid hoisting/crash on load)
  const [campusAreas, setCampusAreas] = useState<any[]>([])
  const [selectedCampusAreaId, setSelectedCampusAreaId] = useState('')
  const [isLoadingCampusAreas, setIsLoadingCampusAreas] = useState(false)

  const getSelectedAreaCapacity = () => {
    if (!Array.isArray(campusAreas) || !selectedCampusAreaId) return 200
    const area = campusAreas.find(a => a && String(a.areaId) === selectedCampusAreaId)
    return area?.capacity || 200
  }

  const getSelectedArea = () => {
    if (!Array.isArray(campusAreas) || !selectedCampusAreaId) return null
    return campusAreas.find(a => a && String(a.areaId) === selectedCampusAreaId) || null
  }

  const [isPublic, setIsPublic] = useState(true)
  const [descOpen, setDescOpen] = useState(false)

  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Online platform oauth integration
  const [selectedOnlinePlatform, setSelectedOnlinePlatform] = useState<'ZOOM' | 'GOOGLE'>('ZOOM')
  const [connectedPlatforms, setConnectedPlatforms] = useState({
    zoom: { connected: false, email: '', meetingLink: '' },
    google: { connected: false, email: '', meetingLink: '' }
  })
  const [isConnecting, setIsConnecting] = useState(false);

  // Listen for OAuth success messages from popup window
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin;
      if (event.origin !== window.location.origin && event.origin !== apiOrigin) {
        return;
      }

      if (event.data?.type === "OAUTH_SUCCESS") {
        const platform = event.data.platform; // 'ZOOM' or 'GOOGLE'
        const email = event.data.email || '';
        const meetingLink = event.data.meetingLink || '';

        setConnectedPlatforms(prev => ({
          ...prev,
          [platform.toLowerCase()]: {
            connected: true,
            email,
            meetingLink
          }
        }));
        setIsConnecting(false);
        showToast('success', `Đã kết nối tài khoản ${platform === 'ZOOM' ? 'Zoom' : 'Google Meet'} thành công!`);
      } else if (event.data?.type === "OAUTH_ERROR") {
        setIsConnecting(false);
        showToast('error', event.data.error || 'Không thể kết nối tài khoản. Vui lòng thử lại.');
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [showToast]);

  const handleConnect = (platform: 'zoom' | 'google') => {
    setIsConnecting(true);
    const width = 550, height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
    const redirectUri = `${apiBaseUrl}/api/v1/auth/${platform}/callback`;
    const connectUrl = `${apiBaseUrl}/api/v1/auth/${platform}/connect?redirect_uri=${encodeURIComponent(redirectUri)}&app_origin=${encodeURIComponent(window.location.origin)}`;

    const popup = window.open(
      connectUrl,
      'OAuthPopup',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setIsConnecting(false); // Reset any loading animation safely
      }
    }, 1000);
  };

  const handleDisconnect = (platform: 'zoom' | 'google') => {
    setConnectedPlatforms(prev => ({
      ...prev,
      [platform]: {
        connected: false,
        email: '',
        meetingLink: ''
      }
    }));
    showToast('info', `Đã hủy kết nối tài khoản ${platform === 'zoom' ? 'Zoom' : 'Google Meet'}.`);
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    preferredStart: '',
    preferredEnd: '',
    expectedParticipants: '',
    customVenueName: '',
    customLocation: '',
  })

  const [descBuffer, setDescBuffer] = useState('')
  const descModalRef = useRef<HTMLDivElement>(null)

  const [capacityPopoverOpen, setCapacityPopoverOpen] = useState(false)
  const [ticketPopoverOpen, setTicketPopoverOpen] = useState(false)
  const [limitCapacity, setLimitCapacity] = useState(true)
  const [tempCapacity, setTempCapacity] = useState('100')
  const capacityPopoverRef = useRef<HTMLDivElement>(null)
  const [ticketConfig, setTicketConfig] = useState({
    onlineFree: true,
    onlinePrice: '0',
    onsiteFree: true,
    onsitePrice: '0',
  })

  const formatMoney = (value: string) => {
    const amount = Number(value || 0)
    return amount > 0 ? `${amount.toLocaleString('vi-VN')} VND` : 'Free'
  }

  const getTicketSummary = () => {
    if (eventFormat === 'ONLINE') return `Online: ${ticketConfig.onlineFree ? 'Free' : formatMoney(ticketConfig.onlinePrice)}`
    if (eventFormat === 'ONSITE') return `Onsite: ${ticketConfig.onsiteFree ? 'Free' : formatMoney(ticketConfig.onsitePrice)}`
    return `Onsite: ${ticketConfig.onsiteFree ? 'Free' : formatMoney(ticketConfig.onsitePrice)}, Online: ${ticketConfig.onlineFree ? 'Free' : formatMoney(ticketConfig.onlinePrice)}`
  }

  const getTicketQuantity = (channel: 'ONLINE' | 'ONSITE') => {
    const cap = Math.max(1, parseInt(formData.expectedParticipants || tempCapacity || '1') || 1)
    if (eventFormat === 'ONLINE') return cap
    if (eventFormat === 'ONSITE') return cap

    const onsiteCap = Math.max(1, Math.min(getSelectedAreaCapacity(), cap - 1))
    const onlineCap = Math.max(1, cap - onsiteCap)
    return channel === 'ONSITE' ? onsiteCap : onlineCap
  }

  const buildIndependentTickets = () => {
    const onlinePrice = ticketConfig.onlineFree ? 0 : Number(ticketConfig.onlinePrice || 0)
    const onsitePrice = ticketConfig.onsiteFree ? 0 : Number(ticketConfig.onsitePrice || 0)
    const mkTicket = (name: string, price: number, quantity: number) => ({
      name,
      description: `${name} access`,
      price,
      maxQuantity: quantity,
      status: 'ACTIVE',
    })

    if (eventFormat === 'ONLINE') {
      return [mkTicket('Online Ticket', onlinePrice, getTicketQuantity('ONLINE'))]
    }
    if (eventFormat === 'ONSITE') {
      return [mkTicket('Onsite Ticket', onsitePrice, getTicketQuantity('ONSITE'))]
    }
    return [
      mkTicket('Onsite Ticket', onsitePrice, getTicketQuantity('ONSITE')),
      mkTicket('Online Ticket', onlinePrice, getTicketQuantity('ONLINE')),
    ]
  }

  // Enforce capacity range and default values dynamically
  useEffect(() => {
    const maxRoomCap = getSelectedAreaCapacity()
    
    let maxCap = 100
    if (eventFormat === 'ONLINE') {
      maxCap = 100
    } else if (eventFormat === 'ONSITE') {
      maxCap = maxRoomCap
    } else if (eventFormat === 'HYBRID') {
      maxCap = 100 + maxRoomCap
    }
    
    // Auto-initialize or adjust expectedParticipants / tempCapacity
    const currentVal = parseInt(formData.expectedParticipants || tempCapacity)
    if (isNaN(currentVal) || currentVal <= 0) {
      const defaultVal = maxCap.toString()
      setTempCapacity(defaultVal)
      setFormData(prev => ({ ...prev, expectedParticipants: defaultVal }))
    } else if (currentVal > maxCap) {
      const clampedVal = maxCap.toString()
      setTempCapacity(clampedVal)
      setFormData(prev => ({ ...prev, expectedParticipants: clampedVal }))
    } else {
      setTempCapacity(currentVal.toString())
      setFormData(prev => ({ ...prev, expectedParticipants: currentVal.toString() }))
    }
  }, [eventFormat, selectedCampusAreaId, campusAreas])

  // Sync capacity popover local state with form data when popover opens
  useEffect(() => {
    if (capacityPopoverOpen) {
      setLimitCapacity(true);
      if (formData.expectedParticipants) {
        setTempCapacity(formData.expectedParticipants);
      }
    }
  }, [capacityPopoverOpen, formData.expectedParticipants]);

  // Click outside listener for Capacity Popover
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (capacityPopoverRef.current && !capacityPopoverRef.current.contains(e.target as Node)) {
        setCapacityPopoverOpen(false);
      }
    };
    if (capacityPopoverOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [capacityPopoverOpen]);

  const handleOpenDescModal = () => {
    setDescBuffer(formData.description || '');
    setDescOpen(true);
  };

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



  const handleCampusAreaFocus = async () => {
    if (campusAreas.length > 0 || isLoadingCampusAreas) return
    setIsLoadingCampusAreas(true)
    try {
      const res = await fetch('/api/v1/campuses/areas', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setCampusAreas(data)
          setIsLoadingCampusAreas(false)
          return
        }
      }
    } catch (err) {
      console.error('Lỗi tải danh sách phòng campus:', err)
    }
    
    // Fallback to static school areas if call fails or returns empty
    setCampusAreas(FALLBACK_CAMPUS_AREAS)
    setIsLoadingCampusAreas(false)
  }

  const handleCampusAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const areaId = e.target.value
    setSelectedCampusAreaId(areaId)
    const selectedArea = Array.isArray(campusAreas) ? campusAreas.find(a => a && String(a.areaId) === areaId) : null
    if (selectedArea) {
      setFormData(prev => ({
        ...prev,
        customVenueName: selectedArea.areaName,
        customLocation: `${selectedArea.floor || 'Tầng thường'} - FPT University Campus`,
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        customVenueName: '',
        customLocation: '',
      }))
    }
  }

  // Wrapper for switching flowType
  const handleFlowTypeChange = (type: 'UNIVERSITY' | 'INDEPENDENT' | null) => {
    setFlowType(type)
    setSelectedCampusAreaId('')
    setFormData(prev => ({
      ...prev,
      customVenueName: '',
      customLocation: '',
    }))
  }

  /* ── Auto-init suggestions based on flowType with Smart Time Recommendation ── */
  useEffect(() => {
    if (!flowType) return
    const now = new Date()
    
    if (flowType === 'UNIVERSITY') {
      const currentHour = now.getHours()
      const currentMinutes = now.getMinutes()
      
      let startD = new Date(now)
      let startH = 7
      let endH = 9
      
      // Late-Night / Early-Morning Window (From 20:00 PM to 06:59 AM)
      if (currentHour >= 20 || currentHour < 7) {
        // Automatically set the event's start date to Current Date + 3 days
        startD.setDate(startD.getDate() + 3)
        startH = 7
        endH = 9
      } else {
        // Daytime Window (From 07:00 AM to 19:59 PM)
        // Set the recommended start date to Current Date + 2 days
        startD.setDate(startD.getDate() + 2)
        // Round up the current hour to the next full hour + 1 hour buffer
        let baseHour = currentHour
        if (currentMinutes > 0) {
          baseHour += 1
        }
        startH = baseHour + 1
        endH = startH + 2
      }
      
      const sy = startD.getFullYear()
      const sm = padZ(startD.getMonth() + 1)
      const sd = padZ(startD.getDate())
      
      setStartDate(`${sy}-${sm}-${sd}`)
      setStartTime(`${padZ(startH)}:00`)
      setEndDate(`${sy}-${sm}-${sd}`)
      setEndTime(`${padZ(endH)}:00`)
    } else {
      // Keep existing 30-min Slot Rounding for INDEPENDENT flow
      const roundedMs = Math.ceil(now.getTime() / (30 * 60000)) * (30 * 60000)
      const start = new Date(roundedMs)
      const end = new Date(start.getTime() + 60 * 60000) // default 1 hour duration
      
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
    }
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
    const maxRoomCap = getSelectedAreaCapacity()
    
    let maxAllowed = 100
    if (eventFormat === 'ONLINE') {
      maxAllowed = 100
    } else if (eventFormat === 'ONSITE') {
      maxAllowed = maxRoomCap
    } else if (eventFormat === 'HYBRID') {
      maxAllowed = 100 + maxRoomCap
    }

    if (isNaN(cap) || cap < 1 || cap > maxAllowed) {
      setError(`Sức chứa không hợp lệ. Số lượng phải từ 1 đến ${maxAllowed} người cho hình thức này.`)
      showToast('error', `Sức chứa phải từ 1 đến ${maxAllowed}`)
      return
    }
    if (eventFormat === 'HYBRID' && cap < 2) {
      const msg = 'Hybrid events need at least 2 participants: one onsite and one online.'
      setError(msg)
      showToast('error', msg)
      return
    }
    const independentTickets = flowType === 'INDEPENDENT' ? buildIndependentTickets() : []
    const invalidTicket = independentTickets.find(ticket => Number.isNaN(ticket.price) || ticket.price < 0 || ticket.price > 100000000)
    if (invalidTicket) {
      const msg = 'Ticket price must be between 0 and 100,000,000 VND.'
      setError(msg)
      showToast('error', msg)
      return
    }

    const tv = validateEventDateTime(formData.preferredStart, formData.preferredEnd, flowType)
    if (!tv.valid) {
      setError(tv.errors.join(' · '))
      tv.errors.forEach(msg => showToast('error', msg))
      return
    }

    if (eventFormat === 'ONLINE' || eventFormat === 'HYBRID') {
      const isConnected = selectedOnlinePlatform === 'ZOOM'
        ? connectedPlatforms.zoom.connected
        : connectedPlatforms.google.connected
      if (!isConnected) {
        const platformName = selectedOnlinePlatform === 'ZOOM' ? 'Zoom' : 'Google Meet'
        setError(`Vui lòng kết nối tài khoản ${platformName} để lấy link cuộc họp trực tuyến.`)
        showToast('error', `Vui lòng kết nối tài khoản ${platformName}`)
        return
      }
    }

    if (
      flowType === 'INDEPENDENT' &&
      (eventFormat === 'ONSITE' || eventFormat === 'HYBRID') &&
      (!formData.customVenueName.trim() || !formData.customLocation.trim())
    ) {
      const locationError = currentLanguage === 'en'
        ? 'Please enter the event location.'
        : 'Vui lòng nhập địa chỉ sự kiện.'
      setError(locationError)
      showToast('error', locationError)
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
        expectedCapacity:   cap,
        eventFormat,
        customVenueName: eventFormat === 'ONLINE'
          ? selectedOnlinePlatform
          : eventFormat === 'HYBRID'
          ? (formData.customVenueName || null)
          : (formData.customVenueName || null),
        customLocation: eventFormat === 'ONLINE'
          ? (selectedOnlinePlatform === 'ZOOM' ? connectedPlatforms.zoom.meetingLink : connectedPlatforms.google.meetingLink)
          : eventFormat === 'HYBRID'
          ? (formData.customLocation || null)
          : (formData.customLocation || null),
        bannerUrl: bannerUrl || null,
        // ✅ NEW: Organization type, privacy status, and online meeting info
        orgType: flowType === 'UNIVERSITY' ? 'SCHOOL' : 'FREE',
        privacyStatus: isPublic ? 'PUBLIC' : 'PRIVATE',
        onlineMeetingUrl: (eventFormat === 'ONLINE' || eventFormat === 'HYBRID')
          ? (selectedOnlinePlatform === 'ZOOM' ? connectedPlatforms.zoom.meetingLink : connectedPlatforms.google.meetingLink) || null
          : null,
        onlineMeetingId: null,     // Populated by backend if needed via OAuth API
        onlineMeetingSecret: null, // Populated by backend if needed via OAuth API
        tickets: flowType === 'INDEPENDENT' ? independentTickets : undefined,
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
    } finally { window.scrollTo({ top: 0, behavior: 'smooth' }); setIsSubmitting(false) }
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
                { type: 'UNIVERSITY' as const, icon: Building2, label: 'Sự Kiện Trường Học', sub: 'Gửi đề xuất phê duyệt đến ban giám hiệu nhà trường. Phù hợp cho các sự kiện học thuật, câu luận bộ, hội thảo chính quy.' },
                { type: 'INDEPENDENT' as const, icon: Globe, label: 'Sự Kiện Tự Do', sub: 'Tự chủ hoàn toàn về thời gian, địa điểm và quy trình phê duyệt. Phù hợp cho hội nhóm, workshop, giao lưu tự phát.' },
              ].map(({ type, icon: Icon, label, sub }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleFlowTypeChange(type)}
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
            <div className={`absolute inset-0 ${isDarkMode ? 'bg-[#0c0c0d]' : 'bg-[#f8fafc]'}`} />
            {bannerUrl && (
              <div
                className={`absolute -inset-[30%] ${isDarkMode ? 'opacity-[0.12]' : 'opacity-[0.06]'} saturate-[100%] blur-[180px] scale-110 transition-all duration-[2000ms]`}
                style={{ backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}
            <div className={`absolute inset-0 ${isDarkMode ? 'bg-black/87' : 'bg-white/85'}`} />
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
                  <div className={`w-full h-full flex flex-col items-center justify-center gap-2 border ${
                    isDarkMode ? 'bg-white/[0.04] border-white/[0.07] text-white/40' : 'bg-neutral-100 border-neutral-200 text-neutral-500'
                  }`}>
                    <ImageIcon className="w-10 h-10 opacity-60" />
                    <p className="text-[11px] font-medium">Chưa có ảnh bìa</p>
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
                  onClick={() => { handleFlowTypeChange(null); setError(null); setTimeErrors([]) }}
                  className={`flex items-center gap-1.5 text-[11px] font-bold transition cursor-pointer ${
                    isDarkMode ? 'text-white/50 hover:text-white' : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Thay đổi
                </button>

                <button
                  type="button"
                  onClick={handleShuffleBanner}
                  disabled={sampleBanners.length === 0}
                  aria-label="Ảnh ngẫu nhiên"
                  className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer ${
                    isDarkMode 
                      ? 'bg-white/[0.05] border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08]' 
                      : 'bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200'
                  }`}
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
                  <span className={`text-[9px] font-black uppercase tracking-[0.22em] ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>
                    Loại đơn tổ chức:
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-orange-500">
                    {flowType === 'UNIVERSITY' ? 'Trường học' : 'Tự do'}
                  </span>
                </div>

                {/* Public / Private Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPublicDropdown(v => !v)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-200 cursor-pointer ${
                      isDarkMode 
                        ? 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]' 
                        : 'border-neutral-250 bg-white text-neutral-800 hover:bg-neutral-50'
                    }`}
                  >
                    {isPublic ? (
                      <><Globe className="w-3.5 h-3.5 text-orange-500" /> Công khai</>
                    ) : (
                      <><Lock className="w-3.5 h-3.5 text-orange-500" /> Riêng tư</>
                    )}
                    <ChevronDown className={`w-3 h-3 ${isDarkMode ? 'text-white/50' : 'text-neutral-550'}`} />
                  </button>
                  {showPublicDropdown && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowPublicDropdown(false)} />
                      <div className={`absolute right-0 bottom-full mb-2 z-30 border rounded-xl overflow-hidden shadow-2xl w-80 py-1.5 animate-fadeIn ${
                        isDarkMode 
                          ? 'bg-[#141416]/98 border-white/10 text-white' 
                          : 'bg-white border-neutral-200 text-neutral-850'
                      }`}>
                        <button
                          type="button"
                          onClick={() => { setIsPublic(true); setShowPublicDropdown(false) }}
                          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition cursor-pointer ${
                            isDarkMode ? 'hover:bg-white/[0.04] border-white/[0.05]' : 'hover:bg-neutral-50 border-neutral-100'
                          }`}
                        >
                          <Globe className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold">Công khai</p>
                            <p className={`text-[10px] font-medium mt-0.5 leading-normal ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Hiển thị trên lịch của bạn và có đủ điều kiện được đề xuất.</p>
                          </div>
                          {isPublic && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsPublic(false); setShowPublicDropdown(false) }}
                          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition cursor-pointer border-t ${
                            isDarkMode ? 'hover:bg-white/[0.04] border-white/[0.05]' : 'hover:bg-neutral-50 border-neutral-100'
                          }`}
                        >
                          <Lock className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold">Riêng tư</p>
                            <p className={`text-[10px] font-medium mt-0.5 leading-normal ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Không liệt kê. Chỉ những người có liên kết mới có thể đăng ký.</p>
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
                className={`text-3xl md:text-4xl font-bold tracking-tight !bg-transparent border-b py-2 focus:outline-none w-full mb-2 transition-colors leading-tight flex-shrink-0 ${
                  isDarkMode 
                    ? 'border-white/[0.09] text-white !placeholder-white/20 focus:border-orange-500/55' 
                    : 'border-neutral-200 text-neutral-850 placeholder-neutral-400 focus:border-orange-500/55'
                }`}
              />

              {/* ── Time — borderless rows ── */}
              <div className="mb-2 flex-shrink-0">
                {/* Start */}
                <div className={`flex items-center justify-between py-1.5 border-b ${isDarkMode ? 'border-white/[0.07]' : 'border-neutral-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>Bắt đầu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowStartCalendar(v => !v)
                          setShowStartTimeList(false)
                          setShowEndCalendar(false)
                          setShowEndTimeList(false)
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer ${
                          isDarkMode 
                            ? 'bg-white/[0.05] hover:bg-white/[0.10] border-white/10 text-white' 
                            : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                        }`}
                      >
                        {startDate ? formatDateVietnamese(startDate) : 'Chọn ngày'}
                      </button>
                      {showStartCalendar && (
                        <CalendarPopover
                          value={startDate}
                          onChange={handleStartDateChange}
                          onClose={() => setShowStartCalendar(false)}
                          isDark={isDarkMode}
                        />
                      )}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowStartTimeList(v => !v)
                          setShowStartCalendar(false)
                          setShowEndCalendar(false)
                          setShowEndTimeList(false)
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer ${
                          isDarkMode 
                            ? 'bg-white/[0.05] hover:bg-white/[0.10] border-white/10 text-white' 
                            : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                        }`}
                      >
                        {startTime || 'Chọn giờ'}
                      </button>
                      {showStartTimeList && (
                        <TimePopover
                          value={startTime}
                          onChange={handleStartTimeChange}
                          onClose={() => setShowStartTimeList(false)}
                          isDark={isDarkMode}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* End */}
                <div className={`flex items-center justify-between py-1.5 border-b ${isDarkMode ? 'border-white/[0.05]' : 'border-neutral-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 border ${isDarkMode ? 'border-white/22' : 'border-neutral-400'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>Kết thúc</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowEndCalendar(v => !v)
                          setShowStartCalendar(false)
                          setShowStartTimeList(false)
                          setShowEndTimeList(false)
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer ${
                          isDarkMode 
                            ? 'bg-white/[0.05] hover:bg-white/[0.10] border-white/10 text-white' 
                            : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                        }`}
                      >
                        {endDate ? formatDateVietnamese(endDate) : 'Chọn ngày'}
                      </button>
                      {showEndCalendar && (
                        <CalendarPopover
                          value={endDate}
                          onChange={setEndDate}
                          onClose={() => setShowEndCalendar(false)}
                          minDate={startDate}
                          isDark={isDarkMode}
                        />
                      )}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowEndTimeList(v => !v)
                          setShowStartCalendar(false)
                          setShowStartTimeList(false)
                          setShowEndCalendar(false)
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:border-orange-500/50 transition cursor-pointer ${
                          isDarkMode 
                            ? 'bg-white/[0.05] hover:bg-white/[0.10] border-white/10 text-white' 
                            : 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                        }`}
                      >
                        {endTime || 'Chọn giờ'}
                      </button>
                      {showEndTimeList && (
                        <TimePopover
                          value={endTime}
                          onChange={setEndTime}
                          onClose={() => setShowEndTimeList(false)}
                          showDuration={true}
                          startDateTimeStr={startDate && startTime ? `${startDate}T${startTime}` : undefined}
                          endDateStr={endDate}
                          isDark={isDarkMode}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* UX suggestion notice about Staff review safety margin */}
              {flowType === 'UNIVERSITY' && (
                <div className={`mb-2 px-3 py-2 border rounded-xl flex items-start gap-2 flex-shrink-0 animate-fadeIn ${
                  isDarkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-200'
                }`}>
                  <AlertCircle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className={`text-[10px] font-medium leading-normal ${isDarkMode ? 'text-orange-200/90' : 'text-orange-900'}`}>
                    <span className="text-orange-655 font-bold">Khuyên dùng:</span> Sự kiện trường cần Staff duyệt. Hãy cân nhắc đặt cách hiện tại <span className="text-orange-655 font-bold">36h - 48h</span> trở lên để Staff kịp tiếp nhận duyệt.
                  </p>
                </div>
              )}

              {/* ── Event format — translucent pill dock ── */}
              <div className="mb-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MapPin className={`w-3 h-3 ${isDarkMode ? 'text-white/40' : 'text-neutral-500'}`} />
                  <span className={`text-[9px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/50' : 'text-neutral-550'}`}>Hình thức</span>
                </div>
                <div className={`w-full backdrop-blur-md border rounded-xl p-1 flex gap-1 ${
                  isDarkMode ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-neutral-100 border-neutral-200'
                }`}>
                  {(['ONLINE', 'ONSITE', 'HYBRID'] as const).map(fmt => (
                    <button key={fmt} type="button" onClick={() => setEventFormat(fmt)}
                      className={`flex-1 text-center py-2 text-xs rounded-lg transition-all duration-200 cursor-pointer ${
                        eventFormat === fmt
                          ? `font-semibold shadow-lg ${isDarkMode ? 'text-white bg-white/[0.12] border-white/[0.10]' : 'text-neutral-800 bg-white border-neutral-300'}`
                          : `font-medium hover:text-orange-500 ${isDarkMode ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-700'}`
                      }`}
                    >
                      {fmt === 'ONLINE' ? 'Trực tuyến' : fmt === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                    </button>
                  ))}
                </div>

                {/* Online Platform Connectors — Visibly rendered for ONLINE and HYBRID formats */}
                {(eventFormat === 'ONLINE' || eventFormat === 'HYBRID') && (
                  <div className={`mt-2.5 backdrop-blur-md border rounded-xl p-3 animate-fadeIn flex flex-col gap-2 ${
                    isDarkMode ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-neutral-50 border-neutral-200'
                  }`}>
                    <div className={`flex items-center justify-between pb-1.5 border-b ${isDarkMode ? 'border-white/[0.05]' : 'border-neutral-200'}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>Nền tảng trực tuyến</span>
                      <div className={`flex gap-1 p-0.5 rounded-lg border ${isDarkMode ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-neutral-100 border-neutral-200'}`}>
                        {(['ZOOM', 'GOOGLE'] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setSelectedOnlinePlatform(p)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                              selectedOnlinePlatform === p
                                ? 'bg-[#fb923c] text-white shadow-md'
                                : isDarkMode
                                ? 'text-neutral-400 hover:text-white'
                                : 'text-neutral-500 hover:text-neutral-800'
                            }`}
                          >
                            {p === 'ZOOM' ? 'Zoom' : 'Google Meet'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedOnlinePlatform === 'ZOOM' ? (
                      connectedPlatforms.zoom.connected ? (
                        /* Connected Zoom */
                        <div className={`flex items-center justify-between border rounded-xl p-3 animate-fadeIn ${
                          isDarkMode ? 'bg-emerald-500/[0.04] border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
                        }`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                              <Check className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-neutral-800'}`}>Đã kết nối tài khoản Zoom</p>
                              <p className={`text-[10px] font-semibold truncate mt-0.5 ${isDarkMode ? 'text-emerald-400/90' : 'text-emerald-650'}`}>
                                {connectedPlatforms.zoom.email}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDisconnect('zoom')}
                            className={`text-[10px] font-bold transition duration-200 cursor-pointer shrink-0 ml-2 ${
                              isDarkMode ? 'text-white/30 hover:text-red-400' : 'text-neutral-400 hover:text-red-650'
                            }`}
                          >
                            Hủy kết nối
                          </button>
                        </div>
                      ) : (
                        /* Unconnected Zoom */
                        <div className={`flex flex-col gap-3 border rounded-xl p-3.5 animate-fadeIn ${
                          isDarkMode ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-neutral-50 border-neutral-200'
                        }`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              isDarkMode ? 'bg-[#2D8CFF]/10 border-[#2D8CFF]/20' : 'bg-[#2D8CFF]/8 border-[#2D8CFF]/30'
                            }`}>
                              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect width="24" height="24" rx="5" fill="#2D8CFF"/>
                                <path fillRule="evenodd" clipRule="evenodd" d="M5.5 8C5.5 7.17157 6.17157 6.5 7 6.5H13C13.8284 6.5 14.5 7.17157 14.5 8V11L18.5 8.5V15.5L14.5 13V16C14.5 16.8284 13.8284 17.5 13 17.5H7C6.17157 17.5 5.5 16.8284 5.5 16V8Z" fill="white"/>
                              </svg>
                            </div>
                            <div>
                              <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-neutral-800'}`}>Zoom Account Link</p>
                              <p className={`text-[10px] mt-1 leading-normal ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                Tự động thiết lập cuộc họp trực tuyến Zoom bảo mật cao cho sự kiện này.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isConnecting}
                            onClick={() => handleConnect('zoom')}
                            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isConnecting && selectedOnlinePlatform === 'ZOOM' ? 'Connecting Zoom...' : 'Connect Zoom Account'}
                          </button>
                        </div>
                      )
                    ) : (
                      connectedPlatforms.google.connected ? (
                        /* Connected Google Meet */
                        <div className={`flex items-center justify-between border rounded-xl p-3 animate-fadeIn ${
                          isDarkMode ? 'bg-emerald-500/[0.04] border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
                        }`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                              <Check className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-neutral-800'}`}>Đã kết nối Google Meet</p>
                              <p className={`text-[10px] font-semibold truncate mt-0.5 ${isDarkMode ? 'text-emerald-400/90' : 'text-emerald-650'}`}>
                                {connectedPlatforms.google.email}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDisconnect('google')}
                            className={`text-[10px] font-bold transition duration-200 cursor-pointer shrink-0 ml-2 ${
                              isDarkMode ? 'text-white/30 hover:text-red-400' : 'text-neutral-400 hover:text-red-650'
                            }`}
                          >
                            Hủy kết nối
                          </button>
                        </div>
                      ) : (
                        /* Unconnected Google Meet */
                        <div className={`flex flex-col gap-3 border rounded-xl p-3.5 animate-fadeIn ${
                          isDarkMode ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-neutral-50 border-neutral-200'
                        }`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              isDarkMode ? 'bg-white/[0.04] border-white/10' : 'bg-neutral-100 border-neutral-300'
                            }`}>
                              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M0 11.5v5c0 1.38 1.12 2.5 2.5 2.5h5L10 16.5l-2.5-5H0z" fill="#00832d" />
                                <path d="M0 5v6.5h7.5l2.5-5-2.5-4h-5C1.12 2.5 0 3.62 0 5z" fill="#0066da" />
                                <path d="M10 2.5L7.5 7.5l2.5 5 7-3.5v-6.5h-7z" fill="#2684fc" />
                                <path d="M17 9v6.5l7 3.5V5l-7 4z" fill="#00ac47" />
                                <path d="M10 12.5l-2.5 4v5h5c1.38 0 2.5-1.12 2.5-2.5v-6.5h-5z" fill="#ea4335" />
                                <path d="M17 2.5h-7v6.5h7v-6.5z" fill="#ffba00" />
                              </svg>
                            </div>
                            <div>
                              <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-neutral-800'}`}>Google Meet Connection</p>
                              <p className={`text-[10px] mt-1 leading-normal ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                Tạo link Google Meet trực tuyến bảo mật thông qua đồng bộ hóa lịch Google.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isConnecting}
                            onClick={() => handleConnect('google')}
                            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isConnecting && selectedOnlinePlatform === 'GOOGLE' ? 'Connecting Google Meet...' : 'Connect Google Meet Account'}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Location rows — Structured discrimination depending on flowType */}
                {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                  <div className="mt-2.5 animate-fadeIn space-y-3">
                    {flowType === 'UNIVERSITY' ? (
                      /* UNIVERSITY (School) flow: Structured dropdown select */
                      <div className={`backdrop-blur-md border rounded-xl p-3.5 flex flex-col gap-2.5 ${
                        isDarkMode ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-neutral-50 border-neutral-200'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-orange-400" />
                          <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>Phòng/Khu vực học đường</span>
                        </div>
                        <div className="relative">
                          <select
                            value={selectedCampusAreaId}
                            onFocus={handleCampusAreaFocus}
                            onChange={handleCampusAreaChange}
                            className={`w-full border rounded-xl p-2.5 pr-10 text-xs font-bold focus:outline-none focus:border-orange-500/50 appearance-none cursor-pointer ${
                              isDarkMode ? '!bg-[#18181b] !border-white/10 text-white' : '!bg-white !border-neutral-300 text-neutral-800'
                            }`}
                          >
                            <option value="" className="text-neutral-500">-- Chọn phòng / phòng hội thảo chính quy --</option>
                            {campusAreas.map(area => (
                              <option key={area.areaId} value={area.areaId} className={isDarkMode ? 'text-white bg-[#18181b]' : 'text-neutral-800 bg-white'}>
                                {area.areaName} ({area.floor || 'Tầng thường'} - Sức chứa: {area.capacity || 'N/A'} người)
                              </option>
                            ))}
                          </select>
                          <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                        {selectedCampusAreaId && (
                          <div className={`text-[10px] font-medium p-2 rounded-lg leading-relaxed border ${
                            isDarkMode ? 'text-neutral-400 bg-white/[0.02] border-white/[0.04]' : 'text-neutral-600 bg-neutral-100/50 border-neutral-200'
                          }`}>
                            <span className="text-orange-400 font-bold">Lựa chọn:</span> {formData.customVenueName} &middot; {formData.customLocation}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* INDEPENDENT (Free) flow: Custom text inputs */
                      <LocationAutocomplete
                        isDarkMode={isDarkMode}
                        language={currentLanguage}
                        venueName={formData.customVenueName}
                        location={formData.customLocation}
                        onVenueNameChange={(value) => setFormData((prev) => ({ ...prev, customVenueName: value }))}
                        onLocationChange={(value) => setFormData((prev) => ({ ...prev, customLocation: value }))}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── Description — borderless expandable ── */}
              <div className="mb-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenDescModal()
                  }}
                  className={`w-full flex items-start gap-2.5 py-1.5 border-b transition-colors text-left cursor-pointer ${
                    isDarkMode 
                      ? 'border-white/[0.07] text-white/50 hover:text-white/80' 
                      : 'border-neutral-200 text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <AlignLeft className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isDarkMode ? 'text-white/40' : 'text-neutral-550'}`} />
                  <div className="flex-1 min-w-0">
                    {formData.description ? (
                      <p className={`text-sm line-clamp-3 whitespace-pre-wrap ${isDarkMode ? 'text-white/80' : 'text-neutral-800'}`}>{formData.description}</p>
                    ) : (
                      <span className="text-sm font-medium">Thêm mô tả sự kiện...</span>
                    )}
                  </div>
                </button>
              </div>

              {flowType === 'INDEPENDENT' && (
                <div className="relative mb-2 flex-shrink-0">
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setTicketPopoverOpen(true)
                    }}
                    className={`flex items-center justify-between py-1.5 border-b px-1 rounded-lg transition-colors cursor-pointer ${
                      isDarkMode
                        ? 'border-white/[0.07] hover:bg-white/[0.02]'
                        : 'border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`flex items-center gap-2.5 ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>
                      <Ticket className={`w-3.5 h-3.5 flex-shrink-0 ${isDarkMode ? 'text-white/40' : 'text-neutral-500'}`} />
                      <span className="text-sm font-medium">Tickets</span>
                    </div>
                    <div className={`flex items-center gap-1.5 min-w-0 transition-colors ${
                      isDarkMode ? 'text-white/80 hover:text-white' : 'text-neutral-800 hover:text-neutral-900'
                    }`}>
                      <span className="text-sm font-semibold truncate">{getTicketSummary()}</span>
                      <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Capacity — borderless row with Popover ── */}
              <div className="relative mb-2 flex-shrink-0">
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    setCapacityPopoverOpen(v => !v)
                  }}
                  className={`flex items-center justify-between py-1.5 border-b px-1 rounded-lg transition-colors cursor-pointer ${
                    isDarkMode 
                      ? 'border-white/[0.07] hover:bg-white/[0.02]' 
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <div className={`flex items-center gap-2.5 ${isDarkMode ? 'text-white/50' : 'text-neutral-500'}`}>
                    <Users className={`w-3.5 h-3.5 flex-shrink-0 ${isDarkMode ? 'text-white/40' : 'text-neutral-500'}`} />
                    <span className="text-sm font-medium">Sức chứa tối đa</span>
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors ${
                    isDarkMode ? 'text-white/80 hover:text-white' : 'text-neutral-800 hover:text-neutral-900'
                  }`}>
                    <span className="text-sm font-semibold">
                      {formData.expectedParticipants ? `${formData.expectedParticipants} người` : 'Không giới hạn'}
                    </span>
                    <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                </div>

              </div>

              {/* ── Validation errors ── */}
              {(timeErrors.length > 0 || error) && (
                <div className={`mb-2 px-3.5 py-2 border rounded-xl flex items-start gap-2 flex-shrink-0 ${
                  isDarkMode 
                    ? 'bg-red-950/30 border-red-800/22' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isDarkMode ? 'text-red-400/80' : 'text-red-600'}`} />
                  <div className="space-y-0.5">
                    {timeErrors.slice(0, 2).map((e, i) => (
                      <p key={i} className={`text-[11px] font-medium leading-snug ${
                        isDarkMode ? 'text-red-300/80' : 'text-red-700'
                      }`}>{e}</p>
                    ))}
                    {error && <p className={`text-[11px] font-medium leading-snug ${
                      isDarkMode ? 'text-red-300/80' : 'text-red-700'
                    }`}>{error}</p>}
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
                  className={`w-full py-2 rounded-xl transition-colors font-medium text-sm cursor-pointer ${
                    isDarkMode ? 'text-white/50 hover:text-white' : 'text-neutral-550 hover:text-neutral-800'
                  }`}
                >
                  Hủy và quay lại
                </button>
              </div>
            </div>
          </form>

          {/* ══════════════════════════════════════════════
              Event Description Centered Modal
          ══════════════════════════════════════════════ */}
          {descOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setDescOpen(false)}>
              <div className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 transition-all duration-200 transform scale-100 ${
                isDarkMode ? 'bg-[#141416] border-white/[0.09] text-white' : 'bg-white border-neutral-200 text-neutral-850'
              }`} onClick={(e) => e.stopPropagation()}>
                <div className={`flex items-center justify-between pb-2.5 border-b ${isDarkMode ? 'border-white/[0.05]' : 'border-neutral-200'}`}>
                  <h3 className="text-sm font-black">Mô tả sự kiện</h3>
                  <button type="button" onClick={() => setDescOpen(false)} className={`w-7 h-7 flex items-center justify-center rounded-lg transition cursor-pointer ${
                    isDarkMode ? 'hover:bg-white/[0.08] text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800'
                  }`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={descBuffer}
                  onChange={(e) => setDescBuffer(e.target.value)}
                  placeholder="Nhập thông tin chi tiết về sự kiện của bạn..."
                  className={`w-full h-48 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500/50 resize-none border ${
                    isDarkMode 
                      ? '!bg-white/[0.03] !border-white/10 text-white placeholder-neutral-500' 
                      : '!bg-neutral-50 !border-neutral-300 text-neutral-800 placeholder-neutral-400'
                  }`}
                />
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDescOpen(false)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      isDarkMode 
                        ? 'bg-white/[0.05] border-white/10 text-white hover:bg-white/[0.08]' 
                        : 'bg-neutral-100 border-neutral-250 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, description: descBuffer }));
                      setDescOpen(false);
                    }}
                    className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            </div>
          )}

          {ticketPopoverOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setTicketPopoverOpen(false)}>
              <div
                className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col gap-5 transition-all duration-200 transform scale-100 ${
                  isDarkMode ? 'bg-[#141416] border-white/[0.09] text-white' : 'bg-white border-neutral-200 text-neutral-850'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-3xl font-black tracking-tight">Tickets</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Set ticket price before publishing.</p>
                  </div>
                  <button type="button" onClick={() => setTicketPopoverOpen(false)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition cursor-pointer ${
                    isDarkMode ? 'hover:bg-white/[0.08] text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800'
                  }`}>
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">Onsite ticket</span>
                      <button
                        type="button"
                        onClick={() => setTicketConfig(prev => ({ ...prev, onsiteFree: !prev.onsiteFree, onsitePrice: !prev.onsiteFree ? '0' : prev.onsitePrice }))}
                        className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex items-center px-0.5 ${
                          ticketConfig.onsiteFree ? 'bg-neutral-500' : 'bg-orange-600'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 transform ${ticketConfig.onsiteFree ? 'translate-x-0' : 'translate-x-5'}`} />
                      </button>
                    </div>
                    <label className={`block text-xs font-bold ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Price</label>
                    <div className={`flex items-center rounded-xl border overflow-hidden ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                      <input
                        type="number"
                        min="0"
                        max="100000000"
                        disabled={ticketConfig.onsiteFree}
                        value={ticketConfig.onsiteFree ? '0' : ticketConfig.onsitePrice}
                        onChange={(e) => setTicketConfig(prev => ({ ...prev, onsitePrice: e.target.value }))}
                        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-bold outline-none disabled:opacity-50"
                      />
                      <span className="px-4 text-sm font-bold">VND</span>
                    </div>
                  </div>
                )}

                {(eventFormat === 'ONLINE' || eventFormat === 'HYBRID') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">Online ticket</span>
                      <button
                        type="button"
                        onClick={() => setTicketConfig(prev => ({ ...prev, onlineFree: !prev.onlineFree, onlinePrice: !prev.onlineFree ? '0' : prev.onlinePrice }))}
                        className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex items-center px-0.5 ${
                          ticketConfig.onlineFree ? 'bg-neutral-500' : 'bg-orange-600'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 transform ${ticketConfig.onlineFree ? 'translate-x-0' : 'translate-x-5'}`} />
                      </button>
                    </div>
                    <label className={`block text-xs font-bold ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Price</label>
                    <div className={`flex items-center rounded-xl border overflow-hidden ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                      <input
                        type="number"
                        min="0"
                        max="100000000"
                        disabled={ticketConfig.onlineFree}
                        value={ticketConfig.onlineFree ? '0' : ticketConfig.onlinePrice}
                        onChange={(e) => setTicketConfig(prev => ({ ...prev, onlinePrice: e.target.value }))}
                        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-bold outline-none disabled:opacity-50"
                      />
                      <span className="px-4 text-sm font-bold">VND</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setTicketPopoverOpen(false)}
                  className="mx-auto mt-1 px-8 py-3 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-xl text-sm font-bold transition cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              Event Capacity Centered Modal
          ══════════════════════════════════════════════ */}
          {capacityPopoverOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setCapacityPopoverOpen(false)}>
              <div
                ref={capacityPopoverRef}
                className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 transition-all duration-200 transform scale-100 ${
                  isDarkMode ? 'bg-[#141416] border-white/[0.09] text-white' : 'bg-white border-neutral-200 text-neutral-850'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex items-center justify-between pb-2.5 border-b ${isDarkMode ? 'border-white/[0.05]' : 'border-neutral-200'}`}>
                  <h3 className="text-sm font-black">Sức chứa sự kiện</h3>
                  <button type="button" onClick={() => setCapacityPopoverOpen(false)} className={`w-7 h-7 flex items-center justify-center rounded-lg transition cursor-pointer ${
                    isDarkMode ? 'hover:bg-white/[0.08] text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800'
                  }`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Numeric Max Capacity Input */}
                <div className="flex flex-col gap-2.5">
                  <div className={`flex items-center justify-between py-2.5 border-b ${isDarkMode ? 'border-white/[0.05]' : 'border-neutral-200'}`}>
                    <span className="text-xs font-semibold opacity-70">Số lượng tối đa</span>
                    <input
                      type="number"
                      value={tempCapacity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        const maxRoomCap = getSelectedAreaCapacity()
                        let maxCap = 100
                        if (eventFormat === 'ONLINE') {
                          maxCap = 100
                        } else if (eventFormat === 'ONSITE') {
                          maxCap = maxRoomCap
                        } else if (eventFormat === 'HYBRID') {
                          maxCap = 100 + maxRoomCap
                        }
                        
                        if (isNaN(val) || val <= 0) {
                          setTempCapacity('')
                        } else if (val > maxCap) {
                          setTempCapacity(maxCap.toString())
                        } else {
                          setTempCapacity(val.toString())
                        }
                      }}
                      min="1"
                      className={`w-24 text-right !bg-transparent font-bold text-sm focus:outline-none border-b pb-0.5 ${
                        isDarkMode ? 'text-white border-white/10 focus:border-orange-500/50' : 'text-neutral-800 border-neutral-300 focus:border-orange-500/50'
                      }`}
                    />
                  </div>
                  {/* Helper text */}
                  <p className={`text-[10px] font-medium leading-relaxed italic ${isDarkMode ? 'text-neutral-400/80' : 'text-neutral-500'}`}>
                    {eventFormat === 'ONLINE' && 'Maximum 100 participants allowed per Zoom/Meet free policy'}
                    {eventFormat === 'ONSITE' && `Sức chứa tối đa của phòng học đường đã chọn: ${getSelectedAreaCapacity()} người.`}
                    {eventFormat === 'HYBRID' && `Sức chứa tối đa kết hợp: ${getSelectedAreaCapacity()} người tại chỗ và 100 người trực tuyến (tổng cộng ${100 + getSelectedAreaCapacity()} người).`}
                  </p>
                </div>


                {/* Footer Buttons */}
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setCapacityPopoverOpen(false)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      isDarkMode 
                        ? 'bg-white/[0.05] border-white/10 text-white hover:bg-white/[0.08]' 
                        : 'bg-neutral-100 border-neutral-250 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, expectedParticipants: tempCapacity }));
                      setCapacityPopoverOpen(false);
                    }}
                    className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            </div>
          )}
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
              
              {/* Drag & Drop Zone */}
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

              {/* Sample Grid */}
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
