import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading Auth State...</div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/guest" />
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading Auth State...</div>
    )
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
        ? localStorage.getItem('theme_user_' + user.id) 
        : localStorage.getItem('theme')
      
      const themeToApply = user?.theme === 'dark' || savedTheme === 'dark' ? 'dark' : 'light'
      
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

