import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  LogOut, 
  Menu, 
  X, 
  Wallet, 
  Settings, 
  User, 
  Globe, 
  Moon, 
  Sun, 
  ChevronDown, 
  Check, 
  Lock,
  LayoutDashboard,
  Calendar,
  MapPin,
  Users,
  FileBarChart,
  Sliders,
  PlusCircle,
  CheckSquare,
  Ticket,
  Receipt,
  Undo2
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../contexts/ToastContext'
import { RealtimeClock } from './RealtimeClock'
import fptLogo from '../assets/fpt-logo.png'
import fptLogoLoading from '../assets/fpt-logo-loading.png'
import WelcomePasswordModal from './WelcomePasswordModal'
import AccountRestoreOverlay from './common/AccountRestoreOverlay'

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

  // Sync phone value when user is loaded/refreshed from DB
  useEffect(() => {
    if (user) {
      setPhone(localStorage.getItem('user_phone_' + user.id) || user.phone || '')
    }
  }, [user])

  // Sync dark class on document root + notify other components (e.g. Profile.tsx)
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
    const cleaned = phone.trim()
    if (!cleaned) {
      showToast('error', 'Số điện thoại không được để trống!')
      return
    }
    const phoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/
    if (!phoneRegex.test(cleaned)) {
      showToast('error', 'Số điện thoại Việt Nam không hợp lệ! Vui lòng nhập 10 chữ số (vd: 0901234567).')
      return
    }
    localStorage.setItem('user_phone_' + user?.id, cleaned)
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
    const base = 'flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-extrabold transition-all duration-300 w-full group relative overflow-hidden'
    if (isActive) {
      return isDarkMode
        ? `${base} bg-gradient-to-r from-orange-500/10 to-orange-500/5 text-orange-400 border border-orange-500/20 shadow-lg shadow-orange-500/5`
        : `${base} bg-orange-50/80 text-orange-600 border border-orange-100 shadow-md shadow-orange-500/5`
    } else {
      return isDarkMode
        ? `${base} text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border border-transparent`
        : `${base} text-slate-600 hover:text-slate-900 hover:bg-orange-50/50 border border-transparent`
    }
  }

  const renderSidebarLinks = (closeMobile = false) => {
    const handleLinkClick = () => {
      if (closeMobile) setMobileMenuOpen(false)
    }

    if (isAdmin) {
      return (
        <>
          <Link to="/dashboard" onClick={handleLinkClick} className={getNavLinkClass('/dashboard')}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </Link>
          <Link to="/dashboard/events" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/events')}>
            <Calendar size={18} />
            <span>Sự kiện</span>
          </Link>
          <Link to="/dashboard/venues" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/venues')}>
            <MapPin size={18} />
            <span>Địa Điểm</span>
          </Link>
          <Link to="/dashboard/manage" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/manage')}>
            <Users size={18} />
            <span>Quản lý người dùng</span>
          </Link>
          <Link to="/dashboard/reports" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/reports')}>
            <FileBarChart size={18} />
            <span>Báo cáo</span>
          </Link>
          <Link to="/dashboard/system-config" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/system-config')}>
            <Sliders size={18} />
            <span>Cấu Hình</span>
          </Link>
          <Link to="/dashboard/profile" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/profile')}>
            <User size={18} />
            <span>Hồ sơ cá nhân</span>
          </Link>
        </>
      )
    }

    return (
      <>
        <Link to="/dashboard" onClick={handleLinkClick} className={getNavLinkClass('/dashboard')}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </Link>
        <Link to="/dashboard/events" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/events')}>
          <Calendar size={18} />
          <span>Sự kiện</span>
        </Link>
        {isOrganizer && (
          <Link to="/dashboard/events/create" onClick={handleLinkClick} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-extrabold transition-all duration-300 w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white hover:shadow-lg hover:shadow-orange-500/25 active:scale-98">
            <PlusCircle size={18} />
            <span>Tạo sự kiện</span>
          </Link>
        )}
        {(user?.role === 'ORGANIZER' || isStaff) && (
          <Link to="/dashboard/event-requests" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/event-requests')}>
            <Undo2 size={18} />
            <span>{isStaff ? 'Quản lý yêu cầu' : 'Yêu cầu của tôi'}</span>
          </Link>
        )}
        {user?.role === 'ORGANIZER' && (
          <>
            <Link to="/dashboard/check-in" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/check-in')}>
              <CheckSquare size={18} />
              <span>Check-in</span>
            </Link>
            <Link to="/dashboard/system-config" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/system-config')}>
              <Sliders size={18} />
              <span>Cấu hình</span>
            </Link>
          </>
        )}
        {isOrganizer && (
          <Link to="/dashboard/reports" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/reports')}>
            <FileBarChart size={18} />
            <span>Báo cáo</span>
          </Link>
        )}
        {!isOrganizer && !isStaff && (
          <>
            <Link to="/dashboard/my-tickets" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/my-tickets')}>
              <Ticket size={18} />
              <span>Vé của tôi</span>
            </Link>
            <Link to="/dashboard/bills" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/bills')}>
              <Receipt size={18} />
              <span>Hóa đơn</span>
            </Link>
          </>
        )}
        {isStaff && (
          <Link to="/dashboard/report-requests" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/report-requests')}>
            <Undo2 size={18} />
            <span>Yêu Cầu Hoàn Tiền</span>
          </Link>
        )}
        <Link to="/dashboard/profile" onClick={handleLinkClick} className={getNavLinkClass('/dashboard/profile')}>
          <User size={18} />
          <span>Hồ sơ cá nhân</span>
        </Link>
      </>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${
      isDarkMode 
        ? 'bg-slate-950 text-slate-100 dark' 
        : 'bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-slate-800'
    }`}>
      {user?.status === 'PENDING_DELETE' && <AccountRestoreOverlay />}
      {/* Header Status Bar */}
      <header className={`fixed top-0 left-0 right-0 h-16 z-40 transition-colors duration-500 shadow-md border-b flex items-center px-4 md:px-6 ${
        isDarkMode 
          ? 'bg-slate-900/90 backdrop-blur-md border-slate-800/80 shadow-slate-950/20' 
          : 'bg-white/90 backdrop-blur-md border-orange-100/60 shadow-orange-100/10'
      }`}>
        <div className="flex justify-between items-center w-full">
          {/* Logo & Toggle Menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 md:hidden"
            >
              <Menu size={20} />
            </button>
            <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-85 transition-opacity">
              <img src={fptLogo} alt="FPT Education" className="h-10 w-auto" />
            </Link>
          </div>

          {/* Right section items */}
          <div className="flex items-center space-x-3.5 relative">
            <div className={`hidden sm:block text-xs font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <RealtimeClock />
            </div>

            {showWallet && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                isDarkMode 
                  ? 'bg-slate-800 border-slate-700 text-orange-400 font-bold' 
                  : 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 text-slate-800 font-bold'
              }`}>
                <Wallet size={16} className="text-orange-500" />
                <span className="text-xs">
                  {balanceLoading ? '...' : balance.toLocaleString('vi-VN')} ₫
                </span>
              </div>
            )}

            {/* Clickable User profile summary to toggle popover settings */}
            <div 
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-2xl cursor-pointer transition-all duration-300 select-none border border-transparent ${
                isDarkMode 
                  ? 'hover:bg-slate-800/80 text-slate-200 hover:text-white' 
                  : 'hover:bg-orange-50/70 text-slate-800 hover:text-slate-950'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 flex items-center justify-center text-xs font-black text-white shadow-md shadow-orange-500/20">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="text-left hidden xs:block">
                <p className="text-xs font-extrabold leading-tight">{user?.fullName}</p>
                <p className="text-[9px] font-bold text-orange-500 leading-none mt-0.5">{user?.role}</p>
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
                
                <div className={`absolute right-0 top-full mt-2 w-80 rounded-3xl border shadow-2xl p-5 z-50 animate-fade-in-up ${
                  isDarkMode 
                    ? 'bg-slate-900/95 backdrop-blur-md border-slate-700/80 text-slate-200 shadow-slate-950/50' 
                    : 'bg-white/95 backdrop-blur-md border-orange-100 shadow-orange-500/10 text-slate-800'
                }`}>
                  {/* Popover Header */}
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 flex items-center justify-center text-sm font-black text-white shadow-md">
                      {user?.fullName?.charAt(0) || 'U'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black truncate">{user?.fullName}</h4>
                      <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
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
                              ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200 placeholder-slate-600' 
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
                      to="/dashboard/profile"
                      onClick={() => setSettingsOpen(false)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all duration-305 ${
                        isDarkMode ? 'hover:bg-slate-850 text-slate-300' : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <User size={14} className="text-slate-400" />
                      <span>Hồ sơ cá nhân</span>
                    </Link>
                    <Link 
                      to="/reset-password"
                      onClick={() => setSettingsOpen(false)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all duration-305 ${
                        isDarkMode ? 'hover:bg-slate-850 text-slate-300' : 'hover:bg-slate-50 text-slate-600'
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
                      <LogOut size={14} className="text-red-500" />
                      <span>Đăng xuất tài khoản</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex flex-1 pt-16 overflow-hidden">
        {/* Desktop Left Sidebar */}
        <aside className={`hidden md:flex flex-col w-64 flex-shrink-0 border-r transition-colors duration-500 backdrop-blur-md ${
          isDarkMode 
            ? 'bg-slate-900/90 border-slate-800/80 text-slate-200' 
            : 'bg-white/80 border-orange-100/60 text-slate-800'
        }`}>
          <div className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
            {renderSidebarLinks()}
          </div>
        </aside>

        {/* Responsive Mobile Drawer Slide-in */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-45 bg-slate-950/60 backdrop-blur-md md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className={`fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col border-r shadow-2xl transition-all duration-300 md:hidden ${
              isDarkMode 
                ? 'bg-slate-900 border-slate-800 text-slate-200' 
                : 'bg-white border-orange-100 text-slate-800'
            }`}>
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200/50 dark:border-slate-800/60">
                <Link 
                  to="/dashboard" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3"
                >
                  <img src={fptLogo} alt="FPT Education" className="h-10 w-auto" />
                </Link>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
                {renderSidebarLinks(true)}
              </div>
            </aside>
          </>
        )}

        {/* Scrollable Content Panel */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Loading Overlay */}
      {showLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
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



