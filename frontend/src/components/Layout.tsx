import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogOut, Menu, X, Wallet, Settings, User, Globe, Moon, Sun, ChevronDown, Check, Lock } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../contexts/ToastContext'
import { RealtimeClock } from './RealtimeClock'
import fptLogo from '../assets/fpt-logo.png'
import fptLogoLoading from '../assets/fpt-logo-loading.png'
import WelcomePasswordModal from './WelcomePasswordModal'

const timezones = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (GMT+7)' },
  { value: 'UTC', label: 'UTC (GMT+0)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (GMT+9)' },
  { value: 'Europe/London', label: 'Europe/London (GMT+1)' },
  { value: 'America/New_York', label: 'America/New_York (GMT-4)' }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { balance, loading: balanceLoading } = useWallet()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)

  // Settings Panel States
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [phone, setPhone] = useState(localStorage.getItem('user_phone_' + user?.id) || user?.phone || '')
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') === 'dark')
  const [timezone, setTimezone] = useState(localStorage.getItem('user_timezone') || 'Asia/Ho_Chi_Minh')
  const [autoDetectTz, setAutoDetectTz] = useState(localStorage.getItem('auto_timezone') !== 'false')

  // Sync dark class on document root
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDarkMode])

  // Automatically detect timezone if enabled
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

  // Handle phone update
  const handleUpdatePhone = () => {
    localStorage.setItem('user_phone_' + user?.id, phone)
    showToast('success', 'Cập nhật số điện thoại thành công!')
  }

  useEffect(() => {
    if (sessionStorage.getItem('is_new_user') === 'true') {
      setShowWelcomeModal(true)
    }
  }, [])

  // Show loading overlay when location changes
  useEffect(() => {
    setShowLoading(true)
    const timer = setTimeout(() => {
      setShowLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const isOrganizer = user?.role === 'ORGANIZER'
  const isStaff = user?.role === 'STAFF'
  const isAdmin = user?.role === 'ADMIN'
  const showWallet = user?.role !== 'STAFF' && user?.role !== 'ADMIN'
  const getNavLinkClass = (path: string) => {
    const isActive = path === '/dashboard' ? location.pathname === path : location.pathname.startsWith(path)
    if (isActive) {
      return isDarkMode
        ? 'px-3 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-orange-400 transition-all duration-350 shadow-sm border border-slate-700/50'
        : 'px-3 py-2 rounded-lg text-sm font-semibold bg-orange-100 text-orange-600 transition-all duration-350 shadow-sm border border-orange-200/50'
    } else {
      return isDarkMode
        ? 'px-3 py-2 rounded-lg text-sm font-semibold text-slate-350 hover:bg-slate-800 hover:text-orange-400 transition-all duration-350 border border-transparent'
        : 'px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-all duration-350 border border-transparent'
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      isDarkMode 
        ? 'bg-slate-950 text-slate-100 dark' 
        : 'bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-slate-800'
    }`}>
      {/* Header */}
      <header className={`transition-colors duration-500 shadow-lg border-b-2 ${
        isDarkMode 
          ? 'bg-slate-900 border-slate-800/80 shadow-slate-950/20' 
          : 'bg-white border-orange-100'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src={fptLogo} alt="FPT Education" className="h-12 w-auto" />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {isAdmin ? (
                <>
                  <Link
                    to="/dashboard"
                    className={getNavLinkClass('/dashboard')}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/dashboard/events"
                    className={getNavLinkClass('/dashboard/events')}
                  >
                    Sự kiện
                  </Link>
                  <Link
                    to="/dashboard/venues"
                    className={getNavLinkClass('/dashboard/venues')}
                  >
                    Địa Điểm
                  </Link>
                  <Link
                    to="/dashboard/manage"
                    className={getNavLinkClass('/dashboard/manage')}
                  >
                    Quản lý người dùng
                  </Link>
                  <Link
                    to="/dashboard/reports"
                    className={getNavLinkClass('/dashboard/reports')}
                  >
                    Báo cáo
                  </Link>
                  <Link
                    to="/dashboard/system-config"
                    className={getNavLinkClass('/dashboard/system-config')}
                  >
                    Cấu Hình
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/dashboard"
                    className={getNavLinkClass('/dashboard')}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/dashboard/events"
                    className={getNavLinkClass('/dashboard/events')}
                  >
                    Sự kiện
                  </Link>
                  {isOrganizer && (
                    <Link
                      to="/dashboard/events/create"
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-orange-600 to-orange-500 text-white hover:shadow-lg hover:shadow-orange-500/50 transition-all"
                    >
                      Tạo sự kiện
                    </Link>
                  )}
                  {(user?.role === 'ORGANIZER' || isStaff) && (
                    <Link
                      to="/dashboard/event-requests"
                      className={getNavLinkClass('/dashboard/event-requests')}
                    >
                      {isStaff ? 'Quản lý yêu cầu' : 'Yêu cầu của tôi'}
                    </Link>
                  )}
                  {user?.role === 'ORGANIZER' && (
                    <>
                      <Link
                        to="/dashboard/check-in"
                        className={getNavLinkClass('/dashboard/check-in')}
                      >
                        Check-in
                      </Link>
                      <Link
                        to="/dashboard/system-config"
                        className={getNavLinkClass('/dashboard/system-config')}
                      >
                        Cấu hình
                      </Link>
                    </>
                  )}
                  {isOrganizer && (
                    <Link
                      to="/dashboard/reports"
                      className={getNavLinkClass('/dashboard/reports')}
                    >
                      Báo cáo
                    </Link>
                  )}
                  {!isOrganizer && !isStaff && (
                    <>
                      <Link
                        to="/dashboard/my-tickets"
                        className={getNavLinkClass('/dashboard/my-tickets')}
                      >
                        Vé của tôi
                      </Link>
                      <Link
                        to="/dashboard/bills"
                        className={getNavLinkClass('/dashboard/bills')}
                      >
                        Hóa đơn
                      </Link>
                    </>
                  )}
                  {isStaff && (
                    <>
                      <Link
                        to="/dashboard/report-requests"
                        className={getNavLinkClass('/dashboard/report-requests')}
                      >
                        Yêu Cầu Hoàn Tiền
                      </Link>
                    </>
                  )}
                </>
              )}
            </nav>

            {/* User Info & Settings Dropdown */}
            <div className="hidden md:flex items-center space-x-4 relative">
              <div className={isDarkMode ? 'text-slate-350' : 'text-gray-600'}>
                <RealtimeClock />
              </div>
              {showWallet && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-orange-400 font-semibold' 
                    : 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 text-gray-900 font-semibold'
                }`}>
                  <Wallet size={18} className="text-orange-600" />
                  <span className="text-sm">
                    {balanceLoading ? '...' : balance.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
              )}

              {/* Clickable User profile summary to toggle popover settings */}
              <div 
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-300 select-none ${
                  isDarkMode 
                    ? 'hover:bg-slate-800 text-slate-200 hover:text-white' 
                    : 'hover:bg-orange-50/70 text-gray-800 hover:text-slate-900'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 flex items-center justify-center text-xs font-black text-white shadow-md shadow-orange-500/20">
                  {user?.fullName?.charAt(0) || 'U'}
                </div>
                <div className="text-left hidden lg:block">
                  <p className="text-sm font-extrabold leading-tight">{user?.fullName}</p>
                  <p className="text-[10px] font-bold text-orange-600 leading-none mt-0.5">{user?.role}</p>
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${settingsOpen ? 'rotate-180 text-orange-500' : ''}`} />
              </div>

              {/* Floating Settings Popover Card */}
              {settingsOpen && (
                <>
                  {/* Invisible backdrop helper for easy tap-out closing */}
                  <div 
                    onClick={() => setSettingsOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  
                  <div className={`absolute right-0 top-14 w-80 rounded-3xl border shadow-2xl p-6 z-50 animate-fade-in-up ${
                    isDarkMode 
                      ? 'bg-slate-900/95 backdrop-blur-md border-slate-700/80 text-slate-200 shadow-slate-950/50' 
                      : 'bg-white/95 backdrop-blur-md border-orange-100 shadow-orange-500/10 text-slate-850'
                  }`}>
                    {/* Popover Header */}
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 flex items-center justify-center text-sm font-black text-white shadow-md">
                        {user?.fullName?.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black truncate">{user?.fullName}</h4>
                        <p className="text-xs text-slate-450 truncate">{user?.email}</p>
                      </div>
                    </div>

                    {/* Popover Settings Body */}
                    <div className="py-4 space-y-4 text-left">
                      {/* Theme Toggle option */}
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-wider">Giao diện hệ thống</label>
                        <button
                          type="button"
                          onClick={() => setIsDarkMode(!isDarkMode)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all active:scale-98 ${
                            isDarkMode 
                              ? 'bg-slate-800 border-slate-700 hover:border-orange-500/40 text-slate-200' 
                              : 'bg-slate-50 border-slate-200 hover:border-orange-500/35 text-slate-750'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 text-xs font-bold">
                            {isDarkMode ? <Moon size={16} className="text-orange-400" /> : <Sun size={16} className="text-orange-500" />}
                            <span>{isDarkMode ? 'Giao diện Tối (Dark)' : 'Giao diện Sáng (Light)'}</span>
                          </div>
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-orange-500' : 'bg-slate-350'}`}>
                            <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.25 transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>
                      </div>

                      {/* Phone Update option */}
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-wider">Số điện thoại (Không bắt buộc)</label>
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Chưa cập nhật SĐT"
                            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl border outline-none transition-all ${
                              isDarkMode 
                                ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-205 placeholder-slate-600' 
                                : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800 placeholder-slate-400'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={handleUpdatePhone}
                            className="px-3.5 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow active:scale-95 transition-all"
                          >
                            Cập nhật
                          </button>
                        </div>
                      </div>

                      {/* Timezone option */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-wider">Múi giờ khu vực</label>
                          <label className="flex items-center gap-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={autoDetectTz}
                              onChange={(e) => setAutoDetectTz(e.target.checked)}
                              className="accent-orange-500 w-3 h-3"
                            />
                            <span className="text-[10px] text-slate-400 font-bold">Tự động</span>
                          </label>
                        </div>
                        <div className="relative">
                          <Globe className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                          <select
                            disabled={autoDetectTz}
                            value={timezone}
                            onChange={(e) => {
                              setTimezone(e.target.value)
                              localStorage.setItem('user_timezone', e.target.value)
                            }}
                            className={`w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border outline-none appearance-none transition-all cursor-pointer ${
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
                          <ChevronDown size={12} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {/* Popover Footer actions */}
                    <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/60 flex flex-col gap-2">
                      <Link 
                        to="/reset-password"
                        onClick={() => setSettingsOpen(false)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all duration-305 ${
                          isDarkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-655'
                        }`}
                      >
                        <Lock size={14} className="text-slate-400" />
                        <span>Thay đổi mật khẩu</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(false)
                          handleLogout()
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 w-full transition-all duration-305 text-left"
                      >
                        <LogOut size={14} className="text-red-550" />
                        <span>Đăng xuất tài khoản</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t">
            <nav className="px-4 py-2 space-y-1">
              {isAdmin ? (
                <>
                  <Link
                    to="/dashboard"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/dashboard/events"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sự kiện
                  </Link>
                  <Link
                    to="/dashboard/venues"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Địa Điểm
                  </Link>
                  <Link
                    to="/dashboard/manage"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Quản lý người dùng
                  </Link>
                  <Link
                    to="/dashboard/reports"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Báo cáo
                  </Link>
                  <Link
                    to="/dashboard/system-config"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Cấu Hình
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/dashboard"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/dashboard/events"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sự kiện
                  </Link>
                  {isOrganizer && (
                    <Link
                      to="/dashboard/events/create"
                      className="block px-3 py-2 rounded-md text-base font-medium text-blue-600 hover:bg-blue-50"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Tạo sự kiện
                    </Link>
                  )}
                  {(user?.role === 'ORGANIZER' || isStaff) && (
                    <Link
                      to="/dashboard/event-requests"
                      className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {isStaff ? 'Quản lý yêu cầu' : 'Yêu cầu của tôi'}
                    </Link>
                  )}
                  {user?.role === 'ORGANIZER' && (
                    <>
                      <Link
                        to="/dashboard/check-in"
                        className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Check-in
                      </Link>
                      <Link
                        to="/dashboard/system-config"
                        className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Cấu hình
                      </Link>
                    </>
                  )}
                  {isOrganizer && (
                    <Link
                      to="/dashboard/reports"
                      className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Báo cáo
                    </Link>
                  )}
                  {!isOrganizer && !isStaff && (
                    <>
                      <Link
                        to="/dashboard/my-tickets"
                        className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Vé của tôi
                      </Link>
                      <Link
                        to="/dashboard/bills"
                        className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Hóa đơn
                      </Link>
                    </>
                  )}
                  {isStaff && (
                    <>
                      <Link
                        to="/dashboard/report-requests"
                        className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Yêu Cầu Hoàn Tiền
                      </Link>
                    </>
                  )}
                  <div className="px-3 py-2 border-t mt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <RealtimeClock />
                    </div>
                     {showWallet && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                        <Wallet size={18} className="text-orange-600" />
                        <span className="text-sm font-semibold text-gray-900">
                          {balanceLoading ? '...' : balance.toLocaleString('vi-VN')} ₫
                        </span>
                      </div>
                    )}
                    <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
                    <p className="text-xs text-gray-500">{user?.role}</p>
                    <button
                      onClick={handleLogout}
                      className="mt-2 w-full text-left px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50"
                    >
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Loading Overlay */}
      {showLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100">
          <div className="flex flex-col items-center gap-6">
            <img
              src={fptLogoLoading}
              alt="FPT Education"
              className="h-24 w-auto animate-pulse"
            />
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-600 animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="h-3 w-3 rounded-full bg-orange-600 animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="h-3 w-3 rounded-full bg-orange-600 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Welcome popup for first-time Google Sign-In users */}
      <WelcomePasswordModal isOpen={showWelcomeModal} onClose={() => setShowWelcomeModal(false)} />
    </div>
  )
}



