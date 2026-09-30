import { useState, useEffect, useCallback } from 'react'
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Plus,
  RefreshCw,
  FileBarChart,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Percent,
  SlidersHorizontal,
  X
} from 'lucide-react'
import {
  organizerWalletService,
  OrganizerWallet as IOrganizerWallet,
  WalletTransaction,
  OrganizerBankAccount,
  PayoutRequest,
  TopupOrder,
  EventFinancialReport,
} from '../services/organizerWalletService'
import { useToast } from '../contexts/ToastContext'
import { emitWalletRefresh } from '../hooks/useWallet'

const POPULAR_BANKS = [
  { code: 'MB', name: 'MBBank (Ngân hàng Quân Đội)' },
  { code: 'VCB', name: 'Vietcombank (Ngoại thương VN)' },
  { code: 'TCB', name: 'Techcombank (Kỹ thương VN)' },
  { code: 'VPB', name: 'VPBank (Việt Nam Thịnh Vượng)' },
  { code: 'ACB', name: 'ACB (Á Châu)' },
  { code: 'BIDV', name: 'BIDV (Đầu tư & Phát triển VN)' },
  { code: 'CTG', name: 'VietinBank (Công thương VN)' },
  { code: 'TPB', name: 'TPBank (Tiên Phong)' },
  { code: 'STB', name: 'Sacombank (Sài Gòn Thương Tín)' },
  { code: 'HDB', name: 'HDBank (Phát triển TP.HCM)' },
  { code: 'VIB', name: 'VIB (Quốc tế VN)' },
]

export default function OrganizerWalletPage() {
  const { showToast } = useToast()

  // Data states
  const [wallet, setWallet] = useState<IOrganizerWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'BANKS' | 'PAYOUTS' | 'REPORTS'>('LEDGER')

  // Ledger state
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1)
  const [ledgerTotalRecords, setLedgerTotalRecords] = useState(0)
  const [ledgerFilterType, setLedgerFilterType] = useState('')
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<OrganizerBankAccount[]>([])
  const [bankLoading, setBankLoading] = useState(false)

  // Payouts state
  const [payouts, setPayouts] = useState<PayoutRequest[]>([])
  const [payoutPage, setPayoutPage] = useState(1)
  const [payoutTotalRecords, setPayoutTotalRecords] = useState(0)
  const [payoutLoading, setPayoutLoading] = useState(false)

  // Financial report state
  const [reportEventIdInput, setReportEventIdInput] = useState('')
  const [report, setReport] = useState<EventFinancialReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [settling, setSettling] = useState(false)

  // Modals state
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [topupAmount, setTopupAmount] = useState<number>(100000)
  const [topupOrder, setTopupOrder] = useState<TopupOrder | null>(null)
  const [topupSubmitting, setTopupSubmitting] = useState(false)
  const [copiedContent, setCopiedContent] = useState(false)
  const [copiedAccNum, setCopiedAccNum] = useState(false)

  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState<number>(50000)
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [payoutNote, setPayoutNote] = useState('')
  const [payoutSubmitting, setPayoutSubmitting] = useState(false)

  const [showBankModal, setShowBankModal] = useState(false)
  const [bankForm, setBankForm] = useState({
    bankCode: 'MB',
    bankName: 'MBBank',
    accountNumber: '',
    accountHolderName: '',
    isDefault: true,
  })
  const [bankSubmitting, setBankSubmitting] = useState(false)

  // Load wallet overview
  const loadWallet = useCallback(async () => {
    try {
      setLoading(true)
      const data = await organizerWalletService.getWallet()
      setWallet(data)
      emitWalletRefresh()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Không thể tải dữ liệu ví')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  // Load transactions
  const loadTransactions = useCallback(async () => {
    try {
      setLedgerLoading(true)
      const data = await organizerWalletService.getTransactions(ledgerPage, 15, ledgerFilterType)
      setTransactions(data.transactions)
      setLedgerTotalPages(data.totalPages)
      setLedgerTotalRecords(data.totalRecords)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLedgerLoading(false)
    }
  }, [ledgerPage, ledgerFilterType])

  // Load bank accounts
  const loadBankAccounts = useCallback(async () => {
    try {
      setBankLoading(true)
      const data = await organizerWalletService.getBankAccounts()
      setBankAccounts(data)
      if (data.length > 0 && !selectedBankId) {
        const defaultAcc = data.find((a) => a.isDefault) || data[0]
        setSelectedBankId(defaultAcc.accountId)
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setBankLoading(false)
    }
  }, [selectedBankId])

  // Load payouts
  const loadPayouts = useCallback(async () => {
    try {
      setPayoutLoading(true)
      const data = await organizerWalletService.getPayouts(payoutPage, 15)
      setPayouts(data.payouts)
      setPayoutTotalRecords(data.totalRecords)
    } catch (err: any) {
      console.error(err)
    } finally {
      setPayoutLoading(false)
    }
  }, [payoutPage])

  useEffect(() => {
    void loadWallet()
    void loadBankAccounts()
  }, [loadWallet, loadBankAccounts])

  useEffect(() => {
    if (activeTab === 'LEDGER') {
      void loadTransactions()
    } else if (activeTab === 'BANKS') {
      void loadBankAccounts()
    } else if (activeTab === 'PAYOUTS') {
      void loadPayouts()
    }
  }, [activeTab, loadTransactions, loadBankAccounts, loadPayouts])

  const formatVND = (val?: number) => {
    if (val === undefined || val === null) return '0 ₫'
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
  }

  // Handle Top-up
  const handleInitiateTopup = async () => {
    if (!topupAmount || topupAmount < 10000) {
      showToast('error', 'Số tiền nạp tối thiểu là 10.000 ₫')
      return
    }
    try {
      setTopupSubmitting(true)
      const order = await organizerWalletService.topup(topupAmount)
      setTopupOrder(order)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi khởi tạo nạp tiền')
    } finally {
      setTopupSubmitting(false)
    }
  }

  // Handle Payout Submission
  const handleSubmitPayout = async () => {
    if (!selectedBankId) {
      showToast('error', 'Vui lòng chọn tài khoản ngân hàng thụ hưởng')
      return
    }
    if (!payoutAmount || payoutAmount < 50000) {
      showToast('error', 'Số tiền rút tối thiểu là 50.000 ₫')
      return
    }
    if (wallet && payoutAmount > wallet.availableBalance) {
      showToast('error', 'Số dư khả dụng không đủ')
      return
    }
    try {
      setPayoutSubmitting(true)
      await organizerWalletService.requestPayout({
        bankAccountId: selectedBankId,
        amount: payoutAmount,
        note: payoutNote,
      })
      showToast('success', 'Tạo yêu cầu rút tiền thành công!')
      setShowPayoutModal(false)
      setPayoutNote('')
      void loadWallet()
      void loadPayouts()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi tạo yêu cầu rút tiền')
    } finally {
      setPayoutSubmitting(false)
    }
  }

  // Handle Add Bank
  const handleAddBank = async () => {
    if (!bankForm.accountNumber.trim() || !bankForm.accountHolderName.trim()) {
      showToast('error', 'Vui lòng điền đầy đủ số tài khoản và tên chủ tài khoản')
      return
    }
    try {
      setBankSubmitting(true)
      await organizerWalletService.addBankAccount({
        ...bankForm,
        accountHolderName: bankForm.accountHolderName.toUpperCase(),
      })
      showToast('success', 'Thêm tài khoản ngân hàng thành công!')
      setShowBankModal(false)
      setBankForm({
        bankCode: 'MB',
        bankName: 'MBBank',
        accountNumber: '',
        accountHolderName: '',
        isDefault: true,
      })
      void loadBankAccounts()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi thêm tài khoản ngân hàng')
    } finally {
      setBankSubmitting(false)
    }
  }

  // Load Financial Report
  const handleLoadFinancialReport = async (evId?: number) => {
    const id = evId || Number(reportEventIdInput)
    if (!id || isNaN(id)) {
      showToast('error', 'Vui lòng nhập mã sự kiện (Event ID) hợp lệ')
      return
    }
    try {
      setReportLoading(true)
      const data = await organizerWalletService.getEventFinancialReport(id)
      setReport(data)
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Không thể tải báo cáo sự kiện')
    } finally {
      setReportLoading(false)
    }
  }

  // Settle Event
  const handleSettleEvent = async (eventId: number) => {
    try {
      setSettling(true)
      const res = await organizerWalletService.settleEvent(eventId)
      showToast('success', res.message || 'Quyết toán sự kiện thành công!')
      void handleLoadFinancialReport(eventId)
      void loadWallet()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err.message || 'Lỗi khi quyết toán')
    } finally {
      setSettling(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-xl shadow-orange-950/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-wider mb-3">
              <Percent size={14} /> Settlement & Escrow Engine
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Ví & Doanh Thu Ban Tổ Chức</h1>
            <p className="text-white/80 text-sm mt-1 max-w-xl">
              Quản lý số dư bán vé, trích phí nền tảng tự động, nạp tiền trả trước hạn ngạch sự kiện miễn phí và quyết toán an toàn về tài khoản ngân hàng.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setTopupOrder(null)
                setShowTopupModal(true)
              }}
              className="px-5 py-3 rounded-2xl bg-white text-orange-600 hover:bg-orange-50 font-black text-sm shadow-lg shadow-black/10 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus size={18} /> Nạp Tiền Ví
            </button>
            <button
              onClick={() => setShowPayoutModal(true)}
              className="px-5 py-3 rounded-2xl bg-orange-950/40 hover:bg-orange-950/60 border border-white/20 text-white font-black text-sm shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <ArrowUpRight size={18} /> Rút Tiền
            </button>
            <button
              onClick={() => {
                void loadWallet()
                if (activeTab === 'LEDGER') void loadTransactions()
              }}
              title="Làm mới"
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Available Balance */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Số Dư Khả Dụng (Available)
            </span>
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatVND(wallet?.availableBalance)}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Dùng để rút về tài khoản ngân hàng hoặc thanh toán hạn ngạch tự động cho người thứ 101+ của sự kiện miễn phí.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Sẵn sàng giao dịch</span>
            <span className="text-slate-400">VND</span>
          </div>
        </div>

        {/* Card 2: Pending Balance */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Doanh Thu Tạm Giữ (Pending Escrow)
            </span>
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatVND(wallet?.pendingBalance)}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Doanh thu thực nhận sau hoa hồng sàn từ vé đang bán, tự động chuyển thành khả dụng khi sự kiện kết thúc.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-600 dark:text-amber-400">Mở khóa khi FINISHED</span>
            <span className="text-slate-400">Bảo đảm an toàn</span>
          </div>
        </div>

        {/* Card 3: Lifetime Earnings */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng Doanh Thu Tích Lũy
            </span>
            <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CreditCard size={20} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatVND(wallet?.lifetimeEarnings)}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Tổng giá trị doanh thu thuần từ bán vé mà bạn đã gặt hái được xuyên suốt mọi sự kiện trên hệ thống FEMS.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-600 dark:text-blue-400">Hiệu suất tài chính</span>
            <span className="text-slate-400">Đã kiểm toán</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'LEDGER'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Sổ Cái Biến Động Số Dư
        </button>
        <button
          onClick={() => setActiveTab('BANKS')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'BANKS'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Tài Khoản Ngân Hàng ({bankAccounts.length})
        </button>
        <button
          onClick={() => setActiveTab('PAYOUTS')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'PAYOUTS'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Yêu Cầu Rút Tiền
        </button>
        <button
          onClick={() => setActiveTab('REPORTS')}
          className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'REPORTS'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Báo Cáo Tài Chính Sự Kiện
        </button>
      </div>

      {/* TAB 1: LEDGER */}
      {activeTab === 'LEDGER' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <SlidersHorizontal size={16} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Lọc loại giao dịch:</span>
              <select
                value={ledgerFilterType}
                onChange={(e) => {
                  setLedgerFilterType(e.target.value)
                  setLedgerPage(1)
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="">Tất cả loại giao dịch</option>
                <option value="TOPUP">Nạp tiền (TOPUP)</option>
                <option value="TICKET_SALE">Doanh thu bán vé (TICKET_SALE)</option>
                <option value="EVENT_PAYOUT_RELEASE">Giải phóng quyết toán (EVENT_PAYOUT_RELEASE)</option>
                <option value="USAGE_FEE">Phí hạn ngạch 100 vé (USAGE_FEE)</option>
                <option value="WITHDRAWAL">Rút tiền (WITHDRAWAL)</option>
              </select>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
              Tổng số: {ledgerTotalRecords} bản ghi
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-4 px-6">Mã GD</th>
                  <th className="py-4 px-6">Loại</th>
                  <th className="py-4 px-6">Biến động</th>
                  <th className="py-4 px-6">Số dư trước/sau</th>
                  <th className="py-4 px-6">Mô tả</th>
                  <th className="py-4 px-6">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Đang tải lịch sử giao dịch...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Chưa có giao dịch nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isCredit = ['TOPUP', 'EVENT_PAYOUT_RELEASE', 'CREDIT'].includes(tx.type)
                    return (
                      <tr key={tx.transactionID} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">#{tx.transactionID}</td>
                        <td className="py-4 px-6">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                              tx.type === 'TOPUP'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : tx.type === 'TICKET_SALE'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                : tx.type === 'EVENT_PAYOUT_RELEASE'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : tx.type === 'USAGE_FEE'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className={`py-4 px-6 font-bold ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isCredit ? '+' : '-'}{formatVND(tx.amount)}
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-500 font-mono">
                          {formatVND(tx.balanceBefore)} → {formatVND(tx.balanceAfter)}
                        </td>
                        <td className="py-4 px-6 text-xs max-w-xs truncate" title={tx.description || ''}>
                          {tx.description || '-'}
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-400 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {ledgerTotalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <span className="text-xs text-slate-500">
                Trang {ledgerPage} / {ledgerTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={ledgerPage <= 1}
                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={ledgerPage >= ledgerTotalPages}
                  onClick={() => setLedgerPage((p) => p + 1)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BANK ACCOUNTS */}
      {activeTab === 'BANKS' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Tài Khoản Ngân Hàng Thụ Hưởng</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Các tài khoản ngân hàng liên kết để nhận doanh thu rút từ hệ thống.
              </p>
            </div>
            <button
              onClick={() => setShowBankModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs shadow-md shadow-orange-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} /> Thêm Tài Khoản
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bankLoading ? (
              <div className="col-span-full py-12 text-center text-slate-400">Đang tải tài khoản ngân hàng...</div>
            ) : bankAccounts.length === 0 ? (
              <div className="col-span-full p-8 text-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                <Building2 size={36} className="mx-auto text-slate-400 mb-3" />
                <p className="font-bold text-slate-700 dark:text-slate-300">Chưa liên kết tài khoản ngân hàng nào</p>
                <p className="text-xs text-slate-400 mt-1">Bấm nút "Thêm Tài Khoản" để bắt đầu nhận doanh thu rút tiền.</p>
              </div>
            ) : (
              bankAccounts.map((acc) => (
                <div
                  key={acc.accountId}
                  className="relative rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black text-sm">
                        {acc.bankCode}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white">{acc.bankName}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{acc.bankCode}</span>
                      </div>
                    </div>
                    {acc.isDefault && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/20">
                        Mặc định
                      </span>
                    )}
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số tài khoản</span>
                    <div className="text-lg font-black tracking-wider text-slate-800 dark:text-slate-200 mt-0.5">
                      {acc.accountNumber}
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chủ tài khoản</span>
                    <div className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 mt-0.5">
                      {acc.accountHolderName}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PAYOUTS */}
      {activeTab === 'PAYOUTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Lịch Sử Rút Tiền Về Ngân Hàng</h3>
              <p className="text-xs text-slate-400">Các yêu cầu rút tiền từ số dư khả dụng sang tài khoản thụ hưởng.</p>
            </div>
            <button
              onClick={() => setShowPayoutModal(true)}
              className="px-4 py-2 rounded-xl bg-orange-500 text-white font-bold text-xs shadow-sm hover:bg-orange-600 cursor-pointer"
            >
              Tạo Lệnh Rút
            </button>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-4 px-6">Mã Lệnh</th>
                  <th className="py-4 px-6">Ngân Hàng Nhận</th>
                  <th className="py-4 px-6">Số Tiền Rút</th>
                  <th className="py-4 px-6">Trạng Thái</th>
                  <th className="py-4 px-6">Ghi Chú</th>
                  <th className="py-4 px-6">Ngày Tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payoutLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">Đang tải lịch sử rút tiền...</td>
                  </tr>
                ) : payouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">Chưa có yêu cầu rút tiền nào.</td>
                  </tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p.payoutId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-4 px-6 font-mono text-xs text-slate-500">#{p.payoutId}</td>
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 dark:text-white">{p.bankCode} - {p.accountNumber}</div>
                        <div className="text-xs text-slate-400 uppercase">{p.accountHolderName}</div>
                      </td>
                      <td className="py-4 px-6 font-black text-rose-600 dark:text-rose-400">
                        {formatVND(p.amount)}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                            p.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : p.status === 'PROCESSING'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : p.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500 max-w-xs truncate">
                        {p.note || p.rejectReason || '-'}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: FINANCIAL REPORTS */}
      {activeTab === 'REPORTS' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <h3 className="text-base font-black text-slate-900 dark:text-white mb-2">Tra Cứu Báo Cáo Tài Chính Sự Kiện</h3>
            <p className="text-xs text-slate-400 mb-4">
              Nhập mã định danh sự kiện (Event ID) để xem chi tiết doanh thu, biểu phí hoa hồng sàn và quyết toán.
            </p>
            <div className="flex items-center gap-3 max-w-md">
              <input
                type="number"
                placeholder="Nhập Event ID (ví dụ: 12)"
                value={reportEventIdInput}
                onChange={(e) => setReportEventIdInput(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
              />
              <button
                onClick={() => handleLoadFinancialReport()}
                disabled={reportLoading}
                className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-md shadow-orange-500/20 cursor-pointer disabled:opacity-50"
              >
                {reportLoading ? 'Đang tải...' : 'Xem Báo Cáo'}
              </button>
            </div>
          </div>

          {report && (
            <div className="space-y-6 animate-fade-in">
              {/* Event Header Card */}
              <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-xs font-bold">
                      ID: #{report.eventId}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-xs uppercase">
                      {report.orgType === 'SCHOOL' ? 'On-Campus (Trường)' : 'Off-Campus (Tự tổ chức)'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase">
                      {report.status}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white">{report.title}</h2>
                </div>
                <div>
                  {report.isSettled ? (
                    <div className="px-4 py-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-xs uppercase border border-emerald-500/20 flex items-center gap-2">
                      <CheckCircle2 size={16} /> Đã Quyết Toán Vào Số Dư
                    </div>
                  ) : report.status === 'FINISHED' ? (
                    <button
                      onClick={() => handleSettleEvent(report.eventId)}
                      disabled={settling}
                      className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-950/20 hover:from-emerald-500 hover:to-teal-400 cursor-pointer active:scale-95 transition-all"
                    >
                      {settling ? 'Đang quyết toán...' : 'Quyết Toán Ngay Về Số Dư Khả Dụng'}
                    </button>
                  ) : (
                    <div className="px-4 py-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-500/20">
                      Đang Tạm Giữ Escrow (Chờ FINISHED)
                    </div>
                  )}
                </div>
              </div>

              {/* KPI Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vé Đã Bán</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{report.totalTicketsSold} vé</div>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Doanh Thu Gộp</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{formatVND(report.grossRevenue)}</div>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hoa Hồng Sàn</span>
                  <div className="text-xl font-black text-rose-500 mt-1">{formatVND(report.totalCommissionFee)}</div>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Doanh Thu Thuần</span>
                  <div className="text-xl font-black text-emerald-500 mt-1">{formatVND(report.netRevenue)}</div>
                </div>
              </div>

              {/* Ticket Classes Table */}
              <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-6">Hạng Vé</th>
                      <th className="py-4 px-6">Đơn Giá</th>
                      <th className="py-4 px-6">Số Lượng Bán</th>
                      <th className="py-4 px-6">Doanh Thu Gộp</th>
                      <th className="py-4 px-6">Phí Nền Tảng</th>
                      <th className="py-4 px-6">Thực Nhận (Net)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.ticketClasses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">Không có dữ liệu hạng vé.</td>
                      </tr>
                    ) : (
                      report.ticketClasses.map((tc) => (
                        <tr key={tc.categoryTicketID} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{tc.name}</td>
                          <td className="py-4 px-6 font-mono text-xs">{formatVND(tc.price)}</td>
                          <td className="py-4 px-6 font-semibold">{tc.quantitySold}</td>
                          <td className="py-4 px-6 font-semibold">{formatVND(tc.grossRevenue)}</td>
                          <td className="py-4 px-6 font-semibold text-rose-500">{formatVND(tc.commissionFee)}</td>
                          <td className="py-4 px-6 font-black text-emerald-600 dark:text-emerald-400">
                            {formatVND(tc.netRevenue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOPUP MODAL */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => setShowTopupModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            {!topupOrder ? (
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Nạp Tiền Ví Organizer</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Nạp số dư khả dụng trả trước để duy trì mở đăng ký cho sự kiện miễn phí (từ người thứ 101 trở đi).
                </p>

                {/* Quick amounts */}
                <div className="mt-6">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chọn nhanh số tiền:</label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[50000, 100000, 200000, 500000, 1000000, 2000000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopupAmount(amt)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          topupAmount === amt
                            ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                            : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {formatVND(amt)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom amount */}
                <div className="mt-4">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hoặc nhập số tiền tùy ý:</label>
                  <input
                    type="number"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(Number(e.target.value))}
                    min={10000}
                    step={10000}
                    className="w-full mt-2 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-base text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  onClick={handleInitiateTopup}
                  disabled={topupSubmitting}
                  className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black text-sm shadow-lg shadow-orange-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {topupSubmitting ? 'Đang tạo mã thanh toán...' : 'Tiếp Tục Tạo Mã VietQR'}
                </button>
              </div>
            ) : (
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Quét Mã VietQR Để Nạp Tiền</h3>
                <p className="text-xs text-slate-400 mt-1">Hệ thống tự động cộng tiền vào ví ngay khi nhận chuyển khoản.</p>

                {/* QR Code image */}
                <div className="mt-4 flex justify-center">
                  <div className="p-3 rounded-2xl bg-white shadow-md border border-slate-100">
                    <img src={topupOrder.qrCodeUrl} alt="VietQR" className="w-56 h-56 object-contain" />
                  </div>
                </div>

                {/* Transfer Info */}
                <div className="mt-4 space-y-2.5 text-left bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Ngân hàng:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{topupOrder.bankCode}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Số tài khoản:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                      <span>{topupOrder.accountNumber}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(topupOrder.accountNumber)
                          setCopiedAccNum(true)
                          setTimeout(() => setCopiedAccNum(false), 2000)
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                      >
                        {copiedAccNum ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Chủ tài khoản:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">{topupOrder.accountName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Số tiền:</span>
                    <span className="font-black text-rose-500 text-sm">{formatVND(topupOrder.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-slate-400 font-bold">Nội dung chuyển khoản:</span>
                    <div className="flex items-center gap-1.5 font-mono font-black text-orange-600 dark:text-orange-400">
                      <span>{topupOrder.transferContent}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(topupOrder.transferContent)
                          setCopiedContent(true)
                          setTimeout(() => setCopiedContent(false), 2000)
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                      >
                        {copiedContent ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Clock size={14} className="animate-spin text-orange-500" /> Đang chờ ngân hàng xác nhận giao dịch...
                </div>

                <button
                  onClick={() => {
                    setShowTopupModal(false)
                    void loadWallet()
                  }}
                  className="w-full mt-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Đóng Cửa Sổ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAYOUT MODAL */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => setShowPayoutModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">Rút Tiền Về Ngân Hàng</h3>
            <p className="text-xs text-slate-400 mt-1">Khấu trừ trực tiếp số dư khả dụng và giải ngân về tài khoản đã liên kết.</p>

            {/* Select bank account */}
            <div className="mt-6">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tài khoản nhận tiền:</label>
              {bankAccounts.length === 0 ? (
                <div className="mt-2 p-4 rounded-2xl border border-dashed border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 text-xs text-rose-600">
                  Bạn chưa có tài khoản ngân hàng nào. Vui lòng bấm vào tab "Tài Khoản Ngân Hàng" để thêm trước.
                </div>
              ) : (
                <select
                  value={selectedBankId || ''}
                  onChange={(e) => setSelectedBankId(Number(e.target.value))}
                  className="w-full mt-2 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200"
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.accountId} value={acc.accountId}>
                      {acc.bankCode} - {acc.accountNumber} ({acc.accountHolderName})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Amount */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Số tiền rút:</label>
                <button
                  type="button"
                  onClick={() => setPayoutAmount(wallet?.availableBalance || 0)}
                  className="text-xs font-bold text-orange-500 hover:underline cursor-pointer"
                >
                  Rút tất cả ({formatVND(wallet?.availableBalance)})
                </button>
              </div>
              <input
                type="number"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(Number(e.target.value))}
                min={50000}
                step={10000}
                className="w-full mt-2 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-base text-slate-900 dark:text-white"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Tối thiểu: 50.000 ₫</span>
            </div>

            {/* Note */}
            <div className="mt-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ghi chú (Tùy chọn):</label>
              <input
                type="text"
                placeholder="Ví dụ: Rút doanh thu vé sự kiện tháng 9"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                className="w-full mt-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
              />
            </div>

            <button
              onClick={handleSubmitPayout}
              disabled={payoutSubmitting || bankAccounts.length === 0}
              className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black text-sm shadow-lg shadow-orange-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {payoutSubmitting ? 'Đang gửi yêu cầu...' : 'Xác Nhận Rút Tiền'}
            </button>
          </div>
        </div>
      )}

      {/* ADD BANK MODAL */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => setShowBankModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">Thêm Tài Khoản Ngân Hàng</h3>
            <p className="text-xs text-slate-400 mt-1">Liên kết tài khoản ngân hàng chính chủ để nhận tiền rút.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ngân hàng:</label>
                <select
                  value={bankForm.bankCode}
                  onChange={(e) => {
                    const found = POPULAR_BANKS.find((b) => b.code === e.target.value)
                    setBankForm({
                      ...bankForm,
                      bankCode: e.target.value,
                      bankName: found?.name || e.target.value,
                    })
                  }}
                  className="w-full mt-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  {POPULAR_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Số tài khoản:</label>
                <input
                  type="text"
                  placeholder="Nhập số tài khoản ngân hàng"
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value.trim() })}
                  className="w-full mt-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tên chủ tài khoản (viết hoa không dấu):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: NGUYEN VAN A"
                  value={bankForm.accountHolderName}
                  onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value.toUpperCase() })}
                  className="w-full mt-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-sm uppercase text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="defaultBankCheck"
                  checked={bankForm.isDefault}
                  onChange={(e) => setBankForm({ ...bankForm, isDefault: e.target.checked })}
                  className="rounded text-orange-500"
                />
                <label htmlFor="defaultBankCheck" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Đặt làm tài khoản nhận tiền mặc định
                </label>
              </div>
            </div>

            <button
              onClick={handleAddBank}
              disabled={bankSubmitting}
              className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black text-sm shadow-lg shadow-orange-950/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {bankSubmitting ? 'Đang lưu tài khoản...' : 'Lưu Tài Khoản Ngân Hàng'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
