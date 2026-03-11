// Import hook của React Router để:
// - useLocation: lấy URL hiện tại (bao gồm query string ?a=...)
// - useNavigate: điều hướng sang trang khác bằng code
import { useLocation, useNavigate } from 'react-router-dom'

// Import icon check thành công và confetti để hiển thị UI
import { CheckCircle2, Mail, Ticket, PartyPopper, Wallet } from 'lucide-react'

// Import hook của React:
// - useEffect: chạy side-effect khi component mount / khi dependency đổi
// - useState: lưu state (ở đây là ticketIds lấy từ query string)
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { emitWalletRefresh } from '../hooks/useWallet'

// Component trang PaymentSuccess: hiển thị khi thanh toán VNPay thành công
export default function PaymentSuccess() {
  // Lấy thông tin location hiện tại (có location.search = "?status=success&ticketIds=...")
  const location = useLocation()

  // navigate dùng để chuyển trang (VD: /my-tickets, /, /payment-failed)
  const navigate = useNavigate()

  // Auth context: access user and setUser so we can update wallet immediately
  const { user, setUser } = useAuth()

  // State lưu mã vé trả về từ backend qua query params
  // ticketIds có thể là chuỗi "1,2,3" hoặc "ABC123", hoặc null nếu không có
  const [ticketIds, setTicketIds] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string>('vnpay')
  const [showConfetti, setShowConfetti] = useState(true)
  // Trạng thái gửi email: true nếu backend báo gửi thất bại (param emailFailed=1)
  const [emailFailed, setEmailFailed] = useState(false)

  /**
   * useEffect: chạy mỗi khi query string thay đổi (location.search)
   * Mục tiêu:
   * - Đọc query params từ URL
   * - Kiểm tra status
   * - Lấy ticketIds/ticketId để hiển thị cho user
   *
   * Lý do cần đọc query params:
   * - Sau khi VNPay thanh toán xong, backend thường redirect về FE kèm query
   *   ví dụ: /payment-success?status=success&ticketIds=12,13
   */
  useEffect(() => {
    // Tạo object URLSearchParams để đọc query string dễ dàng
    // location.search là phần sau dấu "?" trong URL
    const params = new URLSearchParams(location.search)

    // Lấy param "status" từ URL (vd: success / failed / pending...)
    const status = params.get('status')

    /**
     * Nếu backend redirect về trang success nhưng status lại không phải "success"
     * -> coi như thất bại và chuyển user sang trang /payment-failed
     *
     * navigate('/payment-failed' + location.search):
     * - giữ nguyên query params để trang failed cũng đọc được thông tin
     *
     * { replace: true }:
     * - thay thế history entry hiện tại
     * - user bấm Back không quay lại success “bị sai status”
     */
    if (status && status !== 'success') {
      navigate('/payment-failed' + location.search, { replace: true })
      return // dừng effect
    }

    /**
     * Backend hiện tại gửi "ticketIds"
     * nhưng để tương thích trường hợp cũ hoặc khác backend,
     * ta fallback về "ticketId" nếu "ticketIds" không có
     *
     * Ví dụ:
     * - ticketIds=12,13,14 (nhiều vé)
     * - ticketId=12 (1 vé)
     */
    const ticketsParam = params.get('ticketIds') ?? params.get('ticketId')
    const method = params.get('method') ?? 'vnpay'
    const emailFailedParam = params.get('emailFailed')

    // Cập nhật state để UI hiển thị "Mã vé: ..."
    setTicketIds(ticketsParam)
    setPaymentMethod(method)
    if (emailFailedParam === '1') {
      setEmailFailed(true)
    }

    // Tắt confetti sau 5 giây
    const timer = setTimeout(() => setShowConfetti(false), 5000)

    // If backend included newWallet in the redirect query, update local user/wallet immediately
    const newWalletParam = params.get('newWallet')
    if (newWalletParam) {
      const w = Number(newWalletParam)
      if (!Number.isNaN(w)) {
        setUser((prev) => {
          if (!prev) return prev
          const next = { ...prev, wallet: w }
          try { localStorage.setItem('user', JSON.stringify(next)) } catch (_) { }
          return next
        })
      }
    }

    // Emit signal để refresh wallet balance khi thanh toán thành công
    emitWalletRefresh()

    return () => clearTimeout(timer)
  }, [location.search, navigate, setUser]) // dependency: chạy lại khi query string hoặc navigate thay đổi

  /**
   * ===================== RENDER UI =====================
   * Trang này hiển thị:
   * - Animation confetti
   * - Icon thành công
   * - Thông báo thanh toán thành công
   * - Nếu có ticketIds thì hiển thị mã vé
   * - 2 nút:
   *   + Xem Vé của tôi -> /my-tickets
   *   + Về Dashboard -> /
   */
  return (
    // Wrapper căn giữa cả trang với gradient background đẹp mắt
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 overflow-hidden">
      {/* Confetti Animation Background */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-fall"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            >
              <PartyPopper
                className="text-orange-400 opacity-70"
                size={16 + Math.random() * 16}
              />
            </div>
          ))}
        </div>
      )}

      {/* Card với animation và shadow đẹp hơn */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-12 max-w-lg w-full mx-4 transform transition-all duration-500 hover:shadow-3xl animate-fade-in-up">
        {/* Icon check xanh với animation pulse */}
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-6 mx-auto block animate-bounce-slow shadow-lg">
          <CheckCircle2 className="w-14 h-14 text-white" strokeWidth={3} />
        </div>

        {/* Tiêu đề thông báo với màu gradient */}
        <h1 className="text-4xl font-bold text-center bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          🎉 Thanh toán thành công!
        </h1>

        {/* Payment method badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
            {paymentMethod === 'wallet' ? (
              <>
                <Wallet className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-600">Thanh toán bằng Ví</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M3 10h18M7 15h0m4 0h0m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-semibold text-blue-600">VNPay</span>
              </>
            )}
          </div>
        </div>

        {/* Mô tả với styling đẹp hơn */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
            <Ticket className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Vé của bạn đã được <span className="font-semibold text-green-700">tạo thành công</span> và sẵn sàng sử dụng!
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
            <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Email xác nhận với <span className="font-semibold text-blue-700">mã QR check-in</span> và <span className="font-semibold text-blue-700">file PDF</span> đã được gửi đến hộp thư của bạn
            </p>
          </div>

          {/* Cảnh báo nếu gửi mail thất bại */}
          {emailFailed && (
            <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-400">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-yellow-800 font-medium leading-relaxed">
                ⚠️ Giao dịch thành công nhưng gửi mail gặp sự cố, vui lòng tải vé thủ công từ mục <strong>"Vé của tôi"</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Hiển thị mã vé với box đẹp hơn */}
        {ticketIds && (
          <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 border-2 border-orange-300 rounded-2xl p-6 mb-8 shadow-inner">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Ticket className="w-5 h-5 text-orange-600" />
              <p className="text-sm font-medium text-gray-600">Mã vé của bạn</p>
            </div>
            <p className="text-2xl font-bold font-mono text-center text-orange-600 tracking-wide">
              #{ticketIds}
            </p>
            <p className="text-xs text-center text-gray-500 mt-2">
              Lưu lại mã này để tra cứu vé
            </p>
          </div>
        )}

        {/* Khối nút điều hướng với style đẹp hơn */}
        <div className="space-y-3">
          {/* Nút chính: Xem vé */}
          <button
            onClick={() => navigate('/my-tickets')}
            className="group relative w-full px-6 py-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white font-semibold shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
            <span className="relative flex items-center justify-center gap-2">
              <Ticket className="w-5 h-5" />
              Xem Vé của tôi
            </span>
          </button>

          {/* Nút phụ: Về trang chính */}
          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:border-gray-400 transform hover:scale-105 transition-all duration-300 shadow-sm hover:shadow-md"
          >
            🏠 Về trang chính
          </button>
        </div>

        {/* Thông tin hữu ích */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>Kiểm tra email để xem chi tiết vé và QR code</span>
          </div>
        </div>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s infinite;
        }

        .animate-fall {
          animation: fall linear infinite;
        }
      `}</style>
    </div>
  )
}
