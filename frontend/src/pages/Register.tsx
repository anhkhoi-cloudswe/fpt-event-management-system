import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GraduationCap, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'
import ReCAPTCHA from 'react-google-recaptcha'
import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'
import {
  getEmailError,
  getPhoneError,
  getFullNameError,
  getPasswordError
} from '../utils/validation'
import { useToast, ToastContainer } from '../components/Toast'

// Use proxy to avoid CORS issues in development
// Cấu hình proxy API để tránh lỗi Cross-Origin khi chạy localhost
const API_URL = '/api'

// Configure axios defaults
axios.defaults.headers.common['Content-Type'] = 'application/json'
axios.defaults.headers.common['Accept'] = 'application/json'

// Định nghĩa cấu trúc dữ liệu cho Form đăng ký
interface FormData {
  email: string
  password: string
  confirmPassword: string
  fullName: string
  phone: string
  otp: string
}

// reCAPTCHA site key - ĐỌC TỪ BIẾN MÔI TRƯỜNG
// Cấu hình trong file .env: VITE_RECAPTCHA_SITE_KEY
// Đăng ký tại: https://www.google.com/recaptcha/admin/create
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LdvPQIsAAAAAG7glbICpFiBR9o5MhboFU4JvxAJ'
// Cờ bật/tắt chế độ kiểm tra Captcha thật (True = Bắt buộc tích Captcha)
const USE_REAL_RECAPTCHA = true

export default function Register() {
  // Toast notification system
  const { toasts, removeToast, success, error: showError, info } = useToast()

  // CÁC STATE QUẢN LÝ TRẠNG THÁI FORM
  const [isOtpSent, setIsOtpSent] = useState(false) // Kiểm tra xem OTP đã được gửi đi chưa
  const [otpCountdown, setOtpCountdown] = useState(0) // Đếm ngược thời gian chờ gửi lại OTP
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    otp: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('') // Lưu lỗi hiển thị
  const [loading, setLoading] = useState(false) // Trạng thái loading
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null) // Token Captcha
  const recaptchaRef = useRef<ReCAPTCHA>(null) // Ref điều khiển Widget Captcha
  const [showPassword, setShowPassword] = useState(false) // Toggle hiển thị mật khẩu
  const [showConfirmPassword, setShowConfirmPassword] = useState(false) // Toggle hiển thị xác nhận mật khẩu
  const navigate = useNavigate()

  // Countdown timer for resend OTP
  // LOGIC ĐẾM NGƯỢC: Chạy mỗi khi otpCountdown thay đổi
  // useEffect này thiết lập một bộ đếm thời gian (timer) để giảm giá trị otpCountdown đi 1 mỗi giây
  // useEffect là hook cho phép thực thi các hiệu ứng phụ trong component
  useEffect(() => {
    let timer: number
    if (otpCountdown > 0) {
      // Giảm 1 giây sau mỗi 1000ms
      timer = window.setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000)
    }
    return () => clearTimeout(timer) // Dọn dẹp timer khi component unmount
  }, [otpCountdown])

  // Cập nhật state khi nhập liệu
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    // real-time validation when field has been touched
    if (touched[name]) {
      const fieldError = validateField(name, value)
      setErrors(prev => (fieldError ? { ...prev, [name]: fieldError } : Object.keys(prev).includes(name) ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== name)) : prev))
    }
  }

  const handleFieldBlur = (name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    const value = formData[name as keyof FormData] as string
    const fieldError = validateField(name, value)
    setErrors(prev => (fieldError ? { ...prev, [name]: fieldError } : Object.keys(prev).includes(name) ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== name)) : prev))
  }

  const validateField = (name: string, value: string): string | null => {
    switch (name) {
      case 'fullName':
        return getFullNameError(value)
      case 'email':
        return getEmailError(value)
      case 'phone':
        return getPhoneError(value)
      case 'password':
        return getPasswordError(value)
      case 'confirmPassword':
        if (value !== formData.password) return 'Mật khẩu xác nhận không khớp!'
        return null
      default:
        return null
    }
  }

  // Validate khớp mật khẩu
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    const fullNameError = getFullNameError(formData.fullName)
    if (fullNameError) newErrors.fullName = fullNameError

    const phoneError = getPhoneError(formData.phone)
    if (phoneError) newErrors.phone = phoneError

    const emailError = getEmailError(formData.email)
    if (emailError) newErrors.email = emailError

    const passwordError = getPasswordError(formData.password)
    if (passwordError) newErrors.password = passwordError

    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp!'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // HÀM XỬ LÝ BƯỚC 1: GỬI YÊU CẦU LẤY MÃ OTP
  const handleSendOtp = async () => {
    // Validate reCAPTCHA nếu dùng mode thật
    if (USE_REAL_RECAPTCHA && !recaptchaToken) {
      setError('Vui lòng xác nhận bạn không phải là robot!')
      return
    }

    // Validate các trường bắt buộc trước khi gọi API
    // Run validation util before sending OTP
    if (!validateForm()) return

    setLoading(true)
    try {
      console.log('Sending OTP request:', {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone
      })

      // Gọi API backend để gửi OTP về email
      const response = await axios.post(`${API_URL}/register/send-otp`, {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        recaptchaToken: USE_REAL_RECAPTCHA ? recaptchaToken : 'TEST_BYPASS'
      })

      console.log('Send OTP Response status:', response.status)
      console.log('Send OTP Response data:', response.data)

      // Enable OTP field and start countdown when backend accepted the request
      const ok = (response.status >= 200 && response.status < 300) || response.data?.status === 'success' || response.data?.success === true
      setIsOtpSent(true)
      setOtpCountdown(60)
      setError('')

      if (ok) {
        success('Mã OTP đã được gửi đến email của bạn!')
      } else {
        const warningMsg = response.data?.message || 'Vui lòng kiểm tra email để lấy mã OTP'
        info(warningMsg)
      }
    } catch (err: any) {
      console.error('Send OTP Error:', err)
      console.error('Error response:', err.response?.data)

      const errorMsg = err.response?.data?.message ||
        err.response?.data?.error ||
        'Đã xảy ra lỗi khi gửi OTP. Vui lòng thử lại.'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // HÀM GỬI LẠI OTP (Nếu người dùng không nhận được mã lần đầu)
  const handleResendOtp = async () => {
    setLoading(true)
    try {
      console.log('Resending OTP to:', formData.email)

      const response = await axios.post(`${API_URL}/register/resend-otp`, {
        email: formData.email
      })

      console.log('Resend OTP Response status:', response.status)
      console.log('Resend OTP Response data:', response.data)

      setOtpCountdown(60)
      setError('')

      const ok = (response.status >= 200 && response.status < 300) || response.data?.status === 'success' || response.data?.success === true
      if (ok) {
        success('Mã OTP mới đã được gửi lại!')
      } else {
        info(response.data?.message || 'Mã OTP đã được gửi lại. Vui lòng kiểm tra email.')
      }
    } catch (err: any) {
      console.error('Resend OTP Error:', err)
      const errorMsg = err.response?.data?.message ||
        err.response?.data?.error ||
        'Không thể gửi lại OTP. Vui lòng thử lại.'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // HÀM XỬ LÝ BƯỚC 2: XÁC THỰC OTP VÀ HOÀN TẤT ĐĂNG KÝ
  const handleRegister = async () => {
    try {
      // Gọi API verify OTP
      const response = await axios.post(`${API_URL}/register/verify-otp`, {
        email: formData.email,
        otp: formData.otp, // Mã người dùng nhập
        fullName: formData.fullName,
        phone: formData.phone,
        password: formData.password,
        recaptchaToken: USE_REAL_RECAPTCHA ? recaptchaToken : 'TEST_BYPASS'
      })

      console.log('Register Response status:', response.status)
      console.log('Register Response data:', response.data)

      const ok = (response.status >= 200 && response.status < 300) || response.data?.status === 'success' || response.data?.success === true
      if (ok) {
        success('Đăng ký thành công! Vui lòng đăng nhập.')
        setTimeout(() => navigate('/login'), 1500)
      } else {
        showError(response.data?.message || 'Đăng ký thất bại')
      }
    } catch (err: any) {
      console.error('Register Error:', err)
      setError(
        err.response?.data?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.'
      )
    }
  }

  // SỰ KIỆN SUBMIT FORM TỔNG
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)
    setError('')

    try {
      await handleRegister() // Gọi hàm xác thực OTP
    } catch (err: any) {
      console.error('Register Error:', err)

      let errorMessage = 'Có lỗi xảy ra. Vui lòng thử lại!'

      // Xử lý các loại lỗi kết nối / backend
      if (err.message && err.message.includes('Backend đã chạy')) {
        errorMessage = err.message
      } else if (err.response) {
        // Server responded with error
        errorMessage = err.response.data?.message || `Lỗi ${err.response.status}: ${err.response.statusText}`
      } else if (err.request) {
        // Request made but no response (Lỗi mạng hoặc Server down)
        errorMessage = 'Không thể kết nối đến server!\n\n⚠️ Vui lòng kiểm tra:\n1. Backend đã chạy chưa? (http://localhost:8080)\n2. CORS đã được cấu hình trong backend chưa?'
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: `url(${fptCampus})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay: Lớp phủ đen mờ */}
      <div className="absolute inset-0 bg-black/40"></div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 border-2 border-white/50 relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={fptLogo}
              alt="FPT Education"
              className="h-20 w-auto"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Tạo tài khoản</h1>
          <p className="text-gray-600 mt-2">Đăng ký vào hệ thống</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Hiển thị lỗi chung */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Input Họ tên */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
              Họ và tên
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              value={formData.fullName}
              onChange={handleInputChange}
              onBlur={() => handleFieldBlur('fullName')}
              placeholder="Nguyễn Văn A"
              required
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.fullName ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
          </div>

          {/* Input Số điện thoại */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Số điện thoại
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleInputChange}
              onBlur={() => handleFieldBlur('phone')}
              placeholder="0901234567"
              required
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          {/* Input Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              onBlur={() => handleFieldBlur('email')}
              placeholder="email@fpt.edu.vn"
              required
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Input Mật khẩu */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('password')}
                placeholder="Nhập mật khẩu"
                required
                className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* Input Xác nhận mật khẩu */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Xác nhận mật khẩu
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('confirmPassword')}
                placeholder="Nhập lại mật khẩu"
                required
                className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* KHU VỰC NHẬP OTP (Kết hợp Input + Nút Gửi) */}
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
              Mã OTP
            </label>
            <div className="flex gap-2">
              <input
                id="otp"
                name="otp"
                type="text"
                value={formData.otp}
                onChange={handleInputChange}
                placeholder="Nhập mã OTP"
                required
                // Chỉ cho phép nhập khi đã gửi OTP thành công
                disabled={!isOtpSent}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
              {/* Nút Gửi OTP / Gửi lại */}
              <button
                type="button"
                onClick={isOtpSent ? handleResendOtp : handleSendOtp}
                // Disable nếu chưa nhập email, hoặc đang đếm ngược, hoặc đang loading
                disabled={!formData.email || (isOtpSent && otpCountdown > 0) || loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap text-sm"
              >
                {isOtpSent
                  ? (otpCountdown > 0 ? `${otpCountdown}s` : 'Gửi lại') // Hiển thị số giây đếm ngược
                  : 'Gửi OTP'
                }
              </button>
            </div>
            {isOtpSent && (
              <p className="text-xs text-green-600 mt-1">
                Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.
              </p>
            )}
          </div>

          {/* Widget Captcha */}
          <div className="flex justify-center">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={RECAPTCHA_SITE_KEY}
              onChange={(token) => {
                setRecaptchaToken(token)
                setError('')
              }}
              onExpired={() => setRecaptchaToken(null)}
            />
          </div>

          {/* Nút Đăng ký (Final Submit) */}
          <button
            type="submit"
            // Chỉ bấm được khi đã Gửi OTP và không đang loading
            disabled={loading || !isOtpSent}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </span>
            ) : (
              'Đăng ký'
            )}
          </button>

          {/* Link chuyển sang trang Đăng nhập */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Đăng nhập
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}