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
      {/* Overlay phủ đen nhẹ */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />

      <div className="max-w-md w-full bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-8 shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500/50 transition-all duration-500 relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3.5">
            <img
              src={fptLogo}
              alt="FPT Education"
              className="h-16 w-auto"
            />
          </div>
          <h1 className="text-lg font-black text-slate-800">
            {step === 'email' ? 'Đặt lại mật khẩu' : 'Xác thực OTP'}
          </h1>
          <p className="text-xs font-semibold text-slate-450 mt-1">
            {step === 'email' ? 'Nhập email trường để nhận mã OTP xác thực' : 'Nhập mã OTP và thiết lập mật khẩu mới'}
          </p>
        </div>

        {error && (
          <div className="mb-5 bg-rose-50 border border-rose-250 text-rose-700 px-4.5 py-3 rounded-2xl text-xs font-bold animate-pulse flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            {RECAPTCHA_SITE_KEY && (
              <div className="flex justify-center border border-slate-200/40 rounded-2xl p-2.5 bg-white/40 mb-2">
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
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-extrabold text-slate-600 uppercase tracking-wide pl-1">
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
                className="w-full px-4 py-3 bg-white/50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-850 font-semibold placeholder-slate-400 text-sm shadow-sm transition-all duration-300"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !recaptchaToken}
              className="w-full bg-gradient-to-r from-orange-600 via-orange-550 to-orange-500 text-white py-3.5 px-4 rounded-2xl hover:shadow-lg hover:shadow-orange-500/25 focus:outline-none font-extrabold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-98 shadow-md"
            >
              {loading ? 'Đang gửi mã...' : 'Gửi mã OTP'}
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-xs font-bold text-orange-650 hover:text-orange-700 transition-colors"
              >
                ← Quay lại đăng nhập
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5">
             <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-600 uppercase tracking-wide text-center">
                Mã xác thực OTP
              </label>
              
              <OtpInput
                value={formData.otp}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, otp: value }))
                  setError('')
                }}
              />

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

                <div className="text-xs text-slate-500 font-semibold">
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

              {otpCountdown > 0 && (
                <p className="text-[11px] text-emerald-650 mt-2 text-center font-bold">
                  Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="block text-xs font-extrabold text-slate-600 uppercase tracking-wide pl-1">
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
                  className="w-full px-4 py-3 pr-10 bg-white/50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-850 font-semibold placeholder-slate-400 text-sm shadow-sm transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-xs font-extrabold text-slate-600 uppercase tracking-wide pl-1">
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
                  className="w-full px-4 py-3 pr-10 bg-white/50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-855 font-semibold placeholder-slate-400 text-sm shadow-sm transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
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
