import { Eye, Users, Link as LinkIcon, TrendingDown, ShoppingCart, Wifi, WifiOff, Sparkles, Activity, ArrowUpRight } from 'lucide-react'
import type { GA4Summary } from '../../services/analyticsService'

interface GA4MetricCardsProps {
  summary: GA4Summary
  realtimeUsers: number | null
  hasAdvanced: boolean
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

export default function GA4MetricCards({ summary, realtimeUsers, hasAdvanced }: GA4MetricCardsProps) {
  const bouncePercent = ((summary.bounceRate ?? 0) * 100).toFixed(1)
  const convRate = summary.sessions > 0
    ? ((summary.conversions / summary.sessions) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-4">
      {/* ─── Hero Highlight Banner: Real-time & Primary Performance ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Realtime Live Pulse Card (Hero Card #1) */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-rose-500/10 via-orange-500/5 to-amber-500/10 dark:from-rose-950/40 dark:via-slate-900/60 dark:to-orange-950/30 border border-rose-500/20 dark:border-rose-500/30 backdrop-blur-xl shadow-lg shadow-rose-500/5 group hover:border-rose-500/40 transition-all duration-300">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-rose-500/15 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />
          
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                {realtimeUsers !== null ? <Wifi size={18} className="animate-pulse" /> : <WifiOff size={18} />}
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Đang trực tuyến
                </span>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Real-time Visitors</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider bg-rose-500 text-white shadow-md shadow-rose-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              LIVE
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {realtimeUsers !== null ? realtimeUsers : '—'}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">người dùng hoạt động</span>
          </div>

          <div className="mt-3 pt-3 border-t border-rose-500/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Activity size={12} className="text-rose-500" /> Cập nhật tự động (30s)
            </span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">Google GA4 Engine</span>
          </div>
        </div>

        {/* Total Views Hero Card (Hero Card #2) */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-orange-500/15 via-amber-500/5 to-slate-900/0 dark:from-orange-950/40 dark:via-slate-900/60 dark:to-amber-950/20 border border-orange-500/25 dark:border-orange-500/30 backdrop-blur-xl shadow-lg shadow-orange-500/5 group hover:border-orange-500/40 transition-all duration-300">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-orange-500/15 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
                <Eye size={18} />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Lượt xem trang
                </span>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Page Views</p>
              </div>
            </div>
            <span className="p-1 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <ArrowUpRight size={14} />
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {fmt(summary.pageViews)}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">lượt hiển thị</span>
          </div>

          <div className="mt-3 pt-3 border-t border-orange-500/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Phiên tương tác</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">{fmt(summary.sessions)} Sessions</span>
          </div>
        </div>

        {/* Unique Users Hero Card (Hero Card #3) */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-blue-500/15 via-indigo-500/5 to-slate-900/0 dark:from-blue-950/40 dark:via-slate-900/60 dark:to-indigo-950/20 border border-blue-500/25 dark:border-blue-500/30 backdrop-blur-xl shadow-lg shadow-blue-500/5 group hover:border-blue-500/40 transition-all duration-300">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/15 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700 pointer-events-none" />

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <Users size={18} />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Người dùng thật
                </span>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Active Users</p>
              </div>
            </div>
            <span className="p-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Sparkles size={14} />
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {fmt(summary.activeUsers)}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">khách truy cập</span>
          </div>

          <div className="mt-3 pt-3 border-t border-blue-500/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Tỷ lệ thoát (Bounce)</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{bouncePercent}%</span>
          </div>
        </div>
      </div>

      {/* ─── Secondary Indicators (Sessions, Bounce Rate, Conversions) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Sessions */}
        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 backdrop-blur-sm hover:border-emerald-400 transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <LinkIcon size={14} />
            </div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Tổng phiên truy cập</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-slate-900 dark:text-white">{fmt(summary.sessions)}</span>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Sessions</span>
          </div>
        </div>

        {/* Bounce Rate */}
        <div className="rounded-2xl border border-purple-200/70 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 p-3.5 backdrop-blur-sm hover:border-purple-400 transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
              <TrendingDown size={14} />
            </div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Tỷ lệ thoát trang</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-slate-900 dark:text-white">{bouncePercent}%</span>
            <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">Bounce Rate</span>
          </div>
        </div>

        {/* Conversions (Buy Ticket Action) */}
        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 backdrop-blur-sm hover:border-amber-400 transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ShoppingCart size={14} />
            </div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Chuyển đổi mua vé</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-slate-900 dark:text-white">{summary.conversions}</span>
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">({convRate}%)</span>
          </div>
        </div>

        {/* Average Pageviews Per Session */}
        <div className="rounded-2xl border border-cyan-200/70 dark:border-cyan-900/40 bg-cyan-50/50 dark:bg-cyan-950/20 p-3.5 backdrop-blur-sm hover:border-cyan-400 transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
              <Sparkles size={14} />
            </div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Độ sâu phiên xem</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {summary.sessions > 0 ? (summary.pageViews / summary.sessions).toFixed(1) : '1.0'}
            </span>
            <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">Trang / Phiên</span>
          </div>
        </div>
      </div>
    </div>
  )
}
