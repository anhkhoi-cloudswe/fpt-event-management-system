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
 * TYPE Ã„ÂÃ¡Â»Å NH NGHÃ„Â¨A DÃ¡Â»Â® LIÃ¡Â»â€ U
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
        throw new Error('Server trÃ¡ÂºÂ£ vÃ¡Â»Â Ã„â€˜Ã¡Â»â€¹nh dÃ¡ÂºÂ¡ng khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra URL backend.')
      }

      if (data.status === 'fail' || !res.ok) {
        throw new Error(data.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch yÃƒÂªu cÃ¡ÂºÂ§u')
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
      setError(err.message || 'LÃ¡Â»â€”i khi tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u')
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
        throw new Error('Server trÃ¡ÂºÂ£ vÃ¡Â»Â Ã„â€˜Ã¡Â»â€¹nh dÃ¡ÂºÂ¡ng khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra URL backend.')
      }

      if (data.status === 'fail' || !res.ok) {
        throw new Error(data.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i chi tiÃ¡ÂºÂ¿t')
      }

      const detail = data.data ?? data
      setSelected(detail)
    } catch (err: any) {
      console.error('Open detail error', err)
      setError(err.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i chi tiÃ¡ÂºÂ¿t')
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
        throw new Error(data?.message || 'XÃ¡Â»Â­ lÃƒÂ½ thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i')
      }

      if (data.status === 'fail') {
        throw new Error(data.message || 'XÃ¡Â»Â­ lÃƒÂ½ thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i')
      }

      const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      const successMessage = action === 'APPROVE'
        ? 'Ã„ÂÃƒÂ£ duyÃ¡Â»â€¡t bÃƒÂ¡o cÃƒÂ¡o vÃƒÂ  hoÃƒÂ n tiÃ¡Â»Ân thÃƒÂ nh cÃƒÂ´ng'
        : 'Ã„ÂÃƒÂ£ tÃ¡Â»Â« chÃ¡Â»â€˜i bÃƒÂ¡o cÃƒÂ¡o thÃƒÂ nh cÃƒÂ´ng'

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
      showToast('error', err.message || 'CÃƒÂ³ lÃ¡Â»â€”i xÃ¡ÂºÂ£y ra')
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
    showToast('info', 'Ã„ÂÃƒÂ£ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t danh sÃƒÂ¡ch')
  }

  return (
    <div className="bg-slate-50/50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">QuÃ¡ÂºÂ£n lÃƒÂ½ BÃƒÂ¡o cÃƒÂ¡o & HoÃƒÂ n tiÃ¡Â»Ân</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1.5 max-w-2xl">
            Trung tÃƒÂ¢m kiÃ¡Â»Æ’m soÃƒÂ¡t vÃƒÂ  xÃ¡Â»Â­ lÃƒÂ½ phÃ¡ÂºÂ£n ÃƒÂ¡nh ghÃ¡ÂºÂ¿ ngÃ¡Â»â€œi lÃ¡Â»â€”i tÃ¡Â»Â« sinh viÃƒÂªn. HÃ¡Â»â€” trÃ¡Â»Â£ duyÃ¡Â»â€¡t tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng hoÃƒÂ n tiÃ¡Â»Ân vÃƒÂ© vÃƒÂ o vÃƒÂ­.
          </p>
        </div>
        <button
          onClick={forceRefresh}
          className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-orange-500 rounded-xl text-sm font-semibold shadow-sm hover:shadow transition-all active:scale-95"
        >
          <RefreshCw className="w-4 h-4" /> LÃƒÂ m mÃ¡Â»â€ºi danh sÃƒÂ¡ch
        </button>
      </div>

      {/* Dashboard Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Pending Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-amber-200/50 group">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">ChÃ¡Â»Â xÃ¡Â»Â­ lÃƒÂ½</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{counts.pending}</p>
          </div>
        </div>

        {/* Approved Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-200/50 group">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Ã„ÂÃƒÂ£ duyÃ¡Â»â€¡t</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{counts.approved}</p>
          </div>
        </div>

        {/* Rejected Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-rose-200/50 group">
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl group-hover:scale-110 transition-transform">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Ã„ÂÃƒÂ£ tÃ¡Â»Â« chÃ¡Â»â€˜i</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{counts.rejected}</p>
          </div>
        </div>

        {/* Total Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm transition-all hover:shadow-md hover:border-blue-200/50 group">
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
            <FileClock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">TÃ¡Â»â€¢ng cÃ¡Â»â„¢ng</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{counts.pending + counts.processed}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex gap-6">
            <button
              onClick={() => {
                setActiveTab('PENDING')
                setCurrentPage(1)
                setSearchParams({ page: '1' })
              }}
              className={`pb-4 px-1 text-sm font-bold tracking-wide transition-all relative inline-flex items-center gap-2 ${
                activeTab === 'PENDING'
                  ? 'text-blue-600 font-extrabold'
                  : 'text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white'
              }`}
            >
              ChÃ¡Â»Â xÃ¡Â»Â­ lÃƒÂ½
              {counts.pending > 0 && (
                <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full animate-pulse">
                  {counts.pending}
                </span>
              )}
              {activeTab === 'PENDING' && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-600 rounded-full" />
              )}
            </button>

            <button
              onClick={() => {
                setActiveTab('PROCESSED')
                setCurrentPage(1)
                setSearchParams({ page: '1' })
              }}
              className={`pb-4 px-1 text-sm font-bold tracking-wide transition-all relative inline-flex items-center gap-2 ${
                activeTab === 'PROCESSED'
                  ? 'text-blue-600 font-extrabold'
                  : 'text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white'
              }`}
            >
              LÃ¡Â»â€¹ch sÃ¡Â»Â­ xÃ¡Â»Â­ lÃƒÂ½
              {counts.processed > 0 && (
                <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-full">
                  {counts.processed}
                </span>
              )}
              {activeTab === 'PROCESSED' && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-600 rounded-full" />
              )}
            </button>
          </div>
        </div>

        {/* Filter Bar Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="TÃƒÂ¬m tiÃƒÂªu Ã„â€˜Ã¡Â»Â, mÃƒÂ£ vÃƒÂ©, ngÃ†Â°Ã¡Â»Âi gÃ¡Â»Â­i..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                  setSearchParams({ page: '1' })
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-300 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-1 hover:bg-slate-200 rounded-full text-slate-400"
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
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm text-slate-700 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
              >
                <option value="">TÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ trÃ¡ÂºÂ¡ng thÃƒÂ¡i</option>
                <option value="PENDING">ChÃ¡Â»Â xÃ¡Â»Â­ lÃƒÂ½ (PENDING)</option>
                <option value="APPROVED">Ã„ÂÃƒÂ£ duyÃ¡Â»â€¡t (APPROVED)</option>
                <option value="REJECTED">TÃ¡Â»Â« chÃ¡Â»â€˜i (REJECTED)</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
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
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl text-sm text-slate-700 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none cursor-pointer"
              >
                <option value="">TÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ thÃ¡Â»Âi gian</option>
                <option value="today">HÃƒÂ´m nay</option>
                <option value="week">TuÃ¡ÂºÂ§n nÃƒÂ y</option>
                <option value="month">ThÃƒÂ¡ng nÃƒÂ y</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-16 text-center shadow-sm">
            <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-300">Ã„Âang tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u yÃƒÂªu cÃ¡ÂºÂ§u...</p>
          </div>
        )}

        {/* Error Block */}
        {error && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12 text-center shadow-sm">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-fit mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u</h3>
            <p className="text-sm text-slate-500 dark:text-slate-300 mt-2 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              ThÃ¡Â»Â­ tÃ¡ÂºÂ£i lÃ¡ÂºÂ¡i
            </button>
          </div>
        )}

        {/* List Data View */}
        {!loading && !error && (
          <div>
            {displayList.length > 0 && (
              <div className="mb-4 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                TÃƒÂ¬m thÃ¡ÂºÂ¥y <span className="text-blue-600 font-bold">{displayList.length}</span> trÃƒÂªn{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">{totalItems}</span> bÃƒÂ¡o cÃƒÂ¡o
              </div>
            )}

            {/* Empty State */}
            {displayList.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-16 text-center shadow-sm">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-500 rounded-full w-fit mx-auto mb-4">
                  <FileClock className="w-12 h-12" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y yÃƒÂªu cÃ¡ÂºÂ§u</h3>
                <p className="text-sm text-slate-400 dark:text-slate-400 mt-2 max-w-sm mx-auto">
                  {activeTab === 'PENDING'
                    ? 'TuyÃ¡Â»â€¡t vÃ¡Â»Âi! HiÃ¡Â»â€¡n khÃƒÂ´ng cÃƒÂ³ phÃ¡ÂºÂ£n ÃƒÂ¡nh bÃƒÂ¡o cÃƒÂ¡o ghÃ¡ÂºÂ¿ hÃ¡Â»Âng nÃƒÂ o Ã„â€˜ang chÃ¡Â»Â xÃ¡Â»Â­ lÃƒÂ½.'
                    : 'ChÃ†Â°a cÃƒÂ³ lÃ¡Â»â€¹ch sÃ¡Â»Â­ xÃ¡Â»Â­ lÃƒÂ½ bÃƒÂ¡o cÃƒÂ¡o nÃƒÂ o Ã„â€˜Ã†Â°Ã¡Â»Â£c ghi nhÃ¡ÂºÂ­n.'}
                </p>
              </div>
            ) : (
              /* Table Layout */
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50/70 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">
                        <th className="px-6 py-4">ID BÃƒÂ¡o cÃƒÂ¡o</th>
                        <th className="px-6 py-4">MÃƒÂ£ VÃƒÂ© (Ticket ID)</th>
                        <th className="px-6 py-4">Sinh viÃƒÂªn</th>
                        <th className="px-6 py-4">LoÃ¡ÂºÂ¡i vÃƒÂ©</th>
                        <th className="px-6 py-4">TrÃ¡ÂºÂ¡ng thÃƒÂ¡i</th>
                        <th className="px-6 py-4">ThÃ¡Â»Âi gian gÃ¡Â»Â­i</th>
                        <th className="px-6 py-4 text-right">Thao tÃƒÂ¡c</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-200">
                      {displayList.map((r) => (
                        <tr key={r.report_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/60 transition-colors group">
                          {/* Report ID */}
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            #{r.report_id}
                          </td>
                          {/* Ticket ID */}
                          <td className="px-6 py-4 font-medium text-slate-500 dark:text-slate-300">
                            #{r.ticket_id}
                          </td>
                          {/* Student Name */}
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-100">
                            {r.student_name}
                          </td>
                          {/* Category Name */}
                          <td className="px-6 py-4 font-medium text-slate-500 dark:text-slate-300">
                            {r.category_ticket_name ? (
                              <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 text-xs rounded font-medium">
                                {r.category_ticket_name}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          {/* Status Badge */}
                          <td className="px-6 py-4">
                            {r.report_status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                                ChÃ¡Â»Â xÃ¡Â»Â­ lÃƒÂ½
                              </span>
                            ) : r.report_status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Ã„ÂÃƒÂ£ duyÃ¡Â»â€¡t
                              </span>
                            ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800/60">
                                <XCircle className="w-3.5 h-3.5" />
                                Ã„ÂÃƒÂ£ tÃ¡Â»Â« chÃ¡Â»â€˜i
                              </span>
                            )}
                          </td>
                          {/* Created Time */}
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-300">
                            {formatVietnamDateTime(r.created_at, 'dd/MM/yyyy HH:mm')}
                          </td>
                          {/* Actions */}
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openDetail(r.report_id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-300 hover:text-white bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-600 dark:hover:bg-blue-600 border border-blue-100 dark:border-blue-800/70 rounded-xl transition-all shadow-sm active:scale-95"
                            >
                              Xem chi tiÃ¡ÂºÂ¿t
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
                <div className="text-sm text-slate-500 dark:text-slate-300 font-medium">
                  Trang <span className="font-bold text-slate-800 dark:text-slate-100">{currentPage}</span> /{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-100">{totalPages}</span> ({totalItems} yÃƒÂªu cÃ¡ÂºÂ§u)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    TrÃ†Â°Ã¡Â»â€ºc
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
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ) : null
                  })}

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800/80 animate-in fade-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Chi tiÃ¡ÂºÂ¿t phÃ¡ÂºÂ£n ÃƒÂ¡nh ghÃ¡ÂºÂ¿ hÃ¡Â»Âng #{selected.report_id}</h2>
                <p className="text-xs text-slate-400 dark:text-slate-300 font-semibold uppercase mt-0.5 tracking-wider">
                  MÃƒÂ£ giao dÃ¡Â»â€¹ch vÃƒÂ©: <span className="text-slate-600 dark:text-slate-200 font-bold">#{selected.ticket_id}</span>
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="p-1.5 hover:bg-slate-200/60 rounded-full text-slate-400 hover:text-slate-700 dark:text-slate-200 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">

              {/* Processed Operator Banner */}
              {selected.report_status !== 'PENDING' && (
                <div className="bg-slate-50/80 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl p-4 flex gap-3.5 items-start">
                  <div className={`p-2 rounded-lg text-white mt-0.5 ${
                    selected.report_status === 'APPROVED' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}>
                    {selected.report_status === 'APPROVED' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">LÃ¡Â»â€¹ch sÃ¡Â»Â­ xÃ¡Â»Â­ lÃƒÂ½</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 mt-2 text-xs font-medium text-slate-500 dark:text-slate-300">
                      <p>NhÃƒÂ¢n viÃƒÂªn xÃ¡Â»Â­ lÃƒÂ½: <span className="font-semibold text-slate-800 dark:text-slate-100">{selected.processed_by ?? 'NhÃƒÂ¢n viÃƒÂªn hÃ¡Â»â€¡ thÃ¡Â»â€˜ng'}</span></p>
                      <p>NgÃƒÂ y xÃ¡Â»Â­ lÃƒÂ½: <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {selected.processed_at ? formatVietnamDateTime(selected.processed_at, 'dd/MM/yyyy HH:mm') : '---'}
                      </span></p>
                    </div>
                    {selected.staff_note && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200/50">
                        <p className="text-xs text-slate-400 dark:text-slate-300 font-semibold mb-1">Ghi chÃƒÂº nhÃƒÂ¢n viÃƒÂªn:</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200 italic bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
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
                <div className="bg-slate-50/50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3.5 flex gap-3 items-center">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <User className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Sinh viÃƒÂªn gÃ¡Â»Â­i</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{selected.student_name}</p>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">ID: {selected.student_id ?? '-'}</p>
                  </div>
                </div>

                {/* Seat Code Card */}
                <div className="bg-slate-50/50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3.5 flex gap-3 items-center">
                  <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                    <Tag className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">MÃƒÂ£ ghÃ¡ÂºÂ¿ phÃ¡ÂºÂ£n ÃƒÂ¡nh</p>
                    <p className="text-sm font-bold text-purple-700 dark:text-purple-300 uppercase">
                      {selected.seat_code ? `GhÃ¡ÂºÂ¿ ${selected.seat_code}` : (
                        selected.row_no != null && selected.col_no != null
                          ? `HÃƒÂ ng ${selected.row_no} - CÃ¡Â»â„¢t ${selected.col_no}`
                          : 'ChÃ†Â°a xÃƒÂ¡c Ã„â€˜Ã¡Â»â€¹nh'
                      )}
                    </p>
                  </div>
                </div>

                {/* Location / Area Card */}
                <div className="bg-slate-50/50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3.5 flex gap-3 items-start sm:col-span-2">
                  <div className="p-2 bg-orange-100 text-orange-600 rounded-lg mt-0.5">
                    <MapPin className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Ã„ÂÃ¡Â»â€¹a Ã„â€˜iÃ¡Â»Æ’m & SÃ¡ÂºÂ£nh sÃ¡Â»Â± kiÃ¡Â»â€¡n</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                      {selected.venue_name ?? 'CÃ†Â¡ sÃ¡Â»Å¸ FPT'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-300 font-semibold mt-0.5">
                      {selected.area_name && `${selected.area_name}`}
                      {selected.floor && ` - LÃ¡ÂºÂ§u ${selected.floor}`}
                      {selected.location && ` (${selected.location})`}
                    </p>
                  </div>
                </div>

                {/* Refund & Price Card */}
                <div className="bg-emerald-50/40 dark:bg-emerald-950/30 border border-emerald-100/60 dark:border-emerald-900/60 rounded-xl p-3.5 flex gap-3 items-center sm:col-span-2">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                    <Wallet className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-semibold text-emerald-600">GiÃƒÂ¡ trÃ¡Â»â€¹ hoÃƒÂ n trÃ¡ÂºÂ£ dÃ¡Â»Â± kiÃ¡ÂºÂ¿n</p>
                      <p className="text-xs text-slate-400 dark:text-slate-300 font-medium">HÃ¡Â»â€¡ thÃ¡Â»â€˜ng sÃ¡ÂºÂ½ hoÃƒÂ n trÃ¡Â»Â±c tiÃ¡ÂºÂ¿p vÃƒÂ o vÃƒÂ­ sau khi duyÃ¡Â»â€¡t</p>
                    </div>
                    <p className="text-xl font-black text-emerald-600">
                      {selected.price != null
                        ? selected.price === 0
                          ? '0Ã¢â€šÂ« (MiÃ¡Â»â€¦n phÃƒÂ­)'
                          : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0 }).format(selected.price)
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Report Description Section */}
              <div className="border-t border-b border-slate-100 dark:border-slate-800 py-4 space-y-3.5">
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">TiÃƒÂªu Ã„â€˜Ã¡Â»Â sÃ¡Â»Â± cÃ¡Â»â€˜</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">{selected.title ?? 'ChÃ†Â°a nhÃ¡ÂºÂ­p tiÃƒÂªu Ã„â€˜Ã¡Â»Â'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Chi tiÃ¡ÂºÂ¿t mÃƒÂ´ tÃ¡ÂºÂ£ lÃ¡Â»â€”i</p>
                  <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3.5 mt-1 border border-slate-100 dark:border-slate-700">
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                      {selected.description ?? 'KhÃƒÂ´ng cÃƒÂ³ phÃ¡ÂºÂ§n mÃƒÂ´ tÃ¡ÂºÂ£.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Prove Image Section */}
              {selected.image_url && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <ImageIcon className="w-4 h-4" /> HÃƒÂ¬nh Ã¡ÂºÂ£nh minh chÃ¡Â»Â©ng ghÃ¡ÂºÂ¿ hÃ¡Â»Âng
                  </p>
                  <div className="relative group overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <img
                      src={selected.image_url}
                      alt="Ã¡ÂºÂ¢nh minh chÃ¡Â»Â©ng ghÃ¡ÂºÂ¿ hÃ¡Â»Âng"
                      className="w-full max-h-80 object-contain mx-auto transition-transform duration-300 group-hover:scale-102"
                    />
                  </div>
                </div>
              )}

              {/* Staff Action Textarea & Buttons */}
              <div className="space-y-4">
                {selected.report_status === 'PENDING' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">PhÃ¡ÂºÂ£n hÃ¡Â»â€œi cÃ¡Â»Â§a NhÃƒÂ¢n viÃƒÂªn xÃ¡Â»Â­ lÃƒÂ½</p>
                    <textarea
                      value={staffNote}
                      onChange={(e) => setStaffNote(e.target.value)}
                      placeholder="NhÃ¡ÂºÂ­p lÃƒÂ½ do duyÃ¡Â»â€¡t/tÃ¡Â»Â« chÃ¡Â»â€˜i hoÃ¡ÂºÂ·c lÃ¡Â»Âi nhÃ¡ÂºÂ¯n Ã„â€˜Ã¡ÂºÂ¿n sinh viÃƒÂªn (tÃƒÂ¹y chÃ¡Â»Ân)..."
                      disabled={isProcessing}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl p-3 h-24 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all text-sm"
                    />
                  </div>
                ) : null}
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end items-center gap-3 bg-slate-50/50 dark:bg-slate-800">
              <button
                onClick={closeDetail}
                disabled={isProcessing}
                className="px-4.5 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-100 transition-all hover:text-slate-800 dark:hover:text-white disabled:opacity-50"
              >
                Ã„ÂÃƒÂ³ng
              </button>

              {selected.report_status === 'PENDING' && (
                <>
                  <button
                    onClick={async () => {
                      if (!selected) return
                      const ok = window.confirm('BÃ¡ÂºÂ¡n cÃƒÂ³ chÃ¡ÂºÂ¯c chÃ¡ÂºÂ¯n muÃ¡Â»â€˜n TÃ¡Â»Âª CHÃ¡Â»ÂI yÃƒÂªu cÃ¡ÂºÂ§u bÃƒÂ¡o cÃƒÂ¡o nÃƒÂ y?')
                      if (!ok) return
                      await processReport(selected.report_id, 'REJECT')
                    }}
                    disabled={isProcessing}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> TÃ¡Â»Â« chÃ¡Â»â€˜i
                  </button>

                  <button
                    onClick={async () => {
                      if (!selected) return
                      const ok = window.confirm('BÃ¡ÂºÂ¡n cÃƒÂ³ chÃ¡ÂºÂ¯c chÃ¡ÂºÂ¯n muÃ¡Â»â€˜n DUYÃ¡Â»â€ T yÃƒÂªu cÃ¡ÂºÂ§u vÃƒÂ  tiÃ¡ÂºÂ¿n hÃƒÂ nh HOÃƒâ‚¬N TIÃ¡Â»â‚¬N vÃƒÂ©?')
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
                    DuyÃ¡Â»â€¡t & HoÃƒÂ n tiÃ¡Â»Ân
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
