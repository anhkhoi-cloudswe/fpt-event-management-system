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
  if (mins  <  60)   errors.push('Sự kiện phải kéo dài ít nhất 60 phút')

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
    background: rgba(12,12,13,0.72) !important;
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
`

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

  /* ── Auto-init start time to +30 min from now ── */
  useEffect(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 30, 0, 0)
    setFormData(p => ({ ...p, preferredStart: toLocalISO(d) }))
  }, [])

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
      if (name === 'preferredStart' || name === 'preferredEnd') {
        setTimeErrors(validateEventDateTime(nd.preferredStart, nd.preferredEnd, flowType).errors)
      }
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
            className="relative z-10 h-[calc(100vh-64px)] overflow-hidden flex items-center px-12 lg:px-20 max-w-[1500px] mx-auto gap-16 w-full pt-16 pb-6"
          >

            {/* ══════════════════════════════════════════
                LEFT COLUMN — Square cover + controls
            ══════════════════════════════════════════ */}
            <div className="w-[300px] md:w-[340px] lg:w-[370px] shrink-0 flex flex-col gap-3 overflow-hidden">

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

              {/* ── Shuffle random template button ── */}
              <button
                type="button"
                onClick={handleShuffleBanner}
                disabled={sampleBanners.length === 0}
                className="flex items-center justify-center gap-2 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] text-[11px] font-semibold transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Ảnh ngẫu nhiên
              </button>

              {/* ── Back link + flow badge ── */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setFlowType(null); setError(null); setTimeErrors([]) }}
                  className="flex items-center gap-1 text-white/50 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Thay đổi loại hình
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════════
                RIGHT COLUMN — Floating form canvas
            ══════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col justify-between py-2 overflow-hidden h-full min-w-0">

              {/* ── Header metadata row: flow label + visibility toggle ── */}
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
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
                      <div className="absolute right-0 mt-1.5 z-30 bg-[#141416] border border-white/10 rounded-xl overflow-hidden shadow-2xl w-32 py-1">
                        <button
                          type="button"
                          onClick={() => { setIsPublic(true); setShowPublicDropdown(false) }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-semibold flex items-center gap-2 transition cursor-pointer ${
                            isPublic ? 'text-orange-400 bg-white/[0.04]' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" /> Công khai
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsPublic(false); setShowPublicDropdown(false) }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-semibold flex items-center gap-2 transition cursor-pointer ${
                            !isPublic ? 'text-orange-400 bg-white/[0.04]' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" /> Riêng tư
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
                className="text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-b border-white/[0.09] focus:border-orange-500/55 text-white placeholder-neutral-500 py-3 focus:outline-none w-full mb-3 transition-colors leading-tight flex-shrink-0"
              />

              {/* ── Time — borderless rows ── */}
              <div className="mb-3 flex-shrink-0">
                {/* Start */}
                <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.07]">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0 ml-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50 mb-0.5">Bắt đầu</p>
                    {formData.preferredStart ? (
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold text-white/90">{fmtDate(formData.preferredStart)}</span>
                        <span className="text-sm font-black text-orange-400">{fmtTime(formData.preferredStart)}</span>
                      </div>
                    ) : (
                      <input type="datetime-local" name="preferredStart" value={formData.preferredStart}
                        onChange={handleChange} max="9999-12-31T23:59"
                        className="w-full bg-transparent text-white/50 text-sm font-medium focus:outline-none p-0 border-0 focus:text-white/80 transition-colors" />
                    )}
                  </div>
                  {formData.preferredStart && (
                    <button type="button" onClick={() => setFormData(p => ({ ...p, preferredStart: '' }))}
                      className="text-white/15 hover:text-white/50 transition flex-shrink-0 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* End */}
                <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.05]">
                  <span className="w-1.5 h-1.5 rounded-full border border-white/22 flex-shrink-0 ml-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50 mb-0.5">Kết thúc</p>
                    {formData.preferredEnd ? (
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold text-white/90">{fmtDate(formData.preferredEnd)}</span>
                        <span className="text-sm font-black text-white/50">{fmtTime(formData.preferredEnd)}</span>
                      </div>
                    ) : (
                      <input type="datetime-local" name="preferredEnd" value={formData.preferredEnd}
                        onChange={handleChange} max="9999-12-31T23:59"
                        className="w-full bg-transparent text-white/50 text-sm font-medium focus:outline-none p-0 border-0 focus:text-white/80 transition-colors" />
                    )}
                  </div>
                  {formData.preferredEnd && (
                    <button type="button" onClick={() => setFormData(p => ({ ...p, preferredEnd: '' }))}
                      className="text-white/15 hover:text-white/50 transition flex-shrink-0 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Event format — translucent pill dock ── */}
              <div className="mb-3 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-2">
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
                    <div className="py-2 border-b border-white/[0.07]">
                      <input type="text" name="customVenueName" value={formData.customVenueName} onChange={handleChange}
                        placeholder="Tên địa điểm tổ chức..."
                        className="w-full bg-transparent text-white/85 text-sm font-medium placeholder-neutral-500 focus:outline-none" />
                    </div>
                    <div className="py-2 border-b border-white/[0.05]">
                      <input type="text" name="customLocation" value={formData.customLocation} onChange={handleChange}
                        placeholder="Địa chỉ chi tiết..."
                        className="w-full bg-transparent text-white/60 text-xs font-medium placeholder-neutral-500 focus:outline-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Description — borderless expandable ── */}
              <div className="mb-3 flex-shrink-0">
                {!descOpen ? (
                  <button type="button" onClick={() => setDescOpen(true)}
                    className="w-full flex items-center gap-2.5 py-2.5 border-b border-white/[0.07] text-white/50 hover:text-white/80 transition-colors text-left cursor-pointer">
                    <AlignLeft className="w-3.5 h-3.5 flex-shrink-0 text-white/40" />
                    <span className="text-sm font-medium">Thêm mô tả sự kiện...</span>
                  </button>
                ) : (
                  <div className="py-2.5 border-b border-white/[0.07]">
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
              <div className="mb-3 flex items-center justify-between py-2.5 border-b border-white/[0.07] flex-shrink-0">
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
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06] flex-shrink-0">
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
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={() => { handleRemoveBanner(); setIsCoverModalOpen(false) }}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Xoá ảnh
                  </button>
                )}
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

