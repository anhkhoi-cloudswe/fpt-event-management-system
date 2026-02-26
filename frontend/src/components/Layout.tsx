import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogOut, Menu, X, Wallet } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWallet } from '../hooks/useWallet'
import fptLogo from '../assets/fpt-logo.png'
import fptLogoLoading from '../assets/fpt-logo-loading.png'

export default function Layout() {
  const { user, logout } = useAuth()
  const { balance, loading: balanceLoading } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLoading, setShowLoading] = useState(false)

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100">
      {/* Header */}
      <header className="bg-white shadow-lg border-b-2 border-orange-100">
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
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/dashboard'
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/dashboard/events"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/events')
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Sự kiện
                  </Link>
                  <Link
                    to="/dashboard/venues"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/venues')
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Địa Điểm
                  </Link>
                  <Link
                    to="/dashboard/manage"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/manage')
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Quản lý người dùng
                  </Link>
                  <Link
                    to="/dashboard/reports"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/dashboard/reports'
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Báo cáo
                  </Link>
                  <Link
                    to="/dashboard/system-config"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/system-config')
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Cấu Hình
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/dashboard"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/dashboard'
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/dashboard/events"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/events')
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                      }`}
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
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/event-requests')
                        ? 'bg-orange-100 text-orange-600'
                        : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                    >
                      {isStaff ? 'Quản lý yêu cầu' : 'Yêu cầu của tôi'}
                    </Link>
                  )}
                  {user?.role === 'ORGANIZER' && (
                    <>
                      <Link
                        to="/dashboard/check-in"
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/dashboard/check-in'
                          ? 'bg-orange-100 text-orange-600'
                          : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                      >
                        Check-in
                      </Link>
                      <Link
                        to="/dashboard/system-config"
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/system-config')
                          ? 'bg-orange-100 text-orange-600'
                          : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                      >
                        Cấu hình
                      </Link>
                    </>
                  )}
                  {isOrganizer && (
                    <Link
                      to="/dashboard/reports"
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/dashboard/reports'
                        ? 'bg-orange-100 text-orange-600'
                        : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                    >
                      Báo cáo
                    </Link>
                  )}
                  {!isOrganizer && !isStaff && (
                    <>
                      <Link
                        to="/dashboard/my-tickets"
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/my-tickets') || location.pathname.startsWith('/dashboard/tickets')
                          ? 'bg-orange-100 text-orange-600'
                          : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                      >
                        Vé của tôi
                      </Link>
                      <Link
                        to="/dashboard/bills"
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname.startsWith('/dashboard/bills')
                          ? 'bg-orange-100 text-orange-600'
                          : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                      >
                        Hóa đơn
                      </Link>
                    </>
                  )}
                  {isStaff && (
                    <>
                      <Link
                        to="/dashboard/report-requests"
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${location.pathname === '/dashboard/report-requests'
                          ? 'bg-orange-100 text-orange-600'
                          : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                      >
                        Yêu Cầu Hoàn Tiền
                      </Link>
                    </>
                  )}
                </>
              )}
            </nav>

            {/* User Info */}
            <div className="hidden md:flex items-center space-x-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                <Wallet size={18} className="text-orange-600" />
                <span className="text-sm font-semibold text-gray-900">
                  {balanceLoading ? '...' : balance.toLocaleString('vi-VN')} ₫
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user?.fullName}</p>
                <p className="text-xs font-medium text-orange-600">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                title="Đăng xuất"
              >
                <LogOut size={20} />
              </button>


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
                    {/* Mobile Notification Bell */}
                    {user && user.role !== 'ADMIN' && (
                      <div className="mb-3">
                        <button
                          onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Bell size={18} className="text-blue-600" />
                            <span className="text-sm font-medium text-gray-900">Thông báo</span>
                          </div>
                          {notifications?.hasUnread && (
                            <span className="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5">
                              {notifications.totalUnread > 9 ? '9+' : notifications.totalUnread}
                            </span>
                          )}
                        </button>

                        {/* Mobile Notification List */}
                        {notificationDropdownOpen && (
                          <div className="mt-2 bg-white rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                            {!notificationsLoading && notifications && notifications.notifications.length > 0 ? (
                              notifications.notifications.map((notif) => (
                                <div
                                  key={notif.id}
                                  className={`px-3 py-2 border-b border-gray-50 last:border-b-0 ${!notif.isRead ? 'bg-blue-50' : ''
                                    }`}
                                >
                                  <p className="text-xs text-gray-700">{notif.message}</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {formatNotificationTime(notif.createdAt)}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-4 text-center text-gray-500 text-xs">
                                Không có thông báo
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                      <Wallet size={18} className="text-orange-600" />
                      <span className="text-sm font-semibold text-gray-900">
                        {balanceLoading ? '...' : balance.toLocaleString('vi-VN')} ₫
                      </span>
                    </div>
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
    </div>
  )
}



