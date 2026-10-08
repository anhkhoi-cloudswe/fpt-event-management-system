import { useState } from 'react'
import { BarChart3, RefreshCw, Info, TrendingUp, Globe, Smartphone, FileText } from 'lucide-react'
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

// ─── Shared Section Wrapper ───────────────────────────────────────────────────
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
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-orange-500">{icon}</span>
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          {title}
        </h3>
        {badge && (
          <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-md bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 uppercase tracking-wider">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-52 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-52 rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}

// ─── Disclaimer Banner ────────────────────────────────────────────────────────
function DataDisclaimer() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
      <Info size={12} className="text-amber-500 shrink-0" />
      <p className="text-[11px] text-amber-700 dark:text-amber-300">
        Dữ liệu GA4 cập nhật sau ~24h. Real-time chỉ hiển thị trong vòng 60 phút gần nhất.
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
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DataDisclaimer />
        <div className="flex items-center gap-2 shrink-0">
          {hasAdvanced && (
            <GA4DateRangePicker value={dateRange} onChange={setDateRange} />
          )}
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-orange-400 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && <AnalyticsSkeleton />}

      {/* No data */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
          <BarChart3 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">Chưa có dữ liệu analytics cho sự kiện này</p>
          <p className="text-xs mt-1">Trang sự kiện cần có lượt truy cập để GA4 ghi nhận dữ liệu.</p>
        </div>
      )}

      {/* Data */}
      {data && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <GA4MetricCards
            summary={data.summary}
            realtimeUsers={realtimeUsers}
            hasAdvanced={hasAdvanced}
          />

          {/* Timeline */}
          <AnalyticsSection title="Lượt xem & Người dùng theo thời gian" icon={<TrendingUp size={14} />}>
            <GA4TimelineChart data={data.timeline} />
          </AnalyticsSection>

          {/* Medium: Traffic Sources + Devices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnalyticsSection title="Nguồn truy cập" icon={<Globe size={14} />}>
              <GA4SourceDonut data={data.topSources} />
            </AnalyticsSection>
            <AnalyticsSection title="Thiết bị" icon={<Smartphone size={14} />}>
              <GA4DeviceChart data={data.deviceBreakdown} />
            </AnalyticsSection>
          </div>

          {/* Geography */}
          <AnalyticsSection title="Địa lý" icon={<Globe size={14} />}>
            <GA4GeoTable data={data.geography} />
          </AnalyticsSection>

          {/* Advanced: locked for PRO */}
          {!hasAdvanced && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Nâng cao (Business)
                </span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
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
function AdminAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(buildPresetRange(30, '30 ngày'))
  const { data, loading, error, realtimeUsers, refetch } = useGA4SystemAnalytics(dateRange)
  const systemData = data as GA4SystemAnalytics | null

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DataDisclaimer />
        <div className="flex items-center gap-2 shrink-0">
          <GA4DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-orange-400 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !data && <AnalyticsSkeleton />}

      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <BarChart3 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">Chưa có dữ liệu hệ thống</p>
        </div>
      )}

      {systemData && (
        <div className="space-y-4">
          {/* KPI Cards (Admin always has advanced) */}
          <GA4MetricCards
            summary={systemData.summary}
            realtimeUsers={realtimeUsers}
            hasAdvanced={true}
          />

          {/* Timeline */}
          <AnalyticsSection title="Traffic Toàn Hệ Thống" icon={<TrendingUp size={14} />}>
            <GA4TimelineChart data={systemData.timeline} />
          </AnalyticsSection>

          {/* Top Pages */}
          {systemData.topPages?.length > 0 && (
            <AnalyticsSection title="Trang được xem nhiều nhất" icon={<FileText size={14} />} badge="SYSTEM">
              <GA4TopPagesTable data={systemData.topPages} />
            </AnalyticsSection>
          )}

          {/* Traffic Sources + Devices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnalyticsSection title="Nguồn truy cập (Bar)" icon={<Globe size={14} />}>
              <GA4SourceBarChart data={systemData.topSources} />
            </AnalyticsSection>
            <AnalyticsSection title="Thiết bị" icon={<Smartphone size={14} />}>
              <GA4DeviceChart data={systemData.deviceBreakdown} />
            </AnalyticsSection>
          </div>

          {/* Geography */}
          <AnalyticsSection title="Địa lý người dùng" icon={<Globe size={14} />}>
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
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-500/20">
          <BarChart3 size={16} className="text-orange-500" />
        </div>
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white">
            {isAdmin ? 'Google Analytics — Toàn hệ thống' : 'Google Analytics — Trang sự kiện'}
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {isAdmin
              ? 'Dữ liệu traffic toàn bộ website từ GA4'
              : 'Dữ liệu traffic cho trang sự kiện của bạn'}
          </p>
        </div>
        {/* Tier badge */}
        {!isAdmin && (
          <span className={`ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-lg
            ${tier === 'FREE'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              : tier === 'PRO'
              ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
              : 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400'
            }`}>
            {tier}
          </span>
        )}
      </div>

      {/* Render based on role & tier */}
      {isAdmin ? (
        <AdminAnalyticsDashboard />
      ) : tier === 'FREE' ? (
        <GA4LockedOverlay variant="event" />
      ) : eventId ? (
        <OrganizerAnalyticsDashboard eventId={eventId} tier={tier} />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
          <BarChart3 size={36} className="mb-3 opacity-30" />
          <p className="text-sm">Vui lòng chọn một sự kiện để xem analytics</p>
        </div>
      )}
    </div>
  )
}
