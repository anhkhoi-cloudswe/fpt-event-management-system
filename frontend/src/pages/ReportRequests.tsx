import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { ExternalLink, ImageIcon, Search, FileClock } from 'lucide-react'
import { emitWalletRefresh } from '../hooks/useWallet'
import { formatVietnamDateTime } from '../utils/dateFormat'

/**
 * =========================
 * TYPE ĐỊNH NGHĨA DỮ LIỆU
 * =========================
 * ReportSummary: dạng rút gọn để hiển thị ở bảng list
 * ReportDetail: dạng đầy đủ để hiển thị popup chi tiết
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
  // Seat / Area / Venue details (may be provided by backend)
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

  // Processor info (for processed reports)
  processed_by?: string
  processed_at?: string
  staff_note?: string
}

/**
 * =========================
 * COMPONENT CHÍNH
 * =========================
 * ReportRequests: màn hình staff xử lý yêu cầu hoàn tiền/báo cáo lỗi
 * Chức năng chính:
 * 1) Load danh sách report từ backend với phân trang + lọc + tìm kiếm
 * 2) Lọc theo tab PENDING / PROCESSED
 * 3) Click "Xem chi tiết" để load chi tiết theo reportId
 * 4) Duyệt / từ chối report + update UI
 */
export default function ReportRequests() {
  // Lấy thông tin user đang đăng nhập (từ AuthContext)
  const { user } = useAuth()

  // Toast để hiện thông báo nhanh (success/error) cho staff
  const { showToast } = useToast()

  // URL search params để sync pagination với URL
  const [searchParams, setSearchParams] = useSearchParams()

  /**
   * =========================
   * STATE QUẢN LÝ UI + DATA
   * =========================
   */
  const [loading, setLoading] = useState(true) // đang tải dữ liệu (list hoặc detail)
  const [error, setError] = useState<string | null>(null) // lỗi khi gọi API
  const [reports, setReports] = useState<ReportSummary[]>([]) // danh sách report để hiển thị bảng
  const [selected, setSelected] = useState<ReportDetail | null>(null) // report đang mở modal chi tiết
  const [isProcessing, setIsProcessing] = useState(false) // đang xử lý approve/reject (disable nút)
  const [staffNote, setStaffNote] = useState('') // ghi chú staff nhập vào textarea
  const [activeTab, setActiveTab] = useState<'PENDING' | 'PROCESSED'>('PENDING') // tab đang chọn

  // Pagination & Filter state
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'PROCESSED' | ''>('')
  const [searchQuery, setSearchQuery] = useState('') // search theo tên người gửi hoặc ticket ID
  const [timeFilter, setTimeFilter] = useState('') // time filter: '', 'today', 'week', 'month'

  // Status counts from API
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, processed: 0 })

  /**
   * ===================================================
   * Fetch reports data - extracted to component level
   * so it can be called from other functions
   * ===================================================
   */
  const fetchReportsData = async (pageNum: number = currentPage, query: string = searchQuery, tab: 'PENDING' | 'PROCESSED' = activeTab) => {
    setLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Vui lòng đăng nhập lại')
      }

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
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
      })

      const responseText = await res.text()
      console.log('List response status:', res.status)
      console.log('List response:', responseText.substring(0, 200))

      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.error('JSON parse error. Response was:', responseText.substring(0, 500))
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

  /**
   * ===================================================
   * useEffect: chạy khi component mount hoặc deps thay đổi
   * ===================================================
   */
  useEffect(() => {
    fetchReportsData(currentPage, searchQuery, activeTab)
  }, [currentPage, searchQuery, activeTab])

  /**
   * ===================================================
   * openDetail: gọi API lấy chi tiết 1 report theo reportId
   * => dùng để mở modal chi tiết
   * ===================================================
   */
  const openDetail = async (reportId: number) => {
    setLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Vui lòng đăng nhập lại')
      }

      // Gọi API detail: /api/staff/reports/{reportId} (path parameter)
      const res = await fetch(`/api/staff/reports/${reportId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
      })

      // Debug response
      const responseText = await res.text()
      console.log('Detail Response status:', res.status)
      console.log('Detail Response text:', responseText)

      // Parse JSON an toàn
      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.error('JSON parse error. Response was:', responseText.substring(0, 500))
        throw new Error('Server trả về định dạng không hợp lệ. Vui lòng kiểm tra URL backend.')
      }

      // Nếu backend báo fail hoặc HTTP lỗi
      if (data.status === 'fail' || !res.ok) {
        throw new Error(data.message || 'Không thể tải chi tiết')
      }

      /**
       * Backend có thể trả dạng:
       * { status: 'success', data: {...} }
       * hoặc trả trực tiếp object
       * => normalize về detail object
       */
      const detail = data.data ?? data

      // DEBUG: Log the detail object to verify fields are populated
      console.log('🔍 Detail object extracted:', detail)
      console.log('🔍 Price field:', detail.price)
      console.log('🔍 Seat info:', {
        seat_code: detail.seat_code,
        row_no: detail.row_no,
        col_no: detail.col_no,
      })
      console.log('🔍 Area info:', {
        venue_name: detail.venue_name,
        area_name: detail.area_name,
        floor: detail.floor,
        location: detail.location,
      })

      // Set selected để mở modal
      setSelected(detail)
    } catch (err: any) {
      console.error('Open detail error', err)
      setError(err.message || 'Không thể tải chi tiết')
    } finally {
      setLoading(false)
    }
  }

  // Đóng modal: chỉ cần clear selected
  const closeDetail = () => setSelected(null)

  /**
   * ===================================================
   * processReport: xử lý report (APPROVE / REJECT)
   * - gửi reportId, action, staffNote lên backend
   * - nếu ok: update state selected + list để UI phản ánh ngay
   * ===================================================
   */
  const processReport = async (reportId: number, action: 'APPROVE' | 'REJECT') => {
    setIsProcessing(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Vui lòng đăng nhập lại')

      const endpoint = action === 'APPROVE' ? '/api/staff/reports/approve' : '/api/staff/reports/reject'

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Body gửi lên backend: reportId + staffNote
        body: JSON.stringify({ reportId, staffNote }),
      })

      // Parse JSON response; nếu parse fail => null
      const data = await res.json().catch(() => null)

      // Nếu HTTP fail hoặc data null
      if (!res.ok || !data) {
        throw new Error(data?.message || 'Xử lý thất bại')
      }

      // Backend trả status fail
      if (data.status === 'fail') {
        throw new Error(data.message || 'Xử lý thất bại')
      }

      // Nếu action APPROVE => status mới APPROVED, ngược lại REJECTED
      const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      const successMessage = action === 'APPROVE'
        ? 'Đã duyệt báo cáo và hoàn tiền thành công'
        : 'Đã từ chối báo cáo thành công'

      // Update trạng thái trong danh sách (reports) để list đổi ngay mà không cần reload
      setReports((prev) =>
        prev.map(r => r.report_id === reportId ? { ...r, report_status: newStatus } : r)
      )

      // Hiện toast thành công
      showToast('success', successMessage)

      // Nếu APPROVE => gọi emitWalletRefresh() để sinh viên thấy tiền hoàn lại ngay lập tức
      if (action === 'APPROVE') {
        emitWalletRefresh()
      }

      // Gọi fetchReportsData() để cập nhật counts trên tabs
      fetchReportsData(currentPage, searchQuery, activeTab)

      // Đóng modal sau khi xử lý thành công
      setSelected(null)
      setStaffNote('')

    } catch (err: any) {
      console.error('Process report error', err)
      // Hiện toast lỗi
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally {
      setIsProcessing(false)
    }
  }

  /**
   * ===================================================
   * LỌC DANH SÁCH THEO TAB + STATUS + SEARCH + TIME
   * ===================================================
   */
  const filteredReports = useMemo(() => {
    // Bước 1: Lọc theo tab (PENDING vs PROCESSED)
    let list = reports
    if (activeTab === 'PENDING') {
      list = list.filter(r => (r.report_status ?? '').toUpperCase() === 'PENDING')
    } else {
      list = list.filter(r => {
        const s = (r.report_status ?? '').toUpperCase()
        return s === 'APPROVED' || s === 'REJECTED'
      })
    }

    // Bước 2: Lọc theo statusFilter (nếu chọn trong dropdown)
    if (statusFilter) {
      list = list.filter(r => (r.report_status ?? '').toUpperCase() === statusFilter.toUpperCase())
    }

    // Bước 3: Lọc theo searchQuery (tên người gửi hoặc ticket ID)
    if (searchQuery && searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      list = list.filter(r =>
        (r.student_name?.toLowerCase().includes(query) ?? false) ||
        (r.ticket_id?.toString().includes(query) ?? false) ||
        (r.title?.toLowerCase().includes(query) ?? false)
      )
    }

    // Bước 4: Lọc theo timeFilter (tùy chọn - có thể mở rộng sau)
    // TODO: Implement time filtering based on created_at

    return list
  }, [reports, activeTab, statusFilter, searchQuery, timeFilter])

  const displayList = filteredReports

  /**
   * Handle pagination: update URL params khi thay đổi page
   */
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  /**
   * ===================================================
   * RENDER UI
   * ===================================================
   */
  return (
    <div className="bg-amber-50 min-h-screen p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý báo cáo & Hoàn tiền</h1>
        <p className="text-sm text-gray-500 mt-1">Duyệt các phản ánh về ghế ngồi và yêu cầu hoàn tiền từ sinh viên.</p>
      </div>

      {/* Nếu đang loading: hiển thị box "Đang tải..." */}
      {loading && (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <p className="text-gray-500">Đang tải...</p>
        </div>
      )}

      {/* Nếu có lỗi: hiển thị error */}
      {error && (
        <div className="bg-white rounded-lg shadow-md p-10 text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Khi không loading và không error: hiển thị danh sách */}
      {!loading && !error && (
        <div>
          {/* Tabs - Underline Style */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                {/* Tab Chờ xử lý */}
                <button
                  onClick={() => {
                    setActiveTab('PENDING')
                    setCurrentPage(1)
                    setSearchParams(new URLSearchParams({ page: '1' }))
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'PENDING'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Chờ xử lý
                  {counts.pending > 0 && (
                    <span className="ml-2 py-0.5 px-2 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                      {counts.pending}
                    </span>
                  )}
                </button>

                {/* Tab Đã xử lý */}
                <button
                  onClick={() => {
                    setActiveTab('PROCESSED')
                    setCurrentPage(1)
                    setSearchParams(new URLSearchParams({ page: '1' }))
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'PROCESSED'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Đã xử lý
                  {counts.processed > 0 && (
                    <span className="ml-2 py-0.5 px-2 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                      {counts.processed}
                    </span>
                  )}
                </button>
              </nav>
            </div>
          </div>

          {/* Multi-Filter Bar */}
          <div className="mb-6 bg-white rounded-lg shadow-md p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search Input */}
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tiêu đề hoặc người gửi..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                    setSearchParams(new URLSearchParams({ page: '1' }))
                  }}
                  className="flex-1 px-2 py-1 outline-none text-sm"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'PENDING' | 'PROCESSED' | '')
                  setCurrentPage(1)
                  setSearchParams(new URLSearchParams({ page: '1' }))
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="PENDING">Chờ xử lý</option>
                <option value="APPROVED">Đã duyệt</option>
                <option value="REJECTED">Từ chối</option>
              </select>

              {/* Time Filter */}
              <select
                value={timeFilter}
                onChange={(e) => {
                  setTimeFilter(e.target.value)
                  setCurrentPage(1)
                  setSearchParams(new URLSearchParams({ page: '1' }))
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"
              >
                <option value="">Tất cả thời gian</option>
                <option value="today">Hôm nay</option>
                <option value="week">Tuần này</option>
                <option value="month">Tháng này</option>
              </select>
            </div>
          </div>

          {/* Metadata */}
          {displayList.length > 0 && (
            <div className="mb-4 text-sm text-gray-600">
              Hiển thị <span className="font-semibold">{displayList.length}</span> trên{' '}
              <span className="font-semibold">{totalItems}</span> yêu cầu
            </div>
          )}

          {/* Empty State */}
          {displayList.length === 0 && !loading && !error ? (
            <div className="bg-white rounded-lg shadow-md p-10 text-center">
              <FileClock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">Không tìm thấy yêu cầu nào</p>
              <p className="text-sm text-gray-400 mt-2">
                {activeTab === 'PENDING'
                  ? 'Không có yêu cầu đang chờ xử lý.'
                  : 'Không có yêu cầu đã xử lý.'}
              </p>
            </div>
          ) : (
            // Table
            <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
              <table className="w-full table-auto divide-y divide-gray-200">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Report ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Người gửi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loại vé</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày gửi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {/* Render từng row từ displayList (đã lọc theo tab) */}
                  {displayList.map((r) => (
                    <tr key={r.report_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-blue-600">{r.report_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{r.ticket_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{r.student_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{r.category_ticket_name ?? '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${r.report_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            r.report_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                          }`}>
                          {r.report_status}
                        </span>
                      </td>

                      {/* Format createdAt theo dd/MM/yyyy HH:mm, locale tiếng Việt - sử dụng helper để xử lý timezone Vietnam */}
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatVietnamDateTime(r.created_at, 'dd/MM/yyyy HH:mm')}
                      </td>

                      {/* Nút mở modal detail: gọi openDetail */}
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => openDetail(r.report_id)}
                          className="text-blue-600 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                        >
                          Xem chi tiết <ExternalLink className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Nếu không có item nào trong tab hiện tại */}

                </tbody>
              </table>
            </div>
          )}

          {/* ======================
              PAGINATION CONTROLS
              ====================== */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-lg shadow-md p-4">
              <div className="text-sm text-gray-600">
                Trang <span className="font-semibold">{currentPage}</span> / <span className="font-semibold">{totalPages}</span> ({totalItems} yêu cầu)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
                      className={`px-3 py-2 border rounded-lg text-sm ${currentPage === pageNum
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      {pageNum}
                    </button>
                  ) : null
                })}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================
          MODAL DETAIL (chỉ render khi selected != null)
          ====================== */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

            {/* Header modal */}
            <div className="px-6 pt-4 pb-3 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Chi tiết yêu cầu #{selected.report_id}</h2>
              <button onClick={closeDetail} className="text-gray-500 hover:text-gray-800 text-xl leading-none">
                ✕
              </button>
            </div>

            {/* Nội dung modal */}
            <div className="p-6 space-y-4">

              {/* Processor Info Box - chỉ hiển thị khi đã xử lý */}
              {selected.report_status !== 'PENDING' && (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 12 }} className="border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Thông tin xử lý</p>
                  <p className="text-sm text-slate-700">
                    Người xử lý: <span className="font-semibold text-slate-900">{selected.processed_by ?? 'Staff'}</span>
                  </p>
                  <p className="text-sm text-slate-700 mt-0.5">
                    Ngày xử lý: <span className="font-semibold text-slate-900">
                      {selected.processed_at
                        ? formatVietnamDateTime(selected.processed_at, 'dd/MM/yyyy HH:mm')
                        : '---'}
                    </span>
                  </p>
                </div>
              )}

              {/* Grid thông tin cơ bản */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-3 rounded">
                  <p className="text-sm text-gray-600 font-semibold">Report ID</p>
                  <p className="font-bold text-lg text-blue-600">{selected.report_id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ticket ID</p>
                  <p className="font-medium">{selected.ticket_id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Người gửi</p>
                  <p className="font-medium">
                    {selected.student_name} {selected.student_id && `(ID: ${selected.student_id})`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Loại vé</p>
                  <p className="font-medium">{selected.category_ticket_name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Trạng thái báo cáo</p>
                  <p className="font-medium">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${selected.report_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        selected.report_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                      }`}>
                      {selected.report_status}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ticket Status</p>
                  <p className="font-medium">{selected.ticket_status ?? '-'}</p>
                </div>
                <div className="bg-green-50 p-3 rounded col-span-2">
                  <p className="text-sm text-gray-600 font-semibold">Giá Vé</p>
                  <p className="font-bold text-lg text-green-700">
                    {selected.price != null
                      ? selected.price === 0
                        ? 'Miễn phí (0₫)'
                        : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', minimumFractionDigits: 0 }).format(selected.price)
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ngày tạo</p>
                  <p className="font-medium text-sm">
                    {selected.created_at
                      ? formatVietnamDateTime(selected.created_at, 'dd/MM/yyyy HH:mm')
                      : '-'}
                  </p>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <p className="text-sm text-gray-600 font-semibold">Số Ghế</p>
                  <p className="font-bold text-purple-700">
                    {selected.seat_code
                      ? selected.seat_code
                      : selected.row_no != null && selected.col_no != null
                        ? `Hàng ${selected.row_no} - Cột ${selected.col_no}`
                        : '-'}
                  </p>
                </div>
                <div className="bg-orange-50 p-3 rounded col-span-2">
                  <p className="text-sm text-gray-600 font-semibold">Khu Vực / Sảnh</p>
                  <p className="font-bold text-orange-700">
                    {selected.venue_name ? `${selected.venue_name}` : '-'}
                    {selected.area_name && ` / ${selected.area_name}`}
                    {selected.floor && ` - Lầu ${selected.floor}`}
                  </p>
                </div>
              </div>

              {/* Tiêu đề report */}
              <div>
                <p className="text-sm text-gray-500">Tiêu đề</p>
                <p className="font-medium">{selected.title ?? '-'}</p>
              </div>

              {/* Mô tả report */}
              <div>
                <p className="text-sm text-gray-500">Mô tả</p>
                <p className="whitespace-pre-line">{selected.description ?? '-'}</p>
              </div>

              {/* Nếu có ảnh minh chứng thì render ảnh */}
              {selected.image_url && (
                <div>
                  <p className="text-sm text-gray-500">Ảnh minh chứng</p>
                  <div className="mt-2">
                    <img
                      src={selected.image_url}
                      alt="Ảnh minh chứng"
                      className="w-full max-h-80 object-contain rounded-lg border"
                    />
                  </div>
                </div>
              )}

              {/* Ghi chú staff + nút xử lý */}
              <div>
                <p className="text-sm text-gray-500">Ghi chú của nhân viên</p>
                <textarea
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  placeholder="Ghi chú xử lý (tùy chọn)"
                  disabled={isProcessing || selected.report_status !== 'PENDING'}
                  className="w-full mt-2 border rounded p-2 h-24 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                />

                {/* Các nút thao tác: Reject/Approve/Close */}
                <div className="flex justify-end gap-3 mt-3">
                  {selected.report_status === 'PENDING' && (
                    <>
                      <button
                        onClick={async () => {
                          if (!selected) return
                          const ok = window.confirm('Bạn chắc chắn muốn từ chối yêu cầu này?')
                          if (!ok) return
                          await processReport(selected.report_id, 'REJECT')
                        }}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Từ Chối
                      </button>

                      <button
                        onClick={async () => {
                          if (!selected) return
                          const ok = window.confirm('Bạn chắc chắn muốn duyệt yêu cầu này?')
                          if (!ok) return
                          await processReport(selected.report_id, 'APPROVE')
                        }}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Duyệt
                      </button>
                    </>
                  )}

                  <button onClick={closeDetail} className="px-4 py-2 border rounded hover:bg-gray-100">
                    Đóng
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
