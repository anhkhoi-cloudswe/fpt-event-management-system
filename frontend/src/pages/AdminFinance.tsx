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
  FileSpreadsheet,
  Crown,
  PieChart as PieChartIcon,
  Sliders,
  Calendar,
  BarChart3,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { NumericInput } from '../components/common/NumericInput'
import {
  adminFinanceService,
  AdminFinanceOverview,
  AdminPayoutItem,
  AdminReceiptItem,
  AdminSubscriptionAnalyticsResponse
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
  const [activeTab, setActiveTab] = useState<'PAYOUTS' | 'RECEIPTS' | 'SUBSCRIPTIONS'>('SUBSCRIPTIONS')

  // Overview State
  const [overview, setOverview] = useState<AdminFinanceOverview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)

  // Subscriptions Analytics State
  const [subAnalytics, setSubAnalytics] = useState<AdminSubscriptionAnalyticsResponse | null>(null)
  const [loadingSubAnalytics, setLoadingSubAnalytics] = useState(true)
  const [subSearch, setSubSearch] = useState('')
  const [subTierFilter, setSubTierFilter] = useState('ALL')
  const [subStatusFilter, setSubStatusFilter] = useState('ALL')

  // Timeline Filter & Custom Date Range State
  const [timelinePreset, setTimelinePreset] = useState<'ALL' | '7D' | '30D' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM'>('ALL')
  const [timelineStartDate, setTimelineStartDate] = useState<string>('')
  const [timelineEndDate, setTimelineEndDate] = useState<string>('')
  const [timelineGroupBy, setTimelineGroupBy] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY')

  // Tier Configuration & CRUD State
  const [tiersList, setTiersList] = useState<any[]>([])
  const [loadingTiers, setLoadingTiers] = useState(false)
  const [selectedTierForEdit, setSelectedTierForEdit] = useState<any | null>(null)
  const [showEditTierModal, setShowEditTierModal] = useState(false)
  const [editPriceVnd, setEditPriceVnd] = useState<number>(0)
  const [editCommissionPercent, setEditCommissionPercent] = useState<number>(2.5)
  const [editMaxCapacity, setEditMaxCapacity] = useState<number>(-1)
  const [editHasReports, setEditHasReports] = useState<boolean>(true)
  const [editIsActive, setEditIsActive] = useState<boolean>(true)
  const [editReason, setEditReason] = useState<string>('')
  const [savingTier, setSavingTier] = useState(false)

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

  // Load Overview KPIs
  const loadOverview = useCallback(async () => {
    if (user?.role !== 'ADMIN') return
    try {
      setLoadingOverview(true)
      const data = await adminFinanceService.getOverview()
      setOverview(data)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi tải chỉ số tài chính')
    } finally {
      setLoadingOverview(false)
    }
  }, [user?.role, showToast])

  // Load Tiers configuration for CRUD
  const loadTiers = useCallback(async () => {
    if (user?.role !== 'ADMIN') return
    try {
      setLoadingTiers(true)
      const data = await adminFinanceService.getSubscriptionTiers()
      setTiersList(data || [])
    } catch (err: any) {
      console.error('Lỗi tải danh sách cấu hình gói:', err)
    } finally {
      setLoadingTiers(false)
    }
  }, [user?.role])

  // Load Subscription Analytics
  const loadSubscriptionAnalytics = useCallback(async () => {
    if (user?.role !== 'ADMIN') return
    try {
      setLoadingSubAnalytics(true)
      const data = await adminFinanceService.getSubscriptionAnalytics()
      setSubAnalytics(data)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi tải dữ liệu gói subscription')
    } finally {
      setLoadingSubAnalytics(false)
    }
  }, [user?.role, showToast])

  // Load Payouts
  const loadPayouts = useCallback(async () => {
    if (user?.role !== 'ADMIN') return
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
  }, [user?.role, payoutStatusFilter, payoutPage, showToast])

  // Load Receipts
  const loadReceipts = useCallback(async () => {
    if (user?.role !== 'ADMIN') return
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
  }, [user?.role, receiptPage, receiptSearch, showToast])

  useEffect(() => {
    void loadOverview()
    // Polling overview KPIs định kỳ 10 giây
    const iv = setInterval(() => {
      void loadOverview()
    }, 10000)
    return () => clearInterval(iv)
  }, [loadOverview])

  useEffect(() => {
    if (activeTab === 'PAYOUTS') {
      void loadPayouts()
    } else if (activeTab === 'RECEIPTS') {
      void loadReceipts()
    } else if (activeTab === 'SUBSCRIPTIONS') {
      void loadSubscriptionAnalytics()
      void loadTiers()
    }

    // Auto-refresh real-time theo tab mỗi 10s (recharts tự động chạy smooth animation chuyển số/cột/donut)
    const timer = setInterval(() => {
      if (activeTab === 'SUBSCRIPTIONS') {
        void loadSubscriptionAnalytics()
      } else if (activeTab === 'PAYOUTS') {
        void loadPayouts()
      } else if (activeTab === 'RECEIPTS') {
        void loadReceipts()
      }
    }, 10000)

    return () => clearInterval(timer)
  }, [activeTab, loadPayouts, loadReceipts, loadSubscriptionAnalytics, loadTiers])

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

  // Open Edit Tier Modal
  const handleOpenEditTier = (tier: any) => {
    setSelectedTierForEdit(tier)
    setEditPriceVnd(tier.priceVnd || 0)
    setEditCommissionPercent((tier.commissionBps || 0) / 100)
    setEditMaxCapacity(tier.maxCapacityLimit ?? -1)
    setEditHasReports(tier.hasAdvancedReports ?? false)
    setEditIsActive(tier.isActive ?? true)
    setEditReason('')
    setShowEditTierModal(true)
  }

  // Save Tier Update
  const handleSaveTier = async () => {
    if (!selectedTierForEdit) return

    try {
      setSavingTier(true)
      const commissionBps = Math.round(editCommissionPercent * 100)
      const res = await adminFinanceService.updateSubscriptionTier({
        tierId: selectedTierForEdit.tierId,
        priceVnd: selectedTierForEdit.tierCode === 'FREE' ? 0 : editPriceVnd,
        commissionBps,
        maxCapacityLimit: editMaxCapacity,
        hasAdvancedReports: editHasReports,
        isActive: selectedTierForEdit.tierCode === 'FREE' ? true : editIsActive,
        reason: editReason.trim() || 'Cập nhật bởi Admin'
      })
      showToast('success', res.message || `Cập nhật cấu hình gói ${selectedTierForEdit.name} thành công!`)
      setShowEditTierModal(false)
      setSelectedTierForEdit(null)
      void loadTiers()
      void loadSubscriptionAnalytics()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi cập nhật gói dịch vụ')
    } finally {
      setSavingTier(false)
    }
  }

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
            onClick={() => setActiveTab('SUBSCRIPTIONS')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'SUBSCRIPTIONS'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Crown size={16} className="text-amber-500" />
            <span>Phân Tích Gói Dịch Vụ (Subscriptions)</span>
            {subAnalytics && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                {subAnalytics.totalActivePackages} đang dùng
              </span>
            )}
          </button>

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

      {/* TAB: SUBSCRIPTION ANALYTICS (DÀNH RIÊNG ADMIN) */}
      {activeTab === 'SUBSCRIPTIONS' && (
        <div className="space-y-6">
          {/* 4 KPI Cards for Subscriptions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/15 via-orange-500/5 to-transparent border border-amber-500/30 p-5 shadow-lg shadow-amber-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  Tổng Doanh Thu Gói
                </span>
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <DollarSign size={20} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {loadingSubAnalytics ? '...' : formatVND(subAnalytics?.totalRevenueVnd || 0)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Doanh thu thu trực tiếp từ các gói Pro, Business,...
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-transparent border border-emerald-500/30 p-5 shadow-lg shadow-emerald-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Gói Đang Hoạt Động
                </span>
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={20} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {loadingSubAnalytics ? '...' : `${subAnalytics?.totalActivePackages || 0} gói`}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Số lượng BTC đang có gói bản quyền hợp lệ.
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/15 via-indigo-500/5 to-transparent border border-blue-500/30 p-5 shadow-lg shadow-blue-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Tổng Lượt Mua Gói
                </span>
                <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Crown size={20} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {loadingSubAnalytics ? '...' : `${subAnalytics?.totalSubscribers || 0} lượt`}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Bao gồm tất cả các giao dịch đăng ký & nâng cấp.
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500/15 via-red-500/5 to-transparent border border-rose-500/30 p-5 shadow-lg shadow-rose-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  Gói Đã Hết Hạn
                </span>
                <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
                  <Clock size={20} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {loadingSubAnalytics ? '...' : `${subAnalytics?.totalExpiredPackages || 0} gói`}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Đã tự động quay về gói FREE khi hết hạn.
                </p>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Tỷ trọng & Số lượng gói đã mua (Pie Chart) */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <PieChartIcon size={16} className="text-orange-500" />
                    Cơ Cấu Gói Đã Mua
                  </h3>
                  <span className="text-[11px] font-bold text-slate-400">Theo phân hạng</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Tỷ lệ số lượng mua giữa các gói dịch vụ</p>
              </div>

              <div className="h-64 my-2 flex items-center justify-center">
                {loadingSubAnalytics ? (
                  <div className="text-xs text-slate-400">Đang tải đồ thị...</div>
                ) : !subAnalytics?.tierBreakdown || subAnalytics.tierBreakdown.length === 0 || subAnalytics.tierBreakdown.every(t => t.totalBought === 0) ? (
                  <div className="text-xs text-slate-400">Chưa có dữ liệu giao dịch mua gói</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subAnalytics.tierBreakdown.filter(t => t.totalBought > 0)}
                        dataKey="totalBought"
                        nameKey="tierName"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                      >
                        {subAnalytics.tierBreakdown.filter(t => t.totalBought > 0).map((entry) => {
                          const tierColors: Record<string, string> = {
                            FREE: '#3b82f6',
                            PRO: '#f59e0b',
                            BUSINESS: '#10b981',
                            ENTERPRISE: '#8b5cf6',
                            CUSTOM: '#ec4899'
                          }
                          return <Cell key={`cell-${entry.tierCode}`} fill={tierColors[entry.tierCode] || '#f59e0b'} />
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any, item: any) => [
                          `${val} lượt mua (${formatVND(item.payload.totalRevenue)})`,
                          `${name}`
                        ]}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-slate-900/95 text-white p-3 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-md text-xs space-y-1">
                                <div className="font-extrabold text-orange-400 flex items-center justify-between gap-3">
                                  <span>{data.tierName}</span>
                                  <span className="text-white bg-slate-800 px-2 py-0.5 rounded-md text-[10px]">{data.tierCode}</span>
                                </div>
                                <div className="text-slate-300">
                                  Số lượt mua: <span className="font-bold text-white">{data.totalBought} lượt</span>
                                </div>
                                <div className="text-slate-300">
                                  Doanh thu: <span className="font-bold text-emerald-400">{formatVND(data.totalRevenue)}</span>
                                </div>
                                <div className="text-slate-300">
                                  Đang kích hoạt: <span className="font-bold text-blue-400">{data.activeUsers} tài khoản</span>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                {subAnalytics?.tierBreakdown
                  .filter((t) => t.tierCode !== 'FREE' || t.totalBought > 0 || t.totalRevenue > 0)
                  .map((t) => {
                  const borderColors: Record<string, string> = {
                    FREE: 'border-l-blue-500',
                    PRO: 'border-l-amber-500',
                    BUSINESS: 'border-l-emerald-500',
                    ENTERPRISE: 'border-l-purple-500',
                    CUSTOM: 'border-l-pink-500'
                  }
                  return (
                    <div key={t.tierCode} className={`p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs border-l-4 ${borderColors[t.tierCode] || 'border-l-orange-500'}`}>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                        <span>{t.tierName}</span>
                        <span className="text-orange-500 font-black">{t.totalBought}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Doanh thu: <span className="font-bold text-emerald-500">{formatVND(t.totalRevenue)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Chart 2: Doanh Thu & Số Gói Bán Theo Gói (Bar Chart) & Timeline (Area Chart) với Đa dạng Bộ Lọc Thời Gian */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl flex flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp size={16} className="text-emerald-500" />
                      Doanh Thu & Xu Hướng Mua Gói
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Biểu đồ doanh thu đăng ký/nâng cấp gói qua PayOS & Ví</p>
                  </div>

                  {/* Group By: Ngày / Tháng / Năm */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                    <button
                      onClick={() => setTimelineGroupBy('DAY')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        timelineGroupBy === 'DAY'
                          ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      Theo Ngày
                    </button>
                    <button
                      onClick={() => setTimelineGroupBy('MONTH')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        timelineGroupBy === 'MONTH'
                          ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      Theo Tháng
                    </button>
                    <button
                      onClick={() => setTimelineGroupBy('YEAR')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        timelineGroupBy === 'YEAR'
                          ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      Theo Năm
                    </button>
                  </div>
                </div>

                {/* Filter Presets & Custom Date Range Toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1 text-slate-400 font-bold mr-1">
                    <Calendar size={13} />
                    <span>Bộ lọc:</span>
                  </div>

                  {[
                    { id: 'ALL', label: 'Tất cả' },
                    { id: '7D', label: '7 ngày qua' },
                    { id: '30D', label: '30 ngày qua' },
                    { id: 'THIS_MONTH', label: 'Tháng này' },
                    { id: 'LAST_MONTH', label: 'Tháng trước' },
                    { id: 'THIS_YEAR', label: 'Năm nay' },
                    { id: 'CUSTOM', label: 'Tùy chọn...' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setTimelinePreset(preset.id as any)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer border ${
                        timelinePreset === preset.id
                          ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}

                  {/* Custom Date Inputs */}
                  {timelinePreset === 'CUSTOM' && (
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 mt-1 sm:mt-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">Từ:</span>
                        <input
                          type="date"
                          value={timelineStartDate}
                          onChange={(e) => setTimelineStartDate(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">Đến:</span>
                        <input
                          type="date"
                          value={timelineEndDate}
                          onChange={(e) => setTimelineEndDate(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chart Rendering with dynamic dataset */}
              {(() => {
                // Filter and aggregate timeline data based on selected preset & groupBy
                const rawTimeline = subAnalytics?.timeline || []
                const now = new Date()

                const filteredTimeline = rawTimeline.filter((pt) => {
                  if (timelinePreset === 'ALL') return true
                  const ptDate = new Date(pt.date)

                  if (timelinePreset === '7D') {
                    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                    return ptDate >= d7
                  }
                  if (timelinePreset === '30D') {
                    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                    return ptDate >= d30
                  }
                  if (timelinePreset === 'THIS_MONTH') {
                    return ptDate.getFullYear() === now.getFullYear() && ptDate.getMonth() === now.getMonth()
                  }
                  if (timelinePreset === 'LAST_MONTH') {
                    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
                    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
                    return ptDate.getFullYear() === lastMonthYear && ptDate.getMonth() === lastMonth
                  }
                  if (timelinePreset === 'THIS_YEAR') {
                    return ptDate.getFullYear() === now.getFullYear()
                  }
                  if (timelinePreset === 'CUSTOM') {
                    if (timelineStartDate && pt.date < timelineStartDate) return false
                    if (timelineEndDate && pt.date > timelineEndDate) return false
                    return true
                  }
                  return true
                })

                // Aggregation by groupBy
                let displayTimeline: { date: string; totalRevenue: number; totalCount: number }[] = []
                if (timelineGroupBy === 'DAY') {
                  displayTimeline = filteredTimeline
                } else if (timelineGroupBy === 'MONTH') {
                  const mapByMonth: Record<string, { totalRevenue: number; totalCount: number }> = {}
                  filteredTimeline.forEach((pt) => {
                    const monthKey = pt.date.substring(0, 7) // 'YYYY-MM'
                    if (!mapByMonth[monthKey]) {
                      mapByMonth[monthKey] = { totalRevenue: 0, totalCount: 0 }
                    }
                    mapByMonth[monthKey].totalRevenue += pt.totalRevenue
                    mapByMonth[monthKey].totalCount += pt.totalCount
                  })
                  displayTimeline = Object.keys(mapByMonth)
                    .sort()
                    .map((m) => ({ date: m, ...mapByMonth[m] }))
                } else if (timelineGroupBy === 'YEAR') {
                  const mapByYear: Record<string, { totalRevenue: number; totalCount: number }> = {}
                  filteredTimeline.forEach((pt) => {
                    const yearKey = pt.date.substring(0, 4) // 'YYYY'
                    if (!mapByYear[yearKey]) {
                      mapByYear[yearKey] = { totalRevenue: 0, totalCount: 0 }
                    }
                    mapByYear[yearKey].totalRevenue += pt.totalRevenue
                    mapByYear[yearKey].totalCount += pt.totalCount
                  })
                  displayTimeline = Object.keys(mapByYear)
                    .sort()
                    .map((y) => ({ date: y, ...mapByYear[y] }))
                }

                const totalRevInPeriod = displayTimeline.reduce((acc, curr) => acc + curr.totalRevenue, 0)
                const totalCountInPeriod = displayTimeline.reduce((acc, curr) => acc + curr.totalCount, 0)

                return (
                  <>
                    <div className="h-64 my-2">
                      {loadingSubAnalytics ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">Đang tải đồ thị...</div>
                      ) : displayTimeline.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
                          <BarChart3 size={32} className="text-slate-300 dark:text-slate-700 mb-2 opacity-50" />
                          <span>Không tìm thấy giao dịch nào trong khoảng thời gian đã chọn</span>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={displayTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorSubRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                            <XAxis
                              dataKey="date"
                              stroke="#94a3b8"
                              fontSize={11}
                              tickFormatter={(val) => {
                                if (timelineGroupBy === 'MONTH') {
                                  const [y, m] = val.split('-')
                                  return `T${m}/${y}`
                                }
                                return val
                              }}
                            />
                            <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${(v / 1000).toLocaleString('vi-VN')}k`} />
                            <Tooltip
                              formatter={(val: any) => [formatVND(Number(val)), 'Doanh thu']}
                              labelFormatter={(label) => {
                                if (timelineGroupBy === 'MONTH') {
                                  const [y, m] = label.split('-')
                                  return `Tháng ${m} / ${y}`
                                }
                                if (timelineGroupBy === 'YEAR') return `Năm ${label}`
                                return `Ngày: ${label}`
                              }}
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '12px',
                                fontSize: '12px',
                                color: '#fff'
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="totalRevenue"
                              stroke="#f59e0b"
                              strokeWidth={2.5}
                              fillOpacity={1}
                              fill="url(#colorSubRev)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div className="text-slate-400">
                        Tổng lượt đăng ký trong chu kỳ lọc:{' '}
                        <span className="font-bold text-slate-900 dark:text-white">
                          {totalCountInPeriod} lượt
                        </span>
                      </div>
                      <div className="text-slate-400">
                        Doanh thu chu kỳ lọc:{' '}
                        <span className="font-black text-amber-500">
                          {formatVND(totalRevInPeriod)}
                        </span>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {/* Tier Configurations (CRUD Gói Dịch Vụ) */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={16} className="text-orange-500" />
                  Cấu Hình Biểu Phí & Quyền Lợi Gói Dịch Vụ (Tier CRUD)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Quản trị viên có thể điều chỉnh giá bán, % hoa hồng sàn, sức chứa và kích hoạt/vô hiệu hóa các gói.
                </p>
              </div>
              <button
                onClick={() => void loadTiers()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <RefreshCw size={12} className={loadingTiers ? 'animate-spin' : ''} />
                Làm mới
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {tiersList.map((tier) => {
                const isFree = tier.tierCode === 'FREE'
                const isPro = tier.tierCode === 'PRO'
                const isBiz = tier.tierCode === 'BUSINESS'

                return (
                  <div
                    key={tier.tierId || tier.tierCode}
                    className={`relative rounded-3xl border p-5 flex flex-col justify-between transition-all ${
                      isBiz
                        ? 'bg-purple-500/5 border-purple-500/30'
                        : isPro
                        ? 'bg-amber-500/5 border-amber-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border ${
                            isBiz
                              ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/40'
                              : isPro
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {tier.tierCode}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tier.isActive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          }`}
                        >
                          {tier.isActive ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
                        </span>
                      </div>

                      <h4 className="text-base font-black text-slate-900 dark:text-white mt-3">{tier.name}</h4>
                      <div className="text-xl font-black text-orange-600 dark:text-orange-400 mt-1">
                        {isFree ? '0 đ / vĩnh viễn' : `${formatVND(tier.priceVnd)} / tháng`}
                      </div>

                      <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex items-center justify-between py-1 border-b border-slate-200/50 dark:border-slate-700/50">
                          <span className="text-slate-400">Hoa hồng sàn:</span>
                          <span className="font-black text-slate-900 dark:text-white">
                            {(tier.commissionBps / 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-200/50 dark:border-slate-700/50">
                          <span className="text-slate-400">Sức chứa sự kiện:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {tier.maxCapacityLimit === -1 ? 'Không giới hạn' : `Tối đa ${tier.maxCapacityLimit} người`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-200/50 dark:border-slate-700/50">
                          <span className="text-slate-400">Báo cáo nâng cao:</span>
                          <span className={`font-bold ${tier.hasAdvancedReports ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {tier.hasAdvancedReports ? 'Có hỗ trợ' : 'Không'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                      <button
                        onClick={() => handleOpenEditTier(tier)}
                        className="w-full py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-950/20 active:scale-95 transition-all cursor-pointer"
                      >
                        Chỉnh Sửa Cấu Hình Gói
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Subscribers Table: Ai Mua Gói Nào & Chi Tiết */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800">
              <div className="flex flex-1 items-center gap-3 max-w-lg">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên Ban tổ chức, Email, mã gói..."
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>

                {/* Tier Filter */}
                <select
                  value={subTierFilter}
                  onChange={(e) => setSubTierFilter(e.target.value)}
                  className="px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <option value="ALL">Tất cả gói</option>
                  <option value="PRO">Gói PRO</option>
                  <option value="BUSINESS">Gói BUSINESS</option>
                  <option value="FREE">Gói FREE</option>
                </select>

                {/* Status Filter */}
                <select
                  value={subStatusFilter}
                  onChange={(e) => setSubStatusFilter(e.target.value)}
                  className="px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">ACTIVE (Đang dùng)</option>
                  <option value="EXPIRED">EXPIRED (Hết hạn)</option>
                  <option value="CANCELLED">CANCELLED (Đã huỷ)</option>
                </select>
              </div>

              <div className="text-xs font-bold text-slate-400">
                Hiển thị:{' '}
                <span className="text-slate-900 dark:text-white font-black">
                  {(subAnalytics?.subscribers || [])
                    .filter((s) => {
                      const matchSearch =
                        !subSearch ||
                        s.fullName.toLowerCase().includes(subSearch.toLowerCase()) ||
                        s.email.toLowerCase().includes(subSearch.toLowerCase()) ||
                        s.tierCode.toLowerCase().includes(subSearch.toLowerCase())
                      const matchTier = subTierFilter === 'ALL' || s.tierCode === subTierFilter
                      const matchStatus = subStatusFilter === 'ALL' || s.status === subStatusFilter
                      return matchSearch && matchTier && matchStatus
                    }).length}
                </span>{' '}
                bản ghi
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Mã Đơn / ID</th>
                      <th className="py-3.5 px-4">Ban Tổ Chức (Người Mua)</th>
                      <th className="py-3.5 px-4">Gói Dịch Vụ</th>
                      <th className="py-3.5 px-4 text-right">Số Tiền Đã Trả</th>
                      <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                      <th className="py-3.5 px-4">Thời Gian Hiệu Lực</th>
                      <th className="py-3.5 px-4">Ngày Đăng Ký</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {loadingSubAnalytics ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                          Đang tải danh sách người mua gói...
                        </td>
                      </tr>
                    ) : !subAnalytics?.subscribers || subAnalytics.subscribers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                          Chưa có dữ liệu người mua gói subscription nào.
                        </td>
                      </tr>
                    ) : (
                      subAnalytics.subscribers
                        .filter((s) => {
                          const matchSearch =
                            !subSearch ||
                            s.fullName.toLowerCase().includes(subSearch.toLowerCase()) ||
                            s.email.toLowerCase().includes(subSearch.toLowerCase()) ||
                            s.tierCode.toLowerCase().includes(subSearch.toLowerCase())
                          const matchTier = subTierFilter === 'ALL' || s.tierCode === subTierFilter
                          const matchStatus = subStatusFilter === 'ALL' || s.status === subStatusFilter
                          return matchSearch && matchTier && matchStatus
                        })
                        .map((s) => {
                          const isCurrentlyActive = s.status === 'ACTIVE' && new Date(s.endDate).getTime() > Date.now()
                          return (
                            <tr key={s.subscriptionId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                #{s.subscriptionId}
                                <div className="text-[10px] text-slate-400 font-normal">User ID: {s.userId || (s as any).userID}</div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 dark:text-white">{s.fullName}</div>
                                <div className="text-[11px] text-slate-400">{s.email}</div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                                    s.tierCode === 'BUSINESS'
                                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                                      : s.tierCode === 'PRO'
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                      : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'
                                  }`}
                                >
                                  <Crown size={12} />
                                  {s.tierName}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">
                                {formatVND(s.amountPaidVnd ?? (s as any).amountPaidVND ?? 0)}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    isCurrentlyActive
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  {isCurrentlyActive ? 'ACTIVE' : s.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                                <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                  {formatDate(s.startDate)} → {formatDate(s.endDate)}
                                </div>
                                {s.autoRenew && (
                                  <div className="text-[10px] text-emerald-500 font-bold">Tự động gia hạn</div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                                {formatDate(s.startDate || s.createdAt)}
                              </td>
                            </tr>
                          )
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

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
      {/* EDIT TIER MODAL (CRUD GÓI DỊCH VỤ ADMIN) */}
      {showEditTierModal && selectedTierForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => setShowEditTierModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                {selectedTierForEdit.tierCode}
              </span>
              <span className="text-xs text-slate-400">Cấu hình tham số gói</span>
            </div>

            <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
              Chỉnh Sửa Gói: {selectedTierForEdit.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Thay đổi sẽ áp dụng ngay cho các giao dịch đăng ký/gia hạn mới. Mọi cập nhật được lưu vào Fee Audit Log.
            </p>

            <div className="mt-5 space-y-4 text-xs">
              {/* Giá Gói */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Giá Gói (VNĐ / Tháng):
                </label>
                <NumericInput
                  disabled={selectedTierForEdit.tierCode === 'FREE'}
                  value={selectedTierForEdit.tierCode === 'FREE' ? 0 : editPriceVnd}
                  onChange={(val) => setEditPriceVnd(val)}
                  placeholder="299,000"
                  className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white disabled:opacity-50 focus:outline-none focus:border-orange-500"
                />
                {selectedTierForEdit.tierCode === 'FREE' && (
                  <p className="text-[11px] text-amber-500 mt-1">Gói FREE mặc định luôn có giá 0 đ.</p>
                )}
              </div>

              {/* % Hoa hồng sàn & Sức chứa sự kiện */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Phí Hoa Hồng Sàn (%):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={editCommissionPercent}
                    onChange={(e) => setEditCommissionPercent(Number(e.target.value))}
                    className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">= {Math.round(editCommissionPercent * 100)} bps</p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Giới Hạn Sức Chứa:
                  </label>
                  <NumericInput
                    value={editMaxCapacity}
                    onChange={(val) => setEditMaxCapacity(val)}
                    placeholder="-1: Không giới hạn"
                    className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">-1 là không giới hạn người</p>
                </div>
              </div>

              {/* Toggle Báo cáo nâng cao & Trạng thái bật/tắt */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editHasReports}
                    onChange={(e) => setEditHasReports(e.target.checked)}
                    className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    Báo Cáo Nâng Cao
                  </span>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={selectedTierForEdit.tierCode === 'FREE'}
                    checked={selectedTierForEdit.tierCode === 'FREE' ? true : editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    {selectedTierForEdit.tierCode === 'FREE' ? 'Luôn Bật (FREE)' : 'Kích Hoạt Gói'}
                  </span>
                </label>
              </div>

              {/* Live Preview Quyền Lợi Hiển Thị Cho Organizer */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  <span>Xem trước quyền lợi (Phía Organizer):</span>
                  <span className="text-[10px] uppercase font-black tracking-wider text-amber-600">Tự động cập nhật</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>
                      Sức chứa sự kiện: {editMaxCapacity === -1 ? 'Không giới hạn quy mô' : `Tối đa ${editMaxCapacity.toLocaleString('vi-VN')} người/sự kiện`}
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>
                      {editCommissionPercent === 0
                        ? '0% hoa hồng nền tảng (*áp dụng phí cố định/vé)'
                        : `Phí hoa hồng nền tảng: ${editCommissionPercent.toString().replace('.', ',')}%`}
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>
                      {editHasReports ? 'Báo cáo & Phân tích tài chính nâng cao' : 'Báo cáo sự kiện cơ bản'}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Ghi chú điều chỉnh (Tùy chọn) */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  Ghi chú điều chỉnh: <span className="text-slate-400 font-normal">(Không bắt buộc)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Nhập ghi chú điều chỉnh (nếu có)..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowEditTierModal(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleSaveTier}
                disabled={savingTier || !editReason.trim()}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black text-xs shadow-lg shadow-orange-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {savingTier ? 'Đang lưu...' : 'Lưu Thay Đổi Gói'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
