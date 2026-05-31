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
  const { user } = useAuth()
  const { showToast } = useToast()
  
  // Theme state synchronized with local storage
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') === 'dark')
  
  // Phone settings
  const [phone, setPhone] = useState(localStorage.getItem('user_phone_' + user?.id) || user?.phone || '')
  
  // Timezone states
  const [timezone, setTimezone] = useState(localStorage.getItem('user_timezone') || 'Asia/Ho_Chi_Minh')
  const [autoDetectTz, setAutoDetectTz] = useState(localStorage.getItem('auto_timezone') !== 'false')

  // Error states for inputs
  const [phoneError, setPhoneError] = useState('')

  // Sync theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
    window.dispatchEvent(new Event('theme-change'))
  }, [isDarkMode])

  // Sync theme changes reactively when updated from header
  useEffect(() => {
    const handleThemeChange = () => {
      setIsDarkMode(localStorage.getItem('theme') === 'dark')
    }
    window.addEventListener('theme-change', handleThemeChange)
    return () => window.removeEventListener('theme-change', handleThemeChange)
  }, [])

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

  // Handle phone update action
  const handleUpdatePhone = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePhone(phone)) {
      showToast('error', 'Vui lòng kiểm tra lỗi nhập liệu!')
      return
    }
    localStorage.setItem('user_phone_' + user?.id, phone.trim())
    showToast('success', 'Cập nhật số điện thoại thành công!')
  }

  const joinDate = user?.createdAt 
    ? new Date(user.createdAt).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Chưa cập nhật'

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
      {/* Profile Banner */}
      <div className={`relative overflow-hidden rounded-3xl border p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-xl transition-colors duration-500 ${
        isDarkMode 
          ? 'bg-slate-900/90 border-slate-800 shadow-slate-950/20' 
          : 'bg-white/80 border-orange-100/60 shadow-orange-100/10 backdrop-blur-md'
      }`}>
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-600 to-orange-550 flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-orange-500/20 transition-transform group-hover:scale-105 duration-300">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 bg-orange-600 text-white p-1.5 rounded-full border-2 border-white dark:border-slate-900 shadow">
            <Shield size={14} />
          </div>
        </div>

        <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 justify-center md:justify-start">
            <h1 className="text-xl md:text-2xl font-black truncate">{user?.fullName}</h1>
            <span className="inline-flex self-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-orange-100 dark:bg-orange-550/20 text-orange-600 dark:text-orange-400 border border-orange-200/50 dark:border-orange-500/15">
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
          <div className={`px-5 py-4 rounded-2xl border text-center md:text-right min-w-[150px] shadow-sm ${
            isDarkMode 
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Form & Settings */}
        <div className="md:col-span-2 space-y-8">
          {/* Form cập nhật SĐT */}
          <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/80 border-orange-100/60 backdrop-blur-md'
          }`}>
            <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
              <Phone size={18} className="text-orange-500" />
              <span>Thông tin Liên hệ</span>
            </h3>

            <form onSubmit={handleUpdatePhone} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
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
                    className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${
                      phoneError 
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                        : isDarkMode 
                          ? 'bg-slate-950 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-200' 
                          : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-800'
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

          {/* Cấu hình hiển thị và múi giờ */}
          <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/80 border-orange-100/60 backdrop-blur-md'
          }`}>
            <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
              <Globe size={18} className="text-orange-500" />
              <span>Giao diện & Khu vực</span>
            </h3>

            <div className="space-y-6">
              {/* Theme selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                <div>
                  <h4 className="text-sm font-black">Giao diện ứng dụng</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Tự do thay đổi độ tương phản màn hình (Sáng hoặc Tối)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all min-w-[160px] active:scale-98 ${
                    isDarkMode 
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
                    <h4 className="text-sm font-black">Múi giờ làm việc</h4>
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
                    className={`w-full pl-9 pr-8 py-2.5 text-xs font-semibold rounded-xl border outline-none appearance-none transition-all cursor-pointer ${
                      isDarkMode 
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

        {/* Thông tin thủ tục thay đổi thông tin */}
        <div className="space-y-8">
          <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/80 border-orange-100/60 backdrop-blur-md'
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

          {/* Quick link bảo mật */}
          <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${
            isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/80 border-orange-100/60 backdrop-blur-md'
          }`}>
            <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Lock size={16} className="text-orange-500" />
              <span>Bảo mật Tài khoản</span>
            </h3>
            
            <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
              Bạn nên thay đổi mật khẩu định kỳ 6 tháng một lần để đảm bảo an toàn cho tài khoản sự kiện.
            </p>

            <Link
              to="/reset-password"
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-orange-500/10 hover:text-orange-500 border border-slate-200/50 dark:border-slate-700/80 rounded-2xl text-xs font-black transition-all active:scale-98"
            >
              <Lock size={14} />
              <span>Đổi mật khẩu tài khoản</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
