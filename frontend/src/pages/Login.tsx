// ===================== IMPORTS =====================

// useState: quÃ¡ÂºÂ£n lÃƒÂ½ state trong component (form, loading, error...)
// useRef: giÃ¡Â»Â¯ reference Ã„â€˜Ã¡ÂºÂ¿n component ReCAPTCHA Ã„â€˜Ã¡Â»Æ’ gÃ¡Â»Âi reset() khi cÃ¡ÂºÂ§n
import { useState, useEffect, useRef } from 'react'

// useNavigate: Ã„â€˜iÃ¡Â»Âu hÃ†Â°Ã¡Â»â€ºng trang bÃ¡ÂºÂ±ng code
// Link: chuyÃ¡Â»Æ’n trang bÃ¡ÂºÂ±ng router (khÃƒÂ´ng reload)
import { useNavigate, Link, useSearchParams } from 'react-router-dom'

// Icon Eye Ã„â€˜Ã¡Â»Æ’ toggle hiÃ¡Â»Æ’n thÃ¡Â»â€¹ mÃ¡ÂºÂ­t khÃ¡ÂºÂ©u
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'

// useAuth: lÃ†Â°u user vÃƒÂ o context vÃƒÂ  refresh user tÃ¡Â»Â« backend sau khi cookie Ã„â€˜Ã†Â°Ã¡Â»Â£c set
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

// axios: thÃ†Â° viÃ¡Â»â€¡n gÃ¡Â»Âi API thay cho fetch (tiÃ¡Â»â€¡n xÃ¡Â»Â­ lÃƒÂ½ response/error)
import axios from 'axios'

// ReCAPTCHA: component Google reCAPTCHA v2 (checkbox)
import ReCAPTCHA from 'react-google-recaptcha'

// import Ã¡ÂºÂ£nh/logo Ã„â€˜Ã¡Â»Æ’ hiÃ¡Â»Æ’n thÃ¡Â»â€¹ UI
import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'
import { API_BASE_URL, setAccessToken, setInMemoryToken } from '../config/api'
import { CredentialResponse, GoogleLogin } from '@react-oauth/google'

// ===================== CONFIG API =====================

// API_URL = '/api' -> dÃƒÂ¹ng proxy cÃ¡Â»Â§a Vite Ã„â€˜Ã¡Â»Æ’ trÃƒÂ¡nh CORS khi dev
// VÃƒÂ­ dÃ¡Â»Â¥: axios gÃ¡Â»Âi /api/login thÃƒÂ¬ Vite proxy sÃ¡ÂºÂ½ forward sang backend thÃ¡ÂºÂ­t
const API_URL = API_BASE_URL

// CÃ¡ÂºÂ¥u hÃƒÂ¬nh header mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh cho axios:
// - Content-Type: dÃ¡ÂºÂ¡ng JSON
// - Accept: nhÃ¡ÂºÂ­n JSON
axios.defaults.headers.common['Content-Type'] = 'application/json'
axios.defaults.headers.common['Accept'] = 'application/json'

// ===================== TYPE DEFINITIONS =====================

// Interface FormData: Ã„â€˜Ã¡Â»â€¹nh nghÃ„Â©a dÃ¡Â»Â¯ liÃ¡Â»â€¡u form login cÃƒÂ³ 2 field: email + password
interface FormData {
  email: string
  password: string
}

// ===================== RECAPTCHA CONFIG =====================

// CÃ¡ÂºÂ¥u hÃƒÂ¬nh trong file .env: VITE_RECAPTCHA_SITE_KEY
// reCAPTCHA site key Ã„â€˜Ã†Â°Ã¡Â»Â£c lÃ¡ÂºÂ¥y tÃ¡Â»Â« environment variable
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

// USE_REAL_RECAPTCHA:
// - false: khi debug nhanh, khÃƒÂ´ng cÃ¡ÂºÂ§n check token thÃ¡ÂºÂ­t -> gÃ¡Â»Â­i 'TEST_BYPASS' xuÃ¡Â»â€˜ng BE
// - true: bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c tick checkbox vÃƒÂ  cÃƒÂ³ token thÃ¡ÂºÂ­t trÃ†Â°Ã¡Â»â€ºc khi login
const USE_REAL_RECAPTCHA = true // Ã„ÂÃ¡Â»â€¢i thÃƒÂ nh true khi muÃ¡Â»â€˜n dÃƒÂ¹ng reCAPTCHA thÃ¡ÂºÂ­t trong demo/production
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'fpt.edu.vn', 'edu.vn']

const isAllowedEmailDomain = (email: string): boolean => {
  const parts = email.trim().toLowerCase().split('@')
  return parts.length === 2 && parts[0].length > 0 && ALLOWED_EMAIL_DOMAINS.includes(parts[1])
}

// ===================== MAIN COMPONENT =====================

export default function Login() {
  // formData: lÃ†Â°u email + password ngÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng nhÃ¡ÂºÂ­p
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  })

  // error: lÃ†Â°u message lÃ¡Â»â€”i (hiÃ¡Â»Æ’n thÃ¡Â»â€¹ box Ã„â€˜Ã¡Â»Â)
  const [error, setError] = useState('')

  // loading: dÃƒÂ¹ng Ã„â€˜Ã¡Â»Æ’ disable nÃƒÂºt Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p vÃƒÂ  hiÃ¡Â»Æ’n thÃ¡Â»â€¹ spinner
  const [loading, setLoading] = useState(false)

  // recaptchaToken: token Ã„â€˜Ã†Â°Ã¡Â»Â£c google trÃ¡ÂºÂ£ vÃ¡Â»Â khi user tick checkbox
  // null nÃ¡ÂºÂ¿u chÃ†Â°a tick hoÃ¡ÂºÂ·c token hÃ¡ÂºÂ¿t hÃ¡ÂºÂ¡n
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)

  // recaptchaRef: ref Ã„â€˜Ã¡Â»Æ’ gÃ¡Â»Âi recaptchaRef.current?.reset() khi cÃ¡ÂºÂ§n reset captcha
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)

  // showPassword: toggle hiÃ¡Â»Æ’n thÃ¡Â»â€¹ mÃ¡ÂºÂ­t khÃ¡ÂºÂ©u
  const [showPassword, setShowPassword] = useState(false)

  // LÃ¡ÂºÂ¥y setUser/refreshUser tÃ¡Â»Â« context Ã„â€˜Ã¡Â»Æ’ Ã„â€˜Ã¡Â»â€œng bÃ¡Â»â„¢ user theo HttpOnly cookie
  const { setUser, setToken, refreshUser } = useAuth()
  const { showToast } = useToast()
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [lockoutCountdown, setLockoutCountdown] = useState(0)
  const [isEmailValid, setIsEmailValid] = useState(false)
  const [emailCheckLoading, setEmailCheckLoading] = useState(false)

  // navigate: chuyÃ¡Â»Æ’n trang sang dashboard sau khi login
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectUrl = searchParams.get('redirect')
  const canUseRecaptcha = isEmailValid && formData.password.trim() !== '' && lockoutCountdown === 0 && !loading

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    let timer: number
    if (lockoutCountdown > 0) {
      timer = window.setTimeout(() => setLockoutCountdown(lockoutCountdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [lockoutCountdown])

  useEffect(() => {
    recaptchaRef.current?.reset()
    setRecaptchaToken(null)
    setIsEmailValid(false)

    const email = formData.email.trim()
    if (!email) {
      setEmailCheckLoading(false)
      return
    }

    if (!isAllowedEmailDomain(email)) {
      setEmailCheckLoading(false)
      setEmailError('Only gmail.com, fpt.edu.vn, or edu.vn emails are allowed.')
      return
    }

    let cancelled = false
    setEmailCheckLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await axios.post(`${API_URL}/auth/check-email-exists`, { email })
        if (!cancelled && response.status === 200 && response.data?.exists === true) {
          setIsEmailValid(true)
          setEmailError('')
        }
      } catch (err: any) {
        if (cancelled) return
        if (err.response?.status === 404) {
          setEmailError('Email not found')
        } else if (err.response?.data?.code === 'EMAIL_DOMAIN_NOT_ALLOWED') {
          setEmailError('Only gmail.com, fpt.edu.vn, or edu.vn emails are allowed.')
        } else {
          setEmailError(err.response?.data?.message || 'Unable to verify email right now.')
        }
      } finally {
        if (!cancelled) {
          setEmailCheckLoading(false)
        }
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [formData.email, formData.password])

  // Google Sign-In handler
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
        navigate(redirectUrl || '/dashboard')
      } else {
        setError(response.data?.message || 'Google sign-in failed. Please try again.')
      }
    } catch (err: any) {
      console.error('Google callback error:', err)
      const srvMsg = err.response?.data?.message || err.response?.data?.error
      setError(srvMsg || 'Google sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ===================== HANDLE INPUT =====================

  /**
   * handleInputChange:
   * - chÃ¡ÂºÂ¡y khi user nhÃ¡ÂºÂ­p email/password
   * - setFormData theo name cÃ¡Â»Â§a input
   * - clear error Ã„â€˜Ã¡Â»Æ’ UX tÃ¡Â»â€˜t hÃ†Â¡n (nhÃ¡ÂºÂ­p lÃ¡ÂºÂ¡i thÃƒÂ¬ mÃ¡ÂºÂ¥t thÃƒÂ´ng bÃƒÂ¡o lÃ¡Â»â€”i cÃ…Â©)
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (lockoutCountdown > 0) return
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setEmailError('')
    setPasswordError('')
  }

  // ===================== HANDLE LOGIN LOGIC =====================

  const handleLogin = async () => {
    if (!canUseRecaptcha) {
      throw new Error('Please enter a registered allowed email and password before reCAPTCHA.')
    }

    if (USE_REAL_RECAPTCHA && !recaptchaToken) {
      throw new Error('Vui lÃƒÂ²ng xÃƒÂ¡c thÃ¡Â»Â±c reCAPTCHA trÃ†Â°Ã¡Â»â€ºc khi Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p.')
    }

    const tokenToSend = USE_REAL_RECAPTCHA ? recaptchaToken : 'TEST_BYPASS'

    console.log(
      'Sending login request. recaptchaToken (first 40 chars):',
      tokenToSend ? tokenToSend.slice(0, 40) : null
    )

    try {
      const response = await axios.post(`${API_URL}/v1/auth/login`, {
        email: formData.email,
        password: formData.password,
        recaptchaToken: tokenToSend
      }, {
        withCredentials: true,
      })

      console.log('Login Response:', response.data)

      if (response.data && response.data.status === 'success') {
        const { user, accessToken } = response.data
        if (accessToken) {
          setInMemoryToken(accessToken)
        }

        console.log('User:', user)

        setUser(user)
        setToken(null)
        await refreshUser()

        try {
          recaptchaRef.current?.reset()
        } catch (_) { }

        navigate(redirectUrl || '/dashboard')
        return
      } else if (response.data && response.data.status === 'fail') {
        const msg = response.data.message || 'Ã„ÂÃ„Æ’ng nhÃ¡ÂºÂ­p thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i'
        throw new Error(msg)
      } else {
        throw new Error('Ã„ÂÃ„Æ’ng nhÃ¡ÂºÂ­p thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i')
      }
    } catch (err: any) {
      console.error('Login error (axios):', err)

      if (err.response) {
        console.error('Server response data:', err.response.data)

        if (err.response.status === 423 && err.response.data?.code === 'ACCOUNT_BRUTEFORCE_LOCKED') {
          const retryAfter = typeof err.response.data?.retry_after === 'number' ? err.response.data.retry_after : 300
          setLockoutCountdown(retryAfter)
          showToast('warning', 'Tai khoan dang bi khoa tam thoi. Vui long doi het dem nguoc roi thu lai.')
          throw new Error('ACCOUNT_BRUTEFORCE_LOCKED')
        }
        if (err.response.data?.code === 'RECAPTCHA_EXHAUSTED_USE_SSO') {
          showToast('warning', 'reCAPTCHA dang qua tai. Chuyen sang dang nhap Google de tiep tuc an toan.')
          return
        }

        // Ã†Â¯u tiÃƒÂªn show message tÃ¡Â»Â« server nÃ¡ÂºÂ¿u cÃƒÂ³
        const srvMsg = err.response.data?.message || err.response.data?.error || null
        if (srvMsg) throw new Error(srvMsg)

        // NÃ¡ÂºÂ¿u khÃƒÂ´ng cÃƒÂ³ message cÃ¡Â»Â¥ thÃ¡Â»Æ’ -> show theo status code
        throw new Error(`LÃ¡Â»â€”i ${err.response.status}: ${err.response.statusText}`)
      } else if (err.request) {
        // CÃƒÂ³ gÃ¡Â»Â­i request nhÃ†Â°ng khÃƒÂ´ng nhÃ¡ÂºÂ­n Ã„â€˜Ã†Â°Ã¡Â»Â£c phÃ¡ÂºÂ£n hÃ¡Â»â€œi
        throw new Error('KhÃƒÂ´ng thÃ¡Â»Æ’ kÃ¡ÂºÂ¿t nÃ¡Â»â€˜i Ã„â€˜Ã¡ÂºÂ¿n server. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra backend vÃƒÂ  CORS.')
      } else {
        // LÃ¡Â»â€”i khÃƒÂ¡c (vd throw Error Ã¡Â»Å¸ trÃƒÂªn)
        throw err
      }
    }
  }

  // ===================== SUBMIT FORM =====================

  /**
   * handleSubmit:
   * - Trigger khi user bÃ¡ÂºÂ¥m nÃƒÂºt submit (Ã„ÂÃ„Æ’ng nhÃ¡ÂºÂ­p)
   * - ChÃ¡ÂºÂ·n default submit reload trang
   * - Check nÃ¡ÂºÂ¿u dÃƒÂ¹ng captcha thÃ¡ÂºÂ­t -> phÃ¡ÂºÂ£i cÃƒÂ³ token
   * - setLoading(true), clear error
   * - gÃ¡Â»Âi handleLogin()
   * - nÃ¡ÂºÂ¿u lÃ¡Â»â€”i: setError Ã„â€˜Ã¡Â»Æ’ hiÃ¡Â»Æ’n thÃ¡Â»â€¹
   * - reset captcha nÃ¡ÂºÂ¿u token invalid
   * - finally: setLoading(false)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (lockoutCountdown > 0) {
      return
    }

    console.log('recaptchaToken at submit:', recaptchaToken)

    // NÃ¡ÂºÂ¿u dÃƒÂ¹ng reCAPTCHA thÃ¡ÂºÂ­t nhÃ†Â°ng chÃ†Â°a tick -> chÃ¡ÂºÂ·n submit
    if (USE_REAL_RECAPTCHA && !recaptchaToken) {
      setError('Vui lÃƒÂ²ng xÃƒÂ¡c nhÃ¡ÂºÂ­n bÃ¡ÂºÂ¡n khÃƒÂ´ng phÃ¡ÂºÂ£i lÃƒÂ  robot!')
      return
    }

    setLoading(true)
    setError('')

    try {
      await handleLogin()
    } catch (err: any) {
      console.error('Login Error (submit):', err)
      
      let errorMessage = 'CÃƒÂ³ lÃ¡Â»â€”i xÃ¡ÂºÂ£y ra. Vui lÃƒÂ²ng thÃ¡Â»Â­ lÃ¡ÂºÂ¡i!'
      if (err.message) {
        errorMessage = err.message
      }
      if (err.response && err.response.data && err.response.data.message) {
        errorMessage = err.response.data.message
      }

      // clear previous field errors
      setEmailError('')
      setPasswordError('')

      if (err.message === 'ACCOUNT_BRUTEFORCE_LOCKED') {
        setPasswordError(`Dang khoa dang nhap tam thoi. Thu lai sau ${formatCountdown(lockoutCountdown)}.`)
      } else if (err.response && err.response.status === 401) {
        setEmailError('Email khÃƒÂ´ng chÃƒÂ­nh xÃƒÂ¡c hoÃ¡ÂºÂ·c chÃ†Â°a Ã„â€˜Ã„Æ’ng kÃƒÂ½.')
        setPasswordError('MÃ¡ÂºÂ­t khÃ¡ÂºÂ©u khÃƒÂ´ng chÃƒÂ­nh xÃƒÂ¡c. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra lÃ¡ÂºÂ¡i.')
      } else if (errorMessage.toLowerCase().includes('robot') || errorMessage.toLowerCase().includes('recaptcha')) {
        showToast('error', errorMessage)
      } else if (err.response && err.response.status >= 500) {
        showToast('error', `LÃ¡Â»â€”i hÃ¡Â»â€¡ thÃ¡Â»â€˜ng ${err.response.status}: Vui lÃƒÂ²ng thÃ¡Â»Â­ lÃ¡ÂºÂ¡i sau.`)
      } else if (err.request) {
        showToast('error', 'KhÃƒÂ´ng thÃ¡Â»Æ’ kÃ¡ÂºÂ¿t nÃ¡Â»â€˜i Ã„â€˜Ã¡ÂºÂ¿n mÃƒÂ¡y chÃ¡Â»Â§. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra kÃ¡ÂºÂ¿t nÃ¡Â»â€˜i mÃ¡ÂºÂ¡ng.')
      } else if (errorMessage.toLowerCase().includes('email')) {
        setEmailError(errorMessage)
      } else if (errorMessage.toLowerCase().includes('mÃ¡ÂºÂ­t khÃ¡ÂºÂ©u') || errorMessage.toLowerCase().includes('password')) {
        setPasswordError(errorMessage)
      } else {
        showToast('error', errorMessage)
      }

      // reset captcha nÃ¡ÂºÂ¿u token bÃ¡Â»â€¹ reject/hÃ¡ÂºÂ¿t hÃ¡ÂºÂ¡n
      try {
        recaptchaRef.current?.reset()
        setRecaptchaToken(null)
      } catch (_) { }
    } finally {
      setLoading(false)
    }
  }

  // ===================== UI RENDER =====================

  return (
    <div className="min-h-screen w-full bg-cover bg-center bg-no-repeat flex items-center justify-center px-4 relative" style={{ backgroundImage: `url('/assets/dai-hoc-fpt-tp-hcm-1-CHc59Hy_.jpeg')` }}>
      {/* Card login */}
      <div className="bg-white/75 backdrop-blur-lg p-10 rounded-[32px] shadow-2xl w-full max-w-md border border-white/40 transform transition-all duration-300 relative z-10 animate-fade-in-up text-slate-900">
        {/* Floating Escape Link */}
        <Link 
          to="/" 
          className="absolute left-6 top-6 flex items-center gap-1 text-slate-900 hover:text-orange-600 font-extrabold text-[11px] transition-colors duration-200 uppercase tracking-wider"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lÃ¡ÂºÂ¡i Trang chÃ¡Â»Â§</span>
        </Link>

        {/* Header logo + tiÃƒÂªu Ã„â€˜Ã¡Â»Â */}
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
          <h2 className="text-lg font-black text-slate-900">Ã„ÂÃ„Æ’ng NhÃ¡ÂºÂ­p FPT Event</h2>
        </div>

        {lockoutCountdown > 0 && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-center">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">Dang khoa dang nhap tam thoi</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-800">{formatCountdown(lockoutCountdown)}</p>
          </div>
        )}

        {/* Form login */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Input Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-extrabold text-slate-900 uppercase tracking-wide pl-1">
              Ã„ÂÃ¡Â»â€¹a chÃ¡Â»â€° Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@fpt.edu.vn"
              required
              disabled={loading || lockoutCountdown > 0}
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
            {emailCheckLoading && (
              <p className="text-slate-500 text-xs mt-1 pl-1 font-medium">Checking email...</p>
            )}
          </div>

          {/* Input Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-extrabold text-slate-900 uppercase tracking-wide pl-1">
              MÃ¡ÂºÂ­t khÃ¡ÂºÂ©u
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="NhÃ¡ÂºÂ­p mÃ¡ÂºÂ­t khÃ¡ÂºÂ©u"
                required
                disabled={loading || lockoutCountdown > 0}
                className={`w-full px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-500 text-sm shadow-sm transition-all duration-300 hover:border-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 ${
                  passwordError 
                    ? 'border-red-500 focus:ring-2 focus:ring-red-500' 
                    : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading || lockoutCountdown > 0}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-700 transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordError && (
              <p className="text-red-500 text-xs mt-1 pl-1 font-medium animate-shake">{passwordError}</p>
            )}
          </div>

          {/* reCAPTCHA checkbox */}
          {RECAPTCHA_SITE_KEY && (
            <fieldset
              disabled={!canUseRecaptcha}
              className={`flex justify-center border border-slate-200 rounded-2xl p-2.5 bg-slate-50 ${canUseRecaptcha ? '' : 'opacity-50 pointer-events-none'}`}
            >
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={RECAPTCHA_SITE_KEY}
                onChange={(token) => {
                  console.log('reCAPTCHA onChange token (first 40 chars):', token ? token.slice(0, 40) : null)
                  setRecaptchaToken(token)
                  setError('')
                }}
                onExpired={() => {
                  console.log('reCAPTCHA expired')
                  setRecaptchaToken(null)
                }}
              />
            </fieldset>
          )}

          {/* Button submit */}
          <button
            type="submit"
            disabled={loading || lockoutCountdown > 0 || !recaptchaToken}
            className="w-full bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 text-white py-3.5 px-4 rounded-2xl hover:shadow-lg hover:shadow-orange-500/25 focus:outline-none font-extrabold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98 shadow-md"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Ã„Âang kÃ¡ÂºÂ¿t nÃ¡Â»â€˜i...
              </span>
            ) : (
              'Ã„ÂÃ„Æ’ng nhÃ¡ÂºÂ­p'
            )}
          </button>

          {/* NÃƒÂºt Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p Google */}
          <div className={`!mt-3 flex justify-center ${loading || lockoutCountdown > 0 ? 'pointer-events-none opacity-50' : ''}`}>
            <GoogleLogin
              onSuccess={handleGoogleCredential}
              onError={() => setError('Google sign-in failed. Please try again.')}
              text="signin_with"
              shape="rectangular"
              size="large"
              width="360"
            />
          </div>

          {/* Reset Password & Sign Up */}
          <div className="flex flex-col gap-2 items-center text-center !mt-2">
            <Link to="/reset-password" className="text-sm font-black text-slate-900 hover:text-orange-600 transition-colors">
              QuÃƒÂªn mÃ¡ÂºÂ­t khÃ¡ÂºÂ©u?
            </Link>
            <div className="text-xs font-semibold text-slate-900 border-t border-slate-200/60 w-full pt-3 mt-1.5">
              ChÃ†Â°a cÃƒÂ³ tÃƒÂ i khoÃ¡ÂºÂ£n?{' '}
              <Link to="/signup" className="text-sm font-black text-slate-900 hover:text-orange-600 transition-colors">
                Ã„ÂÃ„Æ’ng kÃƒÂ½ ngay
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
