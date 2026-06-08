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
import { CredentialResponse, GoogleLogin } from '@react-oauth/google'

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

  // Google Sign-In registration
  const handleGoogleCredential = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('Google sign-in failed. Please try again.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await axios.post(`${API_URL}/auth/google/callback`, {
        credential: credentialResponse.credential
      }, {
        withCredentials: true
      })

      if (response.data && response.data.status === 'success') {
        const { user, is_new_user, accessToken } = response.data
        if (accessToken) {
          setInMemoryToken(accessToken)
        }
        setUser(user)
        setToken(null)

        if (is_new_user) {
          sessionStorage.setItem('is_new_user', 'true')
        } else {
          sessionStorage.removeItem('is_new_user')
        }

        await refreshUser()
        showToast('success', 'Google sign-up successful!')
        navigate('/dashboard')
      } else {
        setError(response.data?.message || 'Google sign-in failed. Please try again.')
      }
    } catch (err: any) {
      console.error('Google callback error during signup:', err)
      const srvMsg = err.response?.data?.message || err.response?.data?.error
      setError(srvMsg || 'Google sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
      setEmailError('Vui lÃ²ng nháº­p email há»£p lá»‡!')
      return
    }

    if (!isAllowedEmailDomain(formData.email)) {
      setEmailError('Only gmail.com, fpt.edu.vn, or edu.vn emails are allowed.')
      return
    }

    if (formData.password.length < 6) {
      setPasswordError('Máº­t kháº©u pháº£i chá»©a Ã­t nháº¥t 6 kÃ½ tá»±!')
      return
    }

    if (!canUseRecaptcha || !recaptchaToken) {
      showToast('error', 'Vui lÃ²ng xÃ¡c nháº­n reCAPTCHA trÆ°á»›c khi Ä‘Äƒng kÃ½!')
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
          showToast('success', 'MÃ£ OTP Ä‘ang hoáº¡t Ä‘á»™ng. Vui lÃ²ng kiá»ƒm tra email cá»§a báº¡n!')
          setStep('otp')
          setOtpCountdown(cooldownRemaining)
        } else {
          showToast('success', 'MÃ£ xÃ¡c thá»±c OTP Ä‘Ã£ Ä‘Æ°á»£c gá»­i Ä‘áº¿n email cá»§a báº¡n!')
          setStep('otp')
          setOtpCountdown(60)
        }
        setOtpAttempts(1)
        setRecaptchaToken(null)
        recaptchaRef.current?.reset()
      } else {
        setError(response.data.message || 'Gá»­i OTP tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.')
      }
    } catch (err: any) {
      console.error('Send OTP error:', err)
      const errData = err.response?.data
      const retryAfter = errData?.retry_after
      const isConflict = err.response?.status === 409
      
      let errorMessage = 'CÃ³ lá»—i xáº£y ra trong quÃ¡ trÃ¬nh Ä‘Äƒng kÃ½. Vui lÃ²ng thá»­ láº¡i.'
      if (errData?.message) {
        errorMessage = errData.message
      } else if (errData?.error) {
        errorMessage = errData.error
      }

      if (err.response?.status === 429 && errData?.code === 'RATE_LIMIT_LOCKED') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 300
        setRateLimitCountdown(seconds)
        showToast('warning', 'Thao tac OTP dang bi khoa tam thoi. Vui long doi het dem nguoc.')
      } else if (isConflict) {
        setEmailError(errData?.message || errData?.error || (currentLanguage === 'en' ? 'This email is already registered.' : 'Email nÃ y Ä‘Ã£ Ä‘Æ°á»£c Ä‘Äƒng kÃ½ trong há»‡ thá»‘ng.'))
      } else if (retryAfter && typeof retryAfter === 'number' && retryAfter > 0) {
        setRateLimitCountdown(retryAfter)
      } else if (errorMessage.toLowerCase().includes('email')) {
        setEmailError(errorMessage)
      } else if (errorMessage.toLowerCase().includes('máº­t kháº©u') || errorMessage.toLowerCase().includes('password')) {
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
          showToast('success', 'MÃ£ OTP Ä‘ang hoáº¡t Ä‘á»™ng. Vui lÃ²ng kiá»ƒm tra email cá»§a báº¡n!')
          setOtpCountdown(cooldownRemaining)
        } else {
          showToast('success', 'ÄÃ£ gá»­i láº¡i mÃ£ OTP tá»›i email cá»§a báº¡n!')
          setOtpCountdown(60)
        }
        setOtpAttempts(prev => prev + 1)
        setOtpValue('')
      } else {
        setError(response.data.message || 'KhÃ´ng thá»ƒ gá»­i láº¡i OTP. Vui lÃ²ng thá»­ láº¡i.')
      }
    } catch (err: any) {
      console.error('Resend OTP error:', err)
      const errData = err.response?.data
      const retryAfter = errData?.retry_after
      const srvMsg = errData?.message || errData?.error || 'CÃ³ lá»—i xáº£y ra khi gá»­i láº¡i OTP.'
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

        showToast('success', 'ÄÄƒng kÃ½ tÃ i khoáº£n thÃ nh cÃ´ng!')
        navigate('/dashboard')
      } else {
        setError(response.data.message || 'MÃ£ OTP khÃ´ng chÃ­nh xÃ¡c hoáº·c Ä‘Ã£ háº¿t háº¡n!')
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
      showToast('error', srvMsg || 'XÃ¡c thá»±c OTP tháº¥t báº¡i. Vui lÃ²ng thá»­ láº¡i.')
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
          <span>Quay láº¡i Trang chá»§</span>
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
              <h2 className="text-lg font-black text-slate-900">ÄÄƒng KÃ½ FPT Event</h2>
            </div>

            {/* Form */}
            <form onSubmit={handleSendOtp} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wide pl-1">Äá»‹a chá»‰ Email</label>
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
                    Táº§n suáº¥t gá»­i mÃ£ quÃ¡ nhanh. Vui lÃ²ng Ä‘á»£i Ä‘á»“ng há»“ Ä‘áº¿m ngÆ°á»£c káº¿t thÃºc.
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wide pl-1">Máº­t kháº©u</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
                    Äang káº¿t ná»‘i...
                  </span>
                ) : rateLimitCountdown > 0 ? (
                  `Thá»­ láº¡i sau ${formatCountdown(rateLimitCountdown)}`
                ) : (
                  'ÄÄƒng kÃ½ tÃ i khoáº£n'
                )}
              </button>
            </form>

            {/* Separator */}
            <div className="relative flex py-3.5 items-center">
              <div className="flex-grow border-t border-slate-200/60"></div>
              <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">hoáº·c</span>
              <div className="flex-grow border-t border-slate-200/60"></div>
            </div>

            {/* Google Signup Button BELOW manual signup */}
            <div className={`flex justify-center ${loading || rateLimitCountdown > 0 ? 'pointer-events-none opacity-50' : ''}`}>
              <GoogleLogin
                onSuccess={handleGoogleCredential}
                onError={() => setError('Google sign-in failed. Please try again.')}
                text="signup_with"
                shape="rectangular"
                size="large"
                width="360"
              />
            </div>

            {/* Back to Login link */}
            <div className="text-center pt-3.5 border-t border-slate-200/60 mt-4 text-xs font-semibold text-slate-900">
              ÄÃ£ cÃ³ tÃ i khoáº£n?{' '}
              <Link to="/login" className="text-sm font-black text-slate-900 hover:text-orange-700 transition-colors inline-flex items-center gap-0.5">
                Quay láº¡i ÄÄƒng nháº­p <LogIn className="w-3.5 h-3.5" />
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
              <h2 className="text-lg font-black text-slate-900">XÃ¡c Thá»±c OTP</h2>
              <p className="text-xs font-semibold text-slate-500 mt-1.5 leading-relaxed">
                ChÃºng tÃ´i Ä‘Ã£ gá»­i mÃ£ xÃ¡c thá»±c gá»“m 6 chá»¯ sá»‘ Ä‘áº¿n email <span className="text-orange-600 font-bold">{formData.email}</span>. Vui lÃ²ng nháº­p mÃ£ Ä‘á»ƒ kÃ­ch hoáº¡t tÃ i khoáº£n.
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
                Äang xÃ¡c thá»±c tÃ i khoáº£n...
              </div>
            )}

            {/* Timer and Resend Trigger */}
            <div className="text-center pt-2 text-xs font-semibold text-slate-500 font-medium">
              {otpCountdown > 0 ? (
                <p>
                  Gá»­i láº¡i mÃ£ OTP sau <span className="text-orange-600 font-bold">{otpCountdown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || rateLimitCountdown > 0}
                  className="text-orange-600 hover:text-orange-700 font-bold transition-colors underline disabled:opacity-50"
                >
                  Gá»­i láº¡i mÃ£ OTP
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
              <ArrowLeft className="w-4 h-4" /> Quay láº¡i nháº­p thÃ´ng tin
            </button>
          </>
        )}

      </div>
    </div>
  )
}
