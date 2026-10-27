import { useEffect, useRef, useState } from 'react'
import { Building2, Check, Loader2, MapPin, Sparkles, X } from 'lucide-react'
import {
  searchLocations,
  getInstantLocalSuggestions,
  type LocationSuggestion,
} from '../../services/locationAutocompleteService'

type Language = 'vi' | 'en'

type Props = {
  isDarkMode: boolean
  language: Language
  venueName: string
  location: string
  onVenueNameChange: (value: string) => void
  onLocationChange: (value: string) => void
}

const copy = {
  vi: {
    title: 'Địa điểm / Địa chỉ tổ chức sự kiện',
    badge: 'Tự do ngoài trường',
    placeholder: 'Nhập tên tòa nhà hoặc địa chỉ (Ví dụ: Bitexco, Landmark 81, GEM Center...)',
    useCustom: 'Sử dụng địa chỉ vừa nhập:',
    customBadge: 'Tự gõ',
    popularBadge: 'Nổi bật',
    noResults: 'Không tìm thấy địa điểm phù hợp. Bạn có thể tự do gõ bất kỳ địa chỉ nào.',
    quickPick: 'Địa điểm phổ biến gợi ý:',
  },
  en: {
    title: 'Event Venue & Physical Address',
    badge: 'Independent Venue',
    placeholder: 'Enter venue name or address (e.g., Bitexco, Landmark 81, GEM Center...)',
    useCustom: 'Use custom address:',
    customBadge: 'Custom',
    popularBadge: 'Popular',
    noResults: 'No exact matches found. You can keep typing any custom address.',
    quickPick: 'Suggested venues:',
  },
}

export default function LocationAutocomplete({
  isDarkMode,
  language,
  venueName,
  location,
  onVenueNameChange,
  onLocationChange,
}: Props) {
  const t = copy[language]
  const [query, setQuery] = useState(location || venueName || '')
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep internal query synchronized if parent form values change externally
  useEffect(() => {
    const parentVal = location || venueName || ''
    if (parentVal && parentVal !== query) {
      setQuery(parentVal)
    }
  }, [location, venueName])

  // Handle outside click to close dropdown smoothly
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Input change handler: Immediate 0ms local match + debounced remote search
  const handleInputChange = (val: string) => {
    setQuery(val)
    onVenueNameChange(val)
    onLocationChange(val)

    const trimmed = val.trim()
    if (!trimmed) {
      setSuggestions([])
      setIsLoading(false)
      return
    }

    // 1. Instant 0ms local lookup so Bitexco, Landmark, GEM... show immediately
    const instantMatches = getInstantLocalSuggestions(trimmed)
    setSuggestions(instantMatches)
    setIsOpen(true)
  }

  // Remote search debounced effect
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || !isOpen) {
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true)
        const remoteResults = await searchLocations(trimmed, language, controller.signal)
        if (!controller.signal.aborted && remoteResults.length > 0) {
          setSuggestions(remoteResults)
        }
      } catch {
        // Handled silently
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 280)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, isOpen, language])

  const handleSelect = (s: LocationSuggestion) => {
    setQuery(s.address)
    onVenueNameChange(s.name)
    onLocationChange(s.address)
    setIsOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    onVenueNameChange('')
    onLocationChange('')
    setSuggestions([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleFocus = () => {
    setIsOpen(true)
    const trimmed = query.trim()
    if (trimmed) {
      setSuggestions(getInstantLocalSuggestions(trimmed))
    } else {
      // Show top 5 recommended locations when empty
      setSuggestions(getInstantLocalSuggestions('bitexco').concat(getInstantLocalSuggestions('landmark')).slice(0, 5))
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative backdrop-blur-md border rounded-xl p-3 flex flex-col gap-2 transition-all ${
        isDarkMode
          ? 'bg-white/[0.04] border-white/[0.09] shadow-lg shadow-black/20'
          : 'bg-white/85 border-neutral-200/90 shadow-sm'
      }`}
    >
      {/* Header bar with venue icon and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          <span
            className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
              isDarkMode ? 'text-white/60' : 'text-neutral-600'
            }`}
          >
            {t.title}
          </span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-wider text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
          {t.badge}
        </span>
      </div>

      {/* Main interactive search input */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={handleFocus}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={t.placeholder}
          className={`w-full border rounded-xl py-2.5 pl-3 pr-16 text-xs font-semibold focus:outline-none transition-all ${
            isDarkMode
              ? 'bg-[#141416] border-white/10 text-white placeholder:text-white/30 focus:border-orange-500/50'
              : 'bg-white border-neutral-300 text-neutral-800 placeholder:text-neutral-400 focus:border-orange-500/50'
          }`}
        />

        {/* Right action icons (Loading spinner & Clear button) */}
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {isLoading && (
            <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
          )}
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className={`p-1 rounded-md transition hover:scale-105 cursor-pointer ${
                isDarkMode ? 'text-white/40 hover:text-white hover:bg-white/10' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
              }`}
              title="Xóa địa chỉ"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Selected location feedback bar */}
      {(location || venueName) && !isOpen && (
        <div
          className={`text-[10px] font-medium p-2 rounded-lg leading-relaxed border flex items-start gap-1.5 ${
            isDarkMode
              ? 'text-neutral-300 bg-white/[0.02] border-white/[0.05]'
              : 'text-neutral-700 bg-neutral-50 border-neutral-200'
          }`}
        >
          <Building2 className="w-3 h-3 text-orange-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 truncate">
            {venueName && <span className="font-bold text-orange-500 mr-1.5">{venueName}:</span>}
            <span>{location || venueName}</span>
          </div>
        </div>
      )}

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden backdrop-blur-xl animate-fadeIn ${
            isDarkMode
              ? 'bg-[#18181b]/95 border-white/12 text-white shadow-black/60'
              : 'bg-white/98 border-neutral-200 text-neutral-900 shadow-neutral-900/15'
          }`}
        >
          <div className="max-h-64 overflow-y-auto py-1 divide-y divide-neutral-100 dark:divide-white/[0.05]">
            {/* Top custom query option */}
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onVenueNameChange(query.trim())
                  onLocationChange(query.trim())
                  setIsOpen(false)
                }}
                className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition cursor-pointer ${
                  isDarkMode ? 'hover:bg-white/[0.08]' : 'hover:bg-orange-50/60'
                }`}
              >
                <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-orange-500 truncate">
                      {t.useCustom} &quot;{query.trim()}&quot;
                    </span>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20">
                      {t.customBadge}
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    Lưu trực tiếp địa chỉ này vào sự kiện của bạn
                  </p>
                </div>
                <Check className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              </button>
            )}

            {/* List of matched suggestions */}
            {suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition cursor-pointer ${
                  isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-neutral-50'
                }`}
              >
                <div className="p-1 rounded-md bg-orange-500/10 text-orange-500 shrink-0 mt-0.5">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold truncate">{item.name}</p>
                    {item.isPopular && (
                      <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> {t.popularBadge}
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] leading-relaxed truncate mt-0.5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    {item.address}
                  </p>
                </div>
              </button>
            ))}

            {/* Empty state when no matches found */}
            {suggestions.length === 0 && query.trim().length > 0 && !isLoading && (
              <div className={`p-4 text-center ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                <p className="text-xs">{t.noResults}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
