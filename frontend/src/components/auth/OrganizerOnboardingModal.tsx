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
  ArrowLeft,
  Lock,
  Mail,
  Phone,
  Building2,
  FileText,
  User,
  Zap,
  LogIn,
  Check,
  Eye,
  EyeOff
} from 'lucide-react'
import axios from 'axios'
import ReCAPTCHA from 'react-google-recaptcha'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { API_BASE_URL, setInMemoryToken } from '../../config/api'
import { isValidEmail, isValidVNPhone, getPasswordError, getPhoneError } from '../../utils/validation'

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

  // Multi-step state: 1 (Account Auth) -> 2 (Org & Contact Info) -> 3 (OTP Verification) -> 4 (Success)
  const [stepIndex, setStepIndex] = useState<1 | 2 | 3 | 4>(1)

  // Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [organizations, setOrganizations] = useState<any[]>([])
  const [agreePolicy, setAgreePolicy] = useState(false)
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)

  // Field Touched / Blur state for instant user feedback
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({})

  // Real-time inline field error calculations
  const emailError = touched.email && email ? (!isValidEmail(email) ? 'Email không đúng định dạng (Ví dụ: name@fpt.edu.vn hoặc user@gmail.com)' : null) : null
  const passwordError = touched.password && password ? getPasswordError(password) : null
  const fullNameError = touched.fullName && fullName ? (fullName.trim().length < 2 ? 'Họ và tên phải có ít nhất 2 ký tự' : null) : null
  const phoneError = touched.phone && phone ? getPhoneError(phone) : null

  // Account Type Detection from Step 1
  const [detectedAccountType, setDetectedAccountType] = useState<'NEW_GUEST' | 'STUDENT_UPGRADE'>('NEW_GUEST')

  // OTP State
  const [otpValue, setOtpValue] = useState('')
  const [otpCountdown, setOtpCountdown] = useState(0)

  // Loading & Error
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

  // Fetch registered active organizations for dropdown selection
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const resp = await axios.get('/api/organizations')
        if (resp.data && Array.isArray(resp.data)) {
          setOrganizations(resp.data)
        }
      } catch (err) {
        console.warn('Failed to load organizations for dropdown:', err)
      }
    }
    fetchOrgs()
  }, [])

  // Reset or initialize state based on auth status
  useEffect(() => {
    if (!isOpen) return

    setErrorMessage(null)
    setSubmitting(false)
    setAgreePolicy(false)
    setOtpValue('')
    setOtpCountdown(0)

    // Check if user is already logged in
    if (isAuthenticated && user && user.email) {
      if (user.role === 'ORGANIZER') {
        setStepIndex(4)
      } else if (user.role === 'STUDENT') {
        setEmail(user.email)
        setFullName(user.fullName || '')
        setPhone(user.phone || '')
        setDetectedAccountType('STUDENT_UPGRADE')
        setStepIndex(2) // Jump directly to Step 2 for logged-in students
      } else {
        // Staff or Admin
        setErrorMessage(`Tài khoản hiện tại có vai trò ${user.role}. Bạn không cần thực hiện nâng cấp Ban tổ chức.`)
      }
    } else {
      setStepIndex(1)
      setEmail('')
      setPassword('')
      setFullName('')
      setPhone('')
      setOrganizationName('')
      setSelectedOrgId(null)
      setRecaptchaToken(null)
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

  // Phone Validation
  const validatePhone = (num: string) => {
    const trimmed = num.trim()
    const regex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/
    return regex.test(trimmed)
  }

  // ==================== STEP 1: VALIDATE EMAIL & CREDENTIALS ====================
  const handleStep1Validate = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email || !email.includes('@')) {
      setErrorMessage('Vui lòng nhập email hợp lệ (@fpt.edu.vn hoặc @gmail.com)!')
      return
    }

    const pwdErr = getPasswordError(password)
    if (pwdErr) {
      setErrorMessage(pwdErr)
      return
    }

    if (!recaptchaToken && RECAPTCHA_SITE_KEY) {
      setErrorMessage('Vui lòng xác nhận mã reCAPTCHA!')
      return
    }

    setSubmitting(true)
    try {
      // Call backend with checkOnly = true to verify eligibility and filter role
      const resp = await axios.post(`${API_BASE_URL}/auth/organizer-onboard`, {
        email: email.trim(),
        password: password,
        recaptchaToken: recaptchaToken || undefined,
        checkOnly: true
      }, { withCredentials: true })

      const data = resp.data

      // If blocked role (ORGANIZER / STAFF / ADMIN)
      if (data.action === 'ROLE_BLOCKED') {
        setErrorMessage(data.message)
        if (recaptchaRef.current) {
          recaptchaRef.current.reset()
          setRecaptchaToken(null)
        }
        return
      }

      if (data.action === 'STUDENT_ELIGIBLE') {
        setDetectedAccountType('STUDENT_UPGRADE')
        showToast('success', 'Nhận diện tài khoản Sinh viên! Vui lòng hoàn tất thông tin CLB.')
      } else {
        setDetectedAccountType('NEW_GUEST')
      }

      // Move to Step 2!
      setStepIndex(2)
    } catch (err: any) {
      if (recaptchaRef.current) {
        recaptchaRef.current.reset()
        setRecaptchaToken(null)
      }
      const data = err?.response?.data
      let msg = data?.message || data?.error || ''
      if (!msg && data?.code === 'RATE_LIMIT_LOCKED') {
        const retryAfter = data?.retry_after || 60
        msg = `Thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`
      }
      if (!msg && err?.response?.status === 429) {
        msg = 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng đợi trong giây lát và thử lại.'
      }
      if (!msg) {
        msg = err?.message || 'Có lỗi xảy ra khi kiểm tra tài khoản'
      }
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== STEP 2: SUBMIT ORG & CONTACT INFO ====================
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!fullName.trim()) {
      setErrorMessage('Vui lòng nhập Họ và Tên người đại diện!')
      return
    }

    if (!phone || !validatePhone(phone)) {
      setErrorMessage('Số điện thoại không hợp lệ (10 chữ số, ví dụ 0912345678)!')
      return
    }

    if (!organizationName.trim()) {
      setErrorMessage('Vui lòng chọn hoặc nhập tên CLB / Đơn vị tổ chức!')
      return
    }

    if (!agreePolicy) {
      setErrorMessage('Bạn cần đọc và đồng ý Quy chế Ban tổ chức!')
      return
    }

    // If student was already logged in directly
    if (isAuthenticated && user?.role === 'STUDENT') {
      setSubmitting(true)
      try {
        const res = await becomeOrganizer({
          phone: phone.trim(),
          organizationName: organizationName.trim(),
          orgId: selectedOrgId || undefined,
          agreePolicy: true,
        })
        if (res.success) {
          showToast('success', 'Chúc mừng bạn đã chính thức trở thành Ban tổ chức!')
          setStepIndex(4)
        } else {
          setErrorMessage(res.message || 'Không thể nâng cấp tài khoản.')
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Đã có lỗi xảy ra.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Guest or unauthenticated Student
    setSubmitting(true)
    try {
      const resp = await axios.post(`${API_BASE_URL}/auth/organizer-onboard`, {
        email: email.trim(),
        password: password,
        fullName: fullName.trim() || email.split('@')[0],
        phone: phone.trim(),
        organizationName: organizationName.trim(),
        orgId: selectedOrgId || undefined,
        recaptchaToken: recaptchaToken || undefined,
        checkOnly: false
      }, { withCredentials: true })

      const data = resp.data

      // CASE A: DIRECT_UPGRADE (Student entered correct password)
      if (data.action === 'DIRECT_UPGRADE') {
        if (data.accessToken) {
          setInMemoryToken(data.accessToken)
        }
        if (data.user) {
          setUser(data.user)
        }
        await refreshUser()
        showToast('success', data.message || 'Chúc mừng bạn đã trở thành Ban tổ chức!')
        setStepIndex(4)
        return
      }

      // CASE B: ROLE_BLOCKED
      if (data.action === 'ROLE_BLOCKED') {
        setErrorMessage(data.message)
        return
      }

      // CASE C: OTP_SENT (New user or Student with wrong password needing OTP confirmation)
      if (data.action === 'OTP_SENT' || data.status === 'success' || data.success === true) {
        showToast('success', data.message || 'Mã xác thực OTP đã được gửi đến email của bạn!')
        setStepIndex(3)
        setOtpCountdown(60)
      } else {
        setErrorMessage(data.message || 'Gửi OTP thất bại')
      }
    } catch (err: any) {
      const data = err?.response?.data
      let msg = data?.message || data?.error || err?.message || 'Có lỗi xảy ra khi xử lý.'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== STEP 3: VERIFY OTP ====================
  const handleStep3VerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!otpValue || otpValue.length < 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã OTP!')
      return
    }

    setSubmitting(true)
    try {
      const verifyResp = await axios.post(`${API_BASE_URL}/auth/organizer-onboard/verify`, {
        email: email.trim(),
        otp: otpValue.trim(),
        phone: phone.trim(),
        fullName: fullName.trim() || email.split('@')[0],
        organizationName: organizationName.trim(),
        orgId: selectedOrgId || undefined,
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
        showToast('success', 'Xác thực OTP thành công! Đã kích hoạt quyền Ban tổ chức.')
        setStepIndex(4)
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

  // Helper to render Organization select dropdown with fallback input
  const renderOrganizationSelect = () => {
    const isCustomTextNeeded = selectedOrgId === null || organizationName === '' || !organizations.some(o => o.orgId === selectedOrgId)

    return (
      <div>
        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
          Tên CLB / Đơn vị tổ chức <span className="text-rose-500">*</span>
        </label>
        <div className="space-y-1.5">
          <div className="relative">
            <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={selectedOrgId === null && organizationName ? 'OTHER' : (selectedOrgId || '')}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'OTHER') {
                  setSelectedOrgId(null)
                  setOrganizationName('')
                } else if (val) {
                  const found = organizations.find((o) => o.orgId === Number(val))
                  if (found) {
                    setSelectedOrgId(found.orgId)
                    setOrganizationName(found.orgName)
                  }
                } else {
                  setSelectedOrgId(null)
                  setOrganizationName('')
                }
              }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            >
              <option value="">-- Chọn Câu lạc bộ / Đơn vị tổ chức --</option>
              {organizations.map((org) => (
                <option key={org.orgId} value={org.orgId}>
                  [{org.campusCode}] {org.orgName} ({org.orgType === 'CLUB' ? 'CLB' : org.orgType === 'FACULTY' ? 'Khoa' : org.orgType === 'DEPT' ? 'Phòng ban' : 'Đơn vị'})
                </option>
              ))}
              <option value="OTHER">➕ Khác (Tự nhập tên đơn vị mới...)</option>
            </select>
          </div>

          {isCustomTextNeeded && (
            <div className="relative animate-fade-in">
              <input
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Nhập tên CLB / Đơn vị tổ chức của bạn..."
                className="w-full px-3 py-1.5 rounded-xl border border-dashed border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ==================== STEP PROGRESS BAR COMPONENT ====================
  const renderProgressBar = () => {
    const steps = [
      { num: 1, title: 'XÁC THỰC EMAIL' },
      { num: 2, title: 'THÔNG TIN CLB' },
      { num: 3, title: 'XÁC NHẬN OTP' },
    ]

    return (
      <div className="w-full py-2 px-2 sm:px-6 mb-3">
        <div className="relative flex items-center justify-between">
          {/* Background Track Line */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-800 z-0" />

          {/* Active Highlight Track Line */}
          <div
            className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-orange-600 to-amber-500 transition-all duration-500 z-0"
            style={{
              width: stepIndex === 1 ? '0%' : stepIndex === 2 ? '50%' : '100%',
            }}
          />

          {steps.map((s) => {
            const isCompleted = stepIndex > s.num || stepIndex === 4
            const isActive = stepIndex === s.num

            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center group">
                {/* Node Circle */}
                <div
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all duration-300 shadow-md ${
                    isCompleted
                      ? 'bg-gradient-to-br from-orange-600 to-amber-500 text-white shadow-orange-500/30'
                      : isActive
                      ? 'bg-orange-500 text-white ring-4 ring-orange-500/25 shadow-lg scale-105'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : s.num}
                </div>

                {/* Step Label */}
                <span
                  className={`mt-1.5 text-[9px] sm:text-[11px] font-black tracking-wider uppercase transition-colors text-center ${
                    isActive
                      ? 'text-orange-600 dark:text-orange-400'
                      : isCompleted
                      ? 'text-slate-800 dark:text-slate-200'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {s.title}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={() => !submitting && onClose()}
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-lg sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-auto text-slate-900 dark:text-white transition-all transform animate-scale-up"
      >
        {/* Compact Top Gradient Ribbon Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 px-5 py-4 sm:px-6 sm:py-5 text-white shadow-md shrink-0">
          <button
            onClick={() => !submitting && onClose()}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors cursor-pointer z-10"
            aria-label="Đóng"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/30 shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-100 drop-shadow-md" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white bg-black/20 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20">
                <Zap className="w-2.5 h-2.5 text-amber-300" />
                FPT Event Self-Service
              </div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white drop-shadow-sm mt-0.5">
                Trở Thành Ban Tổ Chức Sự Kiện
              </h2>
            </div>
          </div>
        </div>

        {/* Modal Body - Scrollable only if screen is tiny */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(92vh-90px)]">
          {/* Progress Step Indicator (Hidden on Success Step) */}
          {stepIndex < 4 && renderProgressBar()}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-3.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-rose-700 dark:text-rose-300 text-xs sm:text-sm animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold">{errorMessage}</div>
            </div>
          )}

          {/* ==================== STEP 1: ACCOUNT AUTHENTICATION ==================== */}
          {stepIndex === 1 && (
            <form onSubmit={handleStep1Validate} className="space-y-3.5 animate-fade-in">
              <div className="space-y-3">
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Email (@fpt.edu.vn / @gmail.com) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setErrorMessage(null)
                      }}
                      placeholder="ten-ban@fpt.edu.vn hoặc user@gmail.com"
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                        emailError ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      } text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-medium`}
                    />
                  </div>
                  {emailError && (
                    <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1 animate-fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {emailError}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Mật khẩu tài khoản <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrorMessage(null)
                      }}
                      placeholder="Mật khẩu (Tối thiểu 6 ký tự)"
                      className={`w-full pl-10 pr-10 py-2.5 rounded-xl border ${
                        passwordError ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      } text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-3 top-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition cursor-pointer"
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1 animate-fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {passwordError}
                    </p>
                  )}
                </div>
              </div>

              {/* reCAPTCHA */}
              {RECAPTCHA_SITE_KEY && (
                <div className="pt-1 flex flex-col items-center justify-center">
                  {(!email || !isValidEmail(email) || !password || getPasswordError(password) !== null) ? (
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs text-center flex items-center justify-center gap-1.5 w-full">
                      <Lock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span>Điền đúng <strong>Email & Mật khẩu hợp lệ</strong> để mở khóa reCAPTCHA.</span>
                    </div>
                  ) : (
                    <div className="transform scale-[0.9] sm:scale-100 origin-center my-0.5">
                      <ReCAPTCHA
                        ref={recaptchaRef}
                        sitekey={RECAPTCHA_SITE_KEY}
                        onChange={(token) => setRecaptchaToken(token)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Step 1 Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-6 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-sm shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? 'Đang kiểm tra tài khoản...' : 'Kiểm tra & Tiếp tục'}
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Enhanced Large Login Callout */}
              <div className="pt-2 text-center text-sm font-medium text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/80 mt-3">
                Bạn đã có tài khoản Sinh viên?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="font-black text-orange-600 dark:text-orange-400 hover:text-orange-500 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors text-sm sm:text-base ml-1"
                >
                  <LogIn className="w-4 h-4 stroke-[2.5]" />
                  Đăng nhập ngay
                </button>
              </div>
            </form>
          )}

          {/* ==================== STEP 2: ORGANIZER & CLUB INFO ==================== */}
          {stepIndex === 2 && (
            <form onSubmit={handleStep2Submit} className="space-y-3.5 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Họ và Tên Người đại diện <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onBlur={() => setTouched(prev => ({ ...prev, fullName: true }))}
                      onChange={(e) => {
                        setFullName(e.target.value)
                        setErrorMessage(null)
                      }}
                      placeholder="Nguyễn Văn A"
                      className={`w-full pl-10 pr-4 py-2 rounded-xl border ${
                        fullNameError ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      } text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none`}
                    />
                  </div>
                  {fullNameError && (
                    <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1 animate-fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {fullNameError}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Số điện thoại liên hệ <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        setErrorMessage(null)
                      }}
                      placeholder="0912345678"
                      className={`w-full pl-10 pr-4 py-2 rounded-xl border ${
                        phoneError ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      } text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none`}
                    />
                  </div>
                  {phoneError && (
                    <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1 animate-fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {phoneError}
                    </p>
                  )}
                </div>
              </div>

              {/* Organization Select Dropdown */}
              {renderOrganizationSelect()}

              {/* Policy Accordion Box */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-xs">
                    <FileText className="w-3.5 h-3.5 text-orange-500" />
                    Quy chế Ban tổ chức (Organizer Policy)
                  </div>
                  <Link
                    to="/organizer-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-0.5"
                  >
                    Chính sách ↗
                  </Link>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  Cam kết tuân thủ{' '}
                  <Link
                    to="/organizer-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-orange-600 dark:text-orange-400 hover:underline inline"
                  >
                    quy định tổ chức sự kiện và bán vé
                  </Link>{' '}
                  của FPT Education.
                </p>
                <label className="flex items-start gap-2 pt-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreePolicy}
                    onChange={(e) => {
                      setAgreePolicy(e.target.checked)
                      if (e.target.checked) setErrorMessage(null)
                    }}
                    className="w-4 h-4 mt-0.5 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Tôi cam kết và đồng ý toàn bộ Quy chế Ban tổ chức sự kiện.
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-1">
                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => setStepIndex(1)}
                    className="w-1/3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Quay lại
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting || !agreePolicy}
                  className={`${
                    isAuthenticated ? 'w-full' : 'w-2/3'
                  } py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50`}
                >
                  {submitting ? 'Đang xử lý...' : 'Tiếp tục'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* ==================== STEP 3: OTP VERIFICATION ==================== */}
          {stepIndex === 3 && (
            <form onSubmit={handleStep3VerifyOtp} className="space-y-4 text-center py-2 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center mx-auto">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">Xác thực mã OTP Email</h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-sm mx-auto">
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
                  className="w-full text-center tracking-[0.4em] text-xl sm:text-2xl font-black py-2.5 rounded-xl border-2 border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/20 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {otpCountdown > 0 ? (
                <p className="text-xs text-slate-400">
                  Gửi lại mã sau <strong className="text-orange-600 font-bold">{otpCountdown}s</strong>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleStep2Submit}
                  className="text-xs font-bold text-orange-600 hover:underline cursor-pointer"
                >
                  Gửi lại mã OTP
                </button>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setStepIndex(2)}
                  className="w-1/3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={submitting || otpValue.length !== 6}
                  className="w-2/3 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {submitting ? 'Đang kích hoạt...' : 'Xác thực & Hoàn tất'}
                </button>
              </div>
            </form>
          )}

          {/* ==================== STEP 4: SUCCESS & LAUNCH ==================== */}
          {stepIndex === 4 && (
            <div className="space-y-4 text-center py-3 animate-scale-up">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Kích Hoạt Quyền Ban Tổ Chức Thành Công!
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  Tài khoản của bạn đã được nâng cấp lên vai trò <strong>ORGANIZER</strong> với gói <strong>FREE</strong> sẵn sàng.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2 justify-center">
                <button
                  onClick={() => {
                    onClose()
                    navigate('/dashboard/event-requests/create')
                  }}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  Tạo Sự Kiện Mới Ngay
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    onClose()
                    navigate('/dashboard')
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
