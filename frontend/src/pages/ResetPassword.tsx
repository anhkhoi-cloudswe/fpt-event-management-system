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

const API_URL = API_BASE_URL

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
  const recaptchaRef = useRef<ReCAPTCHA | null>(null)
  const navigate = useNavigate()
  const { showToast } = useToast()

  // Countdown timer for resend OTP
  useEffect(() => {
    let timer: number
    if (otpCountdown > 0) {
      timer = window.setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [otpCountdown])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email || !emailRegex.test(formData.email)) {
      setError('Vui lòng nhập email hợp lệ!')
      return
    }

    if (!recaptchaToken) {
      setError('Vui lòng xác nhận reCAPTCHA trước khi gửi OTP!')
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

      if (response.data.status === 'success' || response.status === 200) {
        // Lưu token nếu backend trả về
        if (response.data.token) {
          console.log('Token received:', response.data.token)
          setResetToken(response.data.token)
        } else {
          console.log('No token in response, will use email for reset')
        }
        setStep('otp')
        setOtpCountdown(60)
        setError('')
        showToast('success', 'Mã OTP đã được gửi đến email của bạn!')
        recaptchaRef.current?.reset()
        setRecaptchaToken(null)
      } else {
        setError(response.data.message || 'Gửi OTP thất bại')
      }
    } catch (err: any) {
      console.error('Send OTP Error:', err)
      const errorMsg = err.response?.data?.message ||
        err.response?.data?.error ||
        'Đã xảy ra lỗi. Vui lòng thử lại.'
      setError(errorMsg)
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

      if (response.data.status === 'success' || response.status === 200) {
        setOtpCountdown(60)
        setError('')
        showToast('success', 'Mã OTP mới đã được gửi lại!')
      }
    } catch (err: any) {
      console.error('Resend OTP Error:', err)
      setError(err.response?.data?.message || 'Không thể gửi lại OTP. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.otp || formData.otp.trim() === '') {
      setError('Vui lòng nhập mã OTP!')
      return
    }

    if (!formData.newPassword || formData.newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự!')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp!')
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

      if (response.data.status === 'success' || response.status === 200) {
        showToast('success', 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.')
        navigate('/login')
      } else {
        setError(response.data.message || 'Đặt lại mật khẩu thất bại')
      }
    } catch (err: any) {
      console.error('Reset Password Error:', err)
      console.error('Error response data:', err.response?.data)
      console.error('Error response status:', err.response?.status)
      const errorMsg = err.response?.data?.message ||
        err.response?.data?.error ||
        'Đã xảy ra lỗi. Vui lòng thử lại.'
      setError(errorMsg)
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
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40"></div>

      <div className="max-w-md w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 border-2 border-white/50 relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={fptLogo}
              alt="FPT Education"
              className="h-20 w-auto"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {step === 'email' ? 'Đặt lại mật khẩu' : 'Xác thực OTP'}
          </h1>
          <p className="text-gray-600 mt-2">
            {step === 'email' ? 'Nhập email để nhận mã OTP' : 'Nhập mã OTP và mật khẩu mới'}
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
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
            </div>

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
                placeholder="email@fpt.edu.vn"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !recaptchaToken}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Đang gửi...' : 'Gửi mã OTP'}
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Quay lại đăng nhập
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-center">
                Mã xác thực OTP
              </label>
              
              <OtpInput
                value={formData.otp}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, otp: value }))
                  setError('')
                }}
              />

              <div className="flex items-center justify-between mt-1 px-1">
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
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium focus:outline-none"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Dán mã OTP
                </button>

                <div className="text-xs text-gray-500">
                  {otpCountdown > 0 ? (
                    <span>Gửi lại mã sau <strong className="text-green-600 font-semibold">{otpCountdown}s</strong></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="text-green-600 hover:text-green-700 font-medium focus:outline-none"
                    >
                      Gửi lại mã OTP
                    </button>
                  )}
                </div>
              </div>

              {otpCountdown > 0 && (
                <p className="text-xs text-green-600 mt-2 text-center">
                  Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
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
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  placeholder="Nhập lại mật khẩu mới"
                  required
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setFormData({ email: formData.email, otp: '', newPassword: '', confirmPassword: '' })
                  setError('')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Thay đổi email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
