// Import hook React:
// - useState: lưu state UI (danh sách hóa đơn, loading, error)
// - useEffect: chạy side-effect (gọi API) khi component mount
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'

// Import useSearchParams để quản lý URL params
import { useSearchParams } from 'react-router-dom'

// Import icon để hiển thị UI trạng thái hóa đơn
import { FileText, CreditCard, Search, Filter, ChevronDown, Check } from 'lucide-react'

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

  // Dropdown open states and refs for custom popovers
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [isMethodDropdownOpen, setIsMethodDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const methodDropdownRef = useRef<HTMLDivElement>(null)

  // Click outside listener for custom dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false)
      }
      if (methodDropdownRef.current && !methodDropdownRef.current.contains(e.target as Node)) {
        setIsMethodDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
            {currentLanguage === 'en' ? 'Track transaction history, ticket payments' : 'Theo dõi lịch sử giao dịch, thanh toán vé'}
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-transparent md:bg-white/70 md:backdrop-blur-md md:dark:bg-slate-900/70 rounded-3xl border-0 md:border md:border-white/80 md:dark:border-slate-800 p-0 md:p-5 shadow-none md:shadow-md mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row gap-2.5 md:gap-4">
          {/* Search input */}
          <div className="w-full md:flex-1 relative">
            <Search className="absolute left-3.5 md:left-4 top-1/2 transform -translate-y-1/2 w-4 md:w-4.5 h-4 md:h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder={currentLanguage === 'en' ? 'Search by bill ID...' : 'Tìm kiếm theo mã hóa đơn...'}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 md:pl-11 pr-3 md:pr-4 py-2.5 md:py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 rounded-xl md:rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-800 dark:text-white font-medium md:font-semibold placeholder-slate-400 text-xs md:text-sm shadow-sm transition-all duration-300"
            />
          </div>

          {/* Sub-row for filters on mobile: placed side by side in 1 row */}
          <div className="grid grid-cols-2 md:flex gap-2 md:gap-4 w-full md:w-auto">
            {/* Custom Status filter dropdown */}
            <div className="relative min-w-0 md:min-w-[170px]" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsStatusDropdownOpen(!isStatusDropdownOpen)
                  setIsMethodDropdownOpen(false)
                }}
                className={`w-full flex items-center justify-between px-2.5 sm:px-3 md:px-4 py-2.5 md:py-3 bg-white/60 dark:bg-slate-800/80 border ${
                  isStatusDropdownOpen
                    ? 'border-orange-500 ring-2 ring-orange-500/20'
                    : 'border-slate-200/80 dark:border-slate-700'
                } rounded-xl md:rounded-2xl text-slate-800 dark:text-slate-100 font-semibold text-xs md:text-sm shadow-sm transition-all duration-200 select-none`}
              >
                <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                  <Filter className="w-3.5 md:w-4 h-3.5 md:h-4 text-orange-500 shrink-0" />
                  <span className="truncate">
                    {statusFilter === 'PENDING'
                      ? (currentLanguage === 'en' ? 'Pending' : 'Chờ TT')
                      : statusFilter === 'PAID'
                      ? (currentLanguage === 'en' ? 'Paid' : 'Đã TT')
                      : statusFilter === 'CANCELED'
                      ? (currentLanguage === 'en' ? 'Canceled' : 'Đã hủy')
                      : (currentLanguage === 'en' ? 'All Status' : 'Tất cả trạng thái')}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180 text-orange-500' : ''}`} />
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-full min-w-[170px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl md:rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/50 py-1.5 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                  {[
                    { value: '', label: currentLanguage === 'en' ? 'All Statuses' : 'Tất cả trạng thái' },
                    { value: 'PENDING', label: currentLanguage === 'en' ? 'Pending Payment' : 'Chờ thanh toán' },
                    { value: 'PAID', label: currentLanguage === 'en' ? 'Paid' : 'Đã thanh toán' },
                    { value: 'CANCELED', label: currentLanguage === 'en' ? 'Canceled' : 'Đã hủy' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        handleStatusChange(option.value)
                        setIsStatusDropdownOpen(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-xs md:text-sm flex items-center justify-between font-medium transition-colors ${
                        statusFilter === option.value
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <span className="whitespace-nowrap">{option.label}</span>
                      {statusFilter === option.value && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Method filter dropdown */}
            <div className="relative min-w-0 md:min-w-[170px]" ref={methodDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsMethodDropdownOpen(!isMethodDropdownOpen)
                  setIsStatusDropdownOpen(false)
                }}
                className={`w-full flex items-center justify-between px-2.5 sm:px-3 md:px-4 py-2.5 md:py-3 bg-white/60 dark:bg-slate-800/80 border ${
                  isMethodDropdownOpen
                    ? 'border-orange-500 ring-2 ring-orange-500/20'
                    : 'border-slate-200/80 dark:border-slate-700'
                } rounded-xl md:rounded-2xl text-slate-800 dark:text-slate-100 font-semibold text-xs md:text-sm shadow-sm transition-all duration-200 select-none`}
              >
                <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                  <CreditCard className="w-3.5 md:w-4 h-3.5 md:h-4 text-orange-500 shrink-0" />
                  <span className="truncate">
                    {methodFilter === 'WALLET'
                      ? (currentLanguage === 'en' ? 'E-wallet' : 'Ví điện tử')
                      : methodFilter === 'FREE'
                      ? (currentLanguage === 'en' ? 'Free' : 'Miễn phí')
                      : (currentLanguage === 'en' ? 'All Methods' : 'Tất cả phương thức')}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isMethodDropdownOpen ? 'rotate-180 text-orange-500' : ''}`} />
              </button>

              {isMethodDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-full min-w-[170px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl md:rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/50 py-1.5 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                  {[
                    { value: '', label: currentLanguage === 'en' ? 'All Methods' : 'Tất cả phương thức' },
                    { value: 'WALLET', label: currentLanguage === 'en' ? 'E-wallet' : 'Ví điện tử' },
                    { value: 'FREE', label: currentLanguage === 'en' ? 'Free' : 'Miễn phí' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        handleMethodChange(option.value)
                        setIsMethodDropdownOpen(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-xs md:text-sm flex items-center justify-between font-medium transition-colors ${
                        methodFilter === option.value
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <span className="whitespace-nowrap">{option.label}</span>
                      {methodFilter === option.value && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results count: displayed below search & filters row */}
        {!loading && (
          <div className="mt-2.5 md:mt-3.5 text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider pl-1">
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

      {/* Nếu không loading, không lỗi, và có hóa đơn -> render bảng (Desktop) & Flat List (Mobile) */}
      {!loading && !error && bills.length > 0 && (
        <>
          {/* Mobile View: Nền phẳng liền mạch, không viền hộp lồng nhau, border-b 1px rgba(255,255,255,0.08), hover/active mượt */}
          <div className="block md:hidden bg-transparent divide-y divide-slate-200/40 dark:divide-white/[0.08]">
            {bills.map((bill, index) => {
              const isLast = index === bills.length - 1;
              return (
                <div
                  key={bill.id}
                  className={`py-4 px-1.5 transition-colors duration-200 hover:bg-black/5 dark:hover:bg-white/[0.04] active:bg-black/10 dark:active:bg-white/[0.07] ${
                    isLast ? 'border-b-0' : ''
                  }`}
                >
                  {/* Hàng 1: Mã hóa đơn + Phương thức thanh toán (trái) và Trạng thái không xuống hàng (phải) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm font-black text-slate-900 dark:text-white shrink-0">
                        #{bill.id}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                        bill.paymentMethod === 'MOMO' ? 'bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 border border-pink-200/60 dark:border-pink-900/40' :
                        bill.paymentMethod === 'WALLET' ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border border-orange-200/60 dark:border-orange-900/40' :
                        bill.paymentMethod === 'FREE' ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-900/40' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}>
                        {bill.paymentMethod === 'WALLET' ? (currentLanguage === 'en' ? 'E-Wallet' : 'Ví điện tử') : bill.paymentMethod === 'FREE' ? (currentLanguage === 'en' ? 'Free' : 'Miễn phí') : (bill.paymentMethod || 'N/A')}
                      </span>
                    </div>

                    {/* Badge trạng thái: whitespace-nowrap để không bao giờ bị đứt gãy chữ */}
                    <div className="shrink-0">
                      {bill.status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                          <span>{currentLanguage === 'en' ? 'Paid' : 'Đã hoàn thành'}</span>
                        </span>
                      ) : bill.status === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />
                          <span>{currentLanguage === 'en' ? 'Pending' : 'Chờ thanh toán'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/40">
                          <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse shrink-0" />
                          <span>{currentLanguage === 'en' ? 'Canceled' : 'Đã hủy'}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hàng 2: Ngày tạo (trái) và Số tiền nổi bật (phải) */}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {formatVietnamDateTime(bill.createdAt, 'dd/MM/yyyy HH:mm')}
                    </span>
                    <span className="text-sm font-black text-slate-900 dark:text-white shrink-0">
                      {bill.totalAmount.toLocaleString('vi-VN')} {currentLanguage === 'en' ? 'VND' : 'đ'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop View: Table đầy đủ */}
          <div className="hidden md:block bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 overflow-hidden shadow-md animate-fade-in-up">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/60 dark:divide-slate-800">
                {/* Header của bảng */}
                <thead className="bg-slate-50/50 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Bill ID' : 'Mã hóa đơn'}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Created Date' : 'Ngày tạo'}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Amount' : 'Số tiền'}
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {currentLanguage === 'en' ? 'Method' : 'Phương thức'}
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
                          'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700'
                        }`}>
                          {bill.paymentMethod === 'WALLET' ? (currentLanguage === 'en' ? 'E-Wallet' : 'Ví điện tử') : bill.paymentMethod === 'FREE' ? (currentLanguage === 'en' ? 'Free' : 'Miễn phí') : (bill.paymentMethod || 'N/A')}
                        </span>
                      </td>

                      {/* Cột trạng thái */}
                      <td className="px-6 py-4 text-sm text-center">
                        {bill.status === 'PAID' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/30 shadow-sm shadow-emerald-500/5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {currentLanguage === 'en' ? 'Paid' : 'Đã thanh toán'}
                          </span>
                        ) : bill.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/30 shadow-sm shadow-amber-500/5">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            {currentLanguage === 'en' ? 'Pending Payment' : 'Chờ thanh toán'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/30 shadow-sm shadow-rose-500/5">
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
        <>
          {/* Mobile Skeleton */}
          <div className="block md:hidden bg-transparent divide-y divide-slate-200/40 dark:divide-white/[0.08] animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="py-4 px-1.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28"></div>
                  <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-24"></div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-36"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20"></div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Skeleton */}
          <div className="hidden md:block bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 overflow-hidden shadow-md">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50/50 dark:bg-slate-950/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {currentLanguage === 'en' ? 'Bill ID' : 'Mã hóa đơn'}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {currentLanguage === 'en' ? 'Created Date' : 'Ngày tạo'}
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {currentLanguage === 'en' ? 'Amount' : 'Số tiền'}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {currentLanguage === 'en' ? 'Status' : 'Trạng thái'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <BillSkeleton />
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !error && bills.length === 0 && (
        <div className="bg-white/70 backdrop-blur-md dark:bg-slate-900/70 rounded-3xl border border-white/80 dark:border-slate-800 p-16 text-center shadow-md animate-fade-in-up">
          <div className="p-4 bg-orange-50 dark:bg-orange-950/20 text-orange-500 dark:text-orange-400 rounded-full w-fit mx-auto mb-4 border border-orange-100/50 dark:border-orange-900/30">
            <FileText className="w-12 h-12 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            {searchQuery || statusFilter || methodFilter
              ? (currentLanguage === 'en' ? 'No matching bills found' : 'Không tìm thấy hóa đơn phù hợp')
              : (currentLanguage === 'en' ? "You don't have any bills yet" : 'Bạn chưa có hóa đơn nào')}
          </h3>
          <p className="text-sm text-slate-400 dark:text-slate-400 mt-2 max-w-sm mx-auto font-medium">
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

