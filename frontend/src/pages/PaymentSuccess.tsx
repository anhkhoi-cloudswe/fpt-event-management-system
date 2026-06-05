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

interface PurchasedTicket {
  ticketId: number
  eventName: string
  venueName: string
  startTime: string
  category: string
  seatCode: string
  price: number
}

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

  const [purchasedTickets, setPurchasedTickets] = useState<PurchasedTicket[]>([])
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false)

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
    try {
      if (!location || typeof location.search !== 'string') {
        setTicketIds(null)
        setPaymentMethod('vnpay')
        return
      }

      // Tạo object URLSearchParams để đọc query string dễ dàng
      // location.search là phần sau dấu "?" trong URL
      const params = new URLSearchParams(location.search)

      const getSafeParam = (name: string): string | null => {
        try {
          return params.get(name)
        } catch (_) {
          return null
        }
      }

      // Lấy param "status" từ URL (vd: success / failed / pending...)
      const status = getSafeParam('status')

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
      const ticketsParam = getSafeParam('ticketIds') ?? getSafeParam('ticketId')
      const method = getSafeParam('method') ?? 'bank_transfer'
      const emailFailedParam = getSafeParam('emailFailed')

      setTicketIds(ticketsParam)
      setPaymentMethod(method)

      if (emailFailedParam === '1') {
        setEmailFailed(true)
      }

      // Tắt confetti sau 5 giây
      const timer = setTimeout(() => setShowConfetti(false), 5000)

      // If backend included newWallet in the redirect query, update local user/wallet immediately
      const newWalletParam = getSafeParam('newWallet')
      if (newWalletParam) {
        const w = Number(newWalletParam)
        if (!Number.isNaN(w)) {
          setUser((prev) => {
            if (!prev) return prev
            return { ...prev, wallet: w }
          })
        }
      }

      // Emit signal để refresh wallet balance khi thanh toán thành công
      try {
        emitWalletRefresh()
      } catch (err) {
        console.error('Failed to emit wallet refresh:', err)
      }

      // Mark next event-detail request to bypass caches and force fresh seat statuses.
      try {
        const refreshToken = getSafeParam('eventId') || String(Date.now())
        sessionStorage.setItem('force-event-detail-refresh', refreshToken)
      } catch (_) {
        // Ignore storage errors.
      }

      return () => clearTimeout(timer)
    } catch (error) {
      console.error('Critical error in PaymentSuccess query parameter parsing:', error)
      setTicketIds(null)
      setPaymentMethod('vnpay')
    }
  }, [location, navigate, setUser]) // dependency: chạy lại khi query string hoặc navigate thay đổi

  useEffect(() => {
    if (!ticketIds) return;
    
    const fetchTicketDetails = async () => {
      setLoadingDetails(true);
      try {
        const idList = ticketIds.split(',').map(id => Number(id.trim())).filter(id => !isNaN(id));
        if (idList.length === 0) {
          setLoadingDetails(false);
          return;
        }

        const res = await fetch(`/api/registrations/my-tickets?page=1&limit=50`, {
          credentials: 'include',
        });
        
        if (res.ok) {
          const data = await res.json();
          const allTickets = data && Array.isArray(data.tickets) ? data.tickets : [];
          
          const matching: PurchasedTicket[] = [];
          allTickets.forEach((t: any) => {
            const id = t.ticketId ?? t.id;
            if (id && idList.includes(Number(id))) {
              matching.push({
                ticketId: Number(id),
                eventName: t.eventName || t.eventTitle || t.title || 'Sự kiện',
                venueName: t.venueName || t.location || 'Đang cập nhật địa điểm',
                startTime: t.startTime || t.eventStartTime || t.startDate || '',
                category: t.category || 'Vé tiêu chuẩn',
                seatCode: t.seatCode || t.seatNumber || '',
                price: t.categoryPrice || 0
              });
            }
          });
          
          setPurchasedTickets(matching);
        }
      } catch (err) {
        console.error('Error fetching purchased ticket details:', err);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchTicketDetails();
  }, [ticketIds]);

  const formatTicketTime = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return '';
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (_) {
      return '';
    }
  };

  // Group matching tickets by event name/eventId
  const firstTicket = purchasedTickets[0];
  const allSeats = purchasedTickets.map(t => t.seatCode).filter(Boolean);
  const totalSum = purchasedTickets.reduce((acc, t) => acc + t.price, 0);

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
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
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
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-12 max-w-lg w-full mx-4 transform transition-all duration-500 hover:shadow-3xl dark:border dark:border-slate-800/85 animate-fade-in-up">
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-800/60 dark:to-slate-850/60 border border-blue-200 dark:border-slate-800">
            {paymentMethod === 'wallet' ? (
              <>
                <Wallet className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-600">Thanh toán bằng Ví</span>
              </>
            ) : paymentMethod === 'bank_transfer' ? (
              <>
                <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold text-blue-600">Chuyển khoản Ngân hàng</span>
              </>
            ) : paymentMethod === 'free' ? (
              <>
                <PartyPopper className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-600">Đặt vé Miễn phí</span>
              </>
            ) : (
              <>
                <span className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white mr-1">V</span>
                <span className="text-sm font-semibold text-indigo-600">Ví điện tử VNPay</span>
              </>
            )}
          </div>
        </div>

        {/* Mô tả với styling đẹp hơn */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-emerald-950/20 dark:to-emerald-950/10 rounded-xl border border-green-200 dark:border-emerald-900/30">
            <Ticket className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700 dark:text-slate-350 leading-relaxed">
              Vé của bạn đã được <span className="font-semibold text-green-700 dark:text-green-400">tạo thành công</span> và sẵn sàng sử dụng!
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/10 rounded-xl border border-blue-200 dark:border-blue-900/30">
            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700 dark:text-slate-350 leading-relaxed">
              Email xác nhận với <span className="font-semibold text-blue-700 dark:text-blue-400">mã QR check-in</span> và <span className="font-semibold text-blue-700 dark:text-blue-400">file PDF</span> đã được gửi đến hộp thư của bạn
            </p>
          </div>

          {/* Cảnh báo nếu gửi mail thất bại */}
          {emailFailed && (
            <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-400">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-yellow-850 dark:text-yellow-200 font-medium leading-relaxed">
                ⚠️ Giao dịch thành công nhưng gửi mail gặp sự cố, vui lòng tải vé thủ công từ mục <strong>"Vé của tôi"</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Ticket Details Receipt */}
        {loadingDetails ? (
          <div className="my-6 p-6 border border-gray-100 dark:border-slate-800 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Đang tải thông tin chi tiết vé...</p>
          </div>
        ) : purchasedTickets.length > 0 && firstTicket ? (
          <div className="my-6 p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 text-left space-y-3.5 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-slate-900 rounded-full" />
            
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-800 pb-2.5 flex items-center justify-between">
              <span>CHI TIẾT MUA VÉ</span>
              <span className="text-xs font-mono font-bold text-slate-400">RECEIPT</span>
            </h3>
            
            <div className="space-y-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              <div className="flex justify-between items-start gap-4">
                <span className="font-semibold text-slate-450 dark:text-slate-500">Sự kiện</span>
                <span className="text-slate-850 dark:text-slate-200 text-right">{firstTicket.eventName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-455 dark:text-slate-500">Thời gian</span>
                <span className="text-slate-855 dark:text-slate-200">{formatTicketTime(firstTicket.startTime)}</span>
              </div>
              <div className="flex justify-between items-start gap-4">
                <span className="font-semibold text-slate-455 dark:text-slate-500">Địa điểm</span>
                <span className="text-slate-855 dark:text-slate-200 text-right">{firstTicket.venueName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-455 dark:text-slate-500">Hạng vé</span>
                <span className="text-slate-855 dark:text-slate-200">{firstTicket.category}</span>
              </div>
              {allSeats.length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-455 dark:text-slate-500">Ghế ngồi</span>
                  <span className="text-orange-600 dark:text-orange-400 font-extrabold bg-orange-50 dark:bg-orange-950/30 px-2.5 py-0.5 rounded-md border border-orange-100/40 dark:border-orange-900/30">
                    {allSeats.join(', ')}
                  </span>
                </div>
              )}
              <div className="pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-sm font-extrabold text-slate-700 dark:text-slate-300">Tổng thanh toán</span>
                <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                  {totalSum.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Hiển thị mã vé với box đẹp hơn */}
        {ticketIds && !loadingDetails && purchasedTickets.length === 0 && (
          <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-slate-850/40 dark:via-slate-800/30 dark:to-slate-850/40 border-2 border-orange-300 dark:border-orange-550/40 rounded-2xl p-6 mb-8 shadow-inner">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Ticket className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <p className="text-sm font-medium text-gray-600 dark:text-slate-350">Danh sách mã vé của bạn</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(() => {
                try {
                  const ticketIdArray = typeof ticketIds === 'string' ? ticketIds.split(',') : [];
                  return ticketIdArray.map((tid) => {
                    const trimmedId = String(tid).trim();
                    if (!trimmedId) return null;
                    return (
                      <span
                        key={trimmedId}
                        className="px-3 py-1.5 rounded-lg bg-orange-600 text-white font-bold font-mono text-base shadow-sm border border-orange-700"
                      >
                        #{trimmedId}
                      </span>
                    );
                  });
                } catch (err) {
                  console.error('Error rendering ticket badges:', err);
                  return <span className="text-orange-600 font-bold">#{ticketIds}</span>;
                }
              })()}
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-slate-450 mt-4">
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
            className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-slate-800 dark:hover:to-slate-850 hover:border-gray-400 dark:hover:border-slate-600 transform hover:scale-105 transition-all duration-300 shadow-sm hover:shadow-md"
          >
            🏠 Về trang chính
          </button>
        </div>

        {/* Thông tin hữu ích */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-800">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-slate-450">
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
