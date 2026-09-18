import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { 
  ExternalLink, 
  ImageIcon, 
  Search, 
  FileClock, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MapPin, 
  User, 
  Tag, 
  Calendar, 
  Wallet, 
  Filter, 
  RefreshCw, 
  X,
  FileText,
  AlertCircle
} from 'lucide-react'
import { emitWalletRefresh } from '../hooks/useWallet'
import { formatVietnamDateTime } from '../utils/dateFormat'

/**
 * =========================
 * TYPE ĐỊNH NGHĨA DỮ LIỆU
 * =========================
 */
type ReportSummary = {
  report_id: number
  ticket_id: number
  student_name: string
  category_ticket_name?: string
  report_status: string
  created_at: string
  title?: string
  description?: string
}

type ReportDetail = {
  report_id: number
  ticket_id: number
  title?: string
  description?: string
  image_url?: string | null
  created_at?: string
  report_status?: string
  student_id?: number
  student_name?: string
  ticket_status?: string
  category_ticket_id?: number
  category_ticket_name?: string
  price?: number

  // Seat / Area / Venue details
  seat_id?: number
  seat_code?: string
  row_no?: string | number
  col_no?: number

  area_id?: number
  area_name?: string
  floor?: number

  venue_id?: number
  venue_name?: string
  location?: string

  // Processor info
  processed_by?: string
  processed_at?: string
  staff_note?: string
}

export default function ReportRequests() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [selected, setSelected] = useState<ReportDetail | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [staffNote, setStaffNote] = useState('')
  const [activeTab, setActiveTab] = useState<'PENDING' | 'PROCESSED'>('PENDING')

  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'PROCESSED' | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState('')

  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, processed: 0 })

  // State trigger to allow manual refresh
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const fetchReportsData = async (pageNum: number = currentPage, query: string = searchQuery, tab: 'PENDING' | 'PROCESSED' = activeTab) => {
    setLoading(true)
    setError(null)

    try {
      const statusParam = tab === 'PENDING' ? 'PENDING' : ''

      const params = new URLSearchParams()
      if (statusParam) params.append('status', statusParam)
      params.append('page', pageNum.toString())
      params.append('pageSize', '10')
      if (query) params.append('search', query)

      const res = await fetch(`/api/staff/reports?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
      })

      const responseText = await res.text()
      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        throw new Error('Server trả về định dạng không hợp lệ. Vui lòng kiểm tra URL backend.')
      }

      if (data.status === 'fail' || !res.ok) {
        throw new Error(data.message || 'Không thể tải danh sách yêu cầu')
      }

      const list = Array.isArray(data)
        ? data
        : data && Array.isArray(data.data)
          ? data.data
          : []

      if (data.totalItems !== undefined) {
        setTotalItems(data.totalItems)
        setTotalPages(data.totalPages || 1)
      }

      if (data.counts) {
        setCounts({
          pending: data.counts.pending || 0,
          approved: data.counts.approved || 0,
          rejected: data.counts.rejected || 0,
          processed: data.counts.processed || 0,
        })
      }

      const mapped: ReportSummary[] = list.map((r: any) => ({
        report_id: r.report_id ?? 0,
        ticket_id: r.ticket_id ?? 0,
        student_name: r.student_name ?? 'Unknown',
        category_ticket_name: r.category_ticket_name,
        report_status: r.report_status ?? 'PENDING',
        created_at: r.created_at ?? new Date().toISOString(),
        title: r.title,
        description: r.description,
      }))

      setReports(mapped)

    } catch (err: any) {
      console.error('Fetch reports error', err)
      setError(err.message || 'Lỗi khi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReportsData(currentPage, searchQuery, activeTab)
  }, [currentPage, searchQuery, activeTab, refreshTrigger])

  const openDetail = async (reportId: number) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/staff/reports/${reportId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
      })

      const responseText = await res.text()
      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        throw new Error('Server trả về định dạng không hợp lệ. Vui lòng kiểm tra URL backend.')
      }

      if (data.status === 'fail' || !res.ok) {
        throw new Error(data.message || 'Không thể tải chi tiết')
      }

      const detail = data.data ?? data
      setSelected(detail)
    } catch (err: any) {
      console.error('Open detail error', err)
      setError(err.message || 'Không thể tải chi tiết')
    } finally {
      setLoading(false)
    }
  }

  const closeDetail = () => {
    setSelected(null)
    setStaffNote('')
  }

  const processReport = async (reportId: number, action: 'APPROVE' | 'REJECT') => {
    setIsProcessing(true)

    try {
      const endpoint = action === 'APPROVE' ? '/api/staff/reports/approve' : '/api/staff/reports/reject'

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportId, staffNote }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data) {
        throw new Error(data?.message || 'Xử lý thất bại')
      }

      if (data.status === 'fail') {
        throw new Error(data.message || 'Xử lý thất bại')
      }

      const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      const successMessage = action === 'APPROVE'
        ? 'Đã duyệt báo cáo và hoàn tiền thành công'
        : 'Đã từ chối báo cáo thành công'

      setReports((prev) =>
        prev.map(r => r.report_id === reportId ? { ...r, report_status: newStatus } : r)
      )

      showToast('success', successMessage)

      if (action === 'APPROVE') {
        emitWalletRefresh()
      }

      fetchReportsData(currentPage, searchQuery, activeTab)
      setSelected(null)
      setStaffNote('')

    } catch (err: any) {
      console.error('Process report error', err)
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally {
      setIsProcessing(false)
    }
  }

  const filteredReports = useMemo(() => {
    let list = reports
    if (activeTab === 'PENDING') {
      list = list.filter(r => (r.report_status ?? '').toUpperCase() === 'PENDING')
    } else {
      list = list.filter(r => {
        const s = (r.report_status ?? '').toUpperCase()
        return s === 'APPROVED' || s === 'REJECTED'
      })
    }

    if (statusFilter) {
      list = list.filter(r => (r.report_status ?? '').toUpperCase() === statusFilter.toUpperCase())
    }

    if (searchQuery && searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      list = list.filter(r =>
        (r.student_name?.toLowerCase().includes(query) ?? false) ||
        (r.ticket_id?.toString().includes(query) ?? false) ||
        (r.title?.toLowerCase().includes(query) ?? false)
      )
    }

    return list
  }, [reports, activeTab, statusFilter, searchQuery, timeFilter])

  const displayList = filteredReports

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  const forceRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
    showToast('info', 'Đã cập nhật danh sách')
  }

  return (
    <div className="w-full min-h-screen p-4 md:p-6 text-slate-900 dark:text-slate-100 bg-transparent">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight sm:text-4xl">Quản lý Báo cáo & Hoàn tiền</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl font-medium">
            Trung tâm kiểm soát và xử lý phản ánh ghế ngồi lỗi từ sinh viên. Hỗ trợ duyệt tự động hoàn tiền vé vào ví.
          </p>
        </div>
        <button
          onClick={forceRefresh}
          className="self-start md:self-auto inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400 border border-slate-200 dark:border-slate-800 hover:border-orange-500 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-300 active:scale-95"
        >
          <RefreshCw className="w-4 h-4 text-orange-500" /> Làm mới danh sách
        </button>
      </div>

      {/* Dashboard Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Pending Card */}
        <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-amber-300/50 dark:hover:border-amber-700/50 group">
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-200/40 dark:border-amber-800/40 group-hover:scale-110 transition-transform">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Chờ xử lý</p>
            <p className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-slate-50 mt-0.5 tracking-tight">{counts.pending}</p>
          </div>
        </div>

        {/* Approved Card */}
        <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-300/50 dark:hover:border-emerald-700/50 group">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200/40 dark:border-emerald-800/40 group-hover:scale-110 transition-transform">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Đã duyệt</p>
            <p className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-slate-50 mt-0.5 tracking-tight">{counts.approved}</p>
          </div>
        </div>

        {/* Rejected Card */}
        <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-rose-300/50 dark:hover:border-rose-700/50 group">
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200/40 dark:border-rose-800/40 group-hover:scale-110 transition-transform">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Đã từ chối</p>
            <p className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-slate-50 mt-0.5 tracking-tight">{counts.rejected}</p>
          </div>
        </div>

        {/* Total Card */}
        <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-blue-300/50 dark:hover:border-blue-700/50 group">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200/40 dark:border-blue-800/40 group-hover:scale-110 transition-transform">
            <FileClock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Tổng cộng</p>
            <p className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-slate-50 mt-0.5 tracking-tight">{counts.pending + counts.processed}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        {/* Navigation Tabs - Modern Floating Segmented Control */}
        <div className="flex bg-slate-200/50 dark:bg-slate-900 backdrop-blur-sm p-1 rounded-2xl gap-1.5 w-fit mb-6 border border-slate-200/40 dark:border-slate-800 shadow-inner">
          <button
            onClick={() => {
              setActiveTab('PENDING')
              setCurrentPage(1)
              setSearchParams({ page: '1' })
            }}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'PENDING'
                ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-md font-extrabold scale-[1.02] border border-slate-100 dark:border-slate-700'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/40'
            }`}
          >
            Chờ xử lý
            {counts.pending > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded-full animate-pulse">
                {counts.pending}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('PROCESSED')
              setCurrentPage(1)
              setSearchParams({ page: '1' })
            }}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'PROCESSED'
                ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-md font-extrabold scale-[1.02] border border-slate-100 dark:border-slate-700'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/40'
            }`}
          >
            Lịch sử xử lý
            {counts.processed > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full">
                {counts.processed}
              </span>
            )}
          </button>
        </div>

        {/* Filter Bar Card */}
        <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm tiêu đề, mã vé, người gửi..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                  setSearchParams({ page: '1' })
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-400 dark:text-slate-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Select */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'PENDING' | 'PROCESSED' | '')
                  setCurrentPage(1)
                  setSearchParams({ page: '1' })
                }}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all appearance-none cursor-pointer"
              >
                <option value="" className="dark:bg-slate-800">Tất cả trạng thái</option>
                <option value="PENDING" className="dark:bg-slate-800">Chờ xử lý (PENDING)</option>
                <option value="APPROVED" className="dark:bg-slate-800">Đã duyệt (APPROVED)</option>
                <option value="REJECTED" className="dark:bg-slate-800">Từ chối (REJECTED)</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Filter className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Time Filter Select */}
            <div className="relative">
              <select
                value={timeFilter}
                onChange={(e) => {
                  setTimeFilter(e.target.value)
                  setCurrentPage(1)
                  setSearchParams({ page: '1' })
                }}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all appearance-none cursor-pointer"
              >
                <option value="" className="dark:bg-slate-800">Tất cả thời gian</option>
                <option value="today" className="dark:bg-slate-800">Hôm nay</option>
                <option value="week" className="dark:bg-slate-800">Tuần này</option>
                <option value="month" className="dark:bg-slate-800">Tháng này</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-16 text-center shadow-sm">
            <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Đang tải dữ liệu yêu cầu...</p>
          </div>
        )}

        {/* Error Block */}
        {error && (
          <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-12 text-center shadow-sm">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-full w-fit mx-auto mb-4 border border-rose-200/40 dark:border-rose-900/40">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Không thể tải dữ liệu</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="mt-5 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-semibold active:scale-95 transition-all shadow-sm"
            >
              Thử tải lại
            </button>
          </div>
        )}

        {/* List Data View */}
        {!loading && !error && (
          <div>
            {displayList.length > 0 && (
              <div className="mb-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Tìm thấy <span className="text-orange-600 dark:text-orange-400 font-bold">{displayList.length}</span> trên{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">{totalItems}</span> báo cáo
              </div>
            )}

            {/* Empty State */}
            {displayList.length === 0 ? (
              <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-16 text-center shadow-sm">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 rounded-full w-fit mx-auto mb-4">
                  <FileClock className="w-12 h-12" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Không tìm thấy yêu cầu</h3>
                <p className="text-sm text-slate-400 dark:text-slate-400 mt-2 max-w-sm mx-auto">
                  {activeTab === 'PENDING'
                    ? 'Tuyệt vời! Hiện không có phản ánh báo cáo ghế hỏng nào đang chờ xử lý.'
                    : 'Chưa có lịch sử xử lý báo cáo nào được ghi nhận.'}
                </p>
              </div>
            ) : (
              /* Table Layout */
              <div className="bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-150 dark:border-slate-800 text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
                        <th className="px-6 py-4">ID Báo cáo</th>
                        <th className="px-6 py-4">Mã Vé (Ticket ID)</th>
                        <th className="px-6 py-4">Sinh viên</th>
                        <th className="px-6 py-4">Loại vé</th>
                        <th className="px-6 py-4">Trạng thái</th>
                        <th className="px-6 py-4">Thời gian gửi</th>
                        <th className="px-6 py-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm text-slate-700 dark:text-slate-200">
                      {displayList.map((r) => (
                        <tr key={r.report_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group">
                          {/* Report ID */}
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                            #{r.report_id}
                          </td>
                          {/* Ticket ID */}
                          <td className="px-6 py-4 font-medium text-slate-500 dark:text-slate-400">
                            #{r.ticket_id}
                          </td>
                          {/* Student Name */}
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-100">
                            {r.student_name}
                          </td>
                          {/* Category Name */}
                          <td className="px-6 py-4 font-medium text-slate-500 dark:text-slate-400">
                            {r.category_ticket_name ? (
                              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs rounded-md font-medium border border-slate-200/50 dark:border-slate-700">
                                {r.category_ticket_name}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          {/* Status Badge */}
                          <td className="px-6 py-4">
                            {r.report_status === 'PENDING' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                                Chờ xử lý
                              </span>
                            ) : r.report_status === 'APPROVED' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Đã duyệt
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
                                <XCircle className="w-3.5 h-3.5" />
                                Đã từ chối
                              </span>
                            )}
                          </td>
                          {/* Created Time */}
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {formatVietnamDateTime(r.created_at, 'dd/MM/yyyy HH:mm')}
                          </td>
                          {/* Actions */}
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openDetail(r.report_id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-white bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-600 dark:hover:bg-orange-600 border border-orange-200/80 dark:border-orange-800/50 rounded-xl transition-all shadow-sm active:scale-95"
                            >
                              Xem chi tiết
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-white/80 dark:bg-slate-900 backdrop-blur-md rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-sm">
                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Trang <span className="font-bold text-slate-800 dark:text-slate-100">{currentPage}</span> /{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-100">{totalPages}</span> ({totalItems} yêu cầu)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Trước
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = 1
                    if (totalPages > 5) {
                      if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                    } else {
                      pageNum = i + 1
                    }
                    return pageNum >= 1 && pageNum <= totalPages ? (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-9 h-9 rounded-xl text-xs font-bold transition-all border ${
                          currentPage === pageNum
                            ? 'bg-orange-600 text-white border-orange-600 shadow-sm shadow-orange-500/20'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ) : null
                  })}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================
          HIGH-FIDELITY DETAILS MODAL
          ====================== */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200/70 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Chi tiết phản ánh ghế hỏng #{selected.report_id}</h2>
                <p className="text-xs text-slate-400 dark:text-slate-400 font-semibold uppercase mt-0.5 tracking-wider">
                  Mã giao dịch vé: <span className="text-slate-600 dark:text-slate-200 font-bold">#{selected.ticket_id}</span>
                </p>
              </div>
              <button 
                onClick={closeDetail} 
                className="p-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              
              {/* Processed Operator Banner */}
              {selected.report_status !== 'PENDING' && (
                <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 rounded-xl p-4 flex gap-3.5 items-start">
                  <div className={`p-2 rounded-lg text-white mt-0.5 ${
                    selected.report_status === 'APPROVED' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}>
                    {selected.report_status === 'APPROVED' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Lịch sử xử lý</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <p>Nhân viên xử lý: <span className="font-semibold text-slate-800 dark:text-slate-200">{selected.processed_by ?? 'Nhân viên hệ thống'}</span></p>
                      <p>Ngày xử lý: <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selected.processed_at ? formatVietnamDateTime(selected.processed_at, 'dd/MM/yyyy HH:mm') : '---'}
                      </span></p>
                    </div>
                    {selected.staff_note && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200/50 dark:border-slate-700">
                        <p className="text-xs text-slate-400 dark:text-slate-400 font-semibold mb-1">Ghi chú nhân viên:</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200 italic bg-white dark:bg-slate-850 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                          "{selected.staff_note}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Grid ticket specs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* User Card */}
                <div className="bg-slate-50/60 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 rounded-xl p-3.5 flex gap-3 items-center">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
                    <User className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-400">Sinh viên gửi</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{selected.student_name}</p>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">ID: {selected.student_id ?? '-'}</p>
                  </div>
                </div>

                {/* Seat Code Card */}
                <div className="bg-slate-50/60 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 rounded-xl p-3.5 flex gap-3 items-center">
                  <div className="p-2 bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-lg">
                    <Tag className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-400">Mã ghế phản ánh</p>
                    <p className="text-sm font-bold text-purple-700 dark:text-purple-400 uppercase">
                      {selected.seat_code ? `Ghế ${selected.seat_code}` : (
                        selected.row_no != null && selected.col_no != null 
                          ? `Hàng ${selected.row_no} - Cột ${selected.col_no}` 
                          : 'Chưa xác định'
                      )}
                    </p>
                  </div>
                </div>

                {/* Location / Area Card */}
                <div className="bg-slate-50/60 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 rounded-xl p-3.5 flex gap-3 items-start sm:col-span-2">
                  <div className="p-2 bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 rounded-lg mt-0.5">
                    <MapPin className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-400">Địa điểm & Sảnh sự kiện</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                      {selected.venue_name ?? 'Cơ sở FPT'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                      {selected.area_name && `${selected.area_name}`}
                      {selected.floor && ` - Lầu ${selected.floor}`}
                      {selected.location && ` (${selected.location})`}
                    </p>
                  </div>
                </div>

                {/* Refund & Price Card */}
                <div className="bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl p-3.5 flex gap-3 items-center sm:col-span-2">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <Wallet className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Giá trị hoàn trả dự kiến</p>
                      <p className="text-xs text-slate-400 dark:text-slate-400 font-medium">Hệ thống sẽ hoàn trực tiếp vào ví sau khi duyệt</p>
                    </div>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                      {selected.price != null
                        ? selected.price === 0
                          ? '0₫ (Miễn phí)'
                          : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0 }).format(selected.price)
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Report Description Section */}
              <div className="border-t border-b border-slate-100 dark:border-slate-800 py-4 space-y-3.5">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Tiêu đề sự cố</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">{selected.title ?? 'Chưa nhập tiêu đề'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Chi tiết mô tả lỗi</p>
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 mt-1 border border-slate-100 dark:border-slate-700/80">
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                      {selected.description ?? 'Không có phần mô tả.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Prove Image Section */}
              {selected.image_url && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <ImageIcon className="w-4 h-4" /> Hình ảnh minh chứng ghế hỏng
                  </p>
                  <div className="relative group overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <img
                      src={selected.image_url}
                      alt="Ảnh minh chứng ghế hỏng"
                      className="w-full max-h-80 object-contain mx-auto transition-transform duration-300 group-hover:scale-102"
                    />
                  </div>
                </div>
              )}

              {/* Staff Action Textarea & Buttons */}
              <div className="space-y-4">
                {selected.report_status === 'PENDING' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Phản hồi của Nhân viên xử lý</p>
                    <textarea
                      value={staffNote}
                      onChange={(e) => setStaffNote(e.target.value)}
                      placeholder="Nhập lý do duyệt/từ chối hoặc lời nhắn đến sinh viên (tùy chọn)..."
                      disabled={isProcessing}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-xl p-3 h-24 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none transition-all text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                ) : null}
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end items-center gap-3 bg-slate-50/60 dark:bg-slate-800/50">
              <button 
                onClick={closeDetail} 
                disabled={isProcessing}
                className="px-4.5 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 transition-all hover:text-slate-800 dark:hover:text-white disabled:opacity-50"
              >
                Đóng
              </button>

              {selected.report_status === 'PENDING' && (
                <>
                  <button
                    onClick={async () => {
                      if (!selected) return
                      const ok = window.confirm('Bạn có chắc chắn muốn TỪ CHỐI yêu cầu báo cáo này?')
                      if (!ok) return
                      await processReport(selected.report_id, 'REJECT')
                    }}
                    disabled={isProcessing}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Từ chối
                  </button>

                  <button
                    onClick={async () => {
                      if (!selected) return
                      const ok = window.confirm('Bạn có chắc chắn muốn DUYỆT yêu cầu và tiến hành HOÀN TIỀN vé?')
                      if (!ok) return
                      await processReport(selected.report_id, 'APPROVE')
                    }}
                    disabled={isProcessing}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {isProcessing ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Duyệt & Hoàn tiền
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

