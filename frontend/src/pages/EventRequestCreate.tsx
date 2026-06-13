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
  Clock,
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
   Cinema full-page CSS — makes the entire shell (header,
   sidebar, main) transparent so the fixed backdrop bleeds
   through everywhere. Targets HTML element types, works in
   both light and dark Layout themes.
───────────────────────────────────────────────────────────── */
const ERC_STYLE_ID = 'erc-cinema-fullpage-style'
const ERC_CSS = `
  html.erc-cinema body { background: #0c0c0d !important; }

  html.erc-cinema body > div > div[class*="min-h-screen"],
  html.erc-cinema body > div[class*="min-h-screen"],
  html.erc-cinema body > div > div > div[class*="min-h-screen"] {
    background: transparent !important;
  }

  /* Header — dark frosted glass */
  html.erc-cinema header {
    background: rgba(12, 12, 13, 0.72) !important;
    backdrop-filter: blur(28px) saturate(130%) !important;
    -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
    border-bottom-color: rgba(255,255,255,0.055) !important;
    box-shadow: none !important;
  }
  html.erc-cinema header,
  html.erc-cinema header * { color: rgba(255,255,255,0.92) !important; }
  html.erc-cinema header img { color: unset !important; }
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
    background: linear-gradient(to bottom right, #ea580c, #f97316) !important;
  }
  html.erc-cinema header [class*="text-orange"],
  html.erc-cinema header [class*="text-fpt"] { color: rgba(255,165,40,0.95) !important; }

  /* Sidebar — same dark glass */
  html.erc-cinema aside {
    background: rgba(12, 12, 13, 0.62) !important;
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

  /* Main — strip all constraints */
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

  /* Load sample banners */
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

  /* Cinema mode: inject/remove CSS + html class */
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

  /* Banner handlers */
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
    } finally { setIsUploading(false) }
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(p => ({ ...p, [name]: value }))
    if (name === 'preferredStart' || name === 'preferredEnd') {
      const nd = { ...formData, [name]: value }
      setTimeErrors(validateEventDateTime(nd.preferredStart, nd.preferredEnd).errors)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const cap = parseInt(formData.expectedParticipants)
    if (formData.expectedParticipants && (isNaN(cap) || cap < 10 || cap % 10 !== 0)) {
      setError('Số lượng phải tối thiểu 10 và là bội số của 10'); return
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

  const categories = ['ALL', ...Array.from(new Set(sampleBanners.map(b => b.category).filter(Boolean)))]
  const filteredBanners = selectedCategory === 'ALL' ? sampleBanners : sampleBanners.filter(b => b.category === selectedCategory)

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div className="h-full">

      {/* ══════════════════════════════════════════════
          STEP 1 — Flow Type Selector (native theme)
      ══════════════════════════════════════════════ */}
      {!flowType && (
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-8">
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-1.5">
                Tạo sự kiện mới
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Chọn loại hình sự kiện phù hợp để tiếp tục
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { type: 'UNIVERSITY' as const, icon: Building2, label: 'Sự Kiện Trường Học', sub: 'Gửi đề xuất, chờ phê duyệt' },
                { type: 'INDEPENDENT' as const, icon: Globe, label: 'Sự Kiện Tự Do', sub: 'Tự chủ địa điểm & thời gian' },
              ].map(({ type, icon: Icon, label, sub }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFlowType(type)}
                  className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 hover:bg-orange-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-orange-400 dark:hover:border-orange-500/50 shadow-sm transition-all duration-300 hover:-translate-y-0.5 text-center flex flex-col items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-white mb-0.5">{label}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{sub}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/dashboard/event-requests')}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 font-semibold transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 2 — Full Cinema Form
      ══════════════════════════════════════════════ */}
      {flowType && (
        <>
          {/* ── Fixed cinema backdrop ── */}
          <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden">
            <div className="absolute inset-0 bg-[#0c0c0d]" />
            {bannerUrl && (
              <div
                className="absolute -inset-[30%] opacity-[0.13] saturate-[105%] blur-[170px] scale-110 origin-center transition-all duration-[2000ms]"
                style={{ backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}
            <div className="absolute inset-0 bg-black/85" />
          </div>

          {/* ── Main form — padded container, fixed viewport height ── */}
          <form
            onSubmit={handleSubmit}
            className="relative z-10 flex gap-5 p-4 md:p-5"
            style={{ height: 'calc(100vh - 64px)' }}
          >

            {/* ══════════════════════════════════════════
                LEFT COLUMN — Square image + controls
            ══════════════════════════════════════════ */}
            <div className="hidden md:flex flex-col gap-3 w-full max-w-[340px] lg:max-w-[380px] flex-shrink-0">

              {/* Square image preview */}
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/60 flex-shrink-0 group">
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

                {/* Camera button — bottom-right */}
                <div className="absolute bottom-3 right-3 z-10">
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(v => !v)}
                    className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-md text-neutral-800 shadow-xl flex items-center justify-center hover:bg-white hover:scale-105 active:scale-95 transition-all"
                  >
                    <Camera className="w-4 h-4" />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
                      <div className="absolute bottom-11 right-0 z-20 bg-[#141416]/98 backdrop-blur-2xl border border-white/[0.09] rounded-xl overflow-hidden shadow-2xl w-44 py-1">
                        <button
                          type="button"
                          onClick={() => { setIsBannersModalOpen(true); setIsMenuOpen(false) }}
                          className="w-full text-left px-3.5 py-2 text-[11px] font-semibold text-neutral-300 hover:bg-white/[0.07] hover:text-white flex items-center gap-2 transition"
                        >
                          <LayoutGrid className="w-3.5 h-3.5 text-orange-400" /> Chọn ảnh mẫu
                        </button>
                        <label className="w-full text-left px-3.5 py-2 text-[11px] font-semibold text-neutral-300 hover:bg-white/[0.07] hover:text-white flex items-center gap-2 cursor-pointer transition">
                          <Upload className="w-3.5 h-3.5 text-orange-400" /> Tải ảnh lên
                          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleBannerUpload(e); setIsMenuOpen(false) }} />
                        </label>
                        {bannerUrl && (
                          <button
                            type="button"
                            onClick={() => { handleRemoveBanner(); setIsMenuOpen(false) }}
                            className="w-full text-left px-3.5 py-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/[0.09] flex items-center gap-2 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xoá ảnh
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Subtle bottom gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Sample banner toggle bar — below image */}
              <button
                type="button"
                onClick={() => setIsBannersModalOpen(true)}
                className="bg-white/[0.04] backdrop-blur-md border border-white/[0.09] rounded-xl p-3 text-white/60 hover:text-white/90 hover:bg-white/[0.07] text-xs flex items-center justify-between transition-all duration-200 flex-shrink-0"
              >
                <span className="font-medium">Chọn ảnh mẫu từ thư viện</span>
                <LayoutGrid className="w-3.5 h-3.5 text-orange-400/70" />
              </button>

              {/* Flow badge */}
              <div className="flex items-center justify-between flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setFlowType(null); setError(null); setTimeErrors([]) }}
                  className="flex items-center gap-1 text-white/35 hover:text-white/70 text-[11px] font-semibold transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Thay đổi loại hình
                </button>
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25 border border-white/[0.09] px-2 py-0.5 rounded-md">
                  {flowType === 'UNIVERSITY' ? 'Trường học' : 'Tự do'}
                </span>
              </div>
            </div>

            {/* ══════════════════════════════════════════
                RIGHT COLUMN — Floating form on canvas
            ══════════════════════════════════════════ */}
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
              <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto pt-8 md:pt-12 pb-2">

                {/* Mobile: back button */}
                <div className="flex md:hidden items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => { setFlowType(null); setError(null); setTimeErrors([]) }}
                    className="flex items-center gap-1 text-white/40 hover:text-white/75 text-[11px] font-semibold transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Thay đổi
                  </button>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/25 border border-white/[0.09] px-2 py-0.5 rounded-md">
                    {flowType === 'UNIVERSITY' ? 'Trường học' : 'Tự do'}
                  </span>
                </div>

                {/* ── Event Name — large ghost underline input ── */}
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  autoComplete="off"
                  placeholder="Tên sự kiện..."
                  className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-b border-white/[0.09] focus:border-orange-500/55 text-white placeholder-neutral-700 py-3 focus:outline-none w-full mb-7 transition-colors leading-tight"
                />

                {/* ── Time — borderless floating rows (Luma/Quickom style) ── */}
                <div className="mb-5">
                  {/* Start */}
                  <div className="flex items-center gap-3 py-3 border-b border-white/[0.07] group">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0 ml-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/28 mb-0.5">Bắt đầu</p>
                      {formData.preferredStart ? (
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-semibold text-white/90">{fmtDate(formData.preferredStart)}</span>
                          <span className="text-sm font-black text-orange-400">{fmtTime(formData.preferredStart)}</span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          name="preferredStart"
                          value={formData.preferredStart}
                          onChange={handleChange}
                          max="9999-12-31T23:59"
                          className="w-full bg-transparent text-white/50 text-sm font-medium focus:outline-none p-0 border-0 focus:text-white/80 transition-colors"
                        />
                      )}
                    </div>
                    {formData.preferredStart && (
                      <button type="button" onClick={() => setFormData(p => ({ ...p, preferredStart: '' }))} className="text-white/15 hover:text-white/50 transition flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* End */}
                  <div className="flex items-center gap-3 py-3 border-b border-white/[0.05] group">
                    <span className="w-1.5 h-1.5 rounded-full border border-white/20 flex-shrink-0 ml-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/28 mb-0.5">Kết thúc</p>
                      {formData.preferredEnd ? (
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-semibold text-white/90">{fmtDate(formData.preferredEnd)}</span>
                          <span className="text-sm font-black text-white/45">{fmtTime(formData.preferredEnd)}</span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          name="preferredEnd"
                          value={formData.preferredEnd}
                          onChange={handleChange}
                          max="9999-12-31T23:59"
                          className="w-full bg-transparent text-white/50 text-sm font-medium focus:outline-none p-0 border-0 focus:text-white/80 transition-colors"
                        />
                      )}
                    </div>
                    {formData.preferredEnd && (
                      <button type="button" onClick={() => setFormData(p => ({ ...p, preferredEnd: '' }))} className="text-white/15 hover:text-white/50 transition flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Event Format — translucent pill dock (Quickom-style) ── */}
                <div className="mb-5">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <MapPin className="w-3 h-3 text-white/25" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/25">Hình thức</span>
                  </div>

                  {/* Pill dock */}
                  <div className="w-full bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-xl p-1 flex gap-1 mb-3">
                    {(['ONLINE', 'ONSITE', 'HYBRID'] as const).map(fmt => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setEventFormat(fmt)}
                        className={`flex-1 text-center py-2 text-xs rounded-lg transition-all duration-200 ${
                          eventFormat === fmt
                            ? 'font-semibold text-white bg-white/[0.12] backdrop-blur-lg border border-white/[0.10] shadow-lg'
                            : 'font-medium text-neutral-400 hover:text-white bg-transparent'
                        }`}
                      >
                        {fmt === 'ONLINE' ? 'Trực tuyến' : fmt === 'ONSITE' ? 'Tại chỗ' : 'Kết hợp'}
                      </button>
                    ))}
                  </div>

                  {/* Location — borderless rows under format dock */}
                  {(eventFormat === 'ONSITE' || eventFormat === 'HYBRID') && (
                    <div>
                      <div className="py-2.5 border-b border-white/[0.07]">
                        <input
                          type="text"
                          name="customVenueName"
                          value={formData.customVenueName}
                          onChange={handleChange}
                          placeholder="Tên địa điểm tổ chức..."
                          className="w-full bg-transparent text-white/85 text-sm font-medium placeholder-white/22 focus:outline-none"
                        />
                      </div>
                      <div className="py-2.5 border-b border-white/[0.05]">
                        <input
                          type="text"
                          name="customLocation"
                          value={formData.customLocation}
                          onChange={handleChange}
                          placeholder="Địa chỉ chi tiết..."
                          className="w-full bg-transparent text-white/50 text-xs font-medium placeholder-white/18 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Description — borderless expandable row ── */}
                <div className="mb-4">
                  {!descOpen ? (
                    <button
                      type="button"
                      onClick={() => setDescOpen(true)}
                      className="w-full flex items-center gap-2.5 py-3 border-b border-white/[0.07] text-white/30 hover:text-white/60 transition-colors text-left group"
                    >
                      <AlignLeft className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-sm font-medium">Thêm mô tả sự kiện...</span>
                    </button>
                  ) : (
                    <div className="py-3 border-b border-white/[0.07] focus-within:border-orange-500/40 transition-colors">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlignLeft className="w-3 h-3 text-white/25" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/25">Mô tả</span>
                      </div>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        autoFocus
                        placeholder="Nội dung, diễn giả, hoạt động nổi bật..."
                        className="w-full bg-transparent text-white/80 text-sm font-medium placeholder-white/18 focus:outline-none resize-none leading-relaxed"
                      />
                    </div>
                  )}
                </div>

                {/* ── Settings — capacity borderless row ── */}
                <div className="mb-5 flex items-center justify-between py-3 border-b border-white/[0.07]">
                  <div className="flex items-center gap-2.5 text-white/35">
                    <Users className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-sm font-medium">Sức chứa tối đa</span>
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
                      className="w-32 text-right bg-transparent text-white/75 text-sm font-semibold placeholder-white/20 focus:outline-none border-b border-transparent focus:border-orange-500/40 transition-colors pb-0.5"
                    />
                    {formData.expectedParticipants && (
                      <span className="text-[10px] text-white/22 font-medium">người</span>
                    )}
                  </div>
                </div>

                {/* ── Validation errors ── */}
                {(timeErrors.length > 0 || error) && (
                  <div className="mb-3 px-3.5 py-3 bg-red-950/35 border border-red-800/25 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {timeErrors.slice(0, 2).map((e, i) => (
                        <p key={i} className="text-[11px] text-red-300/90 font-medium leading-snug">{e}</p>
                      ))}
                      {error && <p className="text-[11px] text-red-300/90 font-medium leading-snug">{error}</p>}
                    </div>
                  </div>
                )}

                {/* Push submit to bottom */}
                <div className="flex-1" />

                {/* ── Submit action bar ── */}
                <div className="space-y-2 pt-3 border-t border-white/[0.06]">
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-bold text-sm transition-all shadow-lg shadow-orange-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    className="w-full py-2 rounded-xl text-white/30 hover:text-white/60 transition-colors font-medium text-sm"
                  >
                    Hủy và quay lại
                  </button>
                </div>
              </div>
            </div>
          </form>
        </>
      )}

      {/* ══════════════════════════════════════════════
          Sample Banners Gallery Modal
      ══════════════════════════════════════════════ */}
      {isBannersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#141416] border border-white/[0.09] rounded-2xl w-full max-w-xl max-h-[76vh] flex flex-col shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-black text-white">Thư viện ảnh bìa</h3>
                <p className="text-[10px] text-neutral-500 mt-0.5">Chọn hình ảnh phù hợp với sự kiện</p>
              </div>
              <button type="button" onClick={() => setIsBannersModalOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-neutral-400 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category pills */}
            {categories.length > 1 && (
              <div className="px-5 py-2 border-b border-white/[0.05] flex gap-1.5 overflow-x-auto flex-shrink-0">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition ${
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

            {/* Image grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredBanners.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <ImageIcon className="w-9 h-9 text-neutral-700" />
                  <p className="text-xs text-neutral-500">Không có ảnh trong danh mục này</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredBanners.map(banner => (
                    <div
                      key={banner.bannerId}
                      onClick={() => handleSelectSampleBanner(banner.url)}
                      className="group relative aspect-[4/3] rounded-xl overflow-hidden cursor-pointer border border-white/[0.07] hover:border-orange-500/60 transition-all duration-200 shadow-sm"
                    >
                      <img src={banner.url} alt={banner.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
      )}
    </div>
  )
}
