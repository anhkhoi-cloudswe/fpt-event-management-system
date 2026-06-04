// Import hook React:
// - useState: lưu state UI (danh sách hóa đơn, loading, error)
// - useEffect: chạy side-effect (gọi API) khi component mount
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

// Import useSearchParams để quản lý URL params
import { useSearchParams } from 'react-router-dom'

// Import icon để hiển thị UI trạng thái hóa đơn
import { FileText, CreditCard, Search, Filter } from 'lucide-react'

// Import helper để format thời gian theo Vietnam timezone
import { formatVietnamDateTime } from '../utils/dateFormat'

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
  const { currentLanguage } = useAuth()
  // URL params management
  const [searchParams, setSearchParams] = useSearchParams()

  // bills: danh sách hóa đơn lấy từ API
  const [bills, setBills] = useState<Bill[]>([])

  // loading: đang tải dữ liệu hóa đơn
  const [loading, setLoading] = useState(true)

  // error: thông báo lỗi khi gọi API fail
  const [error, setError] = useState<string | null>(null)

  // Pagination states - Initialize from URL params
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get('page')
    return page ? parseInt(page, 10) : 1
  })
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [limit] = useState(10)

  // Search & Filter states - Initialize from URL params
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '')
  const [methodFilter, setMethodFilter] = useState(() => searchParams.get('method') || '')

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
          credentials: 'include',

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

  // Sync URL params khi state thay đổi
  useEffect(() => {
    const params = new URLSearchParams()

    if (currentPage > 1) {
      params.set('page', currentPage.toString())
    }

    if (searchQuery) {
      params.set('search', searchQuery)
    }

    if (statusFilter) {
      params.set('status', statusFilter)
    }

    if (methodFilter) {
      params.set('method', methodFilter)
    }

    // Use replace for search to avoid cluttering browser history
    setSearchParams(params, { replace: true })
  }, [currentPage, searchQuery, statusFilter, methodFilter, setSearchParams])

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
      setCurrentPage(1) // Reset to first page on search (will sync to URL)
    }, 500)

    setDebounceTimer(timer)
  }

  // Handle status filter change
  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1) // Reset to first page on filter (will sync to URL)
  }

  // Handle method filter change
  const handleMethodChange = (value: string) => {
    setMethodFilter(value)
    setCurrentPage(1) // Reset to first page on filter (will sync to URL)
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
    <div className="bg-gradient-to-br from-orange-50/20 via-slate-50 to-amber-50/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      {/* Header trang */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-4xl">
            {currentLanguage === 'en' ? 'My Bills' : 'Hóa đơn của tôi'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl font-medium">
            {currentLanguage === 'en' ? 'Track transaction history, event ticket payments, and financial documents at FPT University.' : 'Theo dõi lịch sử giao dịch, thanh toán vé sự kiện và các chứng từ tài chính tại trường FPT.'}
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-5 shadow-md mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search input */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder={currentLanguage === 'en' ? 'Search by bill ID...' : 'Tìm kiếm theo mã hóa đơn...'}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800 dark:text-white font-semibold placeholder-slate-400 text-sm shadow-sm transition-all duration-300"
            />
          </div>

          {/* Status filter */}
          <div className="relative min-w-[180px]">
            <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-750 dark:text-slate-200 font-semibold text-sm shadow-sm appearance-none cursor-pointer transition-all duration-300"
            >
              <option value="">{currentLanguage === 'en' ? 'All Statuses' : 'Tất cả trạng thái'}</option>
              <option value="PENDING">{currentLanguage === 'en' ? 'Pending Payment' : 'Chờ thanh toán'}</option>
              <option value="PAID">{currentLanguage === 'en' ? 'Paid' : 'Đã thanh toán'}</option>
              <option value="CANCELED">{currentLanguage === 'en' ? 'Canceled' : 'Đã hủy'}</option>
            </select>
          </div>

          {/* Method filter */}
          <div className="relative min-w-[180px]">
            <CreditCard className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
            <select
              value={methodFilter}
              onChange={(e) => handleMethodChange(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-750 dark:text-slate-200 font-semibold text-sm shadow-sm appearance-none cursor-pointer transition-all duration-300"
            >
              <option value="">{currentLanguage === 'en' ? 'All Methods' : 'Tất cả phương thức'}</option>
              <option value="MOMO">{currentLanguage === 'en' ? 'MoMo Wallet' : 'Ví MoMo'}</option>
              <option value="WALLET">{currentLanguage === 'en' ? 'E-wallet' : 'Ví điện tử'}</option>
              <option value="FREE">{currentLanguage === 'en' ? 'Free' : 'Miễn phí'}</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <div className="mt-3.5 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider pl-1">
            {currentLanguage === 'en' ? 'Found' : 'Tìm thấy'} <span className="text-orange-600 dark:text-orange-500 font-extrabold">{totalRecords}</span> {currentLanguage === 'en' ? 'bills' : 'hóa đơn'}
          </div>
        )}
      </div>

      {/* Nếu có error -> hiển thị lỗi */}
      {!loading && error && (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-8 text-center shadow-md animate-fade-in-up">
          <div className="text-rose-600 font-bold text-sm">{currentLanguage === 'en' ? 'An error occurred:' : 'Có lỗi xảy ra:'} {error}</div>
        </div>
      )}

      {/* Nếu không loading, không lỗi, và có hóa đơn -> render bảng */}
      {!loading && !error && bills.length > 0 && (
        <>
          <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 overflow-hidden shadow-md animate-fade-in-up">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/60 dark:divide-slate-800">
                {/* Header của bảng */}
                <thead className="bg-slate-50/50 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Bill ID' : 'Mã hóa đơn'}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Created Date' : 'Ngày tạo'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Amount' : 'Số tiền'}
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Method' : 'Phương thức'}
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Status' : 'Trạng thái'}
                    </th>
                  </tr>
                </thead>

                {/* Body của bảng */}
                <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800 bg-transparent">
                  {bills.map((bill, index) => (
                    <tr 
                      key={bill.id} 
                      className="hover:bg-orange-50/10 dark:hover:bg-slate-800/50 transition-all duration-300 group"
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      {/* Cột mã hóa đơn */}
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-white font-extrabold tracking-wide">
                        #{bill.id}
                      </td>

                      {/* Cột ngày tạo */}
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
                        {formatVietnamDateTime(bill.createdAt, 'dd/MM/yyyy HH:mm:ss')}
                      </td>

                      {/* Cột số tiền */}
                      <td className="px-6 py-4 text-sm text-right font-black text-slate-900 dark:text-slate-100">
                        {bill.totalAmount.toLocaleString('vi-VN')} {currentLanguage === 'en' ? 'VND' : 'đ'}
                      </td>

                      {/* Cột phương thức thanh toán */}
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
                          bill.paymentMethod === 'MOMO' ? 'bg-pink-50 dark:bg-pink-950/20 text-pink-700 dark:text-pink-300 border border-pink-100 dark:border-pink-900/30' :
                          bill.paymentMethod === 'WALLET' ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border border-orange-100 dark:border-orange-900/30' :
                          bill.paymentMethod === 'FREE' ? 'bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-900/30' :
                          'bg-slate-50 dark:bg-slate-800 text-slate-650 dark:text-slate-350 border border-slate-100 dark:border-slate-700'
                        }`}>
                          {bill.paymentMethod === 'WALLET' ? (currentLanguage === 'en' ? 'E-Wallet' : 'Ví điện tử') : bill.paymentMethod === 'FREE' ? (currentLanguage === 'en' ? 'Free' : 'Miễn phí') : (bill.paymentMethod || 'N/A')}
                        </span>
                      </td>

                      {/* Cột trạng thái */}
                      <td className="px-6 py-4 text-sm text-center">
                        {bill.status === 'PAID' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/30 shadow-sm shadow-emerald-500/5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {currentLanguage === 'en' ? 'Paid' : 'Đã thanh toán'}
                          </span>
                        ) : bill.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/30 shadow-sm shadow-amber-500/5">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            {currentLanguage === 'en' ? 'Pending Payment' : 'Chờ thanh toán'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/30 shadow-sm shadow-rose-500/5">
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                            {currentLanguage === 'en' ? 'Canceled' : 'Đã hủy'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-5 shadow-md">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 overflow-hidden shadow-md">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
            <thead className="bg-slate-50/50 dark:bg-slate-950/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                  {currentLanguage === 'en' ? 'Bill ID' : 'Mã hóa đơn'}
                </th>
                <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                  {currentLanguage === 'en' ? 'Created Date' : 'Ngày tạo'}
                </th>
                <th className="px-6 py-4 text-right text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                  {currentLanguage === 'en' ? 'Amount' : 'Số tiền'}
                </th>
                <th className="px-6 py-4 text-center text-xs font-extrabold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                  {currentLanguage === 'en' ? 'Status' : 'Trạng thái'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <BillSkeleton />
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && bills.length === 0 && (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-16 text-center shadow-md animate-fade-in-up">
          <div className="p-4 bg-orange-50 dark:bg-orange-950/20 text-orange-500 dark:text-orange-350 rounded-full w-fit mx-auto mb-4 border border-orange-100/50 dark:border-orange-900/30">
            <FileText className="w-12 h-12 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            {searchQuery || statusFilter || methodFilter
              ? (currentLanguage === 'en' ? 'No matching bills found' : 'Không tìm thấy hóa đơn phù hợp')
              : (currentLanguage === 'en' ? "You don't have any bills yet" : 'Bạn chưa có hóa đơn nào')}
          </h3>
          <p className="text-sm text-slate-400 dark:text-slate-455 mt-2 max-w-sm mx-auto font-medium">
            {searchQuery || statusFilter || methodFilter
              ? (currentLanguage === 'en' ? 'Please try again with a different keyword or clear filters.' : 'Vui lòng thử lại với từ khóa khác hoặc xóa bộ lọc.')
              : (currentLanguage === 'en' ? 'Your transactions or event ticket payments will be displayed here.' : 'Các giao dịch hoặc thanh toán vé sự kiện của bạn sẽ hiển thị tại đây.')}
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
              className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-extrabold transition-all duration-300 shadow-md shadow-orange-500/10 hover:scale-[1.02] active:scale-95"
            >
              {currentLanguage === 'en' ? 'Clear filters' : 'Xóa bộ lọc'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

