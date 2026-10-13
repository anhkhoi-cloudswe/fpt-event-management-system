import React, { useState } from 'react'
import { Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, BookOpen, ExternalLink } from 'lucide-react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { getPasswordError } from '../utils/validation'

interface WelcomePasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function WelcomePasswordModal({ isOpen, onClose }: WelcomePasswordModalProps) {
  const { showToast } = useToast()

  // Step 1: Policy Acceptance (Image 1)
  // Step 2: Password Setup
  const [step, setStep] = useState<'policy' | 'password'>('policy')
  const [agreed, setAgreed] = useState(false)
  const [agreeError, setAgreeError] = useState('')

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

  const handleConfirmPolicy = () => {
    if (!agreed) {
      setAgreeError('Vui lòng đánh dấu chọn đồng ý với điều khoản & chính sách trước khi tiếp tục.')
      return
    }
    setAgreeError('')
    setStep('password')
  }

  const handleSubmitPassword = async (e: React.FormEvent) => {
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      {/* Modal Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl dark:shadow-slate-950 max-w-xl w-full overflow-hidden border border-slate-100 dark:border-slate-800 transform scale-100 transition-all duration-300 animate-slide-in">
        
        {step === 'policy' ? (
          /* STEP 1: XÁC NHẬN CHÍNH SÁCH SỬ DỤNG DỊCH VỤ (HÌNH 1) */
          <div className="p-7 sm:p-9 space-y-6">
            {/* Header Brand */}
            <div className="flex items-center gap-3.5">
              <img
                src="/favicon.png"
                alt="FEMS Logo"
                className="w-12 h-12 rounded-2xl object-cover shadow-md shadow-orange-500/20 border border-orange-100 dark:border-slate-800"
              />
              <div>
                <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                  FPT Event Management
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
                    FEMS
                  </span>
                </span>
                <p className="text-xs text-slate-400 font-medium">Hệ thống Quản lý Sự kiện FPT University</p>
              </div>
            </div>

            {/* Title Banner */}
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                [FEMS] XÁC NHẬN CHÍNH SÁCH SỬ DỤNG DỊCH VỤ
              </h2>
              <p className="mt-3 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                Ban Quản Trị Hệ Thống Quản Lý Sự Kiện FPT (FEMS) xin trân trọng gửi tới Quý Thầy/Cô, Cán bộ và Sinh viên các Chính sách sử dụng dịch vụ của chúng tôi, bao gồm:
              </p>
            </div>

            {/* List Links matching Image 1 */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="text-orange-500 font-bold">•</span>
                <Link
                  to="/terms-and-policies?tab=terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-bold text-sm underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
                >
                  Điều khoản sử dụng dịch vụ
                  <ExternalLink className="w-3.5 h-3.5 no-underline inline" />
                </Link>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-orange-500 font-bold">•</span>
                <Link
                  to="/terms-and-policies?tab=privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-bold text-sm underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
                >
                  Cam kết bảo mật thông tin và bảo vệ dữ liệu cá nhân
                  <ExternalLink className="w-3.5 h-3.5 no-underline inline" />
                </Link>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-orange-500 font-bold">•</span>
                <Link
                  to="/terms-and-policies?tab=payment"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-bold text-sm underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
                >
                  Chính sách thanh toán
                  <ExternalLink className="w-3.5 h-3.5 no-underline inline" />
                </Link>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              Quý khách vui lòng đọc kỹ và xác nhận đồng ý với các nội dung quy định trước khi tiếp tục sử dụng hệ thống FPT Event Management System.
            </p>

            {/* Checkbox agreement */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked)
                    if (e.target.checked) setAgreeError('')
                  }}
                  className="mt-1 w-5 h-5 rounded-md border-2 border-slate-300 text-orange-600 focus:ring-orange-500 transition-all cursor-pointer accent-orange-600"
                />
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-normal">
                  Tôi xác nhận đã đọc, hiểu và đồng ý với các{' '}
                  <Link
                    to="/terms-and-policies?tab=overview"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-600 dark:text-orange-400 font-bold underline hover:text-orange-700"
                  >
                    Chính sách sử dụng dịch vụ
                  </Link>{' '}
                  của FPT Event Management System.
                </span>
              </label>

              {agreeError && (
                <div className="mt-3 text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {agreeError}
                </div>
              )}
            </div>

            {/* Action Button */}
            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleConfirmPolicy}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-md shadow-amber-400/30 transition-all hover:scale-[1.02] active:scale-98 flex items-center justify-center gap-2"
              >
                <span>Đồng ý & Tiếp tục</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2: NHẬP PASSWORD MỚI CHO TÀI KHOẢN GOOGLE */
          <div>
            <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-8 text-center text-white relative">
              <div className="mx-auto bg-white/20 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4 backdrop-blur-md border border-white/30 shadow-inner">
                <ShieldCheck className="w-10 h-10 text-white animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold">Thiết Lập Mật Khẩu Đăng Nhập</h2>
              <p className="text-orange-100 text-sm mt-2 leading-relaxed">
                Bạn đã đăng nhập thành công bằng tài khoản Google. Để bảo vệ tài khoản tốt hơn, hãy thiết lập mật khẩu đăng nhập trực tiếp.
              </p>
            </div>

            <form onSubmit={handleSubmitPassword} className="p-6 sm:p-8 space-y-5">
              {error && (
                <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* New Password Input */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Mật khẩu mới</label>
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
                    className="w-full px-4 py-3 pr-12 border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Mật khẩu tối thiểu 6 ký tự.</p>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Xác nhận mật khẩu mới</label>
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
                    className="w-full px-4 py-3 pr-12 border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none"
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
                  className="w-full bg-gradient-to-r from-orange-600 to-orange-500 text-white py-3.5 rounded-xl hover:shadow-lg hover:shadow-orange-500/30 font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 flex items-center justify-center gap-2"
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
                  className="w-full text-center py-2 text-slate-500 dark:text-slate-400 font-semibold hover:text-slate-800 dark:hover:text-slate-200 transition-colors text-sm"
                >
                  Bỏ qua bước này
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
