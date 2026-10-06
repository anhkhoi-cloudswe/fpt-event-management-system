import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Sparkles,
  Award,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Lock,
  Mail,
  Phone,
  Building2,
  FileText,
  User,
  Zap,
  LogIn
} from 'lucide-react'
import axios from 'axios'
import ReCAPTCHA from 'react-google-recaptcha'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { API_BASE_URL, setInMemoryToken } from '../../config/api'

interface OrganizerOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export const OrganizerOnboardingModal: React.FC<OrganizerOnboardingModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate()
  const { user, isAuthenticated, becomeOrganizer, refreshUser, setUser } = useAuth()
  const { showToast } = useToast()
  const modalRef = useRef<HTMLDivElement>(null)
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)

  // Sub-steps for Guest vs Logged-in Student
  // For Guest: 'signup_form' -> 'otp_verify' -> 'organizer_info' -> 'policy_confirm' -> 'success'
  // For Logged-in Student: 'organizer_info' -> 'policy_confirm' -> 'success'
  const [currentStep, setCurrentStep] = useState<
    'signup_form' | 'otp_verify' | 'organizer_info' | 'policy_confirm' | 'success'
  >('organizer_info')

  // Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [agreePolicy, setAgreePolicy] = useState(false)
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)

  // OTP State for Guest
  const [otpValue, setOtpValue] = useState('')
  const [otpCountdown, setOtpCountdown] = useState(0)
  const [otpAttempts, setOtpAttempts] = useState(1)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)

  // Loading & Error
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

  // Reset or initialize state based on auth status
  useEffect(() => {
    if (!isOpen) return

    setErrorMessage(null)
    setSubmitting(false)
    setAgreePolicy(false)

    if (isAuthenticated && user) {
      if (user.role === 'ORGANIZER') {
        setCurrentStep('success')
      } else {
        setCurrentStep('organizer_info')
        setFullName(user.fullName || '')
        setPhone(user.phone || '')
      }
    } else {
      setCurrentStep('signup_form')
      setEmail('')
      setPassword('')
      setFullName('')
      setPhone('')
      setOrganizationName('')
    }
  }, [isOpen, isAuthenticated, user])

  // Countdown timer for OTP
  useEffect(() => {
    let timer: number
    if (otpCountdown > 0) {
      timer = window.setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [otpCountdown])

  // Rate-limit countdown
  useEffect(() => {
    let timer: number
    if (rateLimitCountdown > 0) {
      timer = window.setTimeout(() => setRateLimitCountdown(rateLimitCountdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [rateLimitCountdown])

  // Accessibility: Lock background scroll & Esc key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !submitting) {
          onClose()
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isOpen, submitting, onClose])

  if (!isOpen) return null

  // Phone Validation
  const validatePhone = (num: string) => {
    const trimmed = num.trim()
    const regex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/
    return regex.test(trimmed)
  }

  // Step 1 for Guest: Send OTP to register initial account
  const handleGuestSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email || !email.includes('@')) {
      setErrorMessage('Vui lòng nhập email hợp lệ!')
      return
    }

    if (password.length < 6) {
      setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự!')
      return
    }

    if (!phone || !validatePhone(phone)) {
      setErrorMessage('Số điện thoại không hợp lệ (10 chữ số, ví dụ 0912345678)!')
      return
    }

    if (!organizationName.trim()) {
      setErrorMessage('Vui lòng nhập tên CLB / Đơn vị tổ chức!')
      return
    }

    if (!recaptchaToken && RECAPTCHA_SITE_KEY) {
      setErrorMessage('Vui lòng xác nhận reCAPTCHA!')
      return
    }

    setSubmitting(true)
    try {
      const resp = await axios.post(`${API_BASE_URL}/register/send-otp`, {
        fullName: fullName.trim() || email.split('@')[0],
        phone: phone.trim(),
        email: email.trim(),
        password: password,
        recaptchaToken: recaptchaToken || undefined
      }, { withCredentials: true })

      if (resp.data.status === 'success' || resp.data.success === true) {
        showToast('success', 'Mã xác thực OTP đã được gửi đến email của bạn!')
        setCurrentStep('otp_verify')
        setOtpCountdown(60)
      } else {
        setErrorMessage(resp.data.message || 'Gửi OTP thất bại')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi gửi OTP'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 for Guest: Verify OTP and immediately become Organizer
  const handleGuestVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!otpValue || otpValue.length < 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã OTP!')
      return
    }

    setSubmitting(true)
    try {
      const verifyResp = await axios.post(`${API_BASE_URL}/register/verify-otp`, {
        email: email.trim(),
        otp: otpValue.trim()
      }, { withCredentials: true })

      if (verifyResp.data.status === 'success' || verifyResp.data.success === true) {
        const { user: newUser, accessToken } = verifyResp.data
        if (accessToken) {
          setInMemoryToken(accessToken)
        }
        if (newUser) {
          setUser(newUser)
        }
        await refreshUser()

        // Automatically call become-organizer step
        setCurrentStep('policy_confirm')
      } else {
        setErrorMessage(verifyResp.data.message || 'Mã OTP không chính xác!')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Xác thực OTP thất bại'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle finalize upgrade to ORGANIZER for logged-in or newly authenticated user
  const handleFinalizeUpgrade = async () => {
    if (!agreePolicy) {
      setErrorMessage('Bạn cần tích đồng ý Quy chế & Chính sách Ban tổ chức!')
      return
    }

    if (!phone || !validatePhone(phone)) {
      setErrorMessage('Số điện thoại liên hệ không hợp lệ!')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await becomeOrganizer({
        phone: phone.trim(),
        organizationName: organizationName.trim(),
        agreePolicy: true,
      })

      if (res.success) {
        showToast('success', 'Chúc mừng bạn đã chính thức trở thành Ban tổ chức!')
        setCurrentStep('success')
      } else {
        setErrorMessage(res.message || 'Không thể nâng cấp tài khoản.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Đã có lỗi xảy ra.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={() => !submitting && onClose()}
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-auto text-slate-900 dark:text-white transition-all transform animate-scale-up"
      >
        {/* Top Gradient Ribbon Header */}
        <div className="relative bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 p-6 sm:p-8 text-white">
          <button
            onClick={() => !submitting && onClose()}
            className="absolute top-5 right-5 p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-orange-100 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/20">
                FPT Event Self-Service
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1">
                Trở Thành Ban Tổ Chức Sự Kiện
              </h2>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-orange-50 mt-2 font-medium">
            Tự do tạo sự kiện, mở bán vé thông minh, quản lý khách mời và tiếp cận hàng nghìn sinh viên FPT.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8">
          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-xs sm:text-sm animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* ==================== STEP 1: GUEST REGISTRATION FORM ==================== */}
          {currentStep === 'signup_form' && (
            <form onSubmit={handleGuestSendOtp} className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-3">
                <Zap className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Đăng ký tài khoản nhanh chóng để kích hoạt quyền <strong>Organizer</strong> ngay tức thì. Nếu bạn đã có tài khoản Sinh viên,{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="underline font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700"
                  >
                    Đăng nhập tại đây
                  </button>.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Email (@fpt.edu.vn / @gmail.com) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ban-to-chuc@fpt.edu.vn"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Mật khẩu <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Họ và Tên Người đại diện <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Số điện thoại liên hệ <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0912345678"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Organization / Club Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Tên Câu lạc bộ / Phòng ban / Đơn vị tổ chức <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder="VD: CLB Truyền Thông F-Code / Ban Sự Kiện FU-HCM"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* reCAPTCHA - Locked until valid Email and Password (min 6 chars) are typed */}
              {RECAPTCHA_SITE_KEY && (
                <div className="pt-2 flex flex-col items-center justify-center">
                  {(!email || !email.includes('@') || password.length < 6) ? (
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs text-center flex items-center justify-center gap-2 w-full max-w-sm">
                      <Lock className="w-4 h-4 text-orange-500 shrink-0" />
                      <span>Vui lòng nhập <strong>Email hợp lệ</strong> và <strong>Mật khẩu (≥ 6 ký tự)</strong> để mở khóa reCAPTCHA.</span>
                    </div>
                  ) : (
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={RECAPTCHA_SITE_KEY}
                      onChange={(token) => setRecaptchaToken(token)}
                    />
                  )}
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-4 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? 'Đang gửi mã xác thực...' : 'Tiếp tục & Nhận mã OTP xác thực'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ==================== STEP 2: GUEST OTP VERIFICATION ==================== */}
          {currentStep === 'otp_verify' && (
            <form onSubmit={handleGuestVerifyOtp} className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center mx-auto mb-2">
                <Mail className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Nhập mã xác thực OTP</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Mã xác thực 6 chữ số đã được gửi đến địa chỉ <strong>{email}</strong>
                </p>
              </div>

              <div className="max-w-xs mx-auto">
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-2xl font-black py-3 rounded-2xl border-2 border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/20 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {otpCountdown > 0 ? (
                <p className="text-xs text-slate-400">
                  Gửi lại mã sau <strong className="text-orange-600 font-bold">{otpCountdown}s</strong>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleGuestSendOtp}
                  className="text-xs font-bold text-orange-600 hover:underline"
                >
                  Gửi lại mã OTP
                </button>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep('signup_form')}
                  className="w-1/3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={submitting || otpValue.length !== 6}
                  className="w-2/3 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all"
                >
                  {submitting ? 'Đang xác thực...' : 'Xác thực & Hoàn tất'}
                </button>
              </div>
            </form>
          )}

          {/* ==================== STEP 3: LOGGED-IN STUDENT INFO UPDATE ==================== */}
          {currentStep === 'organizer_info' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 text-xs space-y-1">
                <p className="font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Bạn đang đăng nhập: {user?.fullName} ({user?.email})
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Vui lòng cung cấp số điện thoại liên lạc và tên tổ chức đại diện để bắt đầu tổ chức sự kiện.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Số điện thoại liên hệ trực tiếp <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0912345678"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Tên Câu lạc bộ / Phòng ban / Đơn vị tổ chức <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder="VD: CLB Truyền Thông F-Code / Nhóm Nghiên Cứu AI"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!phone || !validatePhone(phone)) {
                    setErrorMessage('Vui lòng nhập số điện thoại hợp lệ!')
                    return
                  }
                  if (!organizationName.trim()) {
                    setErrorMessage('Vui lòng nhập tên CLB / Đơn vị tổ chức!')
                    return
                  }
                  setErrorMessage(null)
                  setCurrentStep('policy_confirm')
                }}
                className="w-full mt-4 py-3.5 px-6 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
              >
                Tiếp tục: Xác nhận Điều khoản & Kích hoạt
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ==================== STEP 4: POLICY AGREEMENT & ACTIVATION ==================== */}
          {currentStep === 'policy_confirm' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2.5 max-h-48 overflow-y-auto leading-relaxed">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Quy định & Trách nhiệm của Ban Tổ Chức (Organizer Policy)
                </h4>
                <p className="text-slate-600 dark:text-slate-300">
                  1. <strong>Nội dung sự kiện</strong>: Ban tổ chức chịu trách nhiệm hoàn toàn về tính chính xác, bản quyền hình ảnh, nội dung phát ngôn và tuân thủ thuần phong mỹ tục theo quy định của FPT Education.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  2. <strong>Bán vé & Doanh thu</strong>: Doanh thu bán vé sẽ được ghi nhận vào Ví Ban tổ chức. Yêu cầu rút tiền cần liên kết tài khoản ngân hàng chính chủ hợp lệ.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  3. <strong>Hạn mức & Gói dịch vụ</strong>: Tài khoản khởi đầu với gói <strong>FREE</strong> (tối đa 100 người/sự kiện). Bạn có thể nâng cấp lên PRO hoặc Business bất kỳ lúc nào để mở rộng quy mô.
                </p>
                <Link
                  to="/organizer-policy"
                  target="_blank"
                  className="inline-block font-bold text-orange-600 hover:underline pt-1"
                >
                  Xem toàn bộ văn bản chính sách chi tiết $\rightarrow$
                </Link>
              </div>

              {/* Checkbox agreement */}
              <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={agreePolicy}
                  onChange={(e) => {
                    setAgreePolicy(e.target.checked)
                    if (e.target.checked) setErrorMessage(null)
                  }}
                  className="w-4 h-4 mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tôi đã đọc, hiểu rõ và cam kết tuân thủ toàn bộ Quy chế & Chính sách dành cho Ban tổ chức sự kiện của FPT Education.
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(isAuthenticated ? 'organizer_info' : 'signup_form')}
                  className="w-1/3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  disabled={submitting || !agreePolicy}
                  onClick={handleFinalizeUpgrade}
                  className="w-2/3 py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? 'Đang kích hoạt tài khoản...' : 'Kích hoạt quyền Organizer ngay'}
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ==================== STEP 5: SUCCESS & REDIRECT ==================== */}
          {currentStep === 'success' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  Kích Hoạt Quyền Ban Tổ Chức Thành Công!
                </h3>
                <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                  Tài khoản của bạn đã được nâng cấp lên vai trò <strong>ORGANIZER</strong> với gói <strong>FREE</strong> sẵn sàng. Bây giờ bạn có thể tạo sự kiện và thiết lập hội trường ngay lập tức.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-3 justify-center">
                <button
                  onClick={() => {
                    onClose()
                    navigate('/dashboard/event-requests/create')
                  }}
                  className="px-6 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  Tạo Sự Kiện Mới Ngay
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    onClose()
                    navigate('/dashboard')
                  }}
                  className="px-6 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Vào Bảng Điều Khiển
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
