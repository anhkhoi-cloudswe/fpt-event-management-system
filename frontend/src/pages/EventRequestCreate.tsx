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
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { uploadEventBanner, deleteEventBanner, validateImageFile } from '../utils/imageUpload'

/* ─────────────────────────────────────────────────────────────
   DateTime Validation
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
  const sd = startTime.toLocaleDateString('en-CA')
  const ed = endTime.toLocaleDateString('en-CA')
  if (sd !== ed) errors.push('Sự kiện phải diễn ra trong cùng một ngày')
  const mins = (endTime.getTime() - startTime.getTime()) / 60000
  if (mins < 60) errors.push('Sự kiện phải kéo dài ít nhất 60 phút')
  if (mins > 18 * 60) errors.push('Sự kiện không được kéo dài quá 18 giờ')
  const hoursAway = (startTime.getTime() - now.getTime()) / 3600000
  if (hoursAway < 24) errors.push('Cần lên lịch trước ít nhất 24 giờ')
  if (hoursAway > 365 * 24) errors.push('Không được lên lịch quá 365 ngày')
  const sh = startTime.getHours(), sm = startTime.getMinutes()
  if (sh < 7 || sh > 21 || (sh === 21 && sm > 0)) errors.push('Giờ bắt đầu: 07:00 – 21:00')
  const eh = endTime.getHours(), em = endTime.getMinutes()
  if (eh > 21 || (eh === 21 && em > 0)) errors.push('Cần kết thúc trước 21:00')
  return { valid: errors.length === 0, errors }
}

/* ─────────────────────────────────────────────────────────────
   Format helpers
───────────────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + ':00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + ':00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/* ─────────────────────────────────────────────────────────────
   Cinema full-page CSS
   Targets header/aside/main by element type so it works
   regardless of whether Layout is in light or dark mode.
───────────────────────────────────────────────────────────── */
const ERC_STYLE_ID = 'erc-cinema-fullpage-style'
const ERC_CSS = `
  /* Base page background */
  html.erc-cinema body { background: #0b0b0b !important; }

  /* Layout root div (min-h-screen) — make transparent so backdrop shows through */
  html.erc-cinema body > div > div[class*="min-h-screen"],
  html.erc-cinema body > div[class*="min-h-screen"],
  html.erc-cinema body > div > div > div[class*="min-h-screen"] { background: transparent !important; }

  /* Header — ghost glass on top of dark backdrop */
  html.erc-cinema header {
    background: rgba(11, 11, 11, 0.55) !important;
    backdrop-filter: blur(32px) saturate(140%) !important;
    -webkit-backdrop-filter: blur(32px) saturate(140%) !important;
    border-bottom-color: rgba(255, 255, 255, 0.05) !important;
    box-shadow: none !important;
  }
  /* Header text — bright white, readable on very dark */
  html.erc-cinema header,
  html.erc-cinema header * { color: rgba(255, 255, 255, 0.90) !important; }
  html.erc-cinema header img { color: unset !important; }
  /* Preserve orange accent on logo text */
  html.erc-cinema header [class*="text-orange"],
  html.erc-cinema header [class*="text-fpt"] { color: rgba(255, 165, 40, 0.92) !important; }

  /* Desktop Sidebar — same dark glass */
  html.erc-cinema aside {
    background: rgba(11, 11, 11, 0.50) !important;
    backdrop-filter: blur(32px) saturate(140%) !important;
    -webkit-backdrop-filter: blur(32px) saturate(140%) !important;
    border-right-color: rgba(255, 255, 255, 0.05) !important;
    border-bottom-color: rgba(255, 255, 255, 0.05) !important;
    box-shadow: none !important;
  }
  /* Sidebar text — comfortably readable muted white */
  html.erc-cinema aside,
  html.erc-cinema aside * { color: rgba(255, 255, 255, 0.62) !important; }
  /* Sidebar links — transparent backgrounds */
  html.erc-cinema aside a,
  html.erc-cinema aside button { background: transparent !important; border-color: transparent !important; }
  html.erc-cinema aside a:hover,
  html.erc-cinema aside button:hover { background: rgba(255,255,255,0.06) !important; }
  html.erc-cinema aside a:hover *,
  html.erc-cinema aside button:hover * { color: rgba(255, 255, 255, 0.85) !important; }

  /* Main layout — strip the content wrapper constraints */
  html.erc-cinema main { overflow: hidden !important; }
  html.erc-cinema main > div {
    background: transparent !important;
    padding: 0 !important;
    max-width: 100% !important;
    height: 100% !important;
  }
`

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
export default function EventRequestCreate() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [flowType, setFlowType] = useState<'UNIVERSITY' | 'INDEPENDENT' | null>(null)
  const [eventFormat, setEventFormat] = useState<'ONLINE' | 'ONSITE' | 'HYBRID'>('ONSITE')
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

  const [bannerUrl, setBannerUrl] = useState('')
  const [sampleBanners, setSampleBanners] = useState<any[]>([])
  const [isBannersModalOpen, setIsBannersModalOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeErrors, setTimeErrors] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Load sample banners on mount ── */
  useEffect(() => {
    fetch('/api/sample-banners')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any[] | null) => {
        if (data?.length) {
          setSampleBanners(data)
          setBannerUrl(data[Math.floor(Math.random() * data.length)].url)
        }
      })
      .catch(() => {})
  }, [])

  /* ── Cinema full-page mode: activate when form step is entered ── */
  useEffect(() => {
    if (flowType) {
      /* Inject CSS */
      if (!document.getElementById(ERC_STYLE_ID)) {
        const style = document.createElement('style')
        style.id = ERC_STYLE_ID
        style.textContent = ERC_CSS
        document.head.appendChild(style)
      }
      document.documentElement.classList.add('erc-cinema')
    } else {
      /* Remove CSS */
      document.documentElement.classList.remove('erc-cinema')
      document.getElementById(ERC_STYLE_ID)?.remove()
    }
    return () => {
      document.documentElement.classList.remove('erc-cinema')
      document.getElementById(ERC_STYLE_ID)?.remove()
    }
  }, [flowType])

  /* ── Banner handlers ── */
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const v = validateImageFile(file)
    if (!v.valid) { showToast('error', v.error || 'Ảnh không hợp lệ'); return }
    setIsUploading(true)
    try {
      if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
      setBannerUrl(await uploadEventBanner(file))
      showToast('success', 'Đã tải lên ảnh bìa!')
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi tải ảnh')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSelectSampleBanner = async (url: string) => {
    if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    setBannerUrl(url)
    setIsBannersModalOpen(false)
  }

  const handleRemoveBanner = async () => {
    if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    setBannerUrl('')
  }

  const handleCancel = async () => {
    if (bannerUrl?.includes('/uploads/')) await deleteEventBanner(bannerUrl)
    navigate('/dashboard/event-requests')
  }

  /* ── Form field handler ── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((p) => ({ ...p, [name]: value }))
    if (name === 'preferredStart' || name === 'preferredEnd') {
      const nd = { ...formData, [name]: value }
      setTimeErrors(validateEventDateTime(nd.preferredStart, nd.preferredEnd).errors)
    }
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
    const tv = validateEventDateTime(formData.preferredStart, formData.preferredEnd)
    if (!tv.valid) { setError(tv.errors.join(' · ')); return }

    setIsSubmitting(true)
    try {
      const fmt = (s: string) => (s ? s + ':00' : null)
      const body = {
        title: formData.title,
        description: formData.description || null,
        preferredStartTime: fmt(formData.preferredStart),
        preferredEndTime: fmt(formData.preferredEnd),
        expectedCapacity: cap || 0,
        eventFormat,
        customVenueName: eventFormat !== 'ONLINE' ? formData.customVenueName || null : null,
        customLocation: eventFormat !== 'ONLINE' ? formData.customLocation || null : null,
        bannerUrl: bannerUrl || null,
      }
      const url =
        flowType === 'UNIVERSITY' ? '/api/event-requests' : '/api/events/independent'
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
      showToast(
        'success',
        flowType === 'UNIVERSITY'
          ? 'Đã gửi đề xuất thành công!'
          : 'Sự kiện đã được tạo thành công!',
      )
      navigate('/dashboard/event-requests')
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  const categories = [
    'ALL',
    ...Array.from(new Set(sampleBanners.map((b) => b.category).filter(Boolean))),
  ]
  const filteredBanners =
    selectedCategory === 'ALL'
      ? sampleBanners
      : sampleBanners.filter((b) => b.category === selectedCategory)

  /* ─────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="h-full">

      {/* ══════════════════════════════════════════════════════════
          STEP 1 — Option Selector (native light/dark theme)
      ══════════════════════════════════════════════════════════ */}
      {!flowType && (
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-8">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-8 flex flex-col items-center">
            <h1 className="text-2xl font-black mb-1.5 tracking-tight text-center text-slate-900 dark:text-white">
              Tạo sự kiện mới
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-8 text-center font-medium">
              Chọn loại hình sự kiện để tiếp tục
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
              {[
                {
                  type: 'UNIVERSITY' as const,
                  icon: Building2,
                  label: 'Sự Kiện Trường Học',
                  sub: 'Cần phê duyệt từ ban quản lý',
                },
                {
                  type: 'INDEPENDENT' as const,
                  icon: Globe,
                  label: 'Sự Kiện Tự Do',
                  sub: 'Tự chọn địa điểm, duyệt ngay',
                },
              ].map(({ type, icon: Icon, label, sub }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFlowType(type)}
                  className="group cursor-pointer p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:bg-orange-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-orange-400 dark:hover:border-orange-500/60 shadow-sm transition-all duration-300 transform hover:-translate-y-1 text-center flex flex-col items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 transition">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black mb-1 text-slate-800 dark:text-white">{label}</h2>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{sub}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigate('/dashboard/event-requests')}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-orange-600 font-bold transition flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Quay lại danh sách
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 2 — Cinema Full-Page Form (Luma / Quickom inspired)
      ══════════════════════════════════════════════════════════ */}
      {flowType && (
        <>
          {/* ── FIXED cinema backdrop — covers ENTIRE viewport including header & sidebar ── */}
          <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden">
            {/* Deep base — near-black */}
            <div className="absolute inset-0 bg-[#0b0b0b]" />
            {/* Blurred banner — barely-visible color tint, Luma-style */}
            {bannerUrl && (
              <div
                className="absolute -inset-[30%] opacity-[0.14] saturate-[110%] blur-[160px] scale-110 origin-center transition-all duration-1500"
                style={{
                  backgroundImage: `url(${bannerUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}
            {/* Heavy dark blanket — owns 84% of the visual; only a whisper of color bleeds through */}
            <div className="absolute inset-0 bg-black/84" />
            {/* Very subtle bottom vignette */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/28" />
          </div>

          {/* ── Two-column form — sits above backdrop ── */}
          <form
            onSubmit={handleSubmit}
            className="relative z-10 flex flex-col md:flex-row h-full"
          >

            {/* ────────────── LEFT: Banner Image ────────────── */}
            <div className="relative flex-shrink-0 h-64 w-full md:h-full md:w-[38%] md:max-w-[440px] overflow-hidden">
              {/* Banner image */}
              {bannerUrl ? (
                <img
                  src={bannerUrl}
                  alt="Event Banner"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-neutral-900/40 flex flex-col items-center justify-center gap-3">
                  <ImageIcon className="w-12 h-12 text-white/12" />
                  <p className="text-xs text-white/25 font-medium">Chưa có ảnh bìa</p>
                </div>
              )}

              {/* Bottom gradient fade */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />
              {/* Right edge fade → seamless blend into dark form area */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-black/55 pointer-events-none hidden md:block" />

              {/* Upload overlay */}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm z-10">
                  <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" />
                </div>
              )}

              {/* Camera action button — bottom right */}
              <div className="absolute bottom-5 right-5 z-10">
                <button
                  type="button"
                  aria-label="Quản lý ảnh bìa"
                  onClick={() => setIsMenuOpen((v) => !v)}
                  className="w-10 h-10 rounded-full bg-white text-neutral-900 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>

                {isMenuOpen && (
                  <>
                    {/* Click-away dismiss */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {/* Menu */}
                    <div className="absolute bottom-12 right-0 z-20 bg-neutral-950/97 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl w-46 py-1">
                      <button
                        type="button"
                        onClick={() => { setIsBannersModalOpen(true); setIsMenuOpen(false) }}
                        className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-neutral-200 hover:bg-white/8 hover:text-white flex items-center gap-2.5 transition"
                      >
                        <LayoutGrid className="w-3.5 h-3.5 text-orange-400" />
                        Chọn ảnh mẫu
                      </button>
                      <label className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-neutral-200 hover:bg-white/8 hover:text-white flex items-center gap-2.5 cursor-pointer transition">
                        <Upload className="w-3.5 h-3.5 text-orange-400" />
                        Tải ảnh lên
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { handleBannerUpload(e); setIsMenuOpen(false) }}
                        />
                      </label>
                      {bannerUrl && (
                        <button
                          type="button"
                          onClick={() => { handleRemoveBanner(); setIsMenuOpen(false) }}
                          className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ────────────── RIGHT: Form Fields ────────────── */}
            <div className="flex-1 overflow-y-auto min-h-0 min-w-0 bg-black/12">
              <div className="flex flex-col min-h-full px-6 sm:px-8 md:px-10 py-6">

                {/* Back + flow badge */}
                <div className="flex justify-between items-center mb-5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setFlowType(null); setError(null); setTimeErrors([]) }}
                    className="flex items-center gap-1 text-white/45 hover:text-white/80 text-[11px] font-bold transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Thay đổi loại hình
                  </button>
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/35 border border-white/10 px-2.5 py-1 rounded-lg">
                    {flowType === 'UNIVERSITY' ? 'Sự kiện trường học' : 'Sự kiện tự do'}
                  </span>
                </div>

                {/* ── EVENT NAME — giant ghost input (Luma-style) ── */}
                <div className="mb-5 flex-shrink-0">
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    autoComplete="off"
                    placeholder="Tên sự kiện..."
                    className="w-full bg-transparent border-0 text-[1.9rem] leading-tight font-black text-white placeholder-white/18 focus:outline-none"
                  />
                  <div className="h-px mt-2.5 bg-white/8" />
                </div>

                {/* ── START / END — Quickom timeline style ── */}
                <div className="mb-3 bg-white/[0.05] border border-white/[0.07] rounded-2xl overflow-hidden flex-shrink-0">
                  {/* Start row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] font-bold text-white/35 uppercase tracking-widest mb-0.5">
                        Bắt đầu
                      </p>
                      {formData.preferredStart ? (
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-black text-white">
                            {fmtDate(formData.preferredStart)}
                          </span>
                          <span className="text-base font-black text-orange-400">
                            {fmtTime(formData.preferredStart)}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          name="preferredStart"
                          value={formData.preferredStart}
                          onChange={handleChange}
                          max="9999-12-31T23:59"
                          className="w-full bg-transparent border-0 text-white/60 text-sm font-semibold focus:ring-0 outline-none p-0"
                        />
                      )}
                    </div>
                    {formData.preferredStart && (
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, preferredStart: '' }))}
                        className="text-white/20 hover:text-white/55 transition flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Connector */}
                  <div className="flex px-4">
                    <span className="flex flex-col items-center w-2.5 mr-3 flex-shrink-0">
                      <div className="w-px h-3 bg-white/10" />
                    </span>
                    <div className="flex-1 h-px bg-white/5 mt-1" />
                  </div>

                  {/* End row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-white/28 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] font-bold text-white/35 uppercase tracking-widest mb-0.5">
                        Kết thúc
                      </p>
                      {formData.preferredEnd ? (
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-black text-white">
                            {fmtDate(formData.preferredEnd)}
                          </span>
                          <span className="text-base font-black text-white/52">
                            {fmtTime(formData.preferredEnd)}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          name="preferredEnd"
                          value={formData.preferredEnd}
                          onChange={handleChange}
                          max="9999-12-31T23:59"
                          className="w-full bg-transparent border-0 text-white/60 text-sm font-semibold focus:ring-0 outline-none p-0"
                        />
                      )}
                    </div>
                    {formData.preferredEnd && (
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, preferredEnd: '' }))}
                        className="text-white/20 hover:text-white/55 transition flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── EVENT FORMAT + Location (inline, Quickom-style) ── */}
                <div className="mb-3 bg-white/[0.05] border border-white/[0.07] rounded-2xl overflow-hidden flex-shrink-0">
                  <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                    <MapPin className="w-3.5 h-3.5 text-orange-400/55" />
                    <span className="text-[8px] font-bold text-white/35 uppercase tracking-widest">
                      Hình thức sự kiện
                    </span>
                  </div>
                  <div className="flex gap-1 px-3 pb-3">
                    {(['ONLINE', 'ONSITE', 'HYBRID'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setEventFormat(fmt)}
                        className={`flex-1 py-2 rounded-xl font-black text-[11px] transition-all duration-200 ${
                          eventFormat === fmt
                            ? 'bg-orange-600 text-white shadow-sm shadow-orange-950/50'
                            : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/80'
                        }`}
                      >
                        {fmt === 'ONLINE' ? 'Trực tuyến' : fmt === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                      </button>
                    ))}
                  </div>

                  {/* Location — slides in when ONSITE or HYBRID */}
                  {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                    <div className="border-t border-white/5 px-4 py-3 space-y-2">
                      <input
                        type="text"
                        name="customVenueName"
                        value={formData.customVenueName}
                        onChange={handleChange}
                        placeholder="Tên địa điểm tổ chức..."
                        className="w-full bg-transparent text-white text-sm font-semibold placeholder-white/22 border-b border-white/8 focus:border-orange-500/55 focus:outline-none pb-2 transition-colors"
                      />
                      <input
                        type="text"
                        name="customLocation"
                        value={formData.customLocation}
                        onChange={handleChange}
                        placeholder="Địa chỉ chi tiết..."
                        className="w-full bg-transparent text-white/52 text-xs font-medium placeholder-white/18 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* ── DESCRIPTION — expandable like Luma ── */}
                <div className="mb-3 bg-white/[0.05] border border-white/[0.07] rounded-2xl overflow-hidden flex-shrink-0">
                  {!descOpen ? (
                    <button
                      type="button"
                      onClick={() => setDescOpen(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white/38 hover:text-white/65 transition text-left group"
                    >
                      <AlignLeft className="w-4 h-4 flex-shrink-0 group-hover:text-orange-400/70 transition" />
                      <span className="text-sm font-medium">Thêm mô tả sự kiện...</span>
                    </button>
                  ) : (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlignLeft className="w-3.5 h-3.5 text-orange-400/55" />
                        <span className="text-[8px] font-bold text-white/35 uppercase tracking-widest">
                          Mô tả
                        </span>
                      </div>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        autoFocus
                        placeholder="Nội dung chính, diễn giả, hoạt động đặc sắc của sự kiện..."
                        className="w-full bg-transparent text-white text-sm font-medium placeholder-white/18 focus:ring-0 outline-none resize-none leading-relaxed"
                      />
                    </div>
                  )}
                </div>

                {/* ── SETTINGS ── */}
                <div className="mb-3 flex-shrink-0">
                  <p className="text-[8px] font-bold text-white/25 uppercase tracking-[0.2em] mb-2 px-0.5">
                    Cài đặt
                  </p>
                  <div className="bg-white/[0.05] border border-white/[0.07] rounded-2xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-white/32" />
                      <span className="text-sm font-semibold text-white/58">Sức chứa tối đa</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        name="expectedParticipants"
                        value={formData.expectedParticipants}
                        onChange={handleChange}
                        min="10"
                        step="10"
                        placeholder="Không giới hạn"
                        className="w-28 text-right bg-transparent text-white text-sm font-black placeholder-white/22 focus:outline-none border-b border-transparent focus:border-orange-500/50 transition-colors pb-0.5"
                      />
                      {formData.expectedParticipants && (
                        <span className="text-[10px] text-white/28 font-medium">người</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Errors ── */}
                {(timeErrors.length > 0 || error) && (
                  <div className="mb-3 p-3 bg-red-950/40 border border-red-900/30 rounded-2xl flex items-start gap-2 flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      {timeErrors.length > 0 && (
                        <p className="text-[10px] text-red-300 font-medium leading-relaxed">
                          {timeErrors.slice(0, 2).join(' · ')}
                        </p>
                      )}
                      {error && (
                        <p className="text-[10px] text-red-300 font-medium leading-relaxed mt-0.5">
                          {error}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Spacer — pushes submit to bottom */}
                <div className="flex-1" />

                {/* ── SUBMIT — full-width like Luma/Quickom ── */}
                <div className="pt-4 border-t border-white/5 flex flex-col gap-2 flex-shrink-0 mt-3">
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-black text-sm transition-all shadow-xl shadow-orange-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full py-2.5 rounded-2xl text-white/38 hover:text-white/65 transition font-semibold text-sm"
                  >
                    Hủy và quay lại
                  </button>
                </div>
              </div>
            </div>
          </form>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          SAMPLE BANNERS GALLERY MODAL
      ══════════════════════════════════════════════════════════ */}
      {isBannersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[78vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black text-sm text-white">Thư viện ảnh bìa</h3>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  Chọn hình ảnh cho sự kiện của bạn
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBannersModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category filters */}
            {categories.length > 1 && (
              <div className="px-5 py-2 border-b border-white/8 flex gap-2 overflow-x-auto bg-black/20 flex-shrink-0">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap transition ${
                      selectedCategory === cat
                        ? 'bg-orange-600 text-white'
                        : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {cat === 'ALL' ? 'Tất cả' : cat}
                  </button>
                ))}
              </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5">
              {filteredBanners.length === 0 ? (
                <div className="text-center py-10">
                  <ImageIcon className="w-10 h-10 text-neutral-700 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">Không có ảnh trong danh mục này</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredBanners.map((banner) => (
                    <div
                      key={banner.bannerId}
                      onClick={() => handleSelectSampleBanner(banner.url)}
                      className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer border border-white/10 hover:border-orange-500 transition duration-300 shadow-sm"
                    >
                      <img
                        src={banner.url}
                        alt={banner.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2.5">
                        <span className="text-white text-[9px] font-black truncate">
                          {banner.title}
                        </span>
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
