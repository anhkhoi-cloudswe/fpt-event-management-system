import React, { useEffect } from 'react'
import {
  Clock,
  Calendar,
  ShieldCheck,
  ArrowUpRight,
  AlertTriangle,
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

function formatShortDateTime(dateStr?: string | Date | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const dateFormatted = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  const timeFormatted = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${timeFormatted} • ${dateFormatted}`
}

export function SubscriptionDetailModal({
  isOpen,
  onClose,
  currentSub,
  onManageSubscription,
}: SubscriptionDetailModalProps) {
  // Đóng modal khi nhấn phím Escape và khóa cuộn body
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
        const totalCycle = 30 * 24 * 60 * 60 * 1000
        percentCycleUsed = Math.min(100, Math.max(0, 100 - Math.round((diffMs / totalCycle) * 100)))
      }
    }
  }

  // Tỷ lệ hoa hồng động từ Backend
  const dynamicCommissionRate = typeof currentSub?.commissionBps === 'number'
    ? `${(currentSub.commissionBps / 100).toFixed(1)}%`
    : isBusiness ? '0.0%' : isPro ? '2.5%' : '5.0%'

  // Sức chứa động: xử lý đúng giá trị -1, 0, hoặc undefined là "Không giới hạn"
  const isUnlimitedCapacity =
    !currentSub?.maxCapacityLimit ||
    currentSub.maxCapacityLimit <= 0 ||
    currentSub.maxCapacityLimit === -1 ||
    isBusiness ||
    isSchool

  const dynamicCapacity = isUnlimitedCapacity
    ? 'Không giới hạn'
    : `${currentSub!.maxCapacityLimit.toLocaleString('vi-VN')} khách`

  // Cấu hình theme màu theo gói dịch vụ
  const themeConfig = isBusiness
    ? {
        badgeBorder: 'border-purple-500/40',
        badgeBg: 'bg-purple-500/15',
        badgeText: 'text-purple-700 dark:text-purple-300',
        heroGradient: 'from-purple-600/20 via-indigo-600/10 to-transparent',
        accentText: 'text-purple-600 dark:text-purple-400',
        progressBar: 'bg-gradient-to-r from-purple-500 to-indigo-500',
        title: currentSub?.tierName || 'Gói Doanh Nghiệp',
        commissionRate: dynamicCommissionRate,
        commissionNote: dynamicCommissionRate === '0.0%' ? 'Miễn 100% sàn' : `Ưu đãi ${dynamicCommissionRate}`,
      }
    : isPro
    ? {
        badgeBorder: 'border-blue-500/40',
        badgeBg: 'bg-blue-500/15',
        badgeText: 'text-blue-700 dark:text-blue-300',
        heroGradient: 'from-blue-600/20 via-cyan-600/10 to-transparent',
        accentText: 'text-blue-600 dark:text-blue-400',
        progressBar: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        title: currentSub?.tierName || 'Gói Chuyên Nghiệp',
        commissionRate: dynamicCommissionRate,
        commissionNote: `Ưu đãi ${dynamicCommissionRate}`,
      }
    : isSchool
    ? {
        badgeBorder: 'border-sky-500/40',
        badgeBg: 'bg-sky-500/15',
        badgeText: 'text-sky-700 dark:text-sky-300',
        heroGradient: 'from-sky-600/20 via-blue-600/10 to-transparent',
        accentText: 'text-sky-600 dark:text-sky-400',
        progressBar: 'bg-gradient-to-r from-sky-500 to-blue-500',
        title: currentSub?.tierName || 'School Organizer',
        commissionRate: dynamicCommissionRate,
        commissionNote: 'Đối tác FPT',
      }
    : {
        badgeBorder: 'border-amber-500/40',
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-700 dark:text-amber-300',
        heroGradient: 'from-amber-600/20 via-orange-600/10 to-transparent',
        accentText: 'text-amber-600 dark:text-amber-400',
        progressBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
        title: currentSub?.tierName || 'Gói Miễn Phí',
        commissionRate: dynamicCommissionRate,
        commissionNote: 'Biểu phí chuẩn',
      }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header tích hợp: Logo + Tên Gói + Badge + Trạng thái & Nút "Gia Hạn Gói" góc phải */}
        <div className={`px-5 sm:px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-gradient-to-r ${themeConfig.heroGradient} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/favicon.png"
              alt="FEMS Favicon"
              className="w-10 h-10 object-contain rounded-xl shrink-0 shadow-sm ring-2 ring-white/20"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                  Gói {tierCode}
                </h3>
                {currentSub?.status === 'ACTIVE' && !isExpired && (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Đang hoạt động
                  </span>
                )}
                {isExpired && (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 text-xs shrink-0">
                    <AlertTriangle size={12} />
                    Đã hết hạn
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Vị trí góc phải: Thay thế nút X bằng nút "Gia Hạn Gói" */}
          {onManageSubscription && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onManageSubscription()
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer shrink-0"
              title="Đi đến trang gia hạn / nâng cấp gói dịch vụ"
            >
              <span>Gia Hạn Gói</span>
              <ArrowUpRight size={13} className="shrink-0" />
            </button>
          )}
        </div>

        {/* Nội dung gọn gàng trong 1 khung hình - KHÔNG CẦN CUỘN */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Card Thời Hạn Còn Lại */}
          <div className="p-4 sm:p-4.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            {isFree || isSchool ? (
              <div className="text-center py-2">
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  Vĩnh Viễn (Không Giới Hạn)
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isSchool
                    ? 'Tài khoản School Organizer được bảo trợ quyền lợi vĩnh viễn.'
                    : 'Gói Free miễn phí duy trì trọn đời, không bao giờ hết hạn.'}
                </p>
              </div>
            ) : isExpired ? (
              <div className="text-center py-2 text-rose-600 dark:text-rose-400">
                <div className="text-lg font-black">Gói Đã Hết Hạn</div>
                <p className="text-xs text-slate-500 mt-0.5">Vui lòng gia hạn gói để tiếp tục hưởng ưu đãi 0% hoa hồng sàn.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Hàng đếm ngược số ngày */}
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1.5">
                    <Clock size={12} className={themeConfig.accentText} />
                    Thời Hạn Còn Lại
                  </div>
                  <div className={`text-2xl sm:text-3xl font-black tracking-tight ${themeConfig.accentText} mt-0.5`}>
                    {daysLeft > 0 ? (
                      <>
                        <span>{daysLeft}</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">ngày</span>
                        {hoursLeft > 0 && (
                          <>
                            <span className="ml-2">{hoursLeft}</span>
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">giờ</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span>{hoursLeft}</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">giờ</span>
                        <span className="ml-2">{minutesLeft}</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">phút</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Thanh tiến trình chu kỳ */}
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${themeConfig.progressBar}`}
                    style={{ width: `${percentCycleUsed}%` }}
                  />
                </div>

                {/* Mốc Ngày Bắt đầu & Hết hạn: Trên mobile Bắt đầu hàng trên, Hết hạn hàng dưới; Desktop cùng hàng */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar size={13} className="text-slate-400 shrink-0" />
                    <span>Bắt đầu:</span>
                    <strong className="text-slate-700 dark:text-slate-200">{formatShortDateTime(currentSub?.startDate)}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Clock size={13} className={`${themeConfig.accentText} shrink-0`} />
                    <span>Hết hạn:</span>
                    <strong className="text-slate-800 dark:text-slate-100">{formatShortDateTime(currentSub?.endDate)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Thông báo hạ cấp nếu có */}
            {currentSub?.scheduledDowngradeTierCode && (
              <div className="mt-2.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-200 font-medium">
                <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                <span>Sẽ chuyển về gói <strong>{currentSub.scheduledDowngradeTierCode}</strong> sau khi hết chu kỳ.</span>
              </div>
            )}
          </div>

          {/* Grid 4 Chỉ Số Quyền Lợi Cốt Lõi với layout thoáng, không bị che khuất chữ */}
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Đặc Quyền Gói Dịch Vụ
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {/* Chỉ số 1: Hoa hồng sàn */}
              <div className="p-3 rounded-2xl bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-tight text-purple-700 dark:text-purple-300">Hoa hồng</span>
                  <Percent size={13} className="text-purple-500" />
                </div>
                <div className="mt-1.5">
                  <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                    {themeConfig.commissionRate}
                  </div>
                  <div className="text-[11px] text-purple-600 dark:text-purple-400 font-bold mt-0.5">
                    {themeConfig.commissionNote}
                  </div>
                </div>
              </div>

              {/* Chỉ số 2: Phí cố định */}
              <div className="p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-tight text-amber-700 dark:text-amber-300">Phí cố định</span>
                  <ShieldCheck size={13} className="text-amber-500" />
                </div>
                <div className="mt-1.5">
                  <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                    1.000đ
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    Vé ≥ 20.000đ
                  </div>
                </div>
              </div>

              {/* Chỉ số 3: Sức chứa (Không bị mất chữ) */}
              <div className="p-3 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-tight text-blue-700 dark:text-blue-300">Sức chứa</span>
                  <Users size={13} className="text-blue-500" />
                </div>
                <div className="mt-1.5">
                  <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                    {dynamicCapacity}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 whitespace-nowrap">
                    {isUnlimitedCapacity ? 'Mọi quy mô' : 'Mỗi sự kiện'}
                  </div>
                </div>
              </div>

              {/* Chỉ số 4: Báo cáo nâng cao */}
              <div className="p-3 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-tight text-emerald-700 dark:text-emerald-300">Báo cáo</span>
                  <BarChart3 size={13} className="text-emerald-500" />
                </div>
                <div className="mt-1.5">
                  <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                    {currentSub?.hasAdvancedReports ? 'Nâng Cao' : 'Cơ Bản'}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 whitespace-nowrap">
                    {currentSub?.hasAdvancedReports ? 'Đã mở khóa' : 'Thống kê cơ bản'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions tinh gọn & canh đều */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer shadow-xs active:scale-95"
          >
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
