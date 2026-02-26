import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { ExternalLink, ImageIcon } from 'lucide-react'
import { emitWalletRefresh } from '../hooks/useWallet'

/**
 * =========================
 * TYPE ĐỊNH NGHĨA DỮ LIỆU
 * =========================
 * ReportSummary: dạng rút gọn để hiển thị ở bảng list
 * ReportDetail: dạng đầy đủ để hiển thị popup chi tiết
 */
type ReportSummary = {
  reportId: number
  ticketId: number
  studentName: string
  categoryTicketName?: string
  reportStatus: string
  createdAt: string
}

type ReportDetail = {
  reportId: number
  ticketId: number
  title?: string
  description?: string
  imageUrl?: string | null
  createdAt?: string
  reportStatus?: string
  studentId?: number
  studentName?: string
  ticketStatus?: string
  categoryTicketId?: number
  categoryTicketName?: string
  price?: number
  // Seat / Area / Venue details (may be provided by backend)
  seatId?: number
  seatCode?: string
  rowNo?: number
  colNo?: number

  areaId?: number
  areaName?: string
  floor?: number

  venueId?: number
  venueName?: string
  location?: string
}

/**
 * =========================
 * COMPONENT CHÍNH
 * =========================
 * ReportRequests: màn hình staff xử lý yêu cầu hoàn tiền/báo cáo lỗi
 * Chức năng chính:
 * 1) Load danh sách report từ backend
 * 2) Lọc theo tab PENDING / PROCESSED
 * 3) Click "Xem chi tiết" để load chi tiết theo reportId
 * 4) Duyệt / từ chối report + update UI
 */
export default function ReportRequests() {
  // Lấy thông tin user đang đăng nhập (từ AuthContext)
  const { user } = useAuth()

  // Toast để hiện thông báo nhanh (success/error) cho staff
  const { showToast } = useToast()

  /**
   * =========================
   * STATE QUẢN LÝ UI + DATA
   * =========================
   */
  const [loading, setLoading] = useState(true) // đang tải dữ liệu (list hoặc detail)
  const [error, setError] = useState<string | null>(null) // lỗi khi gọi API
  const [reports, setReports] = useState<ReportSummary[]>([]) // danh sách report để hiển thị bảng
  const [selected, setSelected] = useState<ReportDetail | null>(null) // report đang mở modal chi tiết
  const [processing, setProcessing] = useState(false) // đang xử lý approve/reject (disable nút)
  const [staffNote, setStaffNote] = useState('') // ghi chú staff nhập vào textarea
  const [activeTab, setActiveTab] = useState<'PENDING' | 'PROCESSED'>('PENDING') // tab đang chọn

  /**
   * ===================================================
   * useEffect: chạy 1 lần khi component mount ([])
   * => gọi API lấy danh sách report cho staff
   * ===================================================
   */
  useEffect(() => {
    const fetchReports = async () => {
      // Mỗi lần fetch: bật loading và reset error
      setLoading(true)
      setError(null)

      try {
        // Lấy token từ localStorage để gọi API có bảo vệ JWT
        const token = localStorage.getItem('token')
        if (!token) {
          // Không có token => buộc đăng nhập lại
          throw new Error('Vui lòng đăng nhập lại')
        }

        /**
         * Gọi API backend: GET /api/staff/reports
         * - credentials: 'include' nếu backend dùng cookie/session (hoặc cần gửi cookie)
         * - Authorization: Bearer token (JWT)
         * - ngrok-skip-browser-warning: bỏ warning khi dùng ngrok
         */
        const res = await fetch('/api/staff/reports', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
        })

        /**
         * Đọc response dạng text trước (thay vì res.json() ngay)
         * Mục đích:
         * - debug trường hợp backend trả về HTML hoặc string lỗi
         * - tránh crash JSON.parse ngay nếu response không phải JSON
         */
        const responseText = await res.text()
        console.log('List response status:', res.status)
        console.log('List response:', responseText.substring(0, 200))

        // Parse JSON thủ công để bắt lỗi rõ ràng
        let data
        try {
          data = JSON.parse(responseText)
        } catch (parseError) {
          console.error('JSON parse error. Response was:', responseText.substring(0, 500))
          throw new Error('Server trả về định dạng không hợp lệ. Vui lòng kiểm tra URL backend.')
        }

        /**
         * Nếu backend trả format dạng:
         * { status: 'fail', message: '...' }
         * hoặc HTTP code không OK
         * => báo lỗi
         */
        if (data.status === 'fail' || !res.ok) {
          throw new Error(data.message || 'Không thể tải danh sách yêu cầu')
        }

        /**
         * Hệ thống có thể trả nhiều dạng:
         * - data là array trực tiếp
         * - hoặc {data: array}
         * => normalize về list array
         */
        const list = Array.isArray(data)
          ? data
          : data && Array.isArray(data.data)
            ? data.data
            : []

        /**
         * Map dữ liệu về đúng cấu trúc ReportSummary (đảm bảo field tồn tại)
         * Dùng ?? để fallback theo nhiều kiểu snake_case / camelCase
         */
        const mapped: ReportSummary[] = list.map((r: any) => ({
          reportId: r.reportId ?? r.id ?? 0,
          ticketId: r.ticketId ?? r.ticket_id ?? 0,
          studentName: r.studentName ?? r.student_name ?? 'Unknown',
          categoryTicketName: r.categoryTicketName ?? r.category_ticket_name,
          reportStatus: r.reportStatus ?? r.status ?? 'PENDING',
          createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
        }))

        // Lưu danh sách lên state để render bảng
        setReports(mapped)

      } catch (err: any) {
        // Nếu lỗi => log + setError để UI hiện box đỏ
        console.error('Fetch reports error', err)
        setError(err.message || 'Lỗi khi tải dữ liệu')
      } finally {
        // Tắt loading dù thành công hay thất bại
        setLoading(false)
      }
    }

    fetchReports()
  }, [])

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

      // Gọi API detail: /api/staff/reports/{id}
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
      console.log('Response status:', res.status)
      console.log('Response text:', responseText)

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
    setProcessing(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Vui lòng đăng nhập lại')

      const res = await fetch('/api/staff/reports/process', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Body gửi lên backend: reportId + action + staffNote
        body: JSON.stringify({ reportId, action, staffNote }),
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

      // Update trạng thái trong modal detail (selected) nếu đang mở
      setSelected((prev) => prev ? { ...prev, reportStatus: newStatus } : prev)

      // Update trạng thái trong danh sách (reports) để list đổi ngay mà không cần reload
      // Này là cập nhật trạng thái reportStatus ở list FE 
      setReports((prev) =>
        prev.map(r => r.reportId === reportId ? { ...r, reportStatus: newStatus } : r)
      )

      // Hiện toast thành công
      showToast('success', data.message || 'Xử lý thành công')

      // Nếu APPROVE => gọi emitWalletRefresh() để sinh viên thấy tiền hoàn lại ngay lập tức
      if (action === 'APPROVE') {
        emitWalletRefresh()
      }

    } catch (err: any) {
      console.error('Process report error', err)
      // Hiện toast lỗi
      showToast('error', err.message || 'Có lỗi xảy ra')
    } finally {
      setProcessing(false)
    }
  }

  /**
   * ===================================================
   * LỌC DANH SÁCH THEO TAB
   * - pendingReports: chỉ lấy reportStatus = PENDING
   * - processedReports: APPROVED hoặc REJECTED
   * ===================================================
   */
  const pendingReports = reports.filter(r => (r.reportStatus ?? '').toUpperCase() === 'PENDING')
  const processedReports = reports.filter(r => {
    const s = (r.reportStatus ?? '').toUpperCase()
    return s === 'APPROVED' || s === 'REJECTED'
  })
  const displayList = activeTab === 'PENDING' ? pendingReports : processedReports

  /**
   * ===================================================
   * RENDER UI
   * ===================================================
   */
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Yêu cầu hoàn tiền / Báo cáo lỗi</h1>

      {/* Nếu đang loading: hiển thị box "Đang tải..." */}
      {loading && (
        <div className="bg-white rounded-lg shadow-md p-6">Đang tải...</div>
      )}

      {/* Nếu có lỗi: hiển thị error */}
      {error && (
        <div className="bg-white rounded-lg shadow-md p-6 text-red-600">{error}</div>
      )}

      {/* Khi không loading và không error: hiển thị danh sách */}
      {!loading && !error && (
        <div>
          {/* ======================
              TAB SWITCH: PENDING / PROCESSED
              ====================== */}
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-4 py-2 rounded ${activeTab === 'PENDING' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
            >
              Chưa Xử Lí ({pendingReports.length})
            </button>
            <button
              onClick={() => setActiveTab('PROCESSED')}
              className={`px-4 py-2 rounded ${activeTab === 'PROCESSED' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
            >
              Đã Xử Lí ({processedReports.length})
            </button>
          </div>

          {/* ======================
              BẢNG HIỂN THỊ REPORT LIST
              ====================== */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="w-full table-auto">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3">Report ID</th>
                  <th className="text-left px-4 py-3">Ticket ID</th>
                  <th className="text-left px-4 py-3">Người gửi</th>
                  <th className="text-left px-4 py-3">Loại vé</th>
                  <th className="text-left px-4 py-3">Trạng thái</th>
                  <th className="text-left px-4 py-3">Ngày gửi</th>
                  <th className="text-left px-4 py-3">Hành động</th>
                </tr>
              </thead>

              <tbody>
                {/* Render từng row từ displayList (đã lọc theo tab) */}
                {displayList.map((r) => (
                  <tr key={r.reportId} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">{r.reportId}</td>
                    <td className="px-4 py-3">{r.ticketId}</td>
                    <td className="px-4 py-3">{r.studentName}</td>
                    <td className="px-4 py-3">{r.categoryTicketName ?? '-'}</td>
                    <td className="px-4 py-3">{r.reportStatus}</td>

                    {/* Format createdAt theo dd/MM/yyyy HH:mm, locale tiếng Việt */}
                    <td className="px-4 py-3">
                      {format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </td>

                    {/* Nút mở modal detail: gọi openDetail */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(r.reportId)}
                        className="text-blue-600 hover:underline flex items-center gap-2"
                      >
                        Xem chi tiết <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Nếu không có item nào trong tab hiện tại */}
                {displayList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      Không có yêu cầu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================
          MODAL DETAIL (chỉ render khi selected != null)
          ====================== */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

            {/* Header modal */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Chi tiết yêu cầu #{selected.reportId}</h2>
              <button onClick={closeDetail} className="text-gray-600 hover:text-gray-800">
                Đóng
              </button>
            </div>

            {/* Nội dung modal */}
            <div className="p-6 space-y-4">

              {/* Grid thông tin cơ bản */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Report ID</p>
                  <p className="font-medium">{selected.reportId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ticket ID</p>
                  <p className="font-medium">{selected.ticketId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Người gửi</p>
                  <p className="font-medium">
                    {selected.studentName} (ID: {selected.studentId ?? '-'})
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Loại vé</p>
                  <p className="font-medium">{selected.categoryTicketName ?? '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Trạng thái báo cáo</p>
                  <p className="font-medium">{selected.reportStatus}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ticket status</p>
                  <p className="font-medium">{selected.ticketStatus ?? '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Giá</p>
                  <p className="font-medium">
                    {selected.price ? selected.price.toLocaleString('vi-VN') + ' ₫' : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ngày tạo</p>
                  <p className="font-medium">
                    {selected.createdAt
                      ? format(new Date(selected.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Số Ghế</p>
                  <p className="font-medium">
                    {selected.seatCode
                      ? selected.seatCode
                      : selected.rowNo != null && selected.colNo != null
                        ? `H${selected.rowNo} - C${selected.colNo}`
                        : '-'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Khu Vực</p>
                  <p className="font-medium">
                    {(selected.venueName || selected.areaName)
                      ? `${selected.venueName ?? '-'} / ${selected.areaName ?? '-'}`
                      : '-'}
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
              {selected.imageUrl && (
                <div>
                  <p className="text-sm text-gray-500">Ảnh minh chứng</p>
                  <div className="mt-2">
                    <img
                      src={selected.imageUrl}
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
                  className="w-full mt-2 border rounded p-2 h-24"
                />

                {/* Các nút thao tác: Reject/Approve/Close */}
                <div className="flex justify-end gap-3 mt-3">
                  <button
                    onClick={async () => {
                      if (!selected) return
                      const ok = window.confirm('Bạn chắc chắn muốn từ chối yêu cầu này?')
                      if (!ok) return
                      await processReport(selected.reportId, 'REJECT')
                    }}
                    disabled={processing}
                    className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
                  >
                    Từ Chối
                  </button>

                  <button
                    onClick={async () => {
                      if (!selected) return
                      const ok = window.confirm('Bạn chắc chắn muốn duyệt yêu cầu này?')
                      if (!ok) return
                      await processReport(selected.reportId, 'APPROVE')
                    }}
                    disabled={processing}
                    className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                  >
                    Duyệt
                  </button>

                  <button onClick={closeDetail} className="px-4 py-2 border rounded">
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
