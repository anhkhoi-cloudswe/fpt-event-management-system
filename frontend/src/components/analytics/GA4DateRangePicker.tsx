import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { format, subDays } from 'date-fns'

export interface DateRange {
  startDate: string
  endDate: string
  label: string
}

interface GA4DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  disabled?: boolean
}

const PRESETS: { label: string; days: number }[] = [
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
]

function toISO(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function buildPresetRange(days: number, label: string): DateRange {
  const now = new Date()
  return {
    startDate: toISO(subDays(now, days - 1)),
    endDate: toISO(now),
    label,
  }
}

export default function GA4DateRangePicker({ value, onChange, disabled }: GA4DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(value.startDate)
  const [customEnd, setCustomEnd] = useState(value.endDate)
  const [isCustom, setIsCustom] = useState(false)

  const handlePreset = (days: number, label: string) => {
    setIsCustom(false)
    onChange(buildPresetRange(days, label))
    setOpen(false)
  }

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return
    onChange({ startDate: customStart, endDate: customEnd, label: 'Tùy chỉnh' })
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-orange-400 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Calendar size={13} className="text-orange-500" />
        {value.label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
          {/* Presets */}
          <div className="space-y-0.5 mb-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p.days, p.label)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer
                  ${value.label === p.label && !isCustom
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
              >
                {p.label} qua
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
              Tùy chỉnh
            </p>
            <div className="space-y-1.5 px-1">
              <input
                type="date"
                value={customStart}
                onChange={(e) => { setCustomStart(e.target.value); setIsCustom(true) }}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-orange-400"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => { setCustomEnd(e.target.value); setIsCustom(true) }}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-orange-400"
              />
              <button
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd}
                className="w-full py-1.5 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-400 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
