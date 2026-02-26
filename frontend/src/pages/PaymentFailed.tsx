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
  const paymentMethod = params.get('method') || 'vnpay'

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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Wallet className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-red-800 mb-1">
                Số dư trong ví không đủ
              </p>
              <p className="text-sm text-red-700">
                Ví của bạn không có đủ số tiền để hoàn tất giao dịch này. Vui lòng nạp thêm tiền hoặc chọn phương thức thanh toán khác.
              </p>
            </div>
          </div>
        </div>
      )
    }

    if (vnpMessage.includes('seat') && vnpMessage.includes('taken')) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-yellow-800 mb-1">
                Ghế đã có người đặt
              </p>
              <p className="text-sm text-yellow-700">
                Một hoặc nhiều ghế bạn chọn đã có người khác đặt trước. Vui lòng quay lại và chọn ghế khác.
              </p>
            </div>
          </div>
        </div>
      )
    }

    // Generic error message
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="text-left">
            <p className="text-sm text-gray-700">{vnpMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  /**
   * ===================== RENDER UI =====================
   *
   * Trang này có nhiệm vụ:
   * - Thông báo thanh toán thất bại
   * - Hiển thị mã lỗi VNPay (nếu có)
   * - Hiển thị lý do lỗi (nếu có)
   * - Cho user quay về Dashboard
   */
  return (
    // Wrapper căn giữa nội dung cả chiều ngang và dọc
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50">
      {/* Card nền trắng hiển thị thông tin lỗi */}
      <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-lg w-full mx-4">
        {/* Icon X đỏ biểu thị thất bại */}
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-400 to-red-600 rounded-full mb-6 mx-auto block shadow-lg">
          <XCircle className="w-14 h-14 text-white" strokeWidth={3} />
        </div>

        {/* Tiêu đề */}
        <h1 className="text-4xl font-bold text-center bg-gradient-to-r from-red-600 via-orange-600 to-red-600 bg-clip-text text-transparent mb-4">
          Thanh toán thất bại
        </h1>

        {/* Payment method badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-50 to-orange-50 border border-red-200">
            {paymentMethod === 'wallet' ? (
              <>
                <Wallet className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-600">Thanh toán bằng Ví</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="none">
                  <path d="M3 10h18M7 15h0m4 0h0m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-semibold text-red-600">VNPay</span>
              </>
            )}
          </div>
        </div>

        {/* Wallet-specific error message with friendly UI */}
        {paymentMethod === 'wallet' && getWalletErrorMessage()}

        {/* VNPay error code */}
        {paymentMethod !== 'wallet' && vnpResponseCode && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 text-center">
              Mã lỗi VNPay: <span className="font-mono font-bold text-red-600">{vnpResponseCode}</span>
            </p>
            {vnpMessage && (
              <p className="text-sm text-gray-700 text-center mt-2">
                {vnpMessage}
              </p>
            )}
          </div>
        )}

        {/* Generic message if no specific error */}
        {!vnpMessage && !vnpResponseCode && (
          <p className="text-gray-600 text-center mb-8">
            Đã xảy ra lỗi trong quá trình thanh toán. Vui lòng thử lại sau.
          </p>
        )}

        {/* Khối nút hành động */}
        <div className="space-y-3">
          {/* Nút thử lại */}
          <button
            onClick={() => navigate(-1)} // quay lại trang trước đó
            className="group relative w-full px-6 py-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white font-semibold shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
            <span className="relative flex items-center justify-center gap-2">
              <RefreshCcw className="w-5 h-5" />
              Thử lại thanh toán
            </span>
          </button>

          {/* Nút quay về Dashboard */}
          <button
            onClick={() => navigate('/')} // điều hướng về trang Dashboard/Home
            className="w-full px-6 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:border-gray-400 transform hover:scale-105 transition-all duration-300 shadow-sm hover:shadow-md"
          >
            <span className="flex items-center justify-center gap-2">
              <Home className="w-5 h-5" />
              Về trang chính
            </span>
          </button>
        </div>

        {/* Thông tin hữu ích */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <AlertCircle className="w-4 h-4" />
            <span>Nếu vấn đề tiếp diễn xảy ra, vui lòng liên hệ hỗ trợ</span>
          </div>
        </div>
      </div>
    </div>
  )
}
