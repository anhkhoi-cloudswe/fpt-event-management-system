import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Check, X, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react'
import { subscriptionService, SubscriptionTier } from '../services/subscriptionService'

export type SubscriptionTierData = SubscriptionTier & {
  code?: string
  monthlyPrice?: number
  priceMonthly?: number
  maxCapacity?: number
  commissionRate?: number
  features?: string[]
}

interface UpgradePlanModalProps {
  isOpen: boolean
  onClose: () => void
  type?: 'CAPACITY' | 'REPORTS' | 'GA4' | 'GENERAL'
  requestedCapacity?: number
  currentTier?: string
  maxAllowed?: number
}

export const UpgradePlanModal: React.FC<UpgradePlanModalProps> = ({
  isOpen,
  onClose,
  type = 'CAPACITY',
  requestedCapacity = 120,
  currentTier = 'FREE',
  maxAllowed = 100,
}) => {
  const navigate = useNavigate()
  const modalRef = useRef<HTMLDivElement>(null)
  const [tiers, setTiers] = useState<SubscriptionTierData[]>([])
  const [loading, setLoading] = useState(false)
  const [tiersError, setTiersError] = useState<string | null>(null)

  const fetchTiers = useCallback(async () => {
    setLoading(true)
    setTiersError(null)
    try {
      const list = await subscriptionService.getTiers()
      if (!list || list.length === 0) {
        setTiersError('Không tải được bảng giá. Vui lòng thử lại.')
      } else {
        setTiers(list)
      }
    } catch (err: any) {
      setTiersError('Không tải được bảng giá. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch tiers dynamically from GET /api/v1/subscription/tiers
  useEffect(() => {
    if (isOpen) {
      fetchTiers()
    }
  }, [isOpen, fetchTiers])

  // Accessibility: Lock background scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Accessibility: Esc key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Accessibility: Auto focus modal container on open
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleGoToUpgrade = () => {
    onClose()
    navigate('/organizer/subscription')
  }

  const formatPrice = (p?: number) => {
    if (p === undefined || p === null) return '0đ'
    if (p === 0) return '0đ'
    return `${p.toLocaleString('vi-VN')}đ`
  }

  const getTierCode = (t: SubscriptionTierData) => (t.tierCode || t.code || '').toUpperCase()
  const getPrice = (t: SubscriptionTierData) => t.priceVnd ?? t.monthlyPrice ?? t.priceMonthly ?? 0
  const getCap = (t: SubscriptionTierData) => t.maxCapacityLimit ?? t.maxCapacity ?? -1
  const getCommission = (t: SubscriptionTierData) => {
    if (t.commissionBps !== undefined) return t.commissionBps / 100
    if (t.commissionRate !== undefined) return t.commissionRate
    return 0
  }
  const getCommissionInfo = (t: SubscriptionTierData) => {
    const comm = getCommission(t)
    const fixedFee = (t as any).fixedFeePerTicket ?? (t as any).fixedFee
    const threshold = (t as any).ticketPriceThreshold ?? (t as any).priceThreshold
    
    if (fixedFee !== undefined && threshold !== undefined) {
      const fixedFeeStr = fixedFee >= 1000 ? `${fixedFee / 1000}k` : `${fixedFee}đ`
      const thresholdStr = threshold >= 1000 ? `${threshold / 1000}k` : `${threshold}đ`
      if (comm === 0) {
        return `0% hoa hồng (*áp dụng phí cố định ${fixedFeeStr}/vé với vé ≥ ${thresholdStr})`
      }
      return `${comm}% hoa hồng (*cộng phí ${fixedFeeStr}/vé với vé ≥ ${thresholdStr})`
    }

    if (comm === 0) {
      return `0% hoa hồng`
    }
    return `${comm}% hoa hồng`
  }

  // Filter out FREE tier for upgrade options if user is FREE, or show paid tiers
  const upgradeTiers = tiers.filter((t) => getTierCode(t) !== 'FREE')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-neutral-900 border border-white/10 text-white shadow-2xl shadow-orange-500/10 transition-all outline-none"
      >
        {/* Glow ambient background */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng modal"
          className="absolute top-5 right-5 p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          {type === 'REPORTS' || type === 'GA4' ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-4 h-4" />
              Tính Năng Dành Cho Gói Nâng Cao
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <ShieldAlert className="w-4 h-4" />
              Giới hạn quy mô sự kiện
            </div>
          )}
          <h2 id="upgrade-modal-title" className="text-2xl sm:text-3xl font-bold tracking-tight">
            {type === 'GA4'
              ? 'Mở Khóa Google Analytics 4 (GA4)'
              : type === 'REPORTS'
              ? 'Mở Khóa Báo Cáo Chuyên Sâu'
              : 'Yêu Cầu Nâng Cấp Gói Organizer'}
          </h2>
          <p className="mt-2 text-sm text-neutral-400 max-w-xl mx-auto">
            {type === 'GA4' ? (
              <>
                Tính năng phân tích lưu lượng truy cập trực tiếp, thiết bị, nguồn truy cập và Real-time người dùng chỉ dành cho gói <span className="font-semibold text-orange-400">PRO</span> hoặc <span className="font-semibold text-amber-400">BUSINESS</span>. Vui lòng nâng cấp tài khoản để mở khóa toàn bộ số liệu.
              </>
            ) : type === 'REPORTS' ? (
              <>
                Tính năng phân tích doanh thu theo giờ, cơ cấu vé và tỷ lệ lấp đầy chuyên sâu chỉ dành cho gói <span className="font-semibold text-orange-400">PRO</span> hoặc <span className="font-semibold text-amber-400">BUSINESS</span>. Vui lòng nâng cấp tài khoản để mở khóa toàn bộ số liệu.
              </>
            ) : (
              <>
                Sự kiện của bạn yêu cầu sức chứa <span className="font-semibold text-orange-400">{requestedCapacity} người</span>, 
                vượt quá giới hạn của gói <span className="font-semibold text-white">{currentTier}</span> (tối đa {maxAllowed} người).
                Hãy nâng cấp gói tài khoản để mở rộng hạn mức tạo sự kiện.
              </>
            )}
          </p>
        </div>

        {/* Content Body: Loading, Error, or Tier Cards */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="py-12 text-center text-neutral-400 text-sm flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-orange-400" />
              <span>Đang tải bảng giá dịch vụ từ hệ thống...</span>
            </div>
          ) : tiersError ? (
            <div className="py-8 text-center bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
              <p className="text-red-400 font-semibold mb-3">{tiersError}</p>
              <button
                type="button"
                onClick={fetchTiers}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {upgradeTiers.map((t) => {
                const code = getTierCode(t)
                const price = getPrice(t)
                const cap = getCap(t)
                const isPro = code === 'PRO'

                return (
                  <div
                    key={code || t.name}
                    className={`relative rounded-2xl p-5 flex flex-col justify-between transition ${
                      isPro
                        ? 'bg-gradient-to-b from-orange-500/15 to-orange-500/5 border-2 border-orange-500/40 shadow-lg shadow-orange-500/10'
                        : 'bg-white/[0.04] border border-amber-500/20'
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-[10px] font-bold text-white uppercase tracking-wider shadow">
                        Khuyến nghị
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className={`font-bold text-lg ${isPro ? 'text-orange-300' : 'text-amber-300'}`}>
                          {t.name || code}
                        </h3>
                      </div>
                      <div className="text-2xl font-extrabold text-white mb-3">
                        {formatPrice(price)} <span className="text-xs font-normal text-neutral-400">/tháng</span>
                      </div>
                      <ul className="space-y-2.5 text-xs text-neutral-200 mb-4">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          <span>
                            {cap === -1 || cap === 0
                              ? 'Không giới hạn sức chứa sự kiện'
                              : `Sức chứa tối đa ${cap} người`}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          <span>{getCommissionInfo(t)}</span>
                        </li>
                        {t.features && t.features.length > 0 ? (
                          t.features.map((feat, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))
                        ) : (
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                            <span>
                              {t.hasAdvancedReports
                                ? 'Báo cáo & phân tích doanh thu nâng cao'
                                : 'Báo cáo sự kiện cơ bản'}
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoToUpgrade}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        isPro
                          ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/20'
                          : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                      }`}
                    >
                      Chọn {t.name || code} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-5 bg-neutral-950/60 border-t border-white/5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-medium transition cursor-pointer"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={handleGoToUpgrade}
            className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/20"
          >
            Xem chi tiết gói
          </button>
        </div>
      </div>
    </div>
  )
}

export default UpgradePlanModal
