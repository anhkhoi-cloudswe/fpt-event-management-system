import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { GoogleOAuthProvider } from '@react-oauth/google'
import Login from './pages/Login.tsx'
import SignUp from './pages/SignUp.tsx'
import ResetPassword from './pages/ResetPassword.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Events from './pages/Events.tsx'
import EventDetail from './pages/EventDetail.tsx'
import EventEdit from './pages/EventEdit.tsx'
import MyTickets from './pages/MyTickets.tsx'
import TicketDetail from './pages/TicketDetail.tsx'
import CheckIn from './pages/CheckIn.tsx'
import SeatManagement from './pages/SeatManagement.tsx'
import Reports from './pages/Reports.tsx'
import ReportRequests from './pages/ReportRequests.tsx'
import MyBills from './pages/MyBills.tsx'
import BillDetail from './pages/BillDetail.tsx'
import EventRequestCreate from './pages/EventRequestCreate.tsx'
import EventRequestEdit from './pages/EventRequestEdit.tsx'
import StaffEventRequests from './pages/StaffEventRequests.tsx'
import OrganizerEventRequests from './pages/OrganizerEventRequests.tsx'
import Payment from './pages/Payment.tsx'
import PaymentSuccess from './pages/PaymentSuccess.tsx'
import PaymentFailed from './pages/PaymentFailed.tsx'
import Speakers from './pages/Speakers.tsx'
import Venues from './pages/Venues.tsx'
import SystemConfig from './pages/SystemConfig.tsx'
import CategoryTickets from './pages/CategoryTickets.tsx'
import AdminDashboard from './pages/AdminDashboard.tsx'
import Layout from './components/Layout.tsx'
import GuestLanding from './pages/GuestLanding.tsx'
import SystemPolicy from './pages/SystemPolicy.tsx'
import Profile from './pages/Profile.tsx'
import PublicEventPage from './pages/events/PublicEventPage.tsx'
import PublicEventPayment from './pages/events/PublicEventPayment.tsx'
import AttendanceConfirm from './pages/AttendanceConfirm.tsx'


import { useState } from 'react'

function LoadingScreen() {
  const [statusText, setStatusText] = useState('Đang kết nối dịch vụ...')
  const [progress, setProgress] = useState(10)
  const [showBypass, setShowBypass] = useState(false)

  useEffect(() => {
    // Progress bar simulation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) return prev + 5
        if (prev < 60) return prev + 2
        if (prev < 90) return prev + 0.5
        return prev
      })
    }, 200)

    // Status text updates & showing bypass button
    const steps = [
      { time: 0, text: 'Đang khởi động ứng dụng...' },
      { time: 2000, text: 'Đang xác thực phiên đăng nhập của bạn...' },
      { time: 4000, text: 'Đang kết nối tới máy chủ lưu trữ...' },
      { time: 6000, text: 'Máy chủ Cloud đang khởi động lại (Render cold start)...', showBypass: true },
      { time: 12000, text: 'Vẫn đang khởi động máy chủ, vui lòng đợi thêm giây lát...', showBypass: true },
    ]

    const timers = steps.map((step) => {
      return setTimeout(() => {
        setStatusText(step.text)
        if (step.showBypass) {
          setShowBypass(true)
        }
      }, step.time)
    })

    return () => {
      clearInterval(progressInterval)
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center px-4 text-white font-sans selection:bg-orange-500/30">
      {/* Decorative ambient glowing lights */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[8000ms]"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[6000ms]"></div>

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center">
        {/* Animated Rings and Spinner */}
        <div className="relative mb-8 flex items-center justify-center">
          <div className="absolute w-24 h-24 rounded-full border border-orange-500/10 animate-ping duration-[3000ms]"></div>
          <div className="absolute w-20 h-20 rounded-full border border-orange-400/20 animate-pulse"></div>
          <div className="w-14 h-14 rounded-full border-2 border-slate-800 border-t-orange-500 animate-spin"></div>
        </div>

        {/* Branding */}
        <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400 uppercase">
          FPT Event System
        </h1>
        
        {/* Progress Bar Container */}
        <div className="w-48 h-1 bg-slate-800 rounded-full mt-6 overflow-hidden relative">
          <div 
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Dynamic Status Text */}
        <p className="text-xs font-bold text-slate-400 mt-4 uppercase tracking-wide min-h-[16px]">
          {statusText}
        </p>

        {/* Options Panel */}
        <div className="mt-8 w-full min-h-[130px] transition-all duration-500 ease-in-out">
          {showBypass && (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm animate-fade-in-up">
              <p className="text-[11px] font-semibold text-amber-400/90 leading-relaxed">
                💡 Máy chủ Cloud tự động tạm nghỉ khi không có người truy cập để tiết kiệm tài nguyên. Quá trình khởi động có thể mất từ 30 giây đến 1 phút.
              </p>
              
              <div className="mt-4 flex flex-col gap-2">
                <button 
                  onClick={() => {
                    window.location.href = '/guest';
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 rounded-xl text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-orange-950/50 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Bỏ qua & Xem dưới tư cách Khách
                </button>
                
                <button 
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-all active:scale-[0.98] cursor-pointer"
                >
                  Tải lại trang (F5)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, isRefreshing } = useAuth()

  if (loading || isRefreshing) {
    return <LoadingScreen />
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/guest" />
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, isRefreshing } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (loading || isRefreshing) {
      const timer = setTimeout(() => {
        setTimedOut(true)
      }, 1500)
      return () => clearTimeout(timer)
    } else {
      setTimedOut(false)
    }
  }, [loading, isRefreshing])

  if ((loading || isRefreshing) && !timedOut) {
    return <LoadingScreen />
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function StaffRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Only allow role 'STAFF'
  return user && user.role === 'STAFF' ? <>{children}</> : <Navigate to="/dashboard" />
}

class EventRequestsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EventRequestsErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-orange-500 dark:border-slate-700 dark:border-t-orange-400" />
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">Dang tai lai trang yeu cau</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Du lieu chua san sang, vui long thu lam moi trang.</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function AppRoutes() {
  const DashboardEventPageRedirect = () => {
    const { id } = useParams()
    const [redirectPath, setRedirectPath] = useState<string | null>(null)

    useEffect(() => {
      if (!id) return

      let cancelled = false
      const resolvePath = async () => {
        try {
          const res = await fetch(`/api/events/detail?id=${id}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          })
          if (!res.ok) throw new Error('Failed to resolve event page path')
          const data = await res.json()
          if (!cancelled) {
            setRedirectPath(data?.eventPagePath || `/events/${id}/page`)
          }
        } catch {
          if (!cancelled) {
            setRedirectPath(`/events/${id}/page`)
          }
        }
      }

      void resolvePath()
      return () => {
        cancelled = true
      }
    }, [id])

    if (!redirectPath) return <LoadingScreen />
    return <Navigate to={redirectPath} replace />
  }

  const EventRequestsRouter = () => {
    const { user } = useAuth()
    const role = user?.role
    let routeContent: ReactNode

    if (role === 'STAFF') {
      routeContent = <StaffEventRequests />
    } else if (role === 'ORGANIZER') {
      routeContent = <OrganizerEventRequests />
    } else {
      routeContent = <Navigate to="/dashboard" replace />
    }

    return <EventRequestsErrorBoundary>{routeContent}</EventRequestsErrorBoundary>
  }

  const PaymentWrapper = () => {
    const location = useLocation()
    const state = location.state && typeof location.state === 'object' ? location.state as { seatIds?: unknown } : {}
    const seatIds = Array.isArray(state.seatIds) ? state.seatIds : []
    const key = seatIds.map(Number).sort().join('-')
    return <Payment key={key} />
  }

  return (
    <Routes>
      <Route path="/guest" element={<PublicRoute><GuestLanding /></PublicRoute>} />
      <Route path="/policy" element={<SystemPolicy />} />
      {/* Public payment callback routes for VNPay redirects */}
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-failed" element={<PaymentFailed />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
      <Route path="/events/:id" element={<EventDetail />} />
      <Route path="/events/:id/page" element={<PublicEventPage />} />
      <Route path="/events/:id/payment" element={<PublicEventPayment />} />
      <Route path="/invite/:token" element={<PublicEventPage />} />
      <Route path="/invite/:token/payment" element={<PublicEventPayment />} />
      <Route path="/attendance/confirm" element={<ProtectedRoute><AttendanceConfirm /></ProtectedRoute>} />
      <Route path="/dashboard/events/:id/page" element={<DashboardEventPageRedirect />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="events/:id/page" element={<PublicEventPage />} />
        <Route path="invite/:token" element={<PublicEventPage />} />
        <Route path="invite/:token/payment" element={<PublicEventPayment />} />
        <Route path="events/create" element={<EventRequestCreate />} />
        <Route path="events/:id/edit" element={<EventEdit />} />
        <Route path="my-tickets" element={<MyTickets />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="bills" element={<MyBills />} />
        <Route path="bills/:id" element={<BillDetail />} />
        <Route path="event-requests" element={<EventRequestsRouter />} />
        <Route path="event-requests/create" element={<EventRequestCreate />} />
        <Route path="event-requests/:id/edit" element={<EventRequestEdit />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="seats/:eventId" element={<SeatManagement />} />
        <Route path="payment" element={<PaymentWrapper />} />
        <Route path="payment/success" element={<PaymentSuccess />} />
        <Route path="payment/failed" element={<PaymentFailed />} />
        <Route path="speakers" element={<Speakers />} />
        <Route path="venues" element={<Venues />} />
        <Route path="category-tickets" element={<CategoryTickets />} />
        {/* organizers route removed */}
        <Route path="manage" element={<AdminDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="report-requests" element={
          <StaffRoute>
            <ReportRequests />
          </StaffRoute>
        } />
        <Route path="system-config" element={<SystemConfig />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
      </Route>
      <Route
        path="/my-tickets"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MyTickets />} />
      </Route>
    </Routes>
  )
}

function ThemeRouteIsolation() {
  const { user } = useAuth()
  const location = useLocation()
  const pathname = typeof location?.pathname === 'string' ? location.pathname : ''

  useEffect(() => {
    const isDashboardRoute = (pathname: string) => {
      return pathname === '/' || 
             pathname.startsWith('/dashboard') || 
             pathname.startsWith('/my-tickets')
    }

    if (isDashboardRoute(pathname)) {
      const savedTheme = user?.id
        ? localStorage.getItem('theme_user_' + user.id) || localStorage.getItem('theme')
        : localStorage.getItem('theme')

      const themeToApply = savedTheme === 'dark' || savedTheme === 'light'
        ? savedTheme
        : (user?.theme === 'dark' ? 'dark' : 'light')

      if (themeToApply === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    } else {
      document.documentElement.classList.remove('dark')
    }
    window.dispatchEvent(new Event('theme-change'))
  }, [pathname, user])

  return null
}

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '331189456885-v814j259l9p4nd0p6qmo2v8e744j5s1s.apps.googleusercontent.com'

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <ThemeRouteIsolation />
            <AppRoutes />
          </Router>
        </ToastProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}

export default App

