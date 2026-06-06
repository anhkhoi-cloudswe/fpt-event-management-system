// ===================== IMPORTS =====================

// useState: quản lý state trong component (form, loading, error...)
// useRef: giữ reference đến component ReCAPTCHA để gọi reset() khi cần
import { useState, useEffect, useRef } from 'react'

// useNavigate: điều hướng trang bằng code
// Link: chuyển trang bằng router (không reload)
import { useNavigate, Link, useSearchParams } from 'react-router-dom'

// Icon Eye để toggle hiển thị mật khẩu
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'

// useAuth: lưu user vào context và refresh user từ backend sau khi cookie được set
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

// axios: thư viện gọi API thay cho fetch (tiện xử lý response/error)
import axios from 'axios'

// ReCAPTCHA: component Google reCAPTCHA v2 (checkbox)
import ReCAPTCHA from 'react-google-recaptcha'

// import ảnh/logo để hiển thị UI
import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'
import { API_BASE_URL, setAccessToken, setInMemoryToken } from '../config/api'
import { useGoogleLogin } from '@react-oauth/google'

// ===================== CONFIG API =====================

// API_URL = '/api' -> dùng proxy của Vite để tránh CORS khi dev
// Ví dụ: axios gọi /api/login thì Vite proxy sẽ forward sang backend thật
const API_URL = API_BASE_URL

// Cấu hình header mặc định cho axios:
// - Content-Type: dạng JSON
// - Accept: nhận JSON
axios.defaults.headers.common['Content-Type'] = 'application/json'
axios.defaults.headers.common['Accept'] = 'application/json'

// ===================== TYPE DEFINITIONS =====================

// Interface FormData: định nghĩa dữ liệu form login có 2 field: email + password
interface FormData {
  email: string
  password: string
}

// ===================== RECAPTCHA CONFIG =====================

// Cấu hình trong file .env: VITE_RECAPTCHA_SITE_KEY
// reCAPTCHA site key được lấy từ environment variable
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

// USE_REAL_RECAPTCHA:
// - false: khi debug nhanh, không cần check token thật -> gửi 'TEST_BYPASS' xuống BE
// - true: bắt buộc tick checkbox và có token thật trước khi login
const USE_REAL_RECAPTCHA = true // Đổi thành true khi muốn dùng reCAPTCHA thật trong demo/production
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'fpt.edu.vn', 'edu.vn']

const isAllowedEmailDomain = (email: string): boolean => {
  const parts = email.trim().toLowerCase().split('@')
  return parts.length === 2 && parts[0].length > 0 && ALLOWED_EMAIL_DOMAINS.includes(parts[1])
}

// ===================== MAIN COMPONENT =====================

export default function Login() {
  // formData: lưu email + password người dùng nhập
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  })

  // error: lưu message lỗi (hiển thị box đỏ)
  const [error, setError] = useState('')

  // loading: dùng để disable nút đăng nhập và hiển thị spinner
  const [loading, setLoading] = useState(false)

  // recaptchaToken: token được google trả về khi user tick checkbox
  // null nếu chưa tick hoặc token hết hạn
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)

  // recaptchaRef: ref để gọi recaptchaRef.current?.reset() khi cần reset captcha
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)

  // showPassword: toggle hiển thị mật khẩu
  const [showPassword, setShowPassword] = useState(false)

  // Lấy setUser/refreshUser từ context để đồng bộ user theo HttpOnly cookie
  const { setUser, setToken, refreshUser } = useAuth()
  const { showToast } = useToast()
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [lockoutCountdown, setLockoutCountdown] = useState(0)
  const [isEmailValid, setIsEmailValid] = useState(false)
  const [emailCheckLoading, setEmailCheckLoading] = useState(false)

  // navigate: chuyển trang sang dashboard sau khi login
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

  // Google OAuth Login handler
  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      setLoading(true)
      setError('')
      try {
        console.log('Google Auth Code received:', codeResponse.code)
        const response = await axios.post(`${API_URL}/auth/google/callback`, {
          code: codeResponse.code
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
          setError(response.data?.message || 'Đăng nhập Google thất bại')
        }
      } catch (err: any) {
        console.error('Google callback error:', err)
        const srvMsg = err.response?.data?.message || err.response?.data?.error
        setError(srvMsg || 'Không thể xác thực tài khoản Google với hệ thống. Vui lòng thử lại.')
      } finally {
        setLoading(false)
      }
    },
    onError: (errorResponse) => {
      console.error('Google Sign-In Error:', errorResponse)
      setError('Đăng nhập Google không thành công. Vui lòng thử lại.')
    }
  })

  // ===================== HANDLE INPUT =====================

  /**
   * handleInputChange:
   * - chạy khi user nhập email/password
   * - setFormData theo name của input
   * - clear error để UX tốt hơn (nhập lại thì mất thông báo lỗi cũ)
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
      throw new Error('Vui lòng xác thực reCAPTCHA trước khi đăng nhập.')
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
        const msg = response.data.message || 'Đăng nhập thất bại'
        throw new Error(msg)
      } else {
        throw new Error('Đăng nhập thất bại')
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
          googleLogin()
          return
        }

        // Ưu tiên show message từ server nếu có
        const srvMsg = err.response.data?.message || err.response.data?.error || null
        if (srvMsg) throw new Error(srvMsg)

        // Nếu không có message cụ thể -> show theo status code
        throw new Error(`Lỗi ${err.response.status}: ${err.response.statusText}`)
      } else if (err.request) {
        // Có gửi request nhưng không nhận được phản hồi
        throw new Error('Không thể kết nối đến server. Vui lòng kiểm tra backend và CORS.')
      } else {
        // Lỗi khác (vd throw Error ở trên)
        throw err
      }
    }
  }

  // ===================== SUBMIT FORM =====================

  /**
   * handleSubmit:
   * - Trigger khi user bấm nút submit (Đăng nhập)
   * - Chặn default submit reload trang
   * - Check nếu dùng captcha thật -> phải có token
   * - setLoading(true), clear error
   * - gọi handleLogin()
   * - nếu lỗi: setError để hiển thị
   * - reset captcha nếu token invalid
   * - finally: setLoading(false)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (lockoutCountdown > 0) {
      return
    }

    console.log('recaptchaToken at submit:', recaptchaToken)

    // Nếu dùng reCAPTCHA thật nhưng chưa tick -> chặn submit
    if (USE_REAL_RECAPTCHA && !recaptchaToken) {
      setError('Vui lòng xác nhận bạn không phải là robot!')
      return
    }

    setLoading(true)
    setError('')

    try {
      await handleLogin()
    } catch (err: any) {
      console.error('Login Error (submit):', err)
      
      let errorMessage = 'Có lỗi xảy ra. Vui lòng thử lại!'
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
        setEmailError('Email không chính xác hoặc chưa đăng ký.')
        setPasswordError('Mật khẩu không chính xác. Vui lòng kiểm tra lại.')
      } else if (errorMessage.toLowerCase().includes('robot') || errorMessage.toLowerCase().includes('recaptcha')) {
        showToast('error', errorMessage)
      } else if (err.response && err.response.status >= 500) {
        showToast('error', `Lỗi hệ thống ${err.response.status}: Vui lòng thử lại sau.`)
      } else if (err.request) {
        showToast('error', 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.')
      } else if (errorMessage.toLowerCase().includes('email')) {
        setEmailError(errorMessage)
      } else if (errorMessage.toLowerCase().includes('mật khẩu') || errorMessage.toLowerCase().includes('password')) {
        setPasswordError(errorMessage)
      } else {
        showToast('error', errorMessage)
      }

      // reset captcha nếu token bị reject/hết hạn
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
          <span>Quay lại Trang chủ</span>
        </Link>

        {/* Header logo + tiêu đề */}
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
          <h2 className="text-lg font-black text-slate-900">Đăng Nhập FPT Event</h2>
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
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Nhập mật khẩu"
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
                Đang kết nối...
              </span>
            ) : (
              'Đăng nhập'
            )}
          </button>

          {/* Nút đăng nhập Google */}
          <button
            type="button"
            onClick={() => googleLogin()}
            disabled={loading || lockoutCountdown > 0}
            className="!mt-3 w-full flex items-center justify-center gap-2.5 bg-white border border-slate-200 hover:border-slate-350 text-slate-700 py-3.5 px-4 rounded-2xl hover:bg-slate-50 font-extrabold text-sm shadow-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98 hover:shadow"
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
            <span>Đăng nhập bằng Google</span>
          </button>

          {/* Reset Password & Sign Up */}
          <div className="flex flex-col gap-2 items-center text-center !mt-2">
            <Link to="/reset-password" className="text-sm font-black text-slate-900 hover:text-orange-600 transition-colors">
              Quên mật khẩu?
            </Link>
            <div className="text-xs font-semibold text-slate-900 border-t border-slate-200/60 w-full pt-3 mt-1.5">
              Chưa có tài khoản?{' '}
              <Link to="/signup" className="text-sm font-black text-slate-900 hover:text-orange-600 transition-colors">
                Đăng ký ngay
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
