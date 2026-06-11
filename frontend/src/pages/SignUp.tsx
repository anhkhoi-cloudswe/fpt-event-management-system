import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Sparkles,
  ArrowLeft,
  LogIn,
  AlertCircle
} from 'lucide-react'
import axios from 'axios'
import ReCAPTCHA from 'react-google-recaptcha'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { API_BASE_URL, setAccessToken, setInMemoryToken } from '../config/api'
import { useGoogleLogin } from '@react-oauth/google'

import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'

const API_URL = API_BASE_URL
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'fpt.edu.vn', 'edu.vn']

const isAllowedEmailDomain = (email: string): boolean => {
  const parts = email.trim().toLowerCase().split('@')
  return parts.length === 2 && parts[0].length > 0 && ALLOWED_EMAIL_DOMAINS.includes(parts[1])
}

interface FormData {
  email: string
  password: string
}

export default function SignUp() {
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  })

  const [otpValue, setOtpValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)
  const [otpAttempts, setOtpAttempts] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([])
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isEmailValid, setIsEmailValid] = useState(false)

  const { setUser, setToken, refreshUser, currentLanguage } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  const canUseRecaptcha = isEmailValid && formData.password.trim() !== '' && rateLimitCountdown === 0 && !loading
  const otpLength = 6
  const otpArray = otpValue.split('').concat(Array(otpLength).fill('')).slice(0, otpLength)

  // Format seconds as MM:SS (always padded)
  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

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
  }, [formData.email, formData.password])

  // Google OAuth registration
  const googleRegister = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      setLoading(true)
      setError('')
      try {
        console.log('Google Auth Code received for signup:', codeResponse.code)
        const response = await axios.post(`${API_URL}/auth/google/callback`, {
          code: codeResponse.code
        }, {
          withCredentials: true
        })

        if (response.data && response.data.status === 'success') {
          const { user, is_new_user } = response.data
          setUser(user)
          setToken(null)

          if (is_new_user) {
            sessionStorage.setItem('is_new_user', 'true')
          } else {
            sessionStorage.removeItem('is_new_user')
          }

          await refreshUser()
          showToast('success', 'Đăng ký tài khoản bằng Google thành công!')
          navigate('/dashboard')
        } else {
          setError(response.data?.message || 'Đăng ký Google thất bại')
        }
      } catch (err: any) {
        console.error('Google callback error during signup:', err)
        const srvMsg = err.response?.data?.message || err.response?.data?.error
        setError(srvMsg || 'Không thể xác thực tài khoản Google với hệ thống. Vui lòng thử lại.')
      } finally {
        setLoading(false)
      }
    },
    onError: (errorResponse) => {
      console.error('Google Sign-In/Up Error:', errorResponse)
      setError('Đăng ký bằng Google không thành công. Vui lòng thử lại.')
    }
  })

  // Handle Form Inputs
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (rateLimitCountdown > 0) return
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setEmailError('')
    setPasswordError('')
  }

  // Handle Send OTP (Step 1)
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (rateLimitCountdown > 0) return

    setEmailError('')
    setPasswordError('')

    // Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email || !emailRegex.test(formData.email)) {
      setEmailError('Vui lòng nhập email hợp lệ!')
      return
    }

    if (!isAllowedEmailDomain(formData.email)) {
      setEmailError('Only gmail.com, fpt.edu.vn, or edu.vn emails are allowed.')
      return
    }

    if (formData.password.length < 6) {
      setPasswordError('Mật khẩu phải chứa ít nhất 6 ký tự!')
      return
    }

    if (!canUseRecaptcha || !recaptchaToken) {
      showToast('error', 'Vui lòng xác nhận reCAPTCHA trước khi đăng ký!')
      return
    }

    setLoading(true)
    setError('')

    // Automatically extract username and send empty string for optional phone field
    const email = formData.email.trim()
    const password = formData.password
    const username = email.split('@')[0]
    const phone = ''

    try {
      const response = await axios.post(`${API_URL}/register/send-otp`, {
        fullName: username,
        phone: phone,
        email: email,
        password: password,
        recaptchaToken
      }, {
        withCredentials: true
      })

      if (response.data.status === 'success' || response.data.success === true) {
        const cooldownRemaining = response.data.cooldown_remaining
        if (cooldownRemaining && typeof cooldownRemaining === 'number' && cooldownRemaining > 0) {
          showToast('success', 'Mã OTP đang hoạt động. Vui lòng kiểm tra email của bạn!')
          setStep('otp')
          setOtpCountdown(cooldownRemaining)
        } else {
          showToast('success', 'Mã xác thực OTP đã được gửi đến email của bạn!')
          setStep('otp')
          setOtpCountdown(60)
        }
        setOtpAttempts(1)
        setRecaptchaToken(null)
        recaptchaRef.current?.reset()
      } else {
        setError(response.data.message || 'Gửi OTP thất bại. Vui lòng thử lại.')
      }
    } catch (err: any) {
      console.error('Send OTP error:', err)
      const errData = err.response?.data
      const retryAfter = errData?.retry_after
      const isConflict = err.response?.status === 409
      
      let errorMessage = 'Có lỗi xảy ra trong quá trình đăng ký. Vui lòng thử lại.'
      if (errData?.message) {
        errorMessage = errData.message
      } else if (errData?.error) {
        errorMessage = errData.error
      }

      if (err.response?.status === 429 && errData?.code === 'RATE_LIMIT_LOCKED') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 300
        setRateLimitCountdown(seconds)
        showToast('warning', 'Thao tac OTP dang bi khoa tam thoi. Vui long doi het dem nguoc.')
      } else if (isConflict || errorMessage.toLowerCase().includes('already exists') || errorMessage.toLowerCase().includes('đã tồn tại')) {
        setEmailError(currentLanguage === 'en' ? 'Invalid gmail information.' : 'Thông tin gmail không hợp lệ.')
      } else if (retryAfter && typeof retryAfter === 'number' && retryAfter > 0) {
        setRateLimitCountdown(retryAfter)
      } else if (errorMessage.toLowerCase().includes('email')) {
        setEmailError(errorMessage)
      } else if (errorMessage.toLowerCase().includes('mật khẩu') || errorMessage.toLowerCase().includes('password')) {
        setPasswordError(errorMessage)
      } else {
        showToast('error', errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle Resend OTP
  const handleResendOtp = async () => {
    if (otpCountdown > 0 || rateLimitCountdown > 0) return

    if (otpAttempts >= 2) {
      setRateLimitCountdown(300)
      setOtpCountdown(300)
      showToast('warning', 'Thao tac OTP dang bi khoa tam thoi do vuot qua so lan gui. Vui long doi het dem nguoc.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await axios.post(`${API_URL}/register/resend-otp`, {
        email: formData.email
      }, {
        withCredentials: true
      })

      if (response.data.status === 'success' || response.data.success === true) {
        const cooldownRemaining = response.data.cooldown_remaining
        if (cooldownRemaining && typeof cooldownRemaining === 'number' && cooldownRemaining > 0) {
          showToast('success', 'Mã OTP đang hoạt động. Vui lòng kiểm tra email của bạn!')
          setOtpCountdown(cooldownRemaining)
        } else {
          showToast('success', 'Đã gửi lại mã OTP tới email của bạn!')
          setOtpCountdown(60)
        }
        setOtpAttempts(prev => prev + 1)
        setOtpValue('')
      } else {
        setError(response.data.message || 'Không thể gửi lại OTP. Vui lòng thử lại.')
      }
    } catch (err: any) {
      console.error('Resend OTP error:', err)
      const errData = err.response?.data
      const retryAfter = errData?.retry_after
      const srvMsg = errData?.message || errData?.error || 'Có lỗi xảy ra khi gửi lại OTP.'
      if (err.response?.status === 429 && errData?.code === 'RATE_LIMIT_LOCKED') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 300
        setRateLimitCountdown(seconds)
        setOtpCountdown(seconds)
        showToast('warning', 'Thao tac OTP dang bi khoa tam thoi. Vui long doi het dem nguoc.')
      } else if (retryAfter && typeof retryAfter === 'number' && retryAfter > 0) {
        setRateLimitCountdown(retryAfter)
        setOtpCountdown(retryAfter)
      } else {
        showToast('error', srvMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  // Focus utility for 6-digit OTP fields
  const focusOtpInput = (index: number) => {
    if (index >= 0 && index < otpLength) {
      otpInputsRef.current[index]?.focus()
    }
  }

  // Auto trigger verification once 6th digit is entered
  const triggerOtpVerification = async (otpCode: string) => {
    if (rateLimitCountdown > 0) return

    setLoading(true)
    setError('')

    try {
      const response = await axios.post(`${API_URL}/register/verify-otp`, {
        email: formData.email,
        otp: otpCode
      }, {
        withCredentials: true
      })

      if (response.data.status === 'success') {
        const { user, accessToken } = response.data
        if (accessToken) {
          setInMemoryToken(accessToken)
        }
        setUser(user)
        setToken(null)
        await refreshUser()

        showToast('success', 'Đăng ký tài khoản thành công!')
        navigate('/dashboard')
      } else {
        setError(response.data.message || 'Mã OTP không chính xác hoặc đã hết hạn!')
      }
    } catch (err: any) {
      console.error('Verify OTP error:', err)
      const errData = err.response?.data
      if (err.response?.status === 429 && errData?.code === 'RATE_LIMIT_LOCKED') {
        const seconds = typeof errData?.retry_after === 'number' && errData.retry_after > 0 ? errData.retry_after : 300
        setRateLimitCountdown(seconds)
        setOtpCountdown(seconds)
        showToast('warning', 'Thao tac OTP dang bi khoa tam thoi. Vui long doi het dem nguoc.')
        return
      }
      const srvMsg = err.response?.data?.message || err.response?.data?.error
      showToast('error', srvMsg || 'Xác thực OTP thất bại. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  // Handle digit typing
  const handleOtpChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (rateLimitCountdown > 0) return

    const val = e.target.value
    const digitsOnly = val.replace(/\D/g, '')

    if (digitsOnly.length === 0) {
      const newOtpArray = [...otpArray]
      newOtpArray[index] = ''
      const newOtp = newOtpArray.join('')
      setOtpValue(newOtp)
      return
    }

    const char = digitsOnly.substring(digitsOnly.length - 1)
    const newOtpArray = [...otpArray]
    newOtpArray[index] = char
    const newOtp = newOtpArray.join('')
    setOtpValue(newOtp)

    if (char && index < otpLength - 1) {
      focusOtpInput(index + 1)
    }

    // Auto verify once all 6 digits are typed
    if (newOtp.length === otpLength) {
      triggerOtpVerification(newOtp)
    }
  }

  // Handle backspace navigation
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (rateLimitCountdown > 0) return

    if (e.key === 'Backspace') {
      const val = otpArray[index]
      if (!val) {
        if (index > 0) {
          const newOtpArray = [...otpArray]
          newOtpArray[index - 1] = ''
          const newOtp = newOtpArray.join('')
          setOtpValue(newOtp)
          focusOtpInput(index - 1)
        }
      } else {
        const newOtpArray = [...otpArray]
        newOtpArray[index] = ''
        const newOtp = newOtpArray.join('')
        setOtpValue(newOtp)
      }
    }
  }

  // Paste handler
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (rateLimitCountdown > 0) return

    const pastedText = e.clipboardData.getData('text')
    const digits = pastedText.replace(/\D/g, '').slice(0, otpLength)
    if (digits) {
      setOtpValue(digits)
      const nextIndex = Math.min(digits.length, otpLength - 1)
      focusOtpInput(nextIndex)

      if (digits.length === otpLength) {
        triggerOtpVerification(digits)
      }
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

        {step === 'form' ? (
          <>
            {/* Logo + Header */}
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
              <h2 className="text-lg font-black text-slate-900">Đăng Ký FPT Event</h2>
            </div>

            {/* Form */}
            <form onSubmit={handleSendOtp} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wide pl-1">Địa chỉ Email</label>
                <input
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
                <div className="min-h-[24px] mt-1 transition-all duration-200 ease-in-out">
                  <span className={`text-xs text-red-500 block pl-1 font-medium transition-opacity duration-200 ${emailError ? 'opacity-100 animate-shake' : 'opacity-0 pointer-events-none'}`}>
                    {emailError || 'Placeholder'}
                  </span>
                </div>
                {rateLimitCountdown > 0 && (
                  <p className="text-[11px] font-bold text-rose-600 mt-1 pl-1">
                    Tần suất gửi mã quá nhanh. Vui lòng đợi đồng hồ đếm ngược kết thúc.
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wide pl-1">Mật khẩu</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    required
                    disabled={loading || rateLimitCountdown > 0}
                    className={`w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none outline-none text-slate-900 font-semibold placeholder-slate-500 text-sm shadow-sm transition-all duration-300 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 ${
                      passwordError 
                        ? 'border-red-500 focus:ring-2 focus:ring-red-500' 
                        : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading || rateLimitCountdown > 0}
                    className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-red-500 text-xs mt-1 pl-1 font-medium animate-shake">{passwordError}</p>
                )}
              </div>

              {/* reCAPTCHA */}
              {RECAPTCHA_SITE_KEY && (
                <fieldset
                  disabled={!canUseRecaptcha}
                  className={`flex justify-center my-4 overflow-hidden rounded-2xl border border-slate-100 ${canUseRecaptcha ? '' : 'opacity-50 pointer-events-none'}`}
                >
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={RECAPTCHA_SITE_KEY}
                    theme="light"
                    onChange={(token) => {
                      setRecaptchaToken(token)
                      setError('')
                    }}
                    onExpired={() => setRecaptchaToken(null)}
                  />
                </fieldset>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || rateLimitCountdown > 0 || !recaptchaToken}
                className="w-full py-4 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/20 hover:shadow-orange-500/35 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-99"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Đang kết nối...
                  </span>
                ) : rateLimitCountdown > 0 ? (
                  `Thử lại sau ${formatCountdown(rateLimitCountdown)}`
                ) : (
                  'Đăng ký tài khoản'
                )}
              </button>
            </form>

            {/* Separator */}
            <div className="relative flex py-3.5 items-center">
              <div className="flex-grow border-t border-slate-200/60"></div>
              <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">hoặc</span>
              <div className="flex-grow border-t border-slate-200/60"></div>
            </div>

            {/* Google Signup Button BELOW manual signup */}
            <button
              type="button"
              onClick={() => googleRegister()}
              disabled={loading || rateLimitCountdown > 0}
              className="w-full flex items-center justify-center gap-2.5 bg-white border border-slate-200/85 hover:border-slate-350 text-slate-700 py-3.5 px-4 rounded-2xl hover:bg-slate-50 font-extrabold text-sm shadow-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98 hover:shadow"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.84-2.45 2.4l3.8 2.94c2.22-2.05 3.7-5.07 3.7-9.19z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.8-2.94c-1.08.72-2.45 1.16-4.13 1.16-3.18 0-5.87-2.15-6.83-5.05L1.24 17.3c2.01 4 6.16 6.7 10.76 6.7z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.17 14.26A7.12 7.12 0 0 1 4.8 12c0-.79.13-1.56.37-2.28L1.24 6.64A11.94 11.94 0 0 0 0 12c0 1.92.45 3.74 1.24 5.36l3.93-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.4 0 3.25 2.7 1.24 6.64l3.93 3.08c.96-2.9 3.65-5.05 6.83-5.05z"
                />
              </svg>
              <span>Đăng ký bằng Google</span>
            </button>

            {/* Back to Login link */}
            <div className="text-center pt-3.5 border-t border-slate-200/60 mt-4 text-xs font-semibold text-slate-900">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-sm font-black text-slate-900 hover:text-orange-700 transition-colors inline-flex items-center gap-0.5">
                Quay lại Đăng nhập <LogIn className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: OTP Verification */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-600">
                  <Mail className="w-6 h-6 animate-pulse" />
                </div>
              </div>
              <h2 className="text-lg font-black text-slate-900">Xác Thực OTP</h2>
              <p className="text-xs font-semibold text-slate-500 mt-1.5 leading-relaxed">
                Chúng tôi đã gửi mã xác thực gồm 6 chữ số đến email <span className="text-orange-600 font-bold">{formData.email}</span>. Vui lòng nhập mã để kích hoạt tài khoản.
              </p>
            </div>

            {/* OTP horizontal inputs in White style */}
            <div className="flex justify-center gap-2.5 my-6">
              {Array.from({ length: otpLength }).map((_, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    otpInputsRef.current[index] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete="one-time-code"
                  value={otpArray[index]}
                  onChange={(e) => handleOtpChange(index, e)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  onPaste={handleOtpPaste}
                  disabled={loading || rateLimitCountdown > 0}
                  className="w-12 h-13 text-center text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-slate-900 focus:bg-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              ))}
            </div>

            {/* OTP status or loading */}
            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-orange-600 mb-4 animate-pulse">
                <svg className="animate-spin h-4 w-4 text-orange-550" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Đang xác thực tài khoản...
              </div>
            )}

            {/* Timer and Resend Trigger */}
            <div className="text-center pt-2 text-xs font-semibold text-slate-500 font-medium">
              {otpCountdown > 0 ? (
                <p>
                  Gửi lại mã OTP sau <span className="text-orange-600 font-bold">{otpCountdown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || rateLimitCountdown > 0}
                  className="text-orange-600 hover:text-orange-700 font-bold transition-colors underline disabled:opacity-50"
                >
                  Gửi lại mã OTP
                </button>
              )}
            </div>

            {/* Back to Step 1 */}
            <button
              type="button"
              onClick={() => {
                setStep('form')
                setError('')
                setOtpValue('')
              }}
              disabled={loading || rateLimitCountdown > 0}
              className="mt-6 w-full flex items-center justify-center gap-1.5 py-3.5 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-600 transition-all active:scale-98 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" /> Quay lại nhập thông tin
            </button>
          </>
        )}

      </div>
    </div>
  )
}
