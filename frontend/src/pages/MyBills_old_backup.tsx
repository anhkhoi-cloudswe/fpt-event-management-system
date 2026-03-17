// Import hook React:
// - useState: lưu state UI (danh sách hóa đơn, loading, error)
// - useEffect: chạy side-effect (gọi API) khi component mount
import { useEffect, useState } from 'react'

// Import icon để hiển thị UI trạng thái hóa đơn
import { FileText, CreditCard } from 'lucide-react'
// FileText: (hiện tại chưa dùng trong UI, có thể dùng cho tiêu đề/biểu tượng hóa đơn)
// CreditCard: icon hiển thị ở badge trạng thái (PAID/PENDING/CANCELED)

// Định nghĩa kiểu dữ liệu Bill (hóa đơn) dùng trong frontend
type Bill = {
  id: string                // mã hóa đơn (string để dễ hiển thị "#123")
  createdAt: string         // thời gian tạo hóa đơn (ISO string từ BE)
  totalAmount: number       // tổng tiền
  status: 'PENDING' | 'PAID' | 'CANCELED'  // trạng thái hóa đơn (3 trạng thái)
}

// Component MyBills: trang “Hóa đơn của tôi”
export default function MyBills() {
  // bills: danh sách hóa đơn lấy từ API
  const [bills, setBills] = useState<Bill[]>([])

  // loading: đang tải dữ liệu hóa đơn
  const [loading, setLoading] = useState(true)

  // error: thông báo lỗi khi gọi API fail
  const [error, setError] = useState<string | null>(null)

  /**
   * useEffect chạy 1 lần khi component mount (dependency []) dùng userEffect chứ không gọi api trực tiếp 
   * trong body function component để tránh gọi API nhiều lần khi re-render. Vì useEffect sẽ chỉ gọi khi 
   * vào trang này
   * Nhiệm vụ:
   * - Lấy token từ localStorage
   * - Gọi API /api/payment/my-bills để lấy danh sách hóa đơn của user
   * - Map dữ liệu BE trả về sang kiểu Bill của FE
   * - Cập nhật state bills/loading/error
   */
  useEffect(() => {
    // fetchBills: hàm async gọi API lấy hóa đơn
    const fetchBills = async () => {
      try {
        // Bật loading trước khi gọi API
        setLoading(true)

        // Lấy JWT token (đã login) từ localStorage
        const token = 'cookie-auth'

        // Gọi API lấy hóa đơn của tôi
        const res = await fetch('/api/payment/my-bills', {
          headers: {
            // Gửi token lên backend để xác thực user
            Authorization: `Bearer ${token}`,

            // Header này thường dùng khi chạy qua ngrok để bỏ warning (không bắt buộc)
            'ngrok-skip-browser-warning': '1'
          },
          // credentials include để gửi cookie nếu backend dùng cookie/session
          credentials: 'include'
        })

        // Parse JSON từ response
        const data = await res.json()

        // Log để debug: xem BE trả về đúng cấu trúc chưa
        console.log('JSON BE trả về:', data)

        /**
         * Map dữ liệu BE -> Bill (FE)
         *
         * Giả sử BE trả các field:
         * - billId
         * - createdAt
         * - totalAmount
         * - paymentStatus
         *
         * 🔥 FIX trong code:
         * - FE dùng status, nhưng BE trả paymentStatus
         * => status = b.paymentStatus
         */
        const mapped: Bill[] = data.map((b: any) => ({
          // billId có thể là number -> ép sang string để hiển thị
          id: b.billId?.toString(),

          // createdAt giữ nguyên (chuỗi thời gian)
          createdAt: b.createdAt,

          // totalAmount ép Number để chắc chắn là số
          totalAmount: Number(b.totalAmount),

          // 🔥 FIX: lấy từ paymentStatus (BE), không phải status
          status: b.paymentStatus
        }))

        // Lưu danh sách hóa đơn vào state để render UI
        setBills(mapped)
      } catch (err: any) {
        // Nếu lỗi network/parse/json...
        // setError để UI hiển thị lỗi
        setError(err.message)
      } finally {
        // Dù thành công hay lỗi đều tắt loading
        setLoading(false)
      }
    }

    // Gọi hàm fetchBills khi component mount
    fetchBills()
  }, [])

  /**
   * ===================== RENDER UI =====================
   * Trang này hiển thị:
   * - Tiêu đề “Hóa đơn của tôi”
   * - Nếu loading: show "Đang tải hóa đơn..."
   * - Nếu lỗi: show error
   * - Nếu có bills: show bảng hóa đơn gồm mã, ngày tạo, số tiền, trạng thái
   */
  return (
    <div>
      {/* Header trang */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Hóa đơn của tôi</h1>
      </div>

      {/* Nếu đang loading -> hiển thị card thông báo */}
      {loading && (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          Đang tải hóa đơn...
        </div>
      )}

      {/* Nếu không loading mà có error -> hiển thị lỗi */}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {/* Nếu không loading, không lỗi, và có hóa đơn -> render bảng */}
      {!loading && !error && bills.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Table hiển thị danh sách hóa đơn */}
          <table className="min-w-full divide-y divide-gray-200">
            {/* Header của bảng */}
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">
                  Mã hóa đơn
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">
                  Ngày tạo
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">
                  Số tiền
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">
                  Trạng thái
                </th>
              </tr>
            </thead>

            {/* Body của bảng */}
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Duyệt từng hóa đơn để render 1 dòng */}
              {bills.map(bill => (
                <tr key={bill.id} className="hover:bg-gray-50">
                  {/* Cột mã hóa đơn */}
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                    {/* Hiển thị dạng #id cho dễ nhìn */}
                    #{bill.id}
                  </td>

                  {/* Cột ngày tạo */}
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {/* Convert createdAt thành Date rồi format theo locale vi-VN */}
                    {new Date(bill.createdAt).toLocaleString('vi-VN')}
                  </td>

                  {/* Cột số tiền */}
                  <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                    {/* Format số theo VN: 1000000 -> 1.000.000 */}
                    {bill.totalAmount.toLocaleString('vi-VN')} đ
                  </td>

                  {/* Cột trạng thái */}
                  <td className="px-6 py-4 text-sm text-center">
                    {/* Badge trạng thái với màu khác nhau tùy status */}
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                        ${
                          bill.status === 'PAID'
                            ? 'bg-green-100 text-green-700'   // đã thanh toán
                            : bill.status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-700' // chờ thanh toán
                            : 'bg-red-100 text-red-700'       // đã hủy
                        }`}
                    >
                      {/* Icon credit card để minh họa trạng thái thanh toán */}
                      <CreditCard className="w-3 h-3 mr-1" />

                      {/* Text trạng thái tiếng Việt */}
                      {bill.status === 'PAID'
                        ? 'Đã thanh toán'
                        : bill.status === 'PENDING'
                        ? 'Chờ thanh toán'
                        : 'Đã hủy'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
