import { useMemo, useState } from 'react'
import { ChevronDown, Globe, Search } from 'lucide-react'

export const timezones = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh', offset: 'GMT+7', region: 'Vietnam' },
  { value: 'UTC', label: 'UTC', offset: 'GMT+0', region: 'Coordinated Universal Time' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo', offset: 'GMT+9', region: 'Japan' },
  { value: 'Europe/London', label: 'Europe/London', offset: 'GMT+1', region: 'United Kingdom' },
  { value: 'America/New_York', label: 'America/New_York', offset: 'GMT-4', region: 'United States' },
]

interface TimezoneComboboxProps {
  value: string
  autoDetect: boolean
  isDarkMode?: boolean
  onChange: (value: string) => void
  onAutoDetectChange: (enabled: boolean) => void
}

export function TimezoneCombobox({
  value,
  autoDetect,
  isDarkMode,
  onChange,
  onAutoDetectChange,
}: TimezoneComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = timezones.find((tz) => tz.value === value) ?? timezones[0]
  const filteredTimezones = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return timezones
    return timezones.filter((tz) =>
      `${tz.label} ${tz.offset} ${tz.region}`.toLowerCase().includes(normalizedQuery)
    )
  }, [query])

  const handleSelect = (nextValue: string) => {
    onChange(nextValue)
    setIsOpen(false)
    setQuery('')
  }

  const fieldClass = isDarkMode
    ? 'bg-slate-950 border-slate-700 text-slate-200'
    : 'bg-white border-slate-200 text-slate-800'

  return (
    <div className="relative">
      <div className="mb-2">
        <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-colors ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <input
            type="checkbox"
            checked={autoDetect}
            onChange={(e) => onAutoDetectChange(e.target.checked)}
            className="accent-orange-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">Tự động xác định</span>
        </label>
      </div>

      <button
        type="button"
        disabled={autoDetect}
        onClick={() => setIsOpen((open) => !open)}
        className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border outline-none transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${fieldClass}`}
      >
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-orange-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black truncate">{selected.label}</div>
            <div className="text-[10px] font-bold text-slate-400 truncate">{selected.offset} · {selected.region}</div>
          </div>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && !autoDetect && (
        <div className={`absolute z-50 mt-2 w-full rounded-2xl border shadow-2xl overflow-hidden ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="p-2 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search timezone..."
                className={`w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border outline-none ${fieldClass}`}
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filteredTimezones.map((tz) => (
              <button
                key={tz.value}
                type="button"
                onClick={() => handleSelect(tz.value)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${tz.value === value
                  ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200'
                  }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-black truncate">{tz.label}</span>
                  <span className="block text-[10px] font-bold text-slate-400 truncate">{tz.region}</span>
                </span>
                <span className="text-[10px] font-black text-slate-400 flex-shrink-0">{tz.offset}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
