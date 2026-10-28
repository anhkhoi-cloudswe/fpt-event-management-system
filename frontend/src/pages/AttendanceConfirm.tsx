import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Send,
  Ticket,
  ChevronRight,
  Globe,
  Sparkles,
  Smile,
  Frown,
  Calendar,
  Lock,
  LogIn,
} from 'lucide-react'
import axios from 'axios'
import { useGoogleLogin } from '@react-oauth/google'
import { api, API_BASE_URL, setInMemoryToken } from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import fptLogo from '../assets/fpt-logo.png'

type AttendanceStatusData = {
  eventId: number
  eventTitle: string
  eventFormat: string
  startTime: string
  endTime: string
  allowedAt: string
  closedAt: string
  isOpen: boolean
  isClosed: boolean
  checkoutOffset: number
  ticketId?: number
  ticketStatus?: string
  alreadyDone: boolean
  feedbackSubmitted: boolean
  checkInTime?: string
  checkOutTime?: string
  userFullName?: string
  userEmail?: string
}

type AttendanceConfirmResponse = {
  ticketId: number
  eventId: number
  eventName: string
  status: string
  action: string
  alreadyDone: boolean
  checkInTime?: string
  checkOutTime?: string
  message: string
}

const RATING_OPTIONS = [
  { value: 'VERY_GOOD', labelVi: 'Rất tốt', labelEn: 'Very Good', color: 'text-emerald-500' },
  { value: 'GOOD', labelVi: 'Tốt', labelEn: 'Good', color: 'text-blue-500' },
  { value: 'AVERAGE', labelVi: 'Trung bình', labelEn: 'Average', color: 'text-amber-500' },
  { value: 'POOR', labelVi: 'Kém', labelEn: 'Poor', color: 'text-orange-500' },
  { value: 'VERY_POOR', labelVi: 'Rất kém', labelEn: 'Very Poor', color: 'text-rose-500' },
]

export default function AttendanceConfirm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, setUser, setToken, refreshUser, isAuthenticated, loading: authLoading, isRefreshing, currentLanguage } = useAuth()
  const { showToast } = useToast()
  const [googleLoading, setGoogleLoading] = useState(false)

  const [lang, setLang] = useState<'vi' | 'en'>(currentLanguage === 'en' ? 'en' : 'vi')
  const eventId = Number(params.get('eventId') || 0)

  // Status & loading
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusData, setStatusData] = useState<AttendanceStatusData | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Form states matching images 3, 4, 5
  const [contentRating, setContentRating] = useState<string>('')
  const [speakerRating, setSpeakerRating] = useState<string>('')
  const [organizationRating, setOrganizationRating] = useState<string>('')
  const [isSatisfied, setIsSatisfied] = useState<boolean | null>(null)
  const [experienceNotes, setExperienceNotes] = useState<string>('')
  const [suggestions, setSuggestions] = useState<string>('')

  // Submit states
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AttendanceConfirmResponse | null>(null)

  // Sync lang with context
  useEffect(() => {
    if (currentLanguage === 'en' || currentLanguage === 'vi') {
      setLang(currentLanguage)
    }
  }, [currentLanguage])

  // In-place Google OAuth login without full page reload or bouncing away
  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      setGoogleLoading(true)
      try {
        const response = await axios.post(`${API_BASE_URL}/auth/google/callback`, {
          code: codeResponse.code,
        }, {
          withCredentials: true,
        })

        if (response.data && response.data.status === 'success') {
          const { user: authedUser, accessToken } = response.data
          if (accessToken) {
            setInMemoryToken(accessToken)
          }
          setUser(authedUser)
          setToken(null)
          await refreshUser()
          showToast('success', lang === 'en' ? 'Signed in successfully!' : 'Đăng nhập thành công! Hãy hoàn thành khảo sát.')
        } else {
          showToast('error', response.data?.message || (lang === 'en' ? 'Google Login failed' : 'Đăng nhập Google thất bại'))
        }
      } catch (err: any) {
        console.error('Google callback error:', err)
        const srvMsg = err.response?.data?.message || err.response?.data?.error
        showToast('error', srvMsg || (lang === 'en' ? 'Authentication failed. Please try again.' : 'Không thể xác thực Google. Vui lòng thử lại.'))
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: (err) => {
      console.error('Google Sign-In Error:', err)
      showToast('error', lang === 'en' ? 'Google Sign-In cancelled or failed.' : 'Đăng nhập Google bị hủy hoặc thất bại.')
    },
  })

  // Extract student code from email (e.g. SE170123 from anhttse170123@fpt.edu.vn)
  const studentCode = useMemo(() => {
    const email = user?.email || statusData?.userEmail || ''
    const match = email.match(/([a-zA-Z]{2}\d{5,6})/i)
    if (match) return match[1].toUpperCase()
    const prefix = email.split('@')[0]
    return prefix || 'SV-FPT'
  }, [user, statusData])

  // Fetch status on mount
  useEffect(() => {
    if (!eventId) {
      setStatusLoading(false)
      setStatusError(lang === 'en' ? 'Missing or invalid event ID.' : 'Mã sự kiện không hợp lệ.')
      return
    }

    if (!isAuthenticated) {
      setStatusLoading(false)
      return
    }

    const fetchStatus = async () => {
      setStatusLoading(true)
      setStatusError(null)
      try {
        const res = await api.get<AttendanceStatusData>(`/attendance/status?eventId=${eventId}`)
        setStatusData(res.data)
        if (res.data.alreadyDone || res.data.feedbackSubmitted) {
          setResult({
            ticketId: res.data.ticketId || 0,
            eventId: res.data.eventId,
            eventName: res.data.eventTitle,
            status: 'CHECKED_OUT',
            action: 'CHECKOUT',
            alreadyDone: true,
            checkInTime: res.data.checkInTime,
            checkOutTime: res.data.checkOutTime,
            message: lang === 'en' ? 'Attendance already confirmed' : 'Đã xác nhận điểm danh trước đó',
          })
        }
      } catch (err: any) {
        console.error('Error fetching attendance status:', err)
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          (lang === 'en' ? 'Unable to load attendance status.' : 'Không thể tải trạng thái điểm danh.')
        setStatusError(msg)
      } finally {
        setStatusLoading(false)
      }
    }

    fetchStatus()
  }, [eventId, isAuthenticated, lang])

  const formatDateTime = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!contentRating) {
      showToast('warning', lang === 'en' ? 'Please rate the event content.' : 'Vui lòng đánh giá nội dung truyền đạt.')
      return
    }
    if (!speakerRating) {
      showToast('warning', lang === 'en' ? 'Please rate the speaker/guest quality.' : 'Vui lòng đánh giá chất lượng diễn giả/khách mời.')
      return
    }
    if (!organizationRating) {
      showToast('warning', lang === 'en' ? 'Please rate the organization quality.' : 'Vui lòng đánh giá công tác tổ chức sự kiện.')
      return
    }
    if (isSatisfied === null) {
      showToast('warning', lang === 'en' ? 'Please indicate overall satisfaction.' : 'Vui lòng chọn mức độ hài lòng chung.')
      return
    }
    if (!experienceNotes.trim()) {
      showToast('warning', lang === 'en' ? 'Please share your event experience.' : 'Vui lòng chia sẻ trải nghiệm về sự kiện.')
      return
    }

    setSubmitting(true)
    try {
      const response = await api.post<AttendanceConfirmResponse>('/attendance/confirm', {
        eventId,
        action: 'CHECKOUT',
        contentRating,
        speakerRating,
        organizationRating,
        isSatisfied,
        experienceNotes: experienceNotes.trim(),
        suggestions: suggestions.trim(),
      })

      setResult(response.data)
      showToast(
        'success',
        lang === 'en' ? 'Check-out & Feedback submitted successfully!' : 'Điểm danh Check-out & Gửi đánh giá thành công!'
      )
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (lang === 'en' ? 'Failed to confirm attendance. Please try again.' : 'Không thể xác nhận điểm danh. Vui lòng thử lại.')
      showToast('error', message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-neutral-100 flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="w-full border-b border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <Link to="/" className="flex items-center gap-2 sm:gap-2.5 group shrink-0">
              {/* FEMS Logo Favicon */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                <img
                  src="/favicon.png"
                  alt="FEMS Logo"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Dấu × kết nối thương hiệu co-branding */}
              <span className="text-slate-400 font-light text-base select-none leading-none shrink-0">
                ×
              </span>

              {/* FPT University Logo */}
              <img
                src={fptLogo}
                alt="FPT Education"
                className="h-7 sm:h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105 shrink-0"
              />
            </Link>

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 hidden sm:block ml-1" />

            <div className="hidden sm:block">
              <span className="text-xs font-black uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> FEMS EVENT
              </span>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 font-medium leading-tight">
                {lang === 'en' ? 'Check-out & Feedback' : 'Điểm danh Check-out & Đánh giá'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-700 dark:text-neutral-300"
            >
              <Globe className="w-3.5 h-3.5 text-orange-500" />
              <span>{lang === 'vi' ? 'English' : 'Tiếng Việt'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="w-full max-w-3xl mx-auto px-4 py-8 flex-1">
        {/* Auth Loading / Refreshing State */}
        {(authLoading || isRefreshing) && (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 shadow-sm flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
            <p className="text-sm font-semibold text-slate-600 dark:text-neutral-400">
              {lang === 'en' ? 'Checking your account session...' : 'Đang kiểm tra tài khoản người dùng...'}
            </p>
          </div>
        )}

        {/* Not Logged In State (Unauthenticated on mobile browser) */}
        {!authLoading && !isRefreshing && !isAuthenticated && (
          <div className="p-7 sm:p-10 text-center rounded-3xl bg-white dark:bg-neutral-900 border border-orange-200 dark:border-orange-500/20 shadow-2xl max-w-lg mx-auto space-y-6 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500/10 to-amber-500/20 flex items-center justify-center mx-auto text-orange-600 border border-orange-500/20 shadow-inner">
              <LogIn className="w-8 h-8" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20 mb-2">
                {lang === 'en' ? 'Attendee Authentication' : 'Xác thực Sinh viên'}
              </span>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                {lang === 'en' ? 'Check-out & Survey Access' : 'Điểm Danh Check-out & Đánh Giá'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400 leading-relaxed">
                {lang === 'en'
                  ? 'Please authenticate with your FPT student email (@fpt.edu.vn) to record your attendance and submit feedback.'
                  : 'Vui lòng xác thực bằng tài khoản sinh viên FPT (@fpt.edu.vn) để hệ thống ghi nhận MSSV và hoàn tất thủ tục điểm danh.'}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              {/* One-tap Google Login in-place */}
              <button
                type="button"
                onClick={() => googleLogin()}
                disabled={googleLoading}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-extrabold text-sm sm:text-base transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-60"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === 'en' ? 'Signing in with Google...' : 'Đang xác thực Google...'}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#FFFFFF"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#FFFFFF"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FFFFFF"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#FFFFFF"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{lang === 'en' ? 'Sign in with Google FPT' : 'Đăng nhập nhanh với Google FPT'}</span>
                  </>
                )}
              </button>

              {/* Password login link fallback */}
              <Link
                to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                {lang === 'en' ? 'Or sign in with email & password →' : 'Hoặc đăng nhập bằng Email & Mật khẩu →'}
              </Link>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isAuthenticated && statusLoading && (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 shadow-sm flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
            <p className="text-sm font-semibold text-slate-600 dark:text-neutral-400">
              {lang === 'en' ? 'Checking event attendance status...' : 'Đang kiểm tra thông tin điểm danh sự kiện...'}
            </p>
          </div>
        )}

        {/* Global Error Banner */}
        {isAuthenticated && !statusLoading && statusError && (
          <div className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 flex items-start gap-3.5 shadow-sm">
            <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5 text-rose-600" />
            <div>
              <h2 className="text-base font-bold">
                {lang === 'en' ? 'Attendance Notice' : 'Thông báo điểm danh'}
              </h2>
              <p className="mt-1 text-sm leading-relaxed">{statusError}</p>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  to="/dashboard/my-tickets"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {lang === 'en' ? 'View My Tickets' : 'Xem vé của tôi'}
                </Link>
                <Link
                  to="/guest"
                  className="px-4 py-2 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold hover:bg-rose-100/50 transition-all"
                >
                  {lang === 'en' ? 'Home' : 'Trang chủ'}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Form Closed Notification (> 1 hour after event) */}
        {isAuthenticated && !statusLoading && !statusError && statusData?.isClosed && !result && (
          <div className="p-8 text-center rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-400">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              {lang === 'en' ? 'Attendance Form Closed' : 'Cổng Điểm Danh Đã Đóng'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
              {lang === 'en'
                ? 'The check-out and feedback portal automatically closes 1 hour after the event ends. Thank you for your interest!'
                : 'Cổng điểm danh check-out và đánh giá sự kiện tự động đóng sau 1 tiếng kể từ khi sự kiện kết thúc. Cảm ơn bạn đã tham gia!'}
            </p>
            <div className="pt-2">
              <Link
                to="/dashboard/my-tickets"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-md"
              >
                <Ticket className="w-4 h-4" />
                {lang === 'en' ? 'Return to My Tickets' : 'Quay lại vé của tôi'}
              </Link>
            </div>
          </div>
        )}

        {/* Form Not Open Yet */}
        {isAuthenticated && !statusLoading && !statusError && !statusData?.isOpen && !statusData?.isClosed && !result && (
          <div className="p-8 text-center rounded-3xl bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-500/20 shadow-sm space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
              <Clock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              {lang === 'en' ? 'Check-out Not Open Yet' : 'Cổng Điểm Danh Chưa Mở'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
              {lang === 'en'
                ? `The check-out and feedback form will open ${statusData?.checkoutOffset || 15} minutes before the event ends. Please return at the end of the session!`
                : `Cổng điểm danh và đánh giá sẽ mở trước khi sự kiện kết thúc ${statusData?.checkoutOffset || 15} phút. Bạn vui lòng quay lại vào cuối buổi sự kiện nhé!`}
            </p>
            {statusData?.allowedAt && (
              <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 py-1.5 px-3 rounded-xl inline-block">
                {lang === 'en' ? 'Opening Time:' : 'Thời gian mở:'} {formatDateTime(statusData.allowedAt)}
              </p>
            )}
          </div>
        )}

        {/* Success / Already Done Screen */}
        {isAuthenticated && !statusLoading && result && (
          <div className="p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-500/30 shadow-xl shadow-emerald-500/5 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                {result.alreadyDone
                  ? (lang === 'en' ? 'Already Confirmed' : 'Đã xác nhận trước đó')
                  : (lang === 'en' ? 'Check-out Success' : 'Check-out thành công')}
              </span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {lang === 'en' ? 'Thank You for Attending!' : 'Cảm Ơn Bạn Đã Tham Gia!'}
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400 max-w-md mx-auto">
                {result.eventName || statusData?.eventTitle}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-neutral-800/50 border border-slate-100 dark:border-white/5 text-xs text-left max-w-md mx-auto space-y-2">
              <div className="flex justify-between items-center text-slate-600 dark:text-neutral-400">
                <span>{lang === 'en' ? 'Participant:' : 'Người tham dự:'}</span>
                <strong className="text-slate-900 dark:text-white">{user?.fullName || statusData?.userFullName || 'Sinh viên'}</strong>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-neutral-400">
                <span>MSSV:</span>
                <strong className="text-slate-900 dark:text-white font-mono">{studentCode}</strong>
              </div>
              {result.checkOutTime && (
                <div className="flex justify-between items-center text-slate-600 dark:text-neutral-400">
                  <span>{lang === 'en' ? 'Check-out Time:' : 'Thời gian Check-out:'}</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">{formatDateTime(result.checkOutTime)}</strong>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/dashboard/my-tickets"
                className="w-full sm:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                <Ticket className="w-4 h-4" />
                {lang === 'en' ? 'View My Tickets' : 'Xem vé của tôi'}
              </Link>
              <Link
                to="/guest"
                className="w-full sm:w-auto px-6 py-3 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-neutral-200 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
              >
                {lang === 'en' ? 'Return Home' : 'Về trang chủ'}
              </Link>
            </div>
          </div>
        )}

        {/* Open Form for Checkout & Feedback */}
        {isAuthenticated && !statusLoading && !statusError && statusData?.isOpen && !result && (
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Header Title Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/10">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-white/20 text-white inline-block">
                {lang === 'en' ? 'EVENT CHECK-OUT & SURVEY' : 'ĐIỂM DANH CHECK-OUT & ĐÁNH GIÁ'}
              </span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-black">
                {statusData?.eventTitle || (lang === 'en' ? 'Event Check-out' : 'Xác nhận tham dự')}
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-white/90 leading-relaxed max-w-xl">
                {lang === 'en'
                  ? 'Please complete this quick survey to confirm your check-out attendance and help organizers improve future events.'
                  : 'Vui lòng hoàn thành phiếu khảo sát ngắn dưới đây để hệ thống ghi nhận bạn đã tham dự sự kiện đầy đủ và nhận điểm rèn luyện.'}
              </p>
            </div>

            {/* Readonly Auto-filled Student Info (Cards 1, 2, 3 in Image 3) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-neutral-500 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-orange-500" />
                {lang === 'en' ? 'ATTENDEE INFORMATION (AUTO-FILLED)' : 'THÔNG TIN NGƯỜI THAM DỰ (TỰ ĐỘNG NHẬN DIỆN)'}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <p className="text-[11px] text-slate-400 font-semibold">{lang === 'en' ? 'Full Name' : 'Họ và tên'}</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-white truncate">
                    {user?.fullName || statusData?.userFullName || 'Sinh viên'}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <p className="text-[11px] text-slate-400 font-semibold">MSSV</p>
                  <p className="mt-0.5 text-sm font-bold text-orange-600 dark:text-orange-400 font-mono">
                    {studentCode}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <p className="text-[11px] text-slate-400 font-semibold">Email</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-white truncate">
                    {user?.email || statusData?.userEmail || ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Question 1: Content Rating (Image 3) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-3">
              <label className="text-sm sm:text-base font-bold text-slate-900 dark:text-white block">
                1. {lang === 'en' ? 'How do you rate the content delivered in the event?' : 'Bạn đánh giá thế nào về nội dung truyền đạt trong sự kiện?'} <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                {RATING_OPTIONS.map((opt) => {
                  const selected = contentRating === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setContentRating(opt.value)}
                      className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                        selected
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-neutral-300'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span>{lang === 'en' ? opt.labelEn : opt.labelVi}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Question 2: Speaker Quality (Image 4) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-3">
              <label className="text-sm sm:text-base font-bold text-slate-900 dark:text-white block">
                2. {lang === 'en' ? 'How do you rate the quality of speakers/guests?' : 'Bạn đánh giá thế nào về chất lượng của diễn giả/khách mời trong sự kiện?'} <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                {RATING_OPTIONS.map((opt) => {
                  const selected = speakerRating === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSpeakerRating(opt.value)}
                      className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                        selected
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-neutral-300'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span>{lang === 'en' ? opt.labelEn : opt.labelVi}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Question 3: Organization Quality (Image 4) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-3">
              <label className="text-sm sm:text-base font-bold text-slate-900 dark:text-white block">
                3. {lang === 'en' ? 'How do you rate the event organization and setup?' : 'Bạn đánh giá thế nào về công tác tổ chức sự kiện?'} <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                {RATING_OPTIONS.map((opt) => {
                  const selected = organizationRating === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOrganizationRating(opt.value)}
                      className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                        selected
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-neutral-300'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span>{lang === 'en' ? opt.labelEn : opt.labelVi}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Question 4: Overall Satisfaction (Image 4 & 5) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-3">
              <label className="text-sm sm:text-base font-bold text-slate-900 dark:text-white block">
                4. {lang === 'en' ? 'Overall, are you satisfied with the event?' : 'Nhìn chung, bạn có hài lòng về sự kiện không?'} <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsSatisfied(true)}
                  className={`p-4 rounded-2xl border text-sm font-bold transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-98 ${
                    isSatisfied === true
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-700 dark:text-neutral-300'
                  }`}
                >
                  <Smile className="w-5 h-5 text-emerald-500" />
                  <span>{lang === 'en' ? 'Satisfied' : 'Hài lòng'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSatisfied(false)}
                  className={`p-4 rounded-2xl border text-sm font-bold transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-98 ${
                    isSatisfied === false
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 shadow-sm'
                      : 'border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-700 dark:text-neutral-300'
                  }`}
                >
                  <Frown className="w-5 h-5 text-rose-500" />
                  <span>{lang === 'en' ? 'Not Satisfied' : 'Không hài lòng'}</span>
                </button>
              </div>
            </div>

            {/* Question 5: Experience Notes (Image 4 & 5) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-2">
              <label className="text-sm sm:text-base font-bold text-slate-900 dark:text-white block">
                5. {lang === 'en' ? 'Your experience (e.g. What you liked most / least):' : 'Trải nghiệm của bạn về sự kiện (VD: Điều bạn thích nhất/ không thích nhất...):'} <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={experienceNotes}
                onChange={(e) => setExperienceNotes(e.target.value)}
                placeholder={
                  lang === 'en'
                    ? 'Share your thoughts, highlights, or memorable moments from the event...'
                    : 'Hãy chia sẻ cảm nhận, khoảnh khắc đáng nhớ hoặc điều cần cải thiện...'
                }
                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-neutral-800/40 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Question 6: Suggestions (Image 5) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-2">
              <label className="text-sm sm:text-base font-bold text-slate-900 dark:text-white block">
                6. {lang === 'en' ? 'Suggestions, comments for future events (Optional):' : 'Đề xuất, góp ý của bạn về sự kiện (Nếu có):'}
              </label>
              <textarea
                rows={2}
                value={suggestions}
                onChange={(e) => setSuggestions(e.target.value)}
                placeholder={
                  lang === 'en'
                    ? 'Ideas for next topics, workshop formats, or activities...'
                    : 'Gợi ý chủ đề tiếp theo, hình thức tổ chức hoặc hoạt động bạn mong đợi...'
                }
                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-neutral-800/40 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-extrabold text-sm sm:text-base transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === 'en' ? 'Submitting Feedback & Check-out...' : 'Đang gửi đánh giá & hoàn tất check-out...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>{lang === 'en' ? 'Submit Feedback & Confirm Check-out' : 'Gửi Đánh Giá & Hoàn Tất Check-out'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200/60 dark:border-white/5 py-6 text-center text-xs text-slate-400 dark:text-neutral-500">
        <p>© 2026 FPT Event Management System (FEMS) - All rights reserved.</p>
      </footer>
    </div>
  )
}
