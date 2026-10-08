import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend, Area, AreaChart
} from 'recharts'
import type {
  GA4TimelinePoint,
  GA4DeviceBreakdown,
  GA4TrafficSource,
  GA4Geography,
} from '../../services/analyticsService'
import { Smartphone, Monitor, Tablet, Globe, ArrowUpRight, TrendingUp, Layers } from 'lucide-react'

const PALETTE = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4']

// ─── Modern Area Timeline Chart ──────────────────────────────────────────────
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
    <div className="w-full pt-2">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="pageViewsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="activeUsersGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '16px',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              color: '#ffffff',
              fontSize: '12px',
              padding: '10px 14px',
            }}
            itemStyle={{ color: '#ffffff' }}
            labelStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
            labelFormatter={formatDate}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ paddingBottom: '12px', fontSize: '12px', fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="pageViews"
            name="Lượt xem trang"
            stroke="#f97316"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#pageViewsGradient)"
            dot={{ r: 4, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#f97316', strokeWidth: 3, stroke: '#fff' }}
          />
          <Area
            type="monotone"
            dataKey="activeUsers"
            name="Người dùng thật"
            stroke="#3b82f6"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#activeUsersGradient)"
            dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 3, stroke: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Traffic Source Donut with Highlights ────────────────────────────────────
interface SourceDonutProps {
  data: GA4TrafficSource[]
}

export function GA4SourceDonut({ data }: SourceDonutProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu traffic source" />
  const total = data.reduce((s, d) => s + d.users, 0)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 p-2">
      <div className="relative shrink-0">
        <ResponsiveContainer width={150} height={150}>
          <PieChart>
            <Pie
              data={data}
              dataKey="users"
              nameKey="source"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={68}
              paddingAngle={3}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="rgba(0,0,0,0.1)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, name: string) => [
                `${v} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`,
                name,
              ]}
              contentStyle={{
                borderRadius: '12px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontSize: '11px',
                padding: '8px 12px',
              }}
              itemStyle={{ color: '#ffffff' }}
              labelStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{total}</span>
          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Tổng User</span>
        </div>
      </div>

      <div className="flex-1 space-y-2 w-full min-w-0">
        {data.slice(0, 5).map((d, i) => {
          const pct = total > 0 ? ((d.users / total) * 100).toFixed(1) : '0'
          return (
            <div
              key={d.source}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-orange-50/50 dark:hover:bg-slate-800/80 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                  {d.source || '(direct)'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-slate-900 dark:text-white">{d.users}</span>
                <span className="text-[10px] font-medium text-slate-400">({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Device Breakdown ────────────────────────────────────────────────────────
interface DeviceChartProps {
  data: GA4DeviceBreakdown[]
}

const DEVICE_ICON: Record<string, React.ReactNode> = {
  mobile: <Smartphone size={14} />,
  desktop: <Monitor size={14} />,
  tablet: <Tablet size={14} />,
}

export function GA4DeviceChart({ data }: DeviceChartProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu thiết bị" />
  const total = data.reduce((s, d) => s + d.users, 0)

  return (
    <div className="space-y-3.5 p-2">
      {data.map((d, i) => {
        const pct = total > 0 ? Math.round((d.users / total) * 100) : 0
        const color = PALETTE[i % PALETTE.length]
        return (
          <div key={d.device} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 capitalize">
                <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {DEVICE_ICON[d.device] ?? <Smartphone size={14} />}
                </span>
                {d.device}
              </span>
              <span className="font-extrabold text-slate-900 dark:text-white">
                {d.users} <span className="text-[10px] font-normal text-slate-400">({pct}%)</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full rounded-full transition-all duration-700 shadow-sm"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Geography Table (Modern Compact / Dual-column capable) ───────────────────
interface GeoTableProps {
  data: GA4Geography[]
}

export function GA4GeoTable({ data }: GeoTableProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu địa lý" />
  const total = data.reduce((s, d) => s + d.users, 0)

  return (
    <div className="space-y-2 p-1">
      {data.slice(0, 6).map((d) => {
        const pct = total > 0 ? Math.round((d.users / total) * 100) : 0
        return (
          <div
            key={d.country}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:border-orange-400/40 transition-colors"
          >
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
              <Globe size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{d.country}</span>
                <span className="font-extrabold text-slate-900 dark:text-white">{d.users} users</span>
              </div>
              <div className="h-1.5 bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
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
    <div className="space-y-2 p-1">
      {data.slice(0, 6).map((d, i) => {
        const pct = max > 0 ? Math.round((d.views / max) * 100) : 0
        return (
          <div
            key={d.page}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20 hover:bg-orange-500/5 hover:border-orange-500/30 transition-all group"
          >
            <span className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-orange-500 group-hover:text-white transition-colors">
              {i + 1}
            </span>
            <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">
              {d.page}
            </span>
            <div className="w-20 h-2 bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden shrink-0 hidden sm:block">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs font-black text-slate-900 dark:text-white">{d.views.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400 font-semibold">views</span>
              <ArrowUpRight size={12} className="text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── System Traffic Source Bar Chart (Explicit High-Contrast Tooltip) ──────────
interface SourceBarProps {
  data: GA4TrafficSource[]
}

export function GA4SourceBarChart({ data }: SourceBarProps) {
  if (!data?.length) return <EmptyChart label="Chưa có dữ liệu traffic source" />
  return (
    <div className="w-full pt-2">
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data.slice(0, 6)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis
            dataKey="source"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(249, 115, 22, 0.08)', radius: 8 }}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl text-white">
                    <p className="text-xs font-bold text-slate-200 mb-1">{label || '(direct)'}</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-xs text-slate-300">Người dùng:</span>
                      <span className="text-xs font-black text-white">{payload[0].value}</span>
                    </div>
                  </div>
                )
              }
              return null
            }}
          />
          <Bar dataKey="users" name="Người dùng" radius={[8, 8, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Shared Empty State ───────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-xs font-semibold text-slate-400 dark:text-slate-500">
      <Layers size={24} className="mb-2 opacity-30 text-orange-500" />
      {label}
    </div>
  )
}
