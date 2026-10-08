import { Eye, Users, Link, TrendingDown, ShoppingCart, Wifi, WifiOff } from 'lucide-react'
import type { GA4Summary } from '../../services/analyticsService'

interface GA4MetricCardsProps {
  summary: GA4Summary
  realtimeUsers: number | null
  hasAdvanced: boolean
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: 'orange' | 'blue' | 'green' | 'purple' | 'red'
  badge?: string
}

const ACCENT_CLASSES = {
  orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/40 text-orange-600 dark:text-orange-400',
  blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40 text-blue-600 dark:text-blue-400',
  green: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/40 text-purple-600 dark:text-purple-400',
  red: 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/40 text-red-600 dark:text-red-400',
}

function MetricCard({ icon, label, value, sub, accent = 'orange', badge }: MetricCardProps) {
  return (
    <div className={`relative rounded-2xl border p-4 ${ACCENT_CLASSES[accent]}`}>
      {badge && (
        <span className="absolute top-2 right-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-white/60 dark:bg-black/30 text-current tracking-wider">
          {badge}
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-current/10">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
          <p className="text-xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
          {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function GA4MetricCards({ summary, realtimeUsers, hasAdvanced }: GA4MetricCardsProps) {
  const bouncePercent = ((summary.bounceRate ?? 0) * 100).toFixed(1)
  const convRate = summary.sessions > 0
    ? ((summary.conversions / summary.sessions) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-3">
      {/* Main KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={<Eye size={16} />}
          label="Lượt xem trang"
          value={fmt(summary.pageViews)}
          sub="Page Views"
          accent="orange"
        />
        <MetricCard
          icon={<Users size={16} />}
          label="Người dùng"
          value={fmt(summary.activeUsers)}
          sub="Active Users"
          accent="blue"
        />
        <MetricCard
          icon={<Link size={16} />}
          label="Phiên truy cập"
          value={fmt(summary.sessions)}
          sub="Sessions"
          accent="green"
        />
        <MetricCard
          icon={<TrendingDown size={16} />}
          label="Bounce Rate"
          value={`${bouncePercent}%`}
          sub="Tỷ lệ thoát"
          accent="purple"
        />
      </div>

      {/* Advanced row */}
      {hasAdvanced && (
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={<ShoppingCart size={16} />}
            label="Chuyển đổi mua vé"
            value={`${summary.conversions} (${convRate}%)`}
            sub="Conversion Events"
            accent="orange"
            badge="BUSINESS"
          />
          <div className={`rounded-2xl border p-4 ${realtimeUsers !== null
            ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/40'
            : 'bg-slate-50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800'}`}>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-red-500/10">
                {realtimeUsers !== null
                  ? <Wifi size={16} className="text-red-500" />
                  : <WifiOff size={16} className="text-slate-400" />}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                  Real-time người dùng
                </p>
                {realtimeUsers !== null ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-black text-slate-900 dark:text-white leading-none">
                      {realtimeUsers}
                    </p>
                    <span className="flex items-center gap-1 text-[10px] text-red-500 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Đang tải...</p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">Cập nhật mỗi 30 giây</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
