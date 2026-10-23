import React, { useEffect } from 'react'
import {
  Sparkles,
  X,
  Clock,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  Zap,
  BarChart3,
  Users,
  Percent
} from 'lucide-react'
import { CurrentSubscription } from '../services/subscriptionService'

interface SubscriptionDetailModalProps {
  isOpen: boolean
  onClose: () => void
  currentSub: CurrentSubscription | null
  onManageSubscription?: () => void
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatFullDateTime(dateStr?: string | Date | null): string {
  if (!dateStr) return 'Vĩnh viễn (Không thời hạn)'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const dateFormatted = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  const timeFormatted = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${timeFormatted} ngày ${dateFormatted}`
}

export function SubscriptionDetailModal({
  isOpen,
  onClose,
  currentSub,
  onManageSubscription,
}: SubscriptionDetailModalProps) {
  // Đóng modal khi nhấn phím Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const tierCode = currentSub?.tierCode || 'FREE'
  const isBusiness = tierCode === 'BUSINESS'
  const isPro = tierCode === 'PRO'
  const isFree = tierCode === 'FREE'
  const isSchool = currentSub?.feeSource === 'ROLE' || tierCode === 'SCHOOL_ORGANIZER'

  // Tính toán thời gian còn lại
  const now = new Date()
  const startDate = currentSub?.startDate ? new Date(currentSub.startDate) : null
  const endDate = currentSub?.endDate ? new Date(currentSub.endDate) : null

  let isExpired = false
  let daysLeft = currentSub?.daysRemaining ?? 0
  let hoursLeft = 0
  let minutesLeft = 0
  let percentCycleUsed = 0

  if (endDate && !isNaN(endDate.getTime()) && !isFree && !isSchool) {
    const diffMs = endDate.getTime() - now.getTime()
    if (diffMs <= 0) {
      isExpired = true
      daysLeft = 0
      percentCycleUsed = 100
    } else {
      daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

      if (startDate && !isNaN(startDate.getTime())) {
        const totalCycle = endDate.getTime() - startDate.getTime()
        const elapsed = now.getTime() - startDate.getTime()
        if (totalCycle > 0) {
          percentCycleUsed = Math.min(100, Math.max(0, Math.round((elapsed / totalCycle) * 100)))
        }
      } else {
        // Fallback chu kỳ 30 ngày
        const totalCycle = 30 * 24 * 60 * 60 * 1000
        percentCycleUsed = Math.min(100, Math.max(0, 100 - Math.round((diffMs / totalCycle) * 100)))
      }
    }
  }

  // Lấy tỷ lệ hoa hồng động từ Backend (nếu có commissionBps)
  const dynamicCommissionRate = typeof currentSub?.commissionBps === 'number'
    ? `${(currentSub.commissionBps / 100).toFixed(1)}%`
    : isBusiness ? '0.0%' : isPro ? '2.5%' : '5.0%'

  // Sức chứa động từ Backend
  const dynamicCapacity = currentSub?.maxCapacityLimit === 0
    ? 'Không giới hạn quy mô'
    : currentSub?.maxCapacityLimit
    ? `${currentSub.maxCapacityLimit.toLocaleString('vi-VN')} khách / sự kiện`
    : isBusiness || isSchool ? 'Không giới hạn quy mô' : isPro ? '500 khách / sự kiện' : '100 khách / sự kiện'

  // Cấu hình màu sắc theo gói
  const themeConfig = isBusiness
    ? {
        badgeBorder: 'border-purple-500/40',
        badgeBg: 'bg-purple-500/15',
        badgeText: 'text-purple-700 dark:text-purple-300',
        heroGradient: 'from-purple-600/20 via-indigo-600/10 to-transparent',
        heroBorder: 'border-purple-500/30',
        accentText: 'text-purple-600 dark:text-purple-400',
        progressBar: 'bg-gradient-to-r from-purple-500 to-indigo-500',
        title: currentSub?.tierName || 'Gói Doanh Nghiệp (Business Tier)',
        commissionRate: dynamicCommissionRate,
        capacityText: dynamicCapacity,
        commissionNote: dynamicCommissionRate === '0.0%' ? 'Miễn 100% hoa hồng sàn bán vé' : `Ưu đãi hoa hồng sàn ${dynamicCommissionRate}`,
      }
    : isPro
    ? {
        badgeBorder: 'border-blue-500/40',
        badgeBg: 'bg-blue-500/15',
        badgeText: 'text-blue-700 dark:text-blue-300',
        heroGradient: 'from-blue-600/20 via-cyan-600/10 to-transparent',
        heroBorder: 'border-blue-500/30',
        accentText: 'text-blue-600 dark:text-blue-400',
        progressBar: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        title: currentSub?.tierName || 'Gói Chuyên Nghiệp (Pro Tier)',
        commissionRate: dynamicCommissionRate,
        capacityText: dynamicCapacity,
        commissionNote: `Ưu đãi hoa hồng ${dynamicCommissionRate}`,
      }
    : isSchool
    ? {
        badgeBorder: 'border-sky-500/40',
        badgeBg: 'bg-sky-500/15',
        badgeText: 'text-sky-700 dark:text-sky-300',
        heroGradient: 'from-sky-600/20 via-blue-600/10 to-transparent',
        heroBorder: 'border-sky-500/30',
        accentText: 'text-sky-600 dark:text-sky-400',
        progressBar: 'bg-gradient-to-r from-sky-500 to-blue-500',
        title: currentSub?.tierName || 'School Organizer (Đơn Vị FPT)',
        commissionRate: dynamicCommissionRate,
        capacityText: dynamicCapacity,
        commissionNote: 'Đặc quyền đối tác học đường',
      }
    : {
        badgeBorder: 'border-amber-500/40',
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-700 dark:text-amber-300',
        heroGradient: 'from-amber-600/20 via-orange-600/10 to-transparent',
        heroBorder: 'border-amber-500/30',
        accentText: 'text-amber-600 dark:text-amber-400',
        progressBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
        title: currentSub?.tierName || 'Gói Miễn Phí (Free Tier)',
        commissionRate: dynamicCommissionRate,
        capacityText: dynamicCapacity,
        commissionNote: 'Biểu phí tiêu chuẩn sàn',
      }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header với Favicon FEMS */}
        <div className={`p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r ${themeConfig.heroGradient} flex items-center justify-between`}>
          <div className="flex items-center gap-3.5">
            <img
              src="/favicon.png"
              alt="FEMS Favicon"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain rounded-2xl shrink-0 shadow-md ring-2 ring-white/20"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                  Thông Tin Gói Dịch Vụ
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${themeConfig.badgeBg} ${themeConfig.badgeBorder} ${themeConfig.badgeText}`}>
                  {tierCode}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Minh bạch thời hạn & chính sách quyền lợi Ban tổ chức
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nội dung Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Card Hero: Tên gói & Trạng thái kích hoạt */}
          <div className={`p-4 rounded-2xl border ${themeConfig.heroBorder} bg-gradient-to-br ${themeConfig.heroGradient} relative overflow-hidden`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                  Gói dịch vụ đang kích hoạt
                </div>
                <div className={`text-lg sm:text-xl font-black mt-0.5 flex items-center gap-2 ${themeConfig.accentText}`}>
                  <Sparkles size={18} className="shrink-0 animate-pulse" />
                  <span>{themeConfig.title}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                {currentSub?.status === 'ACTIVE' && !isExpired ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Đang Hoạt Động
                  </span>
                ) : isExpired ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                    <AlertTriangle size={12} />
                    Đã Hết Hạn
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Tiêu Chuẩn
                  </span>
                )}
              </div>
            </div>

            {/* Thông báo hạ cấp nếu có */}
            {currentSub?.scheduledDowngradeTierCode && (
              <div className="mt-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                <span>
                  Đã đặt lịch chuyển về gói <strong>{currentSub.scheduledDowngradeTierCode}</strong> sau khi hết hạn chu kỳ này.
                </span>
              </div>
            )}
          </div>

          {/* Block Thời Hạn Còn Lại (Yêu cầu chính của Organizer) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock size={15} className={themeConfig.accentText} />
                Thời Hạn Còn Lại
              </span>
              {currentSub?.autoRenew && !isFree && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <RefreshCw size={11} className="text-emerald-500" />
                  Tự động gia hạn: <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">BẬT</strong>
                </span>
              )}
            </div>

            {isFree || isSchool ? (
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center">
                <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Vĩnh Viễn (Không Giới Hạn)
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isSchool
                    ? 'Tài khoản School Organizer được bảo trợ quyền lợi đặc quyền vĩnh viễn theo trường.'
                    : 'Gói Free miễn phí duy trì trọn đời, không bao giờ hết hạn.'}
                </p>
              </div>
            ) : isExpired ? (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
                  Gói Đã Hết Hạn
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Vui lòng gia hạn hoặc chọn nâng cấp để tiếp tục hưởng quyền lợi 0% hoa hồng và sức chứa mở rộng.
                </p>
              </div>
            ) : (
              <>
                {/* Đếm ngược ngày & giờ nổi bật */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-xs">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                      Số thời gian hiệu lực còn lại
                    </div>
                    <div className={`text-2xl sm:text-3xl font-black tracking-tight ${themeConfig.accentText} mt-0.5`}>
                      {daysLeft > 0 ? (
                        <>
                          <span>{daysLeft}</span>
                          <span className="text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300 ml-1">ngày</span>
                          {hoursLeft > 0 && (
                            <>
                              <span className="ml-2">{hoursLeft}</span>
                              <span className="text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300 ml-1">giờ</span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <span>{hoursLeft}</span>
                          <span className="text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300 ml-1">giờ</span>
                          <span className="ml-2">{minutesLeft}</span>
                          <span className="text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300 ml-1">phút</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      Còn {Math.max(0, 100 - percentCycleUsed)}% chu kỳ
                    </span>
                  </div>
                </div>

                {/* Thanh tiến trình chu kỳ 30 ngày */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-slate-500">
                    <span>Tiến độ chu kỳ</span>
                    <span>Đã dùng {percentCycleUsed}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${themeConfig.progressBar}`}
                      style={{ width: `${percentCycleUsed}%` }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Thông tin mốc ngày Bắt đầu & Hết hạn */}
            {!isFree && !isSchool && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2">
                  <Calendar size={14} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Ngày bắt đầu</div>
                    <div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                      {formatFullDateTime(currentSub?.startDate)}
                    </div>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2">
                  <Calendar size={14} className={`${themeConfig.accentText} mt-0.5 shrink-0`} />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Ngày hết hạn</div>
                    <div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                      {formatFullDateTime(currentSub?.endDate)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Grid Quyền Lợi & Chính Sách Biểu Phí Minh Bạch */}
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Quyền Lợi & Biểu Phí Đặc Quyền
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Quyền lợi 1: Hoa hồng sàn */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5">
                  <Percent size={15} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400">Hoa hồng sàn bán vé</div>
                  <div className="font-black text-slate-900 dark:text-white text-sm mt-0.5">
                    {themeConfig.commissionRate}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {themeConfig.commissionNote}
                  </p>
                </div>
              </div>

              {/* Quyền lợi 2: Phí cố định */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <ShieldCheck size={15} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400">Phí cố định hệ thống</div>
                  <div className="font-black text-slate-900 dark:text-white text-sm mt-0.5">
                    1.000đ / vé
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Áp dụng cho vé thanh toán ≥ 20.000đ
                  </p>
                </div>
              </div>

              {/* Quyền lợi 3: Giới hạn sức chứa */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                  <Users size={15} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400">Quy mô sức chứa tối đa</div>
                  <div className="font-black text-slate-900 dark:text-white text-sm mt-0.5">
                    {themeConfig.capacityText}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isBusiness ? 'Tổ chức đại nhạc hội, festival quy mô lớn' : 'Phù hợp hội thảo & sự kiện vừa'}
                  </p>
                </div>
              </div>

              {/* Quyền lợi 4: Báo cáo nâng cao */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                  <BarChart3 size={15} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400">Báo cáo & Phân tích chuyên sâu</div>
                  <div className="font-black text-slate-900 dark:text-white text-sm mt-0.5 flex items-center gap-1">
                    {currentSub?.hasAdvancedReports ? (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span>Đã Mở Khóa Đầy Đủ</span>
                      </>
                    ) : (
                      <span>Báo Cáo Cơ Bản</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Heatmap check-in, phân tích hoàn vé & xuất CSV
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          {onManageSubscription ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onManageSubscription()
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
            >
              <span>Quản lý & Gia hạn gói</span>
              <ArrowUpRight size={14} />
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer shadow-xs"
          >
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
