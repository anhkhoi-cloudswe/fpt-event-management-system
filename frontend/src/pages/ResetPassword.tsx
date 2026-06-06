import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GraduationCap, Eye, EyeOff } from 'lucide-react'
import OtpInput from '../components/OtpInput'
import axios from 'axios'
import ReCAPTCHA from 'react-google-recaptcha'
import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'
import { useToast } from '../contexts/ToastContext'
import { API_BASE_URL } from '../config/api'
import { ArrowLeft } from 'lucide-react'

const API_URL = API_BASE_URL
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'fpt.edu.vn', 'edu.vn']

const isAllowedEmailDomain = (email: string): boolean => {
  const parts = email.trim().toLowerCase().split('@')
  return parts.length === 2 && parts[0].length > 0 && ALLOWED_EMAIL_DOMAINS.includes(parts[1])
}

// Cấu hình trong file .env: VITE_RECAPTCHA_SITE_KEY
// reCAPTCHA site key được lấy từ environment variable
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

interface FormData {
  email: string
  otp: string
  newPassword: string
  confirmPassword: string
}

export default function ResetPassword() {
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [formData, setFormData] = useState<FormData>({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
  const [emailError, setEmailError] = useState('')
  const [otpError, setOtpError] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [isEmailValid, setIsEmailValid] = useState(false)
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const canUseRecaptcha = isEmailValid && rateLimitCountdown === 0 && !loading

  // Format seconds as MM:SS (always padded)
  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Countdown timer for resend OTP
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

  useEffect(() => {
    recaptchaRef.current?.reset()
    setRecaptchaToken(null)
    setIsEmailValid(false)

    const email = formData.email.trim()
    if (!email) return

    const timer = window.setTimeout(() => {
      if (isAllowedEmailDomain(email)) {
        setIsEmailValid(true)
        setEmailError('')
      } else {
        setEmailError('Only gmail.com, fpt.edu.vn, or edu.vn emails are allowed.')
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [formData.email])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setEmailError('')
    setOtpError('')
    setNewPasswordError('')
    setConfirmPasswordError('')
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()

    setEmailError('')

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email || !emailRegex.test(formData.email)) {
      setEmailError('Vui lòng nhập email hợp lệ!')
      return
    }

    if (!isAllowedEmailDomain(formData.email)) {
      setEmailError('Only gmail.com, fpt.edu.vn, or edu.vn emails are allowed.')
      return
    }

    if (!canUseRecaptcha || !recaptchaToken) {
      showToast('error', 'Vui lòng xác nhận reCAPTCHA trước khi gửi OTP!')
      return
    }

    setLoading(true)
    try {
      console.log('Sending reset password OTP to:', formData.email)

      const response = await axios.post(`${API_URL}/forgot-password`, {
        email: formData.email,
        recaptchaToken,
      })

      console.log('Forgot Password Response:', response.data)
      console.log('Response status:', response.status)
      console.log('Full response:', response)

      if (response.data && (response.data.status === 'success' || response.data.success === true)) {
        // Lưu token nếu backend trả về
        if (response.data.token) {
          console.log('Token received:', response.data.token)
          setResetToken(response.data.token)
        } else {
          console.log('No token in response, will use email for reset')
        }
        setStep('otp')
        const cooldownRemaining = response.data.cooldown_remaining
        if (cooldownRemaining && typeof cooldownRemaining === 'number' && cooldownRemaining > 0) {
          showToast('success', 'Mã OTP đang hoạt động. Vui lòng kiểm tra email của bạn!')
          setOtpCountdown(cooldownRemaining)
        } else {
          setOtpCountdown(60)
          showToast('success', 'Mã OTP đã được gửi đến email của bạn!')
        }
        setError('')
        recaptchaRef.current?.reset()
        setRecaptchaToken(null)
      } else {
        setError(response.data.message || 'Gửi OTP thất bại')
      }
    } catch (err: any) {
      console.error('Send OTP Error:', err)
      const errData = err.response?.data
      const retryAfter = errData?.retry_after
      const errorMsg = errData?.message || errData?.error || 'Đã xảy ra lỗi. Vui lòng thử lại.'
      if (retryAfter && typeof retryAfter === 'number' && retryAfter > 0) {
        setRateLimitCountdown(retryAfter)
      } else if (errorMsg.toLowerCase().includes('email')) {
        setEmailError(errorMsg)
      } else {
        showToast('error', errorMsg)
      }
      recaptchaRef.current?.reset()
      setRecaptchaToken(null)
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setLoading(true)
    try {
      const response = await axios.post(`${API_URL}/forgot-password`, {
        email: formData.email
      })

      if (response.data && (response.data.status === 'success' || response.data.success === true)) {
        const cooldownRemaining = response.data.cooldown_remaining
        if (cooldownRemaining && typeof cooldownRemaining === 'number' && cooldownRemaining > 0) {
          showToast('success', 'Mã OTP đang hoạt động. Vui lòng kiểm tra email của bạn!')
          setOtpCountdown(cooldownRemaining)
        } else {
          setOtpCountdown(60)
          showToast('success', 'Mã OTP mới đã được gửi lại!')
        }
        setError('')
      }
    } catch (err: any) {
      console.error('Resend OTP Error:', err)
      const errData = err.response?.data
      const retryAfter = errData?.retry_after
      const srvMsg = errData?.message || errData?.error || 'Không thể gửi lại OTP. Vui lòng thử lại.'
      if (retryAfter && typeof retryAfter === 'number' && retryAfter > 0) {
        setRateLimitCountdown(retryAfter)
        setOtpCountdown(retryAfter)
      } else {
        showToast('error', srvMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    setOtpError('')
    setNewPasswordError('')
    setConfirmPasswordError('')

    if (!formData.otp || formData.otp.trim() === '') {
      setOtpError('Vui lòng nhập mã OTP!')
      return
    }

    if (!formData.newPassword || formData.newPassword.length < 6) {
      setNewPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự!')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setConfirmPasswordError('Mật khẩu xác nhận không khớp!')
      return
    }

    setLoading(true)
    try {
      console.log('=== RESET PASSWORD REQUEST ===')
      console.log('Email:', formData.email)
      console.log('Token:', resetToken)
      console.log('OTP:', formData.otp)
      console.log('New Password length:', formData.newPassword.length)

      const requestData: any = {
        otp: formData.otp,
        newPassword: formData.newPassword
      }

      // Thêm token nếu có
      if (resetToken) {
        requestData.token = resetToken
        console.log('Sending with TOKEN')
      } else {
        // Thêm email nếu không có token
        requestData.email = formData.email
        console.log('Sending with EMAIL')
      }

      console.log('Request payload:', requestData)

      const response = await axios.post(`${API_URL}/reset-password`, requestData)

      console.log('Reset Password Response:', response.data)
      console.log('Response status:', response.status)

      if (response.data && response.data.status === 'success') {
        showToast('success', 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.')
        navigate('/login')
      } else {
        const errorMsg = response.data.message || 'Đặt lại mật khẩu thất bại'
        if (errorMsg.toLowerCase().includes('otp') || errorMsg.toLowerCase().includes('mã')) {
          setOtpError(errorMsg)
        } else if (errorMsg.toLowerCase().includes('mật khẩu') || errorMsg.toLowerCase().includes('password')) {
          setNewPasswordError(errorMsg)
        } else {
          showToast('error', errorMsg)
        }
      }
    } catch (err: any) {
      console.error('Reset Password Error:', err)
      const errorMsg = err.response?.data?.message ||
        err.response?.data?.error ||
        'Đã xảy ra lỗi. Vui lòng thử lại.'
      
      if (errorMsg.toLowerCase().includes('otp') || errorMsg.toLowerCase().includes('mã')) {
        setOtpError(errorMsg)
      } else if (errorMsg.toLowerCase().includes('mật khẩu') || errorMsg.toLowerCase().includes('password')) {
        setNewPasswordError(errorMsg)
      } else {
        showToast('error', errorMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-cover bg-center bg-no-repeat flex items-center justify-center px-4 relative" style={{ backgroundImage: `url('/assets/dai-hoc-fpt-tp-hcm-1-CHc59Hy_.jpeg')` }}>
      <div className="bg-white/75 backdrop-blur-lg p-10 rounded-[32px] shadow-2xl w-full max-w-md border border-white/40 transform transition-all duration-300 relative z-10 animate-fade-in-up text-slate-900">
        {/* Floating Escape Link */}
        <Link 
          to="/" 
          className="absolute left-6 top-6 flex items-center gap-1 text-slate-900 hover:text-orange-600 font-extrabold text-[11px] transition-colors duration-200 uppercase tracking-wider"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại Trang chủ</span>
        </Link>

        <div className="text-center mb-8">
          <div className="flex justify-center mb-3.5">
            <Link to="/" className="cursor-pointer transition-opacity duration-200 hover:opacity-80">
              <img
                src={fptLogo}
                alt="FPT Education"
                className="h-16 w-auto cursor-pointer transition-opacity duration-200 hover:opacity-80"
              />
            </Link>
          </div>
          <h1 className="text-lg font-black text-slate-900">
            {step === 'email' ? 'Đặt lại mật khẩu' : 'Xác thực OTP'}
          </h1>
          <p className="text-xs font-semibold text-slate-600 mt-1">
            {step === 'email' ? 'Nhập email trường để nhận mã OTP xác thực' : 'Nhập mã OTP và thiết lập mật khẩu mới'}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            {RECAPTCHA_SITE_KEY && (
              <fieldset
                disabled={!canUseRecaptcha}
                className={`flex justify-center border border-slate-200 rounded-2xl p-2.5 bg-slate-50 mb-2 ${canUseRecaptcha ? '' : 'opacity-50 pointer-events-none'}`}
              >
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => {
                    setRecaptchaToken(token)
                    if (token) {
                      setError('')
                    }
                  }}
                  onExpired={() => setRecaptchaToken(null)}
                />
              </fieldset>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide pl-1">
                Địa chỉ Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="email@fpt.edu.vn"
                required
                disabled={loading || rateLimitCountdown > 0}
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-500 text-sm shadow-sm transition-all duration-300 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 ${
                  emailError 
                    ? 'border-red-500 focus:ring-2 focus:ring-red-500' 
                    : ''
                }`}
              />
              {emailError && (
                <p className="text-red-500 text-xs mt-1 pl-1 font-medium animate-shake">{emailError}</p>
              )}
              {rateLimitCountdown > 0 && (
                <p className="text-[11px] font-bold text-rose-600 mt-1 pl-1">
                  Tần suất gửi mã quá nhanh. Vui lòng đợi đồng hồ đếm ngược kết thúc.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || rateLimitCountdown > 0 || !recaptchaToken}
              className="w-full bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 text-white py-3.5 px-4 rounded-2xl hover:shadow-lg hover:shadow-orange-500/25 focus:outline-none font-extrabold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98 shadow-md"
            >
              {loading
                ? 'Đang gửi mã...'
                : rateLimitCountdown > 0
                ? `Thử lại sau ${formatCountdown(rateLimitCountdown)}`
                : 'Gửi mã OTP'}
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-xs font-bold text-slate-900 hover:text-orange-700 transition-colors"
              >
                ← Quay lại đăng nhập
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5">
             <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide text-center">
                Mã xác thực OTP
              </label>
              
              <OtpInput
                value={formData.otp}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, otp: value }))
                  setError('')
                  setOtpError('')
                }}
              />
              {otpError && (
                <p className="text-red-500 text-xs mt-1 text-center font-medium animate-shake">{otpError}</p>
              )}

              <div className="flex items-center justify-between mt-2.5 px-1 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard || !navigator.clipboard.readText) {
                        showToast('error', 'Trình duyệt của bạn không hỗ trợ đọc Clipboard!')
                        return
                      }
                      const text = await navigator.clipboard.readText()
                      const digits = text.replace(/\D/g, '').slice(0, 6)
                      if (digits.length === 6) {
                        setFormData(prev => ({ ...prev, otp: digits }))
                        showToast('success', 'Đã dán mã OTP thành công!')
                      } else if (digits.length > 0) {
                        setFormData(prev => ({ ...prev, otp: digits }))
                        showToast('success', 'Đã dán một phần mã OTP!')
                      } else {
                        showToast('error', 'Không tìm thấy mã OTP hợp lệ trong clipboard!')
                      }
                    } catch (err) {
                      console.error('Failed to read clipboard:', err)
                      showToast('error', 'Vui lòng cấp quyền truy cập Clipboard để dán mã!')
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-bold focus:outline-none bg-orange-50/50 hover:bg-orange-100/50 px-2.5 py-1.5 rounded-xl border border-orange-100/30 transition-all duration-300 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Dán mã OTP
                </button>

                <div className="text-xs text-slate-700 font-semibold">
                  {otpCountdown > 0 ? (
                    <span>Gửi lại mã sau <strong className="text-emerald-600 font-black">{otpCountdown}s</strong></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="text-emerald-600 hover:text-emerald-700 font-extrabold focus:outline-none"
                    >
                      Gửi lại mã OTP
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide pl-1">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  placeholder="Nhập mật khẩu mới"
                  required
                  className={`w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-500 text-sm shadow-sm transition-all duration-300 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 ${
                    newPasswordError 
                      ? 'border-red-500 focus:ring-2 focus:ring-red-500 focus:border-red-500' 
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {newPasswordError && (
                <p className="text-red-500 text-xs mt-1 pl-1 font-medium animate-shake">{newPasswordError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide pl-1">
                Xác nhận mật khẩu
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Nhập lại mật khẩu mới"
                  required
                  className={`w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-500 text-sm shadow-sm transition-all duration-300 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 ${
                    confirmPasswordError 
                      ? 'border-red-500 focus:ring-2 focus:ring-red-500 focus:border-red-500' 
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPasswordError && (
                <p className="text-red-500 text-xs mt-1 pl-1 font-medium animate-shake">{confirmPasswordError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 text-white py-3.5 px-4 rounded-2xl hover:shadow-lg hover:shadow-orange-500/25 focus:outline-none font-extrabold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98 shadow-md"
            >
              {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setFormData({ email: formData.email, otp: '', newPassword: '', confirmPassword: '' })
                  setError('')
                }}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors"
              >
                ← Thay đổi email đăng ký
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
