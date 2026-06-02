import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  User,
  Phone,
  Mail,
  Shield,
  Calendar,
  Wallet,
  Globe,
  Moon,
  Sun,
  AlertCircle,
  HelpCircle,
  Lock,
  ChevronRight,
  Info,
  CheckCircle2
} from 'lucide-react'
import { Link } from 'react-router-dom'

const timezones = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (GMT+7)' },
  { value: 'UTC', label: 'UTC (GMT+0)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (GMT+9)' },
  { value: 'Europe/London', label: 'Europe/London (GMT+1)' },
  { value: 'America/New_York', label: 'America/New_York (GMT-4)' }
]

export default function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const { showToast } = useToast()

  // Tab state: profile vs security
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile')

  // CRITICAL FIX: Read theme directly from document.documentElement.classList
  // This is the SOURCE OF TRUTH set by AuthContext, NOT localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark')
  })

  // Phone settings
  const [phone, setPhone] = useState(user?.phone || '')

  // Full Name settings
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [fullNameError, setFullNameError] = useState('')

  // Timezone states
  const [timezone, setTimezone] = useState(localStorage.getItem('user_timezone') || 'Asia/Ho_Chi_Minh')
  const [autoDetectTz, setAutoDetectTz] = useState(localStorage.getItem('auto_timezone') !== 'false')

  // Password tab states
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)

  // Standard user password change states
  const [standardPassword, setStandardPassword] = useState('')
  const [standardConfirmPassword, setStandardConfirmPassword] = useState('')
  const [standardPasswordError, setStandardPasswordError] = useState('')
  const [isUpdatingStandardPassword, setIsUpdatingStandardPassword] = useState(false)

  // Close account state
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [isClosingAccount, setIsClosingAccount] = useState(false)

  // Error states for phone input
  const [phoneError, setPhoneError] = useState('')

  // Sync phone & theme state when user context is loaded/refreshed
  useEffect(() => {
    if (user?.phone) {
      setPhone(user.phone)
    }
    if (user?.fullName) {
      setFullName(user.fullName)
    }
    if (user?.id) {
      setIsDarkMode(localStorage.getItem('theme_user_' + user.id) === 'dark')
    }
  }, [user])

  // Sync theme changes
  useEffect(() => {
    if (user?.id) {
      const currentTheme = isDarkMode ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', isDarkMode)
      localStorage.setItem('theme', currentTheme)
      localStorage.setItem('theme_user_' + user.id, currentTheme)
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
    window.dispatchEvent(new Event('theme-change'))
  }, [isDarkMode, user])

  // Sync theme changes reactively when updated from header
  useEffect(() => {
    const handleThemeChange = () => {
      if (user?.id) {
        setIsDarkMode(localStorage.getItem('theme_user_' + user.id) === 'dark')
      } else {
        setIsDarkMode(localStorage.getItem('theme') === 'dark')
      }
    }
    window.addEventListener('theme-change', handleThemeChange)
    return () => window.removeEventListener('theme-change', handleThemeChange)
  }, [user])

  // Theme change action call to DB
  const handleToggleTheme = async () => {
    const nextTheme = !isDarkMode ? 'dark' : 'light'
    setIsDarkMode(!isDarkMode)

    if (user) {
      localStorage.setItem('theme_user_' + user.id, nextTheme)
      localStorage.setItem('theme', nextTheme)
      try {
        await fetch('/api/auth/update-theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ theme: nextTheme }),
        })
        await refreshUser()
      } catch (err) {
        console.error('Failed to sync theme with DB:', err)
      }
    }
  }

  // Sync auto-timezone check
  useEffect(() => {
    if (autoDetectTz) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      setTimezone(detected)
      localStorage.setItem('user_timezone', detected)
      localStorage.setItem('auto_timezone', 'true')
    } else {
      localStorage.setItem('auto_timezone', 'false')
    }
  }, [autoDetectTz])

  // Input phone number validation
  const validatePhone = (value: string): boolean => {
    const cleaned = value.trim()
    if (!cleaned) {
      setPhoneError('Số điện thoại không được để trống')
      return false
    }
    const phoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/
    if (!phoneRegex.test(cleaned)) {
      setPhoneError('Số điện thoại Việt Nam không hợp lệ (10 chữ số, ví dụ: 0912345678)')
      return false
    }
    setPhoneError('')
    return true
  }

  // Validate full name
  const validateFullName = (value: string): boolean => {
    const cleaned = value.trim()
    if (!cleaned) {
      setFullNameError('Họ và tên không được để trống')
      return false
    }
    if (cleaned.length < 2) {
      setFullNameError('Họ và tên phải có ít nhất 2 ký tự')
      return false
    }
    if (cleaned.length > 100) {
      setFullNameError('Họ và tên không được vượt quá 100 ký tự')
      return false
    }
    setFullNameError('')
    return true
  }

  // Handle phone update action directly to DB
  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePhone(phone)) {
      showToast('error', 'Vui lòng kiểm tra lỗi nhập liệu!')
      return
    }

    try {
      const res = await fetch('/api/auth/update-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phone.trim() }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', 'Cập nhật số điện thoại thành công!')
        localStorage.removeItem('user_phone_' + user?.id)
        await refreshUser()
      } else {
        showToast('error', data.message || 'Cập nhật số điện thoại thất bại!')
      }
    } catch (err) {
      showToast('error', 'Có lỗi kết nối mạng xảy ra!')
    }
  }

  // Handle full name update action directly to DB
  const handleUpdateFullName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateFullName(fullName)) {
      showToast('error', 'Vui lòng kiểm tra lỗi nhập liệu!')
      return
    }

    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullName: fullName.trim() }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', 'Cập nhật họ và tên thành công!')
        await refreshUser()
      } else {
        showToast('error', data.message || 'Cập nhật họ và tên thất bại!')
      }
    } catch (err) {
      showToast('error', 'Có lỗi kết nối mạng xảy ra!')
    }
  }

  // Handle Set SSO Password
  const handleSetSSOPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp')
      return
    }

    setIsSubmittingPassword(true)
    setPasswordError('')

    try {
      const res = await fetch('/api/auth/set-sso-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', 'Thiết lập mật khẩu thành công!')
        setShowSetPasswordModal(false)
        setNewPassword('')
        setConfirmPassword('')
        await refreshUser()
      } else {
        setPasswordError(data.message || 'Thiết lập mật khẩu thất bại')
      }
    } catch (err) {
      setPasswordError('Lỗi kết nối mạng')
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  // Handle standard password change
  const handleUpdateStandardPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (standardPassword.length < 6) {
      setStandardPasswordError('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }
    if (standardPassword !== standardConfirmPassword) {
      setStandardPasswordError('Mật khẩu xác nhận không khớp')
      return
    }

    setIsUpdatingStandardPassword(true)
    setStandardPasswordError('')

    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: standardPassword }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', 'Đổi mật khẩu thành công!')
        setStandardPassword('')
        setStandardConfirmPassword('')
      } else {
        setStandardPasswordError(data.message || 'Đổi mật khẩu thất bại')
      }
    } catch (err) {
      setStandardPasswordError('Lỗi kết nối mạng')
    } finally {
      setIsUpdatingStandardPassword(false)
    }
  }

  // Handle soft account delete
  const handleCloseAccount = async () => {
    setIsClosingAccount(true)
    try {
      const res = await fetch('/api/auth/close-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (res.ok) {
        showToast('success', 'Yêu cầu đóng tài khoản thành công!')
        setShowCloseModal(false)
        logout()
      } else {
        const data = await res.json()
        showToast('error', data.message || 'Yêu cầu xóa tài khoản thất bại')
      }
    } catch (err) {
      showToast('error', 'Có lỗi kết nối mạng xảy ra!')
    } finally {
      setIsClosingAccount(false)
    }
  }

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Chưa cập nhật'

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
      {/* Profile Banner */}
      <div className={`relative overflow-hidden rounded-3xl border p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-xl transition-colors duration-500 ${isDarkMode
        ? 'bg-slate-900 border-slate-800 text-white shadow-slate-950/20'
        : 'bg-white/80 border-orange-100/60 shadow-orange-100/10 backdrop-blur-md'
        }`}>
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-orange-500/20 transition-transform group-hover:scale-105 duration-300">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 bg-orange-600 text-white p-1.5 rounded-full border-2 border-white dark:border-slate-900 shadow">
            <Shield size={14} />
          </div>
        </div>

        <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 justify-center md:justify-start">
            <h1 className="text-xl md:text-2xl font-black truncate text-slate-900 dark:text-white">{user?.fullName}</h1>
            <span className="inline-flex self-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-200/50 dark:border-orange-500/15">
              {user?.role}
            </span>
          </div>
          <p className="text-sm text-slate-400 truncate font-medium flex items-center gap-1.5 justify-center md:justify-start">
            <Mail size={15} className="text-slate-400" />
            {user?.email}
          </p>
          <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5 justify-center md:justify-start">
            <Calendar size={15} className="text-slate-400" />
            Tham gia ngày {joinDate}
          </p>
        </div>

        {user?.wallet !== undefined && (
          <div className={`px-5 py-4 rounded-2xl border text-center md:text-right min-w-[150px] shadow-sm ${isDarkMode
            ? 'bg-slate-950/50 border-slate-800/80 text-orange-400'
            : 'bg-orange-50/50 border-orange-100 text-slate-800'
            }`}>
            <div className="flex items-center justify-center md:justify-end gap-1.5 text-xs text-slate-400 font-bold mb-1">
              <Wallet size={14} className="text-orange-500" />
              <span>Số dư ví điện tử</span>
            </div>
            <p className="text-xl font-black">{user.wallet.toLocaleString('vi-VN')} ₫</p>
          </div>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 text-sm font-extrabold transition-all relative ${activeTab === 'profile'
            ? 'text-orange-600 dark:text-orange-500'
            : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
            }`}
        >
          Thông tin cá nhân
          {activeTab === 'profile' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 text-sm font-extrabold transition-all relative ${activeTab === 'security'
            ? 'text-orange-600 dark:text-orange-500'
            : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
            }`}
        >
          Bảo mật & Tài khoản
          {activeTab === 'security' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main content left */}
          <div className="md:col-span-2 space-y-8">
            {/* Form contact */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Phone size={18} className="text-orange-500" />
                <span>Thông tin Liên hệ</span>
              </h3>

              <form onSubmit={handleUpdatePhone} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider pl-1">
                    Số điện thoại
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        if (phoneError) validatePhone(e.target.value)
                      }}
                      placeholder="Chưa cập nhật số điện thoại"
                      className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${phoneError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-600'
                        : isDarkMode ? 'bg-slate-900 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white' : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-900'
                        }`}
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all"
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                  {phoneError && (
                    <p className="text-xs text-rose-600 font-bold pl-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {phoneError}
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Full Name Update Form */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <User size={18} className="text-orange-500" />
                <span>Họ và Tên</span>
              </h3>

              <form onSubmit={handleUpdateFullName} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider pl-1">
                    Họ và Tên Đầy Đủ
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value)
                        if (fullNameError) validateFullName(e.target.value)
                      }}
                      placeholder="Nhập họ và tên đầy đủ"
                      className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${fullNameError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-600 dark:bg-rose-500/10 dark:border-rose-700 dark:text-rose-400'
                        : isDarkMode ? 'bg-slate-900 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white' : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-900'
                        }`}
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all"
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                  {fullNameError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-bold pl-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {fullNameError}
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Config theme and timezone */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Globe size={18} className="text-orange-500" />
                <span>Giao diện & Khu vực</span>
              </h3>

              <div className="space-y-6">
                {/* Theme selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                  <div>
                    <h4 className="text-sm font-black text-slate-850 dark:text-slate-100">Giao diện ứng dụng</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Tự do thay đổi độ tương phản màn hình (Sáng hoặc Tối)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleTheme}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all min-w-[160px] active:scale-98 ${isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {isDarkMode ? <Moon size={15} className="text-orange-400" /> : <Sun size={15} className="text-orange-500" />}
                      <span>{isDarkMode ? 'Bản tối (Dark)' : 'Bản sáng (Light)'}</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-orange-500' : 'bg-slate-350'}`}>
                      <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.25 transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </button>
                </div>

                {/* Timezone selector */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-850 dark:text-slate-100">Múi giờ làm việc</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Cài đặt hiển thị múi giờ để đồng bộ chính xác lịch sự kiện</p>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoDetectTz}
                        onChange={(e) => setAutoDetectTz(e.target.checked)}
                        className="accent-orange-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs text-slate-500 font-bold">Tự động check</span>
                    </label>
                  </div>

                  <div className="relative max-w-xs">
                    <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <select
                      disabled={autoDetectTz}
                      value={timezone}
                      onChange={(e) => {
                        setTimezone(e.target.value)
                        localStorage.setItem('user_timezone', e.target.value)
                      }}
                      className={`w-full pl-9 pr-8 py-2.5 text-xs font-semibold rounded-xl border outline-none appearance-none transition-all cursor-pointer ${isDarkMode
                        ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200 disabled:opacity-50'
                        : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800 disabled:opacity-50'
                        }`}
                    >
                      {timezones.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                    <ChevronRight size={14} className="absolute right-3 top-3.5 text-slate-400 rotate-90 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar right */}
          <div className="space-y-8">
            <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Info size={16} className="text-orange-500" />
                <span>Quy trình Thay đổi Hồ sơ</span>
              </h3>

              <div className="space-y-4 text-xs leading-relaxed text-slate-400 font-medium">
                <div className="p-3 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
                  <p>
                    <strong>Số điện thoại</strong> có thể tự điều chỉnh và lưu trữ tức thì thông qua form bên cạnh để hỗ trợ liên lạc nhanh chóng.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-amber-550 flex-shrink-0 mt-0.5" />
                  <p>
                    Các thông tin định danh pháp lý như <strong>Họ và tên</strong>, <strong>Email trường học</strong>, và <strong>Vai trò hệ thống</strong> không thể tự cập nhật nhằm phòng chống gian lận danh tính.
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">
                    Các bước yêu cầu thay đổi:
                  </p>
                  <ol className="list-decimal list-inside pl-1 space-y-1.5">
                    <li>Gửi email từ hòm thư FPT chính thức tới ban quản trị tại <a href="mailto:support@fpt.edu.vn" className="text-orange-600 font-bold hover:underline">support@fpt.edu.vn</a>.</li>
                    <li>Cung cấp mã số sinh viên/mã cán bộ và đính kèm bản sao thẻ sinh viên/CMND đối chiếu.</li>
                    <li>Bộ phận hỗ trợ kỹ thuật FPT Event sẽ xử lý yêu cầu thay đổi trong vòng <strong>24h làm việc</strong>.</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Security & Account */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {/* Password Tab content */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Lock size={18} className="text-orange-500" />
                <span>Bảo mật mật khẩu</span>
              </h3>

              {user?.ssoProvider === 'GOOGLE' ? (
                // SSO warning banner matching Figure 4 (amber/yellow premium alert block)
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/25 text-amber-800 dark:text-amber-350 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-550 flex-shrink-0 mt-0.5" />
                      <div className="text-sm font-medium leading-relaxed">
                        <p className="font-extrabold text-amber-900 dark:text-amber-200">Bạn đăng nhập qua Google</p>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          Tài khoản của bạn hiện tại chưa có mật khẩu được lưu trữ trên máy chủ FPT Event vì bạn sử dụng phương thức đăng nhập một lần (Single Sign On).
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 font-semibold pl-1 leading-relaxed">
                    Bạn có thể thiết lập mật khẩu riêng bất cứ lúc nào. Việc này cho phép bạn đăng nhập linh hoạt bằng cả tài khoản Google lẫn email/mật khẩu trực tiếp.
                  </p>

                  <button
                    onClick={() => setShowSetPasswordModal(true)}
                    className="px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-2xl shadow-md shadow-orange-500/10 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Lock size={14} />
                    <span>Thiết lập mật khẩu mới</span>
                  </button>
                </div>
              ) : (
                // Standard Password Change Form
                <form onSubmit={handleUpdateStandardPassword} className="space-y-4">
                  <p className="text-xs text-slate-450 dark:text-slate-400 font-semibold pl-1">
                    Thiết lập mật khẩu có độ dài tối thiểu 6 ký tự để bảo vệ an toàn cho tài khoản của bạn.
                  </p>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                      Mật khẩu mới
                    </label>
                    <input
                      type="password"
                      value={standardPassword}
                      onChange={(e) => setStandardPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                      className={`w-full px-4 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${isDarkMode
                        ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200'
                        : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800'
                        }`}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                      Xác nhận mật khẩu mới
                    </label>
                    <input
                      type="password"
                      value={standardConfirmPassword}
                      onChange={(e) => setStandardConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      className={`w-full px-4 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${isDarkMode
                        ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200'
                        : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800'
                        }`}
                    />
                  </div>

                  {standardPasswordError && (
                    <p className="text-xs text-rose-600 font-bold pl-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {standardPasswordError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isUpdatingStandardPassword}
                    className="px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-2xl shadow-md active:scale-95 transition-all"
                  >
                    {isUpdatingStandardPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </button>
                </form>
              )}
            </div>

            {/* Danger Zone: Close Account Flow matching Figure 5 */}
            <div className={`p-6 md:p-8 rounded-3xl border border-rose-500/30 dark:border-rose-500/20 bg-rose-500/5 shadow-xl transition-colors duration-500`}>
              <h3 className="text-base font-black text-rose-600 mb-2 flex items-center gap-2">
                <AlertCircle size={18} className="text-rose-500" />
                <span>Khu vực Nguy hiểm</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold pl-1 leading-relaxed mb-5">
                Khi xóa tài khoản, hệ thống sẽ thực hiện quy trình soft deletion. Tài khoản sẽ chuyển sang chờ xóa và bạn có 30 ngày để hủy yêu cầu xóa.
              </p>

              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-md shadow-rose-500/10 active:scale-95 transition-all"
              >
                Đóng tài khoản của tôi
              </button>
            </div>
          </div>

          {/* Sidebar right */}
          <div className="space-y-8">
            <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Shield size={16} className="text-orange-500" />
                <span>Cam kết Bảo mật</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Chúng tôi áp dụng các tiêu chuẩn mã hóa tiên tiến nhất để bảo vệ thông tin mật khẩu của bạn. FPT Event không lưu trữ mật khẩu ở dạng plain-text và không bao giờ chia sẻ dữ liệu định danh của bạn cho bên thứ ba.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Set SSO Password Modal */}
      {showSetPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-900'
            }`}>
            <h3 className="text-lg font-black mb-2 flex items-center gap-2">
              <Lock className="text-orange-500" />
              <span>Thiết lập mật khẩu tài khoản</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5 font-medium leading-relaxed">
              Thiết lập mật khẩu cho tài khoản Google để có thể tự do đăng nhập bằng email của bạn.
            </p>

            <form onSubmit={handleSetSSOPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 pl-1">Mật khẩu mới</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className={`w-full px-4 py-2.5 text-sm font-semibold rounded-xl border outline-none ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white focus:border-orange-500' : 'bg-white border-slate-200 text-slate-800 focus:border-orange-500'
                    }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 pl-1">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className={`w-full px-4 py-2.5 text-sm font-semibold rounded-xl border outline-none ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white focus:border-orange-500' : 'bg-white border-slate-200 text-slate-800 focus:border-orange-500'
                    }`}
                />
              </div>

              {passwordError && (
                <p className="text-xs text-rose-500 font-bold pl-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {passwordError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/50 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => {
                    setShowSetPasswordModal(false)
                    setNewPassword('')
                    setConfirmPassword('')
                    setPasswordError('')
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  className="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black rounded-xl hover:shadow-lg active:scale-95 transition-all"
                >
                  {isSubmittingPassword ? 'Đang thiết lập...' : 'Thiết lập mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Account Confirmation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-900'
            }`}>
            <h3 className="text-lg font-black mb-3 text-rose-600 flex items-center gap-2">
              <AlertCircle className="text-rose-500 animate-bounce" />
              <span>Xác nhận xóa tài khoản</span>
            </h3>
            <div className="text-sm space-y-3 mb-6 leading-relaxed text-slate-400 font-medium">
              <p className="font-extrabold text-slate-750 dark:text-slate-350">
                Bạn đang thực hiện yêu cầu xóa tài khoản cá nhân.
              </p>
              <p>
                Tài khoản sẽ được chuyển sang trạng thái <strong className="text-amber-550">Chờ xóa (PENDING_DELETE)</strong> và bạn sẽ bị đăng xuất ngay lập tức.
              </p>
              <p>
                Bạn có <strong className="text-orange-500">30 ngày</strong> để đăng nhập lại và khôi phục tài khoản. Sau thời gian này, tài khoản và mọi dữ liệu liên quan sẽ bị xóa vĩnh viễn và không thể khôi phục.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200/50 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleCloseAccount}
                disabled={isClosingAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl hover:shadow-lg active:scale-95 transition-all"
              >
                {isClosingAccount ? 'Đang xử lý...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



