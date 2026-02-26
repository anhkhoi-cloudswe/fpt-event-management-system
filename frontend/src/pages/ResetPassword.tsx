import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GraduationCap, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'
import fptLogo from '../assets/fpt-logo.png'
import fptCampus from '../assets/dai-hoc-fpt-tp-hcm-1.jpeg'
import { useToast } from '../contexts/ToastContext'

const API_URL = '/api'

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

    setLoading(true)
    try {
      console.log('Sending reset password OTP to:', formData.email)

      const response = await axios.post(`${API_URL}/forgot-password`, {
        email: formData.email
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
      } else {
        setError(response.data.message || 'Gửi OTP thất bại')
      }
    } catch (err: any) {
      console.error('Send OTP Error:', err)
      const errorMsg = err.response?.data?.message ||
        err.response?.data?.error ||
        'Đã xảy ra lỗi. Vui lòng thử lại.'
      setError(errorMsg)
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
              disabled={loading}
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpCountdown > 0 || loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                >
                  {otpCountdown > 0 ? `${otpCountdown}s` : 'Gửi lại'}
                </button>
              </div>
              {otpCountdown > 0 && (
                <p className="text-xs text-green-600 mt-1">
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
