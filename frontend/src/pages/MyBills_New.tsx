// Import hook React:
// - useState: lưu state UI (danh sách hóa đơn, loading, error)
// - useEffect: chạy side-effect (gọi API) khi component mount
import { useEffect, useState, useCallback } from 'react'

// Import icon để hiển thị UI trạng thái hóa đơn
import { FileText, CreditCard, Search, Filter } from 'lucide-react'

// Import components
import Pagination from '../components/common/Pagination'
import BillSkeleton from '../components/common/BillSkeleton'

// Định nghĩa kiểu dữ liệu Bill (hóa đơn) dùng trong frontend
type Bill = {
    id: string                // mã hóa đơn (string để dễ hiển thị "#123")
    createdAt: string         // thời gian tạo hóa đơn (ISO string từ BE)
    totalAmount: number       // tổng tiền
    status: 'PENDING' | 'PAID' | 'CANCELED'  // trạng thái hóa đơn (3 trạng thái)
    paymentMethod?: string    // phương thức thanh toán (VNPAY, WALLET...)
}

// Response type từ backend pagination
type PaginatedBillsResponse = {
    bills: Bill[]
    totalPages: number
    currentPage: number
    totalRecords: number
}

// Component MyBills: trang "Hóa đơn của tôi"
export default function MyBills() {
    // bills: danh sách hóa đơn lấy từ API
    const [bills, setBills] = useState<Bill[]>([])

    // loading: đang tải dữ liệu hóa đơn
    const [loading, setLoading] = useState(true)

    // error: thông báo lỗi khi gọi API fail
    const [error, setError] = useState<string | null>(null)

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalRecords, setTotalRecords] = useState(0)
    const [limit] = useState(10)

    // Search & Filter states
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [methodFilter, setMethodFilter] = useState('')

    // Debounce timer
    const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

    /**
     * fetchBills: Gọi API lấy danh sách hóa đơn với pagination và filter
     */
    const fetchBills = useCallback(async (page: number, search: string, status: string, method: string) => {
        try {
            // Bật loading trước khi gọi API
            setLoading(true)
            setError(null)

            // Lấy JWT token (đã login) từ localStorage
            const token = localStorage.getItem('token')

            // Build query params
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            })

            if (search) {
                params.append('search', search)
            }

            if (status) {
                params.append('status', status)
            }

            if (method) {
                params.append('method', method)
            }

            // Gọi API lấy hóa đơn của tôi
            const res = await fetch(`/api/payment/my-bills?${params.toString()}`, {
                headers: {
                    // Gửi token lên backend để xác thực user
                    Authorization: `Bearer ${token}`,

                    // Header này thường dùng khi chạy qua ngrok để bỏ warning (không bắt buộc)
                    'ngrok-skip-browser-warning': '1'
                },
                // credentials include để gửi cookie nếu backend dùng cookie/session
                credentials: 'include'
            })

            if (!res.ok) {
                throw new Error('Failed to fetch bills')
            }

            // Parse JSON từ response
            const data: PaginatedBillsResponse = await res.json()

            // Log để debug: xem BE trả về đúng cấu trúc chưa
            console.log('Paginated bills from API:', data)

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
            const mapped: Bill[] = data.bills.map((b: any) => ({
                // billId có thể là number -> ép sang string để hiển thị
                id: b.billId?.toString(),

                // createdAt giữ nguyên (chuỗi thời gian)
                createdAt: b.createdAt,

                // totalAmount ép Number để chắc chắn là số
                totalAmount: Number(b.totalAmount),

                // 🔥 FIX: lấy từ paymentStatus (BE), không phải status
                status: b.paymentStatus,

                // Payment method
                paymentMethod: b.paymentMethod
            }))

            // Lưu danh sách hóa đơn vào state để render UI
            setBills(mapped)
            setTotalPages(data.totalPages || 1)
            setCurrentPage(data.currentPage || 1)
            setTotalRecords(data.totalRecords || 0)
        } catch (err: any) {
            // Nếu lỗi network/parse/json...
            // setError để UI hiển thị lỗi
            setError(err.message)
            console.error('Error loading bills:', err)
        } finally {
            // Dù thành công hay lỗi đều tắt loading
            setLoading(false)
        }
    }, [limit])

    // Fetch bills khi component mount hoặc khi page/search/filter thay đổi
    useEffect(() => {
        fetchBills(currentPage, searchQuery, statusFilter, methodFilter)
    }, [currentPage, searchQuery, statusFilter, methodFilter, fetchBills])

    // Handle search with debounce (500ms)
    const handleSearchChange = (value: string) => {
        setSearchInput(value)

        // Clear previous timer
        if (debounceTimer) {
            clearTimeout(debounceTimer)
        }

        // Set new timer
        const timer = setTimeout(() => {
            setSearchQuery(value)
            setCurrentPage(1) // Reset to first page on search
        }, 500)

        setDebounceTimer(timer)
    }

    // Handle status filter change
    const handleStatusChange = (value: string) => {
        setStatusFilter(value)
        setCurrentPage(1) // Reset to first page on filter
    }

    // Handle method filter change
    const handleMethodChange = (value: string) => {
        setMethodFilter(value)
        setCurrentPage(1) // Reset to first page on filter
    }

    // Handle page change
    const handlePageChange = (page: number) => {
        setCurrentPage(page)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    /**
     * ===================== RENDER UI =====================
     * Trang này hiển thị:
     * - Tiêu đề "Hóa đơn của tôi"
     * - Search & Filter bar
     * - Nếu loading: show skeleton
     * - Nếu lỗi: show error
     * - Nếu có bills: show bảng hóa đơn gồm mã, ngày tạo, số tiền, trạng thái
     * - Pagination controls
     */
    return (
        <div>
            {/* Header trang */}
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Hóa đơn của tôi</h1>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Search input */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo mã hóa đơn..."
                            value={searchInput}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Status filter */}
                    <div className="relative min-w-[180px]">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="PENDING">Chờ thanh toán</option>
                            <option value="PAID">Đã thanh toán</option>
                            <option value="CANCELED">Đã hủy</option>
                        </select>
                    </div>

                    {/* Method filter */}
                    <div className="relative min-w-[180px]">
                        <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                            value={methodFilter}
                            onChange={(e) => handleMethodChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                        >
                            <option value="">Tất cả phương thức</option>
                            <option value="VNPAY">VNPay</option>
                            <option value="WALLET">Ví điện tử</option>
                        </select>
                    </div>
                </div>

                {/* Results count */}
                {!loading && (
                    <div className="mt-3 text-sm text-gray-600">
                        Tìm thấy {totalRecords} hóa đơn
                    </div>
                )}
            </div>

            {/* Nếu có error -> hiển thị lỗi */}
            {!loading && error && (
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                    <div className="text-red-600">{error}</div>
                </div>
            )}

            {/* Nếu không loading, không lỗi, và có hóa đơn -> render bảng */}
            {!loading && !error && bills.length > 0 && (
                <>
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
                                        Phương thức
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

                                        {/* Cột phương thức thanh toán */}
                                        <td className="px-6 py-4 text-sm text-center text-gray-600">
                                            {bill.paymentMethod || 'N/A'}
                                        </td>

                                        {/* Cột trạng thái */}
                                        <td className="px-6 py-4 text-sm text-center">
                                            {/* Badge trạng thái với màu khác nhau tùy status */}
                                            <span
                                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                        ${bill.status === 'PAID'
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

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />
                    )}
                </>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
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
                        <tbody className="bg-white divide-y divide-gray-200">
                            <BillSkeleton />
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && bills.length === 0 && (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg mb-2">
                        {searchQuery || statusFilter || methodFilter
                            ? 'Không tìm thấy hóa đơn phù hợp'
                            : 'Bạn chưa có hóa đơn nào'}
                    </p>
                    {(searchQuery || statusFilter || methodFilter) && (
                        <button
                            onClick={() => {
                                setSearchInput('')
                                setSearchQuery('')
                                setStatusFilter('')
                                setMethodFilter('')
                                setCurrentPage(1)
                            }}
                            className="text-blue-600 hover:text-blue-700 underline"
                        >
                            Xóa bộ lọc
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
