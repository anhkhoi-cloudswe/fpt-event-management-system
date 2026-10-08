import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Sparkles,
  Check,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  X,
  Copy,
  ShieldCheck,
  AlertCircle,
  Wallet
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  subscriptionService,
  SubscriptionTier,
  CurrentSubscription,
} from '../services/subscriptionService'
import { organizerWalletService, TopupOrder } from '../services/organizerWalletService'
import { useWallet, emitWalletRefresh } from '../hooks/useWallet'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Bảng ánh xạ mã ngân hàng (BIN) của payOS sang tên ngân hàng chuẩn
const BANK_NAME_MAP: Record<string, string> = {
  '970422': 'MBBank (Ngân hàng Quân Đội)',
  '970436': 'Vietcombank',
  '970407': 'Techcombank',
  '970415': 'VietinBank',
  '970418': 'BIDV',
  '970432': 'VPBank',
  '970416': 'ACB',
  '970458': 'TPBank',
  '970403': 'Sacombank',
  '970437': 'HDBank',
  'MB': 'MBBank (Ngân hàng Quân Đội)',
  'VCB': 'Vietcombank',
  'TCB': 'Techcombank',
}

export default function OrganizerSubscriptionPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const { balance } = useWallet()

  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null)
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Direct PayOS / SePay Gateway Payment Flow
  const [paymentModalTier, setPaymentModalTier] = useState<SubscriptionTier | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<TopupOrder | null>(null)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [copiedContent, setCopiedContent] = useState(false)
  const [copiedAccNum, setCopiedAccNum] = useState(false)
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)

  // Downgrade Modal State
  const [selectedTierForDowngrade, setSelectedTierForDowngrade] = useState<SubscriptionTier | null>(null)
  const [downgradeSubmitting, setDowngradeSubmitting] = useState(false)
  const [downgradeError, setDowngradeError] = useState<string | null>(null)

  // Wallet Confirmation Modal State
  const [walletConfirmTier, setWalletConfirmTier] = useState<SubscriptionTier | null>(null)
  const [walletPaySubmitting, setWalletPaySubmitting] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const handledReturnRef = useRef(false)

  // Load all initial data
  const fetchData = useCallback(async () => {
    if (user?.role === 'ADMIN') return
    setLoading(true)
    setError(null)
    try {
      const [tiersRes, subRes] = await Promise.all([
        subscriptionService.getTiers(),
        subscriptionService.getCurrentSubscription(),
      ])
      setTiers(tiersRes)
      setCurrentSub(subRes)
    } catch (err: any) {
      console.error('Failed to load subscription data:', err)
      const errorMsg = err?.response?.data?.message || err?.message || 'Không thể tải dữ liệu gói dịch vụ. Vui lòng thử lại sau.'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [user?.role])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Tự động kiểm tra và kích hoạt gói khi quay về từ cổng thanh toán PayOS
  useEffect(() => {
    const statusParam = searchParams.get('status')
    const billIdParam = searchParams.get('billId')
    const tierCodeParam = searchParams.get('tierCode')

    if (statusParam === 'topup_success' && !handledReturnRef.current) {
      handledReturnRef.current = true
      // Xóa query params khỏi URL để tránh trigger lặp
      setSearchParams({}, { replace: true })

      const processReturnActivation = async () => {
        try {
          if (billIdParam) {
            try {
              await organizerWalletService.checkTopupStatus(Number(billIdParam))
            } catch (e) {
              // Tiếp tục kích hoạt
            }
          }

          if (tierCodeParam) {
            const subRes = await subscriptionService.subscribeOrUpgrade({
              tierCode: tierCodeParam,
              requestId: generateUUID(),
              autoRenew: true,
            })
            showToast('success', subRes.message || `Thanh toán thành công! Gói dịch vụ đã được kích hoạt.`)
          } else {
            showToast('success', 'Nạp tiền vào ví thành công!')
          }
          emitWalletRefresh()
          fetchData()
        } catch (err: any) {
          console.error('Auto activation error:', err)
          showToast('info', 'Thanh toán đã ghi nhận. Vui lòng nhấn Nâng cấp để áp dụng gói.')
          emitWalletRefresh()
          fetchData()
        }
      }

      processReturnActivation()
    } else if (statusParam === 'topup_cancel' && !handledReturnRef.current) {
      handledReturnRef.current = true
      setSearchParams({}, { replace: true })
      showToast('info', 'Bạn đã hủy phiên thanh toán.')
    }
  }, [searchParams, setSearchParams, showToast, fetchData])

  // Calculate Prorated Credit and Net Pay if upgrading mid-cycle
  const calculateUpgradeCost = (targetTier: SubscriptionTier) => {
    if (!currentSub || currentSub.tierCode === 'FREE' || currentSub.tierCode === 'SCHOOL_ORGANIZER') {
      return {
        originalPrice: targetTier.priceVnd,
        proratedCredit: 0,
        netPay: targetTier.priceVnd,
      }
    }

    const currentTierData = tiers.find((t) => t.tierCode === currentSub.tierCode)
    const currentPrice = currentTierData?.priceVnd || 0

    let daysRemaining = currentSub.daysRemaining
    if (currentSub.endDate) {
      const msDiff = new Date(currentSub.endDate).getTime() - Date.now()
      if (msDiff > 0) {
        daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24))
      } else {
        daysRemaining = 0
      }
    }

    if (daysRemaining > 0 && currentPrice > 0) {
      const credit = Math.floor((currentPrice * daysRemaining) / 30)
      const net = Math.max(0, targetTier.priceVnd - credit)
      return {
        originalPrice: targetTier.priceVnd,
        proratedCredit: credit,
        netPay: net,
      }
    }

    return {
      originalPrice: targetTier.priceVnd,
      proratedCredit: 0,
      netPay: targetTier.priceVnd,
    }
  }

  // Handle direct payment initiation with PayOS / SePay
  const handleInitiateDirectPayment = async (tier: SubscriptionTier) => {
    const { netPay } = calculateUpgradeCost(tier)

    // Nếu số dư ví hiện tại đủ thanh toán luôn -> Mở Modal Xác Nhận Thanh Toán Ví
    if (balance >= netPay && netPay > 0) {
      setWalletConfirmTier(tier)
      return
    }

    setPaymentModalTier(tier)
    setPaymentError(null)

    // Nếu số dư ví chưa đủ hoặc thanh toán trực tiếp qua PayOS QR
    const amountNeeded = netPay > balance ? netPay - balance : netPay
    setPaymentSubmitting(true)
    try {
      const order = await organizerWalletService.topup(amountNeeded, tier.tierCode, 'SUBSCRIPTION')
      setPaymentOrder(order)
    } catch (err: any) {
      setPaymentError(err?.response?.data?.message || err?.message || 'Lỗi khởi tạo cổng thanh toán payOS')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // Handle actual wallet payment execution after user confirms in modal
  const handleConfirmWalletPayment = async () => {
    if (!walletConfirmTier || walletPaySubmitting) return
    setWalletPaySubmitting(true)
    try {
      const res = await subscriptionService.subscribeOrUpgrade({
        tierCode: walletConfirmTier.tierCode,
        requestId: generateUUID(),
        autoRenew: true,
      })
      showToast('success', res.message || `Nâng cấp lên ${walletConfirmTier.name} thành công!`)
      emitWalletRefresh()
      setWalletConfirmTier(null)
      fetchData()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi xử lý thanh toán ví.'
      showToast('error', msg)
    } finally {
      setWalletPaySubmitting(false)
    }
  }

  // Polling / Checking for Payment Completion
  const handleCheckPaymentStatus = async () => {
    if (!paymentModalTier || !paymentOrder) return
    setIsCheckingPayment(true)
    try {
      // 1. Kiểm tra trạng thái hóa đơn thanh toán
      try {
        await organizerWalletService.checkTopupStatus(paymentOrder.orderId)
      } catch (e) {
        // Ignored if gateway check fails, proceed to check balance
      }

      // 2. Kiểm tra số dư ví hiện tại
      const walletRes = await organizerWalletService.getOverview()
      const { netPay } = calculateUpgradeCost(paymentModalTier)
      if (walletRes.availableBalance >= netPay) {
        // Tự động kích hoạt gói khi tiền đã vào ví
        const subRes = await subscriptionService.subscribeOrUpgrade({
          tierCode: paymentModalTier.tierCode,
          requestId: generateUUID(),
          autoRenew: true,
        })
        showToast('success', subRes.message || `Kích hoạt gói ${paymentModalTier.name} thành công!`)
        emitWalletRefresh()
        setPaymentModalTier(null)
        setPaymentOrder(null)
        fetchData()
      } else {
        showToast('info', 'Hệ thống đang chờ ngân hàng ghi nhận giao dịch. Vui lòng thử lại sau vài giây.')
      }
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Chưa nhận được giao dịch.')
    } finally {
      setIsCheckingPayment(false)
    }
  }

  // Tự động Polling kiểm tra trạng thái thanh toán định kỳ khi mở Modal thanh toán PayOS
  useEffect(() => {
    if (!paymentOrder || !paymentModalTier) return

    const intervalId = window.setInterval(async () => {
      try {
        const statusRes = await organizerWalletService.checkTopupStatus(paymentOrder.orderId)
        if (statusRes.status === 'PAID') {
          // Kích hoạt ngay
          const subRes = await subscriptionService.subscribeOrUpgrade({
            tierCode: paymentModalTier.tierCode,
            requestId: generateUUID(),
            autoRenew: true,
          })
          showToast('success', subRes.message || `Kích hoạt gói ${paymentModalTier.name} thành công!`)
          emitWalletRefresh()
          setPaymentModalTier(null)
          setPaymentOrder(null)
          fetchData()
        }
      } catch (err) {
        // im lặng chờ lần poll tiếp theo
      }
    }, 3000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [paymentOrder, paymentModalTier, fetchData])

  // Open Downgrade Modal
  const handleOpenDowngradeModal = (tier: SubscriptionTier) => {
    setSelectedTierForDowngrade(tier)
    setDowngradeError(null)
  }

  // Submit Downgrade
  const handleConfirmDowngrade = async () => {
    if (!selectedTierForDowngrade || downgradeSubmitting) return

    setDowngradeSubmitting(true)
    setDowngradeError(null)

    try {
      const res = await subscriptionService.scheduleDowngrade(selectedTierForDowngrade.tierCode)
      showToast('success', res.message || 'Đã đặt lịch hạ cấp gói thành công')
      setSelectedTierForDowngrade(null)
      fetchData()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Hạ cấp gói thất bại.'
      setDowngradeError(msg)
    } finally {
      setDowngradeSubmitting(false)
    }
  }

  // Danh sách quyền lợi hoàn toàn động theo cấu hình DB / Admin CRUD
  const getTierFeatures = (tier: SubscriptionTier) => {
    const features: string[] = []

    // 1. Sức chứa sự kiện (Capacity)
    if (tier.maxCapacityLimit === -1 || tier.maxCapacityLimit >= 1000000) {
      features.push('Sức chứa sự kiện: Không giới hạn quy mô')
    } else {
      features.push(`Sức chứa tối đa: ${tier.maxCapacityLimit.toLocaleString('vi-VN')} người/sự kiện`)
    }

    // 2. Hoa hồng nền tảng (Commission)
    if (tier.commissionBps === 0) {
      features.push('0% hoa hồng sàn (*áp dụng phí dịch vụ cố định/vé)')
    } else {
      const percent = (tier.commissionBps / 100).toString().replace('.', ',')
      features.push(`Phí hoa hồng nền tảng: ${percent}%`)
    }

    // 3. Quyền báo cáo & phân tích (Reports)
    if (tier.hasAdvancedReports) {
      features.push('Báo cáo & Phân tích tài chính nâng cao')
    } else {
      features.push('Báo cáo sự kiện cơ bản')
    }

    // 4. Quyền Google Analytics 4 (GA4) - Chỉ hiển thị cho gói PRO và BUSINESS
    if (tier.tierCode === 'BUSINESS') {
      features.push('Google Analytics 4 Toàn Diện + Real-time Users')
    } else if (tier.tierCode === 'PRO' || tier.hasAdvancedReports) {
      features.push('Google Analytics 4 (Traffic, Thiết bị, Nguồn)')
    }

    // 5. Phí cố định nếu có
    if (tier.fixedFeePerTicket && tier.fixedFeePerTicket > 0) {
      features.push(`Phí cố định: ${tier.fixedFeePerTicket.toLocaleString('vi-VN')}đ/vé`)
    }

    return features
  }

  const isCurrentActiveTier = (tierCode: string) => {
    return currentSub?.tierCode === tierCode
  }

  const isUpgrade = (tier: SubscriptionTier) => {
    const order = { FREE: 0, PRO: 1, BUSINESS: 2 }
    const currentOrder = order[(currentSub?.tierCode || 'FREE') as keyof typeof order] ?? 0
    const targetOrder = order[tier.tierCode as keyof typeof order] ?? 0
    return targetOrder > currentOrder
  }

  const isDowngrade = (tier: SubscriptionTier) => {
    const order = { FREE: 0, PRO: 1, BUSINESS: 2 }
    const currentOrder = order[(currentSub?.tierCode || 'FREE') as keyof typeof order] ?? 0
    const targetOrder = order[tier.tierCode as keyof typeof order] ?? 0
    return targetOrder < currentOrder
  }

  const isSchoolOrganizer = currentSub?.feeSource === 'ROLE' || currentSub?.tierCode === 'SCHOOL_ORGANIZER'
  const isExpired = currentSub?.status === 'EXPIRED' || (currentSub?.tierCode !== 'FREE' && !isSchoolOrganizer && currentSub?.daysRemaining !== undefined && currentSub.daysRemaining <= 0)

  // Format bank display
  const getDisplayBankName = (bankCode?: string) => {
    if (!bankCode) return 'MBBank'
    return BANK_NAME_MAP[bankCode] || bankCode
  }

  // Chặn Admin truy cập trang mua gói cá nhân (Admin không cần mua gói)
  if (user?.role === 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mb-4">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">Dành Riêng Cho Ban Tổ Chức (Organizer)</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md">
          Tài khoản Quản trị viên (ADMIN) đã có toàn quyền hệ thống và không cần đăng ký gói dịch vụ. Bạn có thể quản lý và cấu hình các gói tại Trung tâm Tài chính Admin.
        </p>
        <button
          onClick={() => navigate('/dashboard/admin/finance')}
          className="mt-6 px-6 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-lg shadow-orange-950/20 active:scale-95 transition-all cursor-pointer"
        >
          Đến Trung Tâm Tài Chính & Quản Lý Gói
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 px-1">
      {/* ── Top Header with Current Tier Badge on Top Right ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-orange-500" />
            Gói Dịch Vụ Tổ Chức (Subscription)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Mở rộng quy mô sự kiện, tối ưu hoa hồng bán vé và mở khóa phân tích tài chính nâng cao
          </p>
        </div>

        {/* Top Right Current Tier Badge */}
        {currentSub && (
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl px-4 py-2 shadow-xs shrink-0 self-start sm:self-auto">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Gói hiện tại:
              </span>
              <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded-lg bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30">
                {currentSub.tierCode}
              </span>
            </div>
            {currentSub.status === 'ACTIVE' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold pl-1 border-l border-slate-200 dark:border-slate-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Đang hoạt động
              </span>
            )}
            {isExpired && (
              <span className="text-xs font-bold text-red-600 dark:text-red-400 pl-1 border-l border-slate-200 dark:border-slate-800">
                Đã hết hạn
              </span>
            )}

            {/* Auto Renew Toggle */}
            {currentSub.tierCode !== 'FREE' && currentSub.status === 'ACTIVE' && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tự động gia hạn</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const nextVal = !currentSub.autoRenew
                      await subscriptionService.setAutoRenew(nextVal)
                      showToast('success', `Cấu hình tự động gia hạn đã ${nextVal ? 'bật' : 'tắt'} thành công.`)
                      fetchData()
                    } catch (err: any) {
                      showToast('error', err?.response?.data?.message || 'Không thể cập nhật cấu hình tự động gia hạn.')
                    }
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    currentSub.autoRenew ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      currentSub.autoRenew ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status Alerts Banners (if any) ── */}
      {isSchoolOrganizer && (
        <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 p-3 text-sky-800 dark:text-sky-200 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <p className="text-xs">
            <strong className="font-bold text-sky-950 dark:text-sky-100">School Organizer:</strong> Không giới hạn sức chứa, hoa hồng ưu đãi 2.5%, mở khóa toàn bộ báo cáo nâng cao vĩnh viễn.
          </p>
        </div>
      )}

      {isExpired && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 p-3 text-red-800 dark:text-red-200 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-xs">
            <strong className="font-bold text-red-950 dark:text-red-100">Gói dịch vụ đã hết hạn:</strong> Tài khoản đang áp dụng quyền lợi gói Free mặc định (tối đa 100 người). Vui lòng gia hạn hoặc nâng cấp gói.
          </p>
        </div>
      )}

      {/* ── Pricing Cards Grid: Fits in 1 Screen (No extra scroll) ── */}
      <div>
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
            <p className="text-xs font-medium">Đang tải danh sách gói dịch vụ...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/30 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-red-500 mx-auto" />
            <p className="text-xs text-red-600 dark:text-red-300 font-medium">{error}</p>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 items-stretch pt-2">
            {tiers.map((tier) => {
              const isCurrent = isCurrentActiveTier(tier.tierCode)
              const isScheduled = currentSub?.scheduledDowngradeTierCode === tier.tierCode
              const canUpgrade = isUpgrade(tier)
              const canDowngrade = isDowngrade(tier)
              const features = getTierFeatures(tier)
              const isPro = tier.tierCode === 'PRO'
              const isFree = tier.tierCode === 'FREE'

              // Formatting exact price string with floating 'đ' on the right
              const formattedNumber = tier.priceVnd.toLocaleString('vi-VN')

              return (
                <div
                  key={tier.tierCode}
                  className={`relative rounded-3xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-300 ${
                    isPro
                      ? 'bg-white dark:bg-slate-900 border-2 border-blue-500 shadow-xl shadow-blue-500/10'
                      : isCurrent
                        ? 'bg-white dark:bg-slate-900 border-2 border-orange-500 shadow-lg shadow-orange-500/10'
                        : 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                  }`}
                >
                  {/* Recommended Badge */}
                  {isPro && (
                    <div className="absolute -top-3.5 right-6 px-3 py-0.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider rounded-full shadow-md">
                      RECOMMENDED
                    </div>
                  )}
                  {isCurrent && !isPro && (
                    <div className="absolute -top-3.5 right-6 px-3 py-0.5 bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider rounded-full shadow-md">
                      HIỆN TẠI
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Header: Tier Code & Title */}
                    <div>
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {tier.tierCode}
                      </span>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                        {tier.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[34px] leading-relaxed line-clamp-2">
                        {tier.description || 'Gói giải pháp tối ưu cho ban tổ chức sự kiện'}
                      </p>
                    </div>

                    {/* Exact Price Tag with superscript floating 'đ' like Image 2 */}
                    <div className="pt-1">
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                          {formattedNumber}
                        </span>
                        <span className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-200 -translate-y-2">
                          đ
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                          / month
                        </span>
                      </div>
                    </div>

                    {/* Pill Action Button */}
                    <div className="pt-1">
                      {isCurrent ? (
                        <button
                          disabled
                          className="w-full py-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-xs font-bold cursor-not-allowed"
                        >
                          Gói Hiện Tại
                        </button>
                      ) : isScheduled ? (
                        <button
                          disabled
                          className="w-full py-2.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold cursor-not-allowed"
                        >
                          Đã Đặt Lịch Chuyển Gói
                        </button>
                      ) : canDowngrade ? (
                        <button
                          onClick={() => handleOpenDowngradeModal(tier)}
                          className="w-full py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                        >
                          {isFree ? 'Hạ về gói Free' : 'Hạ Cấp Gói'}
                        </button>
                      ) : isPro ? (
                        <button
                          onClick={() => handleInitiateDirectPayment(tier)}
                          className="w-full py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition active:scale-[0.98] cursor-pointer"
                        >
                          {canUpgrade ? 'Nâng cấp lên Pro' : 'Đăng Ký Pro'}
                        </button>
                      ) : canUpgrade ? (
                        <button
                          onClick={() => handleInitiateDirectPayment(tier)}
                          className="w-full py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition active:scale-[0.98] cursor-pointer"
                        >
                          Nâng Cấp Gói
                        </button>
                      ) : (
                        <button
                          onClick={() => handleInitiateDirectPayment(tier)}
                          className="w-full py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer"
                        >
                          Đăng Ký Ngay
                        </button>
                      )}
                    </div>

                    {/* Features Checklist */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider mb-2.5">
                        {isFree ? 'QUYỀN LỢI CƠ BẢN:' : isPro ? 'BAO GỒM TRỌN GÓI PRO:' : 'ĐẶC QUYỀN DOANH NGHIỆP:'}
                      </p>
                      <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        {features.map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                              <Check className="w-3 h-3 stroke-[2.5]" />
                            </div>
                            <span className="font-medium leading-relaxed">{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[10px] text-slate-400">
                    {isFree && 'Thích hợp bắt đầu thử nghiệm sự kiện nhỏ.'}
                    {isPro && 'Lựa chọn phổ biến nhất cho đơn vị tổ chức năng động.'}
                    {!isFree && !isPro && 'Tối đa hoá lợi nhuận cho quy mô tổ chức lớn.'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          Direct PayOS / QR Transfer Modal
      ══════════════════════════════════════════════════ */}
      {paymentModalTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl space-y-4 text-center">
            <button
              onClick={() => {
                setPaymentModalTier(null)
                setPaymentOrder(null)
              }}
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>

            {paymentSubmitting ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  Đang khởi tạo cổng thanh toán payOS...
                </p>
              </div>
            ) : paymentError ? (
              <div className="space-y-4 py-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 mx-auto">
                  <AlertCircle size={24} />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Khởi tạo giao dịch thất bại</h3>
                <p className="text-xs text-red-500">{paymentError}</p>
                <button
                  onClick={() => handleInitiateDirectPayment(paymentModalTier)}
                  className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs"
                >
                  Thử lại
                </button>
              </div>
            ) : paymentOrder ? (
              <div className="space-y-3">
                {/* Gateway status */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>payOS Gateway (Khởi tạo giao dịch trực tiếp)</span>
                </div>

                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Thanh Toán "{paymentModalTier.name.startsWith('Gói ') ? paymentModalTier.name : `Gói ${paymentModalTier.name}`}"
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quét mã VietQR bằng app ngân hàng để kích hoạt gói ngay lập tức
                </p>

                {/* QR Code Container with Vector SVG & Image Support (100% Reliable Render) */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 mx-auto w-fit shadow-inner flex items-center justify-center min-w-[210px] min-h-[210px]">
                  {paymentOrder.qrCodeUrl?.startsWith('http') || paymentOrder.qrCodeUrl?.startsWith('data:image') ? (
                    <img
                      src={paymentOrder.qrCodeUrl}
                      alt="VietQR"
                      className="w-52 h-52 object-contain"
                    />
                  ) : paymentOrder.qrCodeUrl ? (
                    <QRCodeSVG
                      value={paymentOrder.qrCodeUrl}
                      size={200}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                      Đang tạo mã QR...
                    </div>
                  )}
                </div>

                {/* Direct PayOS Link */}
                {paymentOrder.checkoutUrl && (
                  <a
                    href={paymentOrder.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-xs transition"
                  >
                    <span>Mở cổng thanh toán payOS</span>
                    <ArrowUpRight size={14} />
                  </a>
                )}

                {/* Account Details Box */}
                <div className="space-y-2 text-left bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Ngân hàng:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {getDisplayBankName(paymentOrder.bankCode)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Số tài khoản:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                      <span>{paymentOrder.accountNumber}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(paymentOrder.accountNumber)
                          setCopiedAccNum(true)
                          setTimeout(() => setCopiedAccNum(false), 2000)
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                        title="Sao chép"
                      >
                        {copiedAccNum ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Chủ tài khoản:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">
                      {paymentOrder.accountName || 'FPT EVENT MANAGEMENT'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Số tiền:</span>
                    <span className="font-black text-rose-500 text-sm">
                      {paymentOrder.amount.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-slate-400 font-bold">Nội dung chuyển khoản:</span>
                    <div className="flex items-center gap-1.5 font-mono font-black text-orange-600 dark:text-orange-400">
                      <span>{paymentOrder.transferContent}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(paymentOrder.transferContent)
                          setCopiedContent(true)
                          setTimeout(() => setCopiedContent(false), 2000)
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                        title="Sao chép"
                      >
                        {copiedContent ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Check status action */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setPaymentModalTier(null)
                      setPaymentOrder(null)
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    onClick={handleCheckPaymentStatus}
                    disabled={isCheckingPayment}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isCheckingPayment ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        Đang kiểm tra...
                      </>
                    ) : (
                      'Tôi đã chuyển tiền'
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          Downgrade Confirmation Modal
      ══════════════════════════════════════════════════ */}
      {selectedTierForDowngrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl space-y-4 text-slate-800 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Xác Nhận Hạ Cấp Gói
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Chuyển sang {selectedTierForDowngrade.name}</p>
              </div>
              <button
                disabled={downgradeSubmitting}
                onClick={() => setSelectedTierForDowngrade(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/30 text-amber-900 dark:text-amber-200 text-xs leading-relaxed">
                <p className="font-bold mb-1">Lưu ý quan trọng:</p>
                <p>Hạ cấp sẽ <strong>có hiệu lực từ kỳ sau</strong> sau khi gói hiện tại hết hạn ({currentSub?.daysRemaining} ngày nữa). <strong>Không hoàn lại tiền</strong> cho thời gian còn lại của kỳ hiện tại.</p>
              </div>

              {downgradeError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{downgradeError}</span>
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={downgradeSubmitting}
                  onClick={() => setSelectedTierForDowngrade(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Giữ Gói Hiện Tại
                </button>
                <button
                  type="button"
                  disabled={downgradeSubmitting}
                  onClick={handleConfirmDowngrade}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {downgradeSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    'Xác Nhận Hạ Cấp'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════
          Wallet Payment Confirmation Modal
      ══════════════════════════════════════════════════ */}
      {walletConfirmTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl space-y-5 text-left">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
                  <Wallet size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Xác Nhận Thanh Toán Bằng Ví</h3>
                  <p className="text-[11px] text-slate-500">Tránh thao tác nhầm lẫn khi nâng cấp gói</p>
                </div>
              </div>
              <button
                disabled={walletPaySubmitting}
                onClick={() => setWalletConfirmTier(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Price Details */}
            {(() => {
              const { originalPrice, proratedCredit, netPay } = calculateUpgradeCost(walletConfirmTier)
              return (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>Gói nâng cấp:</span>
                      <span className="font-bold text-slate-900 dark:text-white">{walletConfirmTier.name} ({walletConfirmTier.tierCode})</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>Giá niêm yết:</span>
                      <span className="font-semibold">{originalPrice.toLocaleString('vi-VN')} đ</span>
                    </div>
                    {proratedCredit > 0 && (
                      <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-semibold">
                        <span>Khấu trừ gói cũ còn hạn:</span>
                        <span>-{proratedCredit.toLocaleString('vi-VN')} đ</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center font-black text-sm text-slate-900 dark:text-white">
                      <span>Số tiền thanh toán:</span>
                      <span className="text-orange-600 dark:text-orange-400">{netPay.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>

                  {/* Balance Summary */}
                  <div className="p-3.5 rounded-2xl bg-orange-50/50 dark:bg-orange-500/10 border border-orange-200/60 dark:border-orange-500/20 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Số dư ví hiện tại:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{balance.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Số dư còn lại sau thanh toán:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{(balance - netPay).toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={walletPaySubmitting}
                      onClick={() => setWalletConfirmTier(null)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                    >
                      Hủy Bỏ
                    </button>
                    <button
                      type="button"
                      disabled={walletPaySubmitting}
                      onClick={handleConfirmWalletPayment}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 text-white text-xs font-black shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {walletPaySubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Đang xử lý...
                        </>
                      ) : (
                        'Xác Nhận Thanh Toán'
                      )}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
