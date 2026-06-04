import React, { useState } from 'react'
import { Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react'
import axios from 'axios'
import { useToast } from '../contexts/ToastContext'
import { getPasswordError } from '../utils/validation'

interface WelcomePasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function WelcomePasswordModal({ isOpen, onClose }: WelcomePasswordModalProps) {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSkip = () => {
    sessionStorage.removeItem('is_new_user')
    showToast('info', 'Bạn có thể tự thiết lập mật khẩu sau này bằng tính năng Quên mật khẩu tại trang Đăng nhập.')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const pwdError = getPasswordError(password)
    if (pwdError) {
      setError(pwdError)
      return
    }

    if (password !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp')
      return
    }

    setLoading(true)

    try {
      const response = await axios.post('/api/auth/update-password', {
        password: password
      }, {
        withCredentials: true
      })

      if (response.data && response.data.status === 'success') {
        showToast('success', 'Thiết lập mật khẩu thành công! Bạn có thể sử dụng mật khẩu này để đăng nhập lần sau.')
        sessionStorage.removeItem('is_new_user')
        onClose()
      } else {
        setError(response.data?.message || 'Có lỗi xảy ra khi cập nhật mật khẩu')
      }
    } catch (err: any) {
      console.error('Update password error:', err)
      const serverMsg = err.response?.data?.message || err.response?.data?.error
      setError(serverMsg || 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      {/* Modal Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl dark:shadow-slate-950 max-w-md w-full overflow-hidden border border-orange-100 transform scale-100 transition-all duration-300 animate-slide-in">
        {/* Decorative top bar with orange FPT gradient */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-8 text-center text-white relative">
          <div className="mx-auto bg-white/20 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4 backdrop-blur-md border border-white/30 shadow-inner">
            <ShieldCheck className="w-10 h-10 text-white animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold">Chào Mừng Thành Viên Mới!</h2>
          <p className="text-orange-100 text-sm mt-2 leading-relaxed">
            Bạn đã đăng nhập thành công bằng tài khoản Google. Để bảo vệ tài khoản tốt hơn, hãy thiết lập mật khẩu đăng nhập trực tiếp.
          </p>
        </div>

        {/* Modal Content / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* New Password Input */}
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">Mật khẩu mới</label>
            <div className="relative block w-full">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                placeholder="Nhập mật khẩu của bạn"
                required
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="text-xs text-slate-500">Mật khẩu tối thiểu 6 ký tự, gồm ít nhất 1 chữ cái và 1 chữ số.</p>
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">Xác nhận mật khẩu mới</label>
            <div className="relative block w-full">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
                placeholder="Nhập lại mật khẩu"
                required
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-500 text-white py-3 rounded-xl hover:shadow-lg hover:shadow-orange-500/30 font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Đang thiết lập...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Lưu mật khẩu & Bắt đầu
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="w-full text-center py-2.5 text-slate-500 font-semibold hover:text-slate-800 transition-colors text-sm"
            >
              Bỏ qua bước này
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

