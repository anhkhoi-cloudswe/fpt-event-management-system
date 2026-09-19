// Import hook của React Router:
// - useLocation: dùng để đọc URL hiện tại (query params từ backend/VNPay redirect)
// - useNavigate: dùng để điều hướng user sang trang khác bằng code
import { useLocation, useNavigate } from 'react-router-dom'

// Import icon XCircle (dấu X đỏ) để biểu thị trạng thái thất bại
import { XCircle, Wallet, AlertCircle, Home, RefreshCcw } from 'lucide-react'

// Component PaymentFailed: trang hiển thị khi thanh toán VNPay thất bại
export default function PaymentFailed() {
  // Lấy thông tin URL hiện tại (bao gồm query string)
  const location = useLocation()

  // Hook điều hướng trang (VD: về Dashboard)
  const navigate = useNavigate()

  /**
   * URLSearchParams:
   * - Dùng để parse query string trong URL
   * - location.search có dạng: "?vnp_ResponseCode=01&message=..."
   */
  const params = new URLSearchParams(location.search)
  const paymentMethod = params.get('method') || 'bank_transfer'

  /**
   * Lấy mã phản hồi từ VNPay
   * - vnp_ResponseCode: mã trạng thái thanh toán VNPay
   *   VD:
   *   - "00": thành công (thường không vào trang này)
   *   - "01": giao dịch chưa hoàn tất
   *   - "24": khách hàng hủy giao dịch
   *   - ...
   */
  const vnpResponseCode = params.get('vnp_ResponseCode')

  /**
   * Lấy thông điệp lỗi (message) từ query params
   *
   * Backend hoặc VNPay có thể gửi message với các key khác nhau,
   * nên ta lần lượt fallback:
   * 1) message
   * 2) reason
   * 3) vnp_Message
   *
   * → đảm bảo có thông tin hiển thị cho user
   */
  const vnpMessage =
    params.get('message') ||
    params.get('reason') ||
    params.get('vnp_Message')

  // Helper function to render friendly wallet error messages
  const getWalletErrorMessage = () => {
    if (!vnpMessage) return null

    // Check for specific wallet errors
    if (vnpMessage.includes('wallet_not_enough') || vnpMessage.toLowerCase().includes('insufficient')) {
      return (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Wallet className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="font-bold text-red-800 dark:text-red-300 mb-1 text-sm">
                Số dư trong ví không đủ
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                Ví của bạn không có đủ số tiền để hoàn tất giao dịch này. Vui lòng nạp thêm tiền hoặc chọn phương thức thanh toán khác.
              </p>
            </div>
          </div>
        </div>
      )
    }

    if (vnpMessage.includes('seat') && vnpMessage.includes('taken')) {
      return (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="font-bold text-amber-800 dark:text-amber-300 mb-1 text-sm">
                Ghế đã có người đặt
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                Một hoặc nhiều ghế bạn chọn đã có người khác đặt trước. Vui lòng quay lại và chọn ghế khác.
              </p>
            </div>
          </div>
        </div>
      )
    }

    // Generic error message
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
          <div className="text-left">
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{vnpMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  /**
   * ===================== RENDER UI =====================
   */
  return (
    // Wrapper căn giữa nội dung cả chiều ngang và dọc
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50/50 via-slate-50 to-orange-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      {/* Card hiển thị thông tin lỗi */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-12 max-w-lg w-full mx-4">
        {/* Icon X đỏ biểu thị thất bại */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-rose-500 to-red-600 rounded-full mb-6 mx-auto block shadow-lg shadow-red-500/25">
          <XCircle className="w-12 h-12 text-white" strokeWidth={3} />
        </div>

        {/* Tiêu đề */}
        <h1 className="text-3xl font-black text-center text-slate-900 dark:text-white mb-3">
          Thanh toán thất bại
        </h1>

        {/* Payment method badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
            {paymentMethod === 'wallet' ? (
              <>
                <Wallet className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-xs font-bold text-red-600 dark:text-red-400">Thanh toán bằng Ví</span>
              </>
            ) : paymentMethod === 'bank_transfer' ? (
              <>
                <span className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white mr-0.5">B</span>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Chuyển khoản Ngân hàng</span>
              </>
            ) : (
              <>
                <span className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white mr-0.5">V</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Ví VNPay</span>
              </>
            )}
          </div>
        </div>

        {/* Wallet-specific error message with friendly UI */}
        {paymentMethod === 'wallet' && getWalletErrorMessage()}

        {/* Payment error details */}
        {paymentMethod !== 'wallet' && (vnpResponseCode || vnpMessage) && (
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
            {vnpResponseCode && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Mã phản hồi: <span className="font-mono font-bold text-red-600 dark:text-red-400">{vnpResponseCode}</span>
              </p>
            )}
            {vnpMessage && (
              <p className="text-xs text-slate-700 dark:text-slate-300 text-center mt-1.5 font-medium leading-relaxed">
                {vnpMessage}
              </p>
            )}
          </div>
        )}

        {/* Generic message if no specific error */}
        {!vnpMessage && !vnpResponseCode && (
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-8 font-medium">
            Đã xảy ra lỗi trong quá trình thanh toán. Vui lòng thử lại sau.
          </p>
        )}

        {/* Khối nút hành động */}
        <div className="space-y-3">
          {/* Nút thử lại */}
          <button
            onClick={() => navigate(-1)}
            className="w-full px-5 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-blue-600/20 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 flex items-center justify-center gap-2 active:scale-98"
          >
            <RefreshCcw className="w-4 h-4" />
            Thử lại thanh toán
          </button>

          {/* Nút quay về Dashboard */}
          <button
            onClick={() => navigate('/')}
            className="w-full px-5 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-300 flex items-center justify-center gap-2 active:scale-98"
          >
            <Home className="w-4 h-4" />
            Về trang chính
          </button>
        </div>

        {/* Thông tin hữu ích */}
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Nếu vấn đề tiếp diễn xảy ra, vui lòng liên hệ hỗ trợ</span>
          </div>
        </div>
      </div>
    </div>
  )
}
