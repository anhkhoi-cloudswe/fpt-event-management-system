import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Maximize2, Minimize2, Copy, Check, ExternalLink, Sparkles } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import fptLogo from '../../assets/fpt-logo.png'

interface EventCheckoutSlideModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: number
  eventTitle?: string
  startTime?: string
  endTime?: string
}

export default function EventCheckoutSlideModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
}: EventCheckoutSlideModalProps) {
  const { currentLanguage } = useAuth()
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const lang = currentLanguage === 'en' ? 'en' : 'vi'
  const checkoutUrl = `${window.location.origin}/attendance/confirm?eventId=${eventId}&action=checkout`

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  if (!isOpen) return null

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(checkoutUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      console.error('Failed to copy', err)
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-amber-50/90 via-orange-50/60 to-white dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 rounded-3xl border border-orange-200/60 dark:border-white/10 shadow-2xl p-6 sm:p-10 flex flex-col items-center text-center">
        
        {/* Top Control Buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
            title={isFullscreen ? (lang === 'en' ? 'Exit Fullscreen' : 'Thoát toàn màn hình') : (lang === 'en' ? 'Fullscreen' : 'Toàn màn hình')}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-rose-600 dark:text-neutral-400 dark:hover:text-rose-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Branding Logo & Header */}
        <div className="flex items-center gap-3 mb-2">
          <img src={fptLogo} alt="FEMS Logo" className="h-10 sm:h-12 w-auto object-contain" />
          <div className="text-left">
            <span className="text-xs font-black uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> FEMS ALL-IN-ONE
            </span>
            <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium">Event Management System</p>
          </div>
        </div>

        {/* Big Catchy Title matching Image 2 */}
        <h1 className="mt-4 text-2xl sm:text-4xl font-black uppercase tracking-tight text-orange-600 dark:text-orange-400">
          CHECK OUT, EVENT FEEDBACK
        </h1>

        {eventTitle && (
          <p className="mt-1 text-sm sm:text-base font-semibold text-slate-700 dark:text-neutral-300 max-w-lg line-clamp-2">
            {eventTitle}
          </p>
        )}

        {/* Big High-Res QR Code Card */}
        <div className="mt-6 p-5 sm:p-7 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-orange-300 dark:border-orange-500/30 shadow-xl shadow-orange-500/10 flex flex-col items-center">
          <div className="p-3 bg-white rounded-2xl shadow-inner border border-slate-100">
            <QRCodeSVG
              value={checkoutUrl}
              size={260}
              level="H"
              includeMargin={true}
              imageSettings={{
                src: fptLogo,
                x: undefined,
                y: undefined,
                height: 38,
                width: 38,
                excavate: true,
              }}
            />
          </div>

          <p className="mt-4 text-xs sm:text-sm font-bold text-slate-600 dark:text-neutral-400 tracking-wide uppercase">
            {lang === 'en' ? 'Scan with camera or QR reader' : 'Quét mã bằng Camera điện thoại để điểm danh'}
          </p>
        </div>

        {/* Copy Link & Action Bar */}
        <div className="mt-6 w-full max-w-md flex flex-col sm:flex-row items-center gap-2">
          <div className="w-full flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-600 dark:text-neutral-400 truncate text-left">
            {checkoutUrl}
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> {lang === 'en' ? 'Copied!' : 'Đã sao chép'}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> {lang === 'en' ? 'Copy Link' : 'Sao chép link'}
              </>
            )}
          </button>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-white/10 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> {lang === 'en' ? 'Open Form' : 'Mở Form'}
          </a>
        </div>

        {/* Instructions */}
        <p className="mt-4 text-[11px] text-slate-400 dark:text-neutral-500 max-w-md">
          {lang === 'en'
            ? '💡 Project this slide at the end of the event on Zoom screen or hall projector. Attendees scan the code to check out and submit their feedback directly.'
            : '💡 Ban tổ chức trình chiếu slide này cuối buổi trên màn hình Zoom/Meet hoặc máy chiếu hội trường. Sinh viên quét mã để hoàn tất check-out và gửi đánh giá.'}
        </p>
      </div>
    </div>
  )
}
