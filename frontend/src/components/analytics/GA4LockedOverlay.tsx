import { Lock, Sparkles, BarChart3, TrendingUp, Globe, Smartphone } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface GA4LockedOverlayProps {
  /** 'event' = organizer FREE tier, 'advanced' = PRO tier locked advanced section */
  variant?: 'event' | 'advanced'
}

export default function GA4LockedOverlay({ variant = 'event' }: GA4LockedOverlayProps) {
  const navigate = useNavigate()

  if (variant === 'advanced') {
    return (
      <div className="relative rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-6 overflow-hidden">
        {/* Blur overlay */}
        <div className="absolute inset-0 backdrop-blur-[2px] rounded-2xl z-10 flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-orange-200 dark:border-orange-500/30 shadow-lg">
            <Lock size={14} className="text-orange-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Tính năng dành riêng cho gói <span className="text-orange-500">Business</span>
            </span>
          </div>
          <button
            onClick={() => navigate('/dashboard/subscription')}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow hover:shadow-orange-400/30 active:scale-95 transition-all cursor-pointer"
          >
            Nâng cấp Business →
          </button>
        </div>

        {/* Blurred mock content behind */}
        <div className="blur-sm select-none pointer-events-none space-y-3">
          <div className="flex gap-4">
            <div className="flex-1 h-10 rounded-xl bg-red-100 dark:bg-red-950/30" />
            <div className="flex-1 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/30" />
            <div className="flex-1 h-10 rounded-xl bg-green-100 dark:bg-green-950/30" />
          </div>
          <div className="h-24 rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700" />
        </div>
      </div>
    )
  }

  // Full locked overlay for FREE tier
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center relative">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Icon */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-200/50 dark:border-orange-500/20 flex items-center justify-center">
          <BarChart3 size={36} className="text-orange-400" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
          <Lock size={12} className="text-white" />
        </div>
      </div>

      <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">
        GA4 Analytics — Dành cho gói PRO trở lên
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
        Theo dõi hiệu suất trang sự kiện của bạn trực tiếp trong dashboard — lượt xem trang, người dùng, 
        nguồn traffic, thiết bị và địa lý của khán giả.
      </p>

      {/* Feature teaser */}
      <div className="grid grid-cols-2 gap-2.5 mb-6 w-full max-w-xs">
        {[
          { icon: <TrendingUp size={14} />, label: 'Page Views & Users', tier: 'PRO' },
          { icon: <Globe size={14} />, label: 'Traffic Sources', tier: 'PRO' },
          { icon: <Smartphone size={14} />, label: 'Thiết bị & Geography', tier: 'PRO' },
          { icon: <Sparkles size={14} />, label: 'Real-time & Conversions', tier: 'BUSINESS' },
        ].map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
          >
            <span className="text-orange-500">{f.icon}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400">{f.label}</span>
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
              {f.tier}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/dashboard/subscription')}
        className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        Nâng cấp gói ngay →
      </button>
    </div>
  )
}
