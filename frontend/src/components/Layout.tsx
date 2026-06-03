import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LogOut,
  Menu,
  X,
  Wallet,
  Settings,
  User,
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
import { TimezoneCombobox } from './TimezoneCombobox'

export default function Layout() {
  const { user, logout, refreshUser, currentLanguage } = useAuth()
  const { balance, loading: balanceLoading } = useWallet()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover-expand'>(() => {
    if (user?.id) {
      return (localStorage.getItem('sidebar_mode_' + user.id) as any) || 'hover-expand'
    }
    return 'hover-expand'
  })
  const [showModePopover, setShowModePopover] = useState(false)

  useEffect(() => {
    if (user?.id) {
      setSidebarMode((localStorage.getItem('sidebar_mode_' + user.id) as any) || 'hover-expand')
    }
  }, [user])

  // Settings Panel States
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [phone, setPhone] = useState(localStorage.getItem('user_phone_' + user?.id) || user?.phone || '')
  // OPTIMIZED: Read theme directly from document class (source of truth), not localStorage
  // localStorage is ONLY used for initial hydration, then DOM class is authoritative
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark')
  })
  const [timezone, setTimezone] = useState(localStorage.getItem('user_timezone') || 'Asia/Ho_Chi_Minh')
  const [autoDetectTz, setAutoDetectTz] = useState(localStorage.getItem('auto_timezone') !== 'false')

  // Sync theme changes reactively when updated from profile or header
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

  // Sync phone value and theme when user is loaded/refreshed from DB
  useEffect(() => {
    if (user) {
      setPhone(localStorage.getItem('user_phone_' + user.id) || user.phone || '')
      setIsDarkMode(localStorage.getItem('theme_user_' + user.id) === 'dark')
    }
  }, [user])

  // Sync dark class on document root + notify other components
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
  }, [isDarkMode])

  // Theme change action call to DB - OPTIMIZED: Async background sync
  const handleToggleTheme = () => {
    const nextTheme = !isDarkMode ? 'dark' : 'light'

    // IMMEDIATE VISUAL UPDATE - Update DOM class and localStorage synchronously
    document.documentElement.classList.toggle('dark', nextTheme === 'dark')
    if (user?.id) {
      localStorage.setItem('theme', nextTheme)
      localStorage.setItem('theme_user_' + user.id, nextTheme)
    }

    // Update state immediately for zero-latency UI response
    setIsDarkMode(!isDarkMode)
    window.dispatchEvent(new Event('theme-change'))

    // BACKGROUND ASYNC SYNC - Don't block UI on API call
    if (user) {
      void fetch('/api/auth/update-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ theme: nextTheme }),
      }).catch(err => console.error('Background theme sync failed:', err))
    }
  }

  // Automatically detect timezone if enabled
  const detectTimezone = () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh'
    setTimezone(detected)
    localStorage.setItem('user_timezone', detected)
    localStorage.setItem('auto_timezone', 'true')
    window.dispatchEvent(new Event('timezone-change'))
  }

  useEffect(() => {
    if (autoDetectTz) {
      detectTimezone()
    } else {
      localStorage.setItem('auto_timezone', 'false')
    }
  }, [autoDetectTz])

  // Handle phone update
  const handleUpdatePhone = () => {
    const cleaned = phone.trim()
    if (!cleaned) {
      showToast('error', currentLanguage === 'en' ? 'Phone number cannot be empty!' : 'Số điện thoại không được để trống!')
      return
    }
    const phoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/
    if (!phoneRegex.test(cleaned)) {
      showToast('error', currentLanguage === 'en' ? 'Invalid Vietnamese phone number! Please enter 10 digits (e.g. 0901234567).' : 'Số điện thoại Việt Nam không hợp lệ! Vui lòng nhập 10 chữ số (vd: 0901234567).')
      return
    }
    localStorage.setItem('user_phone_' + user?.id, cleaned)
    showToast('success', currentLanguage === 'en' ? 'Phone number updated successfully!' : 'Cập nhật số điện thoại thành công!')
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

  const SidebarIcon = ({ size = 18 }: { size?: number }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" strokeDasharray="2 2" />
    </svg>
  )

  const renderLink = (to: string, Icon: any, label: string, onClick?: () => void, isMobile = false, customClass?: string) => {
    const isCollapsed = !isMobile && sidebarMode === 'collapsed'
    const isHoverExpand = !isMobile && sidebarMode === 'hover-expand'
    return (
      <Link
        to={to}
        onClick={onClick}
        className={customClass || getNavLinkClass(to)}
      >
        <div className="flex-shrink-0"><Icon size={18} /></div>
        <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${isCollapsed
          ? 'opacity-0 w-0 pointer-events-none'
          : isHoverExpand
            ? 'opacity-0 group-hover/sidebar:opacity-100 group-hover/sidebar:w-auto w-0 pointer-events-none group-hover/sidebar:pointer-events-auto'
            : 'opacity-100 w-auto'
          }`}>{label}</span>
      </Link>
    )
  }

  const renderSidebarLinks = (closeMobile = false) => {
    const handleLinkClick = () => {
      if (closeMobile) setMobileMenuOpen(false)
    }

    if (isAdmin) {
      return (
        <>
          {renderLink("/dashboard", LayoutDashboard, currentLanguage === 'en' ? "Dashboard" : "Dashboard", handleLinkClick, closeMobile)}
          {renderLink("/dashboard/events", Calendar, currentLanguage === 'en' ? "Events" : "Sự kiện", handleLinkClick, closeMobile)}
          {renderLink("/dashboard/venues", MapPin, currentLanguage === 'en' ? "Venues" : "Địa Điểm", handleLinkClick, closeMobile)}
          {renderLink("/dashboard/manage", Users, currentLanguage === 'en' ? "User Management" : "Quản lý người dùng", handleLinkClick, closeMobile)}
          {renderLink("/dashboard/reports", FileBarChart, currentLanguage === 'en' ? "Reports" : "Báo cáo", handleLinkClick, closeMobile)}
          {renderLink("/dashboard/system-config", Sliders, currentLanguage === 'en' ? "Configuration" : "Cấu hình", handleLinkClick, closeMobile)}
          {renderLink("/dashboard/profile", User, currentLanguage === 'en' ? "Profile" : "Hồ sơ cá nhân", handleLinkClick, closeMobile)}
        </>
      )
    }

    return (
      <>
        {renderLink("/dashboard", LayoutDashboard, currentLanguage === 'en' ? "Dashboard" : "Dashboard", handleLinkClick, closeMobile)}
        {renderLink("/dashboard/events", Calendar, currentLanguage === 'en' ? "Events" : "Sự kiện", handleLinkClick, closeMobile)}
        {isOrganizer && renderLink(
          "/dashboard/events/create",
          PlusCircle,
          currentLanguage === 'en' ? "Create Event" : "Tạo sự kiện",
          handleLinkClick,
          closeMobile,
          "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-extrabold transition-all duration-300 w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-450 text-white hover:shadow-lg hover:shadow-orange-500/25 active:scale-98"
        )}
        {(user?.role === 'ORGANIZER' || isStaff) && renderLink(
          "/dashboard/event-requests",
          Undo2,
          isStaff 
            ? (currentLanguage === 'en' ? "Request Management" : "Quản lý yêu cầu") 
            : (currentLanguage === 'en' ? "My Requests" : "Yêu cầu của tôi"),
          handleLinkClick,
          closeMobile
        )}
        {user?.role === 'ORGANIZER' && (
          <>
            {renderLink("/dashboard/check-in", CheckSquare, currentLanguage === 'en' ? "Check-in" : "Check-in", handleLinkClick, closeMobile)}
            {renderLink("/dashboard/system-config", Sliders, currentLanguage === 'en' ? "Configuration" : "Cấu hình", handleLinkClick, closeMobile)}
          </>
        )}
        {isOrganizer && renderLink("/dashboard/reports", FileBarChart, currentLanguage === 'en' ? "Reports" : "Báo cáo", handleLinkClick, closeMobile)}
        {!isOrganizer && !isStaff && (
          <>
            {renderLink("/dashboard/my-tickets", Ticket, currentLanguage === 'en' ? "My Tickets" : "Vé của tôi", handleLinkClick, closeMobile)}
            {renderLink("/dashboard/bills", Receipt, currentLanguage === 'en' ? "My Bills" : "Hóa đơn", handleLinkClick, closeMobile)}
          </>
        )}
        {isStaff && renderLink("/dashboard/report-requests", Undo2, currentLanguage === 'en' ? "Refund Requests" : "Yêu Cầu Hoàn Tiền", handleLinkClick, closeMobile)}
        {renderLink("/dashboard/profile", User, currentLanguage === 'en' ? "Profile" : "Hồ sơ cá nhân", handleLinkClick, closeMobile)}
      </>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${isDarkMode
      ? 'bg-slate-950 text-slate-100 dark'
      : 'bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-slate-800'
      }`}>
      {user?.status === 'PENDING_DELETE' && <AccountRestoreOverlay />}
      {/* Header Status Bar */}
      <header className={`fixed top-0 left-0 right-0 h-16 z-40 transition-colors duration-500 shadow-md border-b flex items-center px-4 md:px-6 ${isDarkMode
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
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${isDarkMode
                ? 'bg-slate-800 border-slate-700 text-orange-400 font-bold'
                : 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 text-slate-800 font-bold'
                }`}>
                <Wallet size={16} className="text-orange-500" />
                <span className="text-xs">
                  {balanceLoading ? '...' : balance.toLocaleString('vi-VN')} đ
                </span>
              </div>
            )}

            {/* Clickable User profile summary to toggle popover settings */}
            <div
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-2xl cursor-pointer transition-all duration-300 select-none border border-transparent ${isDarkMode
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

                <div className={`absolute right-0 top-full mt-2 w-80 rounded-3xl border shadow-2xl p-5 z-50 animate-fade-in-up ${isDarkMode
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
                                {/* Theme Toggle option */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-wider">{currentLanguage === 'en' ? 'SYSTEM THEME' : 'Giao diện hệ thống'}</label>
                      <button
                        type="button"
                        onClick={handleToggleTheme}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all active:scale-98 ${isDarkMode
                          ? 'bg-slate-800 border-slate-700 hover:border-orange-500/40 text-slate-200'
                          : 'bg-slate-50 border-slate-200 hover:border-orange-500/35 text-slate-750'
                          }`}
                      >
                        <div className="flex items-center gap-2.5 text-xs font-bold">
                          {isDarkMode ? <Moon size={16} className="text-orange-400" /> : <Sun size={16} className="text-orange-500" />}
                          <span>{isDarkMode ? (currentLanguage === 'en' ? 'Dark Mode' : 'Giao diện Tối (Dark)') : (currentLanguage === 'en' ? 'Light Mode' : 'Giao diện Sáng (Light)')}</span>
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-orange-500' : 'bg-slate-350'}`}>
                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.25 transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                      </button>
                    </div>

                    {/* Phone Update option */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-wider">{currentLanguage === 'en' ? 'PHONE NUMBER (OPTIONAL)' : 'Số điện thoại (Không bắt buộc)'}</label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder={currentLanguage === 'en' ? 'Not updated' : 'Chưa cập nhật SĐT'}
                          className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl border outline-none transition-all ${isDarkMode
                            ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200 placeholder-slate-600'
                            : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800 placeholder-slate-400'
                            }`}
                        />
                        <button
                          type="button"
                          onClick={handleUpdatePhone}
                          className="px-3.5 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow active:scale-95 transition-all"
                        >
                          {currentLanguage === 'en' ? 'Update' : 'Cập nhật'}
                        </button>
                      </div>
                    </div>

                    {/* Timezone option */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-wider">{currentLanguage === 'en' ? 'WORKING TIMEZONE' : 'Múi giờ khu vực'}</label>
                      </div>
                      <TimezoneCombobox
                        value={timezone}
                        autoDetect={autoDetectTz}
                        isDarkMode={isDarkMode}
                        onAutoDetectChange={setAutoDetectTz}
                        onChange={(nextTimezone) => {
                          setTimezone(nextTimezone)
                          localStorage.setItem('user_timezone', nextTimezone)
                          window.dispatchEvent(new Event('timezone-change'))
                        }}
                      />
                    </div>
                  </div>

                  {/* Popover Footer actions */}
                  <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/60 flex flex-col gap-2">
                    <Link
                      to="/dashboard/profile"
                      onClick={() => setSettingsOpen(false)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all duration-305 ${isDarkMode ? 'hover:bg-slate-850 text-slate-300' : 'hover:bg-slate-50 text-slate-650'
                        }`}
                    >
                      <User size={14} className="text-slate-400" />
                      <span>{currentLanguage === 'en' ? 'Profile' : 'Hồ sơ cá nhân'}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false)
                        navigate('/dashboard/profile?tab=security')
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all duration-305 ${isDarkMode ? 'hover:bg-slate-850 text-slate-300' : 'hover:bg-slate-50 text-slate-650'
                        }`}
                    >
                      <Lock size={14} className="text-slate-400" />
                      <span>{currentLanguage === 'en' ? 'Change Password' : 'Thay đổi mật khẩu'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false)
                        handleLogout()
                      }}
                      className="flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 w-full transition-all duration-305 text-left"
                    >
                      <LogOut size={14} className="text-red-500" />
                      <span>{currentLanguage === 'en' ? 'Log Out' : 'Đăng xuất tài khoản'}</span>
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
        {/* Desktop Left Sidebar with Fixed Positioning - Locked to Left */}
        <aside className={`hidden md:fixed md:flex flex-col flex-shrink-0 border-r transition-all duration-300 ease-in-out backdrop-blur-md top-16 left-0 h-[calc(100vh-4rem)] z-30 ${sidebarMode === 'expanded'
          ? 'w-64'
          : sidebarMode === 'collapsed'
            ? 'w-20'
            : 'w-20 hover:w-64 group/sidebar'
          } ${isDarkMode
            ? 'bg-slate-900/90 border-slate-800/80 text-slate-200 shadow-slate-950/20'
            : 'bg-white/80 border-orange-100/60 text-slate-800 shadow-orange-100/10'
          }`}>
          <div className={`flex-1 py-6 space-y-2 overflow-y-auto transition-all duration-300 ${sidebarMode === 'expanded'
            ? 'px-4'
            : sidebarMode === 'hover-expand'
              ? 'px-3 group-hover/sidebar:px-4'
              : 'px-3'
            }`}>
            {renderSidebarLinks(false)}
          </div>

          {/* Sidebar Mode Control Widget (Figure 3 Matching) */}
          <div className={`p-4 border-t transition-colors duration-300 relative ${isDarkMode ? 'border-slate-800/80' : 'border-orange-100/60'
            }`}>
            <button
              type="button"
              title={currentLanguage === 'en' ? 'Sidebar Control' : 'Điều khiển Sidebar'}
              onClick={() => setShowModePopover(!showModePopover)}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-center hover:scale-105 active:scale-95 ${isDarkMode
                ? 'bg-slate-800/60 border-slate-700 hover:border-orange-500/40 text-slate-350 hover:text-white'
                : 'bg-orange-50/60 border-orange-200 hover:border-orange-500/30 text-slate-650 hover:text-slate-900'
                } ${sidebarMode === 'expanded'
                  ? 'w-full gap-3'
                  : sidebarMode === 'hover-expand'
                    ? 'w-full group-hover/sidebar:w-full group-hover/sidebar:gap-3 mx-auto justify-center'
                    : 'mx-auto'
                }`}
            >
              <SidebarIcon size={18} />
              <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden text-xs font-bold ${sidebarMode === 'collapsed'
                ? 'opacity-0 w-0 pointer-events-none'
                : sidebarMode === 'hover-expand'
                  ? 'opacity-0 group-hover/sidebar:opacity-100 group-hover/sidebar:w-auto w-0 pointer-events-none group-hover/sidebar:pointer-events-auto'
                  : 'opacity-100 w-auto'
                }`}>
                {currentLanguage === 'en' ? 'Control' : 'Điều khiển'}
              </span>
            </button>

            {/* Popover Menu matching Figure 3 */}
            {showModePopover && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setShowModePopover(false)}
                />
                <div className={`absolute bottom-full left-4 mb-2 w-52 rounded-2xl border shadow-2xl p-3.5 z-50 animate-fade-in-up ${isDarkMode
                  ? 'bg-slate-900 border-slate-800 text-slate-200 shadow-slate-950/80'
                  : 'bg-white border-orange-150 text-slate-800 shadow-orange-500/10'
                  }`}>
                  <div className="text-[10px] font-black tracking-wider uppercase opacity-50 px-2.5 pb-2 border-b border-slate-200/40 dark:border-slate-800/50">
                    {currentLanguage === 'en' ? 'Sidebar control' : 'Điều khiển sidebar'}
                  </div>
                  <div className="pt-2 space-y-1">
                    {[
                      { value: 'expanded', label: currentLanguage === 'en' ? 'Expanded' : 'Mở rộng' },
                      { value: 'collapsed', label: currentLanguage === 'en' ? 'Collapsed' : 'Thu gọn' },
                      { value: 'hover-expand', label: currentLanguage === 'en' ? 'Expand on hover' : 'Tự động mở rộng khi di chuột' }
                    ].map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => {
                          setSidebarMode(mode.value as any)
                          if (user?.id) {
                            localStorage.setItem('sidebar_mode_' + user.id, mode.value)
                          }
                          setShowModePopover(false)
                          showToast('success', currentLanguage === 'en' ? `Changed to mode: ${mode.label}` : `Đã chuyển sang chế độ: ${mode.label}`)
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-left transition-all ${sidebarMode === mode.value
                          ? isDarkMode
                            ? 'bg-orange-500/10 text-orange-400'
                            : 'bg-orange-50 text-orange-600'
                          : isDarkMode
                            ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-250'
                            : 'hover:bg-slate-50 text-slate-650 hover:text-slate-900'
                          }`}
                      >
                        <div className="w-4 flex items-center justify-center">
                          {sidebarMode === mode.value && (
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          )}
                        </div>
                        <span>{mode.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
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
            <aside className={`fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col border-r shadow-2xl transition-all duration-300 md:hidden ${isDarkMode
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

        {/* Scrollable Content Panel with Margin-Left Offset for Fixed Sidebar */}
        <main className={`flex-1 overflow-y-auto min-w-0 transition-all duration-300 ${sidebarMode === 'expanded'
          ? 'md:ml-64'
          : sidebarMode === 'collapsed'
            ? 'md:ml-20'
            : 'md:ml-20 group-hover/sidebar:md:ml-64'
          }`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Loading Overlay - Context-Aware Theme Inversion */}
      {showLoading && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-300 ${isDarkMode
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'
          : 'bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100'
          }`}>
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



