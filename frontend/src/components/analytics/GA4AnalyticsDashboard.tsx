import { useState } from 'react'
import { BarChart3, RefreshCw, Info, TrendingUp, Globe, Smartphone, FileText, Sparkles, Layers } from 'lucide-react'
import GA4LockedOverlay from './GA4LockedOverlay'
import GA4MetricCards from './GA4MetricCards'
import GA4DateRangePicker, { buildPresetRange, type DateRange } from './GA4DateRangePicker'
import {
  GA4TimelineChart,
  GA4SourceDonut,
  GA4DeviceChart,
  GA4GeoTable,
  GA4TopPagesTable,
  GA4SourceBarChart,
} from './GA4Charts'
import { useGA4EventAnalytics, useGA4SystemAnalytics, type GA4Tier } from '../../hooks/useGA4Analytics'
import type { GA4SystemAnalytics } from '../../services/analyticsService'

// ─── Modern Section Wrapper ───────────────────────────────────────────────────
function AnalyticsSection({
  title,
  icon,
  children,
  badge,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  badge?: string
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 dark:text-orange-400">
            {icon}
          </div>
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            {title}
          </h3>
        </div>
        {badge && (
          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white uppercase tracking-wider shadow-sm">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 rounded-3xl bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 rounded-3xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-64 rounded-3xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
    </div>
  )
}

// ─── Disclaimer Banner ────────────────────────────────────────────────────────
function DataDisclaimer() {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/20 text-amber-700 dark:text-amber-300">
      <Info size={14} className="text-amber-500 shrink-0" />
      <p className="text-xs font-medium">
        Dữ liệu GA4 cập nhật sau ~24h. Real-time hiển thị trực tiếp các truy cập trong vòng 30 phút.
      </p>
    </div>
  )
}

// ─── ORGANIZER MODE: Per-event analytics ─────────────────────────────────────
interface OrganizerAnalyticsProps {
  eventId: number
  tier: GA4Tier
}

function OrganizerAnalyticsDashboard({ eventId, tier }: OrganizerAnalyticsProps) {
  const [dateRange, setDateRange] = useState<DateRange>(buildPresetRange(30, '30 ngày'))
  const { data, loading, error, isLocked, hasAdvanced, realtimeUsers, refetch } =
    useGA4EventAnalytics(eventId, tier, dateRange)

  if (isLocked) return <GA4LockedOverlay variant="event" />

  return (
    <div className="space-y-5">
      {/* Header toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800">
        <DataDisclaimer />
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {hasAdvanced && (
            <GA4DateRangePicker value={dateRange} onChange={setDateRange} />
          )}
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-orange-500 hover:text-orange-500 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-orange-500' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3.5 text-sm text-red-700 dark:text-red-300 font-medium">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && <AnalyticsSkeleton />}

      {/* No data */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
          <BarChart3 size={44} className="mb-3 opacity-30 text-orange-500" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Chưa có dữ liệu analytics cho sự kiện này</p>
          <p className="text-xs mt-1 text-slate-500">Trang sự kiện cần có lượt truy cập trên Production để Google Analytics 4 ghi nhận.</p>
        </div>
      )}

      {/* Data */}
      {data && (
        <div className="space-y-5">
          {/* KPI Hero Cards */}
          <GA4MetricCards
            summary={data.summary}
            realtimeUsers={realtimeUsers}
            hasAdvanced={hasAdvanced}
          />

          {/* Timeline */}
          <AnalyticsSection title="Lượt xem & Người dùng theo thời gian" icon={<TrendingUp size={16} />}>
            <GA4TimelineChart data={data.timeline} />
          </AnalyticsSection>

          {/* Medium: Traffic Sources + Devices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AnalyticsSection title="Nguồn truy cập (Traffic Sources)" icon={<Globe size={16} />}>
              <GA4SourceDonut data={data.topSources} />
            </AnalyticsSection>
            <AnalyticsSection title="Thiết bị truy cập (Devices)" icon={<Smartphone size={16} />}>
              <GA4DeviceChart data={data.deviceBreakdown} />
            </AnalyticsSection>
          </div>

          {/* Geography */}
          <AnalyticsSection title="Phân bố địa lý người xem" icon={<Globe size={16} />}>
            <GA4GeoTable data={data.geography} />
          </AnalyticsSection>

          {/* Advanced: locked for PRO */}
          {!hasAdvanced && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Nâng cao (Business Tier)
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>
              <GA4LockedOverlay variant="advanced" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ADMIN MODE: System-wide analytics ───────────────────────────────────────
function AdminAnalyticsDashboard({ eventId }: { eventId?: number | null }) {
  const [dateRange, setDateRange] = useState<DateRange>(buildPresetRange(30, '30 ngày'))
  
  // If eventId is provided, Admin is inspecting a specific event!
  if (eventId) {
    return <OrganizerAnalyticsDashboard eventId={eventId} tier="ADMIN" />
  }

  const { data, loading, error, realtimeUsers, refetch } = useGA4SystemAnalytics(dateRange)
  const systemData = data as GA4SystemAnalytics | null

  return (
    <div className="space-y-5">
      {/* Header toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800">
        <DataDisclaimer />
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <GA4DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-orange-500 hover:text-orange-500 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-orange-500' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3.5 text-sm text-red-700 dark:text-red-300 font-medium">
          {error}
        </div>
      )}

      {loading && !data && <AnalyticsSkeleton />}

      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
          <BarChart3 size={44} className="mb-3 opacity-30 text-orange-500" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Chưa có dữ liệu hệ thống</p>
        </div>
      )}

      {systemData && (
        <div className="space-y-5">
          {/* KPI Hero Cards (Admin has full Business features) */}
          <GA4MetricCards
            summary={systemData.summary}
            realtimeUsers={realtimeUsers}
            hasAdvanced={true}
          />

          {/* Timeline */}
          <AnalyticsSection title="Traffic Toàn Hệ Thống" icon={<TrendingUp size={16} />}>
            <GA4TimelineChart data={systemData.timeline} />
          </AnalyticsSection>

          {/* Top Pages */}
          {systemData.topPages?.length > 0 && (
            <AnalyticsSection title="Trang được xem nhiều nhất (Top Landing Pages)" icon={<FileText size={16} />} badge="SYSTEM">
              <GA4TopPagesTable data={systemData.topPages} />
            </AnalyticsSection>
          )}

          {/* Traffic Sources + Devices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AnalyticsSection title="Nguồn truy cập (Traffic Sources)" icon={<Globe size={16} />}>
              <GA4SourceBarChart data={systemData.topSources} />
            </AnalyticsSection>
            <AnalyticsSection title="Thiết bị người dùng (Devices)" icon={<Smartphone size={16} />}>
              <GA4DeviceChart data={systemData.deviceBreakdown} />
            </AnalyticsSection>
          </div>

          {/* Geography */}
          <AnalyticsSection title="Địa lý người dùng toàn quốc" icon={<Globe size={16} />}>
            <GA4GeoTable data={systemData.geography} />
          </AnalyticsSection>
        </div>
      )}
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
interface GA4AnalyticsDashboardProps {
  /** For organizer mode: the selected event id */
  eventId?: number | null
  /** User's subscription tier code */
  tierCode?: string | null
  /** User role */
  role?: string | null
}

export default function GA4AnalyticsDashboard({
  eventId,
  tierCode,
  role,
}: GA4AnalyticsDashboardProps) {
  const isAdmin = role === 'ADMIN'

  // Normalize tier
  const tier: GA4Tier = isAdmin
    ? 'ADMIN'
    : tierCode === 'BUSINESS'
    ? 'BUSINESS'
    : tierCode === 'PRO'
    ? 'PRO'
    : tierCode === 'SCHOOL_ORGANIZER'
    ? 'SCHOOL_ORGANIZER'
    : 'FREE'

  return (
    <div className="space-y-4">
      {/* Premium Header Card */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-5 text-white shadow-xl shadow-orange-500/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <BarChart3 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white">
                  {isAdmin 
                    ? (eventId ? 'Google Analytics — Thống Kê Sự Kiện (Chế Độ Admin)' : 'Google Analytics — Toàn Hệ Thống')
                    : 'Google Analytics — Trang Sự Kiện'}
                </h2>
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-orange-400 border border-white/10">
                  <Sparkles size={10} /> GA4 Data Stream
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAdmin
                  ? (eventId ? `Đang phân tích lưu lượng sự kiện #${eventId}` : 'Giám sát toàn diện lưu lượng người dùng và hiệu suất toàn sàn FEMS')
                  : 'Báo cáo lưu lượng truy cập, lượt xem thực tế và nguồn khách hàng quan tâm'}
              </p>
            </div>
          </div>

          {/* Tier badge */}
          <div className="shrink-0">
            {isAdmin ? (
              <span className="px-3 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 uppercase tracking-wider">
                ADMIN ACCESS
              </span>
            ) : (
              <span className={`text-xs font-black uppercase px-3 py-1 rounded-xl shadow-sm tracking-wider
                ${tier === 'FREE'
                  ? 'bg-slate-800 text-slate-400'
                  : tier === 'PRO'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-orange-500/20'
                }`}>
                {tier} TIER
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Render based on role & tier */}
      {isAdmin ? (
        <AdminAnalyticsDashboard eventId={eventId} />
      ) : tier === 'FREE' ? (
        <GA4LockedOverlay variant="event" />
      ) : eventId ? (
        <OrganizerAnalyticsDashboard eventId={eventId} tier={tier} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/30">
          <Layers size={44} className="mb-3 opacity-30 text-orange-500" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Vui lòng chọn một sự kiện để xem chi tiết Analytics</p>
          <p className="text-xs text-slate-400 mt-1">Chọn từ danh sách sự kiện bên trên để tải báo cáo GA4 tương ứng.</p>
        </div>
      )}
    </div>
  )
}
