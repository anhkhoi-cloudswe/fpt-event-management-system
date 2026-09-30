import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  TrendingUp,
  Lock,
  Wallet,
  Coins,
  ArrowDownToLine,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Download,
  AlertCircle,
  Building2,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  adminFinanceService,
  AdminFinanceOverview,
  AdminPayoutItem,
  AdminReceiptItem
} from '../services/adminFinanceService'

const formatVND = (val: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0)
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

export default function AdminFinancePage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // Tab State
  const [activeTab, setActiveTab] = useState<'PAYOUTS' | 'RECEIPTS'>('PAYOUTS')

  // Overview State
  const [overview, setOverview] = useState<AdminFinanceOverview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)

  // Payouts State
  const [payouts, setPayouts] = useState<AdminPayoutItem[]>([])
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<string>('ALL')
  const [payoutPage, setPayoutPage] = useState(1)
  const [payoutTotalPages, setPayoutTotalPages] = useState(1)
  const [payoutTotalRecords, setPayoutTotalRecords] = useState(0)
  const [loadingPayouts, setLoadingPayouts] = useState(true)

  // Receipts Audit State
  const [receipts, setReceipts] = useState<AdminReceiptItem[]>([])
  const [receiptSearch, setReceiptSearch] = useState('')
  const [receiptPage, setReceiptPage] = useState(1)
  const [receiptTotalPages, setReceiptTotalPages] = useState(1)
  const [receiptTotalRecords, setReceiptTotalRecords] = useState(0)
  const [loadingReceipts, setLoadingReceipts] = useState(true)
  const [exportingCSV, setExportingCSV] = useState(false)

  // Modal States
  const [selectedPayout, setSelectedPayout] = useState<AdminPayoutItem | null>(null)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [bankRefCode, setBankRefCode] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  // Check Admin
  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">Truy Cập Bị Từ Chối</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md">
          Chỉ có Quản trị viên (Role ADMIN) mới có quyền truy cập vào Trung tâm Tài chính & Quyết toán sàn.
        </p>
      </div>
    )
  }

  // Load Overview KPIs
  const loadOverview = useCallback(async () => {
    try {
      setLoadingOverview(true)
      const data = await adminFinanceService.getOverview()
      setOverview(data)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi tải chỉ số tài chính')
    } finally {
      setLoadingOverview(false)
    }
  }, [showToast])

  // Load Payouts
  const loadPayouts = useCallback(async () => {
    try {
      setLoadingPayouts(true)
      const data = await adminFinanceService.getPayouts(payoutStatusFilter, payoutPage, 15)
      setPayouts(data.payouts || [])
      setPayoutTotalPages(data.totalPages || 1)
      setPayoutTotalRecords(data.totalRecords || 0)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi tải danh sách rút tiền')
    } finally {
      setLoadingPayouts(false)
    }
  }, [payoutStatusFilter, payoutPage, showToast])

  // Load Receipts
  const loadReceipts = useCallback(async () => {
    try {
      setLoadingReceipts(true)
      const data = await adminFinanceService.getReceipts(receiptPage, 15, receiptSearch)
      setReceipts(data.receipts || [])
      setReceiptTotalPages(data.totalPages || 1)
      setReceiptTotalRecords(data.totalRecords || 0)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi tải danh sách biên lai')
    } finally {
      setLoadingReceipts(false)
    }
  }, [receiptPage, receiptSearch, showToast])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (activeTab === 'PAYOUTS') {
      void loadPayouts()
    } else {
      void loadReceipts()
    }
  }, [activeTab, loadPayouts, loadReceipts])

  // Handle Approve Payout
  const handleApprovePayout = async () => {
    if (!selectedPayout) return
    try {
      setProcessingAction(true)
      await adminFinanceService.processPayout(selectedPayout.payoutId, {
        action: 'APPROVE',
        bankReferenceCode: bankRefCode.trim(),
        note: approveNote.trim()
      })
      showToast('success', `Đã xác nhận hoàn tất lệnh rút tiền #${selectedPayout.payoutId}`)
      setShowApproveModal(false)
      setSelectedPayout(null)
      setBankRefCode('')
      setApproveNote('')
      void loadPayouts()
      void loadOverview()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi xử lý duyệt lệnh rút')
    } finally {
      setProcessingAction(false)
    }
  }

  // Handle Reject Payout
  const handleRejectPayout = async () => {
    if (!selectedPayout) return
    if (!rejectReason.trim()) {
      showToast('error', 'Vui lòng nhập lý do từ chối yêu cầu rút tiền')
      return
    }
    try {
      setProcessingAction(true)
      await adminFinanceService.processPayout(selectedPayout.payoutId, {
        action: 'REJECT',
        rejectReason: rejectReason.trim()
      })
      showToast('success', `Đã từ chối lệnh #${selectedPayout.payoutId} và hoàn tiền vào ví Organizer`)
      setShowRejectModal(false)
      setSelectedPayout(null)
      setRejectReason('')
      void loadPayouts()
      void loadOverview()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi xử lý từ chối lệnh rút')
    } finally {
      setProcessingAction(false)
    }
  }

  // Export CSV
  const handleExportCSV = async () => {
    try {
      setExportingCSV(true)
      const blob = await adminFinanceService.exportReceiptsCSV()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `financial_receipts_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      showToast('success', 'Xuất file CSV thành công!')
    } catch (err: any) {
      showToast('error', 'Lỗi khi tải file CSV biên lai tài chính')
    } finally {
      setExportingCSV(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-black rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              ADMIN FINANCIAL CENTER
            </span>
            <span className="text-xs text-slate-400">| Quyết toán & Kế toán sàn</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
            Trung Tâm Tài Chính & Rút Tiền
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Quản trị toàn bộ hoa hồng sàn, hạn ngạch sự kiện, giải ngân và kiểm toán doanh thu vé.
          </p>
        </div>

        <button
          onClick={() => {
            void loadOverview()
            if (activeTab === 'PAYOUTS') void loadPayouts()
            else void loadReceipts()
          }}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <RefreshCw size={14} className={loadingOverview ? 'animate-spin text-orange-500' : ''} />
          <span>Làm Mới Số Liệu</span>
        </button>
      </div>

      {/* 4 Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Doanh thu hoa hồng */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 p-5 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Hoa Hồng Nền Tảng
            </span>
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {loadingOverview ? '...' : formatVND(overview?.totalCommission || 0)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Doanh thu thực thu từ phí hoa hồng bán vé toàn sàn (gross - net).
            </p>
          </div>
        </div>

        {/* Card 2: Phí hạn ngạch sự kiện Free */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 p-5 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Phí Hạn Ngạch Free
            </span>
            <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <Coins size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {loadingOverview ? '...' : formatVND(overview?.totalUsageFees || 0)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Phí thu từ các sự kiện miễn phí vượt quá 100 lượt đăng ký quota.
            </p>
          </div>
        </div>

        {/* Card 3: Số dư Escrow tạm giữ */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/20 p-5 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Tạm Giữ (Escrow Locked)
            </span>
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Lock size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {loadingOverview ? '...' : formatVND(overview?.totalEscrowLocked || 0)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tiền bán vé các sự kiện đang diễn ra, tự động giải phóng khi FINISHED.
            </p>
          </div>
        </div>

        {/* Card 4: Tổng số dư ví khả dụng của Organizer */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent border border-purple-500/20 p-5 shadow-lg shadow-purple-500/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Số Dư Khả Dụng Ví BTC
            </span>
            <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-600 dark:text-purple-400">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {loadingOverview ? '...' : formatVND(overview?.totalWalletsBalance || 0)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tổng số dư trong ví của tất cả Organizer sẵn sàng để rút tiền.
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('PAYOUTS')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'PAYOUTS'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ArrowDownToLine size={16} />
            <span>Quản Lý Yêu Cầu Rút Tiền</span>
            {payoutTotalRecords > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-orange-500/20 text-orange-600 dark:text-orange-400">
                {payoutTotalRecords}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('RECEIPTS')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'RECEIPTS'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FileSpreadsheet size={16} />
            <span>Sổ Cái Biên Lai Tài Chính (Audit)</span>
            {receiptTotalRecords > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {receiptTotalRecords}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'RECEIPTS' && (
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download size={14} className={exportingCSV ? 'animate-bounce' : ''} />
            <span>{exportingCSV ? 'Đang xuất CSV...' : 'Xuất File CSV'}</span>
          </button>
        )}
      </div>

      {/* TAB 1: PAYOUT MANAGEMENT */}
      {activeTab === 'PAYOUTS' && (
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500">Lọc theo trạng thái:</span>
              <div className="flex flex-wrap items-center gap-1.5 ml-2">
                {[
                  { key: 'ALL', label: 'Tất cả' },
                  { key: 'PENDING', label: 'Chờ duyệt' },
                  { key: 'PROCESSING', label: 'Đang xử lý' },
                  { key: 'COMPLETED', label: 'Đã chuyển tiền' },
                  { key: 'REJECTED', label: 'Đã từ chối' }
                ].map((s) => (
                  <button
                    key={s.key}
                    onClick={() => {
                      setPayoutStatusFilter(s.key)
                      setPayoutPage(1)
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      payoutStatusFilter === s.key
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-750'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs font-bold text-slate-400">
              Tổng số: <span className="text-slate-900 dark:text-white font-black">{payoutTotalRecords}</span> yêu cầu
            </div>
          </div>

          {/* Payouts Table */}
          <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Mã Lệnh</th>
                    <th className="py-3.5 px-4">Ban Tổ Chức</th>
                    <th className="py-3.5 px-4">Ngân Hàng Thụ Hưởng</th>
                    <th className="py-3.5 px-4">Số Tiền Rút</th>
                    <th className="py-3.5 px-4">Trạng Thái</th>
                    <th className="py-3.5 px-4">Thời Gian Tạo</th>
                    <th className="py-3.5 px-4 text-center">Hành Động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {loadingPayouts ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        Đang tải danh sách yêu cầu rút tiền...
                      </td>
                    </tr>
                  ) : payouts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        Không có yêu cầu rút tiền nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((p) => {
                      const isPending = p.status === 'PENDING' || p.status === 'PROCESSING'
                      return (
                        <tr key={p.payoutId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            #{p.payoutId}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{p.organizerName}</div>
                            <div className="text-[11px] text-slate-400">{p.organizerEmail}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                              <Building2 size={13} className="text-orange-500" />
                              <span>{p.bankCode}</span>
                              <span className="text-[11px] text-slate-400 font-normal">({p.bankName})</span>
                            </div>
                            <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                              {p.accountNumber}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                              <ShieldCheck size={12} />
                              <span>{p.accountHolderName}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-black text-sm text-orange-600 dark:text-orange-400">
                              {formatVND(p.amount)}
                            </span>
                            {p.note && (
                              <div className="text-[11px] text-slate-400 max-w-[200px] truncate mt-0.5" title={p.note}>
                                {p.note}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {p.status === 'COMPLETED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={12} />
                                Đã chuyển tiền
                              </span>
                            ) : p.status === 'REJECTED' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                  <XCircle size={12} />
                                  Đã từ chối
                                </span>
                                {p.rejectReason && (
                                  <div className="text-[10px] text-red-400 mt-1 max-w-[160px] truncate" title={p.rejectReason}>
                                    {p.rejectReason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Clock size={12} />
                                Chờ duyệt
                              </span>
                            )}
                            {p.processorName && (
                              <div className="text-[10px] text-slate-400 mt-1">
                                Duyệt bởi: {p.processorName}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400">
                            <div>{formatDate(p.createdAt)}</div>
                            {p.processedAt && (
                              <div className="text-[10px] text-slate-500">Xử lý: {formatDate(p.processedAt)}</div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isPending ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedPayout(p)
                                    setBankRefCode('')
                                    setApproveNote('')
                                    setShowApproveModal(true)
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm shadow-emerald-950/20 active:scale-95 transition-all cursor-pointer"
                                >
                                  Xác Nhận Đã Chuyển
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedPayout(p)
                                    setRejectReason('')
                                    setShowRejectModal(true)
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 font-bold text-xs active:scale-95 transition-all cursor-pointer"
                                >
                                  Từ Chối
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium text-[11px]">Đã kết thúc</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {payoutTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400">
                  Trang {payoutPage} / {payoutTotalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPayoutPage((prev) => Math.max(prev - 1, 1))}
                    disabled={payoutPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPayoutPage((prev) => Math.min(prev + 1, payoutTotalPages))}
                    disabled={payoutPage === payoutTotalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIAL RECEIPTS AUDIT TABLE */}
      {activeTab === 'RECEIPTS' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm theo tên sự kiện, tên BTC, mã đơn hàng..."
                value={receiptSearch}
                onChange={(e) => {
                  setReceiptSearch(e.target.value)
                  setReceiptPage(1)
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div className="text-xs font-bold text-slate-400">
              Tổng số: <span className="text-slate-900 dark:text-white font-black">{receiptTotalRecords}</span> biên lai bất biến
            </div>
          </div>

          {/* Receipts Table */}
          <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Biên Lai</th>
                    <th className="py-3.5 px-4">Sự Kiện</th>
                    <th className="py-3.5 px-4">Ban Tổ Chức</th>
                    <th className="py-3.5 px-4 text-right">Giá Vé Thu</th>
                    <th className="py-3.5 px-4 text-center">% Phí Sàn</th>
                    <th className="py-3.5 px-4 text-right">Phí Thu Sàn</th>
                    <th className="py-3.5 px-4 text-right">Net Về Ví BTC</th>
                    <th className="py-3.5 px-4">Thời Gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {loadingReceipts ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                        Đang tải dữ liệu biên lai kiểm toán...
                      </td>
                    </tr>
                  ) : receipts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                        Chưa có biên lai tài chính nào được ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    receipts.map((r) => (
                      <tr key={r.receiptId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          #{r.receiptId}
                          <div className="text-[10px] text-slate-400 font-normal">Đơn: #{r.orderId}</div>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white max-w-[200px] truncate" title={r.eventTitle}>
                          {r.eventTitle}
                          <div className="text-[10px] text-slate-400 font-normal">ID: {r.eventId}</div>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {r.organizerName}
                          <div className="text-[10px] text-slate-400 font-normal">ID: {r.organizerId}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">
                          {formatVND(r.grossAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-500">
                          {r.systemFeePercentage}% + {formatVND(r.fixedFee)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                          +{formatVND(r.commissionAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-orange-600 dark:text-orange-400">
                          {formatVND(r.netAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                          {formatDate(r.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {receiptTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400">
                  Trang {receiptPage} / {receiptTotalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setReceiptPage((prev) => Math.max(prev - 1, 1))}
                    disabled={receiptPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setReceiptPage((prev) => Math.min(prev + 1, receiptTotalPages))}
                    disabled={receiptPage === receiptTotalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {showApproveModal && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => setShowApproveModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">Xác Nhận Giải Ngân Rút Tiền</h3>
            <p className="text-xs text-slate-400 mt-1">
              Bạn đang phê duyệt chuyển khoản cho lệnh rút tiền <span className="font-bold text-orange-500">#{selectedPayout.payoutId}</span>.
            </p>

            <div className="mt-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Ban Tổ Chức:</span>
                <span className="font-black text-slate-900 dark:text-white">{selectedPayout.organizerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Ngân Hàng:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedPayout.bankCode} - {selectedPayout.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Chủ Tài Khoản:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 uppercase">{selectedPayout.accountHolderName}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                <span className="text-slate-400 font-bold">Số Tiền Thực Chuyển:</span>
                <span className="font-black text-base text-orange-600 dark:text-orange-400">{formatVND(selectedPayout.amount)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Mã Tham Chiếu / Giao Dịch Ngân Hàng:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: FT260930123456"
                  value={bankRefCode}
                  onChange={(e) => setBankRefCode(e.target.value)}
                  className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Ghi Chú Kế Toán (Tùy chọn):
                </label>
                <textarea
                  rows={2}
                  placeholder="Nhập ghi chú cho Organizer..."
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowApproveModal(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleApprovePayout}
                disabled={processingAction}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xs shadow-lg shadow-emerald-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {processingAction ? 'Đang duyệt...' : 'Đã Chuyển Tiền Thành Công'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {showRejectModal && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => setShowRejectModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-xl font-black text-red-600 dark:text-red-400">Từ Chối Lệnh Rút Tiền</h3>
            <p className="text-xs text-slate-400 mt-1">
              Hệ thống sẽ cập nhật trạng thái <span className="font-bold">REJECTED</span> và <span className="font-bold text-emerald-500">tự động hoàn lại {formatVND(selectedPayout.amount)}</span> vào ví của Organizer.
            </p>

            <div className="mt-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Lý Do Từ Chối (Bắt buộc):
              </label>
              <textarea
                rows={3}
                placeholder="Nhập lý do chi tiết để thông báo cho Ban tổ chức (ví dụ: Sai thông tin chi nhánh, tài khoản tạm khóa,...)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10 text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleRejectPayout}
                disabled={processingAction || !rejectReason.trim()}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white font-black text-xs shadow-lg shadow-red-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {processingAction ? 'Đang hoàn tiền...' : 'Xác Nhận Từ Chối & Hoàn Tiền'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
