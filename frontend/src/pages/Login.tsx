// ===================== IMPORTS =====================

// useState: quản lý state trong component (form, loading, error...)
// useRef: giữ reference đến component ReCAPTCHA để gọi reset() khi cần
import { useState, useRef } from 'react'

// useNavigate: điều hướng trang bằng code
// Link: chuyển trang bằng router (không reload)
import { useNavigate, Link } from 'react-router-dom'

// Icon Eye để toggle hiển thị mật khẩu
import { Eye, EyeOff } from 'lucide-react'

// useAuth: lấy hàm setUser/setToken để lưu thông tin đăng nhập vào AuthContext (và localStorage)
import { useAuth } from '../contexts/AuthContext'

// axios: thư viện gọi API thay cho fetch (tiện xử lý response/error)
import axios from 'axios'

// ReCAPTCHA: component Google reCAPTCHA v2 (checkbox)
import ReCAPTCHA from 'react-google-recaptcha'

// import ảnh/logo để hiển thị UI
import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'

// ===================== CONFIG API =====================

// API_URL = '/api' -> dùng proxy của Vite để tránh CORS khi dev
// Ví dụ: axios gọi /api/login thì Vite proxy sẽ forward sang backend thật
const API_URL = '/api'

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

// reCAPTCHA site key - hướng dẫn lấy key:
// 1) Vào: https://www.google.com/recaptcha/admin/create
// 2) chọn reCAPTCHA v2 (checkbox)
// 3) thêm domain: localhost và domain production
// 4) copy Site Key dán vào đây

//const RECAPTCHA_SITE_KEY = '...' // ví dụ key cũ
const RECAPTCHA_SITE_KEY = '6LdvPQIsAAAAAG7glbICpFiBR9o5MhboFU4JvxAJ'

// USE_REAL_RECAPTCHA:
// - false: khi debug nhanh, không cần check token thật -> gửi 'TEST_BYPASS' xuống BE
// - true: bắt buộc tick checkbox và có token thật trước khi login
const USE_REAL_RECAPTCHA = false // Đổi thành true khi muốn dùng reCAPTCHA thật trong demo/production

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

  // Lấy setUser, setToken từ context để lưu user/token sau khi login thành công
  const { setUser, setToken } = useAuth()

  // navigate: chuyển trang sang dashboard sau khi login
  const navigate = useNavigate()

  // ===================== HANDLE INPUT =====================

  /**
   * handleInputChange:
   * - chạy khi user nhập email/password
   * - setFormData theo name của input
   * - clear error để UX tốt hơn (nhập lại thì mất thông báo lỗi cũ)
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  // ===================== HANDLE LOGIN LOGIC =====================

  /**
   * handleLogin:
   * - Thực hiện gọi API login bằng axios
   * - Nếu USE_REAL_RECAPTCHA = true -> bắt buộc có recaptchaToken thật
   * - Nếu USE_REAL_RECAPTCHA = false -> gửi token giả "TEST_BYPASS" (debug)
   * - Nếu login thành công:
   *    + lấy user, token từ response
   *    + setUser + setToken vào AuthContext (thường sẽ tự lưu localStorage)
   *    + reset captcha (optional)
   *    + navigate('/dashboard')
   * - Nếu thất bại: throw error để handleSubmit catch
   */
  const handleLogin = async () => {
    // Nếu dùng reCAPTCHA thật nhưng chưa có token -> không được login
    if (USE_REAL_RECAPTCHA && !recaptchaToken) {
      throw new Error('Vui lòng xác thực reCAPTCHA trước khi đăng nhập.')
    }

    // Token gửi xuống BE:
    // - dùng token thật nếu USE_REAL_RECAPTCHA = true
    // - dùng "TEST_BYPASS" nếu đang debug nhanh
    const tokenToSend = USE_REAL_RECAPTCHA ? recaptchaToken : 'TEST_BYPASS'

    // Log token (cắt 40 ký tự) để debug
    console.log(
      'Sending login request. recaptchaToken (first 40 chars):',
      tokenToSend ? tokenToSend.slice(0, 40) : null
    )

    try {
      // Gọi API POST /login
      // Body gồm: email, password, recaptchaToken
      const response = await axios.post(`${API_URL}/login`, {
        email: formData.email,
        password: formData.password,
        recaptchaToken: tokenToSend
      })

      console.log('Login Response:', response.data)

      // Nếu BE trả status = success
      if (response.data && response.data.status === 'success') {
        // Lấy user + token
        const { user, token } = response.data

        console.log('User:', user)
        console.log('Token (first 40 chars):', token ? token.slice(0, 40) : null)

        // Lưu vào AuthContext (và localStorage nếu context có xử lý)
        setUser(user)
        setToken(token)

        // Reset captcha (optional) để sau này login lại không bị token cũ
        try {
          recaptchaRef.current?.reset()
        } catch (_) { }

        // Điều hướng qua dashboard
        navigate('/dashboard')
        return

        // Nếu BE trả status = fail -> show message từ BE
      } else if (response.data && response.data.status === 'fail') {
        const msg = response.data.message || 'Đăng nhập thất bại'
        throw new Error(msg)

        // Nếu response không đúng format mong đợi
      } else {
        throw new Error('Đăng nhập thất bại')
      }
    } catch (err: any) {
      // Xử lý lỗi axios:
      // err.response: BE có trả về status code + data
      // err.request: không connect được server
      // else: lỗi khác
      console.error('Login error (axios):', err)

      if (err.response) {
        console.error('Server response data:', err.response.data)

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

      // default message nếu không có err.message
      let errorMessage = 'Có lỗi xảy ra. Vui lòng thử lại!'

      // Nếu có message cụ thể -> ưu tiên hiển thị
      if (err.message && err.message.includes('Backend đã chạy')) {
        errorMessage = err.message
      } else if (err.message) {
        errorMessage = err.message
      }

      // show error lên UI
      setError(errorMessage)

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
    // Container full màn hình, căn giữa
    // Background dùng ảnh campus
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: `url(${fptCampus})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay phủ đen để chữ nổi hơn */}
      <div className="absolute inset-0 bg-black/40"></div>

      {/* Card login */}
      <div className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 border-2 border-white/50 relative z-10">
        {/* Header logo + tiêu đề */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={fptLogo}
              alt="FPT Education"
              className="h-20 w-auto"
            />
          </div>
          <p className="text-gray-600 mt-2">Đăng nhập vào hệ thống</p>
        </div>

        {/* Form login: submit sẽ gọi handleSubmit */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nếu có lỗi -> hiển thị box đỏ */}
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {/* Input Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@fpt.edu.vn"
              required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
            />
          </div>

          {/* Input Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
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
                className="w-full px-4 py-3 pr-10 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* reCAPTCHA checkbox */}
          <div className="flex justify-center">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={RECAPTCHA_SITE_KEY}

              // onChange: khi user tick -> google trả về token
              onChange={(token) => {
                console.log('reCAPTCHA onChange token (first 40 chars):', token ? token.slice(0, 40) : null)
                setRecaptchaToken(token)
                setError('')
              }}

              // onExpired: token hết hạn -> set về null
              onExpired={() => {
                console.log('reCAPTCHA expired')
                setRecaptchaToken(null)
              }}
            />
          </div>

          {/* Button submit */}
          <button
            type="submit"
            // disable nếu đang loading
            // hoặc nếu dùng captcha thật mà chưa có token
            disabled={loading || (USE_REAL_RECAPTCHA && !recaptchaToken)}
            className="w-full bg-gradient-to-r from-orange-600 to-orange-500 text-white py-3 px-4 rounded-xl hover:shadow-lg hover:shadow-orange-500/50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
          >
            {/* Nếu loading thì hiện spinner */}
            {loading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Đang xử lý...
              </span>
            ) : (
              'Đăng nhập'
            )}
          </button>

          {/* Link chuyển trang register + reset password */}
          <div className="text-center space-y-3">
            <p className="text-sm text-gray-600">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="text-orange-600 hover:text-orange-700 font-semibold">
                Đăng ký ngay
              </Link>
            </p>
            <p className="text-sm text-gray-600">
              <Link to="/reset-password" className="text-orange-600 hover:text-orange-700 font-semibold">
                Quên mật khẩu?
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
