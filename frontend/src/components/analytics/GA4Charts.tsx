import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts'
import type {
  GA4TimelinePoint,
  GA4DeviceBreakdown,
  GA4TrafficSource,
  GA4Geography,
} from '../../services/analyticsService'
import { Smartphone, Monitor, Tablet, Globe, ArrowUpRight } from 'lucide-react'

const DONUT_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#eab308']

// ─── Timeline Chart ────────────────────────────────────────────────────────────
interface TimelineChartProps {
  data: GA4TimelinePoint[]
}

function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd
  return `${yyyymmdd.slice(6)}/${yyyymmdd.slice(4, 6)}`
}

export function GA4TimelineChart({ data }: TimelineChartProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu timeline" />
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: 'currentColor' }}
          className="text-slate-400 dark:text-slate-500"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'currentColor' }}
          className="text-slate-400 dark:text-slate-500"
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '12px',
            border: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            fontSize: '12px',
          }}
          labelFormatter={formatDate}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Line
          type="monotone"
          dataKey="pageViews"
          name="Lượt xem"
          stroke="#f97316"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#f97316' }}
        />
        <Line
          type="monotone"
          dataKey="activeUsers"
          name="Người dùng"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#3b82f6' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Traffic Source Donut ─────────────────────────────────────────────────────
interface SourceDonutProps {
  data: GA4TrafficSource[]
}

export function GA4SourceDonut({ data }: SourceDonutProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu traffic source" />
  const total = data.reduce((s, d) => s + d.users, 0)
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} dataKey="users" nameKey="source" cx="50%" cy="50%" innerRadius={35} outerRadius={55}>
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, name: string) => [`${v} (${((v/total)*100).toFixed(0)}%)`, name]}
            contentStyle={{ borderRadius: '10px', border: 'none', fontSize: '11px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 5).map((d, i) => (
          <div key={d.source} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-xs text-slate-600 dark:text-slate-400 truncate flex-1">{d.source || '(direct)'}</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">{d.users}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Device Bar Chart ─────────────────────────────────────────────────────────
interface DeviceChartProps {
  data: GA4DeviceBreakdown[]
}

const DEVICE_ICON: Record<string, React.ReactNode> = {
  mobile: <Smartphone size={12} />,
  desktop: <Monitor size={12} />,
  tablet: <Tablet size={12} />,
}

export function GA4DeviceChart({ data }: DeviceChartProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu thiết bị" />
  const total = data.reduce((s, d) => s + d.users, 0)
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = total > 0 ? Math.round((d.users / total) * 100) : 0
        return (
          <div key={d.device} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 capitalize">
                <span style={{ color: DONUT_COLORS[i] }}>{DEVICE_ICON[d.device] ?? <Smartphone size={12} />}</span>
                {d.device}
              </span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{d.users} ({pct}%)</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: DONUT_COLORS[i] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Geography Table ──────────────────────────────────────────────────────────
interface GeoTableProps {
  data: GA4Geography[]
}

export function GA4GeoTable({ data }: GeoTableProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu địa lý" />
  const total = data.reduce((s, d) => s + d.users, 0)
  return (
    <div className="space-y-1.5">
      {data.slice(0, 6).map((d) => {
        const pct = total > 0 ? Math.round((d.users / total) * 100) : 0
        return (
          <div key={d.country} className="flex items-center gap-2">
            <Globe size={11} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">{d.country}</span>
            <div className="w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-8 text-right">{d.users}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Top Pages (Admin) ────────────────────────────────────────────────────────
interface TopPagesProps {
  data: { page: string; views: number }[]
}

export function GA4TopPagesTable({ data }: TopPagesProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu top pages" />
  const max = Math.max(...data.map((d) => d.views))
  return (
    <div className="space-y-1.5">
      {data.slice(0, 8).map((d, i) => {
        const pct = max > 0 ? Math.round((d.views / max) * 100) : 0
        return (
          <div key={d.page} className="flex items-center gap-2.5">
            <span className="text-[10px] text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate font-mono">{d.page}</span>
            <div className="w-20 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{d.views.toLocaleString()}</span>
              <ArrowUpRight size={10} className="text-slate-400" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── System Traffic Source Bar Chart ─────────────────────────────────────────
interface SourceBarProps {
  data: GA4TrafficSource[]
}

export function GA4SourceBarChart({ data }: SourceBarProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu traffic source" />
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data.slice(0, 6)} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
        <XAxis dataKey="source" tick={{ fontSize: 9, fill: 'currentColor' }} className="text-slate-400" tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} className="text-slate-400" tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: '11px' }} />
        <Bar dataKey="users" name="Người dùng" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Shared Empty State ───────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-24 text-xs text-slate-400 dark:text-slate-500">
      {label}
    </div>
  )
}
