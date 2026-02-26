import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import Login from './pages/Login.tsx'
import Register from './pages/Register.tsx'
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
import ImageUploadTest from './pages/ImageUploadTest.tsx'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/guest" />
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  // Only allow role 'STAFF'
  return user && user.role === 'STAFF' ? <>{children}</> : <Navigate to="/dashboard" />
}

function AppRoutes() {
  const EventRequestsRouter = () => {
    const { user } = useAuth()

    if (user?.role === 'STAFF') {
      return <StaffEventRequests />
    } else if (user?.role === 'ORGANIZER') {
      return <OrganizerEventRequests />
    } else {
      return <Navigate to="/dashboard" />
    }
  }

  return (
    <Routes>
      <Route path="/guest" element={<GuestLanding />} />
      {/* Public payment callback routes for VNPay redirects */}
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-failed" element={<PaymentFailed />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="payment" element={<Payment />} />
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
        <Route path="image-upload-test" element={<ImageUploadTest />} />
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

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AppRoutes />
        </Router>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App

